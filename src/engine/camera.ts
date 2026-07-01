import { VIEW } from "../config";
import { clamp, lerp } from "../core/math";

/** Smoothed follow camera with clamped bounds and screen shake. */
export class Camera {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  private shakeMag = 0;
  private shakeT = 0;
  private levelW: number = VIEW.w;
  private levelH: number = VIEW.h;

  setBounds(w: number, h: number): void {
    this.levelW = Math.max(w, VIEW.w);
    this.levelH = Math.max(h, VIEW.h);
  }

  snapTo(cx: number, cy: number): void {
    this.x = this.clampX(cx - VIEW.w / 2);
    this.y = this.clampY(cy - VIEW.h / 2);
    this.prevX = this.x;
    this.prevY = this.y;
  }

  follow(cx: number, cy: number, dt: number): void {
    this.prevX = this.x;
    this.prevY = this.y;
    const tx = this.clampX(cx - VIEW.w / 2);
    const ty = this.clampY(cy - VIEW.h / 2);
    // Exponential smoothing, frame-rate independent.
    const k = 1 - Math.exp(-12 * dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
  }

  shake(mag: number, dur = 0.3): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  /** Interpolated render offset including shake. Returns integer-ish offset. */
  renderOffset(alpha: number): { ox: number; oy: number } {
    let ox = lerp(this.prevX, this.x, alpha);
    let oy = lerp(this.prevY, this.y, alpha);
    if (this.shakeT > 0) {
      const s = this.shakeMag * (this.shakeT > 0 ? this.shakeT : 0);
      ox += (Math.random() * 2 - 1) * s;
      oy += (Math.random() * 2 - 1) * s;
    }
    return { ox, oy };
  }

  private clampX(x: number): number {
    return clamp(x, 0, this.levelW - VIEW.w);
  }
  private clampY(y: number): number {
    return clamp(y, 0, this.levelH - VIEW.h);
  }
}
