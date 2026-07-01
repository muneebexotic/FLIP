import { TILE } from "../config";
import type { AABB } from "../core/math";

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
}

/**
 * ASCII legend:
 *   '#'  solid block
 *   '^'  hazard (spike) — lethal on contact
 *   'P'  player spawn (feet position, normal gravity)
 *   'G'  goal
 *   '.' or ' '  empty
 */
export class Level {
  readonly cols: number;
  readonly rows: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly spawn: { x: number; y: number };
  readonly goal: AABB;
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
      for (let tx = 0; tx < this.cols; tx++) {
        const ch = row[tx] ?? ".";
        const idx = ty * this.cols + tx;
        switch (ch) {
          case "#":
            this.grid[idx] = Tile.Solid;
            break;
          case "^":
            this.grid[idx] = Tile.Hazard;
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
}
