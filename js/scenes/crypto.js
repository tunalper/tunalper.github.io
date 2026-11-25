// The ledger's machinery, drawn: Bitcoin's curve (y^2 = x^3 + 7) adding a
// point to itself over and over, and a Merkle tree folding transactions
// into a single root.
import { C } from '../palette.js';
import { clamp, lerp, range, hash1, smooth } from '../util.js';
import { drawText, textWidth } from '../text.js';
import { STORY } from '../director.js';

const XMIN = -2.3, XMAX = 3.4, YMAX = 7.2;
const G = [-1.0, Math.sqrt(6)];
const STEP = 1.9;   // seconds per point addition
const ROOT = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b';

function add(p, q) {
  let m;
  if (Math.abs(p[0] - q[0]) < 1e-9) {
    if (Math.abs(p[1] + q[1]) < 1e-9) return null;
    m = (3 * p[0] * p[0]) / (2 * p[1]);
  } else m = (q[1] - p[1]) / (q[0] - p[0]);
  const x = m * m - p[0] - q[0];
  return [x, m * (p[0] - x) - p[1], m];
}

export class Crypto {
  constructor(ctx) {
    this.ctx = ctx;
    // walk k*G, restarting whenever the point leaves the window
    this.seq = [];
    let P = G, k = 1;
    for (let i = 0; i < 40; i++) {
      const R = add(P, G);
      if (!R || R[0] < XMIN || R[0] > XMAX || Math.abs(R[1]) > YMAX) { P = G; k = 1; continue; }
      this.seq.push({ P, k, R: [R[0], R[1]], m: R[2] });
      P = [R[0], R[1]]; k++;
    }
  }

  resize(w, h) { this.w = w; this.h = h; }

  boxes(S) {
    const w = this.w, h = this.h;
    if (S.portrait) return {
      curve: [Math.round(w * 0.07), Math.round(h * 0.09), Math.round(w * 0.79), Math.round(h * 0.2)],
      merkle: [Math.round(w * 0.07), Math.round(h * 0.765), Math.round(w * 0.79), Math.round(h * 0.135)],
    };
    return {
      curve: [Math.round(w * 0.56), Math.round(h * 0.12), Math.round(w * 0.385), Math.round(h * 0.42)],
      merkle: [Math.round(w * 0.56), Math.round(h * 0.65), Math.round(w * 0.385), Math.round(h * 0.27)],
    };
  }

  frame(S, dt) {
    const vis = S.w.ledger * (1 - range(S.s, STORY.signal - 0.5, STORY.signal));
    if (vis <= 0.02 || !this.w) return;
    const { F } = this.ctx;
    const B = this.boxes(S);
    const a = clamp(range(S.s, STORY.ledger - 0.3, STORY.ledger + 0.4) * 1.2) * vis;
    if (a <= 0.02) return;
    this.drawCurve(F, B.curve, S.time, a);
    this.drawMerkle(F, B.merkle, S.time, a);
  }

