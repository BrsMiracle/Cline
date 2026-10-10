/**
 * Procedural switch sound — a short filtered noise click plus a low "thock".
 * Nothing is loaded from disk: the whole thing is synthesised with WebAudio,
 * and the context is only created after the first user gesture.
 */
export class SwitchAudio {
  enabled = true;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;
  private armed = false;

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      const length = Math.floor(ctx.sampleRate * 0.2);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      this.ctx = ctx;
      this.master = master;
      this.noise = buffer;
      return ctx;
    } catch {
      return null;
    }
  }

  /** browsers only allow audio after a gesture: wait for one, then warm up */
  arm() {
    if (this.armed || typeof window === 'undefined') return;
    this.armed = true;
    const unlock = () => {
      const ctx = this.ensure();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  unlock() {
    this.ensure();
  }

  click(kind: 'down' | 'up') {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running' || !this.master || !this.noise) return;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value =
      kind === 'down' ? 1500 + Math.random() * 900 : 2600 + Math.random() * 1100;
    band.Q.value = 0.85;
    const gain = ctx.createGain();
    const peak = kind === 'down' ? 0.26 : 0.12;
    const decay = kind === 'down' ? 0.08 : 0.045;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    src.connect(band).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.05);
    src.stop(t + decay + 0.02);

    if (kind === 'down') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const base = 150 + Math.random() * 45;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.09);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.2, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(og).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }
}
