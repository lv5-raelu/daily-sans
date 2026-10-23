import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Battle, ATTACKS, type AttackName } from '../src/fight/battle';
import { Timeline } from '../src/fight/timeline';
import { EMPTY_INPUT, Health, gravityStep, moveSoul, movePlatform, type Soul, type Platform } from '../src/fight/physics';
import reference from '../src/fight/reference-data.json';

function seeded(seed: number): () => number { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

test('every attack and random branch terminates, keeps valid geometry, and leaves the timeline unpaused', () => {
  // Health is replenished here solely to exercise all timeline instructions, not to prove that a player can clear them.
  for (const name of Object.keys(ATTACKS) as AttackName[]) {
    for (let seed = 1; seed <= 20; seed++) {
      const b = new Battle(seeded(seed)); b.beginAttack(name);
      let frames = 0;
      while (b.mode === 'attack' && frames++ < 30 * 180) {
        b.health.hp = 92; b.health.kr = 0; b.tick(EMPTY_INPUT);
        for (const n of [b.soul.x, b.soul.y, ...Object.values(b.bounds), ...b.bones.flatMap(o => [o.x, o.y, o.w, o.h]), ...b.blasters.flatMap(o => [o.x, o.y, o.angle])]) assert.ok(Number.isFinite(n), `${name} seed ${seed}: invalid geometry`);
        b.eventQueue.length = 0;
      }
      assert.notEqual(b.mode, 'attack', `${name} seed ${seed}: stuck at line ${b.timeline!.pc + 1}`);
      assert.equal(b.mode, name === 'final' ? 'special' : 'menu');
    }
  }
});

test('one-based jumps, labels, relative jumps, arithmetic, and waits execute in order', () => {
  const events: number[] = [];
  const csv = '0,SET,I,0\n0,:Loop\n0,ADD,I,$I,1\n0.1,Emit,$I\n0,JMPL,Loop,$I,3\n0,JMPREL,2\n0,Emit,999\n0,EndAttack';
  const t = new Timeline(csv, { command(op, args, v) { if (op === 'Emit') events.push(v(args[0])); } });
  t.tick(0); assert.deepEqual(events, []);
  for (let i = 0; i < 10; i++) t.tick(1 / 30);
  assert.deepEqual(events, [1, 2, 3]); assert.equal(t.ended, true);
});

test('blue soul uses the sequential gravity branches and releasing jump shortens the arc', () => {
  assert.equal(gravityStep(-6, true), -5.8);
  assert.equal(gravityStep(-6, false), -0.5);
  assert.equal(gravityStep(0.4, true), 0.6000000000000001);
  function jump(hold: boolean): number {
    const s: Soul = { x: 320, y: 378, blue: true, gravity: 1, velocity: 0, grounded: true, maxFall: 16, slamming: false, moved: false };
    let top = s.y;
    for (let i = 0; i < 45; i++) { moveSoul(s, { ...EMPTY_INPUT, up: i === 0 || hold && i < 25 }, { left: 100, top: 100, right: 540, bottom: 390 }, []); top = Math.min(top, s.y); }
    assert.equal(s.y, 378); return top;
  }
  assert.ok(jump(true) < jump(false) - 30);
});

test('red movement matches native speed, diagonal travel, slow key, and arena bounds', () => {
  const s: Soul = { x: 320, y: 300, blue: false, gravity: 1, velocity: 0, grounded: false, maxFall: 16, slamming: false, moved: false };
  const bounds = { left: 240, top: 225, right: 405, bottom: 390 };
  moveSoul(s, { ...EMPTY_INPUT, right: true, up: true }, bounds, []); assert.equal(s.x, 325); assert.equal(s.y, 295);
  moveSoul(s, { ...EMPTY_INPUT, right: true, slow: true }, bounds, []); assert.equal(s.x, 327.5);
  for (let i = 0; i < 100; i++) moveSoul(s, { ...EMPTY_INPUT, right: true, up: true }, bounds, []);
  assert.equal(s.x, 393); assert.equal(s.y, 237);
});

test('continuous contact damages every native frame, KR caps at 40 and never kills by itself', () => {
  const h = new Health();
  h.hit(true); assert.equal(h.hp, 91); assert.equal(h.kr, 6);
  h.hit(true); assert.equal(h.hp, 90); assert.equal(h.kr, 7);
  for (let i = 0; i < 40; i++) h.hit(true);
  assert.equal(h.kr, 40);
  h.hp = 2; h.kr = 1;
  for (let i = 0; i < 1000; i++) h.tick();
  assert.equal(h.hp, 1); assert.equal(h.kr, 0);
});

test('healing consumes one item, caps HP, preserves outstanding KR and does not advance attack attempts', () => {
  const b = new Battle(); b.health.hp = 20; b.health.kr = 5; b.mode = 'menu'; b.menu = 2;
  b.confirm(); b.confirm();
  assert.equal(b.inventory.length, 7); assert.equal(b.health.hp, 92); assert.equal(b.health.kr, 5); assert.equal(b.attacks, 0);
  b.textFrame = 999; b.confirm();
  assert.equal(b.mode, 'attack'); assert.equal(b.attackName, 'bonegap1');
});

test('phase two advances by turns even when healing and the mercy break remains until attacked', () => {
  const b = new Battle(); b.attacks = 13; b.nextTurn(); assert.equal(b.attackName, 'spare');
  b.endAttack(); b.nextTurn(); assert.equal(b.attackName, 'spare');
  b.attacks = 14; b.nextTurn(); assert.equal(b.attackName, 'multi1');
  b.endAttack(); b.nextTurn(); assert.equal(b.attackName, 'randomblaster1'); assert.equal(b.attacks, 14);
  b.endAttack(); b.nextTurn(); assert.equal(b.attackName, 'multi2');
  b.attacks = 23; b.nextTurn(); assert.equal(b.attackName, 'final');
});

test('blue bones permit a stationary grounded soul but punish actual movement', () => {
  const b = new Battle(); b.beginAttack('bluebone'); b.timeline!.paused = true; b.resumeAfterResize = false;
  b.bounds = { left: 100, top: 100, right: 540, bottom: 390 }; b.targetBounds = { ...b.bounds };
  b.soul.x = 320; b.soul.y = 378; b.soul.blue = true; b.soul.grounded = true;
  b.bones = [{ x: 315, y: 280, w: 10, h: 106, vx: 0, vy: 0, color: 1 }];
  b.tick(EMPTY_INPUT); assert.equal(b.health.hp, 92);
  b.tick({ ...EMPTY_INPUT, right: true }); assert.equal(b.health.hp, 91);
});

test('a successful timing input advances the fight, missing the timing window does not', () => {
  const b = new Battle(); b.mode = 'target'; b.confirm();
  assert.equal(b.attacks, 1);
  for (let i = 0; i < 43; i++) b.tick(EMPTY_INPUT);
  assert.equal(b.attackName, 'bonegap1');
  const missed = new Battle(); missed.mode = 'target'; missed.targetX = 600; missed.tick(EMPTY_INPUT);
  for (let i = 0; i < 43; i++) missed.tick(EMPTY_INPUT);
  assert.equal(missed.attacks, 0);
});

test('fixed native clock gives identical outcomes at 30, 60 and 144 display frames per second', () => {
  const run = (hz: number) => { const b = new Battle(seeded(4)); b.beginAttack('intro'); for (let i = 0; i < hz * 4; i++) b.advance(1 / hz, { ...EMPTY_INPUT, up: i < hz * 2 }); return { hp: b.health.hp, kr: b.health.kr, x: b.soul.x, y: b.soul.y, mode: b.mode, frame: b.frame }; };
  assert.deepEqual(run(30), run(60)); assert.deepEqual(run(30), run(144));
});

test('the opening can be survived using only legal movement inputs and no health overrides', () => {
  const b = new Battle(); b.beginAttack('intro');
  let frames = 0;
  while (b.mode === 'attack' && frames < 600) { b.tick({ ...EMPTY_INPUT, up: frames < 41 }); frames++; }
  assert.equal(b.mode, 'menu'); assert.ok(b.health.hp > 0);
  assert.ok(b.health.hp < 92); // The trace actually exercises damage and KR.
});

test('the moving platform follows the installed game’s initial 21-frame acceleration trace', () => {
  const p: Platform = { x: 151, y: 336, w: 41, h: 5, vx: 0, vy: 0, reverse: true, motionAge: 0 };
  const bounds = { left: 113, top: 231, right: 548, bottom: 391 };
  for (let i = 0; i < 5; i++) movePlatform(p, bounds);
  assert.equal(p.x, 151); assert.equal(p.vx, 7.5);
  for (let i = 0; i < 15; i++) movePlatform(p, bounds);
  assert.equal(p.x, 181); assert.equal(p.vx, 120);
  movePlatform(p, bounds); assert.equal(p.x, 185); assert.equal(p.vx, 90);
  assert.equal(p.carryX, 4);
});

test('original opening text survives retries and uses separate reveal speeds and a silent final line', () => {
  const b = new Battle();
  b.originalDialogue = { obj_sansb_1079: 'first&line./', obj_sansb_1080: 'second^1./', obj_sansb_1081: 'third./%%', obj_sansb_1152: 'final&line./%%' };
  b.start(); assert.equal(b.text, 'first\nline.');
  for (let i = 0; i < 3; i++) { b.revealText(); b.confirm(); }
  assert.equal(b.text, 'final\nline.'); assert.equal(b.textDelay, 4);
  b.eventQueue.length = 0;
  for (let i = 0; i < 12; i++) b.tick(EMPTY_INPUT);
  assert.equal(b.eventQueue.some(e => e.sound === 'sansspeak'), false);
  b.revealText(); assert.equal(b.visibleText, b.text); b.confirm(); assert.equal(b.mode, 'attack');
  b.start(); assert.equal(b.text, 'first\nline.');
  b.say('Recovered HP.', () => {}, 'narrator'); assert.equal(b.textDelay, 1);
});

test('every referenced sprite frame fits its local PNG and all required game effects exist', () => {
  for (const s of reference.sprites) for (const a of s.animations) for (const f of a.frames) {
    if (/(touch|vpad)/.test(f.url)) continue;
    const png = readFileSync(new URL(`../public/undertale/${f.url}`, import.meta.url));
    assert.ok(f.x + f.w <= png.readUInt32BE(16)); assert.ok(f.y + f.h <= png.readUInt32BE(20));
  }
  for (const name of ['gasterblaster', 'gasterblast', 'bonestab', 'sansspeak', 'playerdamaged', 'playerheal', 'menuselect', 'slam']) assert.ok(existsSync(new URL(`../public/undertale/media/${name}.ogg`, import.meta.url)));
});
