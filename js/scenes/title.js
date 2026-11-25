// Scene 1 - the name. Noise that slowly agrees with itself until it reads
// SCYLLA CHARYBDIS; a slit (the strait) cuts every letter in two. Scrolling
// tears the letters into blocks; the closing scene pulls them back together.
import { C } from '../palette.js';
import { displayGlyph, DISPLAY_H, glyph } from '../text.js';
import { bayer } from '../pixbuf.js';
import { clamp, range, hash1, easeIn, easeOut, smooth, lerp, rng, noise1 } from '../util.js';
import { STORY } from '../director.js';

const SLIT = 7;           // the passage between the two dangers
const GAP = 2;            // letter spacing
const SPACE = 6;

// row -> [colourA, colourB, mix]: a dithered top-lit gradient
const ROWS = [
  [C.neon2, C.neon2, 0], [C.neon2, C.neon, 0.25], [C.neon, C.neon2, 0.25], [C.neon, C.neon, 0],
  [C.neon, C.blood3, 0.5], [C.blood3, C.neon, 0.25], [C.blood3, C.blood3, 0], [0, 0, 0],
  [C.blood3, C.neon, 0.2], [C.blood3, C.blood2, 0.5], [C.blood2, C.blood2, 0], [C.blood2, C.bruise2, 0.5], [C.bruise2, C.blood2, 0.25],
];

export class Title {
  constructor(ctx) {
    this.ctx = ctx;
    this.n = 0;
    this.lockFlash = [];
    this.glitchT = 3;
    this.shiftTop = 0;
    this.shiftBot = 0;
    this.locked = false;
    this.arrived = false;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.layout();
  }

