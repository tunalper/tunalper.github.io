// The whole experience is quantised to this palette (ordered dither in the
// post pass). Near-black purples, clotted reds, and a few small neon sparks.
// Steps are deliberately coarse so banding + dithering read as pixel art.
export const HEXES = [
  // 0-8 cold purple-blacks
  '#030204', '#08050c', '#110a18', '#1b0f26', '#281436', '#371a49', '#4a1f5e', '#612676', '#7b2d93',
  // 9-15 blood
  '#14050a', '#2b0711', '#470b1a', '#6a0f24', '#8f132e', '#bd173a', '#ea2250',
  // 16-17 bruise
  '#3c0d33', '#5c124a',
  // 18 ultraviolet spark
  '#922fdb',
];

const toRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const RGB = HEXES.map(toRGB);
export const GL_PALETTE = new Float32Array(RGB.flatMap(([r, g, b]) => [r / 255, g / 255, b / 255]));

// packed little-endian RGBA for Uint32 pixel writes
export const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const P = (i) => pack(...RGB[i]);

// named swatches used by sprite code
export const C = {
  void: P(0), ink: P(1), night: P(2), dusk: P(3), plum: P(4), plum2: P(5),
  violet: P(6), violet2: P(7), uv: P(8),
  clot: P(9), blood0: P(10), blood1: P(11), blood2: P(12), blood3: P(13), neon: P(14), neon2: P(15),
  bruise: P(16), bruise2: P(17), uv2: P(18),
};
