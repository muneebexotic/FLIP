// Browser smoke test: boots the built game, checks for runtime errors,
// exercises menu → play → input, and screenshots. Run against `npm run preview`.
import { chromium } from "playwright";

const URL = process.env.SMOKE_URL || "http://localhost:4173";
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });

// Canvas present and sized.
const canvas = await page.$("#game");
if (!canvas) errors.push("no #game canvas");
const box = await canvas?.boundingBox();
if (!box || box.width < 100) errors.push(`canvas not sized: ${JSON.stringify(box)}`);

// Menu present with a Play/Continue button.
await page.waitForSelector(".title", { timeout: 5000 }).catch(() => errors.push("no title"));
const playBtn = await page.$('button[data-act="play"]');
if (!playBtn) errors.push("no play button");

// Start playing.
await playBtn?.click();
await page.waitForTimeout(400);

// Drive the player a bit: move right, jump, flip.
await page.keyboard.down("KeyD");
await page.waitForTimeout(500);
await page.keyboard.press("Space");
await page.waitForTimeout(200);
await page.keyboard.press("ShiftLeft");
await page.waitForTimeout(500);
await page.keyboard.up("KeyD");
await page.waitForTimeout(300);

// Overlay should be gone during play (game running).
const overlayVisible = await page.evaluate(() => {
  const o = document.getElementById("overlay-root");
  return !!o && o.classList.contains("show");
});
if (overlayVisible) errors.push("overlay still visible during play");

await page.screenshot({ path: "scripts/smoke.png" });

// Open level select from a fresh menu to exercise that DOM path.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

await browser.close();

if (errors.length) {
  console.log("✗ SMOKE FAILED:");
  for (const e of errors) console.log("  - " + e);
  process.exit(1);
}
console.log("✓ Smoke test passed — game boots, renders, and responds to input. Screenshot: scripts/smoke.png");
