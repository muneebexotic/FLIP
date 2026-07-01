import { ENERGY, PHYS } from "../config";
import type { Input } from "../core/input";
import { approach, clamp } from "../core/math";
import type { AABB } from "../core/math";
import { isGroundedDir, moveX, moveY, touchingHazard } from "../engine/physics";
import type { Level } from "./level";

/** Shared no-alloc constants for the common (Casual, no-entity) path. */
const NO_AABB: AABB[] = [];
const UNIT_FIELD = { grav: 1, drain: 1 } as const;

/**
 * The player. Gravity direction is a signed value: +1 pulls "down" (normal),
 * -1 pulls "up" (flipped). "The floor" is always in the +gravDir direction, so
 * most logic is written relative to gravDir and works in either orientation.
 */
export class Player {
  box: AABB = { x: 0, y: 0, w: PHYS.playerW, h: PHYS.playerH };
  vx = 0;
  vy = 0;
  gravDir: 1 | -1 = 1;
  energy: number = ENERGY.max;
  grounded = false;
  facing: 1 | -1 = 1;
  alive = true;
  won = false;

  // Interpolation + juice.
  prevX = 0;
  prevY = 0;
  squash = 1; // >1 = stretched tall, <1 = squashed flat
  private coyote = 0;
  private jumpBuffer = 0;

  // One-shot events consumed by the Game layer each step (sfx / particles).
  ev = { jumped: false, landed: false, flipped: false, died: false, won: false };

  reset(spawnFeetX: number, spawnFeetY: number): void {
    // Pick up the active difficulty profile's hitbox each spawn.
    this.box.w = PHYS.playerW;
    this.box.h = PHYS.playerH;
    this.box.x = spawnFeetX - this.box.w / 2;
    this.box.y = spawnFeetY - this.box.h;
    this.vx = 0;
    this.vy = 0;
    this.gravDir = 1;
    this.energy = ENERGY.max;
    this.grounded = false;
    this.alive = true;
    this.won = false;
    this.facing = 1;
    this.squash = 1;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.prevX = this.box.x;
    this.prevY = this.box.y;
    this.clearEvents();
  }

  clearEvents(): void {
    this.ev.jumped = this.ev.landed = this.ev.flipped = this.ev.died = this.ev.won = false;
  }

  update(dt: number, input: Input, level: Level): void {
    if (!this.alive || this.won) return;
    this.prevX = this.box.x;
    this.prevY = this.box.y;

    // ---- Horizontal movement ----
    const ax = input.axisX();
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;
    const onGround = this.grounded;
    const accel = onGround ? PHYS.groundAccel : PHYS.airAccel;
    const friction = onGround ? PHYS.groundFriction : PHYS.airFriction;
    const target = ax * PHYS.moveSpeed;
    if (ax !== 0) {
      this.vx = approach(this.vx, target, accel * dt);
    } else {
      this.vx = approach(this.vx, 0, friction * dt);
    }

    // ---- Flip gravity ----
    if (input.pressed("flip")) {
      this.gravDir = (this.gravDir * -1) as 1 | -1;
      this.grounded = false;
      this.coyote = 0;
      this.squash = 0.7;
      this.ev.flipped = true;
    }

    // ---- Jump (coyote + buffer + variable height) ----
    if (input.pressed("jump")) this.jumpBuffer = PHYS.jumpBuffer;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      this.vy = -this.gravDir * PHYS.jumpSpeed;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.squash = 1.35;
      this.ev.jumped = true;
    }
    // Variable height: releasing jump while still rising cuts the arc short.
    const rising = this.vy * this.gravDir < 0;
    if (input.released("jump") && rising) {
      this.vy *= PHYS.jumpCut;
    }

    // ---- Dynamic entities (empty/no-op for Casual levels) ----
    const solids = level.hasEntities ? level.dynamicSolids() : NO_AABB;
    const hazards = level.saws.length ? level.dynamicHazards() : NO_AABB;

    // Ride moving platforms: if we were resting on one, move with it first.
    if (level.movers.length) this.rideMovers(level);

    // ---- Gravity (scaled inside gravity zones) ----
    const field = level.zones.length ? level.fieldAt(this.cx(), this.cy()) : UNIT_FIELD;
    const risingNow = this.vy * this.gravDir < 0;
    const g = (risingNow && input.held("jump") ? PHYS.riseGravity : PHYS.gravity) * field.grav;
    this.vy += this.gravDir * g * dt;
    // Clamp fall speed (in the +gravDir direction).
    if (this.vy * this.gravDir > PHYS.maxFall) this.vy = this.gravDir * PHYS.maxFall;

