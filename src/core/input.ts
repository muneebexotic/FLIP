/**
 * Unified input. Maps keyboard + on-screen touch buttons into a small set of
 * abstract actions, and tracks "pressed this frame" edges plus buffering.
 */

export type Action = "left" | "right" | "jump" | "flip" | "restart" | "confirm";

const KEYMAP: Record<string, Action> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "jump",
  KeyW: "jump",
  Space: "jump",
  KeyZ: "jump",
  ShiftLeft: "flip",
  ShiftRight: "flip",
  KeyK: "flip",
  KeyX: "flip",
  ArrowDown: "flip",
  KeyS: "flip",
  KeyR: "restart",
  Enter: "confirm",
};

export class Input {
  /** Currently-held actions. */
  private down = new Set<Action>();
  /** Actions whose press edge hasn't been consumed yet. */
  private pressedEdge = new Set<Action>();
  /** Actions released this frame (for variable jump height). */
  private releasedEdge = new Set<Action>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      // Prevent page scroll on arrows/space.
      e.preventDefault();
      if (!this.down.has(a)) this.pressedEdge.add(a);
      this.down.add(a);
    });
    target.addEventListener("keyup", (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this.down.delete(a);
      this.releasedEdge.add(a);
    });
    // Losing focus should release everything, or the player "sticks".
    target.addEventListener("blur", () => this.down.clear());
  }

  /** Touch/pointer buttons call these. */
  press(a: Action): void {
    if (!this.down.has(a)) this.pressedEdge.add(a);
    this.down.add(a);
  }
  release(a: Action): void {
    this.down.delete(a);
    this.releasedEdge.add(a);
  }

  held(a: Action): boolean {
    return this.down.has(a);
  }
  /** True once per press until consumed by frame end. */
  pressed(a: Action): boolean {
    return this.pressedEdge.has(a);
  }
  released(a: Action): boolean {
    return this.releasedEdge.has(a);
  }

  /** Horizontal axis, -1..1. */
  axisX(): number {
    return (this.down.has("right") ? 1 : 0) - (this.down.has("left") ? 1 : 0);
  }

  /** Clear per-frame edges. Call at the very end of a frame. */
  endFrame(): void {
    this.pressedEdge.clear();
    this.releasedEdge.clear();
  }
}
