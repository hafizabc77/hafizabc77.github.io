/* The score: generated live in the browser, no audio files. A pad whose chord changes with each act,
   a sub drone, act-specific textures (a heartbeat for biology, sparkling data, ticking tokens) and a sound for every interaction. */
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
// One chord per act (MIDI notes). Voices glide from one chord to the next.
const CHORDS = [
  [38, 45, 50, 53, 64],   // I · Spark: D minor add 9, dark and expectant
  [41, 48, 57, 64, 67],   // II · Data: F major 7 add 9, open like water
  [43, 50, 59, 62, 66],   // III · Architecture: G major 7, structured
  [40, 47, 55, 59, 62],   // IV · Training: E minor 7, driving
  [45, 52, 57, 61, 64],   // V · Optimise: A major, clean
  [36, 43, 51, 55, 58],   // VI · Deploy: C minor 7, electric
  [42, 49, 54, 58, 61],   // VII · Inference: F♯ minor, bright tension
  [44, 51, 56, 60, 63]    // VIII · Generate: A♭ major, warm
];
const SPARKLE = [77, 81, 84, 86, 89, 91, 93];   // F major pentatonic, high

export class Score {
  constructor() { this.ctx = null; this.on = false; this.muted = false; this.act = -1; this.nextBeat = 0; this.nextSparkle = 0; this.tickBudget = 0; }

  get ready() { return !!this.ctx && this.on && !this.muted; }

