import { TUNING } from "../data/tuning";
import { consume } from "./actions";
import { isAirborne } from "./boxes";
import type { Strike } from "./combat";
import { setState, toNeutral } from "./fighter";
import { isDown } from "./input";
import type { FighterState, GameState } from "./types";

/**
 * PARRY (desvío perfecto). Es una apuesta:
 *  - Pulsar PARRY abre una ventana corta (8 frames en Normal). Si un golpe llega dentro, no hace daño,
 *    ambos se congelan un instante y el defensor puede actuar enseguida mientras el atacante arrastra
 *    10 frames extra de recuperación: hay tiempo para castigar.
 *  - Si no llega nada, el personaje queda 20 frames expuesto (cualquier golpe es counter hit) y no puede
 *    volver a intentarlo hasta que pase el enfriamiento. Los agarres le ganan siempre.
 *  - De pie desvía alto y medio; agachado (↓ + PARRY) desvía bajo y medio; en el aire, todo (ventana menor).
 *  - Red parry: durante el blockstun, por 1/4 de medidor, con una ventana de 3 frames.
 */

export function parryWindowFor(s: GameState, air: boolean): number {
  const w = TUNING.parry.windows[s.config.parry];
  return air ? Math.max(2, w - TUNING.parry.airPenalty) : w;
}

/** Empieza un intento de parry (desde neutral o en el aire). */
export function startParry(s: GameState, f: FighterState, dir: number): void {
  const air = isAirborne(f);
  consume(f, "PARRY");
  setState(f, "parry");
  f.move = null;
  f.mf = 0;
  f.parryWindow = parryWindowFor(s, air);
  f.parryLow = !air && isDown(dir);
  f.crouching = f.parryLow;
  if (!air) f.vx = 0;
  else f.airUsed = true;
}

/** Avanza un frame del estado de parry. */
export function updateParry(s: GameState, f: FighterState): void {
  if (f.y === 0) f.vx = 0;
  f.parryWindow--;
  if (f.parryWindow <= 0) {
    f.parryWindow = 0;
    setState(f, "parryFail");
    f.stun = TUNING.parry.failRecovery;
    f.parryCooldown = TUNING.parry.failRecovery + TUNING.parry.cooldown;
    s.events.push({ type: "parryFail", side: f.side, x: f.x, y: f.y });
  }
}

/** ¿La altura del golpe es compatible con el parry intentado? */
function heightOk(def: FighterState, st: Strike): boolean {
  if (isAirborne(def)) return true;
  if (st.projectile) return true;
  if (def.parryLow) return st.guard === "low" || st.guard === "mid";
  return st.guard === "high" || st.guard === "mid";
}

/**
 * Comprueba si el defensor desvía este golpe y, si es así, aplica todo el efecto.
 * `atk` es null para proyectiles (el lanzador no se congela ni pierde tiempo).
 */
export function tryParry(s: GameState, atk: FighterState | null, def: FighterState, st: Strike): boolean {
  const normal = def.state === "parry" && def.parryWindow > 0 && heightOk(def, st);
  const red = def.state === "blockstun" && def.redParry > 0 && def.meter >= TUNING.parry.red.cost;
  if (!normal && !red) return false;

  const freeze = TUNING.parry.freeze;
  const air = isAirborne(def);
  const low = red ? def.crouching : def.parryLow;
  toNeutral(def);
  if (air) {
    setState(def, "air");
    def.airUsed = false; // tras un parry aéreo se puede contraatacar en el aire
  } else if (low) {
    setState(def, "crouch");
    def.crouching = true;
  }
  def.hitstop = freeze;
  def.parryWindow = 0;
  def.redParry = 0;
  def.parryCooldown = 0;
  if (red) def.meter -= TUNING.parry.red.cost;
  else def.meter = Math.min(TUNING.meter.max, def.meter + TUNING.parry.meterGain);

  if (atk && !st.projectile) {
    atk.hitstop = freeze;
    atk.contact = "parried";
    atk.contactMf = atk.mf;
    atk.sinceContact = 0;
    atk.extraRecovery += TUNING.parry.attackerExtraRecovery;
  }
  s.events.push({ type: red ? "redParry" : "parry", side: def.side, x: st.at?.x ?? def.x, y: st.at?.y ?? def.y + (low ? 6000 : 11000) });
  return true;
}

/** Red parry: en blockstun, pulsar PARRY abre una ventanita (si hay medidor y no hay enfriamiento). */
export function updateRedParry(s: GameState, f: FighterState, parryPressed: boolean): void {
  if (f.redParry > 0) {
    f.redParry--;
    if (f.redParry === 0) f.parryCooldown = TUNING.parry.cooldown;
    return;
  }
  if (parryPressed && f.parryCooldown === 0 && f.meter >= TUNING.parry.red.cost) {
    consume(f, "PARRY");
    f.redParry = TUNING.parry.red.window;
  }
  void s;
}
