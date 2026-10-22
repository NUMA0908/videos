import type { App } from "../app/App";
import { desktop } from "../app/desktop";
import { Cpu, CPU_LEVELS } from "../ai/cpu";
import { Dummy, DUMMY_MODES } from "../ai/dummy";
import { getChar, getMove } from "../data/characters";
import { GUARD_LABEL } from "../data/types";
import { TUNING } from "../data/tuning";
import { NEUTRAL_STATES } from "../sim/fighter";
import { px } from "../sim/fixed";
import { blockAdvantage, fmtAdv, hitAdvantage } from "../sim/frameData";
import { startPositions } from "../sim/state";
import type { GameMode, GameState, Side } from "../sim/types";
import { drawInputLogs } from "../render/debug";
import { getStage } from "../render/stages";
import { VIEW_H, VIEW_W } from "../render/view";
import { CHAR_STATS } from "../ui/charInfo";
import { drawCharacter, drawMenu, drawPanel, drawText, drawTitle, UI, type MenuItem } from "../ui/ui";
import { FightScene } from "./FightScene";
import { drawMoveList } from "./MoveListScene";
import { nav } from "./nav";
import { PadLostWatcher } from "./padLost";
import type { Scene } from "./Scene";

export interface ArcadeRun {
  ladder: string[];
  stages: string[];
  index: number;
  level: number;
}

export interface MatchSetup {
  mode: GameMode;
  chars: [string, string];
  stage: string;
  p2: "human" | "cpu" | "dummy";
  cpuLevel?: number;
  arcade?: ArcadeRun;
}

interface Item extends MenuItem {
  act?: () => void;
  change?: (dir: 1 | -1) => void;
}

/** Mide la ventaja real tras cada contacto (modo entrenamiento). */
class AdvantageMeter {
  private atk: Side | null = null;
  private atkFree = -1;
  private defFree = -1;
  private kind = "";
  text = "";
  onTick(s: GameState): void {
    for (const e of s.events) {
      if (e.type === "hit" || e.type === "block" || e.type === "parry") {
        this.atk = e.type === "parry" ? ((1 - e.side) as Side) : e.side;
        this.atkFree = -1;
        this.defFree = -1;
        this.kind = e.type === "hit" ? "al pegar" : e.type === "block" ? "en bloqueo" : "tras parry";
      }
    }
    if (this.atk === null) return;
    const free = (side: Side) => {
      const f = s.fighters[side];
      return NEUTRAL_STATES.has(f.state) && f.hitstop === 0;
    };
    const def = (1 - this.atk) as Side;
    if (this.atkFree < 0 && free(this.atk)) this.atkFree = s.frame;
    if (this.defFree < 0 && free(def)) this.defFree = s.frame;
    if (this.atkFree >= 0 && this.defFree >= 0) {
      const adv = this.defFree - this.atkFree;
      this.text = `${this.atk === 0 ? "J1" : "J2"} ${fmtAdv(adv)} ${this.kind}`;
      this.atk = null;
    }
  }
}

export class MatchScene implements Scene {
  readonly kind = "match";
  readonly fight: FightScene;
  private cpu: Cpu | null = null;
  readonly dummy: Dummy | null = null;
  private splash = 110;
  private pauseOpen = false;
  private padLost: PadLostWatcher;
  private pauseSel = 0;
  private moveListFor: string | null = null;
  private resultSel = 0;
  private resultsShown = false;
  private ending = false;
  private recording = false;
  private showFrameData = true;
  private infiniteMeter = false;
  private adv = new AdvantageMeter();
  private lastMoveP1: string | null = null;

  constructor(
    readonly app: App,
    readonly setup: MatchSetup,
  ) {
    this.padLost = new PadLostWatcher(app);
    const s = app.settings;
    const training = setup.mode === "training";
    this.fight = new FightScene(
      app,
      {
        mode: setup.mode,
        chars: setup.chars,
        parry: s.parry,
        simple: [s.simple, setup.p2 === "human" ? s.simple : false],
        infiniteHealth: training,
        infiniteMeter: false,
        timer: !training,
      },
      setup.stage,
      (Date.now() & 0xffff) | 1,
    );
    if (setup.p2 === "cpu") {
      this.cpu = new Cpu(CPU_LEVELS[setup.cpuLevel ?? 1], 1, (Date.now() & 0xffff) + 17);
      this.fight.inputs[1] = (st) => this.cpu!.input(st);
    } else if (setup.p2 === "dummy") {
      this.dummy = new Dummy(1, s.cpuLevel);
      this.fight.inputs[1] = (st) => this.dummyInput(st);
      this.fight.inputs[0] = () => (this.recording ? 0 : this.app.input.sample(0));
    }
    this.fight.hud.labels = [setup.p2 === "human" ? "J1" : "TÚ", setup.p2 === "human" ? "J2" : setup.p2 === "cpu" ? `CPU ${CPU_LEVELS[setup.cpuLevel ?? 1].name}` : "MUÑECO"];
    this.fight.onMatchOver = () => undefined;
    this.fight.overlay = (ctx) => this.drawOverlay(ctx);
    this.fight.onTick = (st) => this.onTick(st);
    if (training) {
      this.fight.hud.showTimer = true;
      this.splash = 0;
    }
  }

