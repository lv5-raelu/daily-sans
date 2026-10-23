import assert from 'node:assert/strict';
import test from 'node:test';
import { ENCOUNTER } from '../src/game/encounter.ts';
import { EMPTY_INPUT, Simulation, circleTouchesRect } from '../src/game/simulation.ts';
import type { Input } from '../src/game/simulation.ts';

function begin(): Simulation {
  const sim = new Simulation();
  sim.start();
  sim.advance(3, EMPTY_INPUT);
  assert.equal(sim.status, 'playing');
  return sim;
}

test('the countdown keeps the combat clock and attacks at zero', () => {
  const sim = new Simulation();
  sim.start();
  sim.advance(2.5, EMPTY_INPUT);
  assert.equal(sim.status, 'countdown');
  assert.equal(sim.time, 0);
  assert.equal(sim.bones.length, 0);
  sim.advance(0.5, EMPTY_INPUT);
  assert.equal(sim.status, 'playing');
  assert.equal(sim.time, 0);
});

test('diagonal movement has the same speed as horizontal movement', () => {
  const horizontal = begin();
  const diagonal = begin();
  horizontal.advance(0.2, { ...EMPTY_INPUT, right: true });
  diagonal.advance(0.2, { ...EMPTY_INPUT, right: true, up: true });
  assert.ok(Math.abs(Math.hypot(diagonal.player.x - 400, diagonal.player.y - 362) - (horizontal.player.x - 400)) < 1e-8);
});

test('opposite inputs cancel and the heart stays inside the arena', () => {
  const sim = begin();
  sim.advance(0.5, { left: true, right: true, up: true, down: true });
  assert.equal(sim.player.x, 400);
  assert.equal(sim.player.y, 362);
  sim.advance(3, { ...EMPTY_INPUT, left: true, up: true });
  assert.equal(sim.player.x, ENCOUNTER.arena.x + 5);
  assert.equal(sim.player.y, ENCOUNTER.arena.y + 5);
});

test('collision checks use a circular heart hitbox at rectangle corners', () => {
  const rect = { x: 10, y: 10, width: 20, height: 20 };
  assert.equal(circleTouchesRect(6, 6, 5, rect), false);
  assert.equal(circleTouchesRect(7, 7, 5, rect), true);
  assert.equal(circleTouchesRect(20, 20, 5, rect), true);
});

test('a hit grants a grace period instead of draining health every frame', () => {
  const sim = begin();
  sim.bones.push({ id: 999, x: 390, y: 352, width: 20, height: 20, vx: 0 });
  sim.advance(0.1, EMPTY_INPUT);
  assert.equal(sim.health, 80);
  assert.equal(sim.hits, 1);
  sim.advance(0.5, EMPTY_INPUT);
  assert.equal(sim.health, 80);
  sim.advance(0.1, EMPTY_INPUT);
  assert.equal(sim.health, 68);
  assert.equal(sim.hits, 2);
});

test('holding jump goes higher than tapping it, without automatically jumping again', () => {
  const held = begin();
  const tapped = begin();
  for (const sim of [held, tapped]) sim.advance(14.7, EMPTY_INPUT);
  assert.equal(held.mode, 'blue');
  assert.equal(held.player.grounded, true);
  for (const sim of [held, tapped]) sim.advance(0.05, { ...EMPTY_INPUT, up: true });
  held.advance(0.25, { ...EMPTY_INPUT, up: true });
  tapped.advance(0.25, EMPTY_INPUT);
  assert.ok(held.player.y < tapped.player.y - 20);
  held.advance(0.6, { ...EMPTY_INPUT, up: true });
  assert.equal(held.player.grounded, true);
  assert.equal(held.player.vy, 0);
});

