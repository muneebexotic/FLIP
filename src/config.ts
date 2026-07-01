/**
 * Central tuning. Physics/energy are grouped into per-difficulty PROFILES.
 * `PHYS` and `ENERGY` are live bindings pointing at the active profile — every
 * consumer reads them by property access, so `applyPhysics()` swaps the whole
 * game's feel at once. Casual is the original, shipped tuning (untouched).
 * Units: pixels and seconds (world space).
 */

/** Virtual render resolution. The canvas letterboxes to preserve this ratio. */
export const VIEW = { w: 960, h: 540 } as const;

/** One tile = one grid cell in a level's ASCII map. */
export const TILE = 40;

/** Fixed physics step. 120 Hz keeps collision crisp; render interpolates. */
export const FIXED_DT = 1 / 120;
/** Never simulate more than this per frame (prevents spiral-of-death). */
export const MAX_FRAME_DT = 0.25;

/** After this many deaths on a level we surface the "share your struggle" card. */
export const SHARE_DEATH_THRESHOLD = 8;

export type Difficulty = "casual" | "normal" | "nightmare";

export interface PhysConfig {
  readonly moveSpeed: number;
  readonly groundAccel: number;
  readonly groundFriction: number;
  readonly airAccel: number;
  readonly airFriction: number;
  readonly gravity: number;
  readonly riseGravity: number;
  readonly maxFall: number;
  readonly jumpSpeed: number;
  readonly jumpCut: number;
  readonly coyoteTime: number;
  readonly jumpBuffer: number;
  readonly playerW: number;
  readonly playerH: number;
}

export interface EnergyConfig {
  readonly max: number;
  readonly drain: number;
  readonly recharge: number;
  readonly warnFrac: number;
}

// ── Casual: the original tuning. Do not change — it is the reference profile. ──
const CASUAL_PHYS: PhysConfig = {
  moveSpeed: 260,
  groundAccel: 2600,
  groundFriction: 2800,
  airAccel: 1900,
  airFriction: 650,
  gravity: 2000,
  riseGravity: 1350,
  maxFall: 920,
  jumpSpeed: 560,
  jumpCut: 0.45,
  coyoteTime: 0.09,
  jumpBuffer: 0.1,
  playerW: 26,
  playerH: 34,
};

const CASUAL_ENERGY: EnergyConfig = {
  max: 100,
  drain: 40,
  recharge: 220,
  warnFrac: 0.28,
};

// ── Normal & Nightmare: placeholders that CLONE Casual until real tuning is
//    provided. The difficulty is still tagged everywhere (leaderboard, share
//    card), so the plumbing is live; only the numbers below change later. ──
const NORMAL_PHYS: PhysConfig = { ...CASUAL_PHYS }; // TODO: Normal physics
const NORMAL_ENERGY: EnergyConfig = { ...CASUAL_ENERGY }; // TODO: Normal energy
const NIGHTMARE_PHYS: PhysConfig = { ...CASUAL_PHYS }; // TODO: Nightmare physics
const NIGHTMARE_ENERGY: EnergyConfig = { ...CASUAL_ENERGY }; // TODO: Nightmare energy

export const PHYS_PROFILES: Record<Difficulty, PhysConfig> = {
  casual: CASUAL_PHYS,
  normal: NORMAL_PHYS,
  nightmare: NIGHTMARE_PHYS,
};
export const ENERGY_PROFILES: Record<Difficulty, EnergyConfig> = {
  casual: CASUAL_ENERGY,
  normal: NORMAL_ENERGY,
  nightmare: NIGHTMARE_ENERGY,
};

/** Active profiles (live bindings). Default = Casual so tooling/scripts match. */
export let PHYS: PhysConfig = CASUAL_PHYS;
export let ENERGY: EnergyConfig = CASUAL_ENERGY;

/** Swap the active physics/energy profile. Call before starting a level. */
export function applyPhysics(d: Difficulty): void {
  PHYS = PHYS_PROFILES[d];
  ENERGY = ENERGY_PROFILES[d];
}

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
