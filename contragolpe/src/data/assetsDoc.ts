import { MUSIC_CATALOG, SFX_CATALOG, VOICE_CATALOG, type SoundSpec } from "../audio/catalog";
import { CHARACTERS } from "./characters";
import { TUNING } from "./tuning";
import type { CharacterData, MoveData } from "./types";

/**
 * Genera ASSETS_NEEDED.md (`npm run assets`): la lista exacta de animaciones y sonidos con los nombres de
 * archivo que espera el juego. Sale de los datos (frame data, personajes, catálogo de audio), así nunca se
 * desfasa: un test comprueba que el archivo está al día.
 */

const range = (name: string, n: number, ext: string) => (n <= 1 ? `\`${name}_1${ext}\`` : `\`${name}_1${ext}\` … \`${name}_${n}${ext}\``);

function soundRows(cat: Record<string, SoundSpec>, ext: string): string[] {
  const rows: string[] = [];
  let group = "";
  for (const [name, spec] of Object.entries(cat)) {
    const g = spec.group !== group ? `**${spec.group}**` : "";
    group = spec.group;
    rows.push(`| ${g} | ${range(name, spec.variants, ext)} | ${spec.variants} | ${spec.desc} |`);
  }
  return rows;
}

/** Dibujos sugeridos para una fase según cuántos frames dura en el juego. */
const drawingsFor = (frames: number, kind: "anticip" | "active" | "recovery"): number => {
  if (frames <= 0) return 0;
  if (kind === "active") return frames >= 4 ? 2 : 1;
  if (kind === "anticip") return frames <= 2 ? 1 : frames <= 6 ? 2 : frames <= 12 ? 3 : 4;
  return frames <= 8 ? 2 : frames <= 18 ? 3 : 4;
};

/** Carpeta de la animación de un movimiento: las versiones ligera/fuerte con la misma animación la comparten. */
function animGroups(ch: CharacterData): { folder: string; moves: MoveData[] }[] {
  const byKey = new Map<string, MoveData[]>();
  for (const mv of Object.values(ch.moves)) {
    const a = mv.anim;
    const key = `${a.windup}|${a.strike}|${a.recover ?? ""}|${(a.keys ?? []).map((k) => k.pose).join(",")}`;
    const list = byKey.get(key) ?? [];
    list.push(mv);
    byKey.set(key, list);
  }
  const out: { folder: string; moves: MoveData[] }[] = [];
  for (const moves of byKey.values()) {
    const base = moves[0].id.replace(/_(l|h)$/, "");
    const shared = moves.length > 1 && moves.every((m) => m.id.replace(/_(l|h)$/, "") === base);
    if (shared || moves.length === 1) out.push({ folder: shared ? base : moves[0].id, moves });
    else for (const m of moves) out.push({ folder: m.id, moves: [m] });
  }
  return out;
}

function moveRow(folder: string, moves: MoveData[]): string {
  const timing = moves.map((mv) => {
    const land = mv.landingRecovery ? ` + aterrizaje ${mv.landingRecovery}` : "";
    const rec = mv.endsOnLanding ? "hasta aterrizar" : `${mv.recovery}`;
    return `${moves.length > 1 ? `${mv.id}: ` : ""}${mv.startup - 1} / ${mv.active} / ${rec}${land}`;
  });
  const mv = moves.reduce((a, b) => (a.startup + a.active + a.recovery >= b.startup + b.active + b.recovery ? a : b));
  const nA = drawingsFor(mv.startup - 1, "anticip");
  const nS = drawingsFor(mv.active, "active");
  const nR = mv.endsOnLanding ? 1 : drawingsFor(mv.recovery + (mv.landingRecovery ?? 0), "recovery");
  const notes: string[] = [];
  if (mv.throw) notes.push(`agarre: si conecta, la animación de lanzamiento dura ${mv.throw.duration} f (daño en el f${mv.throw.damageFrame}) → \`${folder}_hit\``);
  if (mv.projectile) notes.push(`el proyectil sale en el f${mv.projectile.frame}: las manos deben estar extendidas ahí`);
  if (mv.superFlash) notes.push(`pantalla de súper: el f1 se congela ${mv.superFlash} f (pose de carga espectacular)`);
  if (mv.anim.keys?.length) notes.push(`keyframes: ${mv.anim.keys.map((k) => `f${k.at}`).join(", ")}`);
  if (mv.motion?.some((m) => m.vy !== undefined)) notes.push("deja el suelo: incluir caída");
  if (mv.armor) notes.push(`armadura f${mv.armor.from}–${mv.armor.to}: que se note (cuerpo tenso)`);
  return `| \`${folder}\` | ${moves.map((m) => m.name).join(" / ")} | ${timing.join("<br>")} | ${nA} + ${nS} + ${nR} | ${notes.join("; ")} |`;
}

