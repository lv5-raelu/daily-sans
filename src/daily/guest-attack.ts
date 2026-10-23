import assets from './toriel-assets.json';

export const TORIEL = {
  id: 'toriel-helix-v1', frames: 140, interval: 5, invulnerability: 20,
  // Keep the current Sans arena's vertical placement. The pattern uses the
  // original 160 px box width, projectile sizes, and 30 Hz movement units.
  arena: { left: 240, right: 400, top: 226, bottom: 391 },
} as const;

/** Each retry receives the same fireball directions, independent of input timing. */
export function dailyRandom(day: string): () => number {
  let seed = 2166136261;
  for (const c of `${TORIEL.id}:${day}`) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let value = Math.imul(seed ^ seed >>> 15, seed | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export interface Heart { x: number; y: number }
export interface Fireball {
  x: number; y: number; age: number; vy: number; side: number; grounded: boolean; damage: number;
  fromX: number; fromY: number; toX: number; toY: number;
}

/** Follow C2's frame clock along the original time-based helix trajectory. */
export class TorielHelix {
  frame = 0;
  immune = 0;
  bullets: Fireball[] = [];
  private progress = 1;
  constructor(private random: () => number) {}
  get done(): boolean { return this.frame >= TORIEL.frames && this.progress === 1; }
  get blinking(): boolean { return this.immune > 0 && Math.floor(this.immune / 2) % 2 === 0; }

  advance(dt: number, heart: Heart, hp: () => number, hit: (damage: number) => void): void {
    let remaining = Math.max(0, dt) * 30;
    while (remaining > 1e-8 && !this.done && hp() > 0) {
      if (this.progress === 1) {
        this.frame++;
        this.prepareFrame(hp());
        this.progress = 0;
      }
      const step = Math.min(remaining, 1 - this.progress);
      remaining -= step;
      this.progress += step;
      if (1 - this.progress < 1e-8) this.progress = 1;
      this.immune = Math.max(0, this.immune - step);
      if (this.immune < 1e-8) this.immune = 0;
      this.moveAndCollide(heart, hit);
    }
  }

  private prepareFrame(hp: number): void {
    const box = TORIEL.arena;
    if ((this.frame - 1) % TORIEL.interval === 0) {
      // Toriel has 6 AT. Use the original starting defense (10) for this
      // prototype: 4 HP per hit, with her original low-HP damage reductions.
      const x = (box.left + box.right) / 2 - 3, y = box.top - 5;
      this.bullets.push({ x, y, fromX: x, fromY: y, toX: x, toY: y,
        age: 0, vy: 0.7, side: Math.round(this.random()) === 0 ? -1 : 1,
        grounded: false, damage: Math.max(1, Math.round((hp < 6 ? 1 : hp < 8 ? 2 : 6) - 10 / 5)) });
    }
    for (const bullet of this.bullets) {
      bullet.age++;
      bullet.fromX = bullet.x; bullet.fromY = bullet.y;
      const vx = bullet.side * Math.sin(this.frame / 10) * 4;
      bullet.toX = bullet.x + (vx + (bullet.grounded ? bullet.side * 0.12 : 0));
      bullet.toY = bullet.y;
      if (!bullet.grounded) {
        bullet.vy += 0.12;
        bullet.toY += bullet.vy;
        if (bullet.toY + assets.sprite.bbox[3] >= box.bottom) {
          bullet.toY = bullet.y; bullet.vy = 0; bullet.grounded = true;
        }
      }
    }
  }

  private moveAndCollide(heart: Heart, hit: (damage: number) => void): void {
    const box = TORIEL.arena;
    for (const bullet of this.bullets) {
      // C2 supplies the same elapsed time as Sans's movement. Sample every
      // browser update, landing on the original endpoints each 1/30 second.
      bullet.x = this.progress === 1 ? bullet.toX : bullet.fromX + (bullet.toX - bullet.fromX) * this.progress;
      bullet.y = this.progress === 1 ? bullet.toY : bullet.fromY + (bullet.toY - bullet.fromY) * this.progress;
    }
    this.bullets = this.bullets.filter(b => b.x + assets.sprite.bbox[2] >= box.left && b.x + assets.sprite.bbox[0] <= box.right);
    for (const bullet of this.bullets) {
      // The native fire sprite's collision mask is only [6,8]-[9,11]. The
      // existing heart uses its 16x16 collision bounds, centered on x/y.
      if (this.immune === 0 && bullet.x + assets.sprite.bbox[0] < heart.x + 8 &&
          bullet.x + assets.sprite.bbox[2] + 1 > heart.x - 8 &&
          bullet.y + assets.sprite.bbox[1] < heart.y + 8 &&
          bullet.y + assets.sprite.bbox[3] + 1 > heart.y - 8) {
        hit(bullet.damage); this.immune = TORIEL.invulnerability;
        // blt_parent destroys the projectile on a successful normal hit.
        this.bullets = this.bullets.filter(b => b !== bullet);
        break;
      }
    }
  }
}

/** Only the projectiles are rendered here; C2 still owns the heart and battle. */
export class GuestProjectiles {
  private canvas = document.createElement('canvas');
  private frames: HTMLImageElement[] = [];
  private observer?: ResizeObserver;
  private attack?: TorielHelix;
  async load(): Promise<void> {
    this.frames = await Promise.all(assets.sprite.frames.map(async frame => {
      const image = new Image(); image.src = new URL(frame.url, location.href).href;
      await image.decode(); return image;
    }));
    this.canvas.width = 640; this.canvas.height = 480;
    this.canvas.id = 'guest-projectiles'; this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'position:fixed;pointer-events:none;image-rendering:pixelated;z-index:1';
    this.canvas.hidden = true; document.body.append(this.canvas);
    this.observer = new ResizeObserver(() => this.attack ? this.draw(this.attack) : this.align());
    this.observer.observe(document.getElementById('c2canvas')!);
  }
  private align(): void {
    const native = document.getElementById('c2canvas') as HTMLCanvasElement;
    const bounds = native.getBoundingClientRect();
    // Share C2's physical pixel grid as well as its clock on Retina displays.
    if (this.canvas.width !== native.width) this.canvas.width = native.width;
    if (this.canvas.height !== native.height) this.canvas.height = native.height;
    Object.assign(this.canvas.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
  }
  draw(attack: TorielHelix): void {
    this.attack = attack;
    this.align(); this.canvas.hidden = false;
    const context = this.canvas.getContext('2d')!;
    context.resetTransform(); context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.setTransform(this.canvas.width / 640, 0, 0, this.canvas.height / 480, 0, 0);
    context.imageSmoothingEnabled = false;
    context.save();
    const box = TORIEL.arena;
    context.beginPath(); context.rect(box.left, box.top, box.right - box.left, box.bottom - box.top); context.clip();
    for (const b of attack.bullets) context.drawImage(this.frames[Math.floor(b.age / 2) % this.frames.length], b.x, b.y);
    context.restore();
  }
  clear(): void {
    this.attack = undefined; this.canvas.hidden = true;
    const context = this.canvas.getContext('2d')!;
    context.resetTransform(); context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
