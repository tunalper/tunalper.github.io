// Small math + randomness toolkit shared by every scene.
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => clamp((v - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const range = (s, a, b) => smooth(inv(a, b, s));
export const easeIn = (t) => t * t * t;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const expo = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
export const TAU = Math.PI * 2;

// window that rises over [a,b] and falls over [c,d]
export const band = (s, a, b, c, d) => range(s, a, b) * (1 - range(s, c, d));

// deterministic PRNG (mulberry32)
export function rng(seed = 1) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// integer hash -> [0,1) (murmur3 finaliser: exact for any int input)
export function hash1(n) {
  n = Math.imul((n | 0) ^ 0x27d4eb2d, 0x9e3779b1);
  n ^= n >>> 15; n = Math.imul(n, 0x85ebca6b);
  n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export const hash2 = (x, y) => hash1((x | 0) * 73856093 ^ (y | 0) * 19349663);

// smooth 1D value noise
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}

export const HEX = '0123456789abcdef';
export function hexString(n, r = Math.random) {
  let s = '';
  for (let i = 0; i < n; i++) s += HEX[(r() * 16) | 0];
  return s;
}

// keyframe track: [[s, value], ...] -> eased piecewise value at s
export function track(s, keys, ease = smooth) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (s <= k[0]) {
      const p = keys[i - 1];
      const t = (s - p[0]) / (k[0] - p[0]);
      return p[1] + (k[1] - p[1]) * (k[2] || ease)(t);
    }
  }
  return keys[keys.length - 1][1];
}
