export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Move `a` toward `b` by at most `maxDelta`. */
export const approach = (a: number, b: number, maxDelta: number): number => {
  if (a < b) return Math.min(a + maxDelta, b);
  if (a > b) return Math.max(a - maxDelta, b);
  return b;
};

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Axis-aligned bounding box. */
export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const aabbOverlap = (a: AABB, b: AABB): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
