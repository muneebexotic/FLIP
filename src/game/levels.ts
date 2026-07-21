import type { Difficulty } from "../config";
import { Level } from "./level";
import type { LevelDef } from "./level";
import type { MoverDef, SawDef, ZoneDef } from "./obstacles";

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

/**
 * Extended corridor for Normal/Nightmare. floorRow legend adds:
 *   '_'  pit — no floor below, lethal fall
 *   'D'  disappearing platform at floor level
 * Moving platforms/hazards/gravity zones are supplied via `opts` (tile coords).
 * Row indices: ceiling content = 1, floor content (spikes) = interior+2,
 * floor surface = interior+3. The helpers below reference those.
 */
interface XOpts {
  movers?: MoverDef[];
  saws?: SawDef[];
  zones?: ZoneDef[];
}
function corridorX(
  world: number,
  name: string,
  par: number,
  hint: string | undefined,
  w: number,
  interior: number,
  ceilRow: string,
  floorRow: string,
  opts: XOpts = {},
): LevelDef {
  const fc = [...R(floorRow, w)];
  const content = fc.map((c) => (c === "^" || c === "P" || c === "G" ? c : ".")).join("");
  const base = fc.map((c) => (c === "_" ? "." : c === "D" ? "D" : "#")).join("");
  const rows = [S(w), R(ceilRow, w), ...Array(interior).fill(R("", w)), content, base];
  return { world, name, par, hint, rows, movers: opts.movers, saws: opts.saws, zones: opts.zones };
}

// Entity placement helpers (keep tile math in one place).
const ferry = (tx: number, w: number, range: number, speed: number, i: number, phase = 0): MoverDef =>
  ({ tx, ty: i + 3, w, h: 1, axis: "h", range, speed, phase });
const floorSaw = (tx: number, range: number, speed: number, i: number, phase = 0): SawDef =>
  ({ tx, ty: i + 2, axis: "h", range, speed, phase });
const ceilSaw = (tx: number, range: number, speed: number, phase = 0): SawDef =>
  ({ tx, ty: 1, axis: "h", range, speed, phase });
const zone = (tx: number, w: number, i: number): ZoneDef => ({ tx, ty: 1, w, h: i + 2 });

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

// ── Casual: the original 12 levels (untouched reference set). ────────────────
const CASUAL_LEVELS: LevelDef[] = [
  w1a, w1b, w1c,
  w2a, w2b, w2c,
  w3a, w3b, w3c,
  w4a, w4b, w4c,
];

// ═══ Normal — geometry that DEMANDS the harder physics (~1.34s/flip) ══════════
// Redesigned so difficulty comes from the layout, not just the numbers: long
// crossings near the energy limit, tiny refuel windows pinned by ceiling teeth,
// tight rooms, and ferries you chain straight into a flip. Floor runs ≤ 6.

// World 1 · Dusk — meet the tighter budget (no nets yet)
const nm1 = corridorX(0, "Slip", 11, "Tighter energy now. Cross clean or come up short.", 28, 3,
  "",
  ".P.....^^^^^....^^^^^....G",
);
const nm2 = corridorX(0, "Pinch", 15, "Ceiling teeth pin you down — refuel, then commit", 34, 3,
  "...........^^^......^^^",
  ".P....^^^^^....^^^^^....^^^^^...G",
);
const nm3 = corridorX(0, "Thread", 18, "Three tiles of rest. Spend energy exactly.", 32, 3,
  "...........^^^.....^^^",
  ".P....^^^^^...^^^^^...^^^^^...G",
);

// World 2 · Ember — ferries you chain straight into a flip
const nm4 = corridorX(1, "Ferry", 16, "Ride across, then flip — no pause between them", 26, 4,
  "",
  ".P....______...^^^^^..G",
  { movers: [ferry(6, 3, 3, 2.6, 4)] },
);
const nm5 = corridorX(1, "Tides", 22, "Two ferries out of sync, a crossing between", 40, 4,
  "..................^^^",
  ".P....____...^^^^^...____...G",
  { movers: [ferry(6, 2, 3, 2.8, 4), ferry(21, 2, 3, 2.8, 4, 0.5)] },
);
const nm6 = corridorX(1, "Relay", 24, "Ferry, long flip, ferry — hold your fuel", 42, 3,
  "",
  ".P....____...^^^^^^...____...G",
  { movers: [ferry(6, 2, 3, 3, 3), ferry(22, 2, 3, 3, 3)] },
);

// World 3 · Bloom — long crossings at the fuel limit
const nm7 = corridorX(2, "Lull", 26, "That last crossing is right at your limit", 40, 3,
  "...........^^^",
  ".P....^^^^^...____...^^^^^^..G",
  { movers: [ferry(14, 2, 3, 3, 3)] },
);
const nm8 = corridorX(2, "Cascade", 30, "Three ferries — read the rhythm, don't stall", 44, 4,
  "..........^^^",
  ".P...____...____...____...^^^^^.G",
  { movers: [ferry(5, 2, 2, 3, 4), ferry(12, 2, 2, 3, 4, 0.33), ferry(19, 2, 2, 3, 4, 0.66)] },
);
const nm9 = corridorX(2, "Vault", 32, "Short room, long teeth. Commit early.", 38, 3,
  "..............^^^",
  ".P...^^^^^..____..^^^^^..G",
  { movers: [ferry(12, 2, 3, 3, 3)] },
);

