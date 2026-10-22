import { TRIAL_LESSONS, type TrialLesson } from "../ai/trial";
import type { App } from "../app/App";
import { TUNING } from "../data/tuning";
import { px } from "../sim/fixed";
import { Btn } from "../sim/input";
import { Rng } from "../sim/rng";
import type { GameState } from "../sim/types";
import { FONT, FONT_IMPACT, VIEW_H, VIEW_W } from "../render/view";
import { FightScene } from "./FightScene";
import type { Scene } from "./Scene";

type Phase = "intro" | "waiting" | "running" | "done" | "complete";

/** Modo Trial de parry: lecciones guiadas con un muñeco que ataca en patrones. */
export class TrialScene implements Scene {
  readonly kind = "trial";
  private fight: FightScene;
  private lesson = 0;
  private successes = 0;
  private attempts = 0;
  private phase: Phase = "intro";
  private timer = 0;
  private queue: number[] = [];
  private rng = new Rng(2024);
  private parries = 0;
  private reds = 0;
  private failed = false;
  private feedback = "";
  private feedbackColor = "#fff";
  private feedbackT = 0;
  private lastPress = -999;
  private hitAt = -1;
  private attemptStart = 0;
  private prevParry = false;

  constructor(
    readonly app: App,
    readonly charId: string,
    readonly onExit: () => void,
  ) {
    this.fight = this.makeFight();
  }

  private makeFight(): FightScene {
    const f = new FightScene(
      this.app,
      {
        mode: "trial",
        chars: [this.charId, "rayo"],
        parry: this.app.settings.parry,
        simple: [this.app.settings.simple, false],
        infiniteHealth: true,
        timer: false,
      },
      "muelle",
    );
    f.hud.showTimer = false;
    f.hud.labels = ["TÚ", "MUÑECO"];
    f.inputs[1] = () => this.dummyInput();
    f.onTick = (s) => this.observe(s);
    f.overlay = (ctx) => this.drawOverlay(ctx);
    // Saltar la intro de ronda.
    f.state.round.phase = "fight";
    f.state.round.t = 0;
    for (const ft of f.state.fighters) ft.state = "idle";
    return f;
  }

  private get current(): TrialLesson {
    return TRIAL_LESSONS[this.lesson];
  }

  private startLesson(i: number): void {
    this.lesson = i;
    this.successes = 0;
    this.attempts = 0;
    this.phase = "intro";
    this.timer = 0;
    this.queue = [];
    this.feedback = "";
    this.fight.hud.reset(this.fight.state);
  }

  private dummyInput(): number {
    return this.queue.length ? (this.queue.shift() as number) : 0;
  }

  private resetPositions(s: GameState): void {
    const L = this.current;
    const mid = px(TUNING.stage.width / 2);
    const [a, b] = s.fighters;
    a.x = mid - px(L.gap / 2);
    b.x = mid + px(L.gap / 2);
    a.facing = 1;
    b.facing = -1;
    for (const f of s.fighters) {
      f.y = 0;
      f.vx = 0;
      f.vy = 0;
      f.pushT = 0;
    }
    s.projectiles = [];
    b.meter = L.dummyMeter ?? 0;
    a.meter = L.playerMeter ?? a.meter;
    a.health = a.maxHealth;
    b.health = b.maxHealth;
  }

  private beginAttempt(s: GameState): void {
    this.resetPositions(s);
    this.queue = this.current.script(s.fighters[1].facing, this.rng);
    this.phase = "running";
    this.parries = 0;
    this.reds = 0;
    this.failed = false;
    this.hitAt = -1;
    this.attemptStart = s.frame;
  }

  private say(text: string, color: string): void {
    this.feedback = text;
    this.feedbackColor = color;
    this.feedbackT = 120;
  }

  private window(): number {
    return TUNING.parry.windows[this.fight.state.config.parry];
  }

  /** Observa cada tick: detecta pulsaciones de parry, éxitos y fallos. */
  private observe(s: GameState): void {
    const L = this.current;
    const me = s.fighters[0];
    const pressing = (this.app.input.sample(0) & Btn.PARRY) !== 0;
    if (pressing && !this.prevParry) {
      this.lastPress = s.frame;
      if (this.hitAt >= 0 && this.phase === "running") {
        const late = s.frame - this.hitAt;
        if (late <= 20) this.say(`¡Tarde! Por ${late} frame${late === 1 ? "" : "s"}`, "#ffb347");
      }
    }
    this.prevParry = pressing;
    if (this.phase !== "running") return;

    for (const e of s.events) {
      if (e.type === "parry" && e.side === 0) {
        this.parries++;
        if (!L.red && this.parries >= L.hitsPerAttempt) this.succeed();
        else if (L.hitsPerAttempt > 1) this.say(`¡PARRY! ${this.parries}/${L.hitsPerAttempt}`, "#9fe8ff");
      } else if (e.type === "redParry" && e.side === 0) {
        this.reds++;
        if (L.red) this.succeed();
      } else if (e.type === "hit" && e.side === 1 && !this.failed) {
        this.failed = true;
        this.hitAt = s.frame;
        if (me.lastCounter && this.lastPress >= this.attemptStart && s.frame - this.lastPress >= this.window()) {
          const early = s.frame - (this.lastPress + this.window() - 1);
          this.say(`¡Muy pronto! Por ${early} frame${early === 1 ? "" : "s"}`, "#ff7a5c");
        } else if (me.lastCounter && this.lastPress >= this.attemptStart) {
          this.say(e.y < px(80) ? "Altura incorrecta: los bajos se parrian con ↓ + PARRY" : "Altura incorrecta: los altos se parrian de pie", "#ff7a5c");
        } else {
          this.say("Te golpeó: no hubo parry", "#ff7a5c");
        }
      } else if (e.type === "block" && e.side === 1 && !L.red && !this.failed) {
        this.failed = true;
        this.say("Bloqueaste. Bien, pero aquí toca parriar", "#ffd23f");
      }
    }

    const [a, b] = s.fighters;
    const settled =
      this.queue.length === 0 &&
      s.projectiles.length === 0 &&
      s.freeze === 0 &&
      (b.state === "idle" || b.state === "crouch") &&
      a.hitstop === 0 &&
      (a.state === "idle" || a.state === "crouch" || a.state === "walkF" || a.state === "walkB");
    if (this.phase === "running" && settled) {
      if (!this.failed && this.parries < L.hitsPerAttempt && !(L.red && this.reds > 0)) {
        this.say(L.red && this.parries > 0 ? "Eso fue un parry normal: el red parry se hace mientras bloqueas" : "No hubo parry", "#ffb347");
      }
      this.attempts++;
      this.phase = "waiting";
      this.timer = 0;
    }
  }

