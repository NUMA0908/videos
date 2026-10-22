// npm run app:dev → servidor Vite con recarga en caliente + ventana de Electron apuntando a él.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";

await import("./electron-compile.mjs");
const server = await createServer({ server: { port: 5173, strictPort: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? "http://localhost:5173/";
const electronPath = createRequire(import.meta.url)("electron");
// En contenedores que corren como root Chromium exige --no-sandbox (solo afecta al sandbox del SO).
const extra = process.getuid?.() === 0 ? ["--no-sandbox"] : [];
const child = spawn(electronPath, [".", ...extra, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
