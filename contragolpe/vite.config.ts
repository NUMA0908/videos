import { defineConfig, type Plugin } from "vitest/config";
import { CSP_META } from "./electron/security";

/** En el build se añade una CSP estricta como <meta> (la app de escritorio además la envía como cabecera). */
function cspMeta(): Plugin {
  return {
    name: "contragolpe-csp",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`),
  };
}

export default defineConfig({
  plugins: [cspMeta()],
  server: { host: true, port: 5173 },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    // Audio e imágenes de `assets/` siempre como archivo: la CSP (connect-src 'self') no deja cargar data: URIs con fetch.
    assetsInlineLimit: (file) => (/\.(ogg|mp3|wav|png|webp)$/i.test(file) ? false : undefined),
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
