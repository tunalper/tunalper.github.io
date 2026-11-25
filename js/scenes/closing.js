// Scene 6 - a block is found. Six confirmed blocks sit on the chain, each
// pointing back at its parent by hash; the seventh is still being mined:
// transactions stream in from the mempool, every nonce tried is a hash
// measured against the target. When one falls under it the block seals,
// joins the chain, and every block behind it gains a confirmation. Six
// confirmations and a block is final. Then the dark, then the name.
import { C } from '../palette.js';
import { clamp, range, lerp, hash1, smooth, easeOut, TAU } from '../util.js';
import { drawText, textWidth } from '../text.js';
import { STORY } from '../director.js';

export class Closing {
  constructor(ctx) {
    this.ctx = ctx;
    this.burst = 0;
    this.wasFound = false;
    this.pool = [];
    this.tries = [];
    this.tryT = 0;
  }

  resize(w, h) { this.w = w; this.h = h; }

  // an isometric block: front, top, side, a header printed on its face
  cube(F, x, y, s, d, state, seed, a) {
    // state: 0 confirmed, 1 final (6 confirmations), 2 being mined, 3 just sealed
    const top = state === 1 ? C.bruise2 : state === 3 ? C.blood3 : C.plum2;
    const side = state === 1 ? C.bruise : C.ink;
    const face = state === 3 ? C.blood1 : C.night;
    const edge = state === 1 ? C.neon : state === 3 ? C.neon2 : C.violet;
    if (state === 2) {
      // a wireframe still filling with work
      const fl = hash1((this.time * 18) | 0) > 0.5;
      const ec = fl ? C.neon : C.blood2;
      const dash = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i += 2) F.dset(Math.round(lerp(x0, x1, i / n)), Math.round(lerp(y0, y1, i / n)), ec, a); };
      dash(x, y, x + s, y); dash(x, y + s, x + s, y + s); dash(x, y, x, y + s); dash(x + s, y, x + s, y + s);
      dash(x, y, x + d, y - d); dash(x + s, y, x + s + d, y - d); dash(x + d, y - d, x + s + d, y - d); dash(x + s + d, y - d, x + s + d, y + s - d); dash(x + s, y + s, x + s + d, y + s - d);
      for (let yy = 1; yy < s; yy++) for (let xx = 1; xx < s; xx++) {
        const hv = hash1(xx * 31 + yy * 977 + ((this.time * 24) | 0) * 7919);
        if (hv > 0.72) F.dset(x + xx, y + yy, hv > 0.95 ? C.neon2 : hv > 0.85 ? C.blood2 : C.bruise, a);
      }
      return;
    }
    F.poly([x, y, x + d, y - d, x + s + d, y - d, x + s, y], top, a);
    F.poly([x + s, y, x + s + d, y - d, x + s + d, y + s - d, x + s, y + s], side, a);
    F.drect(x, y, s, s, face, a);
    if (a < 0.98) return;
    F.frame(x, y, s + 1, s + 1, edge);
    F.line(x, y, x + d, y - d, edge); F.line(x + s, y, x + s + d, y - d, edge);
    F.line(x + d, y - d, x + s + d, y - d, edge); F.line(x + s + d, y - d, x + s + d, y + s - d, edge);
    F.line(x + s, y + s, x + s + d, y + s - d, edge);
    // the header: version | prev hash | merkle root | time | bits | nonce
    F.rect(x + 2, y + 2, s - 3, 1, state === 1 ? C.blood2 : C.plum);
    for (let r = 0; r < 4; r++) for (let c = 0; c < s - 4; c++) {
      if (hash1(seed * 131 + r * 977 + c) > 0.55) F.set(x + 2 + c, y + 5 + r * 3, hash1(seed + c * 7 + r) > 0.8 ? C.blood2 : C.plum2);
    }
  }

  frame(S, dt) {
    const { F, app } = this.ctx;
    const s = S.s;
    this.time = S.time;
    const vis = S.w.closing * (1 - range(s, STORY.end - 1.05, STORY.end - 0.7));
    if (vis <= 0.01) { this.pool.length = 0; return; }
    const w = this.w, h = this.h, t = S.time;
    const C0 = STORY.closing;
    const appear = range(s, C0 - 0.25, C0 + 0.45);
    const mining = range(s, C0 + 0.2, STORY.mined);
    const found = s >= STORY.mined;
    const shift = range(s, STORY.mined, STORY.mined + 0.55);
    const sz = S.portrait ? 13 : 20, dp = Math.round(sz * 0.4), gap = S.portrait ? 7 : 13;
    const pitch = sz + dp + gap;
    const midY = Math.round(h * (S.portrait ? 0.4 : 0.43));
    const by = midY - Math.floor(sz / 2);
    const total = 7 * pitch - gap;
    const x0 = Math.round(w / 2 - total / 2);
    const minerX = x0 + 6 * pitch;
    this.layout = { x0, by, sz, pitch, minerX, midY };

    if (found && !this.wasFound) {
      this.wasFound = true;
      this.burst = app.reduced ? 0 : 1;
      this.ctx.director.impulse(0.6, 2.5, 0.2);
      this.ctx.sound.event('found', 0);
    }
    if (!found) this.wasFound = false;
    this.burst = Math.max(0, this.burst - dt * 1.1);

    // after the seal the chain slides one block left
    const off = -smooth(shift) * pitch;
    // blocks to the left of the miner: i = 1 (newest) .. 7 (scrolling off)
    for (let i = 6; i >= 1; i--) {
      const x = Math.round(minerX - i * pitch + off);
      if (x + sz + dp < 0) continue;
      const order = (6 - i) / 6;
      const a = clamp(appear * 1.7 - (1 - order) * 0.7) * vis * (i === 6 ? 1 - smooth(shift) : 1);
      if (a <= 0.02) continue;
      const conf = i + (found ? 1 : 0);   // the tip has one confirmation
      const isFinal = conf >= 6;
      this.cube(F, x, by, sz, dp, isFinal ? 1 : 0, 840000 - i, a);
      // hash pointer back to the parent
      if (a > 0.5 && i < 6) {
        const ax = x - gap + 1, ay = by + Math.floor(sz / 2);
        F.line(x - 1, ay, ax, ay, C.plum2);
        F.set(ax + 1, ay - 1, C.plum2); F.set(ax + 1, ay + 1, C.plum2);
        const p = (t * 0.9 + i * 0.37) % 1;
        F.set(Math.round(lerp(x - 1, ax, p)), ay, C.neon2);
      }
      // confirmations: six pips, then it is final
      if (a > 0.6) {
        const shown = Math.min(6, conf);
        const px0 = x + Math.floor((sz - 17) / 2), py = by - dp - 6;
        for (let k = 0; k < 6; k++) {
          const on = k < shown;
          const fresh = found && this.burst > 0 && k === shown - 1;
          F.rect(px0 + k * 3, py, 2, 2, on ? (isFinal ? C.neon2 : fresh ? C.neon2 : C.violet2) : C.plum);
        }
        const label = String((840000 - i) % 1000).padStart(3, '0');
        drawText(F, label, x + Math.floor((sz - textWidth(label)) / 2), by + sz + 4, isFinal ? C.blood3 : C.plum2, a);
      }
    }

    // the miner
    const mx = Math.round(minerX + off);
    const ma = clamp(appear * 2 - 0.6) * vis;
    if (ma > 0) {
      if (!found) this.cube(F, mx, by, sz, dp, 2, 840000, ma);
      else {
        this.cube(F, mx, by, sz, dp, this.burst > 0.2 ? 3 : 0, 840000, ma);
        if (this.burst > 0.85) F.drect(mx, by, sz, sz, C.neon2, (this.burst - 0.85) * 6);
        const R = (1 - this.burst) * Math.max(w, h) * 0.7;
        if (this.burst > 0) { F.ring(mx + sz / 2, midY, R, C.neon, this.burst); F.ring(mx + sz / 2, midY, R * 0.7, C.bruise2, this.burst * 0.6); }
        // it now points at its parent too
        const ay = by + Math.floor(sz / 2), ax = mx - gap + 1;
        F.line(mx - 1, ay, ax, ay, C.neon); F.set(ax + 1, ay - 1, C.neon); F.set(ax + 1, ay + 1, C.neon);
      }
      // the next slot, waiting
      for (let k = 0; k < sz; k += 2) { F.dset(mx + pitch + k, by, C.plum, 0.4 * ma); F.dset(mx + pitch + k, by + sz, C.plum, 0.4 * ma); }

      // mempool: transactions drifting in to be included
      if (!found && !app.reduced && Math.random() < dt * (8 + 40 * mining)) {
        const fromTop = Math.random() < 0.5;
        this.pool.push({ x: fromTop ? Math.random() * w * 0.8 : -4, y: fromTop ? -4 : Math.random() * h * 0.8, p: 0, v: 0.5 + Math.random() * 0.7, c: Math.random() < 0.3 ? C.blood3 : C.violet });
      }
      for (let i = this.pool.length - 1; i >= 0; i--) {
        const q = this.pool[i];
        q.p += dt * q.v;
        if (q.p >= 1 || found) { this.pool.splice(i, 1); continue; }
        const e = easeOut(q.p);
        const X = lerp(q.x, mx + sz / 2, e), Y = lerp(q.y, midY, e);
        F.drect(Math.round(X), Math.round(Y), 2, 2, q.c, ma * (1 - q.p * 0.3));
        F.dset(Math.round(lerp(q.x, mx + sz / 2, easeOut(Math.max(0, q.p - 0.04)))), Math.round(lerp(q.y, midY, easeOut(Math.max(0, q.p - 0.04)))), C.plum2, ma * 0.6);
      }

      // proof of work: every try is a hash, measured against the target
      const mw = Math.min(w - 20, S.portrait ? w - 24 : 150), mx0 = Math.round(w / 2 - mw / 2), my0 = by + sz + 14;
      const target = 0.16;
      F.frame(mx0 - 2, my0 - 2, mw + 4, 6 * 3 + 3, C.plum);
      for (let k = 0; k < 6 * 3 + 2; k += 2) F.dset(mx0 + Math.round(mw * target), my0 - 1 + k, C.neon2, ma);
      this.tryT -= dt;
      if (!found && this.tryT <= 0) { this.tryT = 1 / 14; this.tries.unshift(target + 0.06 + Math.random() * (1 - target - 0.06)); this.tries.length = Math.min(this.tries.length, 6); }
      if (found && this.tries[0] !== 0.07) { this.tries.unshift(0.07); this.tries.length = Math.min(this.tries.length, 6); }
      this.tries.forEach((v, k) => {
        const win = v < target;
        F.drect(mx0, my0 + k * 3, Math.round(mw * v), 2, win ? C.neon2 : k === 0 ? C.blood2 : C.blood0, ma * (1 - k * 0.12));
      });
      drawText(F, found ? '✓' : '<', mx0 + Math.round(mw * target) + 3, my0 + 6 * 3 + 2, found ? C.neon2 : C.plum2, ma);
    }
  }
}
