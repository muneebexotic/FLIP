import { TILE } from "../config";
import type { AABB } from "../core/math";
import { Level } from "../game/level";

export interface Collision {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

const EPS = 0.001;

function tileSpan(lo: number, hiInclusive: number): [number, number] {
  return [Math.floor(lo / TILE), Math.floor((hiInclusive - EPS) / TILE)];
}

/**
 * Move an AABB horizontally by dx, resolving against solid tiles. Per physics
 * step the delta is far smaller than a tile, so simple snap-out resolution is
 * tunnel-proof. Mutates `box.x`.
 */
export function moveX(box: AABB, dx: number, level: Level): { left: boolean; right: boolean } {
  box.x += dx;
  let left = false;
  let right = false;
  const [ty0, ty1] = tileSpan(box.y, box.y + box.h);
  const [tx0, tx1] = tileSpan(box.x, box.x + box.w);

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!level.isSolid(tx, ty)) continue;
      if (dx > 0) {
        box.x = tx * TILE - box.w;
        right = true;
      } else if (dx < 0) {
        box.x = (tx + 1) * TILE;
        left = true;
      }
    }
  }
  return { left, right };
}

/** Move an AABB vertically by dy, resolving against solid tiles. Mutates `box.y`. */
export function moveY(box: AABB, dy: number, level: Level): { top: boolean; bottom: boolean } {
  box.y += dy;
  let top = false;
  let bottom = false;
  const [tx0, tx1] = tileSpan(box.x, box.x + box.w);
  const [ty0, ty1] = tileSpan(box.y, box.y + box.h);

  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (!level.isSolid(tx, ty)) continue;
      if (dy > 0) {
        box.y = ty * TILE - box.h;
        bottom = true;
      } else if (dy < 0) {
        box.y = (ty + 1) * TILE;
        top = true;
      }
    }
  }
  return { top, bottom };
}

/** True if the box currently overlaps any hazard tile. */
export function touchingHazard(box: AABB, level: Level): boolean {
  const [tx0, tx1] = tileSpan(box.x, box.x + box.w);
  const [ty0, ty1] = tileSpan(box.y, box.y + box.h);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (level.tileAt(tx, ty) === 2 /* Tile.Hazard */) {
        // Shrink the hazard hitbox slightly so a graze isn't a kill.
        const hx = tx * TILE + 6;
        const hy = ty * TILE + 6;
        if (
          box.x < hx + (TILE - 12) &&
          box.x + box.w > hx &&
          box.y < hy + (TILE - 12) &&
          box.y + box.h > hy
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Is a solid tile immediately in the given vertical direction (dir=+1 below, -1 above)? */
export function isGroundedDir(box: AABB, level: Level, dir: number): boolean {
  const probe: AABB = { x: box.x, y: box.y + dir * 2, w: box.w, h: box.h };
  const [tx0, tx1] = tileSpan(probe.x, probe.x + probe.w);
  const edgeY = dir > 0 ? probe.y + probe.h : probe.y;
  const ty = Math.floor((edgeY + (dir > 0 ? -EPS : EPS)) / TILE);
  for (let tx = tx0; tx <= tx1; tx++) {
    if (level.isSolid(tx, ty)) return true;
  }
  return false;
}
