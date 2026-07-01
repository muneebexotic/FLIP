import { FIXED_DT, MAX_FRAME_DT } from "../config";

/**
 * Fixed-timestep loop with an accumulator. Physics advances in exact FIXED_DT
 * increments (deterministic, crisp collision); rendering happens once per
 * animation frame with an interpolation `alpha` so motion stays buttery on
 * 60/120/144 Hz displays alike.
 */
export class GameLoop {
  private acc = 0;
  private last = 0;
  private running = false;
  private raf = 0;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    let frame = (now - this.last) / 1000;
    this.last = now;
    if (frame > MAX_FRAME_DT) frame = MAX_FRAME_DT; // tab was backgrounded, etc.

    this.acc += frame;
    while (this.acc >= FIXED_DT) {
      this.update(FIXED_DT);
      this.acc -= FIXED_DT;
    }
    this.render(this.acc / FIXED_DT);
  };
}
