// GLSL ES 1.00 so the same source runs on WebGL1 and WebGL2.
import { HEXES } from './palette.js';

export const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// ------------------------------------------------------------------ world
// One camera, one sea plane. Pitching the camera from the horizon to straight
// down turns the strait into the whirlpool's throat without a single cut.
export const WORLD = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCam;
uniform float uPitch;
uniform float uFov;
uniform vec3 uWhirl;
uniform float uSpin;
uniform float uWorld;
uniform float uStorm;
uniform float uMoon;
uniform vec3 uMoonDir;
uniform vec4 uFlash;
uniform vec4 uMouse;
uniform vec4 uCore;
uniform float uDeep;
uniform float uAbyss;
uniform float uRadar;
uniform float uGrid;
uniform sampler2D uW;
uniform sampler2D uF;
uniform sampler2D uM;
uniform sampler2D uW2;
uniform float uMeshOn;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
// quantise to n steps, ordered-dither the step edges: the pixel-art gradient
float qd(float v, float n, float b){ float x = clamp(v, 0.0, 1.0) * n; return (floor(x) + step(b, fract(x))) / n; }
// same, but the dither only lives in a narrow seam between flat bands
float qs(float v, float n, float b, float sharp){
  float x = clamp(v, 0.0, 1.0) * n;
  float f = clamp((fract(x) - 0.5) * sharp + 0.5, 0.0, 1.0);
  return (floor(x) + step(b, f)) / n;
}

vec3 skyColor(vec3 rd, vec2 uv, float b){
  float y = max(rd.y, 0.0);
  // five dithered bands: violet at the waterline, void overhead
  float g = qs(1.0 - smoothstep(0.0, 0.34, y), 5.0, b, 3.0);
  vec3 col = mix(vec3(0.012, 0.008, 0.016), vec3(0.20, 0.09, 0.26), g * g);

  // the blood moon lights a wide patch of sky
  float md = dot(rd, uMoonDir);
  float mg = smoothstep(0.93, 0.9985, md) * uMoon;
  col = mix(col, vec3(0.20, 0.045, 0.17), qd(mg * 0.75, 3.0, b) * 0.85);
  float halo = smoothstep(0.9955, 0.99905, md) * uMoon;
  col = mix(col, vec3(0.34, 0.07, 0.27), step(b, halo * 0.85));
  float disc = step(0.99905, md) * uMoon;
  vec2 mp = (rd.xy - uMoonDir.xy) * 64.0;
  float cr = noise(mp * 1.3 + 3.0) * 0.6 + noise(mp * 3.1) * 0.4;
  // exact palette entries so the disc never dithers
  vec3 moonCol = vec3(0.741, 0.090, 0.227);
  moonCol = mix(moonCol, vec3(0.561, 0.075, 0.180), step(0.55, cr));
  moonCol = mix(moonCol, vec3(0.416, 0.059, 0.141), step(0.72, cr));
  float edge = 1.0 - step(0.99922, md);
  moonCol = mix(moonCol, vec3(0.918, 0.133, 0.314), edge * step(0.0, rd.x - uMoonDir.x) * step(rd.y, uMoonDir.y + 0.02));
  moonCol = mix(moonCol, vec3(0.416, 0.059, 0.141), edge * step(rd.x - uMoonDir.x, 0.0));
  col = mix(col, moonCol, disc);

  // storm deck: hard-edged clouds, dithered fringes, moonlit rims
  float tc = 1.0 / (rd.y + 0.05);
  vec2 cq = rd.xz * tc * 0.5 + vec2(uTime * 0.016, uTime * 0.003) + uCam.xz * 0.004;
  float c = fbm(cq);
  float c2 = fbm(cq * 2.2 + vec2(4.0, uTime * 0.012));
  float clearing = smoothstep(0.9935, 0.9988, md) * uMoon;
  float dens = step(0.47 + (b - 0.5) * 0.07 + clearing * 0.45, c) * uStorm;
  float lit = step(0.58 + (b - 0.5) * 0.06, c2);
  vec3 cloud = mix(vec3(0.067, 0.039, 0.094), vec3(0.157, 0.078, 0.212), lit);
  cloud = mix(cloud, vec3(0.10, 0.05, 0.14), step(b, g * 0.6) * (1.0 - lit));
  cloud = mix(cloud, vec3(0.40, 0.07, 0.20), lit * step(b, mg * 1.4));
  cloud = mix(cloud, vec3(0.22, 0.05, 0.16), (1.0 - lit) * step(b, mg * 0.9));
  float fl = uFlash.y * exp(-abs(uv.x - uFlash.x) * 2.6);
  cloud = mix(cloud, vec3(0.30, 0.11, 0.40), step(b, fl * (0.5 + lit * 0.7)));
  float thin = step(0.41 + (b - 0.5) * 0.06, c) * (1.0 - step(0.47, c));
  col = mix(col, vec3(0.07, 0.04, 0.10), thin * step(b, 0.5) * uStorm);
  col = mix(col, cloud, dens);

  // cold sparks where the deck tears
  vec2 sg = floor(uv * uRes);
  float st = step(0.9975, hash(sg)) * (1.0 - dens) * step(0.1, y);
  col = mix(col, vec3(0.30, 0.13, 0.38), st * step(0.5, fract(uTime * 0.7 + hash(sg + 3.1))));
  col = mix(col, vec3(0.20, 0.08, 0.26), step(b, uFlash.y * 0.45));
  return col;
}

