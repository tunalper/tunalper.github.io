// The timeline. Scroll position s is measured in "screens"; every visual
// parameter is a keyframed function of s (plus time for things that breathe).
import { track, band, range, clamp, smooth, easeInOut, easeIn, easeOut, damp } from './util.js';

// scene anchors (screens of scroll)
export const STORY = {
  open: 0,
  strait: 1.0,
  dive: 3.3,
  core: 4.3,
  ledger: 7.8,
  signal: 10.6,
  closing: 13.8,
  mined: 15.7,   // the block is sealed
  end: 17.6,
};
export const SCENES = [
  { id: 'open', at: 0, jump: 0 },
  { id: 'strait', at: STORY.strait, jump: 2.05 },
  { id: 'core', at: STORY.core, jump: 5.7 },
  { id: 'ledger', at: STORY.ledger, jump: 8.9 },
  { id: 'signal', at: STORY.signal, jump: 11.9 },
  { id: 'closing', at: STORY.closing, jump: 14.4 },
];

export class Director {
  constructor() {
    this.S = {
      s: 0, time: 0, boot: 0,
      cam: [0, 4, 0], pitch: 0.1, fov: 1.0,
      whirl: [6, 26, 7], spin: 0.5,
      world: 0, storm: 1, moon: 1, moonDir: [-0.16, 0.17, 0.97],
      flash: [0.5, 0], mouse: [0.5, 0.5, 0, 0.12],
      core: [0.5, 0.5, 0.1, 0], deep: 0, abyss: 0, radar: 0, grid: 0,
      glitch: 0, split: 0, fade: 0, red: 0, dither: 0.055, shake: 0,
      w: { open: 1, strait: 0, core: 0, ledger: 0, signal: 0, closing: 0 },
      scene: 0, aspect: 1.6, portrait: false,
      // transient fx impulses (decay every frame)
      kick: 0, flashT: 0,
    };
    this.glitchImpulse = 0;
    this.shakeImpulse = 0;
    this.redImpulse = 0;
  }

  impulse(glitch = 0.6, shake = 0, red = 0) {
    this.glitchImpulse = Math.max(this.glitchImpulse, glitch);
    this.shakeImpulse = Math.max(this.shakeImpulse, shake);
    this.redImpulse = Math.max(this.redImpulse, red);
  }

