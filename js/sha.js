// A real SHA-256, one round at a time, so the ledger can show its insides.
// It double-hashes Bitcoin's genesis block header; the last round lands on
// 000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f.
export const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
export const GENESIS_HEADER = '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c';

const rotr = (x, n) => (x >>> n) | (x << (32 - n));
export const hex8 = (x) => (x >>> 0).toString(16).padStart(8, '0');
const fromHex = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));

function blocksOf(bytes) {
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const bits = len * 8;
  buf[total - 4] = (bits >>> 24) & 255; buf[total - 3] = (bits >>> 16) & 255; buf[total - 2] = (bits >>> 8) & 255; buf[total - 1] = bits & 255;
  const out = [];
  for (let o = 0; o < total; o += 64) {
    const w = new Uint32Array(16);
    for (let i = 0; i < 16; i++) w[i] = (buf[o + i * 4] << 24) | (buf[o + i * 4 + 1] << 16) | (buf[o + i * 4 + 2] << 8) | buf[o + i * 4 + 3];
    out.push(w);
  }
  return out;
}

export class ShaStepper {
  constructor(hexMessage = GENESIS_HEADER) {
    this.msg = fromHex(hexMessage);
    this.reset();
  }

  reset() {
    this.pass = 0;                 // 0: first SHA-256, 1: the second (double)
    this.load(this.msg);
    this.done = false;
    this.digest = null;
  }

  load(bytes) {
    this.blocks = blocksOf(bytes);
    this.bi = 0;
    this.H = H0.slice();
    this.startBlock();
  }

  startBlock() {
    const W = new Uint32Array(64);
    W.set(this.blocks[this.bi]);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    this.W = W;
    this.t = 0;
    this.r = this.H.slice();       // a b c d e f g h
  }

  get totalRounds() { return (this.blocksTotal || 3) * 64; }

  // one compression round; returns true when the whole double hash is done
  step() {
    if (this.done) return true;
    const [a, b, c, d, e, f, g, h] = this.r;
    const t = this.t;
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[t] + this.W[t]) >>> 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) >>> 0;
    this.r = [(t1 + t2) >>> 0, a, b, c, (d + t1) >>> 0, e, f, g];
    this.last = { S0, S1, ch, maj };
    this.t++;
    if (this.t === 64) {
      for (let i = 0; i < 8; i++) this.H[i] = (this.H[i] + this.r[i]) >>> 0;
      this.bi++;
      if (this.bi < this.blocks.length) this.startBlock();
      else if (this.pass === 0) {
        // hash the hash
        const d1 = new Uint8Array(32);
        this.H.forEach((x, i) => { d1[i * 4] = x >>> 24; d1[i * 4 + 1] = (x >>> 16) & 255; d1[i * 4 + 2] = (x >>> 8) & 255; d1[i * 4 + 3] = x & 255; });
        this.pass = 1;
        this.load(d1);
      } else {
        // bitcoin shows the digest byte-reversed
        const bytes = [];
        this.H.forEach((x) => bytes.push(x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255));
        this.digest = bytes.reverse().map((v) => v.toString(16).padStart(2, '0')).join('');
        this.done = true;
      }
    }
    return this.done;
  }

  // which compression of the three (header block 1, block 2, second hash)
  get stage() { return this.pass === 0 ? this.bi + 1 : 3; }
}