vec3 seaColor(vec3 ro, vec3 rd, float b){
  float t = ro.y / -rd.y;
  vec3 P = ro + rd * t;
  vec2 q = P.xz;

  vec2 d = q - uWhirl.xy;
  float R = uWhirl.z;
  float r = length(d) / R;
  float a = atan(d.y, d.x);
  float infl = 1.0 - smoothstep(0.8, 2.1, r);
  float spin = uTime * uSpin;
  // the sea is dragged around the throat
  vec2 qw = uWhirl.xy + rot(infl * (1.5 / (r + 0.35))) * d;

  float far = qs(1.0 - exp(-t * 0.024), 4.0, b, 4.0);
  vec3 col = mix(vec3(0.030, 0.019, 0.046), vec3(0.15, 0.075, 0.20), far * far);
  float near = exp(-t * 0.022);
  float swell = sin(qw.y * 0.42 + sin(qw.x * 0.19 + uTime * 0.35) * 1.6 + uTime * 1.05) * 0.5 + 0.5;
  float chop = noise(qw * vec2(0.5, 1.4) + vec2(uTime * 0.4, uTime * 0.9));
  // long solid swells, broken by chop (no dither noise on open water)
  col = mix(col, vec3(0.068, 0.040, 0.095), step(0.78, swell * 0.75 + chop * 0.35) * near);
  col = mix(col, vec3(0.012, 0.008, 0.016), step(0.82, (1.0 - swell) * 0.8 + chop * 0.3) * near);
  // the moon road on the water (wide, faint) - sharp glitter is drawn as sprites
  float rw = 0.008 + (-rd.y) * 0.16;
  float road = exp(-pow((rd.x / max(rd.z, 0.05) - uMoonDir.x / uMoonDir.z) / rw, 2.0));
  col = mix(col, vec3(0.20, 0.045, 0.15), step(0.72, road * (0.55 + chop * 0.6)) * uMoon);
  col = mix(col, vec3(0.20, 0.08, 0.26), step(b, uFlash.y * 0.5));

  // ------------------------------------------------------------ Charybdis
  if (r < 2.1){
    // rigid rotation: arms never wind up, however long you watch
    float sw = a - 2.4 * log(r + 0.05) + spin * 1.15;
    float arms = sin(sw * 4.0) * 0.5 + 0.5;
    // the water itself pours inward along the arms
    float turb = noise(vec2(sw * 3.0, r * 10.0 + spin * 1.6));
    float f = qs(smoothstep(0.04, 1.1, r), 4.0, b, 3.0);
    vec3 wc = mix(vec3(0.0), vec3(0.11, 0.06, 0.15), f * f);
    float band = arms * 0.7 + turb * 0.45;
    float armMask = step(0.62, band) * step(0.09, r) * (1.0 - step(1.5, r));
    wc = mix(wc, mix(vec3(0.16, 0.078, 0.21), vec3(0.22, 0.10, 0.29), step(0.55, r)), armMask);
    float fleck = step(0.93, arms * 0.62 + turb * 0.6) * step(0.2, r) * (1.0 - step(1.35, r));
    wc = mix(wc, vec3(0.38, 0.15, 0.46), fleck);
    float lipW = 0.035 + t * 0.0016;
    float lip = step(abs(r - 1.0 - 0.045 * sin(a * 6.0 + spin * 1.3)), lipW);
    wc = mix(wc, vec3(0.38, 0.15, 0.46), lip);
    float lip2 = step(abs(r - 1.12 - 0.05 * sin(a * 4.0 - spin)), lipW * 0.8) * step(0.5, turb);
    wc = mix(wc, vec3(0.29, 0.12, 0.37), lip2);
    float throat = exp(-r * r * 30.0) * uDeep;
    wc = mix(wc, vec3(0.30, 0.03, 0.07), step(b, throat * 1.6));
    wc = mix(wc, vec3(0.62, 0.065, 0.13), step(b, throat * 0.9));
    col = mix(col, wc, step(b, infl));
  }
  col = mix(col, vec3(0.16, 0.078, 0.21), step(b, smoothstep(40.0, 160.0, t) * 0.75));
  return col;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  vec2 p = (fc - 0.5 * uRes) / uRes.y;
  float aspect = uRes.x / uRes.y;
  float b = bayer4(fc) + 0.03125;

  vec3 rd = normalize(vec3(p.x, p.y, uFov));
  float cp = cos(uPitch), sp = sin(uPitch);
  rd = vec3(rd.x, rd.y * cp - rd.z * sp, rd.y * sp + rd.z * cp);

  vec3 col = vec3(0.0);
  if (uWorld > 0.001){
    if (rd.y < -0.0005) col = seaColor(uCam, rd, b);
    else col = skyColor(rd, uv, b);
    float hz = exp(-abs(rd.y) * 140.0);
    col = mix(col, vec3(0.22, 0.10, 0.29) + vec3(0.10, 0.035, 0.12) * uFlash.y, step(b, hz * 0.8 * uStorm));
  }

  // world sprites (cliffs, Scylla, ship) sit inside the weather
  vec4 w = texture2D(uW, vec2(uv.x, 1.0 - uv.y));
  col = mix(col, w.rgb, w.a);
  // Scylla: real geometry, rendered in its own depth-tested pass
  if (uMeshOn > 0.5){
    vec4 m = texture2D(uM, uv);
    col = mix(col, m.rgb, m.a);
  }
  // what stands in front of her (the ship, the near rocks)
  vec4 w2 = texture2D(uW2, vec2(uv.x, 1.0 - uv.y));
  col = mix(col, w2.rgb, w2.a);

  // drifting sea fog, thick near the horizon, three dithered densities
  if (uStorm > 0.001){
    float hy = 0.5 + uFov * tan(min(uPitch, 1.5));
    float bandY = exp(-pow((uv.y - hy) * 5.0, 2.0)) + 0.1 * smoothstep(hy, 0.0, uv.y);
    float fn = fbm(vec2(uv.x * aspect * 2.0 + uTime * 0.045, uv.y * 6.5 - uTime * 0.015));
    float fog = clamp(bandY * smoothstep(0.40, 0.80, fn), 0.0, 1.0) * uStorm;
    col = mix(col, vec3(0.16, 0.078, 0.21) + vec3(0.14, 0.05, 0.17) * uFlash.y, qs(fog * 0.8, 3.0, b, 3.0) * 0.85);
  }

  // the world is dim until you scroll into it; lightning shows it whole
  col *= clamp(uWorld + uFlash.y * 0.9, 0.0, 1.0);

  // the cursor is a lantern
  vec2 mv = (uv - uMouse.xy) * vec2(aspect, 1.0);
  float ml = uMouse.z * exp(-dot(mv, mv) / (uMouse.w * uMouse.w));
  col += vec3(0.13, 0.03, 0.10) * qd(ml, 4.0, b);

  col = mix(col, vec3(0.0), qd(uAbyss, 6.0, b));

  // signal: sonar rings breathing out of the centre
  if (uRadar > 0.001){
    vec2 rc = (uv - 0.5) * vec2(aspect, 1.0);
    float rr = length(rc);
    float ring = step(0.475, abs(fract(rr * 7.0 - uTime * 0.32) - 0.5)) * exp(-rr * 2.4);
    float sweep = pow(max(cos(atan(rc.y, rc.x) - uTime * 0.9), 0.0), 220.0) * exp(-rr * 2.2) * step(0.06, rr);
    col = mix(col, vec3(0.13, 0.045, 0.16), step(b, ring * uRadar * 0.9));
    col = mix(col, vec3(0.169, 0.027, 0.067), step(b, sweep * uRadar * 0.6));
  }

  // blockchain floor grid for the mining scene
  if (uGrid > 0.001){
    float gx = step(mod(fc.x + floor(uTime * 6.0), 12.0), 0.99);
    float gy = step(mod(fc.y, 12.0), 0.99);
    col = mix(col, vec3(0.075, 0.025, 0.09), max(gx, gy) * step(b, uGrid * smoothstep(0.8, 0.0, uv.y)));
  }

  // the core: blood glow inside a wider bruise, in hard rings
  vec2 cv = (uv - uCore.xy) * vec2(aspect, 1.0);
  float cr2 = dot(cv, cv);
  float g1 = uCore.w * exp(-cr2 / (uCore.z * uCore.z));
  float g2 = uCore.w * exp(-cr2 / (uCore.z * uCore.z * 3.5));
  col = mix(col, vec3(0.235, 0.051, 0.200), qs(g2 * 0.6, 3.0, b, 2.5) * 0.9);
  col = mix(col, vec3(0.561, 0.075, 0.180), qs(g1 * 0.85, 3.0, b, 2.5));

  vec4 f = texture2D(uF, vec2(uv.x, 1.0 - uv.y));
  col = mix(col, f.rgb, f.a);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------- post
const N = HEXES.length;
// ------------------------------------------------------------------- mesh
// Same camera as the sea: world -> camera space -> the same projection.
export const MESH_VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec4 aCol;
uniform vec3 uCam;
uniform float uPitch;
uniform float uFov;
uniform float uAspect;
varying vec3 vN;
varying vec4 vC;
varying vec3 vW;
void main(){
  vec3 d = aPos - uCam;
  float cp = cos(uPitch), sp = sin(uPitch);
  float yc = d.y * cp + d.z * sp;
  float zc = -d.y * sp + d.z * cp;
  float n = 0.5, f = 400.0;
  gl_Position = vec4(d.x * uFov * 2.0 / uAspect, yc * uFov * 2.0, (zc * (f + n) - 2.0 * f * n) / (f - n), zc);
  vN = aNrm; vC = aCol; vW = aPos;
}
`;

// moon behind her, a violet sky above, the sea bleeding red from below.
// Light is cut into hard bands so the geometry reads as pixel art.
export const MESH_FS = `
precision highp float;
uniform vec3 uCam;
uniform vec3 uKey;
uniform vec3 uSky;
uniform float uFlash;
varying vec3 vN;
varying vec4 vC;
varying vec3 vW;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vW);
  if (dot(n, v) < 0.0) n = -n;
  float sky = max(dot(n, uSky), 0.0);
  sky = floor(sky * 3.0 + 0.35) / 3.0;
  float back = max(dot(n, uKey), 0.0);
  float rimv = 1.0 - max(dot(n, v), 0.0);
  float rim = step(0.62, rimv) * 0.55 + step(0.82, rimv) * 0.45;
  float under = max(-n.y, 0.0);
  vec3 base = vC.rgb;
  vec3 col = base * (0.32 + 1.3 * sky)
    + vec3(0.36, 0.10, 0.30) * rim * (0.35 + back)
    + vec3(0.22, 0.03, 0.07) * step(0.45, under) * 0.8
    + base * uFlash * 1.8 + vec3(0.16, 0.06, 0.22) * uFlash * rim;
  col = mix(col, base, vC.a);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const POST = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uGlitch;
