import { ENCOUNTER } from './encounter';
import type { Simulation } from './simulation';

const WHITE = 0xeeeae0;
const ORANGE = 0xf49b58;
const BLUE = 0x78aeef;

export class FightScene {
  private graphics: CanvasGraphics;
  private dialogue: CanvasLabel;
  private caption: CanvasLabel;
  private countdown: CanvasLabel;
  private clock = 0;
  private frameId = 0;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly canvas: HTMLCanvasElement;

  constructor(private readonly simulation: Simulation, private readonly onFrame: (delta: number) => void, parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 480;
    this.canvas.setAttribute('aria-label', 'Fight arena: move your heart to dodge bones and marked beam lanes.');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('tabindex', '-1');
    parent.append(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('This browser does not support the Canvas 2D renderer.');
    ctx.imageSmoothingEnabled = false;
    this.graphics = new CanvasGraphics(ctx);
    this.dialogue = new CanvasLabel(ctx, 484, 116, 15, '#eeeae0');
    this.caption = new CanvasLabel(ctx, 400, 258, 10, '#76766d', 'center');
    this.countdown = new CanvasLabel(ctx, 400, 350, 48, '#f49b58', 'center');
    let previous = performance.now();
    const frame = (now: number) => {
      this.update((now - previous) / 1000);
      previous = now;
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  destroy(): void { cancelAnimationFrame(this.frameId); this.canvas.remove(); }

  private update(delta: number): void {
    this.clock += Math.min(delta, 0.05);
    this.onFrame(delta);
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    const sim = this.simulation;
    const a = ENCOUNTER.arena;
    const running = sim.status === 'playing' || sim.status === 'countdown';
    g.clear();

    // A quiet, pixel-built hallway; all artwork is drawn here, without external assets.
    g.fillStyle(0x151512);
    g.fillRect(116, 38, 32, 171);
    g.fillRect(120, 35, 24, 5);
    g.fillRect(110, 208, 44, 6);
    g.fillRect(652, 38, 32, 171);
    g.fillRect(656, 35, 24, 5);
    g.fillRect(646, 208, 44, 6);
    g.lineStyle(1, 0x1b1b17);
    g.lineBetween(80, 220, 720, 220);
    g.lineBetween(145, 215, 655, 215);
    for (let i = 0; i < 7; i++) {
      const x = 165 + i * 78;
      g.lineBetween(x, 220, 400 + (x - 400) * 1.65, 245);
    }
    this.drawSkeleton(g, 400, 70 + (this.reducedMotion ? 0 : Math.round(Math.sin(this.clock * 1.8) * 2)), sim.status === 'won');

    const quotes = sim.status === 'won' ? '* huh.\n  you kept going.'
      : sim.status === 'lost' ? '* take your time.\n  i\'ll be here.'
      : sim.mode === 'blue' ? '* feeling a little\n  blue?'
      : sim.time >= 28 ? '* almost there.\n  probably.'
      : '* nice day for\n  a bad time.';
    this.dialogue.setText(quotes);

    g.fillStyle(0x0d0d0c);
    g.fillRect(a.x, a.y, a.width, a.height);
    g.lineStyle(2, running && sim.mode === 'blue' ? BLUE : 0xb8b8ab);
    g.strokeRect(a.x - 2, a.y - 2, a.width + 4, a.height + 4);

    // Small cut marks keep the arena grounded in the surrounding layout.
    g.lineStyle(1, 0x424238);
    for (const x of [a.x - 12, a.x + a.width + 12]) {
      g.lineBetween(x, a.y - 2, x, a.y + 8);
      g.lineBetween(x, a.y + a.height - 8, x, a.y + a.height + 2);
    }

    if (sim.status === 'ready') {
      this.drawHeart(g, 400, 362, ORANGE, 2);
    } else if (running) {
      for (const beam of sim.beams) {
        const warning = sim.time < beam.firesAt;
        const horizontal = beam.axis === 'horizontal';
        const x = horizontal ? a.x : beam.position - beam.width / 2;
        const y = horizontal ? beam.position - beam.width / 2 : a.y;
        const width = horizontal ? a.width : beam.width;
        const height = horizontal ? beam.width : a.height;
        if (warning) {
          g.fillStyle(ORANGE, this.reducedMotion ? 0.13 : 0.06 + Math.sin(this.clock * 18) ** 2 * 0.09);
          g.fillRect(x, y, width, height);
          g.lineStyle(1, ORANGE, 0.65);
          if (horizontal) {
            g.lineBetween(x, y, x + width, y);
            g.lineBetween(x, y + height, x + width, y + height);
          } else {
            g.lineBetween(x, y, x, y + height);
            g.lineBetween(x + width, y, x + width, y + height);
          }
        } else {
          g.fillStyle(BLUE, 0.25);
          g.fillRect(x - (horizontal ? 0 : 5), y - (horizontal ? 5 : 0), width + (horizontal ? 0 : 10), height + (horizontal ? 10 : 0));
          g.fillStyle(WHITE);
          g.fillRect(x, y, width, height);
        }
        this.drawBlaster(g, horizontal ? a.x - 26 : beam.position, horizontal ? beam.position : a.y - 25, !horizontal, warning);
      }

      for (const bone of sim.bones) {
        // Clip entering bones to the arena without using a GPU mask.
        const x = Math.max(a.x, bone.x);
        const right = Math.min(a.x + a.width, bone.x + bone.width);
        if (right <= x) continue;
        const width = right - x;
        g.fillStyle(WHITE);
        g.fillRect(x + width * 0.3, bone.y + 3, width * 0.4, Math.max(0, bone.height - 6));
        g.fillRect(x, bone.y + 2, width, 5);
        g.fillRect(x, bone.y + bone.height - 7, width, 5);
        g.fillRect(x + width * 0.12, bone.y, width * 0.26, 3);
        g.fillRect(x + width * 0.62, bone.y, width * 0.26, 3);
        g.fillRect(x + width * 0.12, bone.y + bone.height - 3, width * 0.26, 3);
        g.fillRect(x + width * 0.62, bone.y + bone.height - 3, width * 0.26, 3);
      }

      if (this.reducedMotion || sim.time >= sim.hitUntil || Math.floor(this.clock * 16) % 2 === 0) {
        this.drawHeart(g, sim.player.x, sim.player.y, sim.mode === 'blue' ? BLUE : 0xf66b64, 1.5);
      }
    } else if (sim.status === 'won') {
      this.drawHeart(g, 400, 362, ORANGE, 2);
    } else {
      const burst = this.reducedMotion ? 0.5 : Math.min(1, (this.clock % 3) / 2);
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        g.fillStyle(0xf66b64, 0.8);
        g.fillRect(400 + Math.cos(angle) * (15 + burst * 20), 355 + Math.sin(angle) * (12 + burst * 14), 3, 4);
      }
    }

    this.caption.setText(!running ? 'YOUR SOUL. YOUR MOVE.' : sim.mode === 'blue' ? 'BLUE SOUL  /  JUMP TO DODGE' : 'RED SOUL  /  MOVE FREELY');
    this.caption.setColor(sim.mode === 'blue' && running ? '#78aeef' : '#76766d');
    this.countdown.setText(sim.status === 'countdown' ? String(Math.ceil(sim.countdown)) : '');
    this.countdown.setVisible(sim.status === 'countdown');
    if (running && sim.time < sim.hitUntil) {
      g.lineStyle(2, 0xf66b64, 0.3);
      g.strokeRect(a.x - 3, a.y - 3, a.width + 6, a.height + 6);
    }
    this.dialogue.render();
    this.caption.render();
    this.countdown.render();
  }

  private drawHeart(g: CanvasGraphics, x: number, y: number, color: number, scale: number): void {
    const rows = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000'];
    g.fillStyle(color);
    rows.forEach((row, iy) => [...row].forEach((pixel, ix) => {
      if (pixel === '1') g.fillRect(Math.round(x + (ix - 4) * scale), Math.round(y + (iy - 3.5) * scale), scale, scale);
    }));
  }

  private drawSkeleton(g: CanvasGraphics, center: number, y: number, won: boolean): void {
    const unit = 3;
    const x = center - 42;
    const rect = (rx: number, ry: number, w: number, h: number, color: number) => {
      g.fillStyle(color);
      g.fillRect(x + rx * unit, y + ry * unit, w * unit, h * unit);
    };
    // An original placeholder sprite: skull, zipped jacket, shorts and slippers.
    rect(6, 1, 16, 2, WHITE);
    rect(4, 3, 20, 3, WHITE);
    rect(3, 6, 22, 8, WHITE);
    rect(5, 14, 18, 3, WHITE);
    rect(8, 17, 12, 2, WHITE);
    rect(6, 7, 6, 4, 0x111110);
    rect(16, 7, 6, 4, 0x111110);
    if (!won) rect(18, 8, 2, 2, 0x78aeef);
    rect(13, 11, 2, 2, 0x111110);
    rect(7, 13, 14, 1, 0x111110);
    rect(8, 14, 1, 1, 0x111110);
    rect(11, 14, 1, 1, 0x111110);
    rect(15, 14, 1, 1, 0x111110);
    rect(19, 14, 1, 1, 0x111110);
    rect(5, 20, 18, 3, 0xbec5c5);
    rect(3, 23, 22, 13, 0x4a7898);
    rect(1, 24, 4, 10, 0x4a7898);
    rect(23, 24, 4, 10, 0x4a7898);
    rect(6, 23, 16, 3, WHITE);
    rect(11, 23, 6, 12, WHITE);
    rect(13, 25, 2, 11, 0x434341);
    rect(4, 32, 5, 3, 0x31546e);
    rect(19, 32, 5, 3, 0x31546e);
    rect(6, 36, 16, 6, 0x242426);
    rect(13, 38, 2, 4, 0x10100f);
    rect(7, 42, 5, 3, WHITE);
    rect(16, 42, 5, 3, WHITE);
    rect(4, 45, 9, 3, 0xc7b9b1);
    rect(15, 45, 9, 3, 0xc7b9b1);
    rect(4, 48, 9, 1, 0x776f69);
    rect(15, 48, 9, 1, 0x776f69);
  }

  private drawBlaster(g: CanvasGraphics, x: number, y: number, vertical: boolean, warning: boolean): void {
    g.fillStyle(warning ? 0xb99a7b : WHITE);
    if (vertical) {
      g.fillRect(x - 12, y - 10, 24, 18);
      g.fillRect(x - 8, y + 8, 16, 8);
      g.fillStyle(0x10100f);
      g.fillRect(x - 8, y - 5, 5, 5);
      g.fillRect(x + 3, y - 5, 5, 5);
      g.fillRect(x - 3, y + 6, 6, 10);
    } else {
      g.fillRect(x - 10, y - 12, 18, 24);
      g.fillRect(x + 8, y - 8, 8, 16);
      g.fillStyle(0x10100f);
      g.fillRect(x - 5, y - 8, 5, 5);
      g.fillRect(x - 5, y + 3, 5, 5);
      g.fillRect(x + 6, y - 3, 10, 6);
    }
  }
}

class CanvasGraphics {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}
  clear(): void { this.ctx.clearRect(0, 0, 800, 480); }
  fillStyle(color: number, alpha = 1): void { this.ctx.fillStyle = rgba(color, alpha); }
  fillRect(x: number, y: number, width: number, height: number): void { this.ctx.fillRect(x, y, width, height); }
  lineStyle(width: number, color: number, alpha = 1): void { this.ctx.lineWidth = width; this.ctx.strokeStyle = rgba(color, alpha); }
  strokeRect(x: number, y: number, width: number, height: number): void { this.ctx.strokeRect(x, y, width, height); }
  lineBetween(x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.stroke();
  }
}

class CanvasLabel {
  private text = '';
  private visible = true;
  constructor(private readonly ctx: CanvasRenderingContext2D, private readonly x: number, private readonly y: number, private readonly size: number, private color: string, private readonly align: CanvasTextAlign = 'left') {}
  setText(text: string): void { this.text = text; }
  setColor(color: string): void { this.color = color; }
  setVisible(visible: boolean): void { this.visible = visible; }
  render(): void {
    if (!this.visible) return;
    this.ctx.font = `${this.size}px monospace`;
    this.ctx.textAlign = this.align;
    this.ctx.textBaseline = 'top';
    this.ctx.fillStyle = this.color;
    this.text.split('\n').forEach((line, index) => this.ctx.fillText(line, this.x, this.y + index * (this.size + 9)));
  }
}

function rgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;
}
