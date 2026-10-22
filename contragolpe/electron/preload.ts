import { contextBridge, ipcRenderer } from "electron";

/**
 * Puente mínimo entre el juego y el sistema. Solo funciones concretas: nunca se expone ipcRenderer.
 * (Preload con sandbox: solo puede usar el módulo "electron".)
 */
const api = {
  isDesktop: true as const,
  platform: process.platform,
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke("window:toggle-fullscreen"),
  setFullscreen: (on: boolean): Promise<boolean> => ipcRenderer.invoke("window:set-fullscreen", !!on),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke("window:is-fullscreen"),
  quit: (): Promise<void> => ipcRenderer.invoke("app:quit"),
};

contextBridge.exposeInMainWorld("contragolpeDesktop", api);

export type DesktopApi = typeof api;
