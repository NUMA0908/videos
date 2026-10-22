import { CHARACTERS } from "./characters";
import { GUARD_LABEL, type MoveData } from "./types";
import { TUNING } from "./tuning";

const adv = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const lock = (m: MoveData) => m.active - 1 + m.recovery;

function notes(m: MoveData): string {
  const out: string[] = [];
  if (m.knockdown) out.push("derriba");
  if (m.launch && !m.knockdown) out.push("si pega a un rival en el aire, lo lanza");
  if (m.juggle) out.push("juggle");
  for (const iv of m.invuln ?? []) out.push(`invencible (${iv.kind}) f${iv.from}-${iv.to}`);
  if (m.armor) out.push(`armadura ${m.armor.hits} golpe f${m.armor.from}-${m.armor.to}`);
  if (m.projectile) out.push(`proyectil en f${m.projectile.frame}`);
  if (m.throw) out.push(`agarre ${m.throw.range}px${m.throw.techable ? "" : ", no se escapa"}${m.throw.air ? ", aéreo" : ""}`);
  if (m.meterCost) out.push(`cuesta ${m.meterCost} de medidor`);
  if (m.chip) out.push(`chip ${m.chip}`);
  if (m.landingRecovery !== undefined) out.push(`aterrizaje ${m.landingRecovery}f`);
  if (m.cancels?.length) out.push(`cancel: ${m.cancels.join("/")}`);
  return out.join("; ");
}

/** Tabla markdown con toda la frame data (se inserta en DESIGN.md con `npm run framedata`). */
export function frameDataMarkdown(): string {
  const lines: string[] = [];
  for (const ch of CHARACTERS) {
    lines.push(`### ${ch.nickname} — ${ch.name} (${ch.archetype}, vida ${ch.health})`, "");
    lines.push("| Movimiento | Input | Startup | Active | Recovery | Daño | Guardia | Hitstun | Blockstun | Bloqueo | Hit | CH | Hitstop | Notas |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const m of Object.values(ch.moves)) {
      const isThrow = m.kind === "throw";
      const ch_ = m.chHitstunBonus ?? TUNING.counterHit.hitstunBonus[m.strength];
      const air = m.stance === "air";
      const bl = air ? "altura" : isThrow || m.knockdown ? "—" : adv(m.blockstun - lock(m));
      const hit = air ? "altura" : isThrow || m.knockdown ? "—" : adv(m.hitstun - lock(m));
      const chAdv = air ? "altura" : isThrow || m.knockdown ? "—" : adv(m.hitstun + ch_ - lock(m));
      lines.push(
        `| ${m.name} | ${m.notation} | ${m.startup} | ${m.active} | ${m.recovery} | ${m.damage} | ${isThrow ? "agarre" : GUARD_LABEL[m.guard]} | ${m.hitstun} | ${m.blockstun} | ${bl} | ${hit} | ${chAdv} | ${m.hitstop} | ${notes(m)} |`,
      );
    }
    const projs = Object.values(ch.projectiles);
    if (projs.length) {
      lines.push("", "| Proyectil | Velocidad | Golpes | Daño | Chip | Hitstun | Blockstun | Vida |", "|---|---|---|---|---|---|---|---|");
      for (const p of projs) {
        lines.push(`| ${p.id} | ${p.speed} px/f | ${p.hits} | ${p.damage} | ${p.chip} | ${p.hitstun} | ${p.blockstun} | ${p.life}f |`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export const FRAMEDATA_START = "<!-- FRAMEDATA:START (generado con `npm run framedata`, no editar a mano) -->";
export const FRAMEDATA_END = "<!-- FRAMEDATA:END -->";
