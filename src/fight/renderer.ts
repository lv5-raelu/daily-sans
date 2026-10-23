import { Assets } from './assets';
import { Battle, type Bone } from './battle';

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  constructor(readonly canvas: HTMLCanvasElement, readonly assets: Assets) { this.ctx = canvas.getContext('2d', { alpha: false })!; }
  draw(b: Battle, paused: boolean): void {
    const c = this.ctx, a = this.assets;
    c.imageSmoothingEnabled = false; c.fillStyle = '#000'; c.fillRect(0, 0, 640, 480);
    if (b.mode === 'dead') { this.death(b); return; }
    c.save();
    if (b.shake) c.translate(b.frame % 2 ? 2 : -2, b.frame % 3 ? -1 : 2);
    const bob = b.animation === 'Idle' ? Math.sin(b.frame / 3) * 2 : b.animation === 'Tired' ? Math.sin(b.frame / 15) * 4 : 0;
    const dodge = b.mode === 'strike' && b.modeFrame < 30 && !['special', 'final'].includes(b.attackName) ? Math.sin(Math.min(1, b.modeFrame / 28) * Math.PI) * 70 : 0;
    const x = b.sansX - dodge;
    const headY = 130 + bob;
    if (a.original) this.originalSans(b, x);
    else if (b.body) {
      const count = b.body === 'HandUp' ? 5 : b.body === 'HandDown' ? 4 : 5;
      a.sprite(c, 't24', b.body, x, 222, 2, Math.min(count - 1, b.animationFrame / 2));
    } else { a.sprite(c, 't25', 'Standing', x, 222, 2); a.sprite(c, 't27', b.torso, x + Math.cos(b.frame / 6) * (b.mode === 'dialogue' ? 0 : 2), 178 + bob / 1.5, 2); }
    if (!a.original) { a.sprite(c, 't23', b.head, x, headY, 2, b.head === 'BlueEye' ? b.frame / 2 : 0); if (b.sweat) a.sprite(c, 't26', `Sweat${b.sweat}`, x, headY - 60, 2); }

    const z = b.bounds;
    c.fillStyle = '#fff'; c.fillRect(Math.round(z.left), Math.round(z.top), Math.round(z.right - z.left), Math.round(z.bottom - z.top));
    c.fillStyle = '#000'; c.fillRect(Math.round(z.left + 5), Math.round(z.top + 5), Math.round(z.right - z.left - 10), Math.round(z.bottom - z.top - 10));
    c.save(); c.beginPath(); c.rect(z.left + 5, z.top + 5, z.right - z.left - 10, z.bottom - z.top - 10); c.clip();
    if (b.mode === 'attack') {
      for (const bone of b.bones) this.bone(bone);
      for (const p of b.platforms) { c.fillStyle = '#00a000'; c.fillRect(Math.round(p.x), Math.round(p.y), p.w, 5); c.fillStyle = '#00ff00'; c.fillRect(Math.round(p.x), Math.round(p.y), p.w, 2); }
      for (const s of b.stabs) {
        if (!s.fired) {
          const color = b.frame % 6 < 3 ? '#ff0000' : '#ffff00'; c.fillStyle = color;
          const bounds = { ...s, age: s.warning + 0.12 }; const r = b.stabRect(bounds);
          c.globalAlpha = 0.35; c.fillRect(r.x, r.y, r.w, r.h); c.globalAlpha = 1;
        } else {
          const r = b.stabRect(s);
          if (s.dir % 2 === 1) for (let x = r.x; x < r.x + r.w; x += 10) this.bone({ x, y: r.y, w: 10, h: r.h, vx: 0, vy: 0, color: 0 });
          else for (let y = r.y; y < r.y + r.h; y += 10) this.bone({ x: r.x, y, w: r.w, h: 10, vx: 0, vy: 0, color: 0 });
        }
      }
    }
    c.restore();
    if (b.mode === 'attack') {
      for (const bl of b.blasters) {
        const t = Math.min(1, bl.age / Math.max(0.01, bl.charge));
        const ease = 1 - (1 - t) ** 3;
        const bx = bl.sx + (bl.x - bl.sx) * ease, by = bl.sy + (bl.y - bl.sy) * ease;
        c.save(); c.translate(bx, by); c.rotate(bl.angle * Math.PI / 180);
        const width = b.beamWidth(bl);
        if (width > 0) { c.fillStyle = '#fff'; c.fillRect(0, -width / 2, 1000, width); }
        if (a.original) c.rotate(-Math.PI / 2);
        a.sprite(c, 't32', bl.fired ? 'Fire' : 'Default', 0, 0, bl.scale, Math.max(0, (bl.age - bl.charge) * 30));
        c.restore();
      }
    }
    if (b.mode === 'attack' || b.mode === 'special') this.heart(b.soul.x, b.soul.y, b.soul.blue ? '#003cff' : '#ff0000', b.soul.blue ? b.soul.gravity * Math.PI / 2 : Math.PI / 2);
    if (b.mode === 'ready') {
      a.text(c, '* Press Z or ENTER to begin.', 50, 276, 'default', 2);
      a.text(c, '* Arrow keys to move.', 50, 312, 'default', 2);
      a.text(c, '* X to cancel.', 50, 348, 'default', 2);
    }
    if (b.mode === 'menu') a.text(c, b.message, 50, 276, 'default', 2);
    if (b.mode === 'submenu') {
      const options = b.menu === 0 ? ['Sans'] : b.menu === 1 ? ['Check'] : b.menu === 2 ? b.inventory.map(i => i.name) : ['Spare'];
      const page = Math.floor(b.selection / 4);
      options.slice(page * 4, page * 4 + 4).forEach((name, i) => { const x = 66 + i % 2 * 280, y = 272 + Math.floor(i / 2) * 36; a.text(c, name, x, y, 'default', 2); if (b.selection === page * 4 + i) this.heart(x - 18, y + 15); });
      if (!options.length) a.text(c, '* No items left.', 50, 276, 'default', 2);
      if (options.length > 4) a.text(c, `PAGE ${page + 1}`, 465, 360, 'battle', 2);
    }
    if (b.mode === 'target') { a.sprite(c, 't17', 'Default', 320, 320); a.sprite(c, 't20', 'Default', b.targetX, 320, 1, b.frame); }
    if (b.mode === 'strike') {
      if (b.modeFrame < 18) a.sprite(c, 't21', 'Default', 320, 150, 2, Math.min(5, Math.floor(b.modeFrame / 3)));
      if (b.modeFrame > 9) { if (a.original && b.attackName !== 'final') a.original.sprite(c, 'spr_dmgmiss_o', 320, 99, 0, 1, true); else a.text(c, b.attackName === 'final' ? '9999999' : 'MISS', b.attackName === 'final' ? 205 : 260, 80, b.attackName === 'final' ? 'damage' : 'default', b.attackName === 'final' ? 1 : 3, b.attackName === 'final' ? '#ff0000' : '#fff'); }
    }
    if (b.mode === 'dialogue') {
      if (b.speaker === 'sans') { if (a.original) a.original.sprite(c, b.introDialogue && b.dialogueIndex === 3 ? 'spr_blconsm' : 'spr_blconwdshrt', 388, 70); else a.sprite(c, 't28', 'Default', 390, 70); if (a.original && b.introDialogue && b.dialogueIndex === 3) { const style = a.original.pack.textStyles.threat; a.original.text(c, b.visibleText, 418, 86, style.font, 1, '#000', style); } else a.text(c, b.visibleText, 423, 86, 'sans', 1, '#000'); }
      else a.text(c, b.visibleText, 50, 276, 'default', 2);
    }
    if (b.mode === 'won') { c.fillStyle = '#000'; c.fillRect(0, 0, 640, 390); a.text(c, 'Fight complete.', 170, 220, 'default', 2); }
    this.hud(b);
    c.restore();
    if (b.black) { c.fillStyle = '#000'; c.fillRect(0, 0, 640, 480); }
    if (paused) { c.fillStyle = '#000b'; c.fillRect(0, 0, 640, 480); a.text(c, 'PAUSED', 230, 200, 'default', 3); a.text(c, 'ESC to resume', 190, 254, 'default', 2); }
  }
  private originalSans(b: Battle, x: number): void {
    const original = this.assets.original!, c = this.ctx;
    // Native sprite origins and draw offsets from obj_sansb_body Draw_0.
    const y = b.targetBounds.top - 130;
    const bob = b.animation === 'Idle' && b.mode !== 'dialogue' ? Math.sin(b.frame / 3) : b.animation === 'Tired' ? Math.sin(b.frame / 15) * 4 : 0;
    const sway = b.animation === 'Idle' && b.mode !== 'dialogue' ? Math.cos(b.frame / 6) : 0;
    original.sprite(c, 'spr_sansb_legs', x, y + 90, 0, 2);
    const poses: Record<string, string> = { HandDown: 'spr_sansb_handdown', HandUp: 'spr_sansb_handup', HandRight: 'spr_sansb_rightstrike', HandLeft: 'spr_sansb_rightstrike' };
    if (b.body && poses[b.body]) {
      const name = poses[b.body], count = original.pack.sprites[name].frames.length;
      const frame = Math.min(count - 1, Math.floor(b.animationFrame / 2));
      original.sprite(c, name, x, y + 42, b.body === 'HandLeft' ? count - 1 - frame : frame, 2);
    } else original.sprite(c, 'spr_sansb_torso', x + sway, y + 42 + bob / 1.5, b.torso === 'Shrug' ? 1 : 0, 2);
    if (b.head === 'BlueEye') original.sprite(c, 'spr_sansb_blueeye', x + sway, y + bob, Math.floor(b.frame / 2), 2);
    else original.sprite(c, 'spr_sansb_face', x + sway, y + bob, ({ Default: 0, LookLeft: 1, Wink: 2, ClosedEyes: 4, NoEyes: 5, Tired1: 3, Tired2: 3 } as Record<string, number>)[b.head] ?? 0, 2);
    if (b.sweat) original.sprite(c, 'spr_sansb_face_sweat', x + sway, y + bob, Math.min(2, b.sweat - 1), 2);
  }
  private hud(b: Battle): void {
    const c = this.ctx, a = this.assets;
    a.text(c, 'CHARA', 32, 404, 'battle', 3); a.text(c, 'LV 19', 144, 404, 'battle', 3);
    if (a.original) a.original.sprite(c, 'spr_hpname', 246, 405); else a.sprite(c, 't18', 'Default', 250, 420);
    c.fillStyle = '#ff0000'; c.fillRect(278, 400, 110, 20);
    c.fillStyle = '#ff00ff'; c.fillRect(278, 400, b.health.hp / 92 * 110, 20);
    c.fillStyle = '#ffff00'; c.fillRect(278, 400, Math.max(0, b.health.hp - b.health.kr) / 92 * 110, 20);
    if (a.original) a.text(c, 'KR', 398, 410, 'battle', 2); else a.sprite(c, 't19', 'Default', 420, 420);
    a.text(c, `${String(b.health.hp).padStart(2, '0')} / 92`, 434, 403, 'battle', 3, b.health.kr ? '#ff00ff' : '#fff');
    ['t11', 't10', 't12', 't13'].forEach((id, i) => { const active = (b.mode === 'menu' || b.mode === 'submenu') && b.menu === i; a.sprite(c, id, active ? 'Highlight' : 'Default', [32, 185, 345, 498][i], 432); if (active && b.mode === 'menu') this.heart([48, 201, 361, 514][i], 453); });
  }
  private heart(x: number, y: number, color = '#ff0000', rotation = Math.PI / 2): void { const c = this.ctx; c.save(); c.translate(Math.round(x), Math.round(y)); c.rotate(rotation - (this.assets.original ? Math.PI / 2 : 0)); this.assets.sprite(c, 't54', 'Default', 0, 0, 1, 0, color); c.restore(); }
  private bone(b: Bone): void {
    if (b.w <= 0 || b.h <= 0) return;
    const c = this.ctx; const vertical = b.w === 10; const im = this.assets.get(`images/bone${vertical ? 'v' : 'h'}.png`, b.color === 1 ? '#00a2e8' : b.color === 2 ? '#ffa040' : undefined);
    const x = Math.round(b.x), y = Math.round(b.y);
    if (this.assets.original) {
      c.save(); c.translate(x, y); if (!vertical) { c.translate(0, 10); c.rotate(-Math.PI / 2); }
      const length = vertical ? b.h : b.w; const color = b.color === 1 ? '#00a2e8' : b.color === 2 ? '#ffa040' : '#fff';
      c.fillStyle = color; c.fillRect(2, 5, 6, Math.max(0, length - 10));
      this.assets.original.sprite(c, 'spr_s_bonebul_top', 0, 0, 0, 1, false, color);
      this.assets.original.sprite(c, 'spr_s_bonebul_bottom', 0, Math.max(0, length - 6), 0, 1, false, color);
      c.restore(); return;
    }
    if (vertical) { const cap = Math.min(6, b.h / 2); c.drawImage(im, 0, 0, 10, 6, x, y, 10, cap); c.drawImage(im, 0, 6, 10, 12, x, y + cap, 10, Math.max(0, b.h - 2 * cap)); c.drawImage(im, 0, 18, 10, 6, x, y + b.h - cap, 10, cap); }
    else { const cap = Math.min(6, b.w / 2); c.drawImage(im, 0, 0, 6, 10, x, y, cap, 10); c.drawImage(im, 6, 0, 12, 10, x + cap, y, Math.max(0, b.w - 2 * cap), 10); c.drawImage(im, 18, 0, 6, 10, x + b.w - cap, y, cap, 10); }
  }
  private death(b: Battle): void {
    const c = this.ctx, a = this.assets;
    if (b.modeFrame < 30) { c.save(); c.translate(b.soul.x, b.soul.y); if (!a.original) c.rotate(Math.PI / 2); a.sprite(c, 't54', b.modeFrame < 12 ? 'Default' : 'Split', 0, 0, 1, 0, '#ff0000'); c.restore(); }
    else if (b.modeFrame < 75) {
      const t = b.modeFrame - 30;
      for (let i = 0; i < 6; i++) { const angle = i * Math.PI / 3; a.sprite(c, 't59', 'Default', b.soul.x + Math.cos(angle) * t * 3, b.soul.y + Math.sin(angle) * t * 3 + t * t * 0.08, 1, t / 2 + i, '#ff0000'); }
    } else {
      if (a.original) a.original.sprite(c, 'spr_gameoverbg', 0, 0); else a.text(c, 'GAME OVER', 120, 150, 'default', 4);
      a.text(c, 'Stay determined.', 160, 260, 'default', 2);
      a.text(c, 'Z / ENTER to retry', 140, 320, 'default', 2);
    }
  }
}
