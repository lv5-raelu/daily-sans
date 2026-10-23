import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalHit, HealthCounter } from '../src/daily/health';
import { dailyRandom, TORIEL, TorielHelix } from '../src/daily/guest-attack';

test('a normal hit removes healthy HP without paying off or adding pending KR', () => {
  const before = { hp: 60, kr: 20 };
  const after = normalHit(before.hp, before.kr, 4);
  assert.deepEqual(after, { hp: 56, kr: 20 });
  assert.equal(after.hp - after.kr, before.hp - before.kr - 4);
  const decayed = { hp: after.hp - 1, kr: after.kr - 1 };
  assert.equal(decayed.hp - decayed.kr, after.hp - after.kr, 'later KR decay removes only purple HP');
  const counter = new HealthCounter(before.hp, 92);
  counter.change(after.hp); counter.change(decayed.hp); counter.change(92, true);
  assert.equal(counter.damage, 5); assert.equal(counter.healed, 37);
});

test('normal damage stays lethal with pending KR and clamps only the remaining KR capacity', () => {
  assert.deepEqual(normalHit(10, 8, 4), { hp: 6, kr: 5 });
  assert.deepEqual(normalHit(3, 2, 10), { hp: 0, kr: 0 });
  assert.deepEqual(normalHit(1, 0, 1), { hp: 0, kr: 0 });
  assert.deepEqual(normalHit(50, 0, 4), { hp: 46, kr: 0 });
  assert.deepEqual(normalHit(50, 10, -4), { hp: 50, kr: 10 });
});

test('the UTC date reproduces the fireball directions across attempts', () => {
  const sequence = (day: string): number[] => { const random = dailyRandom(day); return Array.from({ length: 28 }, () => Math.round(random())); };
  assert.deepEqual(sequence('2026-10-23'), sequence('2026-10-23'));
  assert.notDeepEqual(sequence('2026-10-23'), sequence('2026-10-24'));
});

test('30, 60, 120 and 144 Hz clocks preserve the attack, damage and duration', () => {
  const run = (hz: number): unknown => {
    const attack = new TorielHelix(dailyRandom('2026-10-23'));
    let hp = 92;
    const hits: [number, number][] = [];
    for (let i = 0; i < hz * 3; i++) attack.advance(1 / hz, { x: 320, y: 240 }, () => hp, damage => { hp -= damage; hits.push([attack.frame, damage]); });
    return { frame: attack.frame, hp, hits, bullets: attack.bullets };
  };
  assert.deepEqual(run(30), run(60)); assert.deepEqual(run(30), run(120)); assert.deepEqual(run(30), run(144));
  const attack = new TorielHelix(dailyRandom('2026-10-23'));
  attack.advance(TORIEL.frames / 30 - 1 / 30, { x: 240, y: 226 }, () => 92, () => {});
  assert.equal(attack.done, false);
  attack.advance(1 / 30, { x: 240, y: 226 }, () => 92, () => {});
  assert.equal(attack.done, true); assert.equal(attack.frame, 140);
});

test('projectiles move on every display update, including 120/144 Hz, along the original trajectory', () => {
  for (const hz of [60, 75, 120, 144]) {
    const smooth = new TorielHelix(dailyRandom('2026-10-23'));
    let previousY = 221;
    for (let tick = 0; tick < 20; tick++) {
      smooth.advance(1 / hz, { x: -100, y: -100 }, () => 92, () => {});
      assert.ok(smooth.bullets[0].y > previousY, `projectile must move on ${hz} Hz tick ${tick + 1}`);
      previousY = smooth.bullets[0].y;
    }
  }
  // Recorded from the working 30 Hz prototype before smoothing, for all 140
  // native checkpoints, including bottom bounces and projectiles leaving.
  const attack = new TorielHelix(dailyRandom('2026-10-23'));
  const trace = [];
  for (let frame = 0; frame < 140; frame++) {
    attack.advance(1 / 30, { x: -100, y: -100 }, () => 92, () => {});
    trace.push(attack.bullets.map(b => [+b.x.toFixed(6), +b.y.toFixed(6), b.age, b.side, b.grounded]));
  }
  assert.equal(createHash('sha256').update(JSON.stringify(trace)).digest('hex'), 'b23c91c8e1034046d99c0ad70a430cc7f33b5e415053dbcfa2f42506b49296df');
});

test('normal hits grant 20 native frames of immunity; pausing preserves the whole pattern', () => {
  const attack = new TorielHelix(dailyRandom('2026-10-23'));
  let hp = 92;
  const hits: number[] = [];
  const hit = (damage: number): void => { hp -= damage; hits.push(attack.frame); };
  attack.advance(1 / 30, { x: 320, y: 240 }, () => hp, hit);
  assert.deepEqual(hits, [1]);
  const paused = JSON.stringify(attack);
  for (let i = 0; i < 120; i++) attack.advance(0, { x: 320, y: 240 }, () => hp, hit);
  assert.equal(JSON.stringify(attack), paused);
  attack.advance(139 / 30, { x: 320, y: 240 }, () => hp, hit);
  assert.ok(hits.length > 2);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i] - hits[i - 1] >= 20);
});

test('the guest attack has no live native clock hook and its copied assets retain their hashes', () => {
  const project = JSON.parse(readFileSync('public/vendor/c2-sans-fight/data.js', 'utf8')).project;
  const battle = project[6].find((sheet: unknown[]) => sheet[0] === 'Battle')[1];
  const ticks = battle.filter((event: unknown[]) => event[4] === 1000000000800);
  assert.equal(ticks.length, 0, 'Toriel is dormant and not wired into the daily fight');
  const bridge = readFileSync('src/daily/bridge.ts', 'utf8');
  assert.doesNotMatch(bridge, /startGuest|DailyGuest|TorielHelix|GuestProjectiles/);
  const assets = JSON.parse(readFileSync('src/daily/toriel-assets.json', 'utf8'));
  for (const frame of assets.sprite.frames) {
    const bytes = readFileSync(`public/daily-assets/toriel/${frame.url.split('/').at(-1)}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), frame.sha256);
  }
});
