# FLIP — Product Requirements & Roadmap (Session Handoff)

> **Read this first if you're a new session.** This doc is the single source of truth for what
> FLIP is, what already exists, the invariants you must NOT break, and the prioritized backlog to
> execute one epic at a time. Also read [`README.md`](../README.md) and the auto-memory in
> `C:\Users\musman\.claude\projects\e--TB-Muneeb-usman-kiro-personal-FLIP\memory\`.

---

## 0. TL;DR for the next session

- **FLIP** is a polished browser platformer built around **flipping gravity** with a draining
  **energy meter**. TypeScript + Vite + hand-rolled Canvas-2D engine. No game framework.
- It is **deployed live on Vercel** (auto-deploys on push to `main`) with a **Supabase** global
  leaderboard. Git is scoped to the owner's **personal** identity (`muneebexotic`) via the
  `github-personal` SSH alias — commits are already configured, just `git push`.
- **Everything is verified by tooling.** Before/after any change run: `npm run typecheck`,
  `npm run validate`, `npm run simtest`, `npm run build`. Keep all green.
- **The owner cannot pay for AI APIs.** Use **offline generation** (you, the model, generate
  content now and commit it) or **free tiers** (Groq / Google Gemini). The validator is the quality
  gate, so model strength barely matters.
- **Kick off epics in the order in section 6.** Epic A (Hunter v2) **DONE**; Epic B (feel/visuals/
  speed pass) **LARGELY DONE (2026-07-21)** — only optional items left (music decision, new obstacle,
  WebGL bloom). **Epic C (redesign Normal + a post-Nightmare tier) is next.** Do ONE epic at a time;
  verify; commit; push (auto-deploys).

---

## 1. What FLIP is (product vision)

A precision platformer that "feels as good to play as it is to watch," aimed at going viral on
X/Twitter and being streamable. Core skill = managing gravity flips against a limited energy meter.

- **Core mechanic:** `Flip` inverts gravity. Energy **drains the whole time you're inverted** and
  only refuels on a **normal-gravity floor** (ceilings never refuel). Empty while airborne = death.
  This keeps every flip a visible, legible countdown — good for spectators.
- **Feel target:** Celeste-class precision — coyote time, jump buffering, variable jump height,
  instant restart, satisfying death.
- **Aesthetic:** minimalist vector/Canvas geometry, strong color contrast, per-world palettes.
  **No external assets** (no images/fonts/audio files) — all shapes are drawn, all SFX are WebAudio
  synth. This keeps the bundle ~17 KB gzipped and CSP-clean. **Preserve this constraint.**
- **Viral loop (the actual product):** play → shareable result (share card) → someone tries to beat
  it → they play. The share card + per-level global leaderboard are the engine.

---

## 2. Current state — what already exists (DONE)

- **Engine:** 120 Hz fixed-timestep loop with render interpolation; AABB-vs-tilegrid collision;
  player controller (coyote, jump buffer, variable jump, gravity flip + energy); camera
  (smooth-follow + shake); pooled particles; WebAudio synth SFX.
- **3 difficulties, 12 handcrafted levels each (36 total)** across 4 worlds (Dusk/Ember/Bloom/Void):
  - **Casual** — reference tuning + original 12 levels. **FROZEN.**
  - **Normal** — heavier gravity, ~1.34 s/flip energy budget, moving platforms from World 2.
  - **Nightmare** — brutal gravity, ~0.76 s/flip, + disappearing platforms, moving hazards, gravity
    zones.
- **4 obstacle entities** ([`src/game/obstacles.ts`](../src/game/obstacles.ts)) — MovingPlatform
  (rideable), Faller (disappearing), Saw (moving hazard), GravityZone (×1.6 gravity, ×1.8 drain).
- **Difficulty system** — swaps physics profile + level set via ES-module live bindings; persisted;
  select screen at boot; per-difficulty leaderboard/best/progress.
- **Leaderboard** — pluggable: localStorage default + Supabase global (env-detected). Per level,
  per difficulty. Table schema in [`supabase.sql`](../supabase.sql).
- **Share card** — client-side canvas PNG + Web Share API; shows difficulty badge.
- **Mobile** — touch controls, responsive letterboxed canvas.
- **Hunted mode v1** ([`src/game/hunter.ts`](../src/game/hunter.ts)) — a chase enemy (see Epic A for
  the planned v2 rebuild). Toggle via "☠ Hunted" menu button.
- **Deploy** — Vercel (`vercel.json`), configs also for Netlify/Cloudflare. Supabase env vars set in
  Vercel dashboard (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

---

## 3. Architecture invariants — DO NOT BREAK

1. **Casual physics AND Casual levels are FROZEN.** Never edit `CASUAL_PHYS`, `CASUAL_ENERGY`, or
   the Casual level definitions. `simtest` asserts Casual is unregressed (bot solves 7/12).
2. **`PHYS`, `ENERGY`, `LEVELS`, `LEVEL_COUNT` are live-binding `export let`s** (swapped by
   `applyPhysics` / `applyLevelSet`). Consumers read them by **property access** — **never
   destructure** these imports, or difficulty switching breaks.
3. **Fixed-timestep determinism.** All gameplay logic runs in `update(dt)` at `FIXED_DT` (1/120).
   Rendering interpolates with `alpha`. Don't put gameplay state changes in render.
4. **No external assets.** Everything drawn or synthesized. A strict CSP + the tiny-bundle goal
   depend on this.
5. **The tooling is the quality gate — keep it green and extend it, don't bypass it:**
   - `npm run validate` — structural + per-difficulty energy-budget + reachability + entity checks
     ([`scripts/validate-levels.ts`](../scripts/validate-levels.ts)). Every level must pass.
   - `npm run simtest` — runs the REAL engine headlessly with a scripted bot across all 36 levels;
     asserts core mechanics + Casual no-regression + zero exceptions
     ([`scripts/sim-test.ts`](../scripts/sim-test.ts)).
   - `npm run typecheck`, `npm run build`, and `npm run preview` + `npm run smoke` (Playwright).
6. **Level format** (see [`src/game/levels.ts`](../src/game/levels.ts) + `corridorX` builder):
   ASCII grid, `#` solid / `^` hazard / `P` spawn / `G` goal / `.` empty / `_` pit / `D`
   disappearing platform. Moving platforms/hazards/zones are metadata arrays (`movers`/`saws`/
   `zones`) in tile coords. Row indices in a corridor: ceiling content = 1, floor content =
   interior+2, floor surface = interior+3.

