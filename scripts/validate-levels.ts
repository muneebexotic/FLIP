// Level validator — structural + solvability heuristics.
// Run: npm run validate   (bundled through esbuild so extensionless imports resolve)
import { LEVELS } from "../src/game/levels.ts";
import { Level, Tile } from "../src/game/level.ts";
import { ENERGY, PHYS, TILE } from "../src/config.ts";

const BUDGET = ENERGY.max / ENERGY.drain; // seconds a full tank of flip lasts
const CROSS_SPEED = PHYS.moveSpeed; // px/s horizontal
const JUMPABLE = 4; // floor-spike runs this short can be jumped (no flip needed)

let problems = 0;
const fail = (name: string, msg: string) => {
  problems++;
  console.log(`  ✗ ${name}: ${msg}`);
};
const warn = (name: string, msg: string) => console.log(`  ⚠ ${name}: ${msg}`);

function runs(row: string, ch: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= row.length; i++) {
    if (row[i] === ch) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

for (const def of LEVELS) {
  const label = `${def.name} (world ${def.world + 1})`;
  const lvl = new Level(def);
  const flat = def.rows.join("");
  const pCount = [...flat].filter((c) => c === "P").length;
  const gCount = [...flat].filter((c) => c === "G").length;
  console.log(`• ${label} — ${lvl.cols}×${lvl.rows}, par ${def.par}s${def.hint ? ", hint ✓" : ""}`);

  if (pCount !== 1) fail(label, `expected 1 spawn, found ${pCount}`);
  if (gCount !== 1) fail(label, `expected 1 goal, found ${gCount}`);

  // Corridor structure: ceil content = row 1, floor content = second-to-last.
  const ceilRow = def.rows[1];
  const floorRow = def.rows[def.rows.length - 2];
  const width = lvl.cols;

  // Spawn sits on the floor; goal is reachable air.
  const stx = Math.floor(lvl.spawn.x / TILE);
  const sty = Math.floor((lvl.spawn.y - 1) / TILE);
  if (lvl.tileAt(stx, sty) !== Tile.Empty) fail(label, "spawn is inside a solid/hazard");
  if (!lvl.isSolid(stx, sty + 1)) fail(label, "no floor under spawn");
  const gtx = Math.floor((lvl.goal.x + TILE / 2) / TILE);
  const gty = Math.floor((lvl.goal.y + TILE / 2) / TILE);
  if (lvl.tileAt(gtx, gty) === Tile.Solid) fail(label, "goal buried in a solid");
  if (floorRow[gtx] === "^") fail(label, "goal sits on a floor spike");

  // No column may have spikes both above and below (impassable).
  for (let c = 0; c < width; c++) {
    if (ceilRow[c] === "^" && floorRow[c] === "^") fail(label, `column ${c} is impassable (spikes above+below)`);
  }

  // Floor-spike crossings: must fit the energy budget and have clear ceiling.
  for (const [a, b] of runs(floorRow, "^")) {
    const len = b - a + 1;
    if (len <= JUMPABLE) continue; // jumpable, no flip required
    const crossTime = 0.9 + (len * TILE) / CROSS_SPEED; // up + down + across
    if (crossTime > BUDGET * 0.94) {
      fail(label, `floor run ${a}-${b} (${len} tiles) needs ~${crossTime.toFixed(2)}s flipped > budget ${BUDGET.toFixed(2)}s`);
    } else if (crossTime > BUDGET * 0.82) {
      warn(label, `floor run ${a}-${b} (${len} tiles) is near the energy limit (~${crossTime.toFixed(2)}s)`);
    }
    // Ceiling must be clear across the crossing (+1 tile margin) to land on.
    for (let c = Math.max(0, a - 1); c <= Math.min(width - 1, b + 1); c++) {
      if (ceilRow[c] === "^") {
        fail(label, `floor run ${a}-${b} is blocked by a ceiling spike at col ${c}`);
        break;
      }
    }
  }
}

console.log(
  problems === 0 ? `\n✓ All ${LEVELS.length} levels valid.` : `\n✗ ${problems} problem(s).`,
);
process.exit(problems === 0 ? 0 : 1);
