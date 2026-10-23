/** Native faceemotion indexes; verified against each original sprite's pixels. */
export const FACE_ANIMATIONS: Readonly<Record<number, string>> = {
  0: 'Default', 1: 'LookLeft', 2: 'Tired1', 3: 'Wink', 4: 'ClosedEyes', 5: 'NoEyes', 9: 'Tired2',
};

/** obj_sansb_body's aspeed changes during the harder slams and final attack. */
export class GestureCadence {
  speed = 15;
  private final = false;
  private slams = false;
  observe(name: string, args: (string | number)[]): void {
    if (name === 'runattack') {
      this.final = args[0] === 'sans_final'; this.slams = false;
      this.speed = this.final || args[0] === 'sans_bonestab3' ? 30 : 15;
    } else if (this.final && name === 'sansendrepeat') this.speed = 15;
    else if (this.final && name === 'sansslamdamage' && Number(args[0]) === 1) { this.slams = true; this.speed = 30; }
    else if (this.slams && name === 'sanshead' && args[0] === 'Default') this.speed = 15;
    else if (this.slams && name === 'sanshead' && args[0] === 'Tired1') this.speed = 7.5;
  }
}

export interface Bob { torsoX: number; torsoY: number; headX: number; headY: number }
/** Native bobbing path sampled continuously for smooth 60+ FPS movement. */
export function nativeBob(mode: string, elapsed: number): Bob {
  const frame = Math.max(0, elapsed) * 30 + 1;
  const x = mode === 'Idle' || mode === 'HeadBob' ? Math.cos(frame / 6) : 0;
  const y = mode === 'Tired' ? Math.sin(frame / 15) * 4 : mode === 'Idle' || mode === 'HeadBob' ? Math.sin(frame / 3) : 0;
  return { torsoX: x, torsoY: y / 1.5, headX: 0, headY: y / 3 };
}

/** Original frame positions; native hspeed accelerates by 2 to/from 12. */
function dodgeFrame(frame: number, returning: boolean): number {
  let x = returning ? -102 : 0, speed = returning ? 0 : -12;
  for (let step = 0; step < Math.min(frame, 30); step++) {
    if (returning) { speed = Math.min(12, speed + 2); x += speed; if (x > -13) return 0; }
    else { x += speed; if (x < -60) speed = Math.min(0, speed + 2); }
  }
  return x;
}

/** Keep the native displacement/timing, filling the gaps at the display rate. */
export function nativeDodgeOffset(elapsed: number, returning: boolean): number {
  const frame = Math.max(0, Math.min(30, elapsed * 30));
  const whole = Math.floor(frame + 1e-7);
  const fraction = frame - whole;
  const from = dodgeFrame(whole, returning);
  return fraction > 1e-7 ? from + (dodgeFrame(whole + 1, returning) - from) * fraction : from;
}
