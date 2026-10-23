export interface OriginalSprite { width: number; height: number; origin: [number, number]; bbox: number[]; frames: { url: string }[] }
export interface OriginalGlyph { x: number; y: number; w: number; h: number; shift: number; offset: number; kerning: [number, number][] }
export interface OriginalFont { url: string; width: number; height: number; emSize: number; glyphs: Record<string, OriginalGlyph>; scale: [number, number] }
export interface OriginalPack {
  schema: 1;
  source: { archiveSha256: string; steamBuildId?: string; platform: string };
  sprites: Record<string, OriginalSprite>;
  fonts: Record<string, OriginalFont>;
  sounds: Record<string, { name: string; url: string; volume: number }>;
  music: Record<string, { name: string; url: string }>;
  dialogue: Record<string, string>;
  textStyles: Record<string, { font: string; spacing: number; lineHeight: number; delay: number; sound: string }>;
}
export const originalURL = (file: string): string => `${import.meta.env.BASE_URL}undertale-original/${file}`;

export class OriginalAssets {
  private images = new Map<string, HTMLImageElement | HTMLCanvasElement>();
  constructor(readonly pack: OriginalPack) {}
  async load(): Promise<void> {
    const files = new Set([...Object.values(this.pack.sprites).flatMap(s => s.frames.map(f => f.url)), ...Object.values(this.pack.fonts).map(f => f.url)]);
    await Promise.all([...files].map(async url => { const im = new Image(); im.src = originalURL(url); await im.decode(); this.images.set(url, im); }));
  }
  image(url: string, color?: string): HTMLImageElement | HTMLCanvasElement {
    const source = this.images.get(url);
    if (!source) throw new Error(`Missing imported asset ${url}`);
    if (!color || color === '#fff') return source;
    const key = url + ':' + color;
    const cached = this.images.get(key); if (cached) return cached;
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const c = canvas.getContext('2d')!; c.drawImage(source, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, canvas.width, canvas.height);
    this.images.set(key, canvas); return canvas;
  }
  sprite(c: CanvasRenderingContext2D, name: string, x: number, y: number, frame = 0, scale = 1, centered = false, color?: string): void {
    const s = this.pack.sprites[name]; if (!s) throw new Error(`Missing original sprite ${name}`);
    const f = s.frames[Math.max(0, Math.floor(frame)) % s.frames.length];
    const [ox, oy] = centered ? [s.width / 2, s.height / 2] : s.origin;
    c.drawImage(this.image(f.url, color), Math.round(x - ox * scale), Math.round(y - oy * scale), s.width * scale, s.height * scale);
  }
  text(c: CanvasRenderingContext2D, text: string, x: number, y: number, name: string, scale = 1, color?: string, style?: { spacing: number; lineHeight: number }): void {
    const font = this.pack.fonts[name]; const image = this.image(font.url, color);
    const lineHeight = Math.max(...Object.values(font.glyphs).map(g => g.h));
    let px = x, py = y, previous = -1;
    for (const character of text) {
      if (character === '\n') { px = x; py += (style?.lineHeight ?? lineHeight) * scale; previous = -1; continue; }
      const code = character.codePointAt(0)!;
      const glyph = font.glyphs[String(code)] ?? font.glyphs['63'];
      if (!glyph) continue;
      const kerning = glyph.kerning.find(k => k[0] === previous)?.[1] ?? 0;
      px += kerning * scale;
      c.drawImage(image, glyph.x, glyph.y, glyph.w, glyph.h, Math.round(px + glyph.offset * scale), Math.round(py), glyph.w * scale, glyph.h * scale);
      px += (style?.spacing ?? glyph.shift) * scale; previous = code;
    }
  }
}
