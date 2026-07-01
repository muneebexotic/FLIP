import { Level } from "./level";
import type { LevelDef } from "./level";

/**
 * Level authoring. Every level is a "corridor": a solid ceiling row on top, a
 * solid floor row on the bottom, and interior rows between. You cross floor
 * spikes by briefly FLIPPING up to the ceiling; ceiling spikes force you to
 * stay on the floor. Energy limits how long any single flip can last
 * (~2.5s ≈ ~9 tiles), so no continuous floor-spike run exceeds ~8 tiles, and
 * refuel gaps (clear floor) sit between long crossings.
 *
 * Legend: '#' solid  '^' hazard  'P' spawn  'G' goal  '.' empty.
 */
const S = (w: number) => "#".repeat(w);
const R = (s: string, w: number) => s.padEnd(w, ".");

/** Build a corridor: [ceiling, ceilSpikes, ...interior blanks, floorSpikes, floor]. */
function corridor(
  world: number,
  name: string,
  par: number,
  hint: string | undefined,
  w: number,
  interior: number,
  ceilRow: string,
  floorRow: string,
): LevelDef {
  const rows = [S(w), ceilRow, ...Array(interior).fill(""), floorRow, S(w)].map((r) =>
    R(r, w),
  );
  return { world, name, par, hint, rows };
}

// ─── World 1 · Dusk — learn to move, jump, and flip ─────────────────────────
const w1a = corridor(0, "Drop In", 7, "MOVE: A / D or ← →   •   JUMP: Space / W", 30, 4,
  "",
  ".P.........^^^....^^^.........G",
);

const w1b = corridor(0, "Ceiling", 10, "FLIP: Shift / S / ↓  — too wide to jump, so go up top", 32, 4,
  "",
  ".P..........^^^^^^..........G",
);

const w1c = corridor(0, "Weave", 15, "Spikes above force you down; spikes below force you up", 42, 4,
  "..................^^^^^",
  ".P......^^^^^..............^^^^^......G",
);

// ─── World 2 · Ember — energy management ────────────────────────────────────
const w2a = corridor(1, "Fuel", 15, "Watch your ENERGY — empty while flipped is instant death", 32, 4,
  "",
  ".P.....^^^^^^^^........G",
);

const w2b = corridor(1, "Skip", 20, "Two long crossings — land on the middle floor to refuel", 48, 4,
  "",
  ".P....^^^^^^........^^^^^^.......G",
);

const w2c = corridor(1, "Needle", 24, "Flip early — commit before you reach the teeth", 46, 4,
  "............^^^^.......^^^^",
  ".P.....^^^^.......^^^^.......^^^^....G",
);

// ─── World 3 · Bloom — bridges and heights ──────────────────────────────────
const w3a = corridor(2, "Chasm", 22, "One long bridge. The ceiling is your only way across.", 40, 4,
  "",
  ".P....^^^^^^^^^........G",
);

const w3b = corridor(2, "Steps", 30, "A taller room — flips cost more time up here", 44, 6,
  "",
  ".P.....^^^^^.......^^^^^.......^^^^....G",
);

const w3c = corridor(2, "Comb", 32, "Alternating teeth — no room to hesitate", 52, 4,
  "...........^^......^^......^^......^^",
  ".P....^^^^....^^^^....^^^^....^^^^....^^^^.....G",
);

// ─── World 4 · Void — everything, at once ───────────────────────────────────
const w4a = corridor(3, "Gauntlet", 38, "Everything you've learned. Good luck.", 54, 4,
  "............^^........^^........^^^",
  ".P...^^^^^^....^^^^^^....^^^^^^......^^^^^^....G",
);

const w4b = corridor(3, "Flicker", 42, "Refuel windows are tiny — spend energy exactly", 56, 3,
  "",
  ".P...^^^^^^....^^^^^^....^^^^^^....^^^^^^...G",
);

const w4c = corridor(3, "Ascension", 48, "The final run. Flip with everything you have.", 56, 4,
  "......................^^^....^^^",
  ".P...^^^^....^^^^^^^^....^^^^....^^^^^^^^...^^^^..G",
);

export const LEVELS: LevelDef[] = [
  w1a, w1b, w1c,
  w2a, w2b, w2c,
  w3a, w3b, w3c,
  w4a, w4b, w4c,
];

export const WORLD_NAMES = ["Dusk", "Ember", "Bloom", "Void"];

/** Human label like "1-2" (world-levelInWorld), 3 levels per world. */
export function levelLabel(index: number): string {
  const world = Math.floor(index / 3) + 1;
  const inWorld = (index % 3) + 1;
  return `${world}-${inWorld}`;
}

export function buildLevel(index: number): Level {
  const def = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
  return new Level(def);
}

export const LEVEL_COUNT = LEVELS.length;