function baseRows(ch: CharacterData): string[] {
  const hitstuns = Object.values(ch.moves).map((m) => m.hitstun).filter((n) => n > 0);
  const hs = `${Math.min(...hitstuns)}–${Math.max(...hitstuns) + TUNING.counterHit.hitstunBonus.heavy}`;
  const airtime = Math.round((2 * ch.jump.vy) / ch.jump.gravity);
  const rows: [string, string, string, string][] = [
    ["idle", "bucle (~60 f)", "6", "respiración sutil; nunca quieto del todo"],
    ["walk_f", "bucle de 30 f", "8", "caminar hacia delante"],
    ["walk_b", "bucle de 34 f", "8", "caminar hacia atrás (guardia alta)"],
    ["crouch", "3 f de bajada + bucle", "2 + 2", "`_01`–`_02` = bajar (pose de enlace), `_03`–`_04` = agachado con respiración"],
    ["prejump", `${ch.jump.prejump} f`, "1", "flexiona rodillas antes de saltar"],
    ["jump", `~${airtime} f en el aire`, "4", "`_01` despegue, `_02` subida, `_03` ápice recogido, `_04` caída (el juego elige según la velocidad)"],
    ["land", `${ch.jump.landing} f`, "1–2", "aterrizaje (rodillas flexionadas)"],
    ["dash_f", `${ch.dashF.frames} f`, "3", "impulso hacia delante, frena al final"],
    ["dash_b", `${ch.dashB.frames} f`, "3", "salto corto hacia atrás"],
    ["block", "variable (blockstun)", "2", "`_01` impacto en la guardia, `_02` guardia sostenida"],
    ["block_crouch", "variable (blockstun)", "2", "igual, agachado"],
    ["hit_high", `${hs} f (hitstun)`, "3", "golpe en la cabeza: `_01` impacto (pose más extrema), `_02` sostenida, `_03` vuelta a la guardia"],
    ["hit_mid", `${hs} f (hitstun)`, "3", "golpe en el cuerpo (también counter hit): se dobla hacia delante"],
    ["hit_crouch", `${hs} f (hitstun)`, "3", "golpe estando agachado"],
    ["air_hit", "variable", "3", "lanzado o golpeado en el aire: `_01` subida, `_02` giro, `_03` caída"],
    ["knockdown", `${TUNING.knockdown.groundFrames} f`, "2", "`_01` choque con el suelo, `_02` tumbado"],
    ["wakeup", `${TUNING.knockdown.wakeupFrames} f`, "3", "levantarse hasta la guardia"],
    ["parry", `${TUNING.parry.freeze} f congelado`, "2", "desvío de pie (palma abierta), muy legible"],
    ["parry_low", `${TUNING.parry.freeze} f congelado`, "2", "desvío agachado"],
    ["parry_air", `${TUNING.parry.freeze} f congelado`, "2", "desvío en el aire"],
    ["parry_fail", `${TUNING.parry.failRecovery} f`, "2", "desequilibrado, expuesto"],
    ["thrown", "según el agarre del rival", "2", "agarrado (luego usa `air_hit`)"],
    ["throw_tech", `${TUNING.throw.techRecovery} f`, "2", "se zafa del agarre"],
    ["intro", `${TUNING.round.introFrames} f`, "4–6", "entrada a la ronda, con personalidad"],
    ["win", "18 f de transición + bucle", "4–6", "pose de victoria"],
    ["lose", "bucle", "2–4", "derrota por tiempo (de pie, agotado) — **nuevo**, hoy no existe"],
    ["ko", `${TUNING.round.koFrames} f`, "3–4", "sale despedido y queda tumbado"],
  ];
  return rows.map(([n, d, k, note]) => `| \`${n}\` | ${d} | ${k} | ${note} |`);
}

