import { TILE } from "../config";
import type { Palette } from "../config";
import type { AABB } from "../core/math";
import { aabbOverlap } from "../core/math";

/** Gravity-zone multipliers (per spec). */
export const ZONE_GRAVITY_MUL = 1.6;
export const ZONE_DRAIN_MUL = 1.8;

/** Faller (disappearing platform) timing, seconds. */
const FALL_FLASH_AT = 1; // flashing begins after standing this long
const FALL_GONE_AT = 2; // vanishes this long after first contact
const FALL_RETURN_AT = 3; // reappears this long after vanishing

// All coordinates in level metadata are in TILES; speeds in tiles/second.
export interface MoverDef {
  tx: number;
  ty: number;
  w: number;
  h: number;
  axis: "h" | "v";
  range: number; // travel distance in tiles
  speed: number; // tiles per second
  phase?: number; // 0..1 offset into the cycle
}

export interface SawDef {
  tx: number;
  ty: number;
  axis: "h" | "v";
  range: number;
  speed: number;
  phase?: number;
}

export interface ZoneDef {
  tx: number;
  ty: number;
  w: number;
  h: number;
}

/** Triangle wave: 0 → range → 0 → range … over input distance. */
function pingpong(x: number, range: number): number {
  if (range <= 0) return 0;
  const m = ((x % (2 * range)) + 2 * range) % (2 * range);
  return m <= range ? m : 2 * range - m;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A solid platform that ping-pongs between two points and carries the player. */
export class MovingPlatform {
  readonly box: AABB;
  /** Delta moved during the most recent update (for carrying riders). */
  dx = 0;
  dy = 0;
  private readonly ox: number;
  private readonly oy: number;
  private readonly axis: "h" | "v";
  private readonly rangePx: number;
  private readonly speedPx: number;
  private readonly phasePx: number;
  private elapsed = 0;

  constructor(d: MoverDef) {
    this.ox = d.tx * TILE;
    this.oy = d.ty * TILE;
    this.axis = d.axis;
    this.rangePx = d.range * TILE;
    this.speedPx = d.speed * TILE;
    this.phasePx = (d.phase ?? 0) * 2 * this.rangePx;
    this.box = { x: this.ox, y: this.oy, w: d.w * TILE, h: d.h * TILE };
    this.place();
  }

  private place(): void {
    const off = pingpong(this.elapsed * this.speedPx + this.phasePx, this.rangePx);
    if (this.axis === "h") this.box.x = this.ox + off;
    else this.box.y = this.oy + off;
  }

  reset(): void {
    this.elapsed = 0;
    this.dx = 0;
    this.dy = 0;
    this.place();
  }

  update(dt: number): void {
    const px = this.box.x;
    const py = this.box.y;
    this.elapsed += dt;
    this.place();
    this.dx = this.box.x - px;
    this.dy = this.box.y - py;
  }

  render(ctx: CanvasRenderingContext2D, ox: number, oy: number, pal: Palette): void {
    const x = this.box.x - ox;
    const y = this.box.y - oy;
    ctx.fillStyle = pal.solid;
    roundRect(ctx, x, y, this.box.w, this.box.h, 6);
    ctx.fill();
    ctx.strokeStyle = pal.solidEdge;
    ctx.lineWidth = 3;
    roundRect(ctx, x + 1.5, y + 1.5, this.box.w - 3, this.box.h - 3, 5);
    ctx.stroke();
    // Grip chevrons hint that it's a mover.
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    const cx = x + this.box.w / 2;
    const cy = y + this.box.h / 2;
    ctx.beginPath();
    if (this.axis === "h") {
      ctx.moveTo(cx - 8, cy - 5); ctx.lineTo(cx - 3, cy); ctx.lineTo(cx - 8, cy + 5);
      ctx.moveTo(cx + 3, cy - 5); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx + 3, cy + 5);
    } else {
      ctx.moveTo(cx - 5, cy - 8); ctx.lineTo(cx, cy - 3); ctx.lineTo(cx + 5, cy - 8);
      ctx.moveTo(cx - 5, cy + 3); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx + 5, cy + 3);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** A block that vanishes 2s after you first stand on it, and returns 3s later. */
export class Faller {
  readonly box: AABB;
  private armed = false;
  private t = 0;
  private goneT = 0;
  private gone = false;

  constructor(tx: number, ty: number, w: number, h: number) {
    this.box = { x: tx * TILE, y: ty * TILE, w: w * TILE, h: h * TILE };
  }

  reset(): void {
    this.armed = false;
    this.t = 0;
    this.goneT = 0;
    this.gone = false;
  }

  get solid(): boolean {
    return !this.gone;
  }

  /** Called while the player is standing on this platform. */
  arm(): void {
    if (!this.gone && !this.armed) this.armed = true;
  }

  update(dt: number): void {
    if (this.gone) {
      this.goneT += dt;
      if (this.goneT >= FALL_RETURN_AT) this.reset();
      return;
    }
    if (this.armed) {
      this.t += dt;
      if (this.t >= FALL_GONE_AT) {
        this.gone = true;
        this.goneT = 0;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, ox: number, oy: number, pal: Palette, time: number): void {
    const x = this.box.x - ox;
    const y = this.box.y - oy;
    if (this.gone) {
      // Faint ghost so the player knows it will return.
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = pal.solidEdge;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      roundRect(ctx, x + 2, y + 2, this.box.w - 4, this.box.h - 4, 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      return;
    }
    const flashing = this.armed && this.t >= FALL_FLASH_AT;
    ctx.globalAlpha = flashing ? 0.4 + 0.6 * Math.abs(Math.sin(time * 22)) : 1;
    ctx.fillStyle = pal.solid;
    roundRect(ctx, x, y, this.box.w, this.box.h, 6);
    ctx.fill();
    ctx.strokeStyle = flashing ? pal.hazard : pal.solidEdge;
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 3;
    roundRect(ctx, x + 1.5, y + 1.5, this.box.w - 3, this.box.h - 3, 5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

/** A spike that slides along a track; lethal on contact like a static spike. */
export class Saw {
  readonly box: AABB;
  private readonly ox: number;
  private readonly oy: number;
  private readonly axis: "h" | "v";
  private readonly rangePx: number;
  private readonly speedPx: number;
  private readonly phasePx: number;
  private elapsed = 0;

  constructor(d: SawDef) {
    this.ox = d.tx * TILE;
    this.oy = d.ty * TILE;
    this.axis = d.axis;
    this.rangePx = d.range * TILE;
    this.speedPx = d.speed * TILE;
    this.phasePx = (d.phase ?? 0) * 2 * this.rangePx;
    this.box = { x: this.ox, y: this.oy, w: TILE, h: TILE };
    this.place();
  }

  private place(): void {
    const off = pingpong(this.elapsed * this.speedPx + this.phasePx, this.rangePx);
    if (this.axis === "h") this.box.x = this.ox + off;
    else this.box.y = this.oy + off;
  }

  reset(): void {
    this.elapsed = 0;
    this.place();
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.place();
  }

  /** Shrunk lethal hitbox so a graze isn't a kill (matches static spikes). */
  hitbox(): AABB {
    return { x: this.box.x + 6, y: this.box.y + 6, w: TILE - 12, h: TILE - 12 };
  }

  render(ctx: CanvasRenderingContext2D, ox: number, oy: number, pal: Palette, time: number): void {
    const cx = this.box.x + TILE / 2 - ox;
    const cy = this.box.y + TILE / 2 - oy;
    const r = TILE * 0.34;
    const pulse = 0.5 + 0.5 * Math.sin(time * 9);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 4);
    ctx.shadowColor = pal.hazard;
    ctx.shadowBlur = 10 + pulse * 10;
    ctx.fillStyle = pal.hazard;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    ctx.shadowBlur = 0;
  }
}

/** A region where gravity and energy drain are amplified while inside. */
export class GravityZone {
  readonly box: AABB;

  constructor(d: ZoneDef) {
    this.box = { x: d.tx * TILE, y: d.ty * TILE, w: d.w * TILE, h: d.h * TILE };
  }

  contains(px: number, py: number): boolean {
    return (
      px >= this.box.x &&
      px <= this.box.x + this.box.w &&
      py >= this.box.y &&
      py <= this.box.y + this.box.h
    );
  }

  overlaps(box: AABB): boolean {
    return aabbOverlap(box, this.box);
  }

  render(ctx: CanvasRenderingContext2D, ox: number, oy: number, pal: Palette, time: number): void {
    const x = this.box.x - ox;
    const y = this.box.y - oy;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2);
    ctx.save();
    ctx.fillStyle = pal.hazard;
    ctx.globalAlpha = 0.08 + pulse * 0.05;
    ctx.fillRect(x, y, this.box.w, this.box.h);
    // Downward arrows to signal "heavier here".
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = pal.hazard;
    ctx.lineWidth = 2;
    for (let ax = x + 24; ax < x + this.box.w - 10; ax += 48) {
      for (let ay = y + 24; ay < y + this.box.h - 10; ay += 48) {
        ctx.beginPath();
        ctx.moveTo(ax, ay - 7);
        ctx.lineTo(ax, ay + 7);
        ctx.moveTo(ax - 5, ay + 2);
        ctx.lineTo(ax, ay + 7);
        ctx.lineTo(ax + 5, ay + 2);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = pal.hazard;
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x + 1, y + 1, this.box.w - 2, this.box.h - 2);
    ctx.setLineDash([]);
    ctx.restore();
  }
}
