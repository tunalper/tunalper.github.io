// Generative sound, off by default. Everything is synthesised live: no files.
// Scene weights mix the layers; events (thunder, beats, locks) play on top.
import { clamp } from './util.js';
import { STORY } from './director.js';

export class Sound {
  constructor(app) {
    this.app = app;
    this.on = false;
    this.ready = false;
    this.levels = new Float32Array(32);
    this.wave = new Float32Array(128);
    this.tickT = 0;
    this.acc = 0;
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ac = new AC();
    this.ac = ac;
    const now = ac.currentTime;

    this.master = ac.createGain();
    this.master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.75;
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ac.destination);
    this.fbuf = new Uint8Array(this.analyser.frequencyBinCount);
    this.tbuf = new Float32Array(this.analyser.fftSize);

    // space: a generated hall
    this.verb = ac.createConvolver();
    const len = Math.floor(ac.sampleRate * 3.2);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb.buffer = ir;
    this.verbIn = ac.createGain();
    this.verbIn.gain.value = 0.55;
    this.verbIn.connect(this.verb);
    this.verb.connect(this.master);

    // shared noise
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    const loopNoise = () => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(now + Math.random() * 0.1); return s; };

    // drone: two detuned saws and a fifth, breathing through a lowpass
    this.droneF = ac.createBiquadFilter();
    this.droneF.type = 'lowpass'; this.droneF.frequency.value = 260; this.droneF.Q.value = 6;
    this.droneG = ac.createGain(); this.droneG.gain.value = 0;
    for (const [f, d, t] of [[55, -7, 'sawtooth'], [55, 6, 'sawtooth'], [82.4, 0, 'triangle'], [27.5, 0, 'sine']]) {
      const o = ac.createOscillator(); o.type = t; o.frequency.value = f; o.detune.value = d;
      const g = ac.createGain(); g.gain.value = t === 'sine' ? 0.8 : 0.3;
      o.connect(g); g.connect(this.droneF); o.start();
    }
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ac.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(this.droneF.frequency); lfo.start();
    this.droneF.connect(this.droneG); this.droneG.connect(this.master);

    // storm: rain hiss + wind
    const rain = loopNoise();
    const rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 1800; rf.Q.value = 0.6;
    this.rainG = ac.createGain(); this.rainG.gain.value = 0;
    rain.connect(rf); rf.connect(this.rainG); this.rainG.connect(this.master);
    const wind = loopNoise();
    const wf = ac.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 400; wf.Q.value = 3;
    const wl = ac.createOscillator(); wl.frequency.value = 0.11;
    const wlg = ac.createGain(); wlg.gain.value = 260; wl.connect(wlg); wlg.connect(wf.frequency); wl.start();
    this.windG = ac.createGain(); this.windG.gain.value = 0;
    wind.connect(wf); wf.connect(this.windG); this.windG.connect(this.master);

    // signal: static and a buried carrier
    const st = loopNoise();
    this.staticF = ac.createBiquadFilter(); this.staticF.type = 'bandpass'; this.staticF.frequency.value = 2400; this.staticF.Q.value = 2.5;
    this.staticG = ac.createGain(); this.staticG.gain.value = 0;
    st.connect(this.staticF); this.staticF.connect(this.staticG); this.staticG.connect(this.master);
    this.carrier = ac.createOscillator(); this.carrier.type = 'sine'; this.carrier.frequency.value = 660;
    const vib = ac.createOscillator(); vib.frequency.value = 5.3;
    const vibG = ac.createGain(); vibG.gain.value = 9; vib.connect(vibG); vibG.connect(this.carrier.frequency); vib.start();
    this.carrierG = ac.createGain(); this.carrierG.gain.value = 0;
    this.carrier.connect(this.carrierG); this.carrierG.connect(this.master); this.carrierG.connect(this.verbIn);
    this.carrier.start();

    this.ready = true;
    return true;
  }

  toggle() {
    if (!this.ready && !this.init()) return false;
    this.on = !this.on;
    const ac = this.ac, t = ac.currentTime;
    if (this.on) {
      ac.resume && ac.resume();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.85, t, 0.6);
    } else {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.15);
      setTimeout(() => { if (!this.on && ac.state === 'running') ac.suspend(); }, 900);
      this.levels.fill(0);
    }
    return this.on;
  }

  suspend() { if (this.ready && this.ac.state === 'running') this.ac.suspend(); }
  resume() { if (this.ready && this.on) this.ac.resume(); }

  // ------------------------------------------------------------ mixing
  update(S, dt) {
    if (!this.on || !this.ready) return;
    const ac = this.ac, t = ac.currentTime, w = S.w;
    const k = 0.4;
    const storm = S.storm * S.world;
    this.droneG.gain.setTargetAtTime(0.16 + w.core * 0.1 + w.signal * 0.05 - S.fade * 0.12, t, k);
    this.droneF.frequency.setTargetAtTime(220 + w.core * 420 + w.ledger * 180 + S.flash[1] * 900, t, k);
    this.rainG.gain.setTargetAtTime(storm * 0.09, t, k);
    this.windG.gain.setTargetAtTime(storm * 0.22 + w.core * 0.05, t, k);
    this.staticG.gain.setTargetAtTime(w.signal * 0.05 + w.ledger * 0.012, t, k);
    this.staticF.frequency.setTargetAtTime(1800 + Math.random() * 2600, t, 0.05);
    const locked = this.lockUntil && t < this.lockUntil;
    this.carrierG.gain.setTargetAtTime(w.signal * (locked ? 0.09 : 0.012), t, locked ? 0.08 : 0.3);
    // the ledger ticks like a counting machine; the miner ticks faster
    this.tickT -= dt;
    const rate = w.ledger * 9 + (w.closing > 0.5 && S.s < STORY.mined ? 16 : 0);
    if (rate > 0.5 && this.tickT <= 0) {
      this.tickT = 1 / rate * (0.4 + Math.random());
      this.blip(1200 + Math.random() * 2400, 0.012, 0.035 * Math.min(1, rate / 9), 'square');
    }
    // analysis for the visuals, ~30 Hz
    this.acc += dt;
    if (this.acc > 1 / 30) {
      this.acc = 0;
      this.analyser.getByteFrequencyData(this.fbuf);
      const n = this.fbuf.length;
      for (let i = 0; i < 32; i++) {
        const a = Math.floor(Math.pow(i / 32, 1.8) * n * 0.7), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / 32, 1.8) * n * 0.7));
        let m = 0;
        for (let j = a; j < b; j++) m = Math.max(m, this.fbuf[j]);
        this.levels[i] = clamp((m / 255 - 0.15) * 1.4);
      }
      this.analyser.getFloatTimeDomainData(this.tbuf);
      const step = this.tbuf.length / this.wave.length;
      for (let i = 0; i < this.wave.length; i++) this.wave[i] = clamp(this.tbuf[Math.floor(i * step)] * 3.5, -1, 1);
    }
  }

  // ------------------------------------------------------------ voices
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  blip(f, dur, vol, type = 'sine', when = 0, verb = 0) {
    const ac = this.ac, t = ac.currentTime + when;
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ac.createGain();
    this.env(g, t, 0.003, vol, dur);
    o.connect(g); g.connect(this.master);
    if (verb) { const s = ac.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbIn); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  boom(f0, f1, dur, vol, when = 0) {
    const ac = this.ac, t = ac.currentTime + when;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    this.env(g, t, 0.006, vol, dur);
    o.connect(g); g.connect(this.master);
    const s = ac.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(this.verbIn);
    o.start(t); o.stop(t + dur + 0.1);
  }

  noise(dur, vol, type, f0, f1, when = 0, pan = 0, verb = 0.4) {
    const ac = this.ac, t = ac.currentTime + when;
    const src = ac.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    this.env(g, t, 0.01, vol, dur);
    let out = g;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(f); f.connect(g); out.connect(this.master);
    if (verb) { const s = ac.createGain(); s.gain.value = verb; out.connect(s); s.connect(this.verbIn); }
    src.start(t, Math.random()); src.stop(t + dur + 0.1);
  }

  event(type, x = 0) {
    if (!this.on || !this.ready) return;
    const pan = clamp(x * 2 - 1, -1, 1);
    switch (type) {
      case 'thunder':
        this.noise(0.12, 0.25, 'highpass', 3000, 800, 0, pan, 0.2);
        this.noise(2.8, 0.5, 'lowpass', 1400, 50, 0.25 + Math.random() * 0.5, pan * 0.6, 0.6);
        break;
      case 'beat':
        this.boom(62, 34, 0.32, 0.5);
        this.boom(58, 32, 0.28, 0.32, 0.2);
        break;
      case 'tick': this.blip(900 + x * 900, 0.04, 0.05, 'square'); break;
      case 'lock':
        this.boom(90, 28, 1.4, 0.55);
        this.noise(1.2, 0.12, 'bandpass', 5000, 200, 0, 0, 0.8);
        break;
      case 'deny':
        this.blip(82, 0.18, 0.2, 'square');
        this.blip(77, 0.22, 0.16, 'sawtooth', 0.09);
        break;
      case 'tap': this.blip(440 * Math.pow(2, x * 1.2), 0.12, 0.12, 'triangle', 0, 0.5); break;
      case 'lockon': this.lockUntil = this.ac.currentTime + 1.3; this.blip(1320, 0.06, 0.05, 'sine', 0, 0.4); break;
      case 'found':
        [220, 261.6, 329.6, 493.9].forEach((f, i) => this.blip(f, 3.2, 0.06, 'triangle', i * 0.06, 0.9));
        this.boom(110, 40, 1.6, 0.4);
        break;
      case 'genesis':
        this.boom(120, 20, 3, 0.7);
        this.noise(3, 0.25, 'lowpass', 8000, 60, 0, 0, 1);
        [110, 164.8, 220, 277.2, 329.6].forEach((f, i) => this.blip(f, 4, 0.05, 'sawtooth', 0.4 + i * 0.12, 1));
        break;
      case 'roar':
        // a growl from the cliff: detuned saws through a closing filter
        [52, 55.5, 78].forEach((f, i) => this.blip(f, 1.3, 0.09, 'sawtooth', i * 0.03, 0.6));
        this.noise(1.4, 0.22, 'lowpass', 900, 120, 0, -0.6, 0.7);
        break;
      case 'snap':
        this.noise(0.08, 0.25, 'highpass', 2500, 1200, 0, x * 2 - 1, 0.1);
        this.boom(180, 60, 0.12, 0.25);
        break;
      case 'ui': this.blip(660 + x * 440, 0.05, 0.06, 'square'); break;
      case 'rewind': this.noise(0.9, 0.2, 'bandpass', 300, 6000, 0, 0, 0.3); break;
      default: break;
    }
  }
}
