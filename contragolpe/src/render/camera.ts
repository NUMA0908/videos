import { TUNING } from "../data/tuning";
import { toPx } from "../sim/fixed";
import type { GameState } from "../sim/types";
import { GROUND_Y, VIEW_W } from "./view";

/** Cámara de presentación: sigue a los personajes con suavizado. No forma parte de la simulación. */
export class Camera {
  x = TUNING.stage.width / 2;
  /** Altura del mundo que queda en la línea del suelo de la pantalla (sube un poco en saltos altos). */
  y = 0;
  zoom = 1;
  /** Zoom extra temporal (súper, KO) y su punto focal. */
  zoomTarget = 1;
  focusX: number | null = null;
  focusY = 0;
  /** Sacudida actual (px). */
  shakeX = 0;
  shakeY = 0;

  snap(s: GameState): void {
    this.x = this.targetX(s);
    this.y = 0;
    this.zoom = 1;
  }

  private targetX(s: GameState): number {
    const [a, b] = s.fighters;
    const mid = toPx(a.x + b.x) / 2;
    return mid;
  }

  update(s: GameState): void {
    const [a, b] = s.fighters;
    this.zoom += (this.zoomTarget - this.zoom) * 0.18;
    let tx = this.targetX(s);
    let ty = Math.max(0, (Math.max(toPx(a.y), toPx(b.y)) - 140) * 0.45);
    if (this.focusX !== null) {
      const k = Math.min(1, (this.zoom - 1) / Math.max(0.01, this.zoomTarget - 1 || 0.01));
      tx = tx + (this.focusX - tx) * k;
      ty = ty + (this.focusY - ty) * k;
    }
    const half = VIEW_W / 2 / this.zoom;
    tx = Math.max(half, Math.min(TUNING.stage.width - half, tx));
    this.x += (tx - this.x) * 0.2;
    this.y += (ty - this.y) * 0.15;
  }

  /** Mundo (px, y hacia arriba) → pantalla. */
  sx(wx: number): number {
    return (wx - this.x) * this.zoom + VIEW_W / 2 + this.shakeX;
  }
  sy(wy: number): number {
    return GROUND_Y + (this.y - wy) * this.zoom + this.shakeY;
  }
}
