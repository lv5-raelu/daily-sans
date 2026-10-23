import { ENCOUNTER } from './game/encounter';
import type { RunResult } from './game/simulation';

export interface Stats {
  attempts: number;
  clears: number;
  bestSeconds: number;
  bestHealth: number;
  lastResult?: RunResult;
}

const KEY = `daily-sans:${ENCOUNTER.id}`;
const emptyStats = (): Stats => ({ attempts: 0, clears: 0, bestSeconds: 0, bestHealth: 0 });

export function loadStats(): Stats {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof data !== 'object' || data === null) return emptyStats();
    const stats = data as Record<string, unknown>;
    if (['attempts', 'clears', 'bestSeconds', 'bestHealth'].some((key) => typeof stats[key] !== 'number' || !Number.isFinite(stats[key]) || (stats[key] as number) < 0)) return emptyStats();
    return {
      attempts: Math.floor(stats.attempts as number),
      clears: Math.floor(stats.clears as number),
      bestSeconds: Math.min(ENCOUNTER.duration, stats.bestSeconds as number),
      bestHealth: Math.min(ENCOUNTER.health, stats.bestHealth as number),
    };
  } catch { return emptyStats(); }
}

export function saveStats(stats: Stats): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
    return true;
  } catch { return false; }
}

export function recordResult(stats: Stats, result: RunResult): Stats {
  return {
    ...stats,
    clears: stats.clears + Number(result.won),
    bestSeconds: Math.max(stats.bestSeconds, result.seconds),
    bestHealth: result.won ? Math.max(stats.bestHealth, result.health) : stats.bestHealth,
    lastResult: result,
  };
}
