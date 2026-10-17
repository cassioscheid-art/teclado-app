/** Sintetizador simples de piano com Web Audio (sem amostras externas). */
export class Synth {
  private ctx?: AudioContext;
  private master?: GainNode;
  private voices = new Map<number, { osc: OscillatorNode[]; gain: GainNode }>();

  /** O iOS só libera o áudio depois de um toque do usuário. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  noteOn(midi: number, velocity = 0.8, duration?: number) {
    if (!this.ctx || !this.master) return;
    this.noteOff(midi);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const gain = ctx.createGain();
    const peak = 0.25 + velocity * 0.5;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(peak * 0.3, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3);
    gain.connect(this.master);

    const osc = [1, 2, 3].map((harmonic, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = freq * harmonic;
      const g = ctx.createGain();
      g.gain.value = [1, 0.3, 0.1][i];
      o.connect(g).connect(gain);
      o.start(now);
      o.stop(now + 3.1);
      return o;
    });
    this.voices.set(midi, { osc, gain });
    if (duration) setTimeout(() => this.noteOff(midi), duration * 1000);
  }

  noteOff(midi: number) {
    const v = this.voices.get(midi);
    if (!v || !this.ctx) return;
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.001), now);
    v.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    v.osc.forEach((o) => o.stop(now + 0.3));
    this.voices.delete(midi);
  }

  click(accent: boolean) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + 0.06);
  }
}
