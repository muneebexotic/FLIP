import { VIEW } from "../config";
import type { Palette } from "../config";
import { clamp, lerp } from "../core/math";

interface Crumb {
  x: number;
  y: number;
}

/**
 * The Encroaching Dark — "Hunter v2". It is NOT a monster that chases you; it is
 * the void eating the level behind you. A vertical wall of pure black (`darkX`)
 * advances from the left at an accelerating pace and only ever moves forward —
 * relentless, it never falls behind. Everything left of it is consumed; when it
 * reaches you, you die. That is the inevitable metronome.
 *
 * The skill hook is the *reactive surge*: mistakes — dawdling, backtracking —
 * make the dark lunge forward, while a clean flip (the core mechanic) and forward
 * momentum buy breathing room. So flipping *well* is what keeps you alive.
 *
 * You rarely see a body. Two eyes open at the leading edge and track you; the
 * full shape only lunges on a near-catch. Because you run left→right with the
 * camera following, the dark lives at the left edge — felt (vignette, heartbeat,
 * a low drone on the reveal) more than seen. Pure vector + synth, no assets.
 */
export class Hunter {
  /** Leading edge of the dark, in world x. Monotonically non-decreasing. */
  darkX = 0;
  private prevDarkX = 0;
  /** False during the calm reveal delay, true once the dark has woken. */
  started = false;
  caught = false;

  private crumbs: Crumb[] = [];
  private revealT = 0; // counts up to revealDelay during the calm intro
  private elapsed = 0; // time since it woke (drives acceleration)
  private surge = 0; // 0..1 extra pressure from mistakes; decays on its own
  private stillT = 0; // how long the player has dawdled while grounded
  private lungeT = 0; // near-catch lunge telegraph, 0..1
  private px = 0; // last player center (for eyes / lunge aim)
  private py = 0;
  private lastPx = 0; // for backtrack detection
  private edgeY = 0; // smoothed eye height at the leading edge

  // ── Tuning (starting points — playtest, then tweak) ──
  private readonly revealDelay = 1.5; // s of calm before the dark wakes
  private readonly baseSpeed = 202; // px/s — just under a sustainable pace
  private readonly accel = 10; // px/s² — it closes in over time
  private readonly surgeBoost = 0.5; // +50% wall speed at full surge
  private readonly surgeDecay = 1.6; // surge falls to ~0 over ~0.6 s
  private readonly spawnLead = 560; // starts this far behind you — just off-screen left
  private readonly dreadRange = 480; // gap over which dread ramps 1 → 0
  private readonly killMargin = 13; // player half-width: left edge reaching darkX = death

  reset(cx: number, cy: number): void {
    this.darkX = this.prevDarkX = cx - this.spawnLead;
    this.px = this.lastPx = cx;
    this.py = this.edgeY = cy;
    this.started = false;
    this.caught = false;
    this.revealT = 0;
    this.elapsed = 0;
    this.surge = 0;
    this.stillT = 0;
    this.lungeT = 0;
    this.crumbs = [{ x: cx, y: cy }];
  }

  private pushCrumb(x: number, y: number): void {
    const last = this.crumbs[this.crumbs.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > 8) {
      this.crumbs.push({ x, y });
      if (this.crumbs.length > 512) this.crumbs.shift();
    }
  }

  /**
   * Advance one physics step against the player's state.
   * @param flipped one-shot: the player flipped gravity this step (a clean flip
   *   relieves surge — the breather). `vx` / `grounded` drive mistake detection.
   * @returns true on the single frame the dark first wakes (host plays the reveal).
   */
  update(
    dt: number,
    px: number,
    py: number,
    vx: number,
    grounded: boolean,
    flipped: boolean,
  ): boolean {
    this.px = px;
    this.py = py;
    this.pushCrumb(px, py);

    // ── Calm before the storm: the dark holds off-screen, presence unfelt. ──
    if (!this.started) {
      this.revealT += dt;
      this.prevDarkX = this.darkX;
      this.lastPx = px;
      if (this.revealT >= this.revealDelay) {
        this.started = true;
        // Re-anchor just off the left edge from wherever you actually are now,
        // so the reveal reads the same no matter how far you ran during the calm.
        this.darkX = this.prevDarkX = px - this.spawnLead;
        return true; // wake cue this frame
      }
      return false;
    }

    this.elapsed += dt;

    // ── Reactive surge: mistakes feed it, it decays on its own ──
    // Hesitation: standing (near-)still while grounded lets the dark gather.
    if (grounded && Math.abs(vx) < 30) {
      this.stillT += dt;
      if (this.stillT > 0.22) {
        this.surge = Math.min(1, this.surge + 0.5);
        this.stillT = 0;
      }
    } else {
      this.stillT = 0;
    }
    // Backtracking: actively giving up ground toward the dark.
    if (px < this.lastPx - 0.5 && vx < -30) {
      this.surge = Math.min(1, this.surge + 2.2 * dt);
    }
    // Clean flip: the core skill buys breathing room (clears most surge).
    if (flipped) this.surge = Math.max(0, this.surge - 0.55);
    // Natural decay — playing forward lets the pressure fade.
    this.surge = Math.max(0, this.surge - this.surgeDecay * dt);

    // ── Advance the wall: accelerating, boosted by surge, forward-only. ──
    const speed = (this.baseSpeed + this.elapsed * this.accel) * (1 + this.surge * this.surgeBoost);
    this.prevDarkX = this.darkX;
    this.darkX += speed * dt;

    // Eyes glide toward the player's height at the leading edge.
    this.edgeY += (py - this.edgeY) * Math.min(1, dt * 6);

    // Near-catch lunge telegraph: the body strains forward when it's almost you.
    const gap = px - this.darkX;
    const near = gap < 120;
    this.lungeT = near ? Math.min(1, this.lungeT + dt * 3) : Math.max(0, this.lungeT - dt * 2);

    this.lastPx = px;
    return false;
  }