  private succeed(): void {
    this.successes++;
    this.say(this.successes >= this.current.goal ? "¡LECCIÓN SUPERADA!" : "¡PARRY!", "#9fe8ff");
    this.phase = "done";
    this.timer = 0;
  }

  update(): void {
    const input = this.app.input;
    if (input.keyPressed("Escape")) {
      this.onExit();
      return;
    }
    if (input.keyPressed("KeyR")) this.startLesson(this.lesson);
    if (input.keyPressed("Tab")) this.startLesson((this.lesson + 1) % TRIAL_LESSONS.length);

    const s = this.fight.state;
    this.timer++;
    if (this.feedbackT > 0) this.feedbackT--;
    if (this.phase === "intro" && this.timer > 150) {
      this.phase = "waiting";
      this.timer = 0;
    } else if (this.phase === "waiting" && this.timer > this.current.pause) {
      const me = s.fighters[0];
      if (me.state === "idle" || me.state === "crouch" || me.state === "walkF" || me.state === "walkB") this.beginAttempt(s);
    } else if (this.phase === "done") {
      // Esperar a que todo se calme antes del siguiente intento (o lección).
      const settled = this.queue.length === 0 && s.projectiles.length === 0 && s.freeze === 0;
      if (settled && this.timer > 70) {
        if (this.successes >= this.current.goal) {
          if (this.lesson + 1 < TRIAL_LESSONS.length) this.startLesson(this.lesson + 1);
          else this.phase = "complete";
        } else {
          this.phase = "waiting";
          this.timer = 0;
        }
      }
    }
    this.fight.update();
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.fight.render(ctx);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    const L = this.current;
    ctx.save();
    // Cabecera
    ctx.fillStyle = "rgba(6,10,24,0.82)";
    ctx.fillRect(0, 74, VIEW_W, 44);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `22px ${FONT_IMPACT}`;
    ctx.fillStyle = "#9fe8ff";
    ctx.fillText(`TRIAL DE PARRY · ${this.lesson + 1}/${TRIAL_LESSONS.length} · ${L.title.toUpperCase()}`, VIEW_W / 2, 90);
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(L.hint, VIEW_W / 2, 109);
    // Progreso
    for (let i = 0; i < L.goal; i++) {
      const x = VIEW_W / 2 - ((L.goal - 1) * 22) / 2 + i * 22;
      ctx.beginPath();
      ctx.arc(x, 132, 8, 0, Math.PI * 2);
      ctx.fillStyle = i < this.successes ? "#9fe8ff" : "rgba(0,0,0,0.55)";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Explicación al empezar la lección
    if (this.phase === "intro") {
      ctx.fillStyle = "rgba(6,10,24,0.88)";
      ctx.beginPath();
      ctx.roundRect(VIEW_W / 2 - 330, 170, 660, 30 + L.lines.length * 28, 12);
      ctx.fill();
      ctx.font = `17px ${FONT}`;
      ctx.fillStyle = "#e9f6ff";
      L.lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 196 + i * 28));
    }
    if (this.phase === "complete") {
      ctx.fillStyle = "rgba(6,10,24,0.88)";
      ctx.fillRect(0, 190, VIEW_W, 110);
      ctx.font = `48px ${FONT_IMPACT}`;
      ctx.fillStyle = "#9fe8ff";
      ctx.fillText("¡TRIAL COMPLETADO!", VIEW_W / 2, 230);
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillStyle = "#fff";
      ctx.fillText("Ya dominas el parry. Prueba la dificultad Hardcore en Opciones.", VIEW_W / 2, 272);
    }
    // Feedback
    if (this.feedbackT > 0 && this.feedback) {
      ctx.globalAlpha = Math.min(1, this.feedbackT / 20);
      ctx.font = `30px ${FONT_IMPACT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(this.feedback, VIEW_W / 2, 196);
      ctx.fillStyle = this.feedbackColor;
      ctx.fillText(this.feedback, VIEW_W / 2, 196);
      ctx.globalAlpha = 1;
    }
    // Controles
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, VIEW_H - 62, VIEW_W, 20);
    ctx.fillStyle = "#cfe8ff";
    ctx.fillText(
      `PARRY: L · ↓ + PARRY = parry bajo · Ventana: ${this.window()} frames (${this.fight.state.config.parry}) · R reiniciar · Tab siguiente · Esc salir · Intentos: ${this.attempts}`,
      VIEW_W / 2,
      VIEW_H - 52,
    );
    ctx.restore();
  }
}
