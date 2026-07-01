/**
 * Difficulty coordinator. A difficulty selects BOTH a physics/energy profile
 * (config.ts) and a level set (levels.ts); this module swaps them together and
 * persists the choice. Everything else reads the active difficulty from here.
 */
import { applyPhysics } from "./config";
import type { Difficulty } from "./config";
import { load, save } from "./core/storage";
import { applyLevelSet } from "./game/levels";

export type { Difficulty };

export interface DiffMeta {
  id: Difficulty;
  name: string;
  tagline: string;
  blurb: string;
  accent: string;
}

export const DIFFICULTIES: DiffMeta[] = [
  {
    id: "casual",
    name: "Casual",
    tagline: "Find your footing",
    blurb: "Generous energy and forgiving jumps. Learn to flip without the pressure.",
    accent: "#7dffb0",
  },
  {
    id: "normal",
    name: "Normal",
    tagline: "The intended run",
    blurb: "The game as designed. Every flip counts and the levels bite back.",
    accent: "#7cf5ff",
  },
  {
    id: "nightmare",
    name: "Nightmare",
    tagline: "No mercy",
    blurb: "Thin energy, unforgiving geometry. For players who want to suffer beautifully.",
    accent: "#ff5470",
  },
];

let current: Difficulty = "casual";

export function getDifficulty(): Difficulty {
  return current;
}

export function metaOf(d: Difficulty): DiffMeta {
  return DIFFICULTIES.find((x) => x.id === d) ?? DIFFICULTIES[0];
}

/** Set the active difficulty: swaps physics + level set and persists it. */
export function setDifficulty(d: Difficulty): void {
  current = d;
  applyPhysics(d);
  applyLevelSet(d);
  save("difficulty", d);
}

/** Apply the persisted (or default) difficulty at boot. Returns which one. */
export function initDifficulty(): Difficulty {
  const stored = load<Difficulty>("difficulty", "casual");
  const d: Difficulty = DIFFICULTIES.some((x) => x.id === stored) ? stored : "casual";
  setDifficulty(d);
  return d;
}