  update(s, time, dt, boot, aspect, input) {
    const S = this.S;
    S.s = s; S.time = time; S.boot = boot; S.aspect = aspect;
    S.portrait = aspect < 0.85;
    const P = STORY;
    const L = clamp(aspect / 1.6, 0.55, 1.15);
    S.layout = L;

    // ---------------------------------------------------------- weights
    const w = S.w;
    w.open = 1 - range(s, 0.15, 1.1);
    w.strait = band(s, 0.05, 0.9, P.dive + 0.4, P.core + 0.3);
    w.core = band(s, P.dive + 0.5, P.core + 0.4, P.ledger - 0.5, P.ledger + 0.25);
    w.ledger = band(s, P.ledger - 0.45, P.ledger + 0.3, P.signal - 0.3, P.signal + 0.3);
    w.signal = band(s, P.signal - 0.25, P.signal + 0.45, P.closing - 0.3, P.closing + 0.3);
    w.closing = range(s, P.closing - 0.3, P.closing + 0.35);
    let best = 0, bi = 0;
    ['open', 'strait', 'core', 'ledger', 'signal', 'closing'].forEach((k, i) => { if (w[k] > best + 0.001) { best = w[k]; bi = i; } });
    S.scene = bi;

    // ---------------------------------------------------------- camera
    // sail forward between the two dangers, then pitch down into the throat
    const wx = 7.5 * L, wz = 28, wr = 9 * (0.6 + 0.4 * L);
    S.whirl[0] = wx; S.whirl[1] = wz; S.whirl[2] = wr;
    const dive = range(s, P.dive - 0.2, P.core + 0.1);
    const fwd = track(s, [[0, -14], [P.strait, -12], [P.dive, 4]], smooth);
    const camX = track(s, [[0, 0], [P.dive - 0.2, 0.5], [P.core + 0.1, wx]], easeInOut);
    const camZ = track(s, [[0, fwd], [P.dive - 0.2, fwd], [P.core + 0.1, wz]], easeInOut);
    // the hand moves the camera a little: every layer parallaxes by depth
    const par = (1 - dive) * (app_reduced(input) ? 0 : 1);
    S.cam[0] = camX + (input ? (input.sx - 0.5) * 1.1 * par : 0);
    S.cam[2] = s < P.dive - 0.2 ? fwd : camZ;
    S.cam[1] = track(s, [[0, 6.6], [P.strait, 6.6], [P.dive - 0.2, 7.2], [P.dive + 0.5, 15], [P.core + 0.1, 12.5], [P.core + 1.2, 10], [P.ledger, 7], [P.end, 5]], smooth);
    const sway = Math.sin(time * 0.6) * 0.012 + Math.sin(time * 1.37) * 0.006;
    S.pitch = track(s, [[0, 0.13], [P.dive - 0.2, 0.15], [P.core + 0.1, 1.5707]], easeInOut) + sway * (1 - dive)
      + (input ? (input.sy - 0.45) * 0.035 * par : 0);
    S.cam[1] += input ? (0.5 - input.sy) * 0.4 * par : 0;
    const md = [-0.21 * L, 0.142, 1.018];
    const ml = Math.hypot(md[0], md[1], md[2]);
    S.moonDir[0] = md[0] / ml; S.moonDir[1] = md[1] / ml; S.moonDir[2] = md[2] / ml;
    // the lantern
    if (input) {
      S.mouse[0] = input.sx; S.mouse[1] = 1 - input.sy;
      S.mouse[2] = app_reduced(input) ? 0 : input.activity * 0.85;
      S.mouse[3] = input.touch ? 0.16 : 0.11;
    }
    S.fov = track(s, [[0, 1.05], [P.dive, 1.0], [P.core, 0.9]]);
    S.spin = track(s, [[0, 0.55], [P.dive, 0.8], [P.core + 1.0, 1.4], [P.ledger, 2.0]]);

    // ---------------------------------------------------------- world
    const bootIn = range(boot, 3.2, 5.2);
    S.world = Math.max(0.0, bootIn * track(s, [[0, 0.45], [0.95, 1]])) * (1 - range(s, P.signal - 0.2, P.signal + 0.6));
    S.storm = 1 - range(s, P.dive + 0.1, P.core - 0.1);
    S.moon = 1 - range(s, P.dive - 0.3, P.dive + 0.4);
    S.deep = range(s, P.dive, P.core + 0.2) * (1 - 0.55 * range(s, P.core + 0.2, P.core + 0.9)) * (1 - range(s, P.ledger - 0.2, P.ledger + 0.6));
    S.abyss = track(s, [[0, 0], [P.ledger - 0.4, 0], [P.ledger + 0.6, 0.72], [P.signal, 0.9], [P.closing, 1]]);
    S.radar = band(s, P.signal - 0.3, P.signal + 0.5, P.closing - 0.4, P.closing + 0.2);
    S.grid = band(s, P.closing + 0.2, P.closing + 0.8, P.end - 1.2, P.end - 0.7);

    // core glow (center of the screen, rising out of the throat)
    const rise = range(s, P.core - 0.3, P.core + 0.9);
    S.core[0] = 0.5;
    S.core[1] = 0.5;
    S.core[2] = 0.05 + 0.05 * rise;
    S.core[3] = rise * (1 - range(s, P.ledger - 0.2, P.ledger + 0.6)) * 0.8;

    // ---------------------------------------------------------- post
    this.glitchImpulse = damp(this.glitchImpulse, 0, 5.5, dt);
    this.shakeImpulse = damp(this.shakeImpulse, 0, 9, dt);
    this.redImpulse = damp(this.redImpulse, 0, 3.5, dt);
    // transitions tear the image a little
    const seams = [P.strait - 0.1, P.dive + 0.6, P.ledger, P.signal, P.closing];
    let seam = 0;
    for (const k of seams) seam = Math.max(seam, 1 - clamp(Math.abs(s - k) / 0.22));
    S.glitch = clamp(this.glitchImpulse + seam * seam * 0.35);
    S.split = this.glitchImpulse * 1.5;
    S.shake = (Math.random() - 0.5) * this.shakeImpulse * 6;
    S.red = this.redImpulse;
    // the end goes dark before the title returns
    S.fade = band(s, P.end - 1.15, P.end - 0.75, P.end - 0.5, P.end - 0.1) * 0.85;
    S.dither = 0.014;
    return S;
  }
}

const app_reduced = (input) => !!(input && input.app && input.app.reduced);

export { easeIn, easeOut };
