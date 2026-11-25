// Scene 5 - the signal. Something is recording. A live waveform, an
// equaliser, a Lissajous ghost that almost settles into a shape. No name.
import { C } from '../palette.js';
import { clamp, range, lerp, hash1, noise1, TAU, smooth } from '../util.js';
import { STORY } from '../director.js';

export class Signal {
  constructor(ctx) {
    this.ctx = ctx;
    this.peaks = new Float32Array(32);
    this.vals = new Float32Array(32);
    this.wave = new Float32Array(512);
    this.scanX = 0;
  }

  resize(w, h) { this.w = w; this.h = h; }

  frame(S, dt) {
    const { F, sound, input, app, hud } = this.ctx;
    const vis = S.w.signal;
    const s = S.s;
    // the closing scene borrows the line as it flattens
    const flat = range(s, STORY.closing - 0.35, STORY.closing + 0.25);
    if (vis <= 0.01) return;
    const w = this.w, h = this.h, t = S.time;
    const enter = range(s, STORY.signal - 0.3, STORY.signal + 0.35);
    const midY = Math.round(h * (S.portrait ? 0.46 : 0.5));
    const locking = hud && hud.lockT > 0;
    const reduced = app.reduced;

    // ------------------------------------------------------- waveform
    const x0 = Math.round(w * 0.06), x1 = Math.round(w * 0.94);
    const span = x1 - x0;
    const amp = h * (S.portrait ? 0.07 : 0.11) * (1 - flat) * (0.4 + 0.6 * enter);
    const live = sound.on && sound.wave;
    const env = 0.55 + 0.45 * Math.sin(t * 0.9) * Math.sin(t * 0.37) + (locking ? 0.3 : 0);
    let prevY = midY;
    this.scanX = (this.scanX + dt * span * 0.45) % span;
    for (let i = 0; i <= span; i++) {
      const u = i / span;
      let v;
      if (live) {
        v = sound.wave[Math.floor(u * (sound.wave.length - 1))];
      } else {
        // procedural: a carrier, a voice-like formant, static
        const carrier = Math.sin(u * TAU * 3 + t * 5.0);
        const formant = Math.sin(u * TAU * 11 + t * 9) * Math.sin(u * TAU * 1.5 - t * 1.7);
        const stat = noise1(u * 60 + t * 25) * 0.35;
        v = locking ? carrier * 0.9 : (carrier * 0.45 + formant * 0.5 + stat) * env;
      }
      if (reduced) v *= 0.4;
      const taper = Math.sin(Math.PI * u);
      const y = Math.round(midY - v * amp * taper);
      const x = x0 + i;
      const near = Math.abs(i - this.scanX) < 3;
      // vertical continuity: fill between successive samples
      const ya = Math.min(prevY, y), yb = Math.max(prevY, y);
      for (let yy = ya; yy <= yb; yy++) F.set(x, yy, near || locking ? C.neon2 : C.neon);
      F.dset(x, y + 1, C.blood1, enter);
      F.dset(x, y - 1, C.blood1, 0.5 * enter);
      prevY = y;
    }
    // baseline ticks
    for (let x = x0; x <= x1; x += 6) F.set(x, midY + Math.round(amp) + 6, C.plum);

    // ---------------------------------------------- lissajous ghost
    if (flat < 0.5) {
      const R = Math.min(w, h) * 0.2;
      const settle = locking ? 1 : 0;
      const fa = 3, fb = 2 + (settle ? 0 : Math.sin(t * 0.21) * 0.08);
      const ph = t * (settle ? 0.2 : 0.9);
      for (let i = 0; i < 380; i++) {
        const q = (i / 380) * TAU;
        const lx = w / 2 + Math.sin(fa * q + ph) * R * 1.3;
        const ly = midY + Math.sin(fb * q) * R * 0.8;
        F.dset(Math.round(lx), Math.round(ly), settle ? C.violet2 : C.plum2, vis * (settle ? 0.9 : 0.45) * (1 - flat * 2));
      }
    }

    // ------------------------------------------------------ equaliser
    const nb = S.portrait ? 16 : 28;
    const bw = Math.max(2, Math.floor((span * 0.55) / nb) - 1);
    const total = nb * (bw + 1) - 1;
    const ex = Math.round(w / 2 - total / 2);
    const ey = Math.round(midY + amp + (S.portrait ? 34 : 30));
    const maxH = Math.round(h * (S.portrait ? 0.1 : 0.15));
    for (let i = 0; i < nb; i++) {
      let v;
      if (sound.on && sound.levels) v = sound.levels[Math.floor((i / nb) * 24)];
      else {
        const f = i / nb;
        v = clamp(0.15 + 0.55 * Math.abs(noise1(i * 1.7 + t * (2 + f * 3))) * (1 - f * 0.5) + 0.25 * Math.max(0, Math.sin(t * 4.3 + i * 0.5)) * env);
      }
      if (reduced) v *= 0.5;
      v *= (1 - flat) * enter;
      this.vals[i] = reduced ? v : lerp(this.vals[i], v, 1 - Math.exp(-dt * 18));
      const hh = Math.round(this.vals[i] * maxH);
      this.peaks[i] = reduced ? this.vals[i] : Math.max(this.peaks[i] - dt * 0.25, this.vals[i]);
      const x = ex + i * (bw + 1);
      for (let y = 0; y < hh; y += 2) {
        const f = y / maxH;
        F.rect(x, ey - y, bw, 1, f > 0.75 ? C.neon2 : f > 0.45 ? C.neon : f > 0.2 ? C.blood2 : C.bruise2);
      }
      F.rect(x, ey - Math.round(this.peaks[i] * maxH) - 2, bw, 1, C.violet2);
      F.rect(x, ey + 2, bw, 1, C.plum);
    }

    // -------------------------------------- the recording light, in world
    const blink = (t % 1.6) < 0.93;
    if (blink && !reduced) {
      const rx = x0, ry = midY - Math.round(amp) - 14;
      F.disc(rx + 2, ry, 2, C.neon2);
      F.dset(rx + 2, ry - 3, C.blood1, 0.6);
    }
  }
}