uniform float uSplit;
uniform float uFade;
uniform float uRed;
uniform float uDither;
uniform float uShake;
uniform vec3 uPal[${N}];

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void main(){
  vec2 fc = gl_FragCoord.xy;
  float tick = floor(uTime * 24.0);
  // horizontal tearing: random bands slide sideways while glitching
  float bandH = 2.0 + floor(hash(vec2(tick, 1.0)) * 7.0);
  float row = floor(fc.y / bandH);
  float pick = hash(vec2(row, tick));
  float shift = 0.0;
  if (pick > 1.0 - uGlitch * 0.35) shift = (hash(vec2(row, tick + 7.0)) - 0.5) * 70.0 * uGlitch;
  shift += uShake;
  vec2 uv = (fc + vec2(shift, 0.0)) / uRes;
  float s = uSplit + uGlitch * 2.0;
  vec3 c;
  c.r = texture2D(uTex, uv + vec2(s, 0.0) / uRes).r;
  c.g = texture2D(uTex, uv).g;
  c.b = texture2D(uTex, uv - vec2(s, 0.0) / uRes).b;
  // block corruption
  if (uGlitch > 0.4){
    vec2 blk = floor(fc / vec2(16.0, 6.0));
    if (hash(blk + tick) > 1.02 - uGlitch * 0.12) c = c.bgr * 1.6 + vec3(0.05, 0.0, 0.04);
  }
  c = mix(c, vec3(0.55, 0.04, 0.10) * (0.4 + 0.6 * c.r * 3.0), uRed);
  c *= 1.0 - uFade;
  c += (bayer4(fc) - 0.5) * uDither;
  vec3 best = uPal[0];
  float bd = 1e9;
  for (int i = 0; i < ${N}; i++){
    vec3 d = c - uPal[i];
    float e = dot(d * d, vec3(0.9, 1.3, 0.7));
    if (e < bd){ bd = e; best = uPal[i]; }
  }
  gl_FragColor = vec4(best, 1.0);
}
`;
