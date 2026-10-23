const EFFECTS = ['battletext', 'bonestab', 'ding', 'flash', 'gasterblast', 'gasterblast2', 'gasterblaster', 'heartshatter', 'heartsplit', 'menucursor', 'menuselect', 'playerdamaged', 'playerfight', 'playerheal', 'sansspeak', 'slam', 'warning'];
export class FightAudio {
  muted = false;
  paused = false;
  private context?: AudioContext;
  private gain?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private voices = new Map<string, AudioBufferSourceNode>();
  readonly music = new Audio();
  readonly ambient = new Audio();
  private pack?: OriginalPack;
  private musicStarted = false;
  private ambientStarted = false;
  constructor() { this.music.loop = true; this.music.volume = 0.65; this.music.preload = 'none'; this.ambient.loop = true; this.ambient.volume = 0.5; this.ambient.preload = 'none'; }
  configure(pack?: OriginalPack): void { this.pack = pack; this.music.src = pack ? originalURL(pack.music.battle.url) : `${import.meta.env.BASE_URL}undertale/media/mus_zz_megalovania.ogg`; if (pack) this.ambient.src = originalURL(pack.music.ambient.url); }
  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext(); this.gain = this.context.createGain(); this.gain.connect(this.context.destination);
      this.gain.gain.value = this.muted ? 0 : 0.55;
      const context = this.context;
      await Promise.all(EFFECTS.map(async name => {
        try { const original = this.pack?.sounds[name]; const r = await fetch(original ? originalURL(original.url) : `${import.meta.env.BASE_URL}undertale/media/${name}.ogg`); if (!r.ok) return; this.buffers.set(name, await context.decodeAudioData(await r.arrayBuffer())); } catch { /* Sound failure must not stop gameplay. */ }
      }));
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  play(name: string, rate = 1): void {
    if (name === 'ambientstart') { this.ambientStarted = !!this.pack; if (this.ambientStarted && !this.muted && !this.paused) void this.ambient.play().catch(() => {}); return; }
    if (name === 'ambientstop') { this.ambientStarted = false; this.ambient.pause(); return; }
    if (name === 'musicstart') { this.musicStarted = true; this.music.currentTime = 0; if (!this.muted && !this.paused) void this.music.play().catch(() => {}); return; }
    if (name === 'musicstop') { this.musicStarted = false; this.music.pause(); this.stopEffects(); return; }
    if (this.muted || this.paused || !this.context || !this.gain) return;
    const buffer = this.buffers.get(name); if (!buffer) return;
    const speech = name === 'battletext' || name === 'sansspeak';
    if (speech) this.voices.get(name)?.stop();
    const source = this.context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
    const volume = this.context.createGain(); volume.gain.value = this.pack?.sounds[name]?.volume ?? 1; source.connect(volume); volume.connect(this.gain);
    if (speech) this.voices.set(name, source);
    this.sources.add(source); source.onended = () => { this.sources.delete(source); if (this.voices.get(name) === source) this.voices.delete(name); source.disconnect(); volume.disconnect(); }; source.start();
  }
  private stopEffects(): void { this.sources.forEach(s => { try { s.stop(); } catch { /* already ended */ } }); this.sources.clear(); this.voices.clear(); }
  stop(): void { this.musicStarted = false; this.ambientStarted = false; this.music.pause(); this.music.currentTime = 0; this.ambient.pause(); this.ambient.currentTime = 0; this.stopEffects(); }
  mute(value: boolean): void { this.muted = value; if (this.gain) this.gain.gain.value = value ? 0 : 0.55; this.music.muted = value; this.ambient.muted = value; if (!value && !this.paused) { if (this.musicStarted) void this.music.play().catch(() => {}); if (this.ambientStarted) void this.ambient.play().catch(() => {}); } }
  pause(value: boolean): void { this.paused = value; if (value) { this.music.pause(); this.ambient.pause(); this.stopEffects(); } else if (!this.muted) { if (this.musicStarted) void this.music.play().catch(() => {}); if (this.ambientStarted) void this.ambient.play().catch(() => {}); } }
}
import { originalURL, type OriginalPack } from './original';

