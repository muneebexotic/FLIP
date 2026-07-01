import { TILE } from "../config";
import { aabbOverlap } from "../core/math";
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
 * Move an AABB horizontally by dx, resolving against solid tiles AND dynamic
 * solid AABBs (moving/disappearing platforms). Per physics step the delta is
 * far smaller than a tile, so simple snap-out resolution is tunnel-proof.
 */
export function moveX(
  box: AABB,
  dx: number,
  level: Level,
  solids: AABB[] = [],
): { left: boolean; right: boolean } {
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
  for (const s of solids) {
    if (!aabbOverlap(box, s)) continue;
    if (dx > 0) {
      box.x = s.x - box.w;
      right = true;
    } else if (dx < 0) {
      box.x = s.x + s.w;
      left = true;
    }
  }
  return { left, right };
}

/** Move an AABB vertically by dy, resolving against tiles + dynamic solids. */
export function moveY(
  box: AABB,
  dy: number,
  level: Level,
  solids: AABB[] = [],
): { top: boolean; bottom: boolean } {
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
  for (const s of solids) {
    if (!aabbOverlap(box, s)) continue;
    if (dy > 0) {
      box.y = s.y - box.h;
      bottom = true;
    } else if (dy < 0) {
      box.y = s.y + s.h;
      top = true;
    }
  }
  return { top, bottom };
}

/** True if the box overlaps any static hazard tile or dynamic hazard box. */
export function touchingHazard(box: AABB, level: Level, hazards: AABB[] = []): boolean {
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
  for (const h of hazards) {
    if (aabbOverlap(box, h)) return true;
  }
  return false;
}

/** Is a solid (tile or dynamic) immediately in the vertical direction (dir=+1 below, -1 above)? */
export function isGroundedDir(
  box: AABB,
  level: Level,
  dir: number,
  solids: AABB[] = [],
): boolean {
  const probe: AABB = { x: box.x, y: box.y + dir * 2, w: box.w, h: box.h };
  const [tx0, tx1] = tileSpan(probe.x, probe.x + probe.w);
  const edgeY = dir > 0 ? probe.y + probe.h : probe.y;
  const ty = Math.floor((edgeY + (dir > 0 ? -EPS : EPS)) / TILE);
  for (let tx = tx0; tx <= tx1; tx++) {
    if (level.isSolid(tx, ty)) return true;
  }
  for (const s of solids) {
    const horiz = box.x < s.x + s.w && box.x + box.w > s.x;
    if (!horiz) continue;
    if (dir > 0 && Math.abs(s.y - (box.y + box.h)) <= 2) return true;
    if (dir < 0 && Math.abs(s.y + s.h - box.y) <= 2) return true;
  }
  return false;
}
