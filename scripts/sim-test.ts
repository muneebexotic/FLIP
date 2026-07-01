// Headless engine test — runs the REAL Player + physics against levels with a
// scripted bot. Verifies collision, energy, win/death without a browser.
// Run: npm run simtest
import { FIXED_DT, TILE } from "../src/config.ts";
import { Player } from "../src/game/player.ts";
import { Level } from "../src/game/level.ts";
import { LEVELS } from "../src/game/levels.ts";
import type { Action } from "../src/core/input.ts";

class MockInput {
  axis = 0;
  private h = new Set<Action>();
  private p = new Set<Action>();
  private r = new Set<Action>();
  axisX() {
    return this.axis;
  }
  held(a: Action) {
    return this.h.has(a);
  }
  pressed(a: Action) {
    return this.p.has(a);
  }
  released(a: Action) {
    return this.r.has(a);
  }
  press(a: Action) {
    this.p.add(a);
    this.h.add(a);
  }
  release(a: Action) {
    if (this.h.has(a)) this.r.add(a);
    this.h.delete(a);
  }
  endFrame() {
    this.p.clear();
    this.r.clear();
  }
}

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.log(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
};

// ── Physics / mechanic unit checks (Level 1) ────────────────────────────────
{
  console.log("• Core mechanic checks");
  const lvl = new Level(LEVELS[0]);
  const p = new Player();
  const inp = new MockInput();
  p.reset(lvl.spawn.x, lvl.spawn.y);

  // Settles on the floor.
  for (let i = 0; i < 60; i++) {
    p.update(FIXED_DT, inp as any, lvl);
    inp.endFrame();
  }
  assert(p.grounded && Math.abs(p.vy) < 5, "player settles grounded on the floor");
  const restY = p.box.y;

  // Jump raises the player.
  inp.press("jump");
  for (let i = 0; i < 26; i++) {
    p.update(FIXED_DT, inp as any, lvl);
    inp.endFrame();
  }
  assert(p.box.y < restY - TILE, "jump lifts the player at least a tile");
  inp.release("jump");
  for (let i = 0; i < 120; i++) {
    p.update(FIXED_DT, inp as any, lvl);
    inp.endFrame();
  }
  assert(p.grounded, "player lands again after jumping");

  // Flip inverts gravity and drains energy.
  const e0 = p.energy;
  inp.press("flip");
  p.update(FIXED_DT, inp as any, lvl);
  inp.endFrame();
  for (let i = 0; i < 40; i++) {
    p.update(FIXED_DT, inp as any, lvl);
    inp.endFrame();
  }
  assert(p.gravDir === -1, "flip inverts gravity direction");
  assert(p.energy < e0, "energy drains while flipped");

  // Walking into spikes with no action kills the player.
  const p2 = new Player();
  const inp2 = new MockInput();
  p2.reset(lvl.spawn.x, lvl.spawn.y);
  inp2.axis = 1;
  let died = false;
  for (let i = 0; i < 1200 && !died; i++) {
    p2.update(FIXED_DT, inp2 as any, lvl);
    inp2.endFrame();
    if (!p2.alive) died = true;
  }
  assert(died, "walking into spikes is lethal");
}

// ── Scripted bot that plays a corridor level ────────────────────────────────
function floorRowOf(def: (typeof LEVELS)[number]): string {
  return def.rows[def.rows.length - 2];
}
function runAt(row: string, col: number): [number, number] | null {
  if (row[col] !== "^") return null;
  let a = col;
  let b = col;
  while (row[a - 1] === "^") a--;
  while (row[b + 1] === "^") b++;
  return [a, b];
}
function nextSpikeCol(row: string, from: number): number {
  for (let c = from; c < row.length; c++) if (row[c] === "^") return c;
  return -1;
}