  /** 0 (far/safe) … 1 (the dark is on you). Gap-based, per the design. */
  dread(px: number): number {
    if (!this.started) return 0;
    return clamp(1 - (px - this.darkX) / this.dreadRange, 0, 1);
  }

  /** Contact death when the player's left edge reaches the dark. */
  caughtPlayer(px: number): boolean {
    if (!this.started || this.caught) return false;
    if (px - this.darkX <= this.killMargin) {
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
    const edgeX = lerp(this.prevDarkX, this.darkX, alpha) - ox; // screen x of the leading edge
    const H = VIEW.h;
    // Nothing to draw while the whole wall is off the left and not lunging.
    if (edgeX < -30 && this.lungeT <= 0) return;

    const d = this.dread(this.px);
    const wob = 6 + d * 12; // the edge writhes harder the nearer it gets

    // Soft bleed forward of the edge — the dark reaching into the world.
    const bleed = 90 + this.lungeT * 140;
    const bg = ctx.createLinearGradient(edgeX - 4, 0, edgeX + bleed, 0);
    bg.addColorStop(0, "rgba(0,0,0,1)");
    bg.addColorStop(0.35, "rgba(3,0,6,0.7)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(edgeX - 4, 0, bleed + 8, H);

    // Solid black body from the left screen edge to a jagged, breathing edge.
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.lineTo(-2, H + 2);
    const seg = 26;
    for (let y = H + 2; y >= -2; y -= seg) {
      const n = Math.sin(y * 0.07 + time * 3) + 0.5 * Math.sin(y * 0.021 - time * 2.2);
      ctx.lineTo(edgeX + n * wob, y);
    }
    ctx.closePath();
    ctx.fillStyle = "#000";
    ctx.fill();

    // Faint hazard-tinted rim so the edge reads as alive, not a static mask.
    ctx.strokeStyle = this.rgba(pal.hazard, 0.1 + d * 0.28);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes (and, on a near-catch, the straining shape) only when it's close.
    if (d > 0.12 || this.lungeT > 0) {
      this.renderEyes(ctx, edgeX, oy, pal, time, d);
    }
    ctx.shadowBlur = 0;
  }

  private renderEyes(
    ctx: CanvasRenderingContext2D,
    edgeX: number,
    oy: number,
    pal: Palette,
    time: number,
    d: number,
  ): void {
    const reach = this.lungeT;
    const faceX = edgeX + 8 + reach * 64; // eyes ride forward on a lunge
    const cyY = this.edgeY - oy;

    // On a hard lunge, a gaping black maw strains out ahead of the eyes.
    if (reach > 0.35) {
      const m = (reach - 0.35) / 0.65;
      ctx.save();
      ctx.shadowColor = pal.hazard;
      ctx.shadowBlur = 24 * m;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(edgeX - 4, cyY - 30 - m * 12);
      ctx.quadraticCurveTo(faceX + 22 * m, cyY, edgeX - 4, cyY + 30 + m * 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Two eyes at the leading edge, tracking the player (who is always to the
    // right, so the pupils sit forward and slide toward the player's height).
    const rBase = 3.4 + d * 2.2 + reach * 3;
    const sep = 9 + Math.sin(time * 2.4) * 1.4;
    const ly = this.py - this.edgeY;
    const lookY = clamp(ly / 60, -1, 1);
    const pupOff = Math.min(rBase * 0.5, 3);
    for (const s of [-1, 1]) {
      const ex = faceX + s * 1.5;
      const ey = cyY + s * sep;
      const blink = 0.85 + 0.15 * Math.sin(time * 5 + s);
      ctx.save();
      ctx.shadowColor = pal.hazard;
      ctx.shadowBlur = 14 + d * 16 + reach * 22;
      ctx.globalAlpha = blink;
      ctx.fillStyle = "#ff2b3d";
      ctx.beginPath();
      ctx.arc(ex, ey, rBase, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffe6ea";
      ctx.beginPath();
      ctx.arc(ex + pupOff, ey + lookY * pupOff, rBase * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private rgba(hex: string, a: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
}
