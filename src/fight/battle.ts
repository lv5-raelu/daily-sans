import reference from './reference-data.json';
import { Timeline, type TimelineHost } from './timeline';
import { Health, direction, EMPTY_INPUT, moveSoul, movePlatform, overlaps, type Bounds, type Input, type Platform, type Rect, type Soul } from './physics';
import type { OriginalPack } from './original';

export const ATTACKS = reference.attacks;
export type AttackName = keyof typeof ATTACKS;
export const PHASE_ONE: AttackName[] = ['bonegap1', 'bluebone', 'bonegap2', 'platforms1', 'platforms2', 'platforms3', 'platforms4', 'platformblaster', 'platforms4hard', 'bonegap1fast', 'boneslideh', 'bonegap2', 'platformblasterfast'];
export const PHASE_TWO: AttackName[] = ['multi1', 'randomblaster1', 'multi2', 'bonestab1', 'bonestab2', 'randomblaster2', 'boneslidev', 'multi3', 'bonestab3'];
export type Mode = 'ready' | 'dialogue' | 'attack' | 'menu' | 'submenu' | 'target' | 'strike' | 'dead' | 'special' | 'won';
export interface Bone extends Rect { vx: number; vy: number; color: number }
export interface Blaster { sx: number; sy: number; x: number; y: number; angle: number; scale: number; charge: number; hold: number; age: number; fired: boolean }
export interface Stab { dir: number; height: number; warning: number; stay: number; age: number; fired: boolean }
export interface Item { name: string; heal: number }
export const INVENTORY: Item[] = [{ name: 'ButtsPie', heal: 92 }, { name: 'I. Noodles', heal: 90 }, { name: 'FaceSteak', heal: 60 }, ...Array.from({ length: 3 }, () => ({ name: 'SnowPiece', heal: 45 })), ...Array.from({ length: 2 }, () => ({ name: 'L. Hero', heal: 40 }))];
const INTRO = ["it's a beautiful\nday outside.", 'birds are singing,\nflowers are blooming...', 'on days like these,\nkids like you...', 'Should be burning\nin hell.'];
const MENU_BOUNDS: Bounds = { left: 32, top: 250, right: 607, bottom: 390 };

