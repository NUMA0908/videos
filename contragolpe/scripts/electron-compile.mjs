// Compila electron/*.ts a dist-electron/ (CommonJS) para el proceso principal y el preload.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

execSync("npx tsc -p tsconfig.electron.json", { stdio: "inherit" });
mkdirSync("dist-electron", { recursive: true });
// El proyecto es "type": "module"; el proceso principal y el preload se cargan como CommonJS.
writeFileSync("dist-electron/package.json", JSON.stringify({ type: "commonjs" }) + "\n");