  start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (this.ctx) { this.ctx.resume(); this.setMuted(false); return true; }
    const ctx = this.ctx = new AC();
    const master = this.master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = .01; comp.release.value = .3;
    master.connect(comp).connect(ctx.destination);
    // Reverb from generated noise: a big, dark hall.
    const len = Math.floor(ctx.sampleRate * 3.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = .5; this.verb.connect(wet).connect(master);
    this.dry = ctx.createGain(); this.dry.gain.value = .9; this.dry.connect(master);
    // Shared noise for whooshes and textures.
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // Pad: five voices of two detuned oscillators each, through one slowly breathing filter.
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 520; this.padFilter.Q.value = .7;
    this.padGain = ctx.createGain(); this.padGain.gain.value = .0;
    this.padFilter.connect(this.padGain); this.padGain.connect(this.dry); this.padGain.connect(this.verb);
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain(); lfo.frequency.value = .07; lfoGain.gain.value = 160; lfo.connect(lfoGain).connect(this.padFilter.frequency); lfo.start();
    this.voices = CHORDS[0].map((n, i) => {
      const g = ctx.createGain(); g.gain.value = i === 0 ? .16 : .1; g.connect(this.padFilter);
      const oscs = [['sawtooth', -7], ['triangle', 6]].map(([type, det]) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(n); o.detune.value = det; o.connect(g); o.start(); return o; });
      return { g, oscs };
    });
    // Sub drone.
    this.drone = ctx.createGain(); this.drone.gain.value = .0; this.drone.connect(this.dry);
    this.droneOsc = ctx.createOscillator(); this.droneOsc.type = 'sine'; this.droneOsc.frequency.value = hz(26); this.droneOsc.connect(this.drone); this.droneOsc.start();
    const now = ctx.currentTime;
    master.gain.linearRampToValueAtTime(.75, now + 2.5);
    this.padGain.gain.linearRampToValueAtTime(.32, now + 4);
    this.drone.gain.linearRampToValueAtTime(.22, now + 4);
    this.on = true;
    if (this.act >= 0) { const a = this.act; this.act = -1; this.setAct(a); }
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(m ? 0 : .75, t, .25);
  }

  setAct(i) {
    if (i === this.act) return;
    this.act = i;
    if (!this.ctx) return;
    const t = this.ctx.currentTime, chord = CHORDS[Math.max(0, Math.min(CHORDS.length - 1, i))];
    this.voices.forEach((v, k) => v.oscs.forEach(o => { o.frequency.cancelScheduledValues(t); o.frequency.setTargetAtTime(hz(chord[k]), t, 1.1); }));
    this.droneOsc.frequency.setTargetAtTime(hz(chord[0] - 12), t, 1.5);
  }

  /* Called every frame: the pad opens up when you scroll fast, and each act adds its own texture. */
  update(time, speed) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.padFilter.frequency.setTargetAtTime(480 + Math.min(1, Math.abs(speed) * .9) * 1700, t, .25);
    this.tickBudget = Math.min(6, this.tickBudget + .25);
    if (this.act === 0 && time > this.nextBeat) { this.nextBeat = time + 1.25; this.beat(t); }
    if (this.act === 1 && time > this.nextSparkle) { this.nextSparkle = time + .35 + Math.random() * .9; this.note(hz(SPARKLE[Math.floor(Math.random() * SPARKLE.length)]), .025, 1.6, (Math.random() - .5) * 1.4); }
  }

  // ---- building blocks ----
  env(g, t, a, peak, dec) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dec); }
  out(node, pan = 0, wet = true) {
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); node = p; }
    node.connect(this.dry); if (wet) node.connect(this.verb);
  }
  tone(type, f0, f1, dur, peak, pan = 0, a = .005) {
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g); this.env(g, t, a, peak, dur); this.out(g, pan); o.start(t); o.stop(t + a + dur + .05);
  }
  noise(f0, f1, dur, peak, q = 1.2, pan = 0, type = 'bandpass', a = .02) {
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f).connect(g); this.env(g, t, a, peak, dur); this.out(g, pan); s.start(t, Math.random()); s.stop(t + a + dur + .05);
  }
  note(f, peak, dur, pan) { this.tone('sine', f, f, dur, peak, pan, .01); this.tone('sine', f * 2.76, f * 2.76, dur * .4, peak * .25, pan, .005); }
  beat(t) { this.tone('sine', 62, 38, .32, .32, 0, .004); setTimeout(() => { if (this.ready) this.tone('sine', 58, 36, .28, .2, 0, .004); }, 230); }

  /* Interaction sounds. */
  sfx(name, o = {}) {
    if (!this.ready) return;
    const pan = o.pan || 0;
    switch (name) {
      case 'spark': this.tone('sine', 900 + Math.random() * 900, 400, .22, .05, pan); this.noise(5000, 3000, .05, .03, 2, pan); break;
      case 'wave': this.tone('sine', 220, 70, 1.2, .16, pan, .01); this.noise(300, 2400, 1.1, .08, .8, pan); break;
      case 'stim': this.tone('triangle', 330 + (o.i || 0) * 40, 520 + (o.i || 0) * 40, .18, .07, pan); break;
      case 'fire': this.tone('sawtooth', 160, 1400, .16, .07, pan); this.tone('sine', 90, 40, .45, .3, pan, .004); this.noise(800, 6000, .35, .06, 1, pan); break;
      case 'whoosh': this.noise(o.up === false ? 3200 : 220, o.up === false ? 260 : 3600, o.dur || .9, o.gain || .14, .7, pan, 'bandpass', .25); break;
      case 'tick': if (this.tickBudget >= 1) { this.tickBudget -= 1; this.tone('square', 1500 + Math.random() * 500, 1500, .03, .018, pan); } break;
      case 'chime': this.note(o.f || hz(84), .06, 2.4, pan); break;
      case 'pop': this.tone('sine', 700, 180, .07, .06, pan); this.noise(2000, 900, .06, .04, 1, pan); break;
      case 'clean': this.noise(6000, 1200, .18, .05, 3, pan); this.tone('sine', 1200, 2400, .08, .025, pan); break;
      case 'hover': this.tone('sine', 1800, 1800, .05, .012, pan); break;
      case 'enter': this.tone('sine', 70, 30, 2.4, .5, 0, .01); this.noise(120, 3000, 2.2, .12, .6, 0, 'bandpass', .6); break;
      case 'grow': this.tone('triangle', hz(57 + (o.i || 0) * 2), hz(64 + (o.i || 0) * 2), .5, .05, pan, .02); break;
      default: break;
    }
  }
}