  enter(): void {
    this.fight.enter();
    desktop?.setInMatch?.(this.app.settings.confirmQuit);
  }

  onBlur(): void {
    if (this.pauseOpen || this.splash > 0 || this.fight.state.round.phase === "over") return;
    this.pauseOpen = true;
    this.pauseSel = 0;
    this.fight.paused = true;
  }

  exit(): void {
    this.fight.exit();
    desktop?.setInMatch?.(false);
  }

  private dummyInput(s: GameState): number {
    const d = this.dummy!;
    if (this.recording) {
      const m = this.app.input.sample(0);
      d.record(m, s.fighters[1].facing);
      return m;
    }
    return d.input(s);
  }

  private onTick(s: GameState): void {
    if (this.setup.mode === "training") {
      this.adv.onTick(s);
      const f = s.fighters[0];
      if (f.state === "attack" && f.move) this.lastMoveP1 = f.move;
      if (this.infiniteMeter) for (const ft of s.fighters) ft.meter = TUNING.meter.max;
    }
  }

  // ---------------------------------------------------------------- entrenamiento

  private resetPositions(corner: boolean): void {
    const s = this.fight.state;
    const [x0, x1] = startPositions();
    const offset = corner ? -px(560) : 0;
    s.fighters.forEach((f, i) => {
      f.x = (i === 0 ? x0 : x1) + offset;
      f.y = 0;
      f.vx = 0;
      f.vy = 0;
      f.pushT = 0;
      f.state = "idle";
      f.t = 0;
      f.move = null;
      f.hitstop = 0;
      f.stun = 0;
      f.health = f.maxHealth;
      f.facing = i === 0 ? 1 : -1;
    });
    s.projectiles = [];
    this.fight.fx.clear();
    this.fight.renderer.cam.snap(s);
    this.dummy?.restartPlayback();
  }

  // ---------------------------------------------------------------- bucle

  update(): void {
    const input = this.app.input;
    const s = this.fight.state;
    // Mando desconectado en plena partida: pausa con aviso (en la intro o los resultados basta el aviso).
    if (this.padLost.update(this.setup.p2 === "human" ? [0, 1] : [0]) && s.round.phase !== "over" && !this.pauseOpen) {
      this.pauseOpen = true;
      this.pauseSel = 0;
      this.fight.paused = true;
    }
    if (this.splash > 0) {
      this.splash--;
      if (input.menu().confirm && this.splash < 80) this.splash = 0;
      return;
    }

    if (this.moveListFor) {
      const m = input.menu();
      if (m.back || m.confirm || m.pause) this.moveListFor = null;
      return;
    }

    if (this.pauseOpen) {
      this.updatePause();
      return;
    }

    if (s.round.phase === "over") {
      if (s.round.t > 100) this.updateResults();
      else this.fight.update();
      return;
    }

    if (input.menu().pause) {
      this.pauseOpen = true;
      this.pauseSel = 0;
      this.fight.paused = true;
      this.app.audio.play("select");
      input.consume(); // el mismo botón no puede elegir ya una opción de la pausa
      return;
    }

    if (this.setup.mode === "training") {
      if (input.keyPressed("KeyR")) this.resetPositions(false);
      if (input.keyPressed("KeyT")) this.resetPositions(true);
      if (input.keyPressed("F4")) this.toggleRecording();
      if (input.keyPressed("F5")) this.togglePlayback();
    }
    this.fight.update();
  }

  /** Entrenamiento: grabar lo que hace el jugador para que el muñeco lo repita (F4 o desde la pausa). */
  private toggleRecording(): void {
    if (!this.dummy) return;
    this.recording = !this.recording;
    if (this.recording) this.dummy.recording = { frames: [] };
    else if (this.dummy.recording.frames.length) this.dummy.mode = "playback";
    this.dummy.restartPlayback();
  }

  private togglePlayback(): void {
    if (!this.dummy) return;
    this.dummy.mode = this.dummy.mode === "playback" ? "stand" : "playback";
    this.dummy.restartPlayback();
  }

