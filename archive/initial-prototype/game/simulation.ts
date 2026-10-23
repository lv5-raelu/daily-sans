import { ATTACKS, ENCOUNTER, phaseAt } from './encounter';
import type { Attack, SoulMode } from './encounter';

export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export const EMPTY_INPUT: Input = { left: false, right: false, up: false, down: false };

export interface Bone {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
}

export interface Beam {
  id: number;
  axis: 'horizontal' | 'vertical';
  position: number;
  width: number;
  createdAt: number;
  firesAt: number;
  endsAt: number;
}

export type FightStatus = 'ready' | 'countdown' | 'playing' | 'won' | 'lost';

export interface RunResult {
  encounterId: string;
  version: number;
  won: boolean;
  seconds: number;
  health: number;
  hits: number;
  damageTaken: number;
  phase: string;
}

const RADIUS = 5;
const arena = ENCOUNTER.arena;
const FLOOR = arena.y + arena.height - RADIUS;

export class Simulation {
  status: FightStatus = 'ready';
  tick = 0;
  countdown = 3;
  health: number = ENCOUNTER.health;
  hits = 0;
  damageTaken = 0;
  mode: SoulMode = 'red';
  player = { x: 400, y: 362, vy: 0, grounded: false };
  bones: Bone[] = [];
  beams: Beam[] = [];
  hitUntil = 0;
  private accumulator = 0;
  private attackIndex = 0;
  private nextId = 0;
  private jumpHeld = false;
  private jumpBuffer = 0;
  private coyote = 0;

  get time(): number { return this.tick * ENCOUNTER.step; }
  get phase() { return phaseAt(this.time); }
  get finished(): boolean { return this.status === 'won' || this.status === 'lost'; }

  start(): void {
    this.status = 'countdown';
    this.tick = 0;
    this.countdown = 3;
    this.health = ENCOUNTER.health;
    this.hits = 0;
    this.damageTaken = 0;
    this.mode = 'red';
    this.player = { x: 400, y: 362, vy: 0, grounded: false };
    this.bones = [];
    this.beams = [];
    this.hitUntil = 0;
    this.accumulator = 0;
    this.attackIndex = 0;
    this.nextId = 0;
    this.jumpHeld = false;
    this.jumpBuffer = 0;
    this.coyote = 0;
  }

  // A single clock drives movement, attacks, damage and results. Render rate is independent.
  advance(seconds: number, input: Input): void {
    if (this.status !== 'playing' && this.status !== 'countdown') return;
    this.accumulator += Math.max(0, seconds);
    while (this.accumulator + 1e-9 >= ENCOUNTER.step) {
      this.accumulator -= ENCOUNTER.step;
      if (this.status === 'countdown') {
        this.countdown = Math.max(0, this.countdown - ENCOUNTER.step);
        if (this.countdown < 1e-8) this.status = 'playing';
      } else {
        this.step(input);
      }
      if (this.finished) {
        this.accumulator = 0;
        break;
      }
    }
  }

  result(): RunResult {
    return {
      encounterId: ENCOUNTER.id,
      version: ENCOUNTER.version,
      won: this.status === 'won',
      seconds: Math.min(this.time, ENCOUNTER.duration),
      health: this.health,
      hits: this.hits,
      damageTaken: this.damageTaken,
      phase: this.phase.name,
    };
  }