**File map:** `src/config.ts` (tuning + profiles), `src/difficulty.ts` (coordinator), `src/core/*`
(loop/input/math/audio/storage), `src/engine/*` (physics/camera/particles), `src/game/*`
(player/level/levels/obstacles/hunter/renderer/hud/game), `src/ui/*` (screens/leaderboard/
sharecard), `src/main.ts` (app shell), `scripts/*` (validate/sim/smoke).

---

## 4. Known issues / bugs (found in code review — fix as part of the relevant epic)

1. ~~**`moveSpeed` is identical (260) across all three difficulties.**~~ **FIXED (Epic B):** Normal
   290, Nightmare 330 (Casual frozen 260).
2. **Normal levels are geometrically too gentle** → Normal "feels like Casual" despite harder
   physics. Difficulty must come from level-design pressure. → Epic C.
3. ~~**Saw hitbox vs visual mismatch**~~ **FIXED (Epic B):** now a toothed blade sized to the ~14px
   kill hitbox (silhouette matches the lethal zone), calmer `time*3` spin. Hitbox unchanged.
4. ~~**Faller commits on first touch**~~ **FIXED (Epic B):** crumbles from time *spent standing* and
   recovers when you step off, so a brief touch / quick hop across no longer dooms it.
5. **Movers are one-note** — every mover is a horizontal ferry over a pit; the vertical `lift`
   helper was removed. Underused mechanic. → Epic B/C.
6. **Hunter v1 isn't scary** — see Epic A.

---

## 5. Design pillars (use these to make calls)

- **Feel before content.** A 3-frame hit-stop and motion trails do more than 10 levels.
- **Difficulty = level-design pressure**, not just bigger numbers.
- **Fear = anticipation + the unseen + inevitability + reactivity**, not a visible monster.
- **The viral loop is the product.** Every feature should feed share/leaderboard/daily.
- **Minimalist vector, no assets.** The horror is the *absence* of the world (darkness), not a
  drawn creature.

---

## 6. Roadmap — epics to kick off ONE AT A TIME (in this order)

### ✅ Epic A — Hunter v2: "The Encroaching Dark" (DONE 2026-07-21)

