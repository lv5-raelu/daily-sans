import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterOpening, DialogueProgress, finalDialogue, opening, openingThreat, parsePage, poseAt, spareDialogue, turnDialogue } from '../src/daily/dialogue';
import { FACE_ANIMATIONS, GestureCadence, nativeBob, nativeDodgeOffset } from '../src/daily/animation';
import { VoiceGate } from '../src/daily/voice';
import { HealthCounter } from '../src/daily/health';
import { RUNTIME_FIELDS as F } from '../src/daily/runtime-fields';
import { begin, dayResult, emptyHistory, left, parseHistory, previousDay, shareText, streak, totals, update, utcDay } from '../src/daily/state';

const day = '2026-10-22';
test('six attempts are enforced even after serializing and restoring daily results', () => {
  let h = emptyHistory();
  for (let i = 0; i < 6; i++) {
    begin(h, day, String(i), `${day}T12:00:00Z`);
    update(h, day, String(i), 92, 0, 'lost');
    h = parseHistory(JSON.stringify(h));
  }
  assert.equal(left(dayResult(h, day)), 0);
  assert.throws(() => begin(h, day, 'seventh', `${day}T13:00:00Z`), /No attempts/);
  assert.deepEqual(totals(dayResult(h, day)), { damage: 552, healed: 0 });
});
test('concurrent attempts, completed days, and late terminal messages cannot create retries or double count', () => {
  const h = emptyHistory(); begin(h, day, 'one', day);
  assert.throws(() => begin(h, day, 'two', day), /already in progress/);
  update(h, day, 'one', 123, 100);
  update(h, day, 'one', 120, 90);
  update(h, day, 'one', 123, 100, 'won');
  update(h, day, 'one', 999, 999, 'lost');
  assert.throws(() => begin(h, day, 'two', day), /complete/);
  assert.equal(h.days[day].attempts[0].outcome, 'won');
  assert.deepEqual(totals(dayResult(h, day)), { damage: 123, healed: 100 });
});
test('abandoned attempts stay spent and a new UTC day receives its own six attempts', () => {
  const h = emptyHistory(); begin(h, day, 'one', day); update(h, day, 'one', 17, 8, 'abandoned');
  assert.equal(left(dayResult(h, day)), 5);
  begin(h, '2026-10-23', 'two', '2026-10-23');
  assert.equal(left(dayResult(h, '2026-10-23')), 6);
  assert.deepEqual(totals(dayResult(h, '2026-10-23')), { damage: 0, healed: 0 });
});
test('UTC boundaries, leap days, streak continuation and missed-day reset', () => {
  assert.equal(utcDay(new Date('2026-10-23T00:00:00+07:00')), '2026-10-22');
  assert.equal(previousDay('2024-03-01'), '2024-02-29');
  const h = emptyHistory();
  for (const d of ['2026-10-20', '2026-10-21']) { begin(h, d, d, d); update(h, d, d, 0, 0, 'won'); }
  assert.equal(streak(h, day), 2);
  assert.equal(streak(h, '2026-10-23'), 0);
  begin(h, day, day, day); update(h, day, day, 0, 0, 'won');
  assert.equal(streak(h, day), 3);
});
test('share output preserves the four-line requested format and actual remaining attempts', () => {
  const h = emptyHistory();
  assert.equal(shareText(h, day), 'Daily Sans · Streak 0\n🟩🟩🟩🟩🟩🟩  6/6 left\n0 Damage Taken · 0 Damage Healed\ndaily-sans.github.io');
  begin(h, day, 'one', day); update(h, day, 'one', 123, 123, 'won');
  assert.equal(shareText(h, day), 'Daily Sans · Streak 1\n🟩🟩🟩🟩🟩🟩  6/6 left\n123 Damage Taken · 123 Damage Healed\ndaily-sans.github.io');
});
test('each failed or unfinished fight spends a try, while winning preserves the displayed remainder', () => {
  for (let losses = 0; losses < 6; losses++) {
    const h = emptyHistory();
    for (let i = 0; i < losses; i++) {
      begin(h, day, String(i), day);
      update(h, day, String(i), 92, 0, i % 2 ? 'abandoned' : 'lost');
    }
    begin(h, day, 'win', day);
    assert.equal(left(dayResult(h, day)), 6 - losses, 'active fights reserve their remaining try');
    update(h, day, 'win', 20, 10, 'won');
    const restored = parseHistory(JSON.stringify(h));
    assert.equal(left(dayResult(restored, day)), 6 - losses);
    assert.equal(shareText(restored, day).split('\n')[1], `${'⬛'.repeat(losses)}${'🟩'.repeat(6 - losses)}  ${6 - losses}/6 left`);
    assert.throws(() => begin(restored, day, 'extra', day), /complete/);
  }
});
test('a final failed attempt breaks the streak, while the active last attempt can still extend it', () => {
  const h = emptyHistory(); const yesterday = previousDay(day);
  begin(h, yesterday, yesterday, yesterday); update(h, yesterday, yesterday, 0, 0, 'won');
  for (let i = 0; i < 5; i++) { begin(h, day, String(i), day); update(h, day, String(i), 92, 0, 'lost'); }
  begin(h, day, 'six', day);
  assert.equal(streak(h, day), 1);
  const winning = parseHistory(JSON.stringify(h));
  update(winning, day, 'six', 50, 0, 'won');
  assert.equal(streak(winning, day), 2);
  update(h, day, 'six', 92, 0, 'lost');
  assert.equal(streak(h, day), 0);
});
test('bad saves fail closed instead of silently granting a fresh quota', () => {
  for (const raw of ['oops', '{}', '{"version":1,"days":[]}', '{"version":1,"days":{"bad":{"attempts":[]}}}']) assert.throws(() => parseHistory(raw));
  const h = emptyHistory(); begin(h, day, 'x', day);
  assert.throws(() => update(h, day, 'x', NaN, 0));
});
test('damage includes direct damage and KR; food counts actual restored HP, excluding overheal and clamps', () => {
  const hp = new HealthCounter(92, 92);
  hp.change(91); hp.change(90); // Direct contact + subsequent KR.
  hp.change(182, true); // Pie overheals; only the missing 2 HP count.
  hp.change(92); // Native clamp must not be counted as damage.
  hp.change(40); hp.change(100, true); hp.change(92);
  hp.change(-9); // Lethal damage counts only the HP actually lost.
  assert.deepEqual({ damage: hp.damage, healed: hp.healed }, { damage: 146, healed: 54 });
});
test('healing and damage within the same frame are counted separately', () => {
  const hp = new HealthCounter(30, 92);
  hp.change(70, true); hp.change(69); hp.change(68);
  assert.equal(hp.healed, 40); assert.equal(hp.damage, 2);
});
test('original dialogue has opening, post-opening and all 23 successful-Fight stages', () => {
  assert.equal(opening().length, 3); assert.equal(afterOpening().length, 2);
  assert.equal(openingThreat().length, 1);
  for (let turn = 1; turn <= 23; turn++) assert.ok(turnDialogue(turn).length, `turn ${turn}`);
  const p = new DialogueProgress();
  assert.match(p.advance(1)[0].text, /stand there/);
  assert.equal(p.advance(1).length, 0, 'food/ACT must not repeat or advance speech');
  assert.match(p.advance(2)[0].text, /massive anomaly/);
  assert.match(p.advance(23).at(-1)!.text, /survive THIS/);
});
test('native text control codes preserve line breaks, emphasis text, expressions and pauses', () => {
  const page = parsePage('\\E4well^1,&here goes/%%');
  assert.equal(page.text, 'well,\nhere goes'); assert.equal(poseAt(page, 0).face, 4); assert.equal(page.pauses[4], .1);
  assert.equal(parsePage('\\Xspecial\\R attack\\X/%%').text, 'special attack');
  assert.equal(openingThreat()[0].silent, true);
  assert.equal(openingThreat()[0].text, 'Should\nbe\nburning\nin hell.');
});
test('native initial dialogue poses include the first wink/shrug and all turn sweat changes', () => {
  assert.deepEqual(poseAt(turnDialogue(1)[0], 0), { face: 3, torso: 1, sweat: 0 });
  for (const turn of [7, 8, 9, 10, 11, 12, 14]) assert.equal(poseAt(turnDialogue(turn)[0], 0).torso, 1, `shrug turn ${turn}`);
  for (let turn = 1; turn <= 23; turn++) {
    const sweat = turn < 13 || turn === 23 ? 0 : turn < 20 || turn === 22 ? 2 : 1;
    for (const page of turnDialogue(turn)) assert.equal(page.initial.sweat, sweat, `sweat turn ${turn}`);
  }
  assert.deepEqual(finalDialogue()[0].initial, { face: 9, torso: 0, sweat: 3 });
  assert.deepEqual(spareDialogue()[0].initial, { face: 4, torso: 0, sweat: 2 });
  assert.equal(FACE_ANIMATIONS[1], 'LookLeft'); assert.equal(FACE_ANIMATIONS[2], 'Tired1'); assert.equal(FACE_ANIMATIONS[9], 'Tired2');
});
test('inline face/torso cues occur at their text positions and persist across pages', () => {
  const page = parsePage('a\\E3b\\M1c\\E5d/%%');
  assert.equal(poseAt(page, 0).face, 0);
  assert.deepEqual(poseAt(page, 1), { face: 3, torso: 0, sweat: 0 });
  assert.deepEqual(poseAt(page, 2), { face: 3, torso: 1, sweat: 0 });
  assert.deepEqual(poseAt(page, page.text.length), { face: 5, torso: 1, sweat: 0 });
  const turn = turnDialogue(18);
  assert.equal(poseAt(turn[2], 0).torso, 1, 'hey changes to a shrug');
  assert.equal(poseAt(turn[3], 0).torso, 1, 'the next page inherits the shrug');
  assert.equal(poseAt(afterOpening()[0], 0).face, 1);
  assert.equal(poseAt(afterOpening()[1], 0).torso, 1);
  for (const page of [...opening(), ...openingThreat(), ...afterOpening(), ...finalDialogue(), ...spareDialogue(), ...Array.from({ length: 23 }, (_, i) => turnDialogue(i + 1)).flat()]) {
    for (const position of [0, ...page.cues.map(cue => cue.position), page.text.length]) {
      const pose = poseAt(page, position);
      assert.ok(FACE_ANIMATIONS[pose.face], `${page.key}: face ${pose.face}`);
      assert.ok([0, 1].includes(pose.torso), `${page.key}: torso ${pose.torso}`);
    }
  }
});
test('native bobbing reproduces the original head and torso paths at 30 Hz', () => {
  for (let frame = 1; frame <= 180; frame++) {
    const idle = nativeBob('Idle', (frame - 1) / 30), tired = nativeBob('Tired', (frame - 1) / 30);
    assert.ok(Math.abs(idle.torsoX - Math.cos(frame / 6)) < 1e-10);
    assert.ok(Math.abs(idle.torsoY - Math.sin(frame / 3) / 1.5) < 1e-10);
    assert.ok(Math.abs(idle.torsoY + idle.headY - Math.sin(frame / 3)) < 1e-10);
    assert.ok(Math.abs(tired.torsoY + tired.headY - Math.sin(frame / 15) * 4) < 1e-10);
  }
  assert.deepEqual(nativeBob('', 1), { torsoX: 0, torsoY: 0, headX: 0, headY: 0 });
});
test('dodge movement follows native velocity steps and ends at the starting position', () => {
  assert.deepEqual(Array.from({ length: 13 }, (_, i) => nativeDodgeOffset(i / 30, false)), [0, -12, -24, -36, -48, -60, -72, -82, -90, -96, -100, -102, -102]);
  assert.deepEqual(Array.from({ length: 11 }, (_, i) => nativeDodgeOffset(i / 30, true)), [-102, -100, -96, -90, -82, -72, -60, -48, -36, -24, 0]);
});
test('dodge and idle motion fill the gaps between original frames at 60 Hz', () => {
  for (const returning of [false, true]) {
    for (let frame = 0; frame < 10; frame++) {
      const start = nativeDodgeOffset(frame / 30, returning);
      const end = nativeDodgeOffset((frame + 1) / 30, returning);
      const halfway = nativeDodgeOffset((frame + 0.5) / 30, returning);
      assert.ok(Math.abs(halfway - (start + end) / 2) < 1e-10);
      if (start !== end) assert.notEqual(halfway, start, 'each intermediate display frame moves');
    }
  }
  const first = nativeBob('Idle', 0), halfway = nativeBob('Idle', 1 / 60), next = nativeBob('Idle', 1 / 30);
  assert.ok(halfway.torsoX < first.torsoX && halfway.torsoX > next.torsoX);
  assert.notEqual(halfway.torsoY, first.torsoY);
});
test('gesture cadence follows native normal, fast and exhausted phases without leaking between attacks', () => {
  const cadence = new GestureCadence();
  cadence.observe('runattack', ['sans_bonestab2']); assert.equal(cadence.speed, 15);
  cadence.observe('runattack', ['sans_bonestab3']); assert.equal(cadence.speed, 30);
  cadence.observe('runattack', ['sans_final']); assert.equal(cadence.speed, 30);
  cadence.observe('sansendrepeat', []); assert.equal(cadence.speed, 15);
  cadence.observe('sansslamdamage', [1]); assert.equal(cadence.speed, 30);
  cadence.observe('sanshead', ['Default']); assert.equal(cadence.speed, 15);
  cadence.observe('sanshead', ['Tired1']); assert.equal(cadence.speed, 7.5);
  cadence.observe('runattack', ['sans_intro']); assert.equal(cadence.speed, 15);
  cadence.observe('sanshead', ['Tired1']); assert.equal(cadence.speed, 15);
});
test('gestures retain every original frame, its head attachment and the unchanged source pixels', () => {
  const metadata = JSON.parse(readFileSync('src/daily/animation-data.json', 'utf8'));
  const project = JSON.parse(readFileSync('public/vendor/c2-sans-fight/data.js', 'utf8')).project;
  const expectedCounts: Record<string, number> = { HandRight: 6, HandLeft: 6, HandDown: 5, HandUp: 6 };
  for (const anim of project[3][24][7]) {
    const gesture = metadata.gestures[anim[0]], sprite = metadata.sprites[gesture.sprite];
    assert.equal(anim[7].length, expectedCounts[anim[0]]);
    for (let i = 0; i < anim[7].length; i++) {
      const frame = anim[7][i], source = sprite.frames[gesture.frames[i]];
      assert.equal(frame[0], source.url);
      assert.deepEqual(frame[9][0], ['Head', gesture.head[i][0] / sprite.width, gesture.head[i][1] / sprite.height]);
    }
  }
  for (const sprite of Object.values(metadata.sprites) as {frames: {url: string; sha256: string}[]}[]) for (const frame of sprite.frames)
    assert.equal(createHash('sha256').update(readFileSync(`public/daily-assets/animations/${frame.url.split('/animations/')[1]}`)).digest('hex'), frame.sha256);
  const eye = project[3][23][7].find((animation: unknown[]) => animation[0] === 'BlueEye');
  assert.equal(eye[1], 15); assert.equal(eye[2], true);
});
test('speech plays once per revealed letter, without whitespace or duplicate voice triggers', () => {
  const gate = new VoiceGate();
  const text = 'alright,\ni guess you win.';
  assert.equal(gate.allow(1, 0, text), false);
  assert.equal(gate.allow(1, 1, text), true);
  assert.equal(gate.allow(1, 1, text), false);
  assert.equal(gate.allow(1, 9, text), false, 'newline is silent');
  assert.equal(gate.allow(1, 10, text), true);
  assert.equal(gate.allow(1, 11, text), false, 'space is silent');
  assert.equal(gate.allow(2, 1, text), true, 'a new page can speak the same character');
  gate.reset();
  assert.equal(gate.allow(2, 1, text), true);
});
test('the export has no alternate mode, start-menu layout, cached launcher or internal retry', () => {
  const raw = readFileSync('public/vendor/c2-sans-fight/data.js', 'utf8');
  for (const name of ['MainMenu', 'PracticeMode', 'MODE_ENDLESS', 'MODE_SINGLE', 'MODE_PRACTICE', 'SimulatorMode', 'SingleAttack']) assert.ok(!raw.includes(name), name);
  const project = JSON.parse(raw).project;
  assert.equal(project[1], 'BattleScreen');
  for (const file of ['index.html', 'player.html', 'sw.js']) assert.equal(existsSync(`public/vendor/c2-sans-fight/${file}`), false);
  const manifest = JSON.parse(readFileSync('reference/c2-sans-fight.json', 'utf8'));
  for (const [path, entry] of Object.entries(manifest.files) as [string, { sha256: string }][]) {
    if (path === 'c2runtime.js' || (path.endsWith('.csv') && path !== 'sans_intro.csv')) assert.equal(createHash('sha256').update(readFileSync(`public/vendor/c2-sans-fight/${path}`)).digest('hex'), entry.sha256);
  }
});
test('the threat follows the flash and heart reveal, using original small-bubble and font assets', () => {
  const csv = readFileSync('public/vendor/c2-sans-fight/sans_intro.csv', 'utf8');
  const rows = csv.trim().split(/\r?\n/).map(row => row.split(','));
  const locate = (name: string, value: string): number => rows.findIndex(row => row[1] === name && row[2] === value);
  assert.ok(locate('SansText', 'ready?') < locate('BlackScreen', '1'));
  assert.ok(locate('CombatZoneResizeInstant', '239') < locate('BlackScreen', '1'), 'prepare the border before the blackout hides it');
  assert.ok(locate('HeartTeleport', '320') < locate('BlackScreen', '0'));
  assert.ok(locate('BlackScreen', '0') < locate('SansHead', 'NoEyes'));
  assert.ok(locate('SansHead', 'NoEyes') < locate('SansText', '__daily_opening_threat__'));
  assert.ok(locate('SansText', '__daily_opening_threat__') < locate('SansBody', 'HandDown'));
  const combatSuffix = csv.slice(csv.indexOf('0,SansBody,HandDown,'));
  assert.equal(createHash('sha256').update(combatSuffix).digest('hex'), 'c2d90922d4745857ef2b664f5fb04dcd677d637ef9e7392a0e9bfb61ce121dd8', 'the opening attack itself remains byte-identical to upstream');
  const elapsed = (start: number, end: number): number => rows.slice(start + 1, end + 1).reduce((time, row) => time + Number(row[0]), 0);
  assert.equal(elapsed(locate('SansText', 'ready?'), locate('BlackScreen', '1')).toFixed(5), (10 / 30).toFixed(5));
  assert.equal(elapsed(locate('BlackScreen', '1'), locate('BlackScreen', '0')).toFixed(5), (8 / 30).toFixed(5));
  const metadata = JSON.parse(readFileSync('src/daily/intro-assets.json', 'utf8'));
  for (const [file, digest] of Object.entries(metadata.files)) assert.equal(createHash('sha256').update(readFileSync(`public/daily-assets/${file}`)).digest('hex'), digest);
  const project = JSON.parse(readFileSync('public/vendor/c2-sans-fight/data.js', 'utf8')).project;
  const bubble = project[3][28][7].find((animation: unknown[]) => animation[0] === 'DailyThreat');
  assert.deepEqual(bubble[7][0].slice(4, 6), [105, 108]);
  assert.equal(metadata.style.delay, 4); assert.equal(metadata.style.sound, 'snd_nosound');
  assert.equal(metadata.ambience.stopCue, 'BlackScreen,1');
  assert.equal(metadata.ambience.volume, 1); assert.equal(metadata.ambience.loop, true);
});
test('dialogue creates and positions a bubble only on its first page, with no attack-loading label', () => {
  const raw = readFileSync('public/vendor/c2-sans-fight/data.js', 'utf8');
  assert.ok(!raw.includes('LOADING ATTACKS'));
  const project = JSON.parse(raw).project;
  let first: unknown[] | undefined, reused: unknown[] | undefined;
  function walk(value: unknown): void {
    if (!Array.isArray(value)) return;
    if (value[4] === 1000000000200) first = value;
    if (value[4] === 1000000000202) reused = value;
    for (const child of value) walk(child);
  }
  walk(project[6]);
  assert.ok(first && reused);
  const firstActions = first[6] as unknown[][], laterActions = reused[6] as unknown[][];
  assert.ok(firstActions.some(a => a[3] === 5140099445205868));
  assert.equal(laterActions.some(a => a[0] === 28 || (a[0] === -1 && (a[5] as unknown[][])?.[0]?.[1] === 28)), false, 'later pages neither create nor reposition the bubble');
  assert.deepEqual(((first[5] as unknown[][])[0][9] as unknown[][])[0], [7, [20, 28, 51, false, null]]);
});
test('runtime bindings agree with the pinned third-party event graph', () => {
  const project = JSON.parse(readFileSync('public/vendor/c2-sans-fight/data.js', 'utf8')).project;
  const records = new Map<number, unknown[]>();
  function walk(value: unknown): void {
    if (!Array.isArray(value)) return;
    if (typeof value[3] === 'number') records.set(value[3], value);
    for (const child of value) walk(child);
  }
  walk(project[6]);
  const instanceIndex = (sid: number): unknown => (records.get(sid)?.[5] as unknown[][])?.[0]?.[1];
  const fight = records.get(560355816614418);
  assert.ok(fight, 'Sans reset action remains available');
  const conditions = new Map<number, unknown[]>();
  function conditionsWalk(value: unknown): void {
    if (!Array.isArray(value)) return;
    if (typeof value[7] === 'number') conditions.set(value[7], value);
    for (const child of value) conditionsWalk(child);
  }
  conditionsWalk(project[6]);
  const variable = (sid: number): unknown => (conditions.get(sid)?.[9] as unknown[][])?.[0]?.[1];
  assert.equal(variable(6518347568049467), F.sans.hitAttempts);
  assert.equal(variable(7426969151937487), F.sans.nextAttack);
  assert.equal(variable(2995307715163944), F.sans.dodgeState);
  assert.equal(variable(1791671511470734), F.sans.dodgeTimer);
  assert.equal(instanceIndex(560355816614418), F.sans.xSpeed);
  assert.equal(instanceIndex(Number(F.timerAction)), F.speech.timer);
  assert.equal(instanceIndex(8362167824849778), F.speech.currentChar);
  assert.equal(instanceIndex(9297394273649139), F.speech.voice);
  const voice = records.get(Number(F.voicePlayAction));
  assert.equal(voice?.[0], 5, 'voice play dispatch targets the Audio plugin');
  assert.equal(records.get(Number(F.audioStopAction))?.[0], 5);
  assert.equal(records.get(Number(F.setAnimationAction))?.[0], 23);
  assert.equal(instanceIndex(Number(F.bobTimerAction)), 0);
  for (const sid of F.characterActions) assert.equal(instanceIndex(Number(sid)), F.speech.currentChar);
  assert.ok(readFileSync('public/vendor/c2-sans-fight/c2runtime.js', 'utf8').includes('this.Wf=this.xa.speed'), 'the pinned Sprite playback-speed field remains available');
});
