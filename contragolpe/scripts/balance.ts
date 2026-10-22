/**
 * Análisis de balance por simulación (QA). Uso:
 *   npm run sim -- [--partidos 40] [--fuzz 300] [--salida docs/balance.md]
 *
 * 1) Round-robin CPU vs CPU (todos los emparejamientos, ambos lados, Normal y Difícil).
 * 2) Bots de una sola táctica contra la CPU Normal: ninguna táctica simple debería ganar a menudo.
 * 3) Fuzzer de combos: inputs aleatorios muy rápidos contra un rival quieto (centro y esquina) para
 *    detectar combos infinitos o demasiado largos.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ONE_TRICK_BOTS } from "../src/ai/bots";
import { Cpu, CPU_LEVELS } from "../src/ai/cpu";
import { CHARACTERS, getChar } from "../src/data/characters";
import { px } from "../src/sim/fixed";
import { Btn } from "../src/sim/input";
import { WALL_MAX } from "../src/sim/physics";
import { Rng } from "../src/sim/rng";
import { createMatch } from "../src/sim/state";
import { stepInPlace } from "../src/sim/step";
import type { GameState } from "../src/sim/types";

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const MATCHES = arg("partidos", 40);
const FUZZ = arg("fuzz", 300);
const outIdx = args.indexOf("--salida");
const OUT = outIdx >= 0 ? args[outIdx + 1] : "docs/balance.md";

const ids = CHARACTERS.map((c) => c.id);
const MAX_FRAMES = 60 * 60 * 8;

interface MatchStats {
  winner: -1 | 0 | 1 | 2;
  frames: number;
  timeOuts: number;
  dmgByMove: Record<string, number>;
  maxCombo: { hits: number; damage: number; char: string; moves: string[] };
}

function playMatch(c0: string, c1: string, in0: (s: GameState) => number, in1: (s: GameState) => number, seed: number): MatchStats {
  const s = createMatch({ chars: [c0, c1], mode: "versus" }, seed);
  const stats: MatchStats = { winner: -1, frames: 0, timeOuts: 0, dmgByMove: {}, maxCombo: { hits: 0, damage: 0, char: "", moves: [] } };
  const comboMoves: [string[], string[]] = [[], []];
  let f = 0;
  for (; f < MAX_FRAMES && s.round.phase !== "over"; f++) {
    stepInPlace(s, in0(s), in1(s));
    for (const e of s.events) {
      if (e.type === "hit" || e.type === "throwHit") {
        const ch = s.config.chars[e.side];
        const key = `${ch}/${e.move ?? "?"}`;
        stats.dmgByMove[key] = (stats.dmgByMove[key] ?? 0) + (e.damage ?? 0);
        comboMoves[e.side].push(e.move ?? "?");
      }
      if (e.type === "timeOver") stats.timeOuts++;
    }
    for (const side of [0, 1] as const) {
      const def = s.fighters[1 - side];
      if (def.comboHits === 0) comboMoves[side] = [];
      if (def.comboHits > stats.maxCombo.hits) {
        stats.maxCombo = { hits: def.comboHits, damage: def.comboDamage, char: s.config.chars[side], moves: [...comboMoves[side]] };
      }
    }
  }
  stats.frames = f;
  stats.winner = s.round.phase === "over" ? s.round.matchWinner : -1;
  return stats;
}

function pct(a: number, b: number): string {
  return b ? `${Math.round((100 * a) / b)} %` : "—";
}

const lines: string[] = [];
const log = (l = "") => {
  lines.push(l);
  console.log(l);
};

const t0 = Date.now();
log("# Informe de balance (simulación)");
log("");
log(`Generado con \`npm run sim -- --partidos ${MATCHES} --fuzz ${FUZZ}\`. Todas las partidas son deterministas (semillas fijas).`);
log("");

// ---------------------------------------------------------------- 1. Round-robin
const globalDmg: Record<string, number> = {};
let globalMaxCombo = { hits: 0, damage: 0, char: "", moves: [] as string[] };
let totalMatches = 0;
let totalFrames = 0;
let totalTimeOuts = 0;
for (const level of [1, 2]) {
  log(`## CPU vs CPU · nivel ${CPU_LEVELS[level].name}`);
  log("");
  log("Porcentaje de victorias del personaje de la fila contra el de la columna (ambos lados de la pantalla).");
  log("");
  log(`| | ${ids.map((i) => getChar(i).nickname).join(" | ")} | Total |`);
  log(`|---|${ids.map(() => "---").join("|")}|---|`);
  const totals: Record<string, [number, number]> = {};
  for (const a of ids) totals[a] = [0, 0];
  const cells: Record<string, string> = {};
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) {
        cells[`${a}-${b}`] = "—";
        continue;
      }
      let winsA = 0;
      let n = 0;
      for (let k = 0; k < MATCHES; k++) {
        const seed = 1000 * level + 37 * k + ids.indexOf(a) * 7 + ids.indexOf(b) * 13;
        const aLeft = k % 2 === 0;
        const c0 = aLeft ? a : b;
        const c1 = aLeft ? b : a;
        const cpu0 = new Cpu(CPU_LEVELS[level], 0, seed);
        const cpu1 = new Cpu(CPU_LEVELS[level], 1, seed + 1);
        const st = playMatch(c0, c1, (s) => cpu0.input(s), (s) => cpu1.input(s), seed);
        totalMatches++;
        totalFrames += st.frames;
        totalTimeOuts += st.timeOuts;
        for (const [m, d] of Object.entries(st.dmgByMove)) globalDmg[m] = (globalDmg[m] ?? 0) + d;
        if (st.maxCombo.hits > globalMaxCombo.hits) globalMaxCombo = st.maxCombo;
        if (st.winner === 2 || st.winner === -1) {
          n++;
          winsA += 0.5;
          continue;
        }
        const aWon = (st.winner === 0) === aLeft;
        if (aWon) winsA++;
        n++;
      }
      cells[`${a}-${b}`] = pct(winsA, n);
      totals[a][0] += winsA;
      totals[a][1] += n;
    }
  }
  for (const a of ids) log(`| **${getChar(a).nickname}** | ${ids.map((b) => cells[`${a}-${b}`]).join(" | ")} | ${pct(totals[a][0], totals[a][1])} |`);
  log("");
}
log(`Partidos simulados: ${totalMatches} · duración media: ${(totalFrames / totalMatches / 60).toFixed(1)} s · rondas por tiempo: ${totalTimeOuts}`);
log("");
log(`Combo más largo visto en CPU vs CPU: **${globalMaxCombo.hits} golpes, ${globalMaxCombo.damage} de daño** (${globalMaxCombo.char}: ${globalMaxCombo.moves.join(" → ")})`);
log("");
log("### Daño total por movimiento (top 12)");
log("");
log("| Movimiento | Daño | % del total |");
log("|---|---|---|");
const dmgTotal = Object.values(globalDmg).reduce((a, b) => a + b, 0);
for (const [m, d] of Object.entries(globalDmg).sort((x, y) => y[1] - x[1]).slice(0, 12)) log(`| ${m} | ${d} | ${pct(d, dmgTotal)} |`);
log("");

// ---------------------------------------------------------------- 2. Bots de una táctica
for (const botLevel of [1, 2]) {
log(`## Tácticas únicas contra la CPU ${CPU_LEVELS[botLevel].name}`);
log("");
log("Victorias de un bot que solo hace una cosa. Si una táctica simple gana a menudo, es dominante.");
log("");
log(`| Bot | ${ids.map((i) => getChar(i).nickname).join(" | ")} |`);
log(`|---|${ids.map(() => "---").join("|")}|`);
const botMatches = Math.max(6, Math.round(MATCHES / 3));
const worstBot = { name: "", rate: 0 };
for (const [name, make] of Object.entries(ONE_TRICK_BOTS)) {
  const row: string[] = [];
  for (const me of ids) {
    let wins = 0;
    let n = 0;
    for (let k = 0; k < botMatches; k++) {
      const opp = ids[k % ids.length];
      const seed = 5000 + k * 11 + ids.indexOf(me);
      const bot = make(0, seed);
      const cpu = new Cpu(CPU_LEVELS[botLevel], 1, seed + 3);
      const st = playMatch(me, opp, bot, (s) => cpu.input(s), seed);
      if (st.winner === 0) wins++;
      else if (st.winner === 2 || st.winner === -1) wins += 0.5;
      n++;
    }
    const rate = wins / n;
    if (rate > worstBot.rate) Object.assign(worstBot, { name: `${name} (${me})`, rate });
    row.push(pct(wins, n));
  }
  log(`| ${name} | ${row.join(" | ")} |`);
}
log("");
log(`Táctica única más exitosa: **${worstBot.name}** con ${Math.round(worstBot.rate * 100)} % de victorias.`);
log("");
worstBot.rate = 0;
}

// ---------------------------------------------------------------- 3. Fuzzer de combos
log("## Fuzzer de combos (búsqueda de infinitos)");
log("");
log(`${FUZZ} secuencias aleatorias por personaje y posición: botones y direcciones cada 1–6 frames, con el medidor lleno al empezar (una súper), contra un rival que no se defiende.`);
log("");
log("| Personaje | Posición | Combo máximo | Daño máximo | Secuencia |");
log("|---|---|---|---|---|");
let fuzzWorst = 0;
for (const me of ids) {
  for (const corner of [false, true]) {
    let best = { hits: 0, damage: 0, moves: [] as string[] };
    for (let k = 0; k < FUZZ; k++) {
      const r = new Rng(9000 + k * 31 + ids.indexOf(me) * 7 + (corner ? 3 : 0));
      const s = createMatch({ chars: [me, "rayo"], mode: "training", timer: false }, k + 1);
      while (s.round.phase !== "fight") stepInPlace(s, 0, 0);
      if (corner) {
        s.fighters[1].x = WALL_MAX;
        s.fighters[0].x = WALL_MAX - px(90);
      } else {
        s.fighters[0].x = px(740);
        s.fighters[1].x = px(830);
      }
      const moves: string[] = [];
      let cur = 0;
      let hold = 0;
      s.fighters[0].meter = 1000; // una súper disponible, como en un partido real
      for (let f = 0; f < 600; f++) {
        if (hold-- <= 0) {
          const dir = r.pick([0, 0, Btn.DOWN, Btn.DOWN | Btn.RIGHT, Btn.RIGHT, Btn.LEFT, Btn.DOWN | Btn.LEFT]);
          const btn = r.chance(0.6) ? r.pick([Btn.LP, Btn.HP, Btn.LK, Btn.HK, Btn.SP, Btn.HP | Btn.HK]) : 0;
          cur = dir | btn;
          hold = 1 + r.int(5);
        }
        stepInPlace(s, cur, 0);
        for (const e of s.events) if (e.type === "hit" && e.side === 0) moves.push(e.move ?? "?");
        const d = s.fighters[1];
        if (d.comboHits === 0) moves.length = 0;
        if (d.comboHits > best.hits || (d.comboHits === best.hits && d.comboDamage > best.damage)) {
          best = { hits: d.comboHits, damage: d.comboDamage, moves: [...moves] };
        }
      }
    }
    fuzzWorst = Math.max(fuzzWorst, best.hits);
    log(`| ${getChar(me).nickname} | ${corner ? "esquina" : "centro"} | ${best.hits} golpes | ${best.damage} | ${best.moves.join(" → ")} |`);
  }
}
log("");
log(`Combo más largo encontrado por el fuzzer: **${fuzzWorst} golpes**. Un infinito se vería como decenas de golpes; el límite real lo ponen el escalado, el decaimiento de hitstun, el empuje en esquina y el máximo de juggles.`);
log("");
log(`Tiempo de simulación: ${((Date.now() - t0) / 1000).toFixed(1)} s.`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join("\n") + "\n");
console.error(`\nInforme guardado en ${OUT}`);