/** Returns true if the bot reached the goal. */
function playLevel(index: number, maxSteps = 4000): { won: boolean; deaths: number } {
  const def = LEVELS[index];
  const lvl = new Level(def);
  const floor = floorRowOf(def);
  const ceil = def.rows[1];
  const p = new Player();
  const inp = new MockInput();
  p.reset(lvl.spawn.x, lvl.spawn.y);
  inp.axis = 1;
  let jumpHold = 0;
  let crossEndX = -1; // X to clear before flipping back down (set on flip-up)
  let deaths = 0;

  for (let step = 0; step < maxSteps; step++) {
    const frontX = p.box.x + p.box.w;
    const centerX = p.box.x + p.box.w / 2;
    const frontCol = Math.floor(frontX / TILE);

    // Manage variable-height jump hold.
    if (jumpHold > 0) {
      jumpHold--;
      if (jumpHold === 0) inp.release("jump");
    }

    if (p.gravDir < 0) {
      // Crossing on the ceiling. Drop back down once past the floor run, OR
      // early if a ceiling spike looms (design guarantees clear floor below it).
      const pastRun = crossEndX >= 0 && centerX > crossEndX + 18;
      const ceilAhead = nextSpikeCol(ceil, frontCol);
      const ceilThreat = ceilAhead >= 0 && ceilAhead * TILE <= frontX + 34;
      if (pastRun || ceilThreat) {
        inp.press("flip");
        crossEndX = -1;
      }
    } else {
      const ns = nextSpikeCol(floor, frontCol);
      if (ns >= 0) {
        const [a, b] = runAt(floor, ns)!;
        const len = b - a + 1;
        const spikeStartX = a * TILE;
        if (len <= 3) {
          // Hop: jump right before the spikes, held past apex for full height.
          if (
            p.grounded &&
            frontX >= spikeStartX - 26 &&
            frontX < spikeStartX + 6 &&
            jumpHold === 0
          ) {
            inp.press("jump");
            jumpHold = 55;
          }
        } else if (p.grounded && frontX >= spikeStartX - 64 && frontX < spikeStartX - 8) {
          // Flip up ~1.5 tiles early (rise from zero before reaching the teeth).
          inp.press("flip");
          crossEndX = (b + 1) * TILE;
        }
      }
    }

    p.update(FIXED_DT, inp as any, lvl);
    inp.endFrame();

    if (p.won) return { won: true, deaths };
    if (!p.alive) {
      if ((globalThis as any).DBG)
        console.log(
          `    died col ${Math.floor((p.box.x + p.box.w / 2) / TILE)} x=${p.box.x.toFixed(0)} y=${p.box.y.toFixed(0)} gdir=${p.gravDir} grounded=${p.grounded} energy=${p.energy.toFixed(0)}`,
        );
      deaths++;
      p.reset(lvl.spawn.x, lvl.spawn.y);
      inp.axis = 1;
      jumpHold = 0;
      if (deaths > 6) return { won: false, deaths };
    }
  }
  return { won: false, deaths };
}

console.log("\n• Bot playthrough (asserts on tutorial levels 1–2)");
(globalThis as any).DBG = true;
const r1 = playLevel(0);
(globalThis as any).DBG = false;
assert(r1.won, `Level 1 (Drop In) beaten by bot [deaths ${r1.deaths}]`);
(globalThis as any).DBG = true;
const r2 = playLevel(1);
(globalThis as any).DBG = false;
assert(r2.won, `Level 2 (Ceiling) beaten by bot [deaths ${r2.deaths}]`);

if ((globalThis as any).DEBUG_LEVEL !== undefined) {
  (globalThis as any).DBG = true;
  const di = (globalThis as any).DEBUG_LEVEL as number;
  console.log(`\nDEBUG level ${di} (${LEVELS[di].name}):`);
  playLevel(di);
  (globalThis as any).DBG = false;
}

console.log("\n• Bot attempt on all levels (informational — bot ≠ perfect player)");
let botWins = 0;
for (let i = 0; i < LEVELS.length; i++) {
  const r = playLevel(i);
  if (r.won) botWins++;
  console.log(`  ${r.won ? "✓" : "·"} ${LEVELS[i].name} ${r.won ? `(deaths ${r.deaths})` : "(bot could not solve)"}`);
}
console.log(`  bot solved ${botWins}/${LEVELS.length}`);

console.log(failures === 0 ? "\n✓ Engine simulation passed." : `\n✗ ${failures} assertion(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