  layout() {
    const { w, h } = this;
    const portrait = w / h < 0.85;
    const lines = portrait ? ['SCYLLA', 'CHARYBDIS'] : ['SCYLLA CHARYBDIS'];
    const adv = (ch) => (ch === ' ' ? SPACE : displayGlyph(ch).w + GAP);
    const widths = lines.map((l) => [...l].reduce((a, ch) => a + adv(ch), 0) - GAP);
    const lineGap = 7;
    const totalH = lines.length * DISPLAY_H + (lines.length - 1) * lineGap;
    const cy = Math.round(h * (portrait ? 0.27 : 0.36));
    const y0 = cy - Math.round(totalH / 2);
    const slots = [];
    const pts = [];
    let slot = 0;
    lines.forEach((line, li) => {
      let x = Math.round(w / 2 - widths[li] / 2);
      const y = y0 + li * (DISPLAY_H + lineGap);
      for (const ch of line) {
        if (ch === ' ') { x += SPACE; continue; }
        const g = displayGlyph(ch);
        slots.push({ x, y, w: g.w, ch, line: li });
        for (let r = 0; r < DISPLAY_H; r++) {
          if (r === SLIT) continue;
          for (let c = 0; c < g.w; c++) {
            if (g.rows[r] & (1 << (g.w - 1 - c))) pts.push(x + c, y + r, slot, r, c);
          }
        }
        x += g.w + GAP;
        slot++;
      }
    });
    this.slots = slots;
    this.box = { x: Math.round(w / 2 - Math.max(...widths) / 2), y: y0, w: Math.max(...widths), h: totalH };
    const n = pts.length / 5;
    this.n = n;
    this.px = new Int16Array(n); this.py = new Int16Array(n);
    this.slot = new Uint8Array(n); this.row = new Uint8Array(n); this.col = new Uint8Array(n);
    this.r1 = new Float32Array(n); this.r2 = new Float32Array(n); this.r3 = new Float32Array(n);
    const r = rng(404);
    for (let i = 0; i < n; i++) {
      this.px[i] = pts[i * 5]; this.py[i] = pts[i * 5 + 1];
      this.slot[i] = pts[i * 5 + 2]; this.row[i] = pts[i * 5 + 3]; this.col[i] = pts[i * 5 + 4];
      this.r1[i] = r(); this.r2[i] = r(); this.r3[i] = r();
    }
    // lock schedule: letters resolve in a loose wave, never strictly in order
    this.lockAt = slots.map((s, i) => 1.15 + i * 0.085 + r() * 0.45);
    this.startAt = slots.map((s, i) => 0.35 + r() * 0.5);
    this.lockFlash = slots.map(() => 0);
    // outline ring: empty cells touching a letter (or its extrusion)
    const key = (x, y) => (y + 64) * 4096 + (x + 64);
    const on = new Set();
    for (let i = 0; i < n; i++) { on.add(key(this.px[i], this.py[i])); on.add(key(this.px[i] + 1, this.py[i] + 1)); on.add(key(this.px[i] + 2, this.py[i] + 2)); }
    const ring = new Set();
    for (const k of on) {
      const x = (k % 4096) - 64, y = Math.floor(k / 4096) - 64;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const kk = key(x + dx, y + dy);
        if (!on.has(kk)) ring.add(kk);
      }
    }
    this.outline = Int16Array.from([...ring].flatMap((k) => [(k % 4096) - 64, Math.floor(k / 4096) - 64]));
    this.layoutSoon(portrait);
  }

  // SOON: the last thing you see, under the name, never quite steady
  layoutSoon(portrait) {
    const { w, h } = this;
    const word = 'SOON', gap = 3;
    const width = [...word].reduce((a, ch) => a + displayGlyph(ch).w + gap, 0) - gap;
    let x = Math.round(w / 2 - width / 2);
    const y = Math.round(h * (portrait ? 0.42 : 0.495));
    const pts = [];
    [...word].forEach((ch, j) => {
      const g = displayGlyph(ch);
      for (let r = 0; r < DISPLAY_H; r++) {
        if (r === SLIT) continue;
        for (let c = 0; c < g.w; c++) if (g.rows[r] & (1 << (g.w - 1 - c))) pts.push(x + c, y + r, j, r);
      }
      x += g.w + gap;
    });
    const n = pts.length / 4;
    const rnd = rng(2140);
    this.soon = {
      n, x: Math.round(w / 2 - width / 2), y, w: width,
      px: new Int16Array(n), py: new Int16Array(n), slot: new Uint8Array(n), row: new Uint8Array(n),
      r1: new Float32Array(n), r2: new Float32Array(n), r3: new Float32Array(n),
    };
    const S = this.soon;
    for (let i = 0; i < n; i++) {
      S.px[i] = pts[i * 4]; S.py[i] = pts[i * 4 + 1]; S.slot[i] = pts[i * 4 + 2]; S.row[i] = pts[i * 4 + 3];
      S.r1[i] = rnd(); S.r2[i] = rnd(); S.r3[i] = rnd();
    }
  }

  // a dithered pool of darkness behind the name so it reads over the storm
  drawShade(F, a) {
    const b = this.box;
    const mx = 26, my = 16;
    for (let y = b.y - my; y < b.y + b.h + my; y++) {
      const fy = Math.min(y - (b.y - my), b.y + b.h + my - y) / my;
      for (let x = b.x - mx; x < b.x + b.w + mx; x++) {
        const fx = Math.min(x - (b.x - mx), b.x + b.w + mx - x) / mx;
        const v = Math.min(1, fx, fy) * 0.85 * a;
        F.dset(x, y, C.void, v);
      }
    }
  }

  faceColor(i, x, y) {
    const row = ROWS[this.row[i]];
    let c = row[2] > 0 && bayer(x, y) < row[2] ? row[1] : row[0];
    // top rim: the pixel above is empty
    const s = this.slots[this.slot[i]];
    const g = displayGlyph(s.ch);
    const rr = this.row[i], cc = this.col[i];
    const above = rr === 0 || rr === SLIT + 1 ? 0 : g.rows[rr - 1] & (1 << (g.w - 1 - cc));
    if (!above && rr < 6) c = C.neon2;
    return c;
  }

  frame(S, dt) {
    const { F, app } = this.ctx;
    if (!this.n) return;
    const boot = S.boot;
    const s = S.s;
    const dissolve = range(s, 0.12, 1.15);
    const assemble = range(s, STORY.end - 0.7, STORY.end - 0.12);
    const reduced = app.reduced;

    // closing: once the blocks land, the name burns again
    if (assemble > 0.98 && !this.arrived) { this.arrived = true; this.ctx.director.impulse(0.7, 2.5, 0.25); this.ctx.sound.event('lock', 1); }
    if (assemble < 0.5) this.arrived = false;

    // capture-only: the share card keeps the name over the open strait
    if (this.ctx.forceTitle) { this.drawBoot(F, S, Math.max(boot, 20), 1); return; }
    const present = Math.max(1 - dissolve, assemble);
    if (present <= 0.001) return;

    // idle micro-glitch: the two halves drift apart for a heartbeat
    this.glitchT -= dt;
    if (this.glitchT < 0 && !reduced && !app.calm) {
      this.glitchT = 2.2 + Math.random() * 3.8;
      this.shiftDur = 0.08 + Math.random() * 0.14;
      this.shiftA = (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 3) | 0));
      if (Math.random() < 0.5) this.ctx.director.impulse(0.25, 0, 0);
    }
    if (this.shiftDur > 0) { this.shiftDur -= dt; this.shiftTop = this.shiftA; this.shiftBot = -this.shiftA; }
    else { this.shiftTop = this.shiftBot = 0; }

    if (assemble > 0 && dissolve >= 1) {
      this.drawAssemble(F, S, assemble);
      const soon = range(s, STORY.end - 0.34, STORY.end - 0.05);
      if (soon > 0 && this.soon) this.drawSoon(F, S, soon);
    } else if (dissolve > 0 && !reduced) this.drawDissolve(F, S, dissolve);
    else this.drawBoot(F, S, boot, reduced ? 1 - dissolve : 1);
  }

  // -------------------------------------------------------- boot / decrypt
  drawBoot(F, S, t, alpha) {
    const n = this.n;
    const tick = Math.floor(t * 15);
    // per-slot state
    let allLocked = true;
    for (let j = 0; j < this.slots.length; j++) {
      const lk = this.lockAt[j];
      if (t >= lk && this.lockFlash[j] === 0) {
        this.lockFlash[j] = 0.13;
        if (this.ctx.app.booted) { this.ctx.director.impulse(0.18, 0.6, 0); this.ctx.sound.event('tick', j / this.slots.length); }
      }
      if (this.lockFlash[j] > 0) this.lockFlash[j] = Math.max(0.0001, this.lockFlash[j] - 1 / 60);
      if (t < lk) allLocked = false;
    }
    if (allLocked && !this.locked && t < 99) {
      this.locked = true;
      this.ctx.director.impulse(0.85, 3, 0.15);
      this.ctx.sound.event('lock', 0.5);
    }

    this.drawShade(F, alpha * range(t, 0.2, 1.2));
    // outline, then extrusion, then the face
    if (allLocked) for (let i = 0; i < this.outline.length; i += 2) F.dset(this.outline[i], this.outline[i + 1], C.void, alpha);
    for (let i = 0; i < n; i++) {
      const j = this.slot[i];
      if (t < this.lockAt[j]) continue;
      const half = this.row[i] < SLIT ? this.shiftTop : this.shiftBot;
      const x = this.px[i] + half, y = this.py[i];
      F.dset(x + 2, y + 2, C.night, alpha);
      F.dset(x + 1, y + 1, C.bruise, alpha);
      F.dset(x + 1, y + 2, C.night, alpha);
    }
    for (let i = 0; i < n; i++) {
      const j = this.slot[i];
      const half = this.row[i] < SLIT ? this.shiftTop : this.shiftBot;
      const x = this.px[i] + half, y = this.py[i];
      const lk = this.lockAt[j], st = this.startAt[j];
      if (t >= lk) {
        const c = this.lockFlash[j] > 0.0001 && this.lockFlash[j] < 0.13 ? C.neon2 : this.faceColor(i, x, y);
        F.dset(x, y, c, alpha);
      } else if (t > st) {
        // noise converging on the letter: agreed pixels persist
        const q = (t - st) / (lk - st);
        if (this.r1[i] < q * q * 0.9) { F.dset(x, y, q > 0.7 ? C.blood3 : C.blood2, alpha); continue; }
        const h = hash1(i * 977 + tick * 131);
        if (h < 0.3 + q * 0.2) F.dset(x, y, h < 0.06 ? C.neon : C.bruise2, alpha);
      }
    }
    // false pixels: the noise also lights cells that are not part of letters
    if (!allLocked) {
      for (let j = 0; j < this.slots.length; j++) {
        const sl = this.slots[j];
        if (t >= this.lockAt[j] || t < this.startAt[j]) continue;
        const q = (t - this.startAt[j]) / (this.lockAt[j] - this.startAt[j]);
        const count = Math.round((1 - q) * 20);
        for (let k = 0; k < count; k++) {
          const h1 = hash1(j * 7919 + k * 31 + tick * 17);
          const h2 = hash1(j * 104729 + k * 13 + tick * 7);
          F.dset(sl.x + Math.floor(h1 * sl.w), sl.y + Math.floor(h2 * DISPLAY_H), C.bruise, alpha);
        }
      }
    }
    // scan line sweeping while decrypting
    if (t < 3.2 && t > 0.3) {
      const b = this.box;
      const sy = b.y - 3 + Math.floor(((t * 0.9) % 1) * (b.h + 6));
      for (let x = b.x - 6; x < b.x + b.w + 6; x++) if (hash1(x + tick * 3) > 0.25) F.dset(x, sy, C.blood1, 0.8);
    }
  }

  // -------------------------------------------------- scroll: tear apart
  drawDissolve(F, S, d) {
    const n = this.n;
    const b = this.box;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const reach = this.w * 0.6;
    for (let i = 0; i < n; i++) {
      const x0 = this.px[i], y0 = this.py[i];
      // the tear runs from the slit outwards, left to right
      const delay = ((x0 - b.x) / b.w) * 0.35 + this.r1[i] * 0.2 + (Math.abs(this.row[i] - SLIT) < 3 ? 0 : 0.08);
      const p = clamp((d - delay) / 0.55);
      if (p <= 0) { F.set(x0, y0, this.faceColor(i, x0, y0)); F.dset(x0 + 1, y0 + 1, C.bruise, 1); continue; }
      const e = easeIn(p);
      const up = this.row[i] < SLIT ? -1 : 1;
      const dx = (x0 - cx) / b.w * 0.8 + 0.9 + (this.r2[i] - 0.5) * 0.9;
      const dy = up * (0.35 + this.r3[i] * 0.6) + (y0 - cy) / b.h * 0.5;
      const x = x0 + dx * e * reach;
      const y = y0 + dy * e * reach * 0.45;
      const size = 1 + Math.floor(p * 2.2 * this.r3[i] + p);
      const a = 1 - smooth(p);
      const c = p < 0.25 ? this.faceColor(i, x0, y0) : p < 0.55 ? C.blood2 : this.r2[i] < 0.5 ? C.violet : C.bruise2;
      if (size === 1) F.dset(x, y, c, a);
      else F.drect(Math.round(x), Math.round(y), size, size, c, a);
    }
  }

  // ------------------------------------------- closing: blocks fly home
  drawAssemble(F, S, a) {
    const n = this.n;
    const b = this.box;
    const ox = this.w / 2, oy = this.h * (this.w / this.h < 0.85 ? 0.46 : 0.5);
    for (let i = 0; i < n; i++) {
      const x0 = this.px[i], y0 = this.py[i];
      const delay = this.r1[i] * 0.45;
      const p = clamp((a - delay) / 0.55);
      if (p <= 0) continue;
      const e = easeOut(p);
      const sx = ox + (this.r2[i] - 0.5) * this.w * 0.5, sy = oy + (this.r3[i] - 0.5) * this.h * 0.35;
      const x = lerp(sx, x0, e), y = lerp(sy, y0, e);
      if (p >= 1) {
        F.dset(x0 + 1, y0 + 1, C.bruise, 1);
        F.set(x0, y0, a > 0.98 ? this.faceColor(i, x0, y0) : C.blood3);
      } else {
        const size = p < 0.6 ? 2 : 1;
        F.drect(Math.round(x), Math.round(y), size, size, p < 0.5 ? C.violet : C.blood2, Math.min(1, p * 3));
      }
    }
  }

  // ------------------------------------------ SOON: a broken neon that sings
  // The word keeps its old life - tubes that stutter, pixels that wander off
  // and find their way home, halves that slip along the slit - and now it
  // carries a signal: a coin turns on the left, its light runs out along the
  // rail as a waveform, slips through the slit of the word and reaches the
  // note on the right, which sings it out. Under the word a spectrum keeps
  // time; under that, a short chain takes a new block every bar.
  drawSoon(F, S, a) {
    const Q = this.soon, n = Q.n, t = S.time;
    const app = this.ctx.app, still = app.reduced, calm = app.calm;
    const snd = this.ctx.sound;
    const live = !still && snd && snd.on && snd.levels;
    const tick = Math.floor(t * 12), tick8 = Math.floor(t * 8);
    const reveal = Math.min(1, a * 1.25);
    const portrait = this.h > this.w;
    const cy = Q.y + SLIT;                                  // the slit row
    const BEAT = 0.6, MINT = BEAT * 4;
    const beat = still ? 0.5 : Math.pow(Math.max(0, Math.sin(t * Math.PI / BEAT)), 6);

    // the spectrum, low bands on the left of the word
    const band = (u) => {
      u = clamp(u);
      if (still) return 0.55 + 0.25 * Math.sin(u * 7);
      if (live) return clamp(snd.levels[Math.min(31, Math.floor(u * 24))] * 1.2);
      return clamp(0.2 + 0.42 * Math.abs(noise1(u * 5 + t * 1.7)) + 0.32 * beat * (1 - u * 0.5) + 0.1 * Math.sin(t * 3.1 + u * 9));
    };
    const lvl = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) lvl[j] = (band(j / 4 + 0.03) + band(j / 4 + 0.12) + band(j / 4 + 0.21)) / 3;

    // per letter: a stuttering tube and a slow tide of loose pixels. Only
    // one letter misbehaves at a time, so the word always reads.
    const on = [1, 1, 1, 1], drop = [0, 0, 0, 0];
    if (!still) {
      let busy = -1;
      for (let j = 0; j < 4; j++) {
        drop[j] = 0.02 + 0.6 * Math.pow(Math.max(0, Math.sin(t * 0.75 - j * Math.PI / 2)), 12);
        if (drop[j] > 0.08) busy = j;
      }
      const win = Math.floor(t * 0.9), inWin = t * 0.9 - win;
      const wj = Math.floor(hash1(win * 977 + 3) * 4);
      const flick = !calm && wj !== busy && hash1(win * 31 + 7) < 0.55 && inWin < 0.45;
      for (let j = 0; j < 4; j++) on[j] = j === wj && flick && hash1(j * 31 + tick * 7) < 0.5 ? 0 : 1;
    }
    const dt = clamp(t - (this.soonT ?? t), 0, 0.1);
    this.soonT = t;
    const shift = !still && !calm && hash1(tick8 * 13 + 5) < 0.06 ? (hash1(tick8) < 0.5 ? -2 : 2) : 0;
    const ghost = !still && !calm && hash1(tick8 * 7 + 1) < 0.07;

    // a pool of dark so nothing behind crosses the letters
    for (let y = Q.y - 5; y < Q.y + DISPLAY_H + 5; y++) {
      const fy = Math.min(y - (Q.y - 5), Q.y + DISPLAY_H + 5 - y) / 5;
      for (let x = Q.x - 10; x < Q.x + Q.w + 10; x++) {
        const fx = Math.min(x - (Q.x - 10), Q.x + Q.w + 10 - x) / 10;
        F.dset(x, y, C.void, Math.min(1, fx, fy) * 0.9 * a);
      }
    }

    // ------------------------------------------------ the rail and its wave
    const rail = Math.round((portrait ? 19 : 34) * a);
    const xL0 = Q.x - 5 - rail, xL1 = Q.x - 3;              // coin side
    const xR0 = Q.x + Q.w + 2, xR1 = Q.x + Q.w + 4 + rail;  // note side
    const amp = portrait ? 3 : 4;
    const env = (x) => {
      if (x <= xL1) return Math.sin(Math.PI * clamp((x - xL0) / (xL1 - xL0)));
      if (x >= xR0) return Math.sin(Math.PI * clamp((x - xR0) / (xR1 - xR0)));
      return 0;
    };
    const sig = (x) => {
      if (still) return Math.sin(x * 0.5) * 0.5;
      if (live && snd.wave) return snd.wave[Math.floor(clamp((x - xL0) / (xR1 - xL0)) * (snd.wave.length - 1))] * 1.4;
      return (Math.sin(x * 0.47 + t * 7) * 0.6 + Math.sin(x * 1.13 - t * 11) * 0.3 + noise1(x * 0.3 + t * 4) * 0.35) * (0.45 + 0.55 * beat);
    };
    const waveY = (x) => cy + Math.round(clamp(sig(x), -1.3, 1.3) * amp * env(x));

    // the packet: from the coin, along the rail, through the slit, to the note
    const ph = still ? -1 : (t % MINT) / MINT;
    const ph2 = still ? -1 : ((t + MINT / 2) % MINT) / MINT;
    const px = (p) => Math.round(lerp(xL0, xR1, clamp(p / 0.8)));
    const head = ph >= 0 && ph < 0.8 ? px(ph) : -999;
    const head2 = ph2 >= 0 && ph2 < 0.8 ? px(ph2) : -999;

    if (rail > 3) {
      for (const [x0, x1, cA, cB, cDot] of [[xL0, xL1, C.blood2, C.blood3, C.blood1], [xR0, xR1, C.violet, C.violet2, C.plum2]]) {
        // the old dashed rail underneath: the line the wave rides on
        for (let x = x0; x <= x1; x += 2) F.dset(x, cy, (x - x0) % 6 === 0 ? C.plum2 : C.plum, a);
        let py = waveY(x0);
        for (let x = x0; x <= x1; x++) {
          const y = waveY(x);
          const e = env(x);
          const c = e > 0.55 ? cB : e > 0.2 ? cA : cDot;
          for (let yy = Math.min(py, y); yy <= Math.max(py, y); yy++) F.dset(x, yy, c, a);
          py = y;
        }
      }
    }
    // light running along it, a tail behind, a spark where it passes the word
    for (const [hx, big] of [[head, 1], [head2, 0]]) {
      if (hx < -100) continue;
      const len = big ? 7 : 4;
      for (let k = len; k >= 0; k--) {
        const x = hx - k;
        if (x < xL0 || x > xR1) continue;
        const inside = x > xL1 && x < xR0;
        const y = inside ? cy : waveY(x);
        const c = k === 0 ? C.neon2 : k < 2 ? C.neon : k < 4 ? C.blood3 : C.blood2;
        F.dset(x, y, inside && k > 2 ? C.uv2 : c, big ? 1 : 0.75);
      }
    }

    // ------------------------------------------------------------ the word
    const yR0 = Q.y + DISPLAY_H + 1;                         // just below the word
    for (let pass = 0; pass < 3; pass++) {
      if (pass === 1 && !ghost) continue;
      for (let i = 0; i < n; i++) {
        if (Q.r1[i] > reveal) continue;
        const j = Q.slot[i], r = Q.row[i];
        let x = Q.px[i] + (r < SLIT ? shift : -shift), y = Q.py[i];
        let al = 1;
        const d = drop[j];
        const loose = Q.r2[i] < d;
        if (loose) {
          // this pixel wanders away and finds its way back
          x += Math.round((Q.r3[i] - 0.5) * 16 * d);
          y += Math.round((Q.r1[i] - 0.5) * 10 * d - 5 * d);
          al = 1 - d * 0.6;
        }
        if (!on[j]) { if (pass === 2) F.dset(x, y, (x + y) & 1 ? C.bruise2 : C.bruise, 0.9); continue; }   // an unlit tube, still there
        if (pass === 0) {
          // a neon halo that breathes with the beat, then the drop shadow
          const hc = r < SLIT ? C.blood1 : C.violet, ha = (0.3 + 0.35 * beat) * al * a;
          F.dset(x - 1, y, hc, ha); F.dset(x + 1, y, hc, ha); F.dset(x, y - 1, hc, ha); F.dset(x, y + 1, hc, ha);
          F.dset(x + 1, y + 1, C.bruise, al);
          continue;
        }
        if (pass === 1) { F.dset(x + 2, y, C.uv2, 0.5); F.dset(x - 2, y, C.neon, 0.5); continue; }
        // red above the slit, ultraviolet below; the louder the letter's
        // band, the further the hot rim reaches into it
        const b = bayer(x, y);
        const L = lvl[j];
        const hot = 2 + Math.round(L * 2.5);
        let c = r < hot ? C.neon2 : r < 5 ? (r === 4 && b < 0.5 ? C.blood3 : C.neon) : r < SLIT ? C.blood3
          : r < 10 - Math.round(L * 2) ? (b < (r - 7) / 3 ? C.uv2 : C.violet2) : C.uv2;
        if (loose) c = C.violet2;
        F.dset(x, y, c, al);
      }
    }
    // stray pixels that belong to no letter
    if (!still) {
      for (let k = 0; k < 7; k++) {
        const h1 = hash1(k * 131 + tick8 * 7), h2 = hash1(k * 71 + tick8 * 3);
        if (h1 < 0.4) continue;
        F.dset(Q.x - 4 + Math.floor(h1 * (Q.w + 8)), Q.y - 4 + Math.floor(h2 * (DISPLAY_H + 8)), h2 < 0.5 ? C.uv2 : C.neon, a);
      }
    }

    // ------------------------------------- a spectrum under the word
    {
      const base = yR0 + 5, H = 5;
      const bars = Math.ceil(Q.w / 2);
      if (!this.eqPeak || this.eqPeak.length !== bars) this.eqPeak = new Float32Array(bars);
      for (let k = 0; k < bars; k++) {
        const x = Q.x + k * 2, u = k / (bars - 1);
        if (u > reveal) continue;
        const lv = band(u);
        this.eqPeak[k] = still ? lv : Math.max(lv, this.eqPeak[k] - dt * 0.7);
        const hgt = Math.max(1, Math.round(lv * H));
        for (let q = 0; q < hgt; q++) F.dset(x, base - q, q >= 3 ? (u < 0.5 ? C.neon : C.uv2) : q >= 1 ? (u < 0.5 ? C.blood2 : C.violet2) : C.violet, a);
        const pk = Math.round(this.eqPeak[k] * H);
        if (pk >= hgt) F.dset(x, base - pk, u < 0.5 ? C.neon2 : C.uv2, a);
      }
    }

    // -------------------------------------------------- the coin, turning
    if (rail > 8) {
      const R = 8, ccx = xL0 - R - 3, ccy = cy;
      const th = still ? 0.55 : t * 2.1;
      const sx = Math.cos(th), sn = Math.sin(th);
      const flash = ph >= 0 && ph < 0.06 ? 1 - ph / 0.06 : 0;   // a packet leaves
      const thick = Math.round(Math.abs(sn) * 2) * Math.sign(sn);
      for (let yy = -R; yy <= R; yy++) {
        const hw = Math.sqrt(Math.max(0, R * R - yy * yy + R * 0.8));
        const fw = Math.max(0.5, hw * Math.abs(sx));
        // the rim, seen edge-on as it turns
        const x0 = Math.round(ccx - fw), x1 = Math.round(ccx + fw);
        if (thick) for (let x = Math.min(x0, x0 + thick); x <= Math.max(x1, x1 + thick); x++) F.dset(x, ccy + yy, C.blood2, a);
        for (let x = x0; x <= x1; x++) {
          const edge = x === x0 || x === x1 || Math.abs(yy) === R;
          const lit = (x - ccx) * -0.6 + yy * -0.8 > R * 0.25;    // light from the upper left
          F.dset(x, ccy + yy, edge ? (flash > 0.3 ? C.neon2 : C.neon) : lit ? C.blood1 : C.blood0, a);
        }
      }
      const coin = glyph('₿');
      if (Math.abs(sx) > 0.18) {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
          if (!(coin[r] & (1 << (5 - c)))) continue;
          const lx = Math.round(ccx + (c - 2.5) * 2 * sx * 0.82 - (sx > 0 ? 0 : 1));
          const ly = ccy - 7 + Math.round(r * 1.75);
          F.drect(lx, ly, Math.max(1, Math.round(1.7 * Math.abs(sx))), 2, sx > 0 ? C.neon2 : C.bruise2, a);
        }
      }
      if (flash > 0) F.ring(ccx, ccy, R + 2 + (1 - flash) * 5, C.neon, flash * a);
    }

    // ---------------------------------------------- the note, singing out
    if (rail > 8) {
      const nx = xR1 + 4, bob = still ? 0 : Math.round(beat * -1.5), ny = cy - 8 + bob;
      const arrive = ph >= 0.8 ? 1 - (ph - 0.8) / 0.2 : 0;   // the packet lands
      const note = glyph('♫');
      for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
        if (!(note[r] & (1 << (5 - c)))) continue;
        F.dset(nx + c * 2 + 1, ny + r * 2 + 1, C.bruise, a);
        F.drect(nx + c * 2, ny + r * 2, 2, 2, arrive > 0.5 ? C.neon2 : r < 2 ? C.violet2 : C.uv2, a);
      }
      // sound leaving it: arcs that open outward, louder on the beat
      const ox = nx + 13, oy = cy;
      const arcs = still ? [0.35, 0.7] : [0, 1, 2].map((k) => (t * 0.8 + k / 3) % 1);
      arcs.forEach((p) => {
        const Rr = 4 + p * (portrait ? 10 : 15) * (1 + beat * 0.25);
        const span = 0.55 + 0.35 * p;
        const steps = Math.max(4, Math.round(Rr * span * 2));
        for (let q = -steps; q <= steps; q++) {
          const ang = (q / steps) * span;
          F.dset(Math.round(ox + Math.cos(ang) * Rr), Math.round(oy + Math.sin(ang) * Rr), p < 0.4 ? C.uv2 : p < 0.7 ? C.violet2 : C.plum2, Math.min(1, (1 - p) * 1.5) * a);
        }
      });
      if (arrive > 0) for (let q = -4; q <= 4; q++) F.dset(ox + Math.round((1 - arrive) * 10), oy + q, C.neon2, arrive * a);
    }

    // ---------------------------- below: a chain that takes a block per bar
    {
      const sz = 5, step = portrait ? 9 : 10;
      const by = yR0 + 9;
      const span = Math.min(Q.w + rail * 2 + 8, this.w - 24);
      const count = Math.max(3, Math.floor(span / step));
      const bx0 = Math.round(Q.x + Q.w / 2 - (count * step - (step - sz)) / 2);
      const mintN = Math.floor(t / MINT);
      const since = still ? 9 : t - mintN * MINT;
      const slide = still ? 0 : (1 - smooth(clamp(since / 0.45))) * step;   // one step left per block
      // k = -1 is the oldest block, sliding off the end as a new one lands
      for (let k = -1; k < count; k++) {
        const x = Math.round(bx0 + k * step + slide);
        const id = mintN - (count - 1 - k);
        const newest = k === count - 1;
        const fade = k < 0 ? slide / step : 1;
        if (fade <= 0.02) continue;
        const fresh = newest && since < 0.9 && !still;
        const hot = fresh ? 1 - since / 0.9 : 0;
        const al = a * fade;
        F.drect(x, by, sz, sz, hot > 0.4 ? C.blood1 : C.night, al);
        F.drect(x + 1, by - 1, sz, 1, hot > 0.4 ? C.neon : C.plum2, al);          // top
        F.drect(x + sz, by, 1, sz - 1, hot > 0.4 ? C.blood2 : C.plum, al);        // side
        const edge = hot > 0.15 ? C.neon2 : hash1(id * 13) > 0.72 ? C.blood3 : C.violet;
        for (let q = 0; q < sz; q++) { F.dset(x + q, by, edge, al); F.dset(x + q, by + sz - 1, edge, al); F.dset(x, by + q, edge, al); F.dset(x + sz - 1, by + q, edge, al); }
        F.dset(x + 2, by + 2, hash1(id * 7) > 0.5 ? C.blood3 : C.uv2, al);          // its header, a pixel
        // the hash pointer back to its parent
        if (k > -1) {
          for (let q = x - (step - sz) + 1; q < x; q++) F.dset(q, by + 2, C.plum2, al);
          if (!still) { const p = (t * 1.3 + id * 0.37) % 1; F.dset(Math.round(lerp(x - 1, x - (step - sz) + 1, p)), by + 2, C.neon2, al); }
        }
      }
      // where the next block lands
      const nx = bx0 + count * step;
      if (!still && hash1(tick8 * 3) > 0.35) for (let q = 0; q < sz; q += 2) { F.dset(nx + q, by, C.plum2, a * 0.6); F.dset(nx + q, by + sz - 1, C.plum2, a * 0.6); }
    }
  }
}
