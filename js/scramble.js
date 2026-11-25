// DOM text that tries to decrypt itself and keeps failing.
import { BROKEN_CHARS } from './text.js';

export const POOL = ('0123456789abcdef░▒▓█ΣΔΩΨΧΞΦλ#%*+=<>/\\|·:' + BROKEN_CHARS.join('')).split('');
const pick = () => POOL[(Math.random() * POOL.length) | 0];

export class Scramble {
  static calm = false;
  constructor(el, { rate = 0, keep = ' ·:' } = {}) {
    this.el = el;
    this.target = [...(el.textContent || '')];
    this.cur = this.target.slice();
    this.t0 = new Float32Array(this.target.length);
    this.t1 = new Float32Array(this.target.length);
    this.rate = rate;      // background corruption probability per char per tick
    this.keep = keep;      // characters that never scramble
    this.time = 0;
    this.busy = false;
    this.last = '';
  }

  // decrypt toward `text` over `dur` seconds (chars resolve in a loose wave)
  set(text, dur = 0.7, spread = 0.6) {
    const t = [...text];
    this.target = t;
    if (this.cur.length !== t.length) this.cur = t.map(() => ' ');
    this.t0 = new Float32Array(t.length);
    this.t1 = new Float32Array(t.length);
    for (let i = 0; i < t.length; i++) {
      const a = Math.random() * dur * spread;
      this.t0[i] = this.time + a * 0.3;
      this.t1[i] = this.time + a + dur * (1 - spread) * Math.random();
    }
    this.busy = true;
  }

  // instantly corrupt everything, then resolve again
  burst(dur = 0.5) { this.set(this.target.join(''), dur, 0.9); }

  tick(dt) {
    if (Scramble.calm) {
      // reduced motion: no flicker, the text simply is what it is
      const s0 = this.target.join('');
      if (s0 !== this.last) { this.el.textContent = s0; this.last = s0; }
      this.busy = false;
      return;
    }
    this.time += dt;
    const t = this.time;
    let busy = false;
    for (let i = 0; i < this.target.length; i++) {
      const ch = this.target[i];
      if (this.keep.includes(ch)) { this.cur[i] = ch; continue; }
      if (t < this.t1[i]) {
        busy = true;
        this.cur[i] = t < this.t0[i] ? this.cur[i] : pick();
      } else if (this.rate && Math.random() < this.rate) {
        this.cur[i] = pick();
      } else {
        this.cur[i] = ch;
      }
    }
    this.busy = busy;
    const s = this.cur.join('');
    if (s !== this.last) { this.el.textContent = s; this.last = s; }
  }
}