  private step(input: Input): void {
    const dt = ENCOUNTER.step;
    const nextMode = this.phase.mode;
    if (nextMode !== this.mode) {
      this.mode = nextMode;
      this.player.vy = 0;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.jumpHeld = input.up;
      // Clear the previous phase so transitions never create an unavoidable hit.
      this.bones = [];
      this.beams = [];
    }

    const dx = Number(input.right) - Number(input.left);
    if (this.mode === 'red') {
      const dy = Number(input.down) - Number(input.up);
      const length = Math.hypot(dx, dy) || 1;
      this.player.x += (dx / length) * 172 * dt;
      this.player.y += (dy / length) * 172 * dt;
    } else {
      this.player.x += dx * 172 * dt;
      this.jumpBuffer = input.up && !this.jumpHeld ? 0.12 : Math.max(0, this.jumpBuffer - dt);
      this.coyote = this.player.grounded ? 0.08 : Math.max(0, this.coyote - dt);
      if (this.jumpBuffer > 0 && this.coyote > 0) {
        this.player.vy = -350;
        this.player.grounded = false;
        this.jumpBuffer = 0;
        this.coyote = 0;
      }
      if (!input.up && this.player.vy < -155) this.player.vy = -155;
      this.player.vy += 900 * dt;
      this.player.y += this.player.vy * dt;
      this.player.grounded = this.player.y >= FLOOR;
      if (this.player.grounded) this.player.vy = 0;
      if (this.player.y <= arena.y + RADIUS) this.player.vy = Math.max(0, this.player.vy);
    }
    this.jumpHeld = input.up;
    this.player.x = clamp(this.player.x, arena.x + RADIUS, arena.x + arena.width - RADIUS);
    this.player.y = clamp(this.player.y, arena.y + RADIUS, FLOOR);

    while (this.attackIndex < ATTACKS.length && ATTACKS[this.attackIndex].at <= this.time + 1e-8) {
      this.spawn(ATTACKS[this.attackIndex++]);
    }
    this.bones.forEach((bone) => { bone.x += bone.vx * dt; });
    this.bones = this.bones.filter((bone) => bone.x > arena.x - 80 && bone.x < arena.x + arena.width + 80);
    this.beams = this.beams.filter((beam) => this.time < beam.endsAt);

    const touchingBone = this.bones.some((bone) => circleTouchesRect(this.player.x, this.player.y, RADIUS, bone));
    const touchingBeam = this.beams.some((beam) => {
      if (this.time < beam.firesAt) return false;
      return Math.abs((beam.axis === 'horizontal' ? this.player.y : this.player.x) - beam.position) < beam.width / 2 + RADIUS;
    });
    if ((touchingBone || touchingBeam) && this.time >= this.hitUntil) {
      const damage = Math.min(this.health, touchingBeam ? 16 : 12);
      this.health -= damage;
      this.damageTaken += damage;
      this.hits++;
      this.hitUntil = this.time + 0.65;
    }
    this.tick++;
    if (this.health <= 0) this.status = 'lost';
    else if (this.time + 1e-8 >= ENCOUNTER.duration) this.status = 'won';
  }

  private spawn(attack: Attack): void {
    if (attack.kind === 'beam') {
      this.beams.push({
        id: this.nextId++, axis: attack.axis, position: attack.position, width: attack.width,
        createdAt: this.time, firesAt: this.time + attack.warning, endsAt: this.time + attack.warning + attack.duration,
      });
      return;
    }
    const x = attack.from === 'left' ? arena.x - 22 : arena.x + arena.width + 4;
    const vx = attack.speed * (attack.from === 'left' ? 1 : -1);
    if (attack.kind === 'gap') {
      const gapSize = 90;
      const topHeight = Math.max(0, attack.gap - gapSize / 2 - arena.y);
      const bottomY = Math.min(arena.y + arena.height, attack.gap + gapSize / 2);
      if (topHeight > 0) this.bones.push({ id: this.nextId++, x, y: arena.y, width: 15, height: topHeight, vx });
      if (bottomY < arena.y + arena.height) this.bones.push({ id: this.nextId++, x, y: bottomY, width: 15, height: arena.y + arena.height - bottomY, vx });
    } else {
      this.bones.push({ id: this.nextId++, x, y: arena.y + arena.height - attack.height, width: 20, height: attack.height, vx });
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function circleTouchesRect(x: number, y: number, radius: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  const nearestX = clamp(x, rect.x, rect.x + rect.width);
  const nearestY = clamp(y, rect.y, rect.y + rect.height);
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2;
}