  private pauseItems(): Item[] {
    const training = this.setup.mode === "training";
    const items: Item[] = [{ label: "Continuar", act: () => this.closePause() }];
    items.push({ label: `Lista de movimientos (${getChar(this.setup.chars[0]).nickname})`, act: () => (this.moveListFor = this.setup.chars[0]) });
    if (training && this.dummy) {
      const d = this.dummy;
      const idx = DUMMY_MODES.findIndex((m) => m.id === d.mode);
      items.push({
        label: "Muñeco",
        value: DUMMY_MODES[idx].label,
        change: (dir) => {
          d.mode = DUMMY_MODES[(idx + dir + DUMMY_MODES.length) % DUMMY_MODES.length].id;
          d.restartPlayback();
        },
        hint: "Quieto, agachado, bloquea, parry perfecto, salta, CPU o reproducir tu grabación (F4 graba, F5 reproduce).",
      });
      const lv = this.app.settings.cpuLevel;
      items.push({
        label: "Nivel del muñeco CPU",
        value: CPU_LEVELS[lv].name,
        change: (dir) => {
          this.app.settings.cpuLevel = ((lv + dir + 3) % 3) as 0 | 1 | 2;
          d.setCpuLevel(this.app.settings.cpuLevel);
        },
      });
      items.push({ label: "Medidor infinito", value: this.infiniteMeter ? "Sí" : "No", change: () => (this.infiniteMeter = !this.infiniteMeter) });
      items.push({ label: "Frame data en pantalla", value: this.showFrameData ? "Sí" : "No", change: () => (this.showFrameData = !this.showFrameData) });
      items.push({ label: "Cajas (hitboxes)", value: this.fight.debug ? "Sí" : "No", change: () => (this.fight.debug = !this.fight.debug), hint: "También con F1 en cualquier momento." });
      items.push({ label: "Reiniciar posición (R)", act: () => (this.resetPositions(false), this.closePause()) });
      items.push({ label: "Reiniciar en la esquina (T)", act: () => (this.resetPositions(true), this.closePause()) });
      items.push({
        label: this.recording ? "Terminar grabación (F4)" : "Grabar al muñeco (F4)",
        act: () => (this.toggleRecording(), this.closePause()),
        hint: "Controlas al muñeco y se graba lo que haces; al terminar, el muñeco lo repite.",
      });
      items.push({ label: "Reproducir grabación (F5)", value: this.dummy.mode === "playback" ? "Sí" : "No", change: () => this.togglePlayback() });
    } else {
      items.push({ label: "Reiniciar combate", act: () => (this.fight.restart((Date.now() & 0xffff) | 1), this.cpu?.reset(), this.closePause()) });
    }
    items.push({ label: "Selección de personaje", act: () => this.toSelect() });
    items.push({ label: "Salir al menú", act: () => nav.title(this.app) });
    return items;
  }

  private closePause(): void {
    this.pauseOpen = false;
    this.fight.paused = false;
  }

  private toSelect(): void {
    const m = this.setup;
    nav.select(this.app, m.mode === "training" ? "training" : m.mode === "arcade" ? "arcade" : m.p2 === "cpu" ? "vscpu" : "versus");
  }

  private updatePause(): void {
    const m = this.app.input.menu();
    const items = this.pauseItems();
    if (m.up) this.pauseSel = (this.pauseSel + items.length - 1) % items.length;
    if (m.down) this.pauseSel = (this.pauseSel + 1) % items.length;
    if (m.up || m.down) this.app.audio.play("select");
    const it = items[this.pauseSel];
    if ((m.left || m.right) && it.change) {
      it.change(m.right ? 1 : -1);
      this.app.audio.play("select");
    }
    if (m.confirm) {
      this.app.audio.play("confirm");
      if (it.act) it.act();
      else it.change?.(1);
    } else if (m.back || this.app.input.keyPressed("Escape")) this.closePause();
  }

  // ---------------------------------------------------------------- resultados y arcade

  private resultItems(): Item[] {
    const s = this.fight.state;
    const won = s.round.matchWinner === 0;
    const arc = this.setup.arcade;
    if (arc) {
      if (this.ending) return [{ label: "Volver al menú", act: () => nav.title(this.app) }];
      if (won) {
        const last = arc.index >= arc.ladder.length - 1;
        return [
          { label: last ? "Ver el final" : "Siguiente combate", act: () => (last ? (this.ending = true) : this.nextArcade()) },
          { label: "Salir al menú", act: () => nav.title(this.app) },
        ];
      }
      return [
        { label: "Continuar (repetir combate)", act: () => nav.match(this.app, { ...this.setup }) },
        { label: "Salir al menú", act: () => nav.title(this.app) },
      ];
    }
    return [
      { label: "Revancha", act: () => (this.fight.restart((Date.now() & 0xffff) | 1), this.cpu?.reset(), (this.resultsShown = false)) },
      { label: "Selección de personaje", act: () => this.toSelect() },
      { label: "Salir al menú", act: () => nav.title(this.app) },
    ];
  }

