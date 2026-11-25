// Seven taps on the coin (or the old code on the keyboard) replay genesis.
import { C } from './palette.js';
import { drawText, textWidth, randomChar, HEX_CHARS } from './text.js';
import { clamp, range, hash1, TAU } from './util.js';

const GENESIS = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
const STAMP = '2009·01·03 18:15:05';
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export class Egg {
  constructor(ctx) {
    this.ctx = ctx;
    this.count = 0;
    this.idle = 0;
    this.active = false;
    this.t = 0;
    this.keys = [];
    this.rain = [];
    addEventListener('keydown', (e) => {
      this.keys.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (this.keys.length > KONAMI.length) this.keys.shift();
      if (this.keys.join() === KONAMI.join()) { this.keys.length = 0; this.trigger(); }
    });
  }

  tap() {
    if (this.active) return;
    this.count = Math.min(7, this.count + 1);
    this.idle = 0;
    if (!this.ctx.app.reduced) this.ctx.director.impulse(0.2 + this.count * 0.05, this.count * 0.4, this.count === 7 ? 0.4 : 0);
    this.ctx.sound.event('tap', this.count / 7);
    if (this.count >= 7) setTimeout(() => this.trigger(), 220);
  }

  trigger() {
    if (this.active) return;
    const app = this.ctx.app;
    this.active = true;
    this.t = 0;
    this.rain.length = 0;
    this.ctx.sound.event('genesis', 0);
    if (app.reduced) {
      // no flash, no shake: the answer simply appears, then leaves
      this.t = 3.4;
      app.invalidate && app.invalidate();
      clearTimeout(this.endT);
      this.endT = setTimeout(() => { this.active = false; this.count = 0; app.invalidate && app.invalidate(); }, 5000);
      return;
    }
    this.ctx.director.impulse(1, 5, 1);
    this.ctx.hud.zap();
  }

  frame(S, dt) {
    const { input, scenes, F } = this.ctx;
    const core = scenes.core;
    // taps on the coin
    for (const tp of input.taps) {
      const b = core.bbox;
      if (!b.vis) continue;
      const x = tp.x * F.w, y = tp.y * F.h;
      if (x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 4 && y < b.y + b.h + 4) this.tap();
    }
    if (!this.active) {
      if (this.count > 0) { this.idle += dt; if (this.idle > 6) { this.count = 0; this.idle = 0; } }
      return;
    }
    this.t += dt;
    const t = this.t;
    const w = F.w, h = F.h;
    if (t < 0.5 && !this.ctx.app.reduced) this.ctx.director.impulse(0.9, 3, 0.8);
    // blocks falling like a genesis rain
    if (t < 3.6 && !this.ctx.app.reduced && Math.random() < dt * 40) this.rain.push({ x: Math.random() * w, y: -6, v: 40 + Math.random() * 90, s: 2 + ((Math.random() * 3) | 0) });
    for (const r of this.rain) {
      r.y += r.v * dt;
      F.rect(Math.round(r.x), Math.round(r.y), r.s, r.s, r.s > 3 ? C.neon : C.blood2);
      F.set(Math.round(r.x), Math.round(r.y), C.neon2);
    }
    // shock ring
    const R = t * 260;
    if (R < Math.hypot(w, h) && !this.ctx.app.reduced) { F.ring(w / 2, h / 2, R, C.neon2, 1); F.ring(w / 2, h / 2, R * 0.8, C.blood3, 0.7); }
    // the hash decrypts across the middle (two lines on narrow screens)
    const lines = w < 200 ? [GENESIS.slice(0, 32), GENESIS.slice(32)] : w < 400 ? [GENESIS.slice(0, 32), GENESIS.slice(32)] : [GENESIS];
    const fade = 1 - range(t, 4.2, 5.2);
    lines.forEach((ln, li) => {
      let s = '';
      for (let i = 0; i < ln.length; i++) {
        const k = li * 32 + i;
        const lock = 0.7 + k * 0.035;
        s += t > lock ? ln[i] : t > 0.5 ? randomChar(Math.random, HEX_CHARS) : ' ';
      }
      const tw = textWidth(s);
      const x = Math.round(w / 2 - tw / 2), y = Math.round(h / 2 - 4 + (li - (lines.length - 1) / 2) * 11);
      F.drect(x - 3, y - 3, tw + 6, 14, C.void, 0.85 * fade);
      drawText(F, s, x, y, li === 0 ? C.neon2 : C.neon, fade);
    });
    if (t > 2.6) {
      const tag = '#0  ' + STAMP;
      const tw = textWidth(tag);
      drawText(F, tag, Math.round(w / 2 - tw / 2), Math.round(h / 2 + 16 + (lines.length - 1) * 6), C.violet2, fade);
    }
    if (t > 5.4 && !this.ctx.app.reduced) { this.active = false; this.count = 0; this.rain.length = 0; }
  }
}
