import { defineConfig, type Plugin } from "vitest/config";
import { CSP } from "./electron/security";

/** En el build se añade una CSP estricta como <meta> (la app de escritorio además la envía como cabecera). */
function cspMeta(): Plugin {
  return {
    name: "contragolpe-csp",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  plugins: [cspMeta()],
  server: { host: true, port: 5173 },
  build: { target: "es2022", outDir: "dist", sourcemap: false },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
