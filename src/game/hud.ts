import { ENERGY, VIEW } from "../config";
import type { Palette } from "../config";
import { clamp } from "../core/math";

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const secStr = rem.toFixed(2).padStart(5, "0");
  return m > 0 ? `${m}:${secStr}` : secStr;
}

export interface HudState {
  energyFrac: number;
  time: number;
  deaths: number;
  levelLabel: string;
}

/** Screen-space HUD: energy meter (hero element), timer, deaths, level tag. */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  hud: HudState,
  time: number,
): void {
  ctx.save();
  ctx.textBaseline = "middle";

  // ---- Energy meter (top-center) ----
  const barW = Math.min(360, VIEW.w * 0.42);
  const barH = 16;
  const bx = (VIEW.w - barW) / 2;
  const by = 26;
  const frac = clamp(hud.energyFrac, 0, 1);
  const low = frac <= ENERGY.warnFrac;
  const pulse = low ? 0.6 + 0.4 * Math.sin(time * 18) : 1;

  // Track.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = pal.bgGrid;
  roundedBar(ctx, bx, by, barW, barH, barH / 2);
  ctx.globalAlpha = 1;

  // Fill.
  const fillColor = low ? pal.hazard : pal.accent;
  ctx.fillStyle = fillColor;
  ctx.shadowColor = fillColor;
  ctx.shadowBlur = 14 * pulse;
  if (frac > 0.001) roundedBar(ctx, bx, by, Math.max(barH, barW * frac), barH, barH / 2);
  ctx.shadowBlur = 0;

  // Border + label.
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = pal.solidEdge;
  ctx.lineWidth = 2;
  roundedBarStroke(ctx, bx, by, barW, barH, barH / 2);
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.text;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.85;
  ctx.fillText("ENERGY", VIEW.w / 2, by - 9);
  ctx.globalAlpha = 1;

  // ---- Timer (top-left) ----
  ctx.textAlign = "left";
  ctx.fillStyle = pal.text;
  ctx.font = "700 24px ui-monospace, 'SF Mono', Menlo, monospace";
  ctx.fillText(formatTime(hud.time), 22, 34);

  // ---- Deaths + level (top-right) ----
  ctx.textAlign = "right";
  ctx.font = "700 20px ui-monospace, monospace";
  ctx.fillStyle = pal.hazard;
  ctx.fillText(`☠ ${hud.deaths}`, VIEW.w - 22, 30);
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillStyle = pal.text;
  ctx.globalAlpha = 0.7;
  ctx.fillText(hud.levelLabel, VIEW.w - 22, 50);
  ctx.globalAlpha = 1;

  ctx.restore();
}

function roundedBar(
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
  ctx.fill();
}
function roundedBarStroke(
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
  ctx.stroke();
}