  private nextArcade(): void {
    const arc = this.setup.arcade!;
    const index = arc.index + 1;
    const final = index === arc.ladder.length - 1;
    nav.match(this.app, {
      ...this.setup,
      chars: [this.setup.chars[0], arc.ladder[index]],
      stage: arc.stages[index % arc.stages.length],
      cpuLevel: final ? Math.min(2, arc.level + 1) : arc.level,
      arcade: { ...arc, index },
    });
  }

  private updateResults(): void {
    if (!this.resultsShown) {
      this.resultsShown = true;
      desktop?.setInMatch?.(false);
      this.resultSel = 0;
    }
    const m = this.app.input.menu();
    const items = this.resultItems();
    if (m.up) this.resultSel = (this.resultSel + items.length - 1) % items.length;
    if (m.down) this.resultSel = (this.resultSel + 1) % items.length;
    if (m.confirm) {
      this.app.audio.play("confirm");
      items[this.resultSel]?.act?.();
    }
  }

  // ---------------------------------------------------------------- dibujo

  render(ctx: CanvasRenderingContext2D): void {
    this.fight.render(ctx);
    if (this.splash > 0) this.drawSplash(ctx);
  }

  private drawSplash(ctx: CanvasRenderingContext2D): void {
    const t = 1 - this.splash / 110;
    const [c0, c1] = this.setup.chars;
    const slide = Math.min(1, t * 4);
    ctx.save();
    ctx.fillStyle = "rgba(6,6,18,0.94)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = CHAR_STATS[c0].color + "44";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(VIEW_W / 2 + 40, 0);
    ctx.lineTo(VIEW_W / 2 - 40, VIEW_H);
    ctx.lineTo(0, VIEW_H);
    ctx.fill();
    ctx.fillStyle = CHAR_STATS[c1].color + "44";
    ctx.beginPath();
    ctx.moveTo(VIEW_W, 0);
    ctx.lineTo(VIEW_W / 2 + 44, 0);
    ctx.lineTo(VIEW_W / 2 - 36, VIEW_H);
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.fill();
    ctx.restore();
    drawCharacter(ctx, c0, "stance", 230 - (1 - slide) * 300, 470, 1.9, 1);
    drawCharacter(ctx, c1, "stance", VIEW_W - 230 + (1 - slide) * 300, 470, 1.9, -1, c0 === c1);
    const a = getChar(c0);
    const b = getChar(c1);
    drawText(ctx, a.nickname, 40, 60, { size: 42, impact: true, color: CHAR_STATS[c0].color, stroke: true });
    drawText(ctx, a.name, 42, 92, { size: 15, color: UI.dim });
    drawText(ctx, b.nickname, VIEW_W - 40, 60, { size: 42, impact: true, color: CHAR_STATS[c1].color, align: "right", stroke: true });
    drawText(ctx, b.name, VIEW_W - 42, 92, { size: 15, color: UI.dim, align: "right" });
    drawTitle(ctx, "VS", VIEW_H / 2, 90 + Math.sin(this.app.time * 8) * 4, "#ffffff");
    const arc = this.setup.arcade;
    if (arc) drawText(ctx, `Combate ${arc.index + 1} de ${arc.ladder.length} · ${getStage(this.setup.stage).name}`, VIEW_W / 2, VIEW_H - 40, { size: 16, align: "center", color: UI.accent });
    else drawText(ctx, getStage(this.setup.stage).name, VIEW_W / 2, VIEW_H - 40, { size: 16, align: "center", color: UI.accent });
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    const s = this.fight.state;
    if (this.setup.mode === "training") this.drawTraining(ctx);
    if (this.pauseOpen) {
      ctx.fillStyle = "rgba(4,6,16,0.7)";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawTitle(ctx, "PAUSA", 110, 42);
      const items = this.pauseItems();
      // La pausa del entrenamiento tiene más opciones de las que caben: se desplaza con la selección.
      const rows = Math.min(items.length, 8);
      drawPanel(ctx, VIEW_W / 2 - 230, 140, 460, rows * 36 + 24, 0.9);
      drawMenu(ctx, items, this.pauseSel, VIEW_W / 2 - 200, 170, 400, this.app.time, 36, rows);
    }
    if (this.moveListFor) drawMoveList(ctx, this.moveListFor, this.setup.mode === "training");
    this.padLost.draw(ctx);
    if (s.round.phase === "over" && s.round.t > 100) this.drawResults(ctx);
  }

