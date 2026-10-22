/** Regenera la sección de frame data de DESIGN.md a partir de los datos del juego. */
import { readFileSync, writeFileSync } from "node:fs";
import { FRAMEDATA_END, FRAMEDATA_START, frameDataMarkdown } from "../src/data/frameDataDoc";

const path = new URL("../DESIGN.md", import.meta.url);
const doc = readFileSync(path, "utf8");
const start = doc.indexOf(FRAMEDATA_START);
const end = doc.indexOf(FRAMEDATA_END);
if (start < 0 || end < 0) throw new Error("Faltan los marcadores FRAMEDATA en DESIGN.md");
const next = doc.slice(0, start + FRAMEDATA_START.length) + "\n\n" + frameDataMarkdown() + "\n" + doc.slice(end);
writeFileSync(path, next);
console.log("DESIGN.md actualizado");
