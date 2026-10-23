export interface Input { left: boolean; right: boolean; up: boolean; down: boolean; slow: boolean }
export const EMPTY_INPUT: Input = { left: false, right: false, up: false, down: false, slow: false };
export interface Rect { x: number; y: number; w: number; h: number }
export interface Bounds { left: number; top: number; right: number; bottom: number }
export interface Platform extends Rect { vx: number; vy: number; reverse: boolean; motionAge?: number; carryX?: number }

/** obj_boneplat Draw_0: position integrates before jud's native-frame speed changes. */
export function movePlatform(p: Platform, b: Bounds): void {
  p.carryX = p.vx / 30;
  p.x += p.carryX; p.y += p.vy / 30;
  if (p.motionAge !== undefined) {
    p.motionAge++;
    if (p.motionAge >= 5 && p.motionAge <= 20) p.vx += 0.25 * 30;
    if (p.motionAge === 21) p.vx = 3 * 30;
  }
  if (p.reverse && (p.x < b.left + 5 && p.vx < 0 || p.x + p.w > b.right - 5 && p.vx > 0)) p.vx *= -1;
}
export interface Soul { x: number; y: number; velocity: number; blue: boolean; gravity: number; grounded: boolean; maxFall: number; slamming: boolean; moved: boolean }

/** Original blue-soul curve, measured per 30 Hz game frame. The branches are sequential. */
export function gravityStep(speed: number, held: boolean): number {
  if (!held && speed <= -1) speed = -1;
  if (speed > 0.5 && speed < 8) speed += 0.6;
  if (speed > -1 && speed <= 0.5) speed += 0.2;
  if (speed > -4 && speed <= -1) speed += 0.5;
  if (speed <= -4) speed += 0.2;
  return Math.min(speed, 8);
}
export const direction = (n: number) => ({ x: [1, 0, -1, 0][n] ?? 0, y: [0, 1, 0, -1][n] ?? 0 });
export function overlaps(a: Rect, b: Rect): boolean { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
export function moveSoul(s: Soul, input: Input, b: Bounds, platforms: Platform[]): boolean {
  const oldX = s.x, oldY = s.y;
  const speed = input.slow ? 2.5 : 5;
  let slammed = false;
  if (!s.blue) {
    // Undertale permits faster diagonal travel; do not normalize the input vector.
    s.x += (Number(input.right) - Number(input.left)) * speed;
    s.y += (Number(input.down) - Number(input.up)) * speed;
  } else {
    const g = direction(s.gravity);
    const jump = [input.left, input.up, input.right, input.down][s.gravity];
    if (g.y) s.x += (Number(input.right) - Number(input.left)) * speed;
    else s.y += (Number(input.down) - Number(input.up)) * speed;
    if (jump && s.grounded) { s.velocity = -6; s.grounded = false; }
    if (!s.grounded && !s.slamming) s.velocity = gravityStep(s.velocity, jump);
    if (s.slamming) s.velocity = s.maxFall;
    s.x += g.x * s.velocity; s.y += g.y * s.velocity;
    s.grounded = false;
    if (s.gravity === 1 && s.velocity >= 0) {
      for (const p of platforms) {
        if (s.x + 6 > p.x && s.x - 6 < p.x + p.w && oldY + 8 <= p.y + 3 && s.y + 8 >= p.y) {
          s.y = p.y - 8; s.x += p.carryX ?? p.vx / 30; s.velocity = 0; s.grounded = true;
        }
      }
    }
  }
  const x = Math.max(b.left + 12, Math.min(b.right - 12, s.x));
  const y = Math.max(b.top + 12, Math.min(b.bottom - 12, s.y));
  const contact = s.blue && (s.gravity === 0 && s.x >= b.right - 12 || s.gravity === 1 && s.y >= b.bottom - 12 || s.gravity === 2 && s.x <= b.left + 12 || s.gravity === 3 && s.y <= b.top + 12);
  if (contact) { slammed = s.slamming; s.slamming = false; s.velocity = 0; s.grounded = true; }
  s.x = x; s.y = y;
  s.moved = Math.abs(s.x - oldX) > 0.01 || Math.abs(s.y - oldY) > 0.01;
  return slammed;
}

export class Health {
  hp = 92;
  kr = 0;
  private drain = 0;
  private touching = false;
  private previousHP = 92;
  hit(active: boolean, initialKR = 6): void {
    if (active) {
      this.hp = Math.max(0, this.hp - 1);
      this.kr = Math.min(40, Math.max(0, this.hp - 1), this.kr + (this.touching ? 1 : initialKR));
    }
    this.touching = active;
  }
  tick(): void {
    if (this.kr <= 0) { this.drain = 0; this.previousHP = this.hp; return; }
    const interval = this.kr >= 40 ? 1 : this.kr >= 30 ? 2 : this.kr >= 20 ? 5 : this.kr >= 10 ? 15 : 30;
    this.drain++;
    if (this.previousHP === this.hp && this.drain >= interval) { this.drain = 0; if (this.hp > 1) this.hp--; this.kr--; }
    this.kr = Math.min(this.kr, Math.max(0, this.hp - 1));
    this.previousHP = this.hp;
  }
  heal(amount: number): void { this.hp = Math.min(92, this.hp + amount); }
}
