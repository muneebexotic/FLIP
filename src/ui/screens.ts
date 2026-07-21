import { PALETTES } from "../config";
import type { Difficulty } from "../config";
import { isMuted, playSfx, toggleMute } from "../core/audio";
import { load, save } from "../core/storage";
import { isBloomOn, toggleBloom } from "../engine/bloom";
import { DIFFICULTIES, getDifficulty, metaOf } from "../difficulty";
import type { RunStats } from "../game/game";
import { formatTime } from "../game/hud";
import { LEVELS, LEVEL_COUNT, WORLD_NAMES, levelLabel } from "../game/levels";
import {
  createLeaderboard,
  getBest,
  getPlayerName,
  recordBest,
  setPlayerName,
} from "./leaderboard";
import type { Leaderboard, ScoreEntry, SortBy } from "./leaderboard";
import { shareRun } from "./sharecard";

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);

export interface AppHooks {
  playLevel(index: number): void;
  resume(): void;
  restart(): void;
  toMenu(): void;
  chooseDifficulty(d: Difficulty): void;
  setHunted(on: boolean): void;
}

/** Furthest unlocked level index for the ACTIVE difficulty (progressive unlock). */
export function progressMax(): number {
  return load<number>(`progress:${getDifficulty()}`, 0);
}
function unlock(index: number): void {
  if (index > progressMax()) save(`progress:${getDifficulty()}`, Math.min(index, LEVEL_COUNT - 1));
}

export class AppUI {
  private overlay: HTMLDivElement;
  private touch: HTMLDivElement;
  private util: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private lb: Leaderboard = createLeaderboard();
  private lastStruggleLevel = -1;

