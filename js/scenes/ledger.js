// Scene 4 - the ledger. Columns of hashes fall through the dark; the hand
// slows them and almost reads them. Later the rain condenses into a line.
import { C } from '../palette.js';
import { glyph, HEX_CHARS, BROKEN_CHARS } from '../text.js';
import { clamp, range, lerp, hash1, smooth } from '../util.js';
import { STORY } from '../director.js';

const TAIL = [C.neon2, C.neon, C.neon, C.blood3, C.blood3, C.blood2, C.blood2, C.blood1, C.blood1, C.bruise2, C.bruise, C.bruise, C.plum, C.plum, C.night];
const POOL = (HEX_CHARS + HEX_CHARS + '█▓░' + BROKEN_CHARS.slice(0, 12).join('')).split('');

export class Ledger {
  constructor(ctx) {
    this.ctx = ctx;
    this.cols = [];
  }

  resize(w, h) {
    this.w = w; this.h = h;
    const n = Math.floor(w / 7);
    this.cols = [];
    for (let i = 0; i < n; i++) {
      this.cols.push({
        x: 1 + i * 7,
        y: Math.random() * (h + 160),
        v: 14 + Math.random() * 46,
        len: 6 + ((Math.random() * 16) | 0),
        seed: (Math.random() * 1e6) | 0,
        swap: Math.random(),
        zero: 0,
      });
    }
  }

  frame(S, dt) {
    const { F, input, app } = this.ctx;
    const vis = S.w.ledger;
    if (vis <= 0.01 || !this.cols.length) return;
    const s = S.s;
    const w = this.w, h = this.h;
    const t = S.time;
    const enter = range(s, STORY.ledger - 0.55, STORY.ledger + 0.25);
    const condense = range(s, STORY.signal - 0.6, STORY.signal + 0.15);
    const mx = input.sx * w, my = input.sy * h, ma = input.activity;
    const midY = h * (S.portrait ? 0.46 : 0.5);
    const speed = app.reduced ? 0.05 : 1;

    for (let ci = 0; ci < this.cols.length; ci++) {
      const c = this.cols[ci];
      // columns appear in a ragged wave from the centre outward
      const order = Math.abs(ci - this.cols.length / 2) / (this.cols.length / 2);
      // the rain is texture now: the panels in front carry the story
      const a = clamp((enter * 1.4 - order * 0.4)) * vis * (0.5 + 0.5 * condense);
      if (a <= 0) continue;
      const near = Math.abs(c.x - mx) < 10 && ma > 0.1 ? ma : 0;
      c.y += dt * c.v * speed * (1 - near * 0.8) * (1 - condense * 0.7);
      if (c.y - c.len * 8 > h) {
        c.y = -Math.random() * h * 0.3;
        c.v = 14 + Math.random() * 46;
        c.len = 6 + ((Math.random() * 16) | 0);
        c.seed = (Math.random() * 1e6) | 0;
        c.zero = Math.random() < 0.12 ? 1 : 0;
      }
      const head = Math.floor(c.y / 8);
      const tick = Math.floor(t * (6 + c.swap * 10));
      for (let k = 0; k < c.len; k++) {
        const row = head - k;
        let y = row * 8;
        if (y < -8 || y > h) continue;
        // condense toward the signal line
        if (condense > 0) {
          const wave = Math.sin(c.x * 0.07 + t * 3) * 6 * (1 - condense);
          y = lerp(y, midY + wave - 3, smooth(condense));
        }
        const id = c.seed + row * 7919;
        const flick = hash1(id + tick * (k < 2 ? 1 : 0)) ;
        let ch = POOL[(hash1(id + (k === 0 ? tick : 0)) * POOL.length) | 0];
        if (c.zero && k < 7) ch = '0';
        if (flick > 0.985) ch = '█';
        // the hand reads: glyphs under the lantern turn to plain hex
        const dx = c.x + 3 - mx, dy = y + 4 - my;
        const lit = ma > 0.1 && dx * dx + dy * dy < 900 * ma;
        let col = TAIL[Math.min(TAIL.length - 1, Math.floor(k * TAIL.length / c.len))];
        if (c.zero && k < 7) col = k === 0 ? C.neon2 : C.uv2;
        if (lit) { col = k === 0 ? C.neon2 : C.violet2; ch = HEX_CHARS[(hash1(id) * 16) | 0]; }
        const fade = k > c.len - 3 ? 0.5 : 1;
        F.bits(c.x, Math.round(y), glyph(ch), 6, col, a * fade * (1 - condense * 0.6));
      }
    }
  }
}