// World 4 · Void — everything Normal has, back to back
const nm10 = corridorX(3, "Onslaught", 40, "No more warm-ups", 48, 3,
  "............^^^.............^^^",
  ".P....^^^^^^...____...^^^^^^...____..G",
  { movers: [ferry(15, 2, 3, 3, 3), ferry(31, 2, 3, 3, 3)] },
);
const nm11 = corridorX(3, "Torrent", 44, "A comb with no rest. Flip, land, flip.", 48, 3,
  "..........^^^.....^^^.....^^^",
  ".P...^^^^^...^^^^^...^^^^^...^^^^^..G",
);
const nm12 = corridorX(3, "Reckoning", 52, "Everything you've learned, at the limit", 54, 3,
  ".............^^^...........^^^",
  ".P....^^^^^^..____..^^^^^^..____..^^^^^.G",
  { movers: [ferry(14, 2, 3, 3.2, 3), ferry(28, 2, 3, 3.2, 3, 0.5)] },
);

const NORMAL_LEVELS: LevelDef[] = [
  nm1, nm2, nm3,
  nm4, nm5, nm6,
  nm7, nm8, nm9,
  nm10, nm11, nm12,
];

// ═══ Nightmare — moving hazards, gravity zones, no mercy (~0.76s/flip) ════════
// Flip crossings ≤ 2 tiles; near-zero energy before floor contact in W3/W4.

// World 1 · Dusk (movers from the start)
const ng1 = corridorX(0, "Baptism", 12, "Nothing is safe here. Not even level one.", 30, 4,
  "",
  ".P...^^..____..^^..G",
  { movers: [ferry(9, 2, 2, 3, 4)] },
);
const ng2 = corridorX(0, "Freefall", 16, "Short flips only — you have no fuel to waste", 40, 4,
  "...........^^........^^",
  ".P...^^..^^..____..^^..^^..G",
  { movers: [ferry(13, 2, 2, 3.2, 4)] },
);
const ng3 = corridorX(0, "Sever", 20, "Flip and unflip in the same breath", 40, 3,
  ".......^^...^^...^^",
  ".P...^^...^^...^^...^^...G",
);

// World 2 · Ember (+ disappearing platforms)
const ng4 = corridorX(1, "Crumble", 20, "Those platforms won't wait. Keep moving.", 34, 4,
  "",
  ".P....DDDDDD....^^..G",
);
const ng5 = corridorX(1, "Lapse", 26, "Cross before it's gone", 42, 4,
  ".............^^",
  ".P...DDDD..^^..____..DDDD..G",
  { movers: [ferry(15, 2, 2, 3, 4)] },
);
const ng6 = corridorX(1, "Fracture", 30, "Disappearing steps over the void", 44, 3,
  "...........^^......^^",
  ".P...DD..^^..DD..^^..DD..G",
);

// World 3 · Bloom (+ moving hazards + gravity zones)
const ng7 = corridorX(2, "Sawmill", 34, "The spikes move now. Watch them.", 42, 4,
  "",
  ".P.....^^....^^....^^....G",
  { saws: [floorSaw(10, 3, 3, 4), floorSaw(22, 3, 3, 4, 0.5)] },
);
const ng8 = corridorX(2, "Heavy", 38, "Inside the field, everything drops — and drains — faster", 42, 4,
  ".............^^",
  ".P....^^...____...^^...^^..G",
  { movers: [ferry(11, 2, 2, 3, 4)], zones: [zone(18, 6, 4)] },
);
const ng9 = corridorX(2, "Grind", 42, "Moving teeth and a heavy field. Thread it.", 44, 3,
  "",
  ".P....^^...^^...^^...^^...G",
  { saws: [ceilSaw(9, 4, 3.5), floorSaw(20, 4, 3.5, 3)], zones: [zone(14, 5, 3)] },
);

// World 4 · Void (everything, tight 3-tile corridors)
const ng10 = corridorX(3, "Vice", 48, "Ceiling and floor, three tiles apart. Flip fast.", 48, 3,
  ".......^^...^^...^^...^^...^^",
  ".P...^^...^^...^^...^^...^^...G",
);
const ng11 = corridorX(3, "Collapse", 54, "Disappearing steps, moving spikes, a heavy field", 50, 3,
  "..............^^",
  ".P...DD..^^..DD..____..DD..^^.G",
  { movers: [ferry(17, 2, 2, 3.2, 3)], saws: [ceilSaw(6, 3, 3)], zones: [zone(20, 5, 3)] },
);
const ng12 = corridorX(3, "Apotheosis", 70, "Every mechanic. One path. No mercy.", 60, 3,
  ".........^^.......^^..........^^",
  ".P..^^..DDDD..^^..____..^^..DDDD..^^..G",
  {
    movers: [ferry(18, 2, 2, 3.4, 3)],
    saws: [floorSaw(6, 3, 4, 3), ceilSaw(28, 4, 4)],
    zones: [zone(22, 6, 3)],
  },
);

const NIGHTMARE_LEVELS: LevelDef[] = [
  ng1, ng2, ng3,
  ng4, ng5, ng6,
  ng7, ng8, ng9,
  ng10, ng11, ng12,
];

export const LEVEL_SETS: Record<Difficulty, LevelDef[]> = {
  casual: CASUAL_LEVELS,
  normal: NORMAL_LEVELS,
  nightmare: NIGHTMARE_LEVELS,
};

/** Active level set (live binding). Default = Casual so tooling/scripts match. */
export let LEVELS: LevelDef[] = CASUAL_LEVELS;
export let LEVEL_COUNT = CASUAL_LEVELS.length;

/** Swap the active level set for the chosen difficulty. */
export function applyLevelSet(d: Difficulty): void {
  LEVELS = LEVEL_SETS[d];
  LEVEL_COUNT = LEVELS.length;
}

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
