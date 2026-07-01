import { load, save } from "../core/storage";

export type SortBy = "time" | "deaths";

export interface ScoreEntry {
  name: string;
  levelIndex: number;
  timeMs: number;
  deaths: number;
  createdAt: number;
  /** Set for the local session's own just-submitted entry (for highlighting). */
  mine?: boolean;
}

export interface Leaderboard {
  readonly isGlobal: boolean;
  submit(entry: ScoreEntry): Promise<void>;
  top(levelIndex: number, sort: SortBy, limit?: number): Promise<ScoreEntry[]>;
}

function sortEntries(list: ScoreEntry[], sort: SortBy): ScoreEntry[] {
  const arr = [...list];
  arr.sort((a, b) =>
    sort === "time"
      ? a.timeMs - b.timeMs || a.deaths - b.deaths
      : a.deaths - b.deaths || a.timeMs - b.timeMs,
  );
  return arr;
}

/** localStorage-backed board. Always available; the default when no backend. */
export class LocalLeaderboard implements Leaderboard {
  readonly isGlobal = false;
  private key = "scores";

  private all(): ScoreEntry[] {
    return load<ScoreEntry[]>(this.key, []);
  }

  async submit(entry: ScoreEntry): Promise<void> {
    const all = this.all();
    all.push({ ...entry, mine: undefined });
    // Keep the store bounded.
    save(this.key, all.slice(-500));
  }

  async top(levelIndex: number, sort: SortBy, limit = 20): Promise<ScoreEntry[]> {
    const rows = this.all().filter((e) => e.levelIndex === levelIndex);
    return sortEntries(rows, sort).slice(0, limit);
  }
}

/** Supabase REST board. Reads config from Vite env; falls back to local on error. */
export class SupabaseLeaderboard implements Leaderboard {
  readonly isGlobal = true;
  private fallback = new LocalLeaderboard();

  constructor(
    private url: string,
    private anonKey: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      "Content-Type": "application/json",
    };
  }

  async submit(entry: ScoreEntry): Promise<void> {
    // Always keep a local copy too (offline resilience + instant UI).
    await this.fallback.submit(entry);
    try {
      const res = await fetch(`${this.url}/rest/v1/scores`, {
        method: "POST",
        headers: { ...this.headers(), Prefer: "return=minimal" },
        body: JSON.stringify({
          level: entry.levelIndex,
          name: entry.name.slice(0, 24),
          time_ms: Math.round(entry.timeMs),
          deaths: entry.deaths,
        }),
      });
      if (!res.ok) throw new Error(`submit ${res.status}`);
    } catch (err) {
      console.warn("[leaderboard] global submit failed, kept local:", err);
    }
  }

  async top(levelIndex: number, sort: SortBy, limit = 20): Promise<ScoreEntry[]> {
    const order = sort === "time" ? "time_ms.asc" : "deaths.asc,time_ms.asc";
    try {
      const res = await fetch(
        `${this.url}/rest/v1/scores?level=eq.${levelIndex}&order=${order}&limit=${limit}`,
        { headers: this.headers() },
      );
      if (!res.ok) throw new Error(`top ${res.status}`);
      const rows = (await res.json()) as Array<{
        name: string;
        level: number;
        time_ms: number;
        deaths: number;
        created_at: string;
      }>;
      return rows.map((r) => ({
        name: r.name,
        levelIndex: r.level,
        timeMs: r.time_ms,
        deaths: r.deaths,
        createdAt: Date.parse(r.created_at) || 0,
      }));
    } catch (err) {
      console.warn("[leaderboard] global read failed, using local:", err);
      return this.fallback.top(levelIndex, sort, limit);
    }
  }
}

/** Chooses the backend based on env; local otherwise. */
export function createLeaderboard(): Leaderboard {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return new SupabaseLeaderboard(url, key);
  return new LocalLeaderboard();
}

// ── Local personal-best tracking (drives level-select + progress) ────────────
interface Best {
  timeMs: number;
  deaths: number;
}
export function getBest(levelIndex: number): Best | null {
  return load<Best | null>(`best:${levelIndex}`, null);
}
export function recordBest(levelIndex: number, timeMs: number, deaths: number): Best {
  const prev = getBest(levelIndex);
  const best: Best = {
    timeMs: prev ? Math.min(prev.timeMs, timeMs) : timeMs,
    deaths: prev ? Math.min(prev.deaths, deaths) : deaths,
  };
  save(`best:${levelIndex}`, best);
  return best;
}
export function getPlayerName(): string {
  return load<string>("name", "");
}
export function setPlayerName(name: string): void {
  save("name", name.slice(0, 24));
}
