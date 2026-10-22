import { app, BrowserWindow, ipcMain, Menu, net, protocol, session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CSP, isAllowedUrl } from "./security";

/**
 * Proceso principal de CONTRAGOLPE escritorio.
 * El juego es exactamente el mismo que en el navegador; aquí solo hay ventana, seguridad y sistema.
 */

const DEV_SERVER = process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, "..", "dist");

// El audio debe poder sonar sin un gesto previo (es un juego, no una web).
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Protocolo propio para servir el juego empaquetado (más seguro que file://).
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win: BrowserWindow | null = null;

/** Tipos MIME explícitos: con `nosniff`, un módulo JS sin su tipo correcto no se ejecuta. */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    show: false,
    backgroundColor: "#07070c",
    title: "CONTRAGOLPE",
    autoHideMenuBar: true,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  win.once("ready-to-show", () => win?.show());
  if (DEV_SERVER) void win.loadURL(DEV_SERVER);
  else void win.loadURL("app://game/index.html");
  win.on("closed", () => (win = null));
}

// Un solo ejemplar: si se abre otra vez, se enfoca la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  // Endurecer todos los webContents: sin ventanas nuevas, sin navegar fuera del juego, sin <webview>.
  app.on("web-contents-created", (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (ev, url) => {
      if (!isAllowedUrl(url, DEV_SERVER)) ev.preventDefault();
    });
    contents.on("will-redirect", (ev, url) => {
      if (!isAllowedUrl(url, DEV_SERVER)) ev.preventDefault();
    });
    contents.on("will-attach-webview", (ev) => ev.preventDefault());
  });

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    // Ningún permiso del navegador (cámara, micro, notificaciones...) salvo pantalla completa.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "fullscreen"));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "fullscreen");

    protocol.handle("app", async (req) => {
      const url = new URL(req.url);
      const file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
      if (url.host !== "game" || !file.startsWith(DIST)) return new Response("No encontrado", { status: 404 });
      const res = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(res.headers);
      headers.set("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
      headers.set("Content-Security-Policy", CSP);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(res.body, { status: res.status, headers });
    });

    registerIpc();
    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}

function registerIpc(): void {
  ipcMain.handle("window:toggle-fullscreen", () => {
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });
  ipcMain.handle("window:set-fullscreen", (_e, on: unknown) => {
    if (win && typeof on === "boolean") win.setFullScreen(on);
    return win?.isFullScreen() ?? false;
  });
  ipcMain.handle("window:is-fullscreen", () => win?.isFullScreen() ?? false);
  ipcMain.handle("app:quit", () => app.quit());
}