export function assetsMarkdown(): string {
  const L: string[] = [];
  L.push("# CONTRAGOLPE — Assets que hay que conseguir");
  L.push("");
  L.push("<!-- Generado con `npm run assets` a partir de la frame data y del catálogo de audio. No editar a mano. -->");
  L.push("");
  L.push("Lista exacta de animaciones y sonidos, con los nombres de archivo que espera el juego.");
  L.push("Los números de frames salen de `src/data/` (60 frames = 1 segundo).");
  L.push("");
  L.push("## Estado");
  L.push("");
  L.push("- **Sonido: listo para recibir archivos.** Si un archivo existe en `assets/audio/`, el juego lo usa en lugar del");
  L.push("  sonido sintetizado (tras `npm run build`, o al recargar en `npm run dev`). Lo que falte sigue sintetizado.");
  L.push("- **Sprites: todavía no se cargan.** Los personajes se dibujan con código. Los nombres de abajo son los que usará");
  L.push("  el sistema de sprites propuesto en [docs/sprites-plan.md](docs/sprites-plan.md); conviene producirlos ya con");
  L.push("  esta convención.");
  L.push("- **Licencia:** solo material propio o con licencia clara (CC0 o equivalente). Anota cada archivo en");
  L.push("  [assets/CREDITS.md](assets/CREDITS.md) (fuente, autor, licencia). Personajes y arte 100 % originales.");
  L.push("");
  L.push("## 1. Sonido");
  L.push("");
  L.push("**Formato:** `.ogg` (Vorbis, recomendado), `.mp3` o `.wav`. Efectos y voces en mono, 44,1 o 48 kHz; música en estéreo.");
  L.push("**El sonido debe empezar en la primera muestra** (sin silencio inicial: cada milisegundo de silencio es retraso");
  L.push("respecto al golpe). Picos a −1 dBFS; los efectos importantes (parry, KO) deben destacar sobre la música.");
  L.push("Variantes: `nombre_1.ogg`, `nombre_2.ogg`… El juego elige una al azar sin repetir la anterior y varía el tono ±3 %;");
  L.push("con una sola variante también funciona.");
  L.push("");
  L.push("### Efectos — `assets/audio/sfx/`");
  L.push("");
  L.push("| Grupo | Archivos | Variantes | Qué debe sonar |");
  L.push("|---|---|---|---|");
  L.push(...soundRows(SFX_CATALOG, ".ogg"));
  L.push("");
  L.push("Capas de un golpe: **swing** al lanzarlo (conecte o no) → **impacto** al conectar → **voz** (opcional).");
  L.push("Puño, patada, especial, bloqueo y parry deben distinguirse con los ojos cerrados.");
  L.push("");
  L.push("### Voces — `assets/audio/voice/<personaje>/`");
  L.push("");
  L.push(`Una carpeta por personaje: ${CHARACTERS.map((c) => `\`${c.id}/\``).join(", ")}. Voces cortas (< 0,6 s), sin palabras largas.`);
  L.push("");
  L.push("| Grupo | Archivos | Variantes | Qué debe sonar |");
  L.push("|---|---|---|---|");
  L.push(...soundRows(VOICE_CATALOG, ".ogg"));
  L.push("");
  L.push(`Total: ${Object.values(VOICE_CATALOG).reduce((a, v) => a + v.variants, 0)} archivos por personaje.`);
  L.push("");
  L.push("### Música — `assets/audio/music/`");
  L.push("");
  L.push("| Archivo | Uso |");
  L.push("|---|---|");
  for (const [k, d] of Object.entries(MUSIC_CATALOG)) L.push(`| \`${k}.ogg\` | ${d}. Bucle sin cortes (el final empalma con el principio). |`);
  L.push("");
  L.push("## 2. Sprites de personajes");
  L.push("");
  L.push("**Formato:** PNG con transparencia, un archivo por dibujo:");
  L.push("`assets/sprites/<personaje>/<animación>/<animación>_<NN>.png` (NN = 01, 02…), p. ej.");
  L.push("`assets/sprites/rayo/st_hp/st_hp_03.png`.");
  L.push("");
  L.push("- **Lienzo 512 × 512 px**, personaje mirando a la **derecha**. **Ancla** (punto entre los pies, en el suelo) en");
  L.push("  **(256, 480)** en TODOS los dibujos: así no tiembla al cambiar de dibujo. Si una pose no cabe (tumbado, patada");
  L.push("  muy larga), usa 1024 × 512 con el ancla en (512, 480) para **toda** esa animación.");
  L.push("- **Escala 2×:** 1 px del juego = 2 px del dibujo. Un personaje mide ~190 px en el juego → ~380 px de alto.");
  L.push("- Los golpes no se deciden por el dibujo (las cajas de golpe son datos), pero **el puño/pie del dibujo de impacto");
  L.push("  debe caer dentro de la hitbox** (un test lo comprobará). Usa el modo debug (F1) como referencia de alcance.");
  L.push("- **Fases** = frames de juego de anticipación / golpe (activos) / recuperación. El primer dibujo de golpe se muestra");
  L.push("  exactamente en el primer frame activo. La anticipación debe leerse (cuerpo cargado), el golpe ser el dibujo más");
  L.push("  estirado, y la recuperación volver visiblemente a la guardia.");
  L.push("- **Dibujos sugeridos** = anticipación + golpe + recuperación. Cada dibujo se sostiene varios frames (la duración se");
  L.push("  ajusta en código sin redibujar). Más dibujos = más fluido, pero estos bastan.");
  L.push("- Paleta alternativa (espejos): opcional, misma estructura en `assets/sprites/<personaje>/alt/`.");
  L.push("");
  for (const ch of CHARACTERS) {
    L.push(`### ${ch.nickname} — ${ch.name} · \`assets/sprites/${ch.id}/\``);
    L.push("");
    L.push("**Estados básicos**");
    L.push("");
    L.push("| Animación (carpeta) | Duración en el juego | Dibujos | Notas |");
    L.push("|---|---|---|---|");
    L.push(...baseRows(ch));
    L.push("");
    L.push("**Ataques** (fases en frames: anticipación / golpe / recuperación)");
    L.push("");
    L.push("| Animación (carpeta) | Movimiento | Fases | Dibujos | Notas |");
    L.push("|---|---|---|---|---|");
    const groups = animGroups(ch);
    for (const g of groups) L.push(moveRow(g.folder, g.moves));
    for (const g of groups) {
      const t = g.moves.find((m) => m.throw);
      if (t?.throw) L.push(`| \`${g.folder}_hit\` | ${t.name}: lanzamiento | ${t.throw.duration} f (daño en f${t.throw.damageFrame}) | 4 | el rival usa \`thrown\` y luego \`air_hit\` |`);
    }
    const proj = Object.values(ch.projectiles);
    if (proj.length) {
      L.push("");
      L.push("**Proyectiles**");
      L.push("");
      L.push("| Animación (carpeta) | Proyectil | Dibujos | Notas |");
      L.push("|---|---|---|---|");
      for (const p of proj) L.push(`| \`proj_${p.id}\` | ${p.id} (${p.hits > 1 ? `${p.hits} golpes` : "1 golpe"}) | 4 en bucle + 3 al desaparecer (\`proj_${p.id}_end\`) | centrado en (256, 256); hoy se dibuja con código |`);
    }
    const nBase = baseRows(ch).length;
    L.push("");
    L.push(`Total ${ch.name}: ${nBase} animaciones básicas + ${groups.length + groups.filter((g) => g.moves.some((m) => m.throw)).length} de ataque${proj.length ? ` + ${proj.length} proyectiles` : ""}.`);
    L.push("");
  }
  L.push("## 3. HUD y menús (opcional)");
  L.push("");
  L.push("| Archivo | Tamaño | Uso |");
  L.push("|---|---|---|");
  L.push("| `assets/sprites/<personaje>/portrait.png` | 256 × 256 | retrato junto a la barra de vida |");
  L.push("| `assets/sprites/<personaje>/portrait_hurt.png` | 256 × 256 | retrato con la vida baja (< 25 %) |");
  L.push("| `assets/sprites/<personaje>/select.png` | 768 × 1024 | busto para la pantalla de selección |");
  L.push("");
  return L.join("\n");
}