**Shipped.** Rebuilt [`src/game/hunter.ts`](../src/game/hunter.ts) as an accelerating wall of black
(`darkX`, monotonic) that eats the level from the left; a reactive **surge** speeds it up on
mistakes (hesitation/backtracking) while a **clean flip clears surge** = breathing room; ~1.5 s calm
**reveal** (low drone, no monster on screen), two tracking eyes at the leading edge + a maw that
lunges only on a near-catch; gap-based dread → **left-edge** vignette + quickening heartbeat; new
`playDarkReveal`/`playDarkExhale` SFX. Contact death when the player's left edge reaches `darkX`.
**Owner decision resolved (see below): invasions of ordinary runs are BUILT** — rarely and
unannounced the dark turns on mid-run on Normal/Nightmare (`INVASION_CHANCE`, `?invade` forces it
for playtesting). Verified green (typecheck/validate/simtest — Casual still 7/12 — /build + browser).
**Tuning knobs to playtest** live as fields in `hunter.ts` (`baseSpeed` 202/178-gentle, `accel` 10,
`surgeBoost` 0.5, `revealDelay` 1.5/2.2-gentle, `spawnLead` 560, `dreadRange` 480) and
`INVASION_CHANCE` (0.14) + the 3-level cooldown in [`game.ts`](../src/game/game.ts). Design notes
below kept for reference.

**Problem with v1:** it spawns visibly next to the player (no reveal/dread), is always on-camera
(no "unseen" fear), and feels slow (base speed < player, falls behind on clean runs).

**The reframe:** stop thinking "a monster chases me." It's **the void eating the level behind you,
and you outrun the light going out.** The Hunter is the *face* of the dark, not a separate sprite.

**Mechanics to build:**
1. **Encroaching dark wall.** A vertical wall of pure black advances from the **left** (behind
   spawn, off-screen) at a steady, **accelerating** rate — relentless, never falls behind (fixes
   "slow"). Everything left of it is consumed. Touch it = death. This is the inevitable metronome.
2. **Eyes in the dark.** You do NOT see a body most of the time. When the dark is near, **two glowing
   eyes open at its leading edge**, tracking the player. The Hunter lunges along the player's
   breadcrumb trail *within* the dark to snap at you when close (keep the v1 breadcrumb-retrace — it
   is fair and thematic). Full body + screech only on the near-catch.
3. **Reactive surge (the key skill hook).** Mistakes make the dark **surge forward**: a missed/late
   flip, hesitation/standing still, or backtracking → temporary speed boost of the wall. Clean flips
   and forward momentum buy breathing room. This makes *flipping well* (the core mechanic) the thing
   that keeps you alive — not just holding right.
4. **The reveal.** Level starts calm (~1.5–2 s of quiet, normal music). Then: music thins to a low
   drone, the far-left goes black, one breath/heartbeat — **presence felt before seen.** No monster
   on screen yet.
5. **Mostly off-screen.** Because you run left→right and the camera follows you, the dark/eyes live
   at the **left edge**. Track it via the left-side vignette + heartbeat + audio. Seeing the full
   body enter frame = you slowed too much = the scare.
6. **Resolution.** Reach the goal → the dark recedes, an **exhale** SFX releases the tension.
   Caught → full black, one screech, silence, respawn to calm (the knowing-it-returns dread).

**Tuning knobs (start here, then playtest):** wall base speed ≈ player sustainable pace (slightly
under, so bursts pull ahead but it always creeps back); accel ~8–12 px/s²; surge +40–60% for
~0.6 s on mistake; reveal delay 1.5 s; dread ramps by distance from wall, not from a point.

**Implementation notes:** rework [`src/game/hunter.ts`](../src/game/hunter.ts). Represent the wall
as an x-position in world space (`darkX`) that only increases; render as a full-height black
gradient from `darkX` leftward with a jagged/animated leading edge and eyes at the edge nearest the
player's y. Keep the breadcrumb trail for the lunge/eye position. Drive `dread` from
`(playerX - darkX)` gap, not center distance. Contact death when `playerX <= darkX` (or eyes reach
player). Wire mistake-detection off player events (flip timing, `vx≈0` while grounded, x decreasing).

**Acceptance:** feels tense on the existing short levels; you rarely see the body; a clean fast run
survives, a hesitant one dies; `simtest`/`validate` still green (Hunted stays off by default).

**Owner decision (RESOLVED 2026-07-21 — yes, built):** the dark can **invade ordinary runs** rarely
and unannounced — merging the two modes into "one game that can turn on you." Implemented as a
per-level-entry roll (`INVASION_CHANCE` 0.14) gated to skip Casual and the first two levels, with a
3-level cooldown so invasions never cluster; it strikes 3–6 s into the run (no "RUN" prompt), using a
gentler tuning than deliberate Hunted so a surprised-but-competent player can still survive. `?invade`
forces it every eligible level for playtesting. **To dial frequency, change `INVASION_CHANCE`.**