  constructor(private hooks: AppHooks) {
    this.overlay = this.div("overlay-root");
    this.overlay.className = "screen";
    document.body.appendChild(this.overlay);

    this.touch = this.buildTouch();
    document.body.appendChild(this.touch);

    this.util = this.buildUtil();
    document.body.appendChild(this.util);

    this.toastEl = this.div("");
    this.toastEl.className = "toast";
    document.body.appendChild(this.toastEl);

    const credit = this.div("");
    credit.className = "credit";
    credit.textContent = "FLIP · a game about gravity";
    document.body.appendChild(credit);

    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") this.onEscape();
    });
  }

  // ── plumbing ──────────────────────────────────────────────────────────────
  private div(id: string): HTMLDivElement {
    const d = document.createElement("div");
    if (id) d.id = id;
    return d;
  }

  private show(html: string): void {
    this.overlay.innerHTML = html;
    this.overlay.classList.add("show");
    this.setTouch(false);
    this.util.classList.add("hidden");
  }
  hideOverlay(): void {
    this.overlay.classList.remove("show");
    this.overlay.innerHTML = "";
  }
  isOverlayVisible(): boolean {
    return this.overlay.classList.contains("show");
  }

  /** Called by host when gameplay (re)starts so controls/HUD chrome show. */
  enterPlay(isTouch: boolean): void {
    this.hideOverlay();
    this.setTouch(isTouch);
    this.util.classList.remove("hidden");
  }

  private setTouch(on: boolean): void {
    this.touch.classList.toggle("show", on);
  }

  toast(msg: string, ms = 2200): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");
    window.clearTimeout((this.toastEl as any)._t);
    (this.toastEl as any)._t = window.setTimeout(
      () => this.toastEl.classList.remove("show"),
      ms,
    );
  }

  private onEscape(): void {
    if (this.overlay.classList.contains("show")) return; // already in a menu
    this.showPause();
  }

  // ── DIFFICULTY SELECT ─────────────────────────────────────────────────────
  showDifficultySelect(): void {
    const cur = getDifficulty();
    const cards = DIFFICULTIES.map(
      (d) => `
      <div class="diffcard ${d.id === cur ? "sel" : ""}" data-diff="${d.id}"
           style="--dc:${d.accent}">
        <div class="diffname">${d.name}</div>
        <div class="difftag">${esc(d.tagline)}</div>
        <div class="diffblurb">${esc(d.blurb)}</div>
      </div>`,
    ).join("");
    this.show(`
      <div class="title">FLIP</div>
      <div class="subtitle">Choose your difficulty. It sets the physics, the levels,
        and the leaderboard you'll compete on.</div>
      <div class="diffgrid">${cards}</div>
    `);
    this.overlay.querySelectorAll<HTMLElement>(".diffcard").forEach((card) => {
      card.addEventListener("click", () => {
        playSfx("click");
        this.hooks.chooseDifficulty(card.dataset.diff as Difficulty);
        this.showMenu();
      });
    });
  }

  // ── MENU ────────────────────────────────────────────────────────────────
  showMenu(): void {
    const cont = progressMax();
    const dm = metaOf(getDifficulty());
    this.show(`
      <div class="title">FLIP</div>
      <div class="subtitle">Gravity is a suggestion. Flip it to survive — but your energy
        drains while you're upside down. Run out mid-air and it's over.</div>
      <button class="diffpill" data-act="difficulty" style="--dc:${dm.accent}">
        <span class="dot"></span> ${dm.name} &nbsp;·&nbsp; <span class="chg">change</span>
      </button>
      <div class="row">
        <button class="btn primary" data-act="play">${cont > 0 ? "Continue" : "Play"}</button>
        <button class="btn" data-act="levels">Levels</button>
      </div>
      <div class="row" style="margin-top:2px">
        <button class="btn hunted" data-act="hunted">☠ Hunted — something chases you</button>
      </div>
      <div class="hintline">
        <kbd>A</kbd><kbd>D</kbd> move &nbsp; <kbd>Space</kbd> jump &nbsp;
        <kbd>Shift</kbd> flip &nbsp; <kbd>R</kbd> retry
      </div>
    `);
    this.overlay.querySelector('[data-act="play"]')!.addEventListener("click", () => {
      playSfx("click");
      this.hooks.setHunted(false);
      this.hooks.playLevel(Math.min(cont, LEVEL_COUNT - 1));
    });
    this.overlay.querySelector('[data-act="levels"]')!.addEventListener("click", () => {
      playSfx("click");
      this.hooks.setHunted(false);
      this.showLevelSelect();
    });
    this.overlay.querySelector('[data-act="hunted"]')!.addEventListener("click", () => {
      playSfx("click");
      this.hooks.setHunted(true);
      this.hooks.playLevel(Math.min(cont, LEVEL_COUNT - 1));
    });
    this.overlay.querySelector('[data-act="difficulty"]')!.addEventListener("click", () => {
      playSfx("click");
      this.showDifficultySelect();
    });
  }

  // ── LEVEL SELECT ─────────────────────────────────────────────────────────
  showLevelSelect(): void {
    const maxUnlocked = progressMax();
    let worldsHtml = "";
    for (let wi = 0; wi < WORLD_NAMES.length; wi++) {
      const cells = LEVELS.map((def, i) => ({ def, i }))
        .filter((x) => x.def.world === wi)
        .map(({ def, i }) => {
          const locked = i > maxUnlocked;
          const best = getBest(getDifficulty(), i);
          const done = !!best;
          const cls = `cell${locked ? " locked" : ""}${done ? " done" : ""}`;
          const sub = locked
            ? "🔒"
            : best
              ? formatTime(best.timeMs / 1000)
              : def.name;
          return `<div class="${cls}" data-i="${i}" ${locked ? "" : `role="button"`}>
              <div class="n">${levelLabel(i)}</div>
              <div class="nm">${esc(sub)}</div>
            </div>`;
        })
        .join("");
      worldsHtml += `<div class="worldtag" style="color:${PALETTES[wi].accent}">World ${wi + 1} · ${WORLD_NAMES[wi]}</div>
        <div class="grid">${cells}</div>`;
    }

    this.show(`
      <div class="panel">
        <h2>Select a level <span class="diffchip" style="--dc:${metaOf(getDifficulty()).accent}">${metaOf(getDifficulty()).name}</span></h2>
        <div class="sub">Clear a level to unlock the next.</div>
        ${worldsHtml}
        <div class="row" style="margin-top:18px">
          <button class="btn ghost" data-act="back">← Menu</button>
        </div>
      </div>
    `);
    this.overlay.querySelectorAll<HTMLElement>(".cell:not(.locked)").forEach((cell) => {
      cell.addEventListener("click", () => {
        playSfx("click");
        this.hooks.playLevel(Number(cell.dataset.i));
      });
    });
    this.overlay.querySelector('[data-act="back"]')!.addEventListener("click", () => {
      playSfx("click");
      this.showMenu();
    });
  }

  // ── RESULTS (win) ────────────────────────────────────────────────────────
  showResults(stats: RunStats): void {
    const i = stats.levelIndex;
    const diff = getDifficulty();
    const dm = metaOf(diff);
    const def = LEVELS[i];
    const best = recordBest(diff, i, stats.timeSec * 1000, stats.deaths);
    unlock(i + 1);
    const hasNext = i + 1 < LEVEL_COUNT;
    const beatPar = stats.timeSec <= def.par;
    const name = getPlayerName();

    this.show(`
      <div class="panel">
        <h2>Level Clear · ${levelLabel(i)} <span class="diffchip" style="--dc:${dm.accent}">${dm.name}</span></h2>
        <div class="sub">${WORLD_NAMES[def.world]} — ${esc(def.name)}</div>
        <div class="stats">
          <div class="stat ${beatPar ? "good" : ""}">
            <div class="v">${formatTime(stats.timeSec)}</div><div class="k">Time</div>
          </div>
          <div class="stat"><div class="v">${stats.deaths}</div><div class="k">Deaths</div></div>
          <div class="stat"><div class="v">${formatTime(best.timeMs / 1000)}</div><div class="k">Best</div></div>
        </div>
        <div class="row" style="margin-bottom:14px">
          <input class="name" maxlength="24" placeholder="Your name" value="${esc(name)}" />
          <button class="btn" data-act="submit">${this.lb.isGlobal ? "Submit to global" : "Save score"}</button>
        </div>
        <div class="row">
          ${hasNext ? `<button class="btn primary" data-act="next">Next →</button>` : `<button class="btn primary" data-act="levels">Levels</button>`}
          <button class="btn" data-act="retry">Retry</button>
          <button class="btn" data-act="share">Share ⤴</button>
          <button class="btn ghost" data-act="board">Leaderboard</button>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn ghost" data-act="menu">Menu</button>
        </div>
      </div>
    `);

    const nameInput = this.overlay.querySelector<HTMLInputElement>(".name")!;
    nameInput.addEventListener("change", () => setPlayerName(nameInput.value.trim()));

    const submit = async () => {
      const nm = (nameInput.value.trim() || "anon").slice(0, 24);
      setPlayerName(nm);
      const entry: ScoreEntry = {
        name: nm,
        levelIndex: i,
        difficulty: diff,
        timeMs: Math.round(stats.timeSec * 1000),
        deaths: stats.deaths,
        createdAt: Date.now(),
        mine: true,
      };
      await this.lb.submit(entry);
      this.toast(this.lb.isGlobal ? "Submitted to global leaderboard" : "Score saved");
    };

    this.overlay.querySelector('[data-act="submit"]')!.addEventListener("click", () => {
      playSfx("click");
      void submit();
    });
    this.overlay.querySelector('[data-act="share"]')!.addEventListener("click", () => {
      playSfx("click");
      void this.doShare(stats, true);
    });
    this.overlay.querySelector('[data-act="board"]')!.addEventListener("click", () => {
      playSfx("click");
      this.showLeaderboard(i);
    });
    this.overlay.querySelector('[data-act="retry"]')!.addEventListener("click", () => {
      playSfx("click");
      this.hooks.playLevel(i);
    });
    this.overlay.querySelector('[data-act="menu"]')!.addEventListener("click", () => {
      playSfx("click");
      this.showMenu();
    });
    this.overlay.querySelector('[data-act="next"]')?.addEventListener("click", () => {
      playSfx("click");
      this.hooks.playLevel(i + 1);
    });
    this.overlay.querySelector('[data-act="levels"]')?.addEventListener("click", () => {
      playSfx("click");
      this.showLevelSelect();
    });
  }

  // ── LEADERBOARD ──────────────────────────────────────────────────────────
  private async showLeaderboard(levelIndex: number, sort: SortBy = "time"): Promise<void> {
    const def = LEVELS[levelIndex];
    const diff = getDifficulty();
    const dm = metaOf(diff);
    this.show(`
      <div class="panel">
        <h2>Leaderboard · ${levelLabel(levelIndex)} <span class="diffchip" style="--dc:${dm.accent}">${dm.name}</span></h2>
        <div class="sub">${WORLD_NAMES[def.world]} — ${esc(def.name)} · ${this.lb.isGlobal ? "Global" : "Local"}</div>
        <div class="tabs">
          <button class="tab ${sort === "time" ? "active" : ""}" data-sort="time">Fastest</button>
          <button class="tab ${sort === "deaths" ? "active" : ""}" data-sort="deaths">Fewest deaths</button>
        </div>
        <div class="lb" id="lb-list"><div class="lb-empty">Loading…</div></div>
        <div class="row">
          <button class="btn ghost" data-act="back">← Back</button>
        </div>
      </div>
    `);
    this.overlay.querySelectorAll<HTMLElement>(".tab").forEach((t) =>
      t.addEventListener("click", () => {
        playSfx("click");
        void this.showLeaderboard(levelIndex, t.dataset.sort as SortBy);
      }),
    );
    this.overlay.querySelector('[data-act="back"]')!.addEventListener("click", () => {
      playSfx("click");
      this.showLevelSelect();
    });

    const list = this.overlay.querySelector("#lb-list")!;
    const rows = await this.lb.top(levelIndex, diff, sort, 25);
    const myName = getPlayerName();
    if (rows.length === 0) {
      list.innerHTML = `<div class="lb-empty">No scores yet — be the first.</div>`;
      return;
    }
    list.innerHTML = rows
      .map((r: ScoreEntry, idx: number) => {
        const me = r.mine || (myName && r.name === myName);
        return `<div class="lb-row ${me ? "me" : ""}">
          <div class="lb-rank">${idx + 1}</div>
          <div class="lb-name">${esc(r.name)}</div>
          <div class="lb-val">${formatTime(r.timeMs / 1000)}</div>
          <div class="lb-val">☠ ${r.deaths}</div>
        </div>`;
      })
      .join("");
  }

  // ── PAUSE ────────────────────────────────────────────────────────────────
  private showPause(): void {
    this.show(`
      <div class="panel">
        <h2>Paused</h2>
        <div class="sub">Take a breath.</div>
        <div class="row">
          <button class="btn primary" data-act="resume">Resume</button>
          <button class="btn" data-act="retry">Retry</button>
          <button class="btn ghost" data-act="menu">Menu</button>
        </div>
      </div>
    `);
    this.overlay.querySelector('[data-act="resume"]')!.addEventListener("click", () => {
      playSfx("click");
      this.hooks.resume();
    });
    this.overlay.querySelector('[data-act="retry"]')!.addEventListener("click", () => {
      playSfx("click");
      this.hooks.restart();
    });
    this.overlay.querySelector('[data-act="menu"]')!.addEventListener("click", () => {
      playSfx("click");
      this.hooks.toMenu();
    });
  }

  // ── Struggle share prompt (after N deaths) ───────────────────────────────
  offerStruggleShare(stats: RunStats): void {
    if (this.lastStruggleLevel === stats.levelIndex) return;
    this.lastStruggleLevel = stats.levelIndex;
    this.toast("Rough one. Press P to share the pain 💀", 3200);
    const handler = (e: KeyboardEvent) => {
      if (e.code === "KeyP") {
        window.removeEventListener("keydown", handler);
        void this.doShare(stats, false);
      }
    };
    window.addEventListener("keydown", handler);
    window.setTimeout(() => window.removeEventListener("keydown", handler), 8000);
  }

  private async doShare(stats: RunStats, completed: boolean): Promise<void> {
    const def = LEVELS[stats.levelIndex];
    const dm = metaOf(getDifficulty());
    try {
      const res = await shareRun({
        levelLabel: levelLabel(stats.levelIndex),
        levelName: def.name,
        worldName: WORLD_NAMES[def.world],
        palette: PALETTES[def.world % PALETTES.length],
        difficultyName: dm.name,
        difficultyColor: dm.accent,
        timeSec: stats.timeSec,
        deaths: stats.deaths,
        completed,
      });
      this.toast(
        res === "shared"
          ? "Shared!"
          : res === "copied"
            ? "Image saved + caption copied — paste it!"
            : "Card image downloaded",
      );
    } catch {
      this.toast("Couldn't create share card");
    }
  }

  // ── touch controls + util ────────────────────────────────────────────────
  private buildTouch(): HTMLDivElement {
    const wrap = this.div("");
    wrap.className = "touch";
    wrap.innerHTML = `
      <div class="tbtn left" data-k="left">◀</div>
      <div class="tbtn right" data-k="right">▶</div>
      <div class="tbtn jump" data-k="jump">⤒</div>
      <div class="tbtn flip" data-k="flip">⟳</div>`;
    return wrap;
  }

  /** Wire touch buttons to input press/release. Called by host with the Input. */
  bindTouch(press: (k: string) => void, release: (k: string) => void): void {
    this.touch.querySelectorAll<HTMLElement>(".tbtn").forEach((b) => {
      const k = b.dataset.k!;
      const down = (e: Event) => {
        e.preventDefault();
        press(k);
        b.style.background = "rgba(124,245,255,0.28)";
      };
      const up = (e: Event) => {
        e.preventDefault();
        release(k);
        b.style.background = "";
      };
      b.addEventListener("touchstart", down, { passive: false });
      b.addEventListener("touchend", up, { passive: false });
      b.addEventListener("touchcancel", up, { passive: false });
      b.addEventListener("mousedown", down);
      b.addEventListener("mouseup", up);
      b.addEventListener("mouseleave", up);
    });
  }

  private buildUtil(): HTMLDivElement {
    const wrap = this.div("");
    wrap.className = "util hidden";
    wrap.innerHTML = `
      <button class="icon" data-u="bloom" title="Glow">${isBloomOn() ? "✨" : "✩"}</button>
      <button class="icon" data-u="mute" title="Mute">${isMuted() ? "🔇" : "🔊"}</button>
      <button class="icon" data-u="pause" title="Menu">⏸</button>`;
    wrap.querySelector('[data-u="bloom"]')!.addEventListener("click", (e) => {
      playSfx("click");
      const on = toggleBloom();
      (e.currentTarget as HTMLElement).textContent = on ? "✨" : "✩";
    });
    wrap.querySelector('[data-u="mute"]')!.addEventListener("click", (e) => {
      const m = toggleMute();
      (e.currentTarget as HTMLElement).textContent = m ? "🔇" : "🔊";
    });
    wrap.querySelector('[data-u="pause"]')!.addEventListener("click", () => this.showPause());
    return wrap;
  }
}