  frameBox(F, x, y, w, h, a) {
    F.drect(x, y, w, h, C.void, 0.82 * a);
    for (let i = 0; i < w; i += 2) { F.dset(x + i, y, C.plum2, a); F.dset(x + i, y + h - 1, C.plum2, a); }
    for (let i = 0; i < h; i += 2) { F.dset(x, y + i, C.plum2, a); F.dset(x + w - 1, y + i, C.plum2, a); }
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
      for (let i = 0; i < 4; i++) { F.dset(cx + dx * i, cy, C.neon, a); F.dset(cx, cy + dy * i, C.neon, a); }
    }
  }

  // ------------------------------------------------------- the curve
  drawCurve(F, [x0, y0, w, h], t, a) {
    this.frameBox(F, x0, y0, w, h, a);
    const pad = 3, top = 9;
    const px = (x) => x0 + pad + ((x - XMIN) / (XMAX - XMIN)) * (w - pad * 2);
    const py = (y) => y0 + top + (1 - (y + YMAX) / (YMAX * 2)) * (h - top - pad - 9);
    // axes
    const ax = Math.round(px(0)), ay = Math.round(py(0));
    for (let x = x0 + 2; x < x0 + w - 2; x += 3) F.dset(x, ay, C.plum, a);
    for (let y = y0 + top; y < y0 + h - 9; y += 3) F.dset(ax, y, C.plum, a);
    // y^2 = x^3 + 7, both branches, sampled finely so the steep root joins up
    let prev = null;
    for (let i = 0; i <= 400; i++) {
      const x = lerp(-Math.cbrt(7), XMAX, Math.pow(i / 400, 1.6));
      const y = Math.sqrt(Math.max(0, x * x * x + 7));
      if (y > YMAX) break;
      const X = Math.round(px(x)), Y1 = Math.round(py(y)), Y2 = Math.round(py(-y));
      if (prev) { F.line(prev[0], prev[1], X, Y1, C.violet2, a); F.line(prev[0], prev[2], X, Y2, C.violet2, a); }
      prev = [X, Y1, Y2];
    }
    // the current addition: P + G
    const n = this.seq.length;
    const step = Math.floor(t / STEP) % n, ph = (t % STEP) / STEP;
    const { P, k, R, m } = this.seq[step];
    const Rm = [R[0], -R[1]];
    const dot = (p, c, r = 1) => { const X = Math.round(px(p[0])), Y = Math.round(py(p[1])); F.disc(X, Y, r, c, a); return [X, Y]; };
    if (ph > 0.12) {
      // the secant through P and G, out to the third meeting
      const e = smooth(clamp((ph - 0.12) / 0.3));
      const xa = Math.min(P[0], G[0], Rm[0]) - 0.3, xb = Math.max(P[0], G[0], Rm[0]) + 0.3;
      const ya = P[1] + m * (xa - P[0]), yb = P[1] + m * (lerp(xa, xb, e) - P[0]);
      F.line(Math.round(px(xa)), Math.round(py(ya)), Math.round(px(lerp(xa, xb, e))), Math.round(py(yb)), C.blood3, a * 0.9);
    }
    if (ph > 0.45) {
      dot(Rm, C.uv2);
      // reflect across the x axis: that is the sum
      const e = smooth(clamp((ph - 0.5) / 0.25));
      const X = Math.round(px(R[0]));
      const ya = py(Rm[1]), yb = lerp(ya, py(R[1]), e);
      for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y += 2) F.dset(X, Math.round(y), C.violet2, a);
    }
    const g = dot(G, C.neon2, 1.5);
    drawText(F, 'G', g[0] + 3, g[1] - 9, C.neon2, a);
    const p = dot(P, C.neon, 1);
    if (k > 1) drawText(F, k + 'G', p[0] + 3, p[1] + 2, C.neon, a);
    if (ph > 0.72) {
      const r = dot(R, C.neon2, ph > 0.8 && (t * 8) % 1 > 0.5 ? 2 : 1.5);
      drawText(F, (k + 1) + 'G', r[0] + 4, r[1] - 3, C.neon2, a);
    }
    drawText(F, 'secp256k1', x0 + 4, y0 + 2, C.blood3, a);
    const eq = 'y²=x³+7';
    drawText(F, eq, x0 + w - textWidth(eq) - 4, y0 + 2, C.violet2, a);
    const kg = 'k·G  k=' + (k + (ph > 0.72 ? 1 : 0));
    drawText(F, kg, x0 + 4, y0 + h - 8, C.plum2, a);
  }

  // ------------------------------------------------------ the Merkle tree
  drawMerkle(F, [x0, y0, w, h], t, a) {
    this.frameBox(F, x0, y0, w, h, a);
    const leaves = 8;
    const levels = 4;
    const cycle = 4.2, ph = (t % cycle) / cycle, round = Math.floor(t / cycle);
    const nodeW = Math.min(16, Math.floor((w - 8) / leaves) - 2), nodeH = 9;
    const rowY = (lv) => Math.round(y0 + h - 10 - lv * ((h - 20) / (levels - 1)));
    const pos = [];
    for (let lv = 0; lv < levels; lv++) {
      const n = leaves >> lv;
      const row = [];
      for (let i = 0; i < n; i++) {
        const cx = x0 + 4 + ((i + 0.5) * (w - 8)) / n;
        row.push([Math.round(cx), rowY(lv)]);
      }
      pos.push(row);
    }
    // the hashing wave climbs one level at a time
    const lit = (lv) => clamp((ph * 1.3 - lv * 0.25) / 0.25);
    for (let lv = 1; lv < levels; lv++) {
      pos[lv].forEach(([cx, cy], i) => {
        for (const ch of [i * 2, i * 2 + 1]) {
          const [bx, by] = pos[lv - 1][ch];
          const L = lit(lv - 1) > 0.99 ? C.blood2 : C.plum;
          F.line(bx, by - Math.ceil(nodeH / 2), bx, by - Math.ceil(nodeH / 2) - 2, L, a);
          F.line(bx, by - Math.ceil(nodeH / 2) - 2, cx, cy + Math.ceil(nodeH / 2) + 1, L, a);
          // a packet riding up the edge
          const e = clamp((ph * 1.3 - (lv - 1) * 0.25 - 0.1) / 0.18);
          if (e > 0 && e < 1) F.set(Math.round(lerp(bx, cx, e)), Math.round(lerp(by - nodeH / 2 - 2, cy + nodeH / 2 + 1, e)), C.neon2);
        }
      });
    }
    for (let lv = 0; lv < levels; lv++) {
      pos[lv].forEach(([cx, cy], i) => {
        const on = lit(lv);
        const isRoot = lv === levels - 1;
        const bw = isRoot ? Math.min(w - 10, 52) : nodeW;
        const x = cx - Math.floor(bw / 2), y = cy - Math.floor(nodeH / 2);
        F.drect(x, y, bw, nodeH, on > 0.99 ? (isRoot ? C.blood1 : C.night) : C.ink, a);
        F.frame(x, y, bw, nodeH, on > 0.99 ? (isRoot ? C.neon2 : C.violet) : C.plum);
        let label;
        if (isRoot) label = on > 0.99 ? ROOT.slice(0, 4) + '…' + ROOT.slice(-3) : '▓▓▓▓…▓▓▓';
        else if (bw >= 14) {
          const v = hash1(lv * 977 + i * 131 + round * 7919);
          label = on > 0.99 ? v.toString(16).slice(2, 4) : '░░';
        }
        if (label) drawText(F, label, cx - Math.floor(textWidth(label) / 2), y + 1, on > 0.99 ? (isRoot ? C.neon2 : C.violet2) : C.plum2, a);
      });
    }
    drawText(F, 'merkle', x0 + 4, y0 + 2, C.blood3, a);
  }
}
