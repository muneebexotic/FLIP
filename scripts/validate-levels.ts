// Level validator — structural + solvability heuristics, per difficulty.
// Run: npm run validate
import { ENERGY_PROFILES, PHYS_PROFILES, TILE } from "../src/config.ts";
import type { Difficulty } from "../src/config.ts";
import { Level, Tile } from "../src/game/level.ts";
import { LEVEL_SETS, WORLD_NAMES, levelLabel } from "../src/game/levels.ts";
import { ZONE_DRAIN_MUL } from "../src/game/obstacles.ts";

const DIFFS: Difficulty[] = ["casual", "normal", "nightmare"];
let problems = 0;
let warnings = 0;
const fail = (l: string, m: string) => {
  problems++;
  console.log(`    ✗ ${l}: ${m}`);
};
const warn = (l: string, m: string) => {
  warnings++;
  console.log(`    ⚠ ${l}: ${m}`);
};

/** Maximal runs of a character in a row → list of [start,end] inclusive. */
function runs(row: string, pred: (c: string) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let s = -1;
  for (let i = 0; i <= row.length; i++) {
    if (i < row.length && pred(row[i])) {
      if (s < 0) s = i;
    } else if (s >= 0) {
      out.push([s, i - 1]);
      s = -1;
    }
  }
  return out;
}

/** BFS over non-solid cells (8-connected): is the goal reachable from spawn? */
function reachable(lvl: Level): boolean {
  const sx = Math.floor(lvl.spawn.x / TILE);
  const sy = Math.floor((lvl.spawn.y - 1) / TILE);
  const gx = Math.floor((lvl.goal.x + TILE / 2) / TILE);
  const gy = Math.floor((lvl.goal.y + TILE / 2) / TILE);
  const seen = new Set<number>();
  const q = [[sx, sy]];
  const key = (x: number, y: number) => y * lvl.cols + x;
  seen.add(key(sx, sy));
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === gx && y === gy) return true;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= lvl.cols || ny >= lvl.rows) continue;
        if (lvl.isSolid(nx, ny)) continue;
        const k = key(nx, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
  }
  return false;
}

for (const d of DIFFS) {
  const phys = PHYS_PROFILES[d];
  const en = ENERGY_PROFILES[d];
  const budget = en.max / en.drain; // seconds of flight per full tank
  const hopPad = 2 * Math.sqrt((2 * TILE) / phys.riseGravity); // up+down to clear a spike
  const crossTime = (len: number) => hopPad + (len * TILE) / phys.moveSpeed;
  const jumpable = d === "casual" ? 3 : 2;
  console.log(`\n══ ${d.toUpperCase()} — budget ${budget.toFixed(2)}s/flip, jumpable ≤${jumpable} ══`);

  LEVEL_SETS[d].forEach((def, idx) => {
    const label = `${levelLabel(idx)} ${def.name}`;
    const lvl = new Level(def);
    const flat = def.rows.join("");
    if ([...flat].filter((c) => c === "P").length !== 1) fail(label, "need exactly 1 spawn");
    if ([...flat].filter((c) => c === "G").length !== 1) fail(label, "need exactly 1 goal");

    const ceilRow = def.rows[1];
    const floorRow = def.rows[def.rows.length - 2];
    const baseRow = def.rows[def.rows.length - 1];
    const floorBaseRow = def.rows.length - 1;
    const W = lvl.cols;

    // Structural.
    const stx = Math.floor(lvl.spawn.x / TILE);
    const sty = Math.floor((lvl.spawn.y - 1) / TILE);
    if (lvl.tileAt(stx, sty) !== Tile.Empty) fail(label, "spawn inside solid/hazard");
    if (!lvl.isSolid(stx, sty + 1)) fail(label, "no floor under spawn");
    const gtx = Math.floor((lvl.goal.x + TILE / 2) / TILE);
    if (floorRow[gtx] === "^") fail(label, "goal on a spike");
    if (!reachable(lvl)) fail(label, "goal not reachable from spawn (walled off)");

    // Impassable columns (spike above AND below).
    for (let c = 0; c < W; c++) {
      if (ceilRow[c] === "^" && floorRow[c] === "^") fail(label, `col ${c} impassable (spikes both sides)`);
    }

    // Which columns are inside a gravity zone (drain amplified there).
    const inZone = (c: number) =>
      (def.zones ?? []).some((z) => c >= z.tx && c < z.tx + z.w);

    // Floor-spike flip crossings: energy budget + clear ceiling.
    for (const [a, b] of runs(floorRow, (c) => c === "^")) {
      const len = b - a + 1;
      if (len <= jumpable) continue;
      const eff = inZone(a) || inZone(b) ? budget / ZONE_DRAIN_MUL : budget;
      const ct = crossTime(len);
      if (ct > eff * 0.98) fail(label, `flip run ${a}-${b} (${len}t) ~${ct.toFixed(2)}s > budget ${eff.toFixed(2)}s`);
      else if (ct > eff * 0.85) warn(label, `flip run ${a}-${b} (${len}t) near limit (~${ct.toFixed(2)}s of ${eff.toFixed(2)}s)`);
      // Ceiling must be clear directly above the run (you ride the ceiling over a..b).
      for (let c = a; c <= b; c++) {
        if (ceilRow[c] === "^") {
          fail(label, `flip run ${a}-${b} blocked by ceiling spike at col ${c}`);
          break;
        }
      }
    }

    // Pits (open floor) wider than jumpable must be bridged by a moving platform.
    for (const [a, b] of runs(baseRow, (c) => c === ".")) {
      const width = b - a + 1;
      if (width <= jumpable) continue;
      const bridged = (def.movers ?? []).some(
        (m) =>
          m.axis === "h" &&
          m.ty === floorBaseRow &&
          m.tx <= a &&
          m.tx + m.range + m.w >= b + 1,
      );
      if (!bridged) fail(label, `pit ${a}-${b} (${width}t) has no bridging platform`);
    }

    // Entity bounds sanity.
    for (const m of def.movers ?? []) {
      const far = m.axis === "h" ? m.tx + m.range + m.w : m.tx + m.w;
      const farY = m.axis === "v" ? m.ty + m.range + m.h : m.ty + m.h;
      if (far > W || farY > lvl.rows || m.tx < 0 || m.ty < 0) fail(label, "mover leaves bounds");
    }
    for (const z of def.zones ?? []) {
      if (z.tx < 0 || z.ty < 0 || z.tx + z.w > W || z.ty + z.h > lvl.rows) fail(label, "zone leaves bounds");
    }

    const tags: string[] = [];
    if (def.movers?.length) tags.push(`${def.movers.length}▸`);
    if (def.saws?.length) tags.push(`${def.saws.length}~`);
    if (def.zones?.length) tags.push(`${def.zones.length}◇`);
    if (baseRow.includes("D")) tags.push("D");
    console.log(`  • ${label} — ${lvl.cols}×${lvl.rows} ${tags.join(" ") || "static"}`);
  });
}

console.log(
  `\n${problems === 0 ? "✓" : "✗"} ${problems} problem(s), ${warnings} warning(s) across ${DIFFS.length} difficulties.`,
);
process.exit(problems === 0 ? 0 : 1);
