// Renderiza todas las composiciones registradas en src/Root.tsx a out/<id>.mp4.
// Argumentos extra se pasan a `remotion render` (ej.: npm run render:all -- --crf=18).
import { execFileSync } from "node:child_process";

const extra = process.argv.slice(2);
const run = (args, opts = {}) =>
  execFileSync("npx", ["remotion", ...args], { shell: process.platform === "win32", ...opts });

const ids = run(["compositions", "src/index.ts", "--quiet"], { encoding: "utf8" })
  .trim()
  .split(/\s+/)
  .filter(Boolean);

for (const id of ids) {
  console.log(`\n▶ Renderizando ${id}`);
  run(["render", "src/index.ts", id, `out/${id}.mp4`, ...extra], { stdio: "inherit" });
}
console.log(`\n✔ ${ids.length} composición(es) renderizadas en out/`);
