import { rand } from "../core/math";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  grav: number;
  spin: number;
  rot: number;
}

/** Lightweight pooled particle system for dust, flip bursts, and death shards. */
export class Particles {
  private pool: Particle[] = [];

  private spawn(p: Particle): void {
    this.pool.push(p);
  }

  burst(
    x: number,
    y: number,
    count: number,
    color: string,
    opts: { speed?: number; life?: number; grav?: number; size?: number; spread?: number } = {},
  ): void {
    const speed = opts.speed ?? 220;
    const life = opts.life ?? 0.5;
    const grav = opts.grav ?? 0;
    const size = opts.size ?? 5;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(speed * 0.3, speed);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(life * 0.6, life),
        maxLife: life,
        size: rand(size * 0.5, size),
        color,
        grav,
        spin: rand(-10, 10),
        rot: rand(0, Math.PI),
      });
    }
  }

  /** A directional puff (e.g. landing dust). dir: -1 up / +1 down. */
  puff(x: number, y: number, count: number, color: string, dir: number): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + rand(-10, 10),
        y,
        vx: rand(-120, 120),
        vy: dir * rand(-40, -160),
        life: rand(0.25, 0.5),
        maxLife: 0.5,
        size: rand(3, 6),
        color,
        grav: 0,
        spin: 0,
        rot: 0,
      });
    }
  }

  update(dt: number): void {
    const arr = this.pool;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) {
        arr[i] = arr[arr.length - 1];
        arr.pop();
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (const p of this.pool) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + t * 0.5);
      ctx.save();
      ctx.translate(p.x - ox, p.y - oy);
      ctx.rotate(p.rot);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.pool.length = 0;
  }

  get count(): number {
    return this.pool.length;
  }
}