    // ---- Integrate + collide (tiles + dynamic solids) ----
    moveX(this.box, this.vx * dt, level, solids);
    const vhit = moveY(this.box, this.vy * dt, level, solids);
    const wasGrounded = this.grounded;
    // Landed if we hit a surface in the gravity direction; bonked if opposite.
    const hitFloor = this.gravDir > 0 ? vhit.bottom : vhit.top;
    const hitCeil = this.gravDir > 0 ? vhit.top : vhit.bottom;
    if (hitFloor) {
      this.vy = 0;
      this.grounded = true;
      this.coyote = PHYS.coyoteTime;
      if (!wasGrounded) {
        this.squash = 0.62;
        this.ev.landed = true;
      }
    } else {
      this.grounded = isGroundedDir(this.box, level, this.gravDir, solids);
      if (this.grounded) this.coyote = PHYS.coyoteTime;
    }
    if (hitCeil) this.vy = 0;

    // Standing on a disappearing platform starts its countdown.
    if (this.grounded && level.fallers.length) this.armFallers(level);

    // ---- Energy (the core mechanic; drain amplified inside gravity zones) ----
    // Flipping burns fuel the entire time gravity is inverted — ceilings are
    // NOT a refuel (keeps every flip a visible countdown). Refuel only when
    // grounded in normal gravity. Empty while flipped == death.
    if (this.gravDir < 0) {
      this.energy -= ENERGY.drain * field.drain * dt;
      if (this.energy <= 0) {
        this.energy = 0;
        this.die();
        return;
      }
    } else if (this.grounded) {
      this.energy = clamp(this.energy + ENERGY.recharge * dt, 0, ENERGY.max);
    }

    // ---- Squash/stretch decay ----
    this.squash = approach(this.squash, 1, 4 * dt);

    // ---- Lethal contact / out of bounds ----
    if (touchingHazard(this.box, level, hazards)) {
      this.die();
      return;
    }
    const margin = 80;
    if (
      this.box.y + this.box.h < -margin ||
      this.box.y > level.heightPx + margin ||
      this.box.x + this.box.w < -margin ||
      this.box.x > level.widthPx + margin
    ) {
      this.die();
      return;
    }

    // ---- Goal ----
    const gl = level.goal;
    if (
      this.box.x < gl.x + gl.w &&
      this.box.x + this.box.w > gl.x &&
      this.box.y < gl.y + gl.h &&
      this.box.y + this.box.h > gl.y
    ) {
      this.won = true;
      this.ev.won = true;
    }
  }

  /** If we were resting on a moving platform, translate with it (carry/push). */
  private rideMovers(level: Level): void {
    for (const m of level.movers) {
      if (m.dx === 0 && m.dy === 0) continue;
      // The platform's position BEFORE it moved this step.
      const px = m.box.x - m.dx;
      const py = m.box.y - m.dy;
      const horiz = this.box.x < px + m.box.w && this.box.x + this.box.w > px;
      if (!horiz) continue;
      const onTop = this.gravDir > 0 && Math.abs(py - (this.box.y + this.box.h)) <= 3;
      const onBottom = this.gravDir < 0 && Math.abs(py + m.box.h - this.box.y) <= 3;
      if (onTop || onBottom) {
        this.box.x += m.dx;
        this.box.y += m.dy;
        return; // ride only the first platform found
      }
    }
  }

  /** Arm any disappearing platform we're currently standing on. */
  private armFallers(level: Level): void {
    for (const f of level.fallers) {
      if (!f.solid) continue;
      const b = f.box;
      const horiz = this.box.x < b.x + b.w && this.box.x + this.box.w > b.x;
      if (!horiz) continue;
      const onTop = this.gravDir > 0 && Math.abs(b.y - (this.box.y + this.box.h)) <= 3;
      const onBottom = this.gravDir < 0 && Math.abs(b.y + b.h - this.box.y) <= 3;
      if (onTop || onBottom) f.arm();
    }
  }

  private die(): void {
    if (!this.alive) return;
    this.alive = false;
    this.ev.died = true;
  }

  /** Center point, useful for camera + particles. */
  cx(): number {
    return this.box.x + this.box.w / 2;
  }
  cy(): number {
    return this.box.y + this.box.h / 2;
  }
}