export class Battle implements TimelineHost {
  mode: Mode = 'ready';
  health = new Health();
  soul: Soul = { x: 320, y: 304, blue: false, velocity: 0, gravity: 1, grounded: false, maxFall: 11, slamming: false, moved: false };
  bounds = { ...MENU_BOUNDS };
  targetBounds = { ...MENU_BOUNDS };
  zoneSpeed = 540;
  resumeAfterResize = false;
  bones: Bone[] = [];
  platforms: Platform[] = [];
  blasters: Blaster[] = [];
  stabs: Stab[] = [];
  timeline?: Timeline;
  attackName: AttackName = 'intro';
  attacks = 0;
  part = 0;
  phaseTwoPart = 0;
  turn = 0;
  frame = 0;
  modeFrame = 0;
  elapsed = 0;
  menu = 0;
  selection = 0;
  inventory = INVENTORY.map(i => ({ ...i }));
  text = '';
  textFrame = 0;
  speaker: 'sans' | 'narrator' = 'sans';
  dialogueIndex = 0;
  introDialogue = false;
  originalDialogue?: Record<string, string>;
  originalTextStyles?: OriginalPack['textStyles'];
  afterDialogue: () => void = () => {};
  head = 'Default';
  body = '';
  torso = 'Default';
  animation = 'Idle';
  animationFrame = 0;
  sweat = 0;
  sansX = 320;
  repeating = false;
  black = false;
  slamDamage = false;
  shake = 0;
  targetX = 48;
  miss = false;
  message = '* Sans.';
  eventQueue: { sound: string; rate?: number }[] = [];
  private accumulator = 0;
  private finalStrike = false;
  constructor(readonly random = Math.random) {}
  get textDelay(): number { return this.originalDialogue ? this.introDialogue && this.dialogueIndex === 3 ? this.originalTextStyles?.threat.delay ?? 4 : this.speaker === 'narrator' ? this.originalTextStyles?.narrator.delay ?? 1 : this.originalTextStyles?.sans.delay ?? 2 : 2; }
  get visibleText(): string { return this.text.slice(0, Math.floor(this.textFrame / this.textDelay)); }
  revealText(): void { this.textFrame = this.text.length * this.textDelay; }
  private intro(): string[] {
    const keys = ['obj_sansb_1079', 'obj_sansb_1080', 'obj_sansb_1081', 'obj_sansb_1152'];
    if (!this.originalDialogue || keys.some(k => !this.originalDialogue![k])) return INTRO;
    return keys.map(k => this.originalDialogue![k].replace(/\^\d+/g, '').replace(/\/%%$|\/$/g, '').replaceAll('&', '\n'));
  }
  sound(sound: string, rate = 1): void { this.eventQueue.push({ sound: sound.toLowerCase(), rate }); }
  start(skipIntro = false): void {
    const fresh = new Battle(this.random);
    fresh.originalDialogue = this.originalDialogue;
    fresh.originalTextStyles = this.originalTextStyles;
    Object.assign(this, fresh);
    if (skipIntro) this.beginAttack('intro');
    else { this.mode = 'dialogue'; this.introDialogue = true; this.dialogueIndex = 0; this.head = 'ClosedEyes'; this.sound('ambientstart'); this.say(this.intro()[0], () => this.beginAttack('intro')); }
  }
  say(text: string, after: () => void, speaker: 'sans' | 'narrator' = 'sans'): void { this.mode = 'dialogue'; this.modeFrame = 0; this.text = text; this.textFrame = 0; this.speaker = speaker; this.afterDialogue = after; }
  confirm(): void {
    if (this.mode === 'ready' || this.mode === 'dead' || this.mode === 'won') { this.start(); return; }
    if (this.mode === 'dialogue') {
      if (this.textFrame < this.text.length * this.textDelay) { this.revealText(); return; }
      if (this.introDialogue && this.dialogueIndex < this.intro().length - 1) { this.dialogueIndex++; this.text = this.intro()[this.dialogueIndex]; this.textFrame = 0; if (this.dialogueIndex === 3) this.head = 'NoEyes'; }
      else { this.introDialogue = false; this.afterDialogue(); }
      return;
    }
    if (this.mode === 'menu') {
      this.selection = 0; this.mode = 'submenu'; this.modeFrame = 0; this.sound('menuselect');
      return;
    }
    if (this.mode === 'submenu') {
      this.sound('menuselect');
      if (this.menu === 0) { this.mode = 'target'; this.modeFrame = 0; this.targetX = 48; }
      if (this.menu === 1) this.say('* SANS  1 ATK  1 DEF', () => this.nextTurn(), 'narrator');
      if (this.menu === 2 && this.inventory.length) {
        const item = this.inventory.splice(this.selection, 1)[0]; const previousHP = this.health.hp;
        this.health.heal(item.heal); this.sound('playerheal');
        this.say(`* Recovered ${this.health.hp - previousHP} HP.`, () => this.nextTurn(), 'narrator');
      }
      if (this.menu === 3) {
        if (this.attacks === 13) {
          this.beginAttack('spare');
          this.timeline = new Timeline('0,CombatZoneResize,269,286,374,391,TLResume\n0,HeartMode,0\n0,HeartTeleport,320,338\n0,TLPause\n0.5,SansTorso,Shrug\n0,BoneStab,1,100,0,30\n30,EndAttack', this, this.random);
          this.timeline.tick(0);
        } else this.nextTurn();
      }
      return;
    }
    if (this.mode === 'target') { this.attacks++; this.miss = true; this.mode = 'strike'; this.modeFrame = 0; this.sound('playerfight'); }
    else if (this.mode === 'special' && this.modeFrame >= 1200 && this.soul.y > 420 && this.soul.x < 145) { this.finalStrike = true; this.mode = 'strike'; this.modeFrame = 0; this.sound('playerfight'); }
  }
  cancel(): void { if (this.mode === 'submenu' || this.mode === 'target') { this.mode = 'menu'; this.sound('menucursor'); } }
  navigate(dx: number, dy: number): void {
    if (this.mode === 'menu') { this.menu = (this.menu + dx + 4) % 4; this.sound('menucursor'); }
    else if (this.mode === 'submenu') {
      const count = this.menu === 2 ? this.inventory.length : 1;
      if (count) this.selection = (this.selection + dx + dy * 2 + count * 2) % count;
      this.sound('menucursor');
    }
  }
  beginAttack(name: AttackName): void {
    this.mode = 'attack'; this.modeFrame = 0; this.attackName = name;
    if (name === 'intro') this.sound('ambientstop');
    this.bones = []; this.platforms = []; this.blasters = []; this.stabs = [];
    this.head = 'Default'; this.body = ''; this.animation = 'Idle'; this.torso = 'Default';
    this.zoneSpeed = 540; this.slamDamage = false; this.black = false; this.repeating = false;
    this.soul.velocity = 0; this.soul.slamming = false; this.soul.maxFall = name === 'intro' ? 25 : 16;
    this.resumeAfterResize = false;
    this.timeline = new Timeline(ATTACKS[name], this, this.random);
    // Start the first zero-delay rows before the first movement tick.
    this.timeline.tick(0);
  }
  nextTurn(): void {
    this.turn++;
    if (this.attacks >= 23) { this.beginAttack('final'); return; }
    if (this.attacks === 13) { this.beginAttack('spare'); return; }
    if (this.attacks >= 14) {
      const index = this.phaseTwoPart++;
      this.beginAttack(PHASE_TWO[index] ?? (['bonestab3', 'multi3', 'randomblaster2'] as AttackName[])[Math.floor(this.random() * 3)]);
    } else {
      const index = this.part++;
      this.beginAttack(PHASE_ONE[index] ?? PHASE_ONE[9 + Math.floor(this.random() * 4)]);
    }
  }
  endAttack(): void {
    if (this.attackName === 'final') { this.mode = 'special'; this.modeFrame = 0; this.soul.blue = true; this.soul.gravity = 1; this.soul.maxFall = 8; this.targetBounds = { left: 239, top: 226, right: 404, bottom: 391 }; this.head = 'Tired2'; this.sweat = 3; this.sound('musicstop'); return; }
    this.mode = 'menu'; this.modeFrame = 0; this.targetBounds = { ...MENU_BOUNDS }; this.zoneSpeed = 540;
    this.soul.blue = false; this.bones = []; this.stabs = []; this.blasters = []; this.platforms = [];
    this.head = 'Default'; this.body = ''; this.animation = 'Idle';
    this.health.hit(false);
    this.message = this.attackName === 'spare' ? '* Sans is sparing you.' : '* Sans.';
    if (this.attackName === 'intro') this.sound('musicstart');
  }
  advance(seconds: number, input: Input = EMPTY_INPUT): void {
    this.accumulator += seconds;
    while (this.accumulator + 1e-9 >= 1 / 30) { this.accumulator -= 1 / 30; this.tick(input); }
  }
  tick(input: Input): void {
    this.frame++; this.modeFrame++; this.textFrame++; this.animationFrame++; this.shake = Math.max(0, this.shake - 1);
    if (this.mode === 'dead' && this.modeFrame === 30) this.sound('heartshatter');
    if (this.mode !== 'ready' && this.mode !== 'dead' && this.mode !== 'won') { this.elapsed += 1 / 30; this.health.tick(); }
    if (this.mode === 'dialogue' && !(this.originalDialogue && this.introDialogue && this.dialogueIndex === 3) && this.textFrame % this.textDelay === 0 && this.textFrame <= this.text.length * this.textDelay && !/\s/.test(this.text[Math.floor(this.textFrame / this.textDelay)] ?? ' ')) this.sound(this.speaker === 'sans' ? 'sansspeak' : 'battletext');
    let resizing = false;
    for (const key of ['left', 'top', 'right', 'bottom'] as const) {
      const d = this.targetBounds[key] - this.bounds[key];
      if (Math.abs(d) > 0.01) { this.bounds[key] += Math.sign(d) * Math.min(Math.abs(d), this.zoneSpeed / 30); resizing = true; }
    }
    if (this.resumeAfterResize && !resizing) { this.resumeAfterResize = false; if (this.timeline) this.timeline.paused = false; }
    if (this.mode === 'strike') {
      if (this.modeFrame === 8) this.sound('menuselect');
      if (this.modeFrame > 42) { if (this.finalStrike) { this.mode = 'won'; this.sound('musicstop'); } else this.nextTurn(); }
    }
    if (this.mode === 'target') { this.targetX += 12; if (this.targetX > 600) { this.mode = 'strike'; this.modeFrame = 0; this.miss = false; } }
    if (this.mode === 'special') {
      if (this.modeFrame >= 1200) { this.head = 'ClosedEyes'; this.soul.blue = false; if (input.left && this.soul.x <= this.bounds.left + 13) { this.targetBounds.left = 32; this.zoneSpeed = 90; } if (input.down && this.soul.x < 145) { this.targetBounds.bottom = 460; this.zoneSpeed = 90; } }
      moveSoul(this.soul, input, this.bounds, []);
    }
    if (this.mode !== 'attack') return;
    this.timeline?.tick(1 / 30);
    // EndAttack can change the mode synchronously.
    if ((this.mode as Mode) !== 'attack') return;
    for (const p of this.platforms) movePlatform(p, this.bounds);
    const slammed = moveSoul(this.soul, input, this.bounds, this.platforms);
    if (slammed) { this.sound('slam'); this.sound('playerdamaged'); this.shake = 8; if (this.slamDamage && this.health.hp > 1) this.health.hp--; }
    const hitbox = { x: this.soul.x - 8, y: this.soul.y - 8, w: 16, h: 16 };
    let hit = false, initialKR = 6;
    for (const bone of this.bones) {
      bone.x += bone.vx / 30; bone.y += bone.vy / 30;
      if (bone.x + bone.w < this.bounds.left + 5 || bone.x > this.bounds.right - 5 || bone.y + bone.h < this.bounds.top + 5 || bone.y > this.bounds.bottom - 5) continue;
      const body = bone.w === 10 ? { x: bone.x + 2, y: bone.y + 5, w: 6, h: Math.max(0, bone.h - 11) } : { x: bone.x + 5, y: bone.y + 2, w: Math.max(0, bone.w - 11), h: 6 };
      if (body.w > 0 && body.h > 0 && overlaps(hitbox, body) && (bone.color === 0 || bone.color === 1 && this.soul.moved || bone.color === 2 && !this.soul.moved)) hit = true;
    }
    for (const s of this.stabs) {
      s.age += 1 / 30;
      if (s.age >= s.warning && !s.fired) { s.fired = true; this.sound('bonestab'); }
      if (s.fired && s.age <= s.warning + s.stay + 0.3 && overlaps(hitbox, this.stabRect(s))) hit = true;
    }
    for (const b of this.blasters) {
      b.age += 1 / 30;
      if (b.age >= b.charge && !b.fired) { b.fired = true; this.sound(b.scale > 2 ? 'gasterblast2' : 'gasterblast'); this.shake = 4; }
      const width = this.beamWidth(b);
      if (width <= 2) continue;
      const rad = b.angle * Math.PI / 180;
      const dx = this.soul.x - b.x, dy = this.soul.y - b.y;
      const along = dx * Math.cos(rad) + dy * Math.sin(rad);
      const across = Math.abs(-dx * Math.sin(rad) + dy * Math.cos(rad));
      if (along > 0 && across < width / 2 + 3) { hit = true; initialKR = 10; }
    }
    this.health.hit(hit, initialKR);
    if (hit && this.frame % 3 === 0) this.sound('playerdamaged');
    this.stabs = this.stabs.filter(s => s.age < s.warning + s.stay + 0.7);
    this.blasters = this.blasters.filter(b => b.age < b.charge + b.hold + 0.8);
    this.bones = this.bones.filter(b => b.x > -8000 && b.x < 10000 && b.y > -8000 && b.y < 10000);
    if (this.health.hp <= 0) { this.mode = 'dead'; this.modeFrame = 0; this.sound('musicstop'); this.sound('heartsplit'); }
  }
  stabRect(s: Stab): Rect {
    const b = this.bounds;
    const rise = Math.min(1, Math.max(0, (s.age - s.warning) * 10));
    const retract = Math.min(1, Math.max(0, (s.age - s.warning - s.stay - 0.15) * 6));
    const h = s.height * rise * (1 - retract);
    return s.dir === 0 ? { x: b.right - 5 - h, y: b.top + 5, w: h, h: b.bottom - b.top - 10 } : s.dir === 1 ? { x: b.left + 5, y: b.bottom - 5 - h, w: b.right - b.left - 10, h } : s.dir === 2 ? { x: b.left + 5, y: b.top + 5, w: h, h: b.bottom - b.top - 10 } : { x: b.left + 5, y: b.top + 5, w: b.right - b.left - 10, h };
  }
  beamWidth(b: Blaster): number {
    const time = b.age - b.charge;
    if (time < 0) return 0;
    return b.scale * 18 * Math.max(0, Math.min(1, time * 12, (b.hold + 0.45 - time) * 4));
  }
  command(op: string, a: string[], v: (s: string) => number): void {
    const n = a.map(v);
    if (op === 'CombatZoneResize' || op === 'CombatZoneResizeInstant') {
      this.targetBounds = { left: n[0], top: n[1], right: n[2], bottom: n[3] };
      if (op.endsWith('Instant')) this.bounds = { ...this.targetBounds };
      this.resumeAfterResize = a[4] === 'TLResume';
    } else if (op === 'CombatZoneSpeed') this.zoneSpeed = n[0];
    else if (op === 'HeartTeleport') { this.soul.x = n[0]; this.soul.y = n[1]; this.soul.velocity = 0; this.soul.grounded = false; }
    else if (op === 'HeartMode') { this.soul.blue = !!n[0]; this.soul.gravity = 1; this.soul.velocity = 0; this.soul.slamming = false; }
    else if (op === 'HeartMaxFallSpeed') this.soul.maxFall = n[0] / 30;
    else if (op === 'SansSlam') { this.soul.blue = true; this.soul.gravity = n[0]; this.soul.slamming = true; this.soul.grounded = false; this.sound('ding'); }
    else if (op === 'SansSlamDamage') this.slamDamage = !!n[0];
    else if (op === 'GetHeartPos') { if (this.timeline) { this.timeline.vars[a[0]] = this.soul.x; this.timeline.vars[a[1]] = this.soul.y; } }
    else if (/^Bone[HV](Repeat)?$/.test(op)) {
      const d = direction(n[3]); const vertical = op.startsWith('BoneV'); const count = op.endsWith('Repeat') ? n[5] : 1;
      for (let i = 0; i < count; i++) this.bones.push({ x: n[0] - i * d.x * (n[6] || 0), y: n[1] - i * d.y * (n[6] || 0), w: vertical ? 10 : n[2], h: vertical ? n[2] : 10, vx: d.x * n[4], vy: d.y * n[4], color: op.endsWith('Repeat') ? 0 : n[5] || 0 });
    } else if (op === 'SineBones') {
      for (let i = 0; i < n[0]; i++) {
        const x = this.bounds.right + i * Math.abs(n[1]); const gap = 274 + Math.sin(i / 3) * n[3];
        this.bones.push({ x, y: this.bounds.top + 5, w: 10, h: gap - this.bounds.top - 5, vx: -n[2], vy: 0, color: 0 }, { x, y: gap + 40, w: 10, h: this.bounds.bottom - gap - 45, vx: -n[2], vy: 0, color: 0 });
      }
    } else if (op === 'Platform' || op === 'PlatformRepeat') {
      const d = direction(n[3]); const count = op === 'Platform' ? 1 : n[5];
      for (let i = 0; i < count; i++) { const reverse = op === 'Platform' && !!n[5]; this.platforms.push({ x: n[0] - i * d.x * (n[6] || 0), y: n[1] - i * d.y * (n[6] || 0), w: n[2], h: 5, vx: reverse ? 0 : d.x * n[4], vy: d.y * n[4], reverse, ...(reverse ? { motionAge: 0 } : {}) }); }
    } else if (op === 'GasterBlaster') {
      this.blasters.push({ sx: n[1], sy: n[2], x: n[3], y: n[4], angle: n[5], scale: n[0] + 1, charge: n[6], hold: n[7], age: 0, fired: false }); this.sound('gasterblaster');
    } else if (op === 'BoneStab') { this.stabs.push({ dir: n[0], height: n[1], warning: n[2], stay: n[3], age: 0, fired: false }); this.sound('warning'); }
    else if (op === 'SansHead') this.head = a[0];
    else if (op === 'SansBody') { this.body = a[0]; this.animationFrame = 0; }
    else if (op === 'SansTorso') this.torso = a[0];
    else if (op === 'SansAnimation') { this.body = ''; this.animation = a[0] || 'Idle'; this.animationFrame = 0; }
    else if (op === 'SansSweat') this.sweat = n[0];
    else if (op === 'SansX') this.sansX = n[0];
    else if (op === 'SansRepeat') this.repeating = true;
    else if (op === 'SansEndRepeat') this.repeating = false;
    else if (op === 'SansText') { /* Simulator-only dialogue is intentionally omitted. */ }
    else if (op === 'BlackScreen') { this.black = !!n[0]; if (this.black) { this.bones = []; this.stabs = []; this.blasters = []; } }
    else if (op === 'Sound') this.sound(a[0], n[1] || 1);
    else if (op === 'EndAttack') this.endAttack();
    else throw new Error(`Unimplemented attack instruction: ${op}`);
  }
}
