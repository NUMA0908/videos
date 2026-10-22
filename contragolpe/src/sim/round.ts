import { TUNING } from "../data/tuning";
import { setState, toNeutral } from "./fighter";
import { resetForRound } from "./state";
import type { FighterState, GameState, Side } from "./types";

/** Fases: intro → pelea → ko (incluye tiempo agotado) → intro de la siguiente ronda … → over. */
export function updateRoundStart(s: GameState): void {
  const r = s.round;
  r.t++;
  if (r.phase === "intro") {
    if (r.t === 1) {
      s.events.push({ type: "round", side: 0, x: 0, y: 0 });
      for (const f of s.fighters) setState(f, "intro");
    }
    if (r.t >= TUNING.round.introFrames) {
      r.phase = "fight";
      r.t = 0;
      s.events.push({ type: "fight", side: 0, x: 0, y: 0 });
      for (const f of s.fighters) toNeutral(f);
    }
  } else if (r.phase === "fight") {
    if (s.config.timer && r.timer > 0) r.timer--;
  }
}

function healthRatioCompare(a: FighterState, b: FighterState): number {
  // Comparación entera de vida relativa: a.h/a.max vs b.h/b.max
  return a.health * b.maxHealth - b.health * a.maxHealth;
}

/** Comprueba KO / tiempo y avanza el final de ronda. Se llama al final de cada tick. */
export function updateRoundEnd(s: GameState): void {
  const r = s.round;
  const [a, b] = s.fighters;

  if (s.config.infiniteHealth) {
    // Entrenamiento: la vida se rellena cuando termina el combo.
    for (const f of s.fighters) {
      if (f.comboHits === 0 && f.health < f.maxHealth && (f.state === "idle" || f.state === "crouch" || f.state === "walkF" || f.state === "walkB")) {
        f.health = f.maxHealth;
      }
      if (f.health <= 0) f.health = 1;
    }
  }
  if (s.config.infiniteMeter) for (const f of s.fighters) f.meter = TUNING.meter.max;

  if (r.phase === "fight") {
    const koA = a.health <= 0;
    const koB = b.health <= 0;
    const timeUp = s.config.timer && r.timer <= 0;
    if (koA || koB || timeUp) {
      r.phase = "ko";
      r.t = 0;
      r.timeOver = !koA && !koB;
      if (koA && koB) r.winner = 2;
      else if (koA) r.winner = 1;
      else if (koB) r.winner = 0;
      else {
        const c = healthRatioCompare(a, b);
        r.winner = c > 0 ? 0 : c < 0 ? 1 : 2;
      }
      if (r.winner === 0 || r.winner === 1) {
        const w = s.fighters[r.winner];
        r.perfect = w.health === w.maxHealth;
      } else r.perfect = false;
      if (r.timeOver) s.events.push({ type: "timeOver", side: 0, x: 0, y: 0 });
    }
    return;
  }

  if (r.phase === "ko") {
    // El ganador posa cuando termina lo que estaba haciendo.
    if (r.t > 70 && (r.winner === 0 || r.winner === 1)) {
      const w = s.fighters[r.winner];
      if ((w.state === "idle" || w.state === "crouch" || w.state === "walkF" || w.state === "walkB" || w.state === "land") && w.y === 0) {
        setState(w, "win");
        w.vx = 0;
      }
    }
    if (r.t === 90 && (r.winner === 0 || r.winner === 1)) {
      s.events.push({ type: "roundWin", side: r.winner as Side, x: 0, y: 0 });
    }
    if (r.t >= TUNING.round.koFrames) {
      if (r.winner === 0 || r.winner === 1) r.wins[r.winner]++;
      else {
        r.wins[0]++;
        r.wins[1]++;
      }
      const need = s.config.roundsToWin;
      if (r.wins[0] >= need || r.wins[1] >= need) {
        r.phase = "over";
        r.t = 0;
        r.matchWinner = r.wins[0] >= need && r.wins[1] >= need ? 2 : r.wins[0] >= need ? 0 : 1;
        s.events.push({ type: "matchOver", side: r.matchWinner === 1 ? 1 : 0, x: 0, y: 0 });
      } else {
        r.num++;
        r.phase = "intro";
        r.t = 0;
        r.timer = TUNING.round.seconds * 60;
        r.winner = -1;
        r.timeOver = false;
        r.perfect = false;
        resetForRound(s);
      }
    }
  }
}
