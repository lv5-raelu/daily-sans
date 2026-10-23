const EDGE_SECONDS = .003;

interface Utterance {
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
}

/** Restart the original sample per letter without discontinuities at the cutoff. */
export class SpeechAudio {
  private context?: AudioContext;
  private sample?: AudioBuffer;
  private active?: Utterance;
  private ambienceSample?: AudioBuffer;
  private ambience?: AudioBufferSourceNode;

  async load(url: URL, ambienceUrl?: URL): Promise<void> {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    const decode = async (file: URL): Promise<AudioBuffer> => {
      const response = await fetch(file);
      if (!response.ok) throw new Error('Could not load the fight audio.');
      return this.context!.decodeAudioData(await response.arrayBuffer());
    };
    [this.sample, this.ambienceSample] = await Promise.all([decode(url), ambienceUrl ? decode(ambienceUrl) : undefined]);
  }

  startOpening(): void {
    const context = this.context;
    if (!context || !this.ambienceSample || this.ambience || context.state === 'closed') return;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const source = context.createBufferSource();
    source.buffer = this.ambienceSample; source.loop = true;
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    this.ambience = source;
    source.start(context.currentTime);
  }

  stopOpening(): void {
    const source = this.ambience;
    this.ambience = undefined;
    // Native con == 6 stops the birds immediately before the blackout sound.
    if (source) source.stop(this.context!.currentTime);
  }

  setPaused(paused: boolean): void {
    const context = this.context;
    if (!context || context.state === 'closed') return;
    if (paused) { this.stop(); void context.suspend().catch(() => {}); }
    else void context.resume().catch(() => {});
  }

  play(): void {
    const context = this.context;
    if (!context || !this.sample || context.state === 'closed') return;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    this.stop();
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = context.currentTime;
    source.buffer = this.sample;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + EDGE_SECONDS);
    source.connect(gain); gain.connect(context.destination);
    const utterance = { source, gain, startedAt: now };
    this.active = utterance;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (this.active === utterance) this.active = undefined;
    };
    source.start(now);
  }

  stop(): void {
    const context = this.context, active = this.active;
    if (!context || !active) return;
    this.active = undefined;
    const now = context.currentTime;
    // Hold the current attack level even if a reveal/skip happens mid-fade.
    const level = Math.min(1, Math.max(0, (now - active.startedAt) / EDGE_SECONDS));
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.setValueAtTime(level, now);
    active.gain.gain.linearRampToValueAtTime(0, now + EDGE_SECONDS);
    active.source.stop(now + EDGE_SECONDS);
  }

  dispose(): void {
    this.stop(); this.stopOpening();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = undefined; this.sample = undefined; this.ambienceSample = undefined;
  }
}
