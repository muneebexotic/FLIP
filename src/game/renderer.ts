import { TILE, VIEW } from "../config";
import type { Palette } from "../config";
import { clamp, lerp } from "../core/math";
import { Tile } from "./level";
import type { Level } from "./level";
import type { Player } from "./player";

/** Rounded-rect path helper. */
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

/** Fractional part in [0,1) — used to place parallax blobs deterministically. */
function fract(x: number): number {
  return x - Math.floor(x);
}

/** Draws the level, goal, and player in world space. HUD is drawn separately. */
export class Renderer {
  drawBackground(ctx: CanvasRenderingContext2D, pal: Palette, ox: number, oy: number): void {
    // Vertical gradient.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    grad.addColorStop(0, pal.bg);
    grad.addColorStop(1, pal.bgGrid);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    // Depth layers: soft blobs drifting slower than the world fake 2.5D depth
    // for cheap. Far layer barely moves; the mid layer moves a bit more.
    this.drawParallaxLayer(ctx, pal.solidEdge, ox, oy, 0.08, 330, 135, 0.06);
    this.drawParallaxLayer(ctx, pal.accent, ox, oy, 0.16, 250, 78, 0.05);

    // Parallax grid (moves slower than the world for depth).
    const p = 0.35;
    const gx = -((ox * p) % TILE);
    const gy = -((oy * p) % TILE);
    ctx.strokeStyle = pal.bgGrid;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = gx; x < VIEW.w; x += TILE) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIEW.h);
    }
    for (let y = gy; y < VIEW.h; y += TILE) {
      ctx.moveTo(0, y);
      ctx.lineTo(VIEW.w, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** One depth plane of soft blobs, placed deterministically so they don't
   *  flicker as the camera scrolls. `p` < 1 = further away (moves slower). */
  private drawParallaxLayer(
    ctx: CanvasRenderingContext2D,
    color: string,
    ox: number,
    oy: number,
    p: number,
    spacing: number,
    radius: number,
    alpha: number,
  ): void {
    const worldLeft = ox * p;
    const first = Math.floor(worldLeft / spacing) - 1;
    const last = Math.floor((worldLeft + VIEW.w) / spacing) + 1;
    for (let c = first; c <= last; c++) {
      const h1 = fract(Math.sin(c * 12.9898) * 43758.5453);
      const h2 = fract(Math.sin(c * 3.7431) * 15731.743);
      const sx = c * spacing - worldLeft + (h2 - 0.5) * spacing * 0.5;
      const sy = h1 * VIEW.h - oy * p * 0.6;
      const r = radius * (0.6 + h2 * 0.7);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, this.rgba(color, alpha));
      g.addColorStop(1, this.rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
  }

  private rgba(hex: string, a: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  drawLevel(
    ctx: CanvasRenderingContext2D,
    level: Level,
    pal: Palette,
    ox: number,
    oy: number,
    time: number,
  ): void {
    // Only iterate tiles in view for performance on big levels.
    const tx0 = Math.max(0, Math.floor(ox / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(oy / TILE) - 1);
    const tx1 = Math.min(level.cols - 1, Math.floor((ox + VIEW.w) / TILE) + 1);
    const ty1 = Math.min(level.rows - 1, Math.floor((oy + VIEW.h) / TILE) + 1);

    // Solids: fill, then highlight only exposed edges for clean silhouettes.
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (level.tileAt(tx, ty) !== Tile.Solid) continue;
        const x = tx * TILE - ox;
        const y = ty * TILE - oy;
        ctx.fillStyle = pal.solid;
        ctx.fillRect(x, y, TILE + 0.5, TILE + 0.5);
        ctx.strokeStyle = pal.solidEdge;
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (!level.isSolid(tx, ty - 1)) {
          ctx.moveTo(x, y + 1.5);
          ctx.lineTo(x + TILE, y + 1.5);
        }
        if (!level.isSolid(tx, ty + 1)) {
          ctx.moveTo(x, y + TILE - 1.5);
          ctx.lineTo(x + TILE, y + TILE - 1.5);
        }
        if (!level.isSolid(tx - 1, ty)) {
          ctx.moveTo(x + 1.5, y);
          ctx.lineTo(x + 1.5, y + TILE);
        }
        if (!level.isSolid(tx + 1, ty)) {
          ctx.moveTo(x + TILE - 1.5, y);
          ctx.lineTo(x + TILE - 1.5, y + TILE);
        }
        ctx.stroke();
      }
    }

    // Hazards: pulsing diamonds — orientation-agnostic "danger" read.
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (level.tileAt(tx, ty) !== Tile.Hazard) continue;
        const cx = tx * TILE + TILE / 2 - ox;
        const cy = ty * TILE + TILE / 2 - oy;
        const r = TILE * 0.34;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.shadowColor = pal.hazard;
        ctx.shadowBlur = 8 + pulse * 10;
        ctx.fillStyle = pal.hazard;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
        ctx.shadowBlur = 0;
      }
    }

    // Goal: pulsing concentric portal.
    const gl = level.goal;
    const gx = gl.x + gl.w / 2 - ox;
    const gy = gl.y + gl.h / 2 - oy;
    const gp = 0.5 + 0.5 * Math.sin(time * 3);
    ctx.save();
    ctx.shadowColor = pal.accent;
    ctx.shadowBlur = 18 + gp * 14;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 3;
    const gr = TILE * 0.5 + gp * 5;
    roundRect(ctx, gx - gr, gy - gr, gr * 2, gr * 2, 8);
    ctx.stroke();
    ctx.globalAlpha = 0.5 + gp * 0.5;
    ctx.fillStyle = pal.accent;
    roundRect(ctx, gx - gr * 0.4, gy - gr * 0.4, gr * 0.8, gr * 0.8, 5);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: Player,
    pal: Palette,
    ox: number,
    oy: number,
    alpha: number,
    deathT: number, // 0..1 death animation progress, or -1 if alive
  ): void {
    const px = lerp(player.prevX, player.box.x, alpha);
    const py = lerp(player.prevY, player.box.y, alpha);
    const w = player.box.w;
    const h = player.box.h;
    const cx = px + w / 2 - ox;
    const cy = py + h / 2 - oy;

    const flipped = player.gravDir < 0;
    const body = flipped ? pal.playerFlip : pal.player;

    if (deathT >= 0) {
      // Handled by particle shards in the game layer; draw nothing here.
      return;
    }

    // Motion trail: fading afterimages behind the body, stronger the faster you
    // move. Reads great on flips and fast runs; invisible when you're careful.
    const speed = Math.hypot(player.vx, player.vy);
    const trailStrength = clamp((speed - 150) / 300, 0, 1);
    if (trailStrength > 0.02 && player.trail.length > 1) {
      const n = player.trail.length;
      for (let i = 0; i < n - 1; i++) {
        const tp = player.trail[i];
        const f = i / n; // 0 oldest → ~1 newest
        ctx.globalAlpha = f * f * 0.3 * trailStrength;
        ctx.fillStyle = body;
        const s = 0.68 + f * 0.24;
        const tw = w * s;
        const th = h * s;
        roundRect(ctx, tp.x + (w - tw) / 2 - ox, tp.y + (h - th) / 2 - oy, tw, th, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Squash/stretch: squash preserves area. squash>1 => taller & thinner.
    const sy = player.squash;
    const sx = 1 / Math.sqrt(sy);
    const dw = w * sx;
    const dh = h * sy;

    ctx.save();
    ctx.translate(cx, cy);
    // Anchor the squash to the feet (the +gravDir side).
    const feetOffset = ((dh - h) / 2) * player.gravDir;
    ctx.translate(0, feetOffset);

    ctx.shadowColor = flipped ? pal.playerFlip : pal.accent;
    ctx.shadowBlur = flipped ? 20 : 8;
    ctx.fillStyle = body;
    roundRect(ctx, -dw / 2, -dh / 2, dw, dh, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Gravity chevron: a small arrow pointing toward the current floor.
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.85;
    const ay = player.gravDir * (dh * 0.18);
    const aw = dw * 0.26;
    ctx.beginPath();
    ctx.moveTo(-aw, ay - player.gravDir * aw * 0.7);
    ctx.lineTo(aw, ay - player.gravDir * aw * 0.7);
    ctx.lineTo(0, ay + player.gravDir * aw * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
