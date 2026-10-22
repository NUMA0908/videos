/** Regenera las secciones generadas de DESIGN.md (frame data) y README.md (lista de movimientos). */
import { readFileSync, writeFileSync } from "node:fs";
import { FRAMEDATA_END, FRAMEDATA_START, frameDataMarkdown, moveListMarkdown, MOVELIST_END, MOVELIST_START } from "../src/data/frameDataDoc";

function patch(file: string, start: string, end: string, body: string): void {
  const path = new URL(`../${file}`, import.meta.url);
  const doc = readFileSync(path, "utf8");
  const a = doc.indexOf(start);
  const b = doc.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`Faltan los marcadores en ${file}`);
  writeFileSync(path, doc.slice(0, a + start.length) + "\n\n" + body + "\n" + doc.slice(b));
  console.log(`${file} actualizado`);
}

patch("DESIGN.md", FRAMEDATA_START, FRAMEDATA_END, frameDataMarkdown());
patch("README.md", MOVELIST_START, MOVELIST_END, moveListMarkdown());
