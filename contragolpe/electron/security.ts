/** Política de seguridad del contenido (CSP) del juego empaquetado: nada remoto, nada de eval. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * La misma política para la etiqueta <meta> del HTML: sin `frame-ancestors`, que el navegador ignora (y avisa
 * por consola) si llega por <meta>. La app de escritorio la aplica igualmente con la cabecera HTTP (`CSP`).
 */
export const CSP_META = CSP.split("; ")
  .filter((d) => !d.startsWith("frame-ancestors"))
  .join("; ");

/** Orígenes a los que la ventana puede navegar (el juego en sí). Todo lo demás se bloquea. */
export function isAllowedUrl(url: string, devServer: string | undefined): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "app:" && u.host === "game") return true;
    if (devServer) {
      const d = new URL(devServer);
      return u.origin === d.origin;
    }
    return false;
  } catch {
    return false;
  }
}
