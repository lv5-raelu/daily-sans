import assets from './intro-assets.json';

interface Glyph { x: number; y: number; w: number; h: number; offset: number }
interface FontInstance { hb: (number | string | boolean)[] }
interface Bubble { x: number; y: number }

/** The game's silent threat uses fnt_plain, unlike the simulator's Sans font. */
export class ThreatText {
  private canvas = document.createElement('canvas');
  private ink = document.createElement('canvas');
  private frame = 0;
  private font?: FontInstance;
  private bubble?: Bubble;

  async load(): Promise<void> {
    const atlas = new Image();
    atlas.src = new URL('../../daily-assets/plain.png', location.href).href;
    await atlas.decode();
    this.ink.width = atlas.width; this.ink.height = atlas.height;
    const ink = this.ink.getContext('2d')!;
    ink.drawImage(atlas, 0, 0);
    ink.globalCompositeOperation = 'source-in';
    ink.fillStyle = '#000'; ink.fillRect(0, 0, atlas.width, atlas.height);
    this.canvas.width = 640; this.canvas.height = 480;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.id = 'threat-text';
    this.canvas.style.cssText = 'position:fixed;pointer-events:none;image-rendering:pixelated;z-index:2';
    this.canvas.hidden = true;
    document.body.append(this.canvas);
  }

  show(font: FontInstance, bubble: Bubble): void {
    if (this.font === font) return;
    this.hide();
    this.font = font; this.bubble = bubble;
    this.canvas.hidden = false;
    this.draw();
  }

  hide(): void {
    cancelAnimationFrame(this.frame);
    this.font = undefined; this.bubble = undefined;
    this.canvas.hidden = true;
  }

  private draw = (): void => {
    if (!this.font || !this.bubble) return;
    const bounds = document.getElementById('c2canvas')!.getBoundingClientRect();
    Object.assign(this.canvas.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
    const context = this.canvas.getContext('2d')!;
    context.clearRect(0, 0, 640, 480);
    context.imageSmoothingEnabled = false;
    const text = String(this.font.hb[2]).slice(0, Number(this.font.hb[5]));
    const start = this.bubble.x + 30;
    let x = start, y = this.bubble.y + 16;
    for (const character of text) {
      if (character === '\n') { x = start; y += assets.style.lineHeight; continue; }
      const glyph = (assets.font.glyphs as Record<string, Glyph>)[String(character.codePointAt(0))];
      if (glyph) context.drawImage(this.ink, glyph.x, glyph.y, glyph.w, glyph.h, Math.round(x + glyph.offset), Math.round(y), glyph.w, glyph.h);
      x += assets.style.spacing;
    }
    this.frame = requestAnimationFrame(this.draw);
  };
}
