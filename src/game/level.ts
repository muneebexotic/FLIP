import { TILE } from "../config";
import type { AABB } from "../core/math";
import {
  Faller,
  GravityZone,
  MovingPlatform,
  Saw,
  ZONE_DRAIN_MUL,
  ZONE_GRAVITY_MUL,
} from "./obstacles";
import type { MoverDef, SawDef, ZoneDef } from "./obstacles";

export const enum Tile {
  Empty = 0,
  Solid = 1,
  Hazard = 2,
}

export interface LevelDef {
  /** 0-based world index (selects palette). */
  world: number;
  name: string;
  /** Designer's target time in seconds — used as the "par" on the results screen. */
  par: number;
  /** Optional one-line coaching shown briefly at the start of the level. */
  hint?: string;
  /** ASCII rows. Legend below. All rows should be equal length. */
  rows: string[];
  /** Moving platforms (metadata, tile coordinates). */
  movers?: MoverDef[];
  /** Moving hazards (metadata, tile coordinates). */
  saws?: SawDef[];
  /** Gravity zones (metadata, tile regions). */
  zones?: ZoneDef[];
}

/**
 * ASCII legend:
 *   '#'  solid block
 *   '^'  hazard (spike) — lethal on contact
 *   'D'  disappearing platform (flashes, vanishes, returns)
 *   'P'  player spawn (feet position, normal gravity)
 *   'G'  goal
 *   '.' or ' '  empty
 * Moving platforms ('M'), moving hazards ('~') and gravity zones live in the
 * level's `movers` / `saws` / `zones` metadata (tile coordinates), since they
 * carry motion/region parameters a single glyph can't express.
 */
export class Level {
  readonly cols: number;
  readonly rows: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly spawn: { x: number; y: number };
  readonly goal: AABB;
  readonly movers: MovingPlatform[];
  readonly fallers: Faller[] = [];
  readonly saws: Saw[];
  readonly zones: GravityZone[];
  private grid: Uint8Array;

  constructor(readonly def: LevelDef) {
    const rows = def.rows;
    this.rows = rows.length;
    this.cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    this.widthPx = this.cols * TILE;
    this.heightPx = this.rows * TILE;
    this.grid = new Uint8Array(this.cols * this.rows);

    let spawn = { x: TILE * 2, y: TILE * 2 };
    let goal: AABB = { x: this.widthPx - TILE * 2, y: TILE, w: TILE, h: TILE };

    for (let ty = 0; ty < this.rows; ty++) {
      const row = rows[ty];
      let dRunStart = -1; // track horizontal runs of 'D' → one faller platform
      for (let tx = 0; tx <= this.cols; tx++) {
        const ch = row[tx] ?? ".";
        // Close a disappearing-platform run when the run ends.
        if (ch !== "D" && dRunStart >= 0) {
          this.fallers.push(new Faller(dRunStart, ty, tx - dRunStart, 1));
          dRunStart = -1;
        }
        if (tx >= this.cols) break;
        const idx = ty * this.cols + tx;
        switch (ch) {
          case "#":
            this.grid[idx] = Tile.Solid;
            break;
          case "^":
            this.grid[idx] = Tile.Hazard;
            break;
          case "D":
            if (dRunStart < 0) dRunStart = tx;
            this.grid[idx] = Tile.Empty; // fallers handle their own collision
            break;
          case "P":
            // Spawn box sits on top of this cell's floor.
            spawn = { x: tx * TILE + TILE / 2, y: (ty + 1) * TILE };
            break;
          case "G":
            goal = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
            break;
          default:
            this.grid[idx] = Tile.Empty;
        }
      }
    }
    this.spawn = spawn;
    this.goal = goal;
    this.movers = (def.movers ?? []).map((m) => new MovingPlatform(m));
    this.saws = (def.saws ?? []).map((s) => new Saw(s));
    this.zones = (def.zones ?? []).map((z) => new GravityZone(z));
  }

  tileAt(tx: number, ty: number): Tile {
    // Out of bounds reads as empty; leaving the level is handled as a death
    // (bounds check) so designers control walls explicitly with '#'.
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return Tile.Empty;
    return this.grid[ty * this.cols + tx] as Tile;
  }

  isSolid(tx: number, ty: number): boolean {
    return this.tileAt(tx, ty) === Tile.Solid;
  }

  forEachTile(cb: (tx: number, ty: number, t: Tile) => void): void {
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const t = this.grid[ty * this.cols + tx] as Tile;
        if (t !== Tile.Empty) cb(tx, ty, t);
      }
    }
  }

  /** True if this level has any dynamic content (perf/short-circuit hint). */
  get hasEntities(): boolean {
    return (
      this.movers.length > 0 ||
      this.fallers.length > 0 ||
      this.saws.length > 0 ||
      this.zones.length > 0
    );
  }

  /** Advance all dynamic entities one physics step. */
  update(dt: number): void {
    for (const m of this.movers) m.update(dt);
    for (const s of this.saws) s.update(dt);
    for (const f of this.fallers) f.update(dt);
  }

  /** Reset dynamic entities to their initial state (on respawn). */
  reset(): void {
    for (const m of this.movers) m.reset();
    for (const s of this.saws) s.reset();
    for (const f of this.fallers) f.reset();
  }

  /** Currently-solid dynamic AABBs (movers always; fallers only when present). */
  dynamicSolids(): AABB[] {
    const out: AABB[] = [];
    for (const m of this.movers) out.push(m.box);
    for (const f of this.fallers) if (f.solid) out.push(f.box);
    return out;
  }

  /** Moving-hazard lethal hitboxes. */
  dynamicHazards(): AABB[] {
    return this.saws.map((s) => s.hitbox());
  }

  /** Gravity + drain multipliers at a point (1,1 outside any gravity zone). */
  fieldAt(px: number, py: number): { grav: number; drain: number } {
    for (const z of this.zones) {
      if (z.contains(px, py)) return { grav: ZONE_GRAVITY_MUL, drain: ZONE_DRAIN_MUL };
    }
    return { grav: 1, drain: 1 };
  }
}