---

### Epic B — Feel, visuals & speed pass + obstacle bug fixes (LARGELY DONE 2026-07-21)

**Shipped this session:** per-difficulty `moveSpeed` (Casual 260 frozen / Normal 290 / Nightmare
330); juice — 3-frame hit-stop on death, speed-reactive player motion trail, expanding flip
shockwave ring + sharper flip squash, denser landing dust, and a camera-shake rework (`mag` is now
the PEAK px amplitude — the old `mag*time` made shakes nearly invisible); saw fix (toothed blade
sized to the ~14px kill hitbox, calmer spin — no more corners poking past the lethal zone; hitbox
unchanged); faller fix (crumbles from time *spent standing*, recovers when you step off); parallax
depth blobs in `drawBackground`; and **bloom is now a real persisted setting** (HUD ✨ toggle,
default ON desktop / OFF touch, strength 0.42, `?bloom=1/0` override). Verified green + browser.
**Still open in B (optional / owner calls):** a proper WebGL threshold+downsample bloom (kept the
Canvas-2D one — good enough, WebGL is a "consider"); a new flip-centric obstacle (needs new levels →
overlaps Epic C); and **importing one real music track** (breaks the no-asset invariant → owner
decision, deferred). Original notes below.

- **Per-difficulty `moveSpeed`** (e.g. ~240 / ~290 / ~330). This is the biggest single feel win.
- **Juice:** 3-frame hit-stop on death; motion trail behind the player; chromatic/scale pop on flip;
  denser landing particles; screen-shake tuning.
- **Neon bloom (prototyped — see below).** A pure-Canvas-2D bloom post-process already exists at
  [`src/engine/bloom.ts`](../src/engine/bloom.ts), wired in `main.ts` behind a `?bloom` URL param
  (off by default; try `?bloom=1`). **Task:** decide final strength, make it a real setting (not a
  URL param), consider a proper threshold+downsample (a small WebGL pass) for a crisper, cheaper
  halo, and ensure it doesn't tank perf on low-end mobile (skip or lower blur there).
- **Parallax depth layers.** Add 2–3 background planes in `renderer.drawBackground` moving at
  different rates (+ subtle scale/lighting) to fake 3D depth cheaply. Reads as "2.5D" with none of a
  3D rewrite's cost.
- **Fix the saw** (match hitbox to visual; calm the spin) and the **faller** (only count stand time,
  or clearer telegraph). Add a **new flip-centric obstacle** (e.g., a spike that sits on BOTH faces
  of a moving platform, or a directional gravity-arrow field).
- **Music (the one asset worth importing).** SFX stay synth, but a real authored/licensed music
  track is the single biggest "banger" lever and is hard to synth well — evaluate adding one small
  audio asset (keep it lazy-loaded so it never blocks first paint).
- **Acceptance:** difficulties feel distinct; obstacle hitboxes match visuals; bloom/parallax look
  good and don't regress load/perf; `simtest` green.

> **Visual-direction decision (this session):** stay **2D**. Do NOT rewrite to Three.js / go 3D — a
> 3D engine (~150 KB+) would kill FLIP's instant-load viral edge, and precision platformers are 2D
> for readability/feel reasons (that would be "FLIP 2," a new game, not an upgrade). The "wow" comes
> from **animation + bloom + parallax**, all cheap and in the current stack. No external assets
> except (maybe) music.

### Epic C — Redesign Normal + a post-Nightmare tier

- Rebuild the 12 Normal levels so the **geometry** demands the harder physics (tighter flip windows,
  real energy pressure), not just heavier numbers. Keep them validator-passing.
- Add a **4th tier above Nightmare** (owner + friends cleared Nightmare) — e.g., "Abyss": everything
  + the Hunter always on + near-zero margins.
- **Acceptance:** Normal no longer "feels like Casual"; `validate` passes all sets.

### Epic D — AI level generation (offline, validator-gated) — the infrastructure

- Build a generator: an LLM emits levels in the ASCII+metadata format → pipe through
  `validate` + `simtest` → **reject & regenerate until valid.** Guarantees solvable, on-budget
  levels. **Do it offline first** (you, the model, generate a big batch now and commit as static
  data) → zero runtime cost. Record each level's bot-measured difficulty (attempts-to-clear, energy
  margin) so difficulty is *provable*, not guessed.
