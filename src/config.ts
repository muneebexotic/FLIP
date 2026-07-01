/**
 * Central tuning file. Every "feel" number lives here so the game can be
 * dialed in live with Vite HMR. Units: pixels and seconds (world space).
 */

/** Virtual render resolution. The canvas letterboxes to preserve this ratio. */
export const VIEW = { w: 960, h: 540 } as const;

/** One tile = one grid cell in a level's ASCII map. */
export const TILE = 40;

/** Fixed physics step. 120 Hz keeps collision crisp; render interpolates. */
export const FIXED_DT = 1 / 120;
/** Never simulate more than this per frame (prevents spiral-of-death). */
export const MAX_FRAME_DT = 0.25;

export const PHYS = {
  /** Horizontal top speed. */
  moveSpeed: 260,
  groundAccel: 2600,
  groundFriction: 2800,
  airAccel: 1900,
  airFriction: 650,

  /** Downward pull while falling (or rising without holding jump). */
  gravity: 2000,
  /** Softer pull while rising and holding jump → floatier, controllable arc. */
  riseGravity: 1350,
  maxFall: 920,

  /** Launch speed away from the floor. ~2.6 tiles of height under riseGravity. */
  jumpSpeed: 560,
  /** Multiplier applied to vertical velocity when jump is released early. */
  jumpCut: 0.45,

  /** Grace window to still jump just after leaving a ledge. */
  coyoteTime: 0.09,
  /** Grace window to buffer a jump pressed just before landing. */
  jumpBuffer: 0.1,

  /** Player collision box (a touch smaller than a tile for forgiving fit). */
  playerW: 26,
  playerH: 34,
} as const;

export const ENERGY = {
  max: 100,
  /** Drains per second while gravity is flipped. ~2.5s of flight per full tank. */
  drain: 40,
  /** Refills per second while grounded in normal gravity (fast). */
  recharge: 220,
  /** Below this fraction the meter pulses red as a warning. */
  warnFrac: 0.28,
} as const;

/** After this many deaths on a level we surface the "share your struggle" card. */
export const SHARE_DEATH_THRESHOLD = 8;

export interface Palette {
  name: string;
  bg: string;
  bgGrid: string;
  solid: string;
  solidEdge: string;
  player: string;
  playerFlip: string;
  accent: string; // energy / goal glow
  hazard: string;
  text: string;
}

/** Four worlds, each a distinct, high-contrast palette. */
export const PALETTES: Palette[] = [
  {
    name: "Dusk",
    bg: "#0b0d17",
    bgGrid: "#151a2e",
    solid: "#2b3a67",
    solidEdge: "#4a63a8",
    player: "#f5f7ff",
    playerFlip: "#7cf5ff",
    accent: "#7cf5ff",
    hazard: "#ff4d6d",
    text: "#e8ecff",
  },
  {
    name: "Ember",
    bg: "#170b0b",
    bgGrid: "#2a1414",
    solid: "#5c2626",
    solidEdge: "#a8432f",
    player: "#fff5ec",
    playerFlip: "#ffb347",
    accent: "#ffb347",
    hazard: "#ff2e63",
    text: "#ffe8d6",
  },
  {
    name: "Bloom",
    bg: "#0d1710",
    bgGrid: "#152a1c",
    solid: "#1f5c3a",
    solidEdge: "#2fa86a",
    player: "#f2fff5",
    playerFlip: "#7dffb0",
    accent: "#7dffb0",
    hazard: "#ff4d9d",
    text: "#dcffe8",
  },
  {
    name: "Void",
    bg: "#120b17",
    bgGrid: "#20142a",
    solid: "#3d2b67",
    solidEdge: "#7a4fd6",
    player: "#fbf5ff",
    playerFlip: "#c77dff",
    accent: "#c77dff",
    hazard: "#ff5470",
    text: "#f0e6ff",
  },
];
