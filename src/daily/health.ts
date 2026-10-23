/** Normal hits remove healthy HP first. Pending KR is never a damage shield. */
export function normalHit(hp: number, kr: number, damage: number): { hp: number; kr: number } {
  const next = Math.max(0, hp - Math.max(0, damage));
  // Native KR cannot drain the final HP, and a dead heart has no pending KR.
  return { hp: next, kr: Math.max(0, Math.min(kr, next - 1)) };
}

/** Count actual HP changes, with food tagged separately from resets/clamping. */
export class HealthCounter {
  damage = 0;
  healed = 0;
  private hp: number;
  constructor(hp: number, readonly maxHP: number) { this.hp = this.clamp(hp); }
  private clamp(hp: number): number { return Math.min(this.maxHP, Math.max(0, hp)); }
  change(nextHP: number, food = false): void {
    const next = this.clamp(nextHP);
    if (next < this.hp) this.damage += this.hp - next;
    else if (food) this.healed += next - this.hp;
    this.hp = next;
  }
}
