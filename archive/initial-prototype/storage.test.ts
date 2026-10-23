import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStats, recordResult, saveStats } from '../src/storage.ts';
import { ENCOUNTER } from '../src/game/encounter.ts';
import type { RunResult } from '../src/game/simulation.ts';

function storageWith(value: string | null, blocked = false): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => { if (blocked) throw new Error('blocked'); return value; },
      setItem: () => { if (blocked) throw new Error('full'); },
    },
  });
}

test('corrupt or blocked storage falls back to a playable fresh session', () => {
  for (const value of ['bad json', 'null', '{}', '{"attempts":-1}', '{"attempts":"12","clears":0,"bestSeconds":0,"bestHealth":0}']) {
    storageWith(value);
    assert.deepEqual(loadStats(), { attempts: 0, clears: 0, bestSeconds: 0, bestHealth: 0 });
  }
  storageWith(null, true);
  const stats = loadStats();
  assert.equal(stats.attempts, 0);
  assert.equal(saveStats(stats), false);
});

test('recording results retains the best survival and counts successful clears', () => {
  storageWith('{"attempts":3,"clears":0,"bestSeconds":25,"bestHealth":0}');
  const result: RunResult = { encounterId: ENCOUNTER.id, version: 1, won: false, seconds: 12, health: 0, hits: 8, damageTaken: 92, phase: 'Find your feet' };
  const failed = recordResult(loadStats(), result);
  assert.equal(failed.bestSeconds, 25);
  assert.equal(failed.clears, 0);
  const cleared = recordResult(failed, { ...result, won: true, seconds: 42, health: 44 });
  assert.equal(cleared.bestSeconds, 42);
  assert.equal(cleared.bestHealth, 44);
  assert.equal(cleared.clears, 1);
});