  private drawResults(ctx: CanvasRenderingContext2D): void {
    const s = this.fight.state;
    const w = s.round.matchWinner;
    ctx.fillStyle = "rgba(4,6,16,0.72)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.ending) {
      const c = getChar(this.setup.chars[0]);
      drawCharacter(ctx, c.id, "win", VIEW_W / 2, 400, 2.1, 1);
      drawTitle(ctx, "¡CAMPEÓN DEL TORNEO!", 70, 44);
      drawText(ctx, `${c.nickname}: "${c.quote}"`, VIEW_W / 2, 440, { size: 20, align: "center", color: UI.accent, stroke: true });
      drawText(ctx, "Gracias por jugar CONTRAGOLPE", VIEW_W / 2, 470, { size: 14, align: "center", color: UI.dim });
    } else if (w === 0 || w === 1) {
      const c = getChar(s.config.chars[w]);
      const alt = w === 1 && s.config.chars[0] === s.config.chars[1];
      drawCharacter(ctx, c.id, "win", w === 0 ? 260 : VIEW_W - 260, 420, 1.9, w === 0 ? 1 : -1, alt);
      const who = this.setup.p2 === "human" ? (w === 0 ? "J1" : "J2") : w === 0 ? "¡GANASTE!" : "PERDISTE";
      drawTitle(ctx, `${who === "J1" || who === "J2" ? `GANA ${who}` : who}`, 70, 46);
      drawText(ctx, `${c.nickname}: "${c.quote}"`, VIEW_W / 2, 118, { size: 18, align: "center", color: UI.accent, stroke: true });
    } else {
      drawTitle(ctx, "EMPATE", 70, 46);
    }
    const items = this.resultItems();
    const x = w === 0 ? VIEW_W - 380 : 80;
    drawPanel(ctx, x - 24, 300, 340, items.length * 38 + 20, 0.9);
    drawMenu(ctx, items, this.resultSel, x, 328, 290, this.app.time, 38);
  }

  private drawTraining(ctx: CanvasRenderingContext2D): void {
    const s = this.fight.state;
    drawInputLogs(ctx, this.fight.logs, 180);
    if (this.showFrameData) {
      drawPanel(ctx, VIEW_W / 2 - 200, 74, 400, 74, 0.8);
      const id = this.lastMoveP1;
      if (id) {
        const mv = getMove(s.fighters[0].char, id);
        drawText(ctx, `${mv.name} (${mv.notation})`, VIEW_W / 2, 88, { size: 14, align: "center", bold: true, color: UI.accent });
        const parts = [`Startup ${mv.startup}`, `Activos ${mv.active}`, `Recuperación ${mv.recovery}`, `Guardia ${mv.kind === "throw" ? "agarre" : GUARD_LABEL[mv.guard]}`];
        drawText(ctx, parts.join(" · "), VIEW_W / 2, 106, { size: 13, align: "center" });
        const theory =
          mv.kind === "throw" || mv.stance === "air" || mv.knockdown || !mv.hitboxes.length
            ? "Ventaja teórica: —"
            : `Ventaja teórica: bloqueo ${fmtAdv(blockAdvantage(mv))} · golpe ${fmtAdv(hitAdvantage(mv))}`;
        drawText(ctx, theory, VIEW_W / 2, 122, { size: 13, align: "center", color: UI.cyan });
      } else drawText(ctx, "Haz un ataque para ver su frame data", VIEW_W / 2, 104, { size: 13, align: "center", color: UI.dim });
      drawText(ctx, this.adv.text ? `Medida: ${this.adv.text}` : "Medida: —", VIEW_W / 2, 139, { size: 13, align: "center", color: "#9fffb0" });
    }
    const mode = this.dummy ? DUMMY_MODES.find((m) => m.id === this.dummy!.mode)!.label : "";
    const rec = this.recording ? "  ● GRABANDO (controlas al muñeco, F4 para parar)" : "";
    drawText(ctx, `Muñeco: ${mode}${rec}`, VIEW_W / 2, VIEW_H - 64, { size: 13, align: "center", color: this.recording ? "#ff6b6b" : UI.dim, stroke: true });
    drawText(ctx, "Esc pausa · R reiniciar · T esquina · F1 cajas · F4 grabar · F5 reproducir", VIEW_W / 2, VIEW_H - 46, {
      size: 12,
      align: "center",
      color: UI.dim,
      stroke: true,
    });
  }
}
