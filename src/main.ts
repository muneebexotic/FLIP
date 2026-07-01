import "./styles.css";
import { SHARE_DEATH_THRESHOLD, VIEW } from "./config";
import type { Action } from "./core/input";
import { GameLoop } from "./core/loop";
import { Game } from "./game/game";
import type { RunStats } from "./game/game";
import { AppUI } from "./ui/screens";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;

const isTouch =
  window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

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

const ui = new AppUI({
  playLevel: (index: number) => startLevel(index),
  resume: () => ui.enterPlay(isTouch),
  restart: () => startLevel(game.currentLevelIndex()),
  toMenu: () => gotoMenu(),
});

function startLevel(index: number): void {
  game.loadLevel(index);
  ui.enterPlay(isTouch);
}

function gotoMenu(): void {
  game.setIdle();
  ui.showMenu();
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
  },
);

// Boot: load level 0 as an ambient backdrop, then show the menu.
game.loadLevel(0);
game.setIdle();
ui.showMenu();
loop.start();

// First user gesture unlocks audio (browsers require it).
const kickAudio = () => {
  window.removeEventListener("pointerdown", kickAudio);
  window.removeEventListener("keydown", kickAudio);
};
window.addEventListener("pointerdown", kickAudio);
window.addEventListener("keydown", kickAudio);
