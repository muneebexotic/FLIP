import { ENERGY, PALETTES, VIEW } from "../config";
import type { Palette } from "../config";
import { playDarkExhale, playDarkReveal, playHunterCaught, playSfx, playWin } from "../core/audio";
import { getDifficulty } from "../difficulty";
import { Input } from "../core/input";
import { Camera } from "../engine/camera";
import { Particles } from "../engine/particles";
import { drawHud } from "./hud";
import { Hunter } from "./hunter";
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

/** Odds an ordinary (non-Hunted) level entry is secretly invaded by the dark. */
const INVASION_CHANCE = 0.14;

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

  // ── Hunted mode ──
  private hunted = false;
  private hunter = new Hunter();
  private dread = 0; // 0..1 proximity of the Hunter, drives dread effects
  private beatTimer = 0;

  // ── Invasion: the dark can rarely, unannounced, turn on during an ordinary
  //    (non-Hunted) run — "one game that can turn on you". ──
  private invasionArmed = false; // this level entry will spring an invasion
  private invading = false; // an invasion is live this attempt
  private invasionCountdown = 0; // seconds of normal play before it strikes
  private invasionCooldown = 0; // level entries to wait before another may arm
  private forceInvasions = false; // dev/playtest (?invade): invade every eligible level

  // ── Juice ──
  private hitStop = 0; // brief whole-scene freeze on death, for impact
  private flipFx = { x: 0, y: 0, t: 0 }; // expanding shockwave ring after a flip

  /** Set by the host to receive completion + death events. */
  onWin: (stats: RunStats) => void = () => {};
  onDeath: (deaths: number) => void = () => {};

  /** Toggle the Hunter chase on. Applies from the next (re)spawn. */
  setHunted(on: boolean): void {
    this.hunted = on;
  }
  isHunted(): boolean {
    return this.hunted;
  }

  /** True when the dark is present — deliberate Hunted OR an active invasion. */
  private huntActive(): boolean {
    return this.hunted || this.invading;
  }

  /** Dev/playtest aid (wired to ?invade): force an invasion every eligible level. */
  setInvasionTesting(on: boolean): void {
    this.forceInvasions = on;
  }

  /** Decide, once per level entry, whether the dark will invade this ordinary run. */
  private rollInvasion(index: number): void {
    this.invasionArmed = false;
    if (this.hunted) return; // deliberate Hunted already — nothing to arm
    if (this.forceInvasions) {
      this.invasionArmed = true;
      return;
    }
    if (this.invasionCooldown > 0) {
      this.invasionCooldown--;
      return;
    }
    // Keep Casual (the practice on-ramp) predictable; grace the first two levels.
    if (getDifficulty() === "casual" || index <= 1) return;
    if (Math.random() < INVASION_CHANCE) {
      this.invasionArmed = true;
      this.invasionCooldown = 3; // no back-to-back invasions
    }
  }

  loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = buildLevel(index);
    this.palette = PALETTES[this.level.def.world % PALETTES.length];
    this.camera.setBounds(this.level.widthPx, this.level.heightPx);
    this.deaths = 0;
    this.rollInvasion(index);
    this.respawn(true);
    this.mode = "play";
    this.hintTimer = this.level.def.hint ? 3.2 : 0;
  }

  /** Reset player to spawn. `fresh` also snaps the camera (level (re)start). */
  private respawn(fresh: boolean): void {
    this.level.reset(); // return moving/disappearing/hazard entities to start
    this.player.reset(this.level.spawn.x, this.level.spawn.y);
    this.attemptTime = 0;
    this.mode = "play";
    this.dread = 0;
    this.beatTimer = 0;
    this.invading = false;
    if (this.hunted) {
      this.hunter.reset(this.player.cx(), this.player.cy());
    } else if (this.invasionArmed) {
      // Strike a few seconds in, so it reads as the game turning on you.
      this.invasionCountdown = 3 + Math.random() * 3;
    }
    if (fresh) this.particles.clear();
    this.camera.snapTo(this.player.cx(), this.player.cy());
  }

  isPlaying(): boolean {
    return this.mode === "play" || this.mode === "dying";
  }

  update(dt: number): void {
    if (this.hitStop > 0) {
      this.hitStop -= dt; // freeze the whole scene for a beat on impact
      return;
    }
    this.clock += dt;
    if (this.flipFx.t > 0) this.flipFx.t = Math.max(0, this.flipFx.t - dt);
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
    this.level.update(dt); // advance entities before the player rides them
    this.player.update(dt, this.input, this.level);
    this.particles.update(dt);
    this.camera.follow(this.player.cx(), this.player.cy(), dt);

    if (this.huntActive()) this.updateHunter(dt);
    else if (this.invasionArmed) this.tickInvasion(dt);

    this.consumePlayerEvents();
  }

  /** Count down to an unannounced strike, then wake the dark where you stand. */
  private tickInvasion(dt: number): void {
    if (!this.player.alive || this.player.won) return;
    this.invasionCountdown -= dt;
    if (this.invasionCountdown <= 0) {
      this.invading = true;
      this.hunter.reset(this.player.cx(), this.player.cy(), true /* gentle */);
    }
  }

  private updateHunter(dt: number): void {
    if (!this.player.alive || this.player.won) return;
    const woke = this.hunter.update(
      dt,
      this.player.cx(),
      this.player.cy(),
      this.player.vx,
      this.player.grounded,
      this.player.ev.flipped, // one-shot: a clean flip relieves the dark's surge
    );
    if (woke) playDarkReveal(); // the reveal: low drone + breath, presence felt
    this.dread = this.hunter.dread(this.player.cx());

    // Heartbeat that quickens as the dark closes in.
    if (this.dread > 0.04) {
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        playSfx("heartbeat");
        this.beatTimer = 0.95 - this.dread * 0.78; // ~0.95s far → ~0.17s close
      }
    }

    // Caught — the dark reached you.
    if (this.hunter.caughtPlayer(this.player.cx())) {
      this.die(true);
    }
  }

  private consumePlayerEvents(): void {
    const ev = this.player.ev;
    if (ev.jumped) {
      playSfx("jump");
      this.particles.puff(this.player.cx(), this.footY(), 6, this.palette.solidEdge, -this.player.gravDir);
    }
    if (ev.landed) {
      playSfx("land");
      this.particles.puff(this.player.cx(), this.footY(), 12, this.palette.solidEdge, -this.player.gravDir);
      this.camera.shake(2.5, 0.14);
    }
    if (ev.flipped) {
      playSfx("flip");
      this.particles.burst(this.player.cx(), this.player.cy(), 18, this.palette.playerFlip, {
        speed: 300,
        life: 0.5,
        size: 5,
      });
      this.flipFx = { x: this.player.cx(), y: this.player.cy(), t: 0.28 };
      this.camera.shake(4.5, 0.18);
    }
    if (ev.won) {
      this.win();
    }
    if (ev.died) {
      this.die(false);
    }
    this.player.clearEvents();
  }

  private footY(): number {
    // The player's floor-facing edge, for dust placement.
    return this.player.gravDir > 0 ? this.player.box.y + this.player.box.h : this.player.box.y;
  }

  private die(byHunter: boolean): void {
    if (this.mode !== "play") return;
    // Kill the player (covers Hunter catches, which aren't a player event).
    this.player.alive = false;
    this.mode = "dying";
    this.dyingTimer = byHunter ? 0.7 : 0.5;
    this.hitStop = byHunter ? 0.08 : 0.05; // freeze-frame the moment of death
    this.deaths++;
    if (byHunter) {
      playHunterCaught();
      this.camera.shake(13, 0.5);
      // A dark, violent burst as it drags you down.
      this.particles.burst(this.player.cx(), this.player.cy(), 34, "#08080e", {
        speed: 300,
        life: 0.8,
        grav: 600,
        size: 8,
      });
    } else {
      playSfx("death");
      this.camera.shake(9, 0.4);
    }
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
    if (this.huntActive()) playDarkExhale(); // the dark recedes — tension releases
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

    // Dynamic entities (self-rendering): zones tint behind, then solids/hazards.
    if (this.level.hasEntities) {
      const pal = this.palette;
      const t = this.clock;
      for (const z of this.level.zones) z.render(ctx, ox, oy, pal, t);
      for (const m of this.level.movers) m.render(ctx, ox, oy, pal, alpha);
      for (const f of this.level.fallers) f.render(ctx, ox, oy, pal, t);
      for (const s of this.level.saws) s.render(ctx, ox, oy, pal, t, alpha);
    }

    // The dark eats the level from the left, just behind the player.
    if (this.huntActive() && (this.mode === "play" || this.mode === "dying")) {
      this.hunter.render(ctx, ox, oy, this.palette, alpha, this.clock);
    }

    if (this.mode !== "dying") {
      this.renderer.drawPlayer(ctx, this.player, this.palette, ox, oy, alpha, -1);
    }
    this.particles.render(ctx, ox, oy);

    // Flip shockwave: a quick expanding ring where you last flipped.
    if (this.flipFx.t > 0) {
      const p = 1 - this.flipFx.t / 0.28; // 0 → 1 over its life
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.55;
      ctx.strokeStyle = this.palette.playerFlip;
      ctx.lineWidth = 2 + (1 - p) * 2;
      ctx.beginPath();
      ctx.arc(this.flipFx.x - ox, this.flipFx.y - oy, 8 + p * 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Dread — darkness bleeds in from the LEFT (where the dark lives), reddening
    // the whole frame only once it's genuinely close.
    if (this.huntActive() && this.dread > 0.02 && (this.mode === "play" || this.mode === "dying")) {
      const d = this.dread;
      const side = ctx.createLinearGradient(0, 0, VIEW.w * 0.62, 0);
      side.addColorStop(0, `rgba(4,0,8,${Math.min(0.9, 0.3 + d * 0.6)})`);
      side.addColorStop(0.5, `rgba(14,0,10,${d * 0.32})`);
      side.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);

      if (d > 0.5) {
        const grad = ctx.createRadialGradient(
          VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.28,
          VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.8,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, `rgba(34,0,8,${(d - 0.5) * 0.7})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      }
    }

    // HUD (skip on the won frame so the results screen is clean).
    if (this.mode === "play" || this.mode === "dying") {
      drawHud(
        ctx,
        this.palette,
        {
          energyFrac: this.player.energy / ENERGY.max,
          time: this.attemptTime,
          deaths: this.deaths,
          levelLabel: `${levelLabel(this.levelIndex)} · ${this.level.def.name}`,
        },
        this.clock,
      );
    }

    // Head-start "RUN" prompt while the Hunter is still coiled.
    if (this.hunted && this.mode === "play" && !this.hunter.started) {
      const p = 0.5 + 0.5 * Math.sin(this.clock * 8);
      ctx.save();
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.55 + p * 0.45;
      ctx.fillStyle = this.palette.hazard;
      ctx.font = "800 48px system-ui, sans-serif";
      ctx.fillText("RUN", VIEW.w / 2, 128);
      ctx.globalAlpha = 0.7;
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillStyle = this.palette.text;
      ctx.fillText("it's waking up", VIEW.w / 2, 154);
      ctx.restore();
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