test('a blaster telegraphs its lane before it can damage the heart', () => {
  const sim = begin();
  sim.advance(28.75, EMPTY_INPUT);
  assert.ok(sim.beams.length > 0);
  const health = sim.health;
  assert.ok(sim.beams[0].firesAt > sim.time);
  sim.advance(0.9, EMPTY_INPUT);
  assert.equal(sim.health, health);
  sim.advance(0.3, EMPTY_INPUT);
  assert.equal(sim.health, Math.max(0, health - 16));
});

test('standing still loses, and a terminal result stops the clock', () => {
  const sim = begin();
  sim.advance(ENCOUNTER.duration, EMPTY_INPUT);
  assert.equal(sim.status, 'lost');
  assert.equal(sim.health, 0);
  assert.ok(sim.time < ENCOUNTER.duration);
  const result = sim.result();
  sim.advance(30, { ...EMPTY_INPUT, right: true });
  assert.deepEqual(sim.result(), result);
});

test('combat outcomes are identical at 30, 60 and 144 rendering frames per second', () => {
  const outcomes = [30, 60, 144].map((fps) => {
    const sim = new Simulation();
    sim.start();
    for (let frame = 0; frame < fps * 46; frame++) sim.advance(1 / fps, EMPTY_INPUT);
    return { result: sim.result(), player: sim.player, tick: sim.tick };
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test('a delayed render frame runs the same simulation steps as smaller frames', () => {
  const once = begin();
  const many = begin();
  once.advance(0.25, { ...EMPTY_INPUT, right: true });
  for (let i = 0; i < 30; i++) many.advance(1 / 120, { ...EMPTY_INPUT, right: true });
  assert.deepEqual(once.player, many.player);
  assert.equal(once.tick, many.tick);
});

test('a retry resets health, attacks, timing and jump state', () => {
  const sim = begin();
  sim.advance(32, EMPTY_INPUT);
  sim.start();
  const fresh = new Simulation();
  fresh.start();
  assert.deepEqual(sim.result(), fresh.result());
  assert.deepEqual(sim.player, fresh.player);
  assert.deepEqual(sim.bones, []);
  assert.deepEqual(sim.beams, []);
  sim.advance(3 + 5, EMPTY_INPUT);
  fresh.advance(3 + 5, EMPTY_INPUT);
  assert.deepEqual(sim.player, fresh.player);
  assert.deepEqual(sim.bones, fresh.bones);
  assert.deepEqual(sim.result(), fresh.result());
});

// A legal sequence of movement and jump inputs exercises the whole fight.
// This does not edit the heart position, remove obstacles or disable damage.
function clearInputs(sim: Simulation): Input {
  const t = sim.time;
  if (sim.phase.mode === 'blue') {
    const nearest = sim.bones
      .map((bone) => (sim.player.x - (bone.x + bone.width / 2)) / bone.vx)
      .filter((seconds) => seconds > -0.13)
      .sort((a, b) => a - b)[0];
    return { ...EMPTY_INPUT, up: nearest !== undefined && nearest < 0.38 };
  }
  let x = 400;
  let y = 358;
  if (t >= 3.8) y = 312;
  if (t >= 6.2) y = 408;
  if (t >= 8.8) y = 350;
  if (t >= 10.6) y = 328;
  if (t >= 28) { x = 500; y = 360; }
  if (t >= 30.5) y = 310;
  if (t >= 35) y = 390;
  if (t >= 37.5) x = 400;
  if (t >= 39.3) y = 350;
  return { left: sim.player.x > x + 1, right: sim.player.x < x - 1, up: sim.player.y > y + 1, down: sim.player.y < y - 1 };
}

test('the full encounter can be cleared without taking damage using legal inputs', () => {
  const sim = begin();
  for (let frame = 0; frame < ENCOUNTER.duration * 120 + 1 && sim.status === 'playing'; frame++) {
    sim.advance(1 / 120, clearInputs(sim));
  }
  assert.equal(sim.status, 'won');
  assert.equal(sim.health, ENCOUNTER.health);
  assert.equal(sim.hits, 0);
  assert.equal(sim.time, ENCOUNTER.duration);
});
