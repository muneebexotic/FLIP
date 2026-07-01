# FLIP

**Gravity is a suggestion.** A precision browser platformer built around one mechanic: flip
gravity to survive — but your energy drains the whole time you're upside down, and running
out mid-flip is instant death. Race the clock, beat your death count, share the run.

Runs on desktop and mobile browsers. No install, no accounts. ~12 KB of gzipped JS.

- **Play locally:** `npm install && npm run dev` → open the printed URL.
- **Controls:** `A/D` or `←/→` move · `Space`/`W`/`↑` jump · `Shift`/`S`/`↓` flip · `R` retry · `Esc` pause. On touch devices, on-screen buttons appear automatically.

---

## Why this stack

| Concern | Choice | Rationale |
| --- | --- | --- |
| Language / build | **TypeScript + Vite** | Type safety across a non-trivial engine; Vite gives instant HMR (essential for tuning game feel) and a tiny static production bundle. |
| Rendering & physics | **Canvas 2D + hand-rolled fixed-timestep engine** | A Celeste-class precision platformer needs *deterministic* physics and full control over collision resolution. Generic engines (Phaser, etc.) add weight and fight against tight coyote-time / variable-jump feel. No pixel art → no sprite pipeline; Canvas 2D draws clean vector shapes fast. |
| Leaderboard | **Pluggable adapter — localStorage by default, Supabase when configured** | The game ships and is fully playable/deployable *immediately* with local scores. A single Supabase table upgrades it to a global board with zero server code. |
| Share card | **Client-side canvas → PNG + Web Share API** | No backend. Native share sheet on mobile; image download + copied caption on desktop. |
| Hosting | **Static build → any static host** | It's a static bundle. Configs included for Netlify and Vercel; works equally on Cloudflare Pages / GitHub Pages / S3. |

## The core mechanic

Gravity has a signed direction. `Flip` inverts it: "down" becomes up and you fall toward the
ceiling. The **energy meter** drains continuously while you're flipped and only refills when
you're standing on a *normal-gravity* floor — ceilings are never a refuel, so every flip is a
visible countdown (great for spectators). Empty the meter while flipped and you die.

Every level is designed around this: wide floor-spike gaps you cross by briefly flipping to a
ceiling and back; ceiling spikes that force you to stay low; long crossings that push your
energy budget to its limit.

Feel details, all tunable in [`src/config.ts`](src/config.ts): 120 Hz fixed-timestep sim with
render interpolation, coyote time, jump buffering, variable jump height, asymmetric
rise/fall gravity, squash-and-stretch, screen shake, particle bursts, and a satisfying death
+ instant respawn (no loading between attempts).

## Project layout

```
src/
  config.ts          all tuning: physics, energy, world palettes
  core/              loop (fixed timestep), input, math/AABB, audio (WebAudio SFX), storage
  engine/            physics (AABB↔tilegrid), camera (follow + shake), particles
  game/              player controller, level model, levels data, renderer, HUD, game state machine
  ui/                DOM screens, leaderboard adapters, share card generator
  main.ts            app shell: canvas sizing, loop wiring, touch controls
scripts/
  validate-levels.ts structural + energy-budget solvability checks
  sim-test.ts        headless simulation of the REAL engine (physics + a scripted bot)
```

## Scripts

```bash
npm run dev        # dev server with HMR
npm run build      # typecheck + production build → dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm run validate   # verify every level is structurally solvable & within the energy budget
npm run simtest    # run the real physics/player against levels with a bot (engine smoke test)
```

`validate` and `simtest` bundle through esbuild and run on Node — they exercise the actual
game modules, so they catch level-design mistakes (impassable columns, crossings too long for
the energy budget) and physics regressions without a browser.

## Levels

Levels are ASCII grids in [`src/game/levels.ts`](src/game/levels.ts). Legend:
`#` solid · `^` hazard · `P` spawn · `G` goal · `.` empty. A `corridor()` helper wraps a
ceiling and floor around your interior rows. 12 handcrafted levels ship across 4 worlds
(Dusk / Ember / Bloom / Void), each with its own palette, ramping from "learn to jump" to
tight energy-limited alternation. Run `npm run validate` after editing.

## Global leaderboard (optional)

The game works out of the box with a **local** leaderboard. To enable the **global** board:

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase.sql`](supabase.sql) in the SQL editor (creates the `scores` table + RLS).
3. Copy `.env.example` → `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   from Supabase → Project Settings → API.
4. Rebuild. The client auto-detects the config and switches to the global board, keeping a
   local copy as offline fallback.

## Deploy

Static build, so any host works. Set the Supabase env vars in your host's dashboard if you
want the global board.

- **Netlify:** connect the repo (config in `netlify.toml`) or `npx netlify deploy --prod`.
- **Vercel:** `npx vercel --prod` (config in `vercel.json`).
- **Cloudflare Pages:** build command `npm run build`, output dir `dist`.
- **GitHub Pages / any static host:** `npm run build` and serve `dist/`.

## Out of scope for v1

Story/cutscenes, unlockables, full sound design (only synth SFX), and auth beyond anonymous
leaderboard names — matching the brief.
