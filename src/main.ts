import "./styles.css";
import { SHARE_DEATH_THRESHOLD, VIEW } from "./config";
import type { Difficulty } from "./config";
import { initDifficulty, setDifficulty } from "./difficulty";
import type { Action } from "./core/input";
import { GameLoop } from "./core/loop";
import { applyBloom, bloomStrength, initBloom, isBloomOn, setBloomOn } from "./engine/bloom";
import { Game } from "./game/game";
import type { RunStats } from "./game/game";
import { AppUI } from "./ui/screens";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;

const isTouch =
  window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

// Neon bloom is a persisted setting (toggle in the HUD): on by default on
// desktop, off on touch for perf. ?bloom=1 / ?bloom=0 override for a session.
initBloom(!isTouch);
const bloomParam = new URLSearchParams(location.search).get("bloom");
if (bloomParam !== null) setBloomOn(bloomParam !== "0");
const bloomBlur = isTouch ? 6 : 8;

// ── Canvas sizing: fit VIEW into the window, crisp at device resolution ──────
let renderScale = 1;
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const fit = Math.min(window.innerWidth / VIEW.w, window.innerHeight / VIEW.h);
  const cssW = Math.floor(VIEW.w * fit);
  const cssH = Math.floor(VIEW.h * fit);
  renderScale = fit * dpr;
  canvas.width = Math.round(VIEW.w * renderScale);
  canvas.height = Math.round(VIEW.h * renderScale);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 120));
resize();

// ── Wire game + UI ───────────────────────────────────────────────────────────
const game = new Game();

// Dev/playtest: ?invade forces the (normally rare, unannounced) invasion — the
// dark turning on you mid-run — on every eligible level, so it can be tried on
// demand. Off by default; production stays rare.
const invadeParam = new URLSearchParams(location.search).get("invade");
game.setInvasionTesting(invadeParam !== null && invadeParam !== "0");

const ui = new AppUI({
  playLevel: (index: number) => startLevel(index),
  resume: () => ui.enterPlay(isTouch),
  restart: () => startLevel(game.currentLevelIndex()),
  toMenu: () => gotoMenu(),
  chooseDifficulty: (d: Difficulty) => applyDifficulty(d),
  setHunted: (on: boolean) => game.setHunted(on),
});

function startLevel(index: number): void {
  game.loadLevel(index);
  ui.enterPlay(isTouch);
}

function gotoMenu(): void {
  game.setIdle();
  ui.showMenu();
}

function applyDifficulty(d: Difficulty): void {
  // Swaps physics + level set, then refreshes the idle backdrop from the new set.
  setDifficulty(d);
  game.loadLevel(0);
  game.setIdle();
}

game.onWin = (stats: RunStats) => ui.showResults(stats);
game.onDeath = (deaths: number) => {
  if (deaths === SHARE_DEATH_THRESHOLD) {
    ui.offerStruggleShare({
      levelIndex: game.currentLevelIndex(),
      timeSec: 0,
      deaths,
    });
  }
};

// Touch buttons → input.
ui.bindTouch(
  (k) => game.input.press(k as Action),
  (k) => game.input.release(k as Action),
);

// ── Main loop: simulate only when no menu overlay is up ──────────────────────
const loop = new GameLoop(
  (dt) => {
    if (!ui.isOverlayVisible()) game.update(dt);
    // Consume per-step input edges every step (also drains menu key presses).
    game.input.endFrame();
  },
  (alpha) => {
    ctx.save();
    ctx.clearRect(0, 0, VIEW.w, VIEW.h);
    game.render(ctx, alpha);
    ctx.restore();
    if (isBloomOn()) applyBloom(ctx, bloomStrength(), bloomBlur);
  },
);

// Boot: apply the persisted (or default) difficulty, show an ambient backdrop,
// then gate on the difficulty-select screen before the game starts.
initDifficulty();
game.loadLevel(0);
game.setIdle();
ui.showDifficultySelect();
loop.start();

// First user gesture unlocks audio (browsers require it).
const kickAudio = () => {
  window.removeEventListener("pointerdown", kickAudio);
  window.removeEventListener("keydown", kickAudio);
};
window.addEventListener("pointerdown", kickAudio);
window.addEventListener("keydown", kickAudio);
