import type { Palette } from "../config";
import type { AABB } from "../core/math";
import { clamp, lerp } from "../core/math";

interface Crumb {
  x: number;
  y: number;
  gd: number;
}

/**
 * The Hunter. It does NOT pathfind — it retraces the exact breadcrumb trail the
 * player left (so it flips gravity where you flipped, rides ceilings where you
 * did). That's both fair and unsettling: it goes only where you proved you could
 * go. It sits coiled at the spawn for a head-start beat, then pursues, speeding
 * up the longer the level runs. Hesitate and it closes the gap; touch it and you
 * die. Distance to the player drives the on-screen "dread" (vignette + heartbeat).
 */
export class Hunter {
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  gd = 1;
  started = false;
  caught = false;

  private crumbs: Crumb[] = [];
  private cursor = 0;
  private startT = 0;
  private elapsed = 0;
  private px = 0; // last known player position (for the eye)
  private py = 0;
  private ghosts: Array<{ x: number; y: number }> = [];

  // Tuning.
  private readonly startDelay = 1.2; // head-start seconds before it moves
  private readonly baseSpeed = 232; // px/s (just under the player's top speed)
  private readonly accel = 6; // px/s² — the walls close in over time
  readonly killDist = 19; // center-to-center contact radius

  reset(cx: number, cy: number): void {
    this.x = this.prevX = cx;
    this.y = this.prevY = cy;
    this.px = cx;
    this.py = cy;
    this.gd = 1;
    this.started = false;
    this.caught = false;
    this.startT = 0;
    this.elapsed = 0;
    this.cursor = 0;
    this.crumbs = [{ x: cx, y: cy, gd: 1 }];
    this.ghosts = [];
  }

  private pushCrumb(x: number, y: number, gd: number): void {
    const last = this.crumbs[this.crumbs.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > 6) {
      this.crumbs.push({ x, y, gd });
    }
    // Keep the buffer bounded by dropping breadcrumbs already consumed.
    if (this.cursor > 240) {
      this.crumbs.splice(0, this.cursor);
      this.cursor = 0;
    }
  }

  update(dt: number, px: number, py: number, pgd: number): void {
    this.elapsed += dt;
    this.px = px;
    this.py = py;
    this.pushCrumb(px, py, pgd);

    this.prevX = this.x;
    this.prevY = this.y;

    if (!this.started) {
      this.startT += dt;
      if (this.startT >= this.startDelay) this.started = true;
      this.recordGhost();
      return;
    }

    const speed = this.baseSpeed + this.elapsed * this.accel;
    let budget = speed * dt;
    const c = this.crumbs;
    // Walk along the breadcrumb polyline, consuming this step's distance budget.
    while (budget > 0 && this.cursor < c.length) {
      const t = c[this.cursor];
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        this.x = t.x;
        this.y = t.y;
        this.gd = t.gd;
        budget -= d;
        if (this.cursor < c.length - 1) this.cursor++;
        else break; // caught up to the freshest crumb
      } else {
        this.x += (dx / d) * budget;
        this.y += (dy / d) * budget;
        budget = 0;
      }
    }
    this.recordGhost();
  }

  private recordGhost(): void {
    this.ghosts.push({ x: this.x, y: this.y });
    if (this.ghosts.length > 8) this.ghosts.shift();
  }

  /** 0 (far/safe) … 1 (right behind you). Drives dread effects. */
  dread(px: number, py: number): number {
    if (!this.started) return 0;
    const d = Math.hypot(px - this.x, py - this.y);
    return clamp(1 - d / 340, 0, 1);
  }

  caughtPlayer(box: AABB): boolean {
    if (!this.started || this.caught) return false;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    if (Math.hypot(cx - this.x, cy - this.y) < this.killDist) {
      this.caught = true;
      return true;
    }
    return false;
  }

  render(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    pal: Palette,
    alpha: number,
    time: number,
  ): void {
    const x = lerp(this.prevX, this.x, alpha) - ox;
    const y = lerp(this.prevY, this.y, alpha) - oy;
    const coiled = !this.started;
    const pulse = 0.5 + 0.5 * Math.sin(time * (coiled ? 4 : 9));
    const R = 17 + pulse * 2;

    // Red aura that dims the world around it.
    const aura = ctx.createRadialGradient(x, y, 0, x, y, 78);
    aura.addColorStop(0, this.rgba(pal.hazard, 0.32));
    aura.addColorStop(0.5, this.rgba(pal.hazard, 0.12));
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, 78, 0, Math.PI * 2);
    ctx.fill();

    // Afterimage smear.
    for (let i = 0; i < this.ghosts.length - 1; i++) {
      const g = this.ghosts[i];
      const a = (i / this.ghosts.length) * 0.28;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#07070c";
      ctx.beginPath();
      ctx.arc(g.x - ox, g.y - oy, R * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Jagged, breathing body — near-black with a red rim.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 1.7) * 0.15);
    ctx.shadowColor = pal.hazard;
    ctx.shadowBlur = 14 + pulse * 12;
    ctx.fillStyle = "#08080e";
    ctx.beginPath();
    const spikes = 9;
    for (let i = 0; i <= spikes; i++) {
      const ang = (i / spikes) * Math.PI * 2;
      const jag = R * (0.78 + 0.34 * Math.sin(ang * 3 + time * 6));
      const vx = Math.cos(ang) * jag;
      const vy = Math.sin(ang) * jag;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.rgba(pal.hazard, 0.85);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // A single eye that fixes on the player.
    const ex = this.px - this.x;
    const ey = this.py - this.y;
    const el = Math.hypot(ex, ey) || 1;
    const look = coiled ? 0 : Math.min(R * 0.34, el);
    const eyeX = (ex / el) * look;
    const eyeY = (ey / el) * look;
    ctx.shadowColor = pal.hazard;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ff2b3d";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, coiled ? 3.2 : 4.2 + pulse * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd0d5";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  private rgba(hex: string, a: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
}
