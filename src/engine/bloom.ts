/**
 * Cheap neon bloom, pure Canvas 2D — no WebGL, no dependency.
 *
 * After the scene is drawn, we take a blurred copy of the whole frame and add it
 * back on top with a `lighter` (additive) blend. Because the game is dark with
 * bright glowing accents, the near-black areas add ~nothing while the bright
 * shapes bleed a soft halo — i.e. bloom. Strength/blur are tunable; a WebGL
 * threshold+downsample pass would be sharper/faster but this proves the look and
 * ships in a few lines. Experimental: gated by a `?bloom` URL param in main.ts.
 */
let off: HTMLCanvasElement | null = null;
let offCtx: CanvasRenderingContext2D | null = null;

export function applyBloom(ctx: CanvasRenderingContext2D, strength = 0.55, blur = 9): void {
  const c = ctx.canvas;
  if (!off || off.width !== c.width || off.height !== c.height) {
    off = document.createElement("canvas");
    off.width = c.width;
    off.height = c.height;
    offCtx = off.getContext("2d");
  }
  if (!offCtx) return;

  // Blurred copy of the current frame (device-pixel space).
  offCtx.clearRect(0, 0, off.width, off.height);
  offCtx.filter = `blur(${blur}px)`;
  offCtx.drawImage(c, 0, 0);
  offCtx.filter = "none";

  // Add the halo back over the crisp scene, ignoring any world transform.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = strength;
  ctx.drawImage(off, 0, 0);
  ctx.restore(); // restores transform, alpha, and composite mode
}
