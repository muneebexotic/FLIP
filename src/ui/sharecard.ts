import type { Palette } from "../config";
import { formatTime } from "../game/hud";

export interface CardData {
  levelLabel: string; // "2-1"
  levelName: string;
  worldName: string;
  palette: Palette;
  timeSec: number;
  deaths: number;
  completed: boolean; // true = cleared, false = "struggling" card
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders a 1200×630 Open-Graph-sized share card. */
export function renderCard(data: CardData): HTMLCanvasElement {
  const W = 1200;
  const H = 630;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const pal = data.palette;

  // Background.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, pal.bg);
  grad.addColorStop(1, pal.bgGrid);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Faint grid.
  ctx.strokeStyle = pal.bgGrid;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Decorative hazards + player motif on the right.
  ctx.save();
  ctx.translate(980, 150);
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(i * 8, i * 78);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = pal.hazard;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-16, -16, 32, 32);
    ctx.restore();
  }
  ctx.restore();

  // Player token (rounded square + chevron).
  ctx.save();
  ctx.translate(150, 150);
  ctx.shadowColor = pal.accent;
  ctx.shadowBlur = 30;
  ctx.fillStyle = pal.playerFlip;
  roundRect(ctx, -34, -34, 68, 68, 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = pal.bg;
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.lineTo(18, -8);
  ctx.lineTo(0, 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Wordmark.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 130px system-ui, sans-serif";
  ctx.fillText("FLIP", 244, 200);
  ctx.fillStyle = pal.accent;
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.fillText("gravity is a suggestion", 250, 240);

  // Headline verdict.
  ctx.fillStyle = pal.text;
  ctx.font = "800 40px system-ui, sans-serif";
  const verdict = data.completed
    ? `Cleared ${data.worldName} ${data.levelLabel} — ${data.levelName}`
    : `Stuck on ${data.worldName} ${data.levelLabel} — ${data.levelName}`;
  ctx.fillText(verdict, 90, 350);

  // Stat blocks.
  const stats: Array<[string, string, boolean]> = data.completed
    ? [
        ["TIME", formatTime(data.timeSec), true],
        ["DEATHS", String(data.deaths), false],
      ]
    : [
        ["DEATHS", String(data.deaths), false],
        ["…AND COUNTING", "", false],
      ];

  let sx = 90;
  const sy = 400;
  for (const [k, v, good] of stats) {
    const bw = 340;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    roundRect(ctx, sx, sy, bw, 130, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(k, sx + 26, sy + 42);
    ctx.fillStyle = good ? pal.accent : "#ffffff";
    ctx.font = "800 64px ui-monospace, monospace";
    ctx.fillText(v, sx + 24, sy + 108);
    sx += bw + 30;
  }

  // Footer CTA.
  ctx.fillStyle = pal.accent;
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText("play free in your browser →", 90, 592);

  return c;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

export type ShareResult = "shared" | "downloaded" | "copied";

/**
 * Shares the run: native share sheet with the PNG on capable devices (mobile),
 * otherwise downloads the PNG and copies a ready-to-paste caption + link.
 */
export async function shareRun(data: CardData): Promise<ShareResult> {
  const canvas = renderCard(data);
  const blob = await toBlob(canvas);
  const url = location.href.split("?")[0].split("#")[0];
  const caption = data.completed
    ? `I cleared ${data.worldName} ${data.levelLabel} in FLIP — ${formatTime(
        data.timeSec,
      )}, ${data.deaths} deaths. Think you can flip better?`
    : `${data.deaths} deaths on ${data.worldName} ${data.levelLabel} in FLIP and I'm not done. Beat me:`;

  const file = new File([blob], "flip-run.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };

  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: caption, url });
      return "shared";
    } catch {
      /* user cancelled — fall through to download */
    }
  }

  // Desktop path: download the image + copy caption.
  const dl = document.createElement("a");
  dl.href = URL.createObjectURL(blob);
  dl.download = "flip-run.png";
  dl.click();
  setTimeout(() => URL.revokeObjectURL(dl.href), 4000);
  try {
    await navigator.clipboard.writeText(`${caption} ${url}`);
    return "copied";
  } catch {
    return "downloaded";
  }
}
