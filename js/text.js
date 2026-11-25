// Bitmap text for the canvas world (the DOM uses the same glyphs as a WOFF2).
import { SMALL, DISPLAY, BROKEN } from './glyphs.js';

const G = SMALL.glyphs;
export const CELL_W = SMALL.w;
export const CELL_H = SMALL.h;
export const BROKEN_CHARS = BROKEN.map((cp) => String.fromCodePoint(cp));
export const HEX_CHARS = '0123456789abcdef';
export const NOISE_CHARS = '0123456789abcdefΣΔΩΨΧΞΦλπ#%*+=<>/\\|░▒▓·:' + BROKEN_CHARS.join('');
const EMPTY = [0, 0, 0, 0, 0, 0, 0, 0];

export const glyph = (ch) => G[ch] || G[ch.toUpperCase()] || EMPTY;

export function drawText(pb, str, x, y, c, a = 1, scale = 1) {
  let cx = x;
  for (const ch of str) {
    if (ch !== ' ') pb.bits(cx, y, glyph(ch), 6, c, a, scale);
    cx += 6 * scale;
  }
  return cx - x;
}

export const textWidth = (str, scale = 1) => [...str].length * 6 * scale - scale;

export const randomChar = (r = Math.random, pool = NOISE_CHARS) => pool[(r() * pool.length) | 0];

export const DISPLAY_H = DISPLAY.h;
export const displayGlyph = (ch) => DISPLAY.glyphs[ch];
