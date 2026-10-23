// Original synthesized effects. No Undertale recordings or music are bundled.
export class AudioEffects {
  enabled = true;
  private context?: AudioContext;

  unlock(): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch { /* The encounter remains playable without audio. */ }
  }

  play(kind: 'start' | 'hit' | 'phase' | 'beam' | 'won' | 'lost'): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const notes = { start: [440, 660], hit: [120, 55], phase: [330, 550], beam: [180, 70], won: [440, 550, 660, 880], lost: [220, 165, 110] };
    notes[kind].forEach((frequency, index) => {
      const context = this.context!;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + index * 0.085;
      oscillator.type = kind === 'hit' || kind === 'beam' ? 'sawtooth' : 'square';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.035, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.15);
    });
  }
}
