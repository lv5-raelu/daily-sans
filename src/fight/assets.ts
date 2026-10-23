import reference from './reference-data.json';
import { OriginalAssets, originalURL, type OriginalPack } from './original';

export class Assets {
  original?: OriginalAssets;
  private images = new Map<string, HTMLImageElement | HTMLCanvasElement>();
  async load(): Promise<void> {
    const response = await fetch(originalURL('manifest.json'));
    if (response.ok && response.headers.get('content-type')?.includes('json')) {
      const pack = await response.json() as OriginalPack;
      if (pack.schema !== 1 || !pack.sprites?.spr_sansb_face || !pack.fonts?.fnt_comicsans || !pack.music?.battle) throw new Error('Invalid original asset manifest. Run npm run import:undertale.');
      this.original = new OriginalAssets(pack);
      await this.original.load();
    } else if (response.status !== 404 && response.headers.get('content-type')?.includes('json')) throw new Error(`Original assets failed to load (${response.status})`);
    const urls = new Set(reference.sprites.flatMap(s => s.animations.flatMap(a => a.frames.map(f => f.url))).filter(n => !/(touch|vpad)/.test(n)));
    ['bonev', 'boneh', 'battlefont', 'defaultfont', 'sansfont', 'damagefont', 'platform1', 'platform2'].forEach(n => urls.add(`images/${n}.png`));
    await Promise.all([...urls].map(async url => {
      const im = new Image(); im.src = `${import.meta.env.BASE_URL}undertale/${url}`;
      await im.decode(); this.images.set(url, im);
    }));
  }
  get(name: string, color?: string): HTMLImageElement | HTMLCanvasElement {
    const base = this.images.get(name);
    if (!base) throw new Error(`Missing sprite ${name}`);
    if (!color || color === '#fff') return base;
    const key = name + color; const existing = this.images.get(key); if (existing) return existing;
    const canvas = document.createElement('canvas'); canvas.width = base.width; canvas.height = base.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(base, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.images.set(key, canvas); return canvas;
  }
  sprite(ctx: CanvasRenderingContext2D, id: string, animation: string, x: number, y: number, scale = 1, frame = 0, color?: string): void {
    if (this.original) {
      const buttons: Record<string, string> = { t10: 'spr_talkbt', t11: 'spr_fightbt', t12: 'spr_itembt', t13: 'spr_sparebt' };
      if (buttons[id]) { this.original.sprite(ctx, buttons[id], x, y, animation === 'Highlight' ? 1 : 0, scale); return; }
      const centered: Record<string, string> = { t17: 'spr_target', t20: 'spr_targetchoice', t21: 'spr_strike', t32: 'spr_gasterblaster', t59: 'spr_heartshards' };
      if (centered[id]) { this.original.sprite(ctx, centered[id], x, y, id === 't32' && animation === 'Fire' ? 1 + frame % 5 : frame, scale, true); return; }
      if (id === 't54') { this.original.sprite(ctx, animation === 'Split' ? 'spr_heartbreak' : color && color !== '#ff0000' ? 'spr_heartblue' : 'spr_heart', x, y, frame, scale, true); return; }
    }
    const type = reference.sprites.find(s => s.id === id)!;
    const anim = type.animations.find(a => a.name === animation) ?? type.animations[0];
    const f = anim.frames[Math.max(0, Math.floor(frame)) % anim.frames.length];
    ctx.drawImage(this.get(f.url, color), f.x, f.y, f.w, f.h, Math.round(x - f.w * f.ox * scale), Math.round(y - f.h * f.oy * scale), f.w * scale, f.h * scale);
  }
  text(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, kind: 'battle' | 'default' | 'sans' | 'damage' = 'default', scale = 1, color = '#fff'): void {
    if (this.original) { const style = kind === 'sans' ? this.original.pack.textStyles.sans : kind === 'default' ? this.original.pack.textStyles.narrator : undefined; this.original.text(ctx, text, x, y, style?.font ?? { battle: 'fnt_small', default: 'fnt_main', sans: 'fnt_comicsans', damage: 'fnt_dmg' }[kind], kind === 'default' ? scale / 2 : scale, color, style); return; }
    const [w, h] = kind === 'battle' ? [6, 6] : kind === 'sans' ? [16, 16] : kind === 'damage' ? [33, 32] : [10, 16];
    const sheet = this.get(`images/${kind}font.png`, color);
    const columns = Math.floor(sheet.width / w); let px = x, py = y;
    for (const char of text) {
      if (char === '\n') { px = x; py += (h + 3) * scale; continue; }
      const index = char.charCodeAt(0) - 32;
      if (index >= 0 && index < columns * Math.floor(sheet.height / h)) ctx.drawImage(sheet, index % columns * w, Math.floor(index / columns) * h, w, h, Math.round(px), Math.round(py), w * scale, h * scale);
      px += (kind === 'sans' ? 9 : w) * scale;
    }
  }
}
