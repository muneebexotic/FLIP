import { PALETTES, VIEW } from "../config";
import type { Palette } from "../config";
import { playSfx, playWin } from "../core/audio";
import { Input } from "../core/input";
import { Camera } from "../engine/camera";
import { Particles } from "../engine/particles";
import { drawHud } from "./hud";
import { buildLevel, levelLabel } from "./levels";
import { Level } from "./level";
import { Player } from "./player";
import { Renderer } from "./renderer";

export interface RunStats {
  levelIndex: number;
  timeSec: number;
  deaths: number;
}

type Mode = "idle" | "play" | "dying" | "won";

export class Game {
  readonly input = new Input();
  private player = new Player();
  private camera = new Camera();
  private particles = new Particles();
  private renderer = new Renderer();

  private level!: Level;
  private levelIndex = 0;
  private palette: Palette = PALETTES[0];

  private mode: Mode = "idle";
  private deaths = 0;
  private attemptTime = 0;
  private dyingTimer = 0;
  private hintTimer = 0;
  private clock = 0; // ever-increasing, for animations

  /** Set by the host to receive completion + death events. */
  onWin: (stats: RunStats) => void = () => {};
  onDeath: (deaths: number) => void = () => {};

  loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = buildLevel(index);
    this.palette = PALETTES[this.level.def.world % PALETTES.length];
    this.camera.setBounds(this.level.widthPx, this.level.heightPx);
    this.deaths = 0;
    this.respawn(true);
    this.mode = "play";
    this.hintTimer = this.level.def.hint ? 3.2 : 0;
  }

  /** Reset player to spawn. `fresh` also snaps the camera (level (re)start). */
  private respawn(fresh: boolean): void {
    this.player.reset(this.level.spawn.x, this.level.spawn.y);
    this.attemptTime = 0;
    this.mode = "play";
    if (fresh) this.particles.clear();
    this.camera.snapTo(this.player.cx(), this.player.cy());
  }

  isPlaying(): boolean {
    return this.mode === "play" || this.mode === "dying";
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.hintTimer > 0) this.hintTimer = Math.max(0, this.hintTimer - dt);

    if (this.mode === "dying") {
      this.dyingTimer -= dt;
      this.particles.update(dt);
      this.camera.follow(this.player.cx(), this.player.cy(), dt);
      if (this.dyingTimer <= 0) this.respawn(false);
      return;
    }

    if (this.mode !== "play") {
      this.particles.update(dt);
      return;
    }

    // Manual retry (no death penalty).
    if (this.input.pressed("restart")) {
      playSfx("click");
      this.respawn(false);
      return;
    }

    this.attemptTime += dt;
    this.player.update(dt, this.input, this.level);
    this.particles.update(dt);
    this.camera.follow(this.player.cx(), this.player.cy(), dt);

    this.consumePlayerEvents();
  }

  private consumePlayerEvents(): void {
    const ev = this.player.ev;
    if (ev.jumped) {
      playSfx("jump");
      this.particles.puff(this.player.cx(), this.footY(), 6, this.palette.solidEdge, -this.player.gravDir);
    }
    if (ev.landed) {
      playSfx("land");
      this.particles.puff(this.player.cx(), this.footY(), 8, this.palette.solidEdge, -this.player.gravDir);
      this.camera.shake(2, 0.12);
    }
    if (ev.flipped) {
      playSfx("flip");
      this.particles.burst(this.player.cx(), this.player.cy(), 14, this.palette.playerFlip, {
        speed: 260,
        life: 0.45,
        size: 5,
      });
      this.camera.shake(3, 0.15);
    }
    if (ev.won) {
      this.win();
    }
    if (ev.died) {
      this.die();
    }
    this.player.clearEvents();
  }

  private footY(): number {
    // The player's floor-facing edge, for dust placement.
    return this.player.gravDir > 0 ? this.player.box.y + this.player.box.h : this.player.box.y;
  }

  private die(): void {
    if (this.mode !== "play") return;
    this.mode = "dying";
    this.dyingTimer = 0.5;
    this.deaths++;
    playSfx("death");
    this.camera.shake(9, 0.4);
    this.particles.burst(this.player.cx(), this.player.cy(), 26, this.palette.player, {
      speed: 340,
      life: 0.7,
      grav: 900,
      size: 7,
    });
    this.particles.burst(this.player.cx(), this.player.cy(), 12, this.palette.hazard, {
      speed: 260,
      life: 0.6,
      grav: 700,
      size: 6,
    });
    this.onDeath(this.deaths);
  }

  private win(): void {
    if (this.mode !== "play") return;
    this.mode = "won";
    playWin();
    this.camera.shake(4, 0.3);
    this.particles.burst(this.level.goal.x + 20, this.level.goal.y + 20, 40, this.palette.accent, {
      speed: 320,
      life: 0.9,
      grav: 500,
      size: 6,
    });
    this.onWin({ levelIndex: this.levelIndex, timeSec: this.attemptTime, deaths: this.deaths });
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (!this.level) {
      ctx.fillStyle = "#0b0d17";
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      return;
    }
    const { ox, oy } = this.camera.renderOffset(alpha);
    this.renderer.drawBackground(ctx, this.palette, ox, oy);
    this.renderer.drawLevel(ctx, this.level, this.palette, ox, oy, this.clock);

    if (this.mode !== "dying") {
      this.renderer.drawPlayer(ctx, this.player, this.palette, ox, oy, alpha, -1);
    }
    this.particles.render(ctx, ox, oy);

    // HUD (skip on the won frame so the results screen is clean).
    if (this.mode === "play" || this.mode === "dying") {
      drawHud(
        ctx,
        this.palette,
        {
          energyFrac: this.player.energy / 100,
          time: this.attemptTime,
          deaths: this.deaths,
          levelLabel: `${levelLabel(this.levelIndex)} · ${this.level.def.name}`,
        },
        this.clock,
      );
    }

    // Start-of-level hint.
    if (this.hintTimer > 0 && this.level.def.hint) {
      const a = Math.min(1, this.hintTimer / 0.6);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.fillStyle = this.palette.text;
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.fillText(this.level.def.hint, VIEW.w / 2, VIEW.h - 46);
      ctx.restore();
    }
  }

  currentPalette(): Palette {
    return this.palette;
  }
  currentLevelIndex(): number {
    return this.levelIndex;
  }
  setIdle(): void {
    this.mode = "idle";
  }
}