- **Acceptance:** a `scripts/gen-levels` flow (or a committed generated pack) where every generated
  level passes the validator + simulator.

### Epic E — Endless "Outrun" mode (the Hunter's true home)

- A procedurally-extended level that scrolls forever; you flip/dodge; the Encroaching Dark (Epic A)
  accelerates; survive as long as possible. One score = distance/time. Global leaderboard + share
  card. **This is the clip-generating, "beat my run" viral machine.** Uses Epic D for the geometry.
- **Acceptance:** a runnable endless mode with a persisted best + leaderboard entry.

### Epic F — Daily Challenge + leaderboard

- One bot-verified level/day, same for everyone worldwide (seeded), global board, share card. The
  Wordle-style retention hook. Offline pre-generate a queue, or a free-tier runtime endpoint (Epic
  G infra) generates the daily.
- **Acceptance:** a dated daily level everyone shares; leaderboard scoped to the date.

### Epic G — AI trash-talk share captions (free-tier LLM)

- A serverless endpoint (Vercel function or Supabase Edge Function) holding a **free-tier** key
  (Groq/Gemini) that writes a witty personalized caption per run for the share card
  ("14 deaths on one spike — the spike is winning"). Small, fun, on-brand, boosts sharing.
- **Acceptance:** share card optionally includes an AI caption; graceful fallback if the API fails.

### Epic H — Progression & juice

- Medals for beating par time; a speedrun timer; cosmetic unlocks (player trail colors) tied to
  achievements. Retention without breaking the "no accounts" v1 scope (all local).

### Epic I — Growth polish

- Static `og:image` for rich link unfurls on X/Discord (needs the final domain — absolute URL).
- Lightweight analytics (Plausible/PostHog) to measure retention (needed before any monetization).
- Mobile feel polish.

### Epic J — Monetization (later; see the earlier analysis)

- Portfolio/freelance is the realistic near-term income; the game path is portals (CrazyGames,
  GameDistribution) with an ad SDK once analytics show good retention, and the Daily/Outrun loop is
  driving traffic. Make Casual the default for portal audiences.

---

## 7. AI approach (free — important)

- **Offline generation (preferred, free):** the coding session's own model generates levels/content
  now and commits validated results. No API key, no runtime cost. Use for bulk levels (Epic D) and a
  pre-generated Daily queue (Epic F).
- **Runtime free tiers** (only if fresh/live content is needed): **Google Gemini** (~1,500 req/day)
  or **Groq** (30 req/min, fast). Put the key in a **serverless function**, never client-side. One
  generation/day is trivially within limits.
- **The validator/simulator is the quality gate**, so a weak free model is fine — invalid output is
  rejected and regenerated.

---

## 8. How to run / verify / ship (handoff mechanics)

```bash
npm install
npm run dev        # local dev (HMR) — http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run validate   # level solvability across all difficulties (must be 0 problems)
npm run simtest    # real-engine simulation (Casual must stay 7/12; 0 exceptions)
npm run build      # typecheck + production build
npm run preview    # serve build on :4173, then `npm run smoke` (Playwright boot test)
```

- **Ship:** commit to `main` and `git push` → Vercel auto-deploys. Git is already configured to the
  personal identity via the `github-personal` SSH alias. End commit messages with the project's
  `Co-Authored-By` line.
- **Supabase / Vercel env:** `VITE_SUPABASE_URL` (base URL, no `/rest/v1/`) and
  `VITE_SUPABASE_ANON_KEY` (anon public key) live in the Vercel dashboard env vars (Production +
  Preview). They're Vite build-time inlined — changing them requires a redeploy. `supabase.sql` is
  the schema (has a `difficulty` column). Never commit real keys.
- **Definition of done for any epic:** typecheck + validate + simtest + build all green; a
  browser check (screenshot via Playwright) of the new feature; Casual unchanged; committed + pushed.

---

## 9. Open questions for the owner (resolve at kickoff)

1. ~~Epic A: should the Hunter be able to **invade normal runs** unannounced?~~ **RESOLVED
   2026-07-21: yes, rarely — built** (see Epic A). Frequency is `INVASION_CHANCE` in `game.ts`.
2. Should **Hunted / Outrun become the marketed default** experience for new players, with Casual as
   the "practice" foundation?
3. Monetization intent (free forever + portals, vs premium) — shapes Epic J and hosting choice
   (Cloudflare Pages has unlimited free bandwidth if virality is the goal).
```
