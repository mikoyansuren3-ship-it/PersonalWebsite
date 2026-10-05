#!/usr/bin/env node
/**
 * generate-placeholders.mjs
 *
 * Deterministic generator for the template's placeholder photography.
 *
 *   node scripts/generate-placeholders.mjs                    # every image
 *   node scripts/generate-placeholders.mjs --only t01,print-02 # a subset, by name
 *   node scripts/generate-placeholders.mjs --sheets <dir>      # also write QA contact sheets
 *
 * Each picture is composed as an SVG scene (gradients, paths, glows, blurred
 * atmosphere, turbulence textures), rasterised by sharp/librsvg at 2x, then
 * finished on raw linear-light pixels: bloom, slight softness, vignette,
 * exposure targeting, a warm split-tone grade and low-frequency film grain.
 * The tone rules (mean luminance, light/dark split, byte caps) are measured on
 * the encoded WebP and enforced with retries; a report is printed at the end.
 * A seeded RNG (mulberry32) makes every output reproducible.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'placeholders');
const argv = process.argv.slice(2);
const arg = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ONLY = arg('--only')?.split(',').map((s) => s.trim());
const SHEETS = arg('--sheets');

/* ------------------------------------------------------------------------ */
/* RNG, maths, colour                                                       */
/* ------------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    gauss: () => {
      let u = 0;
      while (u === 0) u = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
  };
}

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const n2 = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const n3 = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const n5 = (v) => String(Math.round(v * 100000) / 100000);

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const rgbToHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
};
const shade = (a, k) => rgbToHex(hexToRgb(a).map((v) => v * k));
const tint = (a, t) => mix(a, '#FFF5E4', t);

const SRGB2LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  SRGB2LIN[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/* ------------------------------------------------------------------------ */
/* Geometry                                                                 */
/* ------------------------------------------------------------------------ */

const polyD = (p) => 'M' + p.map(([x, y]) => `${n2(x)},${n2(y)}`).join('L') + 'Z';
const lineD = (p) => 'M' + p.map(([x, y]) => `${n2(x)},${n2(y)}`).join('L');

/** Catmull-Rom segments through pts (current point must already be pts[0]). */
function crSeg(p) {
  let d = '';
  const n = p.length;
  const g = (i) => p[clamp(i, 0, n - 1)];
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n2(c1[0])},${n2(c1[1])} ${n2(c2[0])},${n2(c2[1])} ${n2(p2[0])},${n2(p2[1])}`;
  }
  return d;
}
const crD = (p) => `M${n2(p[0][0])},${n2(p[0][1])}` + crSeg(p);

/** Midpoint displacement between a and b (roughness relative to segment length). */
function fractal(a, b, depth, rough, R) {
  let pts = [a, b];
  let amp = rough;
  for (let k = 0; k < depth; k++) {
    const nx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const off = (R.next() * 2 - 1) * amp * len;
      nx.push(p, [(p[0] + q[0]) / 2 - (dy / len) * off, (p[1] + q[1]) / 2 + (dx / len) * off]);
    }
    nx.push(pts[pts.length - 1]);
    pts = nx;
    amp *= 0.58;
  }
  return pts;
}

const area2 = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};
/** Sutherland-Hodgman: clip polygon `sub` by convex polygon `clp`. */
function clipPoly(sub, clp) {
  const cl = area2(clp) < 0 ? [...clp].reverse() : clp;
  let out = sub;
  for (let i = 0; i < cl.length && out.length; i++) {
    const A = cl[i], B = cl[(i + 1) % cl.length];
    const inside = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= 0;
    const inter = (p, q) => {
      const a1 = B[1] - A[1], b1 = A[0] - B[0], c1 = a1 * A[0] + b1 * A[1];
      const a2 = q[1] - p[1], b2 = p[0] - q[0], c2 = a2 * p[0] + b2 * p[1];
      const det = a1 * b2 - a2 * b1 || 1e-9;
      return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
    };
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length];
      const pi = inside(P), qi = inside(Q);
      if (pi) out.push(P);
      if (pi !== qi) out.push(inter(P, Q));
    }
  }
  return out;
}
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const norm3 = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* ------------------------------------------------------------------------ */
/* SVG scene builder                                                        */
/* ------------------------------------------------------------------------ */

function at(a) {
  if (!a) return '';
  let s = '';
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === null || v === false) continue;
    s += ` ${k}="${typeof v === 'number' ? n3(v) : v}"`;
  }
  return s;
}

class Scene {
  constructor(W, H, R) {
    this.W = W;
    this.H = H;
    this.R = R;
    this.u = Math.min(W, H) / 320;
    this.defs = [];
    this.out = [];
    this.k = 0;
    this.blurs = new Map();
  }
  id(p) {
    return `${p}${this.k++}`;
  }
  add(s) {
    this.out.push(s);
  }
  open(a) {
    this.add(`<g${at(a)}>`);
  }
  close() {
    this.add('</g>');
  }
  stops(st) {
    return st
      .map(([o, c, a]) => `<stop offset="${n3(clamp(o))}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${n3(clamp(a))}"`}/>`)
      .join('');
  }
  lin(x1, y1, x2, y2, st) {
    const id = this.id('l');
    this.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}">${this.stops(st)}</linearGradient>`,
    );
    return `url(#${id})`;
  }
  rad(cx, cy, r, st, fx = cx, fy = cy) {
    const id = this.id('r');
    this.defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" fx="${n2(fx)}" fy="${n2(fy)}">${this.stops(st)}</radialGradient>`,
    );
    return `url(#${id})`;
  }
  /** Elliptical radial gradient (rx, ry, rotation in degrees). */
  radE(cx, cy, rx, ry, rot, st) {
    const id = this.id('e');
    this.defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${n2(cx)} ${n2(cy)}) rotate(${n2(rot)}) scale(${n3(rx)} ${n3(ry)})">${this.stops(st)}</radialGradient>`,
    );
    return `url(#${id})`;
  }
  blur(sd) {
    const s = Math.round(sd * 20) / 20;
    if (s <= 0) return undefined;
    const key = String(s);
    if (!this.blurs.has(key)) {
      const id = this.id('b');
      this.defs.push(
        `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${s}"/></filter>`,
      );
      this.blurs.set(key, id);
    }
    return `url(#${this.blurs.get(key)})`;
  }
  clip(d) {
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `url(#${id})`;
  }
  clipMany(ds) {
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}">${ds.map((d) => `<path d="${d}"/>`).join('')}</clipPath>`);
    return `url(#${id})`;
  }
  maskWith(fill) {
    const { W, H } = this;
    const id = this.id('m');
    this.defs.push(
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="${-W}" y="${-H}" width="${3 * W}" height="${3 * H}"><rect x="${-W}" y="${-H}" width="${3 * W}" height="${3 * H}" fill="${fill}"/></mask>`,
    );
    return `url(#${id})`;
  }
  maskLin(x1, y1, x2, y2, st) {
    return this.maskWith(this.lin(x1, y1, x2, y2, st.map(([o, a]) => [o, '#ffffff', a])));
  }
  maskRad(cx, cy, r, st) {
    return this.maskWith(this.rad(cx, cy, r, st.map(([o, a]) => [o, '#ffffff', a])));
  }
  rect(x, y, w, h, fill, a) {
    this.add(`<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fill}"${at(a)}/>`);
  }
  path(d, fill, a) {
    if (d) this.add(`<path d="${d}" fill="${fill}"${at(a)}/>`);
  }
  stroke(d, color, width, a) {
    if (d)
      this.add(
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="${n2(width)}" stroke-linecap="round" stroke-linejoin="round"${at(a)}/>`,
      );
  }
  ellipse(cx, cy, rx, ry, fill, a) {
    this.add(`<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(Math.max(0.01, rx))}" ry="${n2(Math.max(0.01, ry))}" fill="${fill}"${at(a)}/>`);
  }
  circle(cx, cy, r, fill, a) {
    this.add(`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(Math.max(0.01, r))}" fill="${fill}"${at(a)}/>`);
  }
  /** Turbulence noise rendered as colour `color` with alpha = clamp(sign*c*(n-.5)+bias). */
  noiseFilter({ fx, fy, oct = 3, seed, color, contrast = 2.5, bias = 0, sign = 1, box, type = 'fractalNoise' }) {
    const id = this.id('n');
    const [r, g, b] = hexToRgb(color).map((v) => n3(v / 255));
    const k = sign * contrast;
    const off = -sign * contrast * 0.5 + bias;
    const [x, y, w, h] = box;
    this.defs.push(
      `<filter id="${id}" filterUnits="userSpaceOnUse" x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" color-interpolation-filters="sRGB"><feTurbulence type="${type}" baseFrequency="${n5(fx)} ${n5(fy)}" numOctaves="${oct}" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${n3(k)} 0 0 0 ${n3(off)}"/></filter>`,
    );
    return `url(#${id})`;
  }
  /**
   * Two-sided texture overlay: `dark` where the noise is high, `light` where it is low.
   * o: { box, clip, mask, rot, fx, fy, oct, dark, light, amount, contrast, bias, seed }
   */
  texture(o) {
    const { W, H } = this;
    const box = o.box ?? [0, 0, W, H];
    const seed = o.seed ?? this.R.int(1, 99999);
    let rb = box;
    let tr;
    let clip = o.clip;
    if (o.rot) {
      const cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2, d = Math.hypot(box[2], box[3]);
      rb = [cx - d / 2, cy - d / 2, d, d];
      tr = `rotate(${n2(o.rot)} ${n2(cx)} ${n2(cy)})`;
      if (!clip) clip = this.clip(polyD([[box[0], box[1]], [box[0] + box[2], box[1]], [box[0] + box[2], box[1] + box[3]], [box[0], box[1] + box[3]]]));
    }
    this.open({ 'clip-path': clip, mask: o.mask, opacity: o.amount ?? 1 });
    this.open({ transform: tr });
    for (const [col, sign] of [
      [o.dark, 1],
      [o.light, -1],
    ]) {
      if (!col) continue;
      const f = this.noiseFilter({ fx: o.fx, fy: o.fy, oct: o.oct ?? 3, seed, color: col, contrast: o.contrast ?? 2.5, bias: o.bias ?? 0, sign, box: rb, type: o.type });
      this.rect(rb[0], rb[1], rb[2], rb[3], '#000', { filter: f });
    }
    this.close();
    this.close();
  }
  /** Filter that breaks a shape up with turbulence (foam, mist, plumes). */
  breakup({ fx, fy, oct = 3, contrast = 3, offset = -1.2, blur = 0, seed }) {
    const { W, H } = this;
    const id = this.id('k');
    this.defs.push(
      `<filter id="${id}" filterUnits="userSpaceOnUse" x="${n2(-0.05 * W)}" y="${n2(-0.05 * H)}" width="${n2(1.1 * W)}" height="${n2(1.1 * H)}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${n5(fx)} ${n5(fy)}" numOctaves="${oct}" seed="${seed ?? this.R.int(1, 99999)}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n3(contrast)} 0 0 0 ${n3(offset)}" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="c"/>${blur ? `<feGaussianBlur in="c" stdDeviation="${n2(blur)}"/>` : ''}</filter>`,
    );
    return `url(#${id})`;
  }
  /** Low sun: wide glow plus a soft-edged disc. */
  sun(x, y, r, o = {}) {
    const gr = (o.glow ?? 0.6) * Math.max(this.W, this.H);
    const gc = o.glowCol ?? '#F6C27E';
    const ga = o.glowA ?? 0.85;
    this.circle(x, y, gr, this.rad(x, y, gr, [[0, gc, ga], [0.07, gc, ga * 0.6], [0.22, gc, ga * 0.26], [0.55, gc, ga * 0.07], [1, gc, 0]]));
    if (r > 0) {
      this.circle(x, y, r * 2.2, this.rad(x, y, r * 2.2, [[0, '#FFF6E0', 0.9], [0.45, '#FFE9C2', 0.45], [1, '#FFE0B0', 0]]));
      this.circle(x, y, r, this.rad(x, y, r, [[0, '#FFFDF6'], [0.6, o.core ?? '#FFF4DC'], [0.92, o.disc ?? '#FCE2B0'], [1, o.disc ?? '#F8D49C', 0.85]]), {
        filter: this.blur(0.5 * this.u),
      });
    }
  }
  svg(scale) {
    const { W, H } = this;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}"><defs>${this.defs.join('')}</defs>${this.out.join('')}</svg>`;
  }
}

/* ------------------------------------------------------------------------ */
/* Shared drawing helpers                                                   */
/* ------------------------------------------------------------------------ */

function leafD(x, y, ang, len, wid, bend = 0) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const tx = x + c * len, ty = y + s * len;
  const mx = x + c * len * 0.45 - s * bend * len, my = y + s * len * 0.45 + c * bend * len;
  const nx = -s * wid, ny = c * wid;
  return `M${n2(x)},${n2(y)}Q${n2(mx + nx)},${n2(my + ny)} ${n2(tx)},${n2(ty)}Q${n2(mx - nx)},${n2(my - ny)} ${n2(x)},${n2(y)}Z`;
}
function taperD(pts, w0, w1) {
  const n = pts.length;
  const A = [], B = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = (w0 + (w1 - w0) * (i / Math.max(1, n - 1))) / 2;
    A.push([p[0] - dy * w, p[1] + dx * w]);
    B.push([p[0] + dy * w, p[1] - dx * w]);
  }
  return polyD([...A, ...B.reverse()]);
}
function archD(x, w, ys, yb) {
  const r = w / 2;
  return `M${n2(x)},${n2(yb)}L${n2(x)},${n2(ys)}A${n2(r)},${n2(r)} 0 0 1 ${n2(x + w)},${n2(ys)}L${n2(x + w)},${n2(yb)}Z`;
}
const rectD = (x, y, w, h) => polyD([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);

/** Plaster: base fill plus a mottled two-sided texture. */
function plaster(S, d, fill, lightCol, darkCol, amount = 0.3, box) {
  S.path(d, fill);
  const u = S.u;
  S.texture({ clip: S.clip(d), box, fx: 0.011 / u, fy: 0.013 / u, oct: 4, dark: darkCol, light: lightCol, amount, contrast: 2.4 });
  S.texture({ clip: S.clip(d), box, fx: 0.09, fy: 0.09, oct: 2, dark: darkCol, light: lightCol, amount: amount * 0.45, contrast: 2.2 });
}

const PROFILES = {
  jug: [[0, 0.33], [0.05, 0.4], [0.3, 0.5], [0.55, 0.45], [0.74, 0.29], [0.86, 0.25], [0.95, 0.28], [1, 0.31]],
  amphora: [[0, 0.2], [0.07, 0.3], [0.36, 0.5], [0.6, 0.42], [0.78, 0.22], [0.9, 0.19], [1, 0.26]],
  bottle: [[0, 0.4], [0.5, 0.42], [0.6, 0.38], [0.69, 0.2], [0.77, 0.14], [0.97, 0.13], [1, 0.15]],
  bowl: [[0, 0.32], [0.18, 0.6], [0.55, 0.86], [1, 1]],
  cup: [[0, 0.36], [0.12, 0.43], [1, 0.5]],
  cyl: [[0, 0.5], [1, 0.5]],
  vase: [[0, 0.3], [0.15, 0.42], [0.45, 0.5], [0.75, 0.32], [0.9, 0.24], [1, 0.3]],
  bud: [[0, 0.32], [0.3, 0.5], [0.6, 0.4], [0.8, 0.16], [1, 0.18]],
};

/**
 * A turned vessel: silhouette from a profile, cylindrical shading from the light side L (-1 left, +1 right).
 * w: radius scale in px (profile radius 0.5 => w/2).
 */
function vessel(S, cx, by, h, w, prof, col, L, o = {}) {
  const u = S.u;
  const e = o.ell ?? 0.13;
  const pts = prof.map(([t, r]) => [r * w, by - t * h]);
  const left = pts.map(([r, y]) => [cx - r, y]);
  const right = pts.map(([r, y]) => [cx + r, y]).reverse();
  const rTop = pts[pts.length - 1][0], rBot = pts[0][0], yTop = by - h;
  const d =
    `M${n2(left[0][0])},${n2(left[0][1])}` +
    crSeg(left) +
    `A${n2(rTop)},${n2(rTop * e)} 0 0 1 ${n2(cx + rTop)},${n2(yTop)}` +
    crSeg(right) +
    `A${n2(rBot)},${n2(rBot * e)} 0 0 1 ${n2(cx - rBot)},${n2(by)}Z`;
  const maxR = Math.max(...pts.map((p) => p[0]));
  const hi = mix(col, '#FFF6E6', o.hiMix ?? 0.5), dk = shade(col, 0.42), dk2 = shade(col, 0.26), bounce = shade(col, 0.55);
  let st = [[0, mix(col, hi, 0.4)], [0.13, hi], [0.3, mix(hi, col, 0.45)], [0.52, col], [0.7, dk], [0.86, dk2], [1, bounce]];
  if (L > 0) st = st.map(([of, c]) => [1 - of, c]).reverse();
  S.path(d, S.lin(cx - maxR, 0, cx + maxR, 0, st));
  const clip = S.clip(d);
  // occlusion toward the base, a little sky-light on the shoulder
  S.path(d, S.lin(0, yTop, 0, by, [[0, '#FFF2DC', 0.12], [0.35, '#000', 0], [0.8, '#000', 0.12], [1, '#000', 0.5]]));
  // belly roundness
  let bi = 0;
  pts.forEach((p, i) => {
    if (p[0] > pts[bi][0]) bi = i;
  });
  const [rb, ybel] = pts[bi];
  S.ellipse(cx + L * rb * 0.35, ybel - h * 0.04, rb * 0.55, h * 0.3, S.rad(cx + L * rb * 0.35, ybel - h * 0.04, Math.max(rb * 0.55, h * 0.3), [[0, hi, 0.45], [1, hi, 0]]), {
    'clip-path': clip,
  });
  if (o.texture !== false) {
    S.texture({ clip, box: [cx - maxR, yTop - 2, maxR * 2, h + 4], fx: 0.06, fy: 0.06, oct: 2, dark: dk2, light: hi, amount: o.matte ?? 0.18, contrast: 2.3 });
  }
  if (o.glaze) {
    S.ellipse(cx + L * rb * 0.48, ybel - h * 0.06, Math.max(0.8 * u, rb * 0.09), h * 0.17, '#FFFAF0', { opacity: 0.55 * o.glaze, filter: S.blur(1.1 * u), 'clip-path': clip });
    S.ellipse(cx + L * rb * 0.5, ybel - h * 0.12, Math.max(0.5 * u, rb * 0.035), h * 0.06, '#FFFFFF', { opacity: 0.8 * o.glaze, filter: S.blur(0.4 * u), 'clip-path': clip });
  }
  if (o.handle) {
    const sx = cx - L * rTop * 1.05, ex = cx - L * rb * 0.98;
    const hd = `M${n2(sx)},${n2(yTop + h * 0.1)}C${n2(sx - L * w * 0.42)},${n2(yTop + h * 0.08)} ${n2(ex - L * w * 0.42)},${n2(ybel)} ${n2(ex)},${n2(ybel + h * 0.08)}`;
    S.stroke(hd, dk, Math.max(1.2 * u, w * 0.085));
    S.stroke(hd, mix(col, dk, 0.4), Math.max(0.5 * u, w * 0.035), { opacity: 0.7 });
  }
  if (o.mouth !== false) {
    S.ellipse(cx, yTop, rTop * 0.86, rTop * e * 0.82, S.lin(cx - rTop, 0, cx + rTop, 0, L < 0 ? [[0, shade(col, 0.12)], [1, shade(col, 0.32)]] : [[0, shade(col, 0.32)], [1, shade(col, 0.12)]]));
    S.add(
      `<ellipse cx="${n2(cx)}" cy="${n2(yTop)}" rx="${n2(rTop)}" ry="${n2(rTop * e)}" fill="none" stroke="${hi}" stroke-width="${n2(Math.max(0.6 * u, w * 0.02))}" opacity="0.6"/>`,
    );
  }
  return { d, clip, top: yTop, maxR };
}

function fruit(S, x, y, r, col, L, o = {}) {
  const u = S.u;
  const hi = mix(col, '#FFF1D8', o.hiMix ?? 0.45), dk = shade(col, 0.32);
  const g = S.rad(x + L * r * 0.12, y + r * 0.08, r * 1.2, [[0, hi], [0.3, col], [0.72, dk], [1, shade(col, 0.2)]], x + L * r * 0.42, y - r * 0.42);
  const rot = o.rot ?? 0;
  if (o.kind === 'lemon') {
    S.ellipse(x, y, r * 1.28, r, g, { transform: `rotate(${n2(rot)} ${n2(x)} ${n2(y)})` });
    S.ellipse(x + r * 1.22 * Math.cos((rot * Math.PI) / 180), y + r * 1.22 * Math.sin((rot * Math.PI) / 180), r * 0.16, r * 0.12, col, { opacity: 0.9 });
  } else S.circle(x, y, r, g);
  S.texture({ clip: S.clip(o.kind === 'lemon' ? `M${n2(x - r * 1.3)},${n2(y)}a${n2(r * 1.3)},${n2(r)} 0 1 0 ${n2(r * 2.6)},0a${n2(r * 1.3)},${n2(r)} 0 1 0 ${n2(-r * 2.6)},0Z` : `M${n2(x - r)},${n2(y)}a${n2(r)},${n2(r)} 0 1 0 ${n2(2 * r)},0a${n2(r)},${n2(r)} 0 1 0 ${n2(-2 * r)},0Z`), box: [x - r * 1.4, y - r * 1.2, r * 2.8, r * 2.4], fx: 0.25, fy: 0.25, oct: 2, dark: dk, light: hi, amount: 0.22 });
  S.ellipse(x + L * r * 0.4, y - r * 0.42, r * 0.17, r * 0.11, '#FFFBF2', { opacity: o.gloss ?? 0.45, filter: S.blur(0.6 * u) });
  if (o.kind === 'pom') {
    const cy = y - r * 0.95;
    S.path(polyD([[x - r * 0.18, cy + r * 0.1], [x - r * 0.22, cy - r * 0.16], [x - r * 0.08, cy - r * 0.04], [x, cy - r * 0.2], [x + r * 0.08, cy - r * 0.04], [x + r * 0.22, cy - r * 0.16], [x + r * 0.18, cy + r * 0.1]]), dk);
  }
  if (o.stem) S.stroke(`M${n2(x)},${n2(y - r * 0.9)}q${n2(r * 0.1)},${n2(-r * 0.3)} ${n2(r * 0.25)},${n2(-r * 0.4)}`, '#2A1C10', Math.max(0.7 * u, r * 0.08));
}

/** Soft cast shadow + contact shadow on a table (light from side L). */
function tableShadow(S, x, by, w, h, L, k = 1) {
  const u = S.u;
  const len = h * 0.95 + w * 0.25;
  const cx = x - L * (len * 0.5 + w * 0.1);
  S.ellipse(cx, by - h * 0.035, len * 0.55 + w * 0.3, w * 0.13 + h * 0.035, '#0C0704', {
    opacity: 0.55 * k,
    filter: S.blur(2.4 * u),
    transform: `rotate(${n2(-L * 3)} ${n2(x)} ${n2(by)})`,
  });
  S.ellipse(x, by, w * 0.52, Math.max(0.8 * u, w * 0.07), '#080503', { opacity: 0.8 * k, filter: S.blur(0.9 * u) });
}

/* ------------------------------------------------------------------------ */
/* Family 1: desert dunes                                                   */
/* ------------------------------------------------------------------------ */

const DUNES = {
  0: { hz: 0.4, sun: [0.3, 0.3, 0.05], sky: ['#5A3828', '#B86F46', '#F4CC96'], haze: '#E8AE7A', layers: 6, light: -1, lit: ['#B26C3C', '#6E3C22'], shade: ['#3A2216', '#1A0F09'], rim: '#FFDDA6', rimA: 0.95, hazeAmt: 0.85, near: 0.62, nearAmp: 0.3 },
  1: { hz: 0.15, sun: null, sky: ['#B08664', '#DDB993', '#F5E3C6'], haze: '#EBCDA6', layers: 4, light: -1, lit: ['#F2B876', '#C27840'], shade: ['#5A2E1E', '#24120A'], rim: '#FFE8C2', rimA: 0.45, hazeAmt: 0.7, near: 0.5, nearAmp: 0.6, ripples: 0.5 },
  2: { hz: 0.56, sun: [0.68, 0.545, 0.065], sky: ['#2A1D19', '#8C4A30', '#F3AE6C'], haze: '#D98A58', layers: 5, light: 1, lit: ['#86492C', '#452416'], shade: ['#2A1810', '#100906'], rim: '#FFCB92', rimA: 0.8, hazeAmt: 0.92, near: 0.55, nearAmp: 0.22 },
  3: { hz: 0.3, sun: [0.86, 0.21, 0.045], sky: ['#8A6550', '#D4A57D', '#F7DEB8'], haze: '#ECC49A', layers: 4, light: 1, lit: ['#E6A464', '#B06A38'], shade: ['#5A3222', '#26150D'], rim: '#FFE2B5', rimA: 0.6, hazeAmt: 0.75, near: 0.55, nearAmp: 0.45, ripples: 0.6 },
  print: { hz: 0.42, sun: [0.24, 0.31, 0.04], sky: ['#563526', '#B46A42', '#F5CF9A'], haze: '#E9B07C', layers: 7, light: -1, lit: ['#BE7642', '#703E22'], shade: ['#3A2216', '#170D08'], rim: '#FFDEA8', rimA: 0.95, hazeAmt: 0.88, near: 0.6, nearAmp: 0.32, ripples: 0.45 },
  soft: { hz: 0.44, sun: [0.72, 0.3, 0], sky: ['#C9AE90', '#E3CDAE', '#F3E5CE'], haze: '#EEDCC2', layers: 5, light: 1, lit: ['#E6C094', '#C99B6C'], shade: ['#A27452', '#7A5238'], rim: '#FFF0D6', rimA: 0.4, hazeAmt: 0.85, near: 0.5, nearAmp: 0.3, ripples: 0.3, sunGlow: 0.5 },
};

function sceneDunes(S, v) {
  const { W, H, R, u } = S;
  const V = DUNES[v];
  const hz = V.hz * H;
  S.rect(0, 0, W, H, S.lin(0, 0, 0, hz, [[0, V.sky[0]], [0.6, V.sky[1]], [1, V.sky[2]]]));
  S.texture({ box: [0, 0, W, hz], fx: 0.0025 / u, fy: 0.03 / u, oct: 3, light: V.sky[2], dark: V.sky[0], amount: 0.2, contrast: 2.2, mask: S.maskLin(0, 0, 0, hz, [[0, 1], [1, 0.15]]) });
  const sx = V.sun ? V.sun[0] * W : V.light < 0 ? -2 * W : 3 * W;
  if (V.sun) S.sun(sx, V.sun[1] * H, V.sun[2] * W, { glowCol: V.rim, glowA: V.sunGlow ?? 0.9 });
  const N = V.layers;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const hzAmt = Math.pow(1 - t, 1.5) * V.hazeAmt;
    const yMean = hz + (H - hz) * (0.02 + V.near * Math.pow(t, 1.4));
    const amp = (H - hz) * (0.035 + (V.nearAmp - 0.035) * Math.pow(t, 1.3));
    const np = i === N - 1 ? R.int(1, 2) : R.int(1, 3);
    const peaks = [];
    for (let k = 0; k < np; k++)
      peaks.push({ x: W * ((k + R.range(0.25, 0.75)) / np) + R.range(-0.08, 0.08) * W, h: R.range(0.62, 1), wa: W * R.range(0.2, 0.5), wb: W * R.range(0.12, 0.3), slipRight: R.chance(0.5) });
    const ph = R.range(0, 6.28);
    const prof = (x) => {
      let acc = Math.exp(12 * (0.1 + 0.06 * Math.sin((x / W) * 7 + ph)));
      for (const p of peaks) {
        const wl = p.slipRight ? p.wa : p.wb, wr = p.slipRight ? p.wb : p.wa;
        let f = 0;
        if (x < p.x) {
          const d = (p.x - x) / wl;
          if (d < 1) f = p.slipRight ? p.h * (1 - 0.4 * d - 0.6 * d * d) : p.h * Math.pow(1 - d, 1.15);
        } else {
          const d = (x - p.x) / wr;
          if (d < 1) f = p.slipRight ? p.h * Math.pow(1 - d, 1.15) : p.h * (1 - 0.4 * d - 0.6 * d * d);
        }
        acc += Math.exp(12 * f);
      }
      return Math.log(acc) / 12;
    };
    const crestY = (x) => yMean - amp * prof(x);
    const xs = [];
    for (let k = 0; k <= 140; k++) xs.push(-0.05 * W + (1.1 * W * k) / 140);
    for (const p of peaks) xs.push(p.x);
    xs.sort((a, b) => a - b);
    const crest = xs.map((x) => [x, crestY(x)]);
    const bodyD = lineD(crest) + `L${n2(1.06 * W)},${n2(H + 10)}L${n2(-0.06 * W)},${n2(H + 10)}Z`;
    const mixH = (c) => mix(c, V.haze, hzAmt);
    const top = yMean - amp;
    const blur = i < N - 1 ? S.blur((1 - t) ** 2 * 1.3 * u + 0.15 * u) : undefined;
    S.open({ filter: blur });
    S.path(bodyD, S.lin(0, top, 0, Math.min(H, yMean + (H - hz) * 0.35), [[0, mixH(V.lit[0])], [1, mixH(V.lit[1])]]));
    const clipBody = S.clip(bodyD);
    S.open({ 'clip-path': clipBody });
    for (const p of peaks) {
      const sdir = p.x > sx ? 1 : -1;
      const sideW = sdir > 0 ? (p.slipRight ? p.wb : p.wa) : p.slipRight ? p.wa : p.wb;
      const xe = p.x + sdir * sideW * 0.95;
      const yp = crestY(p.x);
      const bend = sdir * W * R.range(-0.04, 0.22);
      const cp = [];
      for (let s = 0; s <= 30; s++) {
        const x = p.x + ((xe - p.x) * s) / 30;
        cp.push([x, crestY(x)]);
      }
      const d =
        lineD(cp) +
        `L${n2(xe + sdir * W * 0.12)},${n2(H + 10)}L${n2(p.x + bend)},${n2(H + 10)}Q${n2(p.x + bend * 0.15)},${n2(yp + (H - yp) * 0.35)} ${n2(p.x)},${n2(yp)}Z`;
      const fade = S.maskLin(p.x, 0, xe, 0, [[0, 1], [0.55, 0.94], [1, 0]]);
      S.path(d, S.lin(0, yp, 0, H, [[0, mixH(V.shade[0])], [1, mixH(V.shade[1])]]), { mask: fade });
    }
    if (V.ripples && t > 0.4) {
      S.texture({ box: [0, top, W, H - top], rot: R.range(-14, 14), fx: 0.012, fy: 0.17, oct: 2, dark: mixH(V.shade[1]), light: V.rim, amount: V.ripples * t * 0.7, contrast: 3 });
    }
    S.texture({ box: [0, top, W, H - top], fx: 0.03 / u, fy: 0.05 / u, oct: 3, dark: mixH(V.shade[1]), light: mixH(V.lit[0]), amount: 0.18 * t, contrast: 2 });
    if (V.rimA > 0) {
      const rimMask = V.sun ? S.maskRad(sx, hz, W * 0.95, [[0, 1], [1, 0.2]]) : S.maskLin(V.light < 0 ? 0 : W, 0, V.light < 0 ? W : 0, 0, [[0, 1], [1, 0.3]]);
      S.stroke(lineD(crest), V.rim, (0.6 + 1.6 * t) * u, { opacity: V.rimA * (0.35 + 0.65 * t), filter: S.blur(0.35 * u), mask: rimMask });
    }
    S.close();
    S.close();
    if (i === Math.min(1, N - 2)) {
      S.rect(0, hz - H * 0.07, W, H * 0.2, S.lin(0, hz - H * 0.07, 0, hz + H * 0.13, [[0, V.haze, 0], [0.4, V.haze, 0.55], [1, V.haze, 0]]), { filter: S.blur(3 * u) });
    }
  }
  if (V.sun) S.circle(sx, V.sun[1] * H, W * 0.75, S.rad(sx, V.sun[1] * H, W * 0.75, [[0, V.rim, 0.32], [0.3, V.rim, 0.1], [1, V.rim, 0]]));
}

/* ------------------------------------------------------------------------ */
/* Family 2: coast                                                          */
/* ------------------------------------------------------------------------ */

const COAST = {
  0: { hz: 0.47, sun: [0.27, 0.23, 0.04], sky: ['#664636', '#C0916A', '#F3D9B2'], sea: ['#CBAA86', '#6A5040', '#2A1E17'], cliff: 'right', rock: ['#5A3B2A', '#1F140E'], rim: '#FFD8A6', far: '#9A7860', beach: true, glitter: 1 },
  1: { hz: 0.2, sun: null, sky: ['#86857E', '#B5AF9F', '#DDD5C2'], sea: ['#A2A69E', '#56615E', '#252E2D'], cliff: 'fore', rock: ['#4A3A2C', '#17110D'], rim: '#EDE1C8', far: '#8C8F88', waves: true, cool: true },
  2: { hz: 0.58, sun: [0.62, 0.545, 0.05], sky: ['#2A1C18', '#8C4E35', '#F4B577'], sea: ['#CB8C5A', '#482A1D', '#140D0A'], cliff: 'left', rock: ['#2C1C14', '#0D0806'], rim: '#FFC48C', far: '#6C4533', glitter: 1.3 },
  3: { hz: 0.53, sun: [0.42, 0.2, 0], sky: ['#625E57', '#A9A190', '#EFE6D3'], sea: ['#B5B1A0', '#5D6058', '#252825'], cliff: 'stacks', rock: ['#4C4842', '#1B1A17'], rim: '#F4EAD6', far: '#8E8B82', mist: 0.6, beach: true, cool: true, glitter: 0.5 },
};

function foamStroke(S, d, width, op = 0.85, col = '#F6EEDF') {
  const u = S.u;
  S.stroke(d, col, width, { opacity: op, filter: S.breakup({ fx: 0.035 / u, fy: 0.2 / u, contrast: 3, offset: -1.1, blur: 0.7 * u }) });
}

function sceneCoast(S, v) {
  const { W, H, R, u } = S;
  const V = COAST[v];
  const hz = V.hz * H;
  S.rect(0, 0, W, hz + 1, S.lin(0, 0, 0, hz, [[0, V.sky[0]], [0.62, V.sky[1]], [1, V.sky[2]]]));
  S.texture({ box: [0, 0, W, hz], fx: 0.003 / u, fy: 0.022 / u, oct: 4, light: V.sky[2], dark: V.sky[0], amount: V.cool ? 0.42 : 0.22, contrast: 2.4 });
  const sx = V.sun ? V.sun[0] * W : W * 0.5;
  if (V.sun) S.sun(sx, V.sun[1] * H, V.sun[2] * W, { glowCol: V.rim, glowA: V.cool ? 0.75 : 0.85 });
  // distant headlands on the horizon
  const nf = R.int(1, 2);
  for (let k = 0; k < nf; k++) {
    const x0 = W * R.range(-0.25, 0.45), x1 = x0 + W * R.range(0.3, 0.6), hh = H * R.range(0.015, 0.045);
    const pts = [];
    for (let s = 0; s <= 30; s++) {
      const q = s / 30;
      pts.push([lerp(x0, x1, q), hz - hh * Math.pow(Math.sin(Math.PI * q), 0.6) * (1 + 0.15 * Math.sin(q * 23 + k))]);
    }
    S.path(polyD([...pts, [x1, hz + 1], [x0, hz + 1]]), mix(V.far, V.sky[2], 0.3 + k * 0.25), { filter: S.blur(0.6 * u) });
  }
  // sea
  S.rect(0, hz, W, H - hz, S.lin(0, hz, 0, H, [[0, V.sea[0]], [0.16, mix(V.sea[0], V.sea[1], 0.7)], [0.5, V.sea[1]], [1, V.sea[2]]]));
  S.texture({ box: [0, hz, W, (H - hz) * 0.45], fx: 0.01, fy: 0.35, oct: 2, dark: V.sea[2], light: V.sky[2], amount: 0.35, contrast: 2.6, mask: S.maskLin(0, hz, 0, hz + (H - hz) * 0.45, [[0, 1], [1, 0]]) });
  S.texture({ box: [0, hz, W, H - hz], fx: 0.006 / u, fy: 0.07 / u, oct: 3, dark: V.sea[2], light: V.sky[2], amount: 0.45, contrast: 2.4, mask: S.maskLin(0, hz, 0, H, [[0, 0], [0.35, 0.6], [1, 1]]) });
  if (V.sun && V.glitter) {
    const g = V.glitter;
    S.rect(0, hz, W, H - hz, S.radE(sx, hz, W * 0.1, (H - hz) * 1.1, 0, [[0, V.rim, 0.75 * Math.min(1, g)], [0.4, V.rim, 0.28], [1, V.rim, 0]]));
    S.open({ filter: S.blur(0.35 * u) });
    const n = Math.round(160 * g * Math.sqrt((W * H) / (320 * 320)));
    for (let k = 0; k < n; k++) {
      const q = Math.pow(R.next(), 1.7);
      const y = hz + (H - hz) * q;
      const spread = W * (0.015 + 0.15 * q);
      const x = sx + R.gauss() * spread * 0.5;
      const len = (1.5 + 9 * q) * u * R.range(0.5, 1.4);
      const th = (0.5 + 1.3 * q) * u;
      S.rect(x - len / 2, y, len, th, '#FFF3DC', { opacity: R.range(0.35, 1) * Math.exp(-Math.abs(x - sx) / (spread * 1.2)) });
    }
    S.close();
  }
  S.rect(0, hz - 0.6 * u, W, 1.6 * u, S.lin(0, 0, W, 0, [[0, V.rim, 0.2], [clamp(sx / W, 0.05, 0.95), V.rim, 0.95], [1, V.rim, 0.2]]), { filter: S.blur(0.5 * u) });
  if (!V.sun) S.rect(0, hz, W, (H - hz) * 0.25, S.lin(0, hz, 0, hz + (H - hz) * 0.25, [[0, V.sky[2], 0.55], [1, V.sky[2], 0]]));

  if (V.cliff === 'right' || V.cliff === 'left') {
    const m = V.cliff === 'left' ? -1 : 1;
    const X = (p) => [m > 0 ? p[0] : W - p[0], p[1]];
    const topY = hz - H * R.range(0.2, 0.3);
    const endX = W * R.range(0.52, 0.64);
    const ridge = fractal([W * 1.05, topY], [endX + W * 0.07, hz - H * 0.06], 6, 0.09, R);
    ridge.push([endX, hz - H * 0.012]);
    const foot = [[endX - W * 0.004, hz + H * 0.004], [endX + W * 0.16, hz + H * 0.03], [W * 1.05, hz + H * R.range(0.12, 0.2)]];
    const d = polyD([...ridge, ...foot].map(X));
    const xa = X([endX, 0])[0], xb = X([W, 0])[0];
    S.path(d, S.lin(xa, 0, xb, 0, [[0, V.rock[0]], [1, V.rock[1]]]));
    const clip = S.clip(d);
    S.texture({ clip, box: [0, topY - 10, W, H - topY], rot: -m * 28, fx: 0.02 / u, fy: 0.12 / u, dark: V.rock[1], light: V.rim, amount: 0.32, contrast: 2.8 });
    S.texture({ clip, box: [0, topY - 10, W, H - topY], fx: 0.05 / u, fy: 0.05 / u, dark: V.rock[1], light: V.rock[0], amount: 0.35, contrast: 2.4 });
    S.path(d, S.lin(0, topY, 0, hz + H * 0.2, [[0, '#000', 0], [1, '#000', 0.4]]));
    S.stroke(lineD(ridge.map(X)), V.rim, 1.5 * u, { 'clip-path': clip, opacity: 0.55, filter: S.blur(0.6 * u) });
    foamStroke(S, lineD(foot.map(X)), 4 * u);
  } else if (V.cliff === 'fore') {
    const edge = fractal([-0.05 * W, H * R.range(0.42, 0.52)], [W * R.range(0.56, 0.7), H * 1.05], 6, 0.11, R);
    const d = polyD([...edge, [-0.05 * W, H * 1.05]]);
    S.path(d, S.lin(0, H * 0.4, W * 0.4, H, [[0, V.rock[0]], [1, V.rock[1]]]));
    const clip = S.clip(d);
    S.texture({ clip, box: [0, H * 0.35, W * 0.75, H * 0.7], fx: 0.06 / u, fy: 0.06 / u, dark: '#15140E', light: '#6E6B4A', amount: 0.55, contrast: 2.6 });
    S.stroke(lineD(edge), V.rim, 1.3 * u, { 'clip-path': clip, opacity: 0.45, filter: S.blur(0.5 * u) });
    for (let k = 0; k < 7; k++) {
      const q = (k + R.range(0.2, 0.8)) / 7;
      const y = hz + (H - hz) * (0.08 + 0.9 * Math.pow(q, 1.5));
      const pts = [];
      for (let s = 0; s <= 12; s++) {
        const x = W * (0.2 + 0.9 * (s / 12));
        pts.push([x, y + H * 0.012 * Math.sin(s * 0.9 + k * 2.1) - (x / W) * H * 0.02]);
      }
      foamStroke(S, crD(pts), (0.6 + 3 * q) * u, 0.55);
    }
  } else if (V.cliff === 'stacks') {
    for (let k = 0; k < 2; k++) {
      const cx = W * (k ? R.range(0.66, 0.78) : R.range(0.24, 0.38));
      const w = W * (k ? R.range(0.06, 0.09) : R.range(0.1, 0.15));
      const h = H * (k ? R.range(0.1, 0.16) : R.range(0.22, 0.3));
      const pts = [
        ...fractal([cx - w * 0.62, hz + 2], [cx - w * 0.36, hz - h], 5, 0.13, R),
        ...fractal([cx - w * 0.36, hz - h], [cx + w * 0.3, hz - h * 0.9], 4, 0.18, R).slice(1),
        ...fractal([cx + w * 0.3, hz - h * 0.9], [cx + w * 0.66, hz + 2], 5, 0.13, R).slice(1),
      ];
      const d = polyD(pts);
      const col = mix(V.rock[0], V.sky[2], k ? 0.35 : 0.15);
      S.path(d, S.lin(cx - w, 0, cx + w, 0, [[0, mix(col, V.rim, 0.15)], [0.5, col], [1, shade(col, 0.55)]]), { filter: S.blur((k ? 0.8 : 0.4) * u) });
      S.texture({ clip: S.clip(d), box: [cx - w, hz - h - 4, w * 2, h + 8], fx: 0.03 / u, fy: 0.09 / u, dark: V.rock[1], light: V.rim, amount: 0.3 });
      foamStroke(S, `M${n2(cx - w * 0.8)},${n2(hz + 1.5 * u)}L${n2(cx + w * 0.8)},${n2(hz + 1.5 * u)}`, 3 * u, 0.7);
    }
  }
  if (V.mist) {
    S.rect(0, hz - H * 0.2, W, H * 0.32, S.lin(0, hz - H * 0.2, 0, hz + H * 0.12, [[0, V.sky[2], 0], [0.62, V.sky[2], V.mist], [1, V.sky[2], 0]]), { filter: S.blur(4 * u) });
  }
  if (V.beach) {
    const by = H * R.range(0.8, 0.86);
    const ph = R.range(0, 6);
    const edge = [];
    for (let s = 0; s <= 40; s++) {
      const x = -0.05 * W + (1.1 * W * s) / 40;
      edge.push([x, by + H * 0.02 * Math.sin((x / W) * 3 + ph) + H * 0.012 * Math.sin((x / W) * 7.3 + ph * 2)]);
    }
    const d = lineD(edge) + `L${n2(1.05 * W)},${n2(H + 5)}L${n2(-0.05 * W)},${n2(H + 5)}Z`;
    S.path(d, S.lin(0, by - H * 0.02, 0, H, [[0, mix(V.sky[2], V.sea[0], 0.5)], [0.3, mix(V.sea[1], '#8A6A50', 0.45)], [1, mix(V.sea[2], '#2A1E16', 0.5)]]));
    const clip = S.clip(d);
    if (V.sun) S.rect(0, by - H * 0.05, W, H, S.radE(sx, by, W * 0.08, H * 0.25, 0, [[0, V.rim, 0.55], [1, V.rim, 0]]), { 'clip-path': clip });
    S.texture({ clip, box: [0, by - H * 0.05, W, H - by + H * 0.05], fx: 0.01 / u, fy: 0.08 / u, dark: V.sea[2], light: V.sky[2], amount: 0.3 });
    foamStroke(S, lineD(edge), 3.2 * u, 0.9);
  }
}

/* ------------------------------------------------------------------------ */
/* Family 3: architecture                                                   */
/* ------------------------------------------------------------------------ */

const ARCH = {
  0: { kind: 'arcade', wall: ['#EBCB9C', '#C99A6A'], shadow: '#8C6448', inner: ['#3E2A1C', '#130C08'], reveal: '#F2D7AE', light: -1, n: 3, step: ['#F3DDB6', '#A57D5A'] },
  1: { kind: 'portal', wall: ['#DDB78C', '#B88760'], shadow: '#7A5640', inner: ['#2A1C14', '#0D0805'], reveal: '#EDCDA2', light: 1, far: ['#FFF4DE', '#F0CB96'], step: ['#E9CDA4', '#8E6A4E'] },
  2: { kind: 'stair', wall: ['#F0D2A4', '#D3A574'], shadow: '#8A6040', inner: ['#2E1F16', '#0F0906'], reveal: '#F3D8B0', light: -1, sky: ['#9C5E3C', '#DE9E66'] },
  3: { kind: 'colonnade' },
  print: { kind: 'arcade', wall: ['#EDCC9C', '#C49364'], shadow: '#88603F', inner: ['#3A271A', '#110B07'], reveal: '#F4DAB2', light: -1, n: 2, step: ['#F4DFB9', '#A07656'], tall: true },
  detail: { kind: 'niche', wall: ['#EFE1CB', '#D7C1A0'], shadow: '#B59877', inner: ['#C7AC88', '#A88B68'], reveal: '#F5EAD8', light: -1 },
};

function multiplyShadow(S, d, col, a = {}) {
  S.path(d, col, { style: 'mix-blend-mode:multiply', ...a });
}

/** Arched opening with a lit reveal, a dark interior and an optional bright far opening. */
function archOpening(S, x, w, ys, yb, V, o = {}) {
  const u = S.u;
  const dir = o.dir ?? 1;
  const depth = o.depth ?? w * 0.12;
  const outer = archD(x, w, ys, yb);
  S.path(outer, S.lin(x, 0, x + w, 0, [[0, shade(V.reveal, 0.8)], [1, V.reveal]]));
  const oc = S.clip(outer);
  S.open({ 'clip-path': oc });
  // soffit darker toward the apex
  S.rect(x - 2, ys - w / 2 - 2, w + 4, w / 2 + depth, S.lin(0, ys - w / 2, 0, ys + depth, [[0, '#000', 0.45], [1, '#000', 0]]));
  // hard sun line across the reveal
  multiplyShadow(S, polyD([[x - 5, ys - w], [x + w + 5, ys - w], [x + w + 5, ys + w * 0.25], [x - 5, ys + w * 0.05 + (yb - ys) * 0.15]]), shade(V.shadow, 1.15), { opacity: 0.9 });
  const ix = x - dir * depth;
  const inner = archD(ix, w, ys + depth * 0.5, yb + 2);
  S.path(inner, S.rad(ix + w / 2, yb, (yb - ys) * 1.15 + w * 0.3, [[0, V.inner[0]], [0.55, mix(V.inner[0], V.inner[1], 0.6)], [1, V.inner[1]]]));
  if (o.far) {
    const fw = w * 0.34, fx = ix + w * 0.5 - fw / 2 + dir * w * 0.06;
    const fyb = yb - (yb - ys) * 0.14, fys = fyb - (yb - ys) * 0.5;
    const fd = archD(fx, fw, fys, fyb);
    // corridor floor
    S.path(polyD([[ix, yb + 2], [ix + w, yb + 2], [fx + fw, fyb], [fx, fyb]]), S.lin(0, fyb, 0, yb, [[0, '#6E5038'], [0.4, V.inner[0]], [1, V.inner[1]]]));
    S.path(fd, S.lin(0, fys - fw / 2, 0, fyb, [[0, o.far[0]], [1, o.far[1]]]), { filter: S.blur(0.6 * u) });
    S.ellipse(fx + fw / 2, fyb + (yb - fyb) * 0.3, fw * 0.8, (yb - fyb) * 0.35, S.rad(fx + fw / 2, fyb + (yb - fyb) * 0.3, fw * 0.8, [[0, o.far[1], 0.35], [1, o.far[1], 0]]));
  } else {
    S.ellipse(ix + w / 2, yb, w * 0.42, w * 0.1, S.rad(ix + w / 2, yb, w * 0.42, [[0, '#8A6448', 0.45], [1, '#8A6448', 0]]), { filter: S.blur(1.5 * u) });
  }
  S.close();
  return oc;
}

function steps(S, y0, y1, V, n, shadowX) {
  const { W, u } = S;
  const sh = (y1 - y0) / n;
  for (let k = 0; k < n; k++) {
    const y = y0 + k * sh;
    const tread = sh * 0.38;
    S.rect(-2, y, W + 4, tread + 0.5, S.lin(0, y, 0, y + tread, [[0, V.step[0]], [1, mix(V.step[0], V.step[1], 0.25)]]));
    S.rect(-2, y + tread, W + 4, sh - tread + 0.5, S.lin(0, y + tread, 0, y + sh, [[0, mix(V.step[1], V.step[0], 0.35)], [1, V.step[1]]]));
    S.rect(-2, y + tread - 0.4 * u, W + 4, 1.2 * u, '#000', { opacity: 0.25, filter: S.blur(0.5 * u) });
    const sx = shadowX + k * sh * 0.9;
    multiplyShadow(S, polyD([[-2, y], [sx, y], [sx + sh * 0.9, y + sh], [-2, y + sh]]), V.shadow, { opacity: 0.95 });
  }
  S.texture({ box: [0, y0, W, y1 - y0], fx: 0.05 / u, fy: 0.05 / u, dark: V.step[1], light: V.step[0], amount: 0.3 });
}

function archArcade(S, V) {
  const { W, H, R, u } = S;
  const wall = rectD(-2, -2, W + 4, H + 4);
  plaster(S, wall, S.lin(0, 0, W * 0.3, H, [[0, V.wall[0]], [1, V.wall[1]]]), tint(V.wall[0], 0.4), shade(V.wall[1], 0.75), 0.3);
  const n = V.n;
  const aw = W * (V.tall ? 0.42 : n === 3 ? 0.22 : 0.3);
  const pier = W * (V.tall ? 0.14 : 0.1);
  const total = n * aw + (n - 1) * pier;
  const x0 = (W - total) / 2 + R.range(-0.18, 0.18) * W;
  const yb = H * (V.tall ? 0.8 : 0.76);
  const ys = H * (V.tall ? R.range(0.32, 0.38) : R.range(0.34, 0.42));
  // cornice
  const cy = H * R.range(0.06, 0.12);
  S.rect(-2, cy, W + 4, 3 * u, tint(V.wall[0], 0.5));
  S.rect(-2, cy + 3 * u, W + 4, 4 * u, shade(V.wall[1], 0.6), { filter: S.blur(1.2 * u) });
  // impost band
  S.rect(-2, ys - 2 * u, W + 4, 2.2 * u, tint(V.wall[0], 0.3), { opacity: 0.7 });
  for (let k = 0; k < n; k++) {
    const x = x0 + k * (aw + pier);
    archOpening(S, x, aw, ys, yb, V, { dir: x + aw / 2 < W / 2 ? 1 : -1 });
  }
  // big diagonal shadow from an unseen roof
  const sA = R.range(0.55, 1.1) * W, sB = R.range(0.28, 0.5) * H;
  multiplyShadow(S, polyD([[-5, -5], [sA, -5], [-5, sB]]), V.shadow, { opacity: 0.92 });
  steps(S, yb, H + 2, V, V.tall ? 4 : 3, W * R.range(0.05, 0.35));
}

function archPortal(S, V) {
  const { W, H, R, u } = S;
  const wall = rectD(-2, -2, W + 4, H + 4);
  plaster(S, wall, S.lin(W, 0, 0, H, [[0, V.wall[0]], [1, V.wall[1]]]), tint(V.wall[0], 0.4), shade(V.wall[1], 0.75), 0.32);
  const yb = H * 0.84;
  const w = W * R.range(0.42, 0.5);
  const x = W * R.range(0.16, 0.3);
  const ys = H * R.range(0.32, 0.4);
  // pilasters framing the arch
  const pw = W * 0.06;
  for (const px of [x - pw, x + w]) {
    S.rect(px, -2, pw, yb + 2, S.lin(px, 0, px + pw, 0, [[0, tint(V.wall[0], 0.25)], [0.8, V.wall[1]], [1, shade(V.wall[1], 0.7)]]));
  }
  archOpening(S, x, w, ys, yb, V, { dir: -1, far: V.far, depth: w * 0.16 });
  S.rect(-2, ys - w * 0.62, W + 4, 3 * u, tint(V.wall[0], 0.4), { opacity: 0.8 });
  S.rect(-2, ys - w * 0.62 + 3 * u, W + 4, 3 * u, shade(V.wall[1], 0.6), { filter: S.blur(1 * u), opacity: 0.7 });
  // pavement
  S.rect(-2, yb, W + 4, H - yb + 2, S.lin(0, yb, 0, H, [[0, V.step[0]], [1, V.step[1]]]));
  for (let k = 0; k < 6; k++) {
    const yy = yb + (H - yb) * Math.pow(k / 6, 1.4);
    S.rect(-2, yy, W + 4, 0.8 * u, '#000', { opacity: 0.18 });
  }
  S.texture({ box: [0, yb, W, H - yb], fx: 0.04 / u, fy: 0.12 / u, dark: V.step[1], light: V.step[0], amount: 0.35 });
  // hard diagonal shadow (light from the right)
  const a = R.range(0.35, 0.6);
  multiplyShadow(S, polyD([[-5, -5], [W * a, -5], [W * (a - 0.55), H + 5], [-5, H + 5]]), V.shadow, { opacity: 0.88 });
  S.rect(-2, yb - 1.5 * u, W + 4, 3 * u, '#000', { opacity: 0.25, filter: S.blur(1.2 * u) });
}

function archStair(S, V) {
  const { W, H, R, u } = S;
  const skyY = H * R.range(0.13, 0.19);
  S.rect(-2, -2, W + 4, skyY + 4, S.lin(0, 0, 0, skyY, [[0, V.sky[0]], [1, V.sky[1]]]));
  const top = fractal([-0.05 * W, skyY], [1.05 * W, skyY + H * R.range(-0.03, 0.03)], 4, 0.01, R);
  const wall = lineD(top) + `L${n2(1.05 * W)},${n2(H + 5)}L${n2(-0.05 * W)},${n2(H + 5)}Z`;
  plaster(S, wall, S.lin(0, skyY, W * 0.4, H, [[0, V.wall[0]], [1, V.wall[1]]]), tint(V.wall[0], 0.45), shade(V.wall[1], 0.75), 0.3);
  S.stroke(lineD(top), tint(V.wall[0], 0.6), 2.2 * u, { opacity: 0.8 });
  S.stroke(lineD(top.map(([x, y]) => [x, y + 3 * u])), shade(V.wall[1], 0.6), 3 * u, { opacity: 0.5, filter: S.blur(1.2 * u) });
  // small arched window
  const ww = W * R.range(0.09, 0.12), wx = W * R.range(0.08, 0.22), wy = skyY + H * R.range(0.1, 0.16);
  archOpening(S, wx, ww, wy + ww * 0.5, wy + ww * 1.7, V, { dir: 1, depth: ww * 0.2 });
  // staircase rising to the right
  const n = R.int(6, 8);
  const tw = W * R.range(0.1, 0.125), rh = H * R.range(0.066, 0.08);
  const x0 = -W * 0.04, y0 = H * 1.0;
  const prof = [[x0, y0]];
  for (let k = 0; k < n; k++) {
    prof.push([x0 + k * tw, y0 - (k + 1) * rh]);
    prof.push([x0 + (k + 1) * tw, y0 - (k + 1) * rh]);
  }
  const last = prof[prof.length - 1];
  // landing + doorway
  const lx = last[0], ly = last[1];
  const dw = W * 0.2;
  archOpening(S, Math.min(W - dw * 0.6, lx + W * 0.04), dw, ly - H * 0.2, ly, V, { dir: -1, depth: dw * 0.18 });
  // railing shadow on the wall (light from upper left)
  const sx = W * 0.09, sy = H * 0.05;
  const railY = (x) => y0 - rh - ((x - x0) / tw) * rh - H * 0.13;
  const rail = [[x0, railY(x0)], [lx + tw * 0.5, railY(lx + tw * 0.5)]];
  multiplyShadow(S, `M${n2(rail[0][0] + sx)},${n2(rail[0][1] + sy)}L${n2(rail[1][0] + sx)},${n2(rail[1][1] + sy)}`.replace('M', 'M') + '', 'none');
  S.stroke(lineD(rail.map(([x, y]) => [x + sx, y + sy])), V.shadow, 1.6 * u, { style: 'mix-blend-mode:multiply', opacity: 0.85, filter: S.blur(0.5 * u) });
  for (let k = 0; k <= n; k += 2) {
    const px = x0 + k * tw + tw * 0.5;
    S.stroke(lineD([[px + sx, railY(px) + sy], [px + sx * 1.6, y0 - (k + 1) * rh + sy * 1.2]]), V.shadow, 1.3 * u, { style: 'mix-blend-mode:multiply', opacity: 0.8, filter: S.blur(0.5 * u) });
  }
  // stair body
  const body = polyD([...prof, [lx + W, ly], [lx + W, H + 5], [x0, H + 5]]);
  S.path(body, S.lin(0, ly, 0, H, [[0, mix(V.wall[0], V.wall[1], 0.3)], [1, V.wall[1]]]));
  S.texture({ clip: S.clip(body), box: [0, ly - 5, W, H - ly + 10], fx: 0.05 / u, fy: 0.05 / u, dark: shade(V.wall[1], 0.7), light: tint(V.wall[0], 0.4), amount: 0.3 });
  for (let k = 0; k < n; k++) {
    const x = x0 + k * tw, y = y0 - (k + 1) * rh;
    S.path(polyD([[x, y], [x + tw, y], [x + tw - 1.5 * u, y - 2.6 * u], [x - 1.5 * u, y - 2.6 * u]]), tint(V.wall[0], 0.6));
    S.rect(x, y, tw, 2 * u, '#000', { opacity: 0.12, filter: S.blur(0.8 * u) });
  }
  // railing itself
  const railC = '#2A1C14';
  S.stroke(lineD(rail), railC, 1.5 * u);
  for (let k = 0; k <= n; k += 2) {
    const px = x0 + k * tw + tw * 0.5;
    S.stroke(lineD([[px, railY(px)], [px, y0 - (k + 1) * rh]]), railC, 1.2 * u);
  }
  // big diagonal shadow from the top left
  multiplyShadow(S, polyD([[-5, skyY - 5], [W * R.range(0.35, 0.6), skyY - 5], [-5, skyY + H * R.range(0.25, 0.45)]]), V.shadow, { opacity: 0.85 });
}

function archNiche(S, V) {
  const { W, H, R, u } = S;
  const wall = rectD(-2, -2, W + 4, H + 4);
  plaster(S, wall, S.lin(0, 0, W * 0.4, H, [[0, V.wall[0]], [1, V.wall[1]]]), tint(V.wall[0], 0.5), shade(V.wall[1], 0.85), 0.22);
  const w = W * 0.2, x = W * 0.56, ys = H * 0.36, yb = H * 0.74;
  const outer = archD(x, w, ys, yb);
  S.path(outer, S.lin(x, 0, x + w, 0, [[0, V.inner[1]], [0.7, V.inner[0]], [1, V.reveal]]));
  S.open({ 'clip-path': S.clip(outer) });
  S.rect(x - 2, ys - w / 2 - 2, w + 4, w * 0.9, S.lin(0, ys - w / 2, 0, ys + w * 0.4, [[0, '#4A3424', 0.55], [1, '#4A3424', 0]]));
  tableShadow(S, x + w * 0.5, yb - 1, w * 0.36, w * 0.75, -1, 0.6);
  vessel(S, x + w * 0.5, yb - 1, w * 0.78, w * 0.42, PROFILES.bud, '#E9DCC6', -1, { glaze: 0.6, matte: 0.1 });
  S.close();
  S.rect(x - w * 0.12, yb, w * 1.24, 3 * u, tint(V.wall[0], 0.6));
  S.rect(x - w * 0.12, yb + 3 * u, w * 1.24, 3 * u, '#3A2A1E', { opacity: 0.35, filter: S.blur(1.2 * u) });
  // window light on the wall with mullion shadows
  const lx = W * 0.08, ly = H * 0.12;
  const lw = W * 0.34, lh = H * 0.5;
  const lp = [[lx, ly], [lx + lw, ly + lh * 0.12], [lx + lw, ly + lh * 1.12], [lx, ly + lh]];
  S.path(polyD(lp), '#FFF4E2', { opacity: 0.5, filter: S.blur(5 * u) });
  S.path(polyD([[lx + lw * 0.47, ly], [lx + lw * 0.53, ly + lh * 0.06], [lx + lw * 0.53, ly + lh * 1.06], [lx + lw * 0.47, ly + lh]]), V.shadow, { opacity: 0.35, filter: S.blur(2 * u) });
  S.path(polyD([[lx, ly + lh * 0.45], [lx + lw, ly + lh * 0.57], [lx + lw, ly + lh * 0.62], [lx, ly + lh * 0.5]]), V.shadow, { opacity: 0.3, filter: S.blur(2 * u) });
  // long soft diagonal shadow
  multiplyShadow(S, polyD([[W * 0.68, -5], [W + 5, -5], [W + 5, H + 5], [W * 0.95, H + 5]]), V.shadow, { opacity: 0.7, filter: S.blur(3 * u) });
  // skirting / floor
  S.rect(-2, H * 0.92, W + 4, H * 0.1, S.lin(0, H * 0.92, 0, H, [[0, '#B8946C'], [1, '#8E6C4E']]));
  S.rect(-2, H * 0.92 - 1.5 * u, W + 4, 3 * u, '#000', { opacity: 0.18, filter: S.blur(1.5 * u) });
}

function sceneArch(S, v) {
  const V = ARCH[v];
  if (V.kind === 'arcade') return archArcade(S, V);
  if (V.kind === 'portal') return archPortal(S, V);
  if (V.kind === 'stair') return archStair(S, V);
  if (V.kind === 'niche') return archNiche(S, V);
  return room(S, COLONNADE);
}

/* ------------------------------------------------------------------------ */
/* Room engine (interiors, colonnade): a tiny pinhole camera + sun          */
/* ------------------------------------------------------------------------ */

const COLONNADE = {
  f: 0.74, cx: 0.6, cy: 0.46, L: 1.4, R: 1.5, F: -1.5, C: 1.9, D: 17,
  walls: { left: '#7C5C44', back: '#9A7656', right: '#A27E5E', floor: '#62452F', ceil: '#3E2C20' },
  openings: [
    ...[0, 1, 2, 3, 4, 5].map((k) => ({ wall: 'left', shape: 'arch', a0: 1.1 + k * 2.5, a1: 2.8 + k * 2.5, y0: -1.5, y1: 1.45, th: 0.6 })),
    { wall: 'back', shape: 'arch', a0: -0.75, a1: 0.75, y0: -1.5, y1: 1.3, th: 0.4 },
  ],
  sun: [1, -0.7, 0.42], lit: { floor: '#EDBE8A', wall: '#F6D8A8' }, reveal: ['#4A3426', '#E9C796'], ext: ['#FFF6E4', '#F2D3A6'], patchA: 0.92, shaft: 0.05, tiles: 0.9,
};

const INTERIOR = {
  0: {
    f: 0.82, cx: 0.57, cy: 0.42, L: 1.7, R: 1.9, F: -1.45, C: 1.7, D: 6.2,
    walls: { left: '#584032', back: '#6E5040', right: '#7E5C44', floor: '#4E3222', ceil: '#3A2A20' },
    openings: [{ wall: 'left', shape: 'rect', a0: 2.3, a1: 3.6, y0: -1.45, y1: 0.8, th: 0.36 }],
    sun: [1, -0.62, 0.55], lit: { floor: '#EAAA74', wall: '#F4D3A2' }, reveal: ['#3A2A20', '#E8BF8C'], ext: ['#FFF7E6', '#F0D2A6'],
    props: [{ type: 'chair', x: 0.85, z: 4.6, rot: -0.6 }], tiles: 0.5, patchA: 0.95, shaft: 0.06,
  },
  1: {
    f: 0.9, cx: 0.47, cy: 0.4, L: 1.6, R: 1.6, F: -1.4, C: 1.6, D: 5.2,
    walls: { left: '#6A4E3C', back: '#5E4434', right: '#7A5C46', floor: '#3E2A1E', ceil: '#34261C' },
    openings: [{ wall: 'back', shape: 'rect', a0: -0.6, a1: 0.42, y0: -0.4, y1: 0.95, th: 0.55 }],
    sun: [0.32, -0.55, -1], lit: { floor: '#D9A070', wall: '#F2CC98' }, reveal: ['#30241B', '#E3B98A'], ext: ['#FFF8EA', '#EFD6B0'],
    props: [{ type: 'plinth', x: 0.42, z: 3.3, s: 0.2, h: 0.72, vase: { prof: 'amphora', h: 0.5, w: 0.36, col: '#B9643E' } }], boards: 0.22, patchA: 0.95, shaft: 0.08,
  },
  2: {
    f: 0.8, cx: 0.42, cy: 0.44, L: 1.8, R: 1.6, F: -1.45, C: 1.8, D: 6.0,
    walls: { left: '#7A5A44', back: '#634836', right: '#4E3A2C', floor: '#5A3C2A', ceil: '#3A2A20' },
    openings: [{ wall: 'right', shape: 'arch', a0: 2.5, a1: 3.9, y0: -0.6, y1: 1.3, th: 0.45 }],
    sun: [-1, -0.68, -0.3], lit: { floor: '#E8AC78', wall: '#F3D0A0' }, reveal: ['#33251C', '#E6BE8E'], ext: ['#FFF6E2', '#F2D4A8'],
    props: [{ type: 'chair', x: -0.45, z: 3.5, rot: 0.5 }], tiles: 0.45, patchA: 0.95, shaft: 0.07,
  },
  3: {
    f: 0.78, cx: 0.5, cy: 0.4, L: 1.5, R: 1.7, F: -1.4, C: 1.5, D: 7.5,
    walls: { left: '#5E4636', back: '#6A4E3C', right: '#584032', floor: '#4A3426', ceil: '#30231A' },
    openings: [{ wall: 'back', shape: 'arch', a0: -0.65, a1: 0.65, y0: -1.4, y1: 1.0, th: 0.7 }],
    sun: [-0.32, -0.42, -1], lit: { floor: '#E2B080', wall: '#F2D0A0' }, reveal: ['#2E2219', '#E0B888'], ext: ['#FFF7E8', '#F4DAB2'],
    props: [{ type: 'vase', x: -0.95, z: 5.0, prof: 'amphora', h: 0.75, w: 0.42, col: '#A85A38' }], tiles: 0.6, patchA: 0.95, shaft: 0.07, courtyard: true,
  },
  bright: {
    f: 0.8, cx: 0.56, cy: 0.43, L: 1.8, R: 2.0, F: -1.45, C: 1.8, D: 6.4,
    walls: { left: '#B49A7E', back: '#CDB596', right: '#D8C2A4', floor: '#9A7656', ceil: '#A08A72' },
    openings: [{ wall: 'left', shape: 'rect', a0: 2.0, a1: 4.0, y0: -0.75, y1: 1.1, th: 0.3 }],
    sun: [1, -0.7, 0.35], lit: { floor: '#F2D2A8', wall: '#FBEBD2' }, reveal: ['#9E8466', '#F6E2C4'], ext: ['#FFFBF2', '#F4E6CE'],
    props: [{ type: 'chair', x: 0.6, z: 4.4, rot: -0.35 }, { type: 'plinth', x: 1.45, z: 5.6, s: 0.22, h: 0.8, vase: { prof: 'bud', h: 0.42, w: 0.3, col: '#E4D6BE' } }],
    boards: 0.2, patchA: 0.85, shaft: 0.05, ambient: 0.4,
  },
};

function chairSegs() {
  const h = 0.21, seat = 0.46, back = 0.95;
  const s = [];
  for (const [x, z] of [[-h, -h], [h, -h], [-h, h], [h, h]]) s.push([[x, 0, z], [x, seat, z], 0.035]);
  s.push([[-h, seat, -h], [h, seat, -h], 0.04], [[h, seat, -h], [h, seat, h], 0.04], [[h, seat, h], [-h, seat, h], 0.04], [[-h, seat, h], [-h, seat, -h], 0.04]);
  s.push([[-h, seat, h], [-h, back, h], 0.035], [[h, seat, h], [h, back, h], 0.035]);
  for (const y of [back - 0.02, back - 0.16, back - 0.3]) s.push([[-h, y, h], [h, y, h], 0.03]);
  s.push([[-h, 0.15, -h], [-h, 0.15, h], 0.022], [[h, 0.15, -h], [h, 0.15, h], 0.022], [[-h, 0.12, h], [h, 0.12, h], 0.022]);
  return { segs: s, seat: [[-h, seat, -h], [h, seat, -h], [h, seat, h], [-h, seat, h]] };
}

function room(S, V) {
  const { W, H, R, u } = S;
  const f = V.f * W, cx = V.cx * W, cy = V.cy * H;
  const ZN = 0.3;
  const P = (p) => [cx + (f * p[0]) / p[2], cy - (f * p[1]) / p[2]];
  const clipNear = (poly) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ai = a[2] >= ZN, bi = b[2] >= ZN;
      if (ai) out.push(a);
      if (ai !== bi) {
        const t = (ZN - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ZN]);
      }
    }
    return out;
  };
  const proj = (poly) => clipNear(poly).map(P);
  const pd = (poly) => {
    const c = proj(poly);
    return c.length >= 3 ? polyD(c) : null;
  };
  const segP = (a, b) => {
    if (a[2] < ZN && b[2] < ZN) return null;
    let A = a, B = b;
    if (A[2] < ZN) A = lerp3(B, A, (B[2] - ZN) / (B[2] - A[2]));
    if (B[2] < ZN) B = lerp3(A, B, (A[2] - ZN) / (A[2] - B[2]));
    return [P(A), P(B)];
  };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const { L, F, C, D } = V;
  const Rw = V.R;
  const d = norm3(V.sun);
  const col = V.walls;
  const surf = {
    back: [[-L, F, D], [Rw, F, D], [Rw, C, D], [-L, C, D]],
    ceil: [[-L, C, ZN], [-L, C, D], [Rw, C, D], [Rw, C, ZN]],
    floor: [[-L, F, ZN], [Rw, F, ZN], [Rw, F, D], [-L, F, D]],
    left: [[-L, F, ZN], [-L, F, D], [-L, C, D], [-L, C, ZN]],
    right: [[Rw, F, ZN], [Rw, C, ZN], [Rw, C, D], [Rw, F, D]],
  };
  const vy = (y, z) => P([0, y, z])[1];
  const fills = {
    back: S.lin(0, vy(C, D), 0, vy(F, D), [[0, shade(col.back, 0.82)], [1, col.back]]),
    ceil: S.lin(0, 0, 0, vy(C, D), [[0, shade(col.ceil, 0.55)], [1, col.ceil]]),
    floor: S.lin(0, vy(F, D), 0, H, [[0, col.floor], [1, shade(col.floor, 0.62)]]),
    left: S.lin(0, 0, P([-L, 0, D])[0], 0, [[0, shade(col.left, 0.5)], [1, col.left]]),
    right: S.lin(W, 0, P([Rw, 0, D])[0], 0, [[0, shade(col.right, 0.55)], [1, col.right]]),
  };
  const sd = {};
  const sclip = {};
  for (const k of ['back', 'ceil', 'floor', 'left', 'right']) {
    const dd = pd(surf[k]);
    if (!dd) continue;
    sd[k] = dd;
    sclip[k] = S.clip(dd);
    S.path(dd, fills[k]);
    if (k !== 'floor') S.texture({ clip: sclip[k], fx: 0.012 / u, fy: 0.014 / u, oct: 4, dark: shade(col[k], 0.6), light: tint(col[k], 0.25), amount: 0.32, contrast: 2.4 });
  }
  S.texture({ clip: sclip.floor, fx: 0.03 / u, fy: 0.08 / u, oct: 3, dark: shade(col.floor, 0.55), light: tint(col.floor, 0.2), amount: 0.4, contrast: 2.4 });
  // ambient occlusion along the room's edges
  const edges = [
    [[-L, F, ZN], [-L, F, D]], [[Rw, F, ZN], [Rw, F, D]], [[-L, F, D], [Rw, F, D]], [[-L, F, D], [-L, C, D]],
    [[Rw, F, D], [Rw, C, D]], [[-L, C, D], [Rw, C, D]], [[-L, C, ZN], [-L, C, D]], [[Rw, C, ZN], [Rw, C, D]],
  ];
  S.open({ filter: S.blur(3.2 * u), opacity: 0.45 });
  for (const [a, b] of edges) {
    const s = segP(a, b);
    if (s) S.stroke(lineD(s), '#0E0805', 6 * u);
  }
  S.close();

  // openings ---------------------------------------------------------------
  const wallInfo = {
    left: { to3: (a, y, o) => [-L - o, y, a], n3: (na, ny) => [0, ny, na], da: d[2], dn: d[0] },
    right: { to3: (a, y, o) => [Rw + o, y, a], n3: (na, ny) => [0, ny, na], da: d[2], dn: -d[0] },
    back: { to3: (a, y, o) => [a, y, D + o], n3: (na, ny) => [na, ny, 0], da: d[0], dn: -d[2] },
  };
  const apPoly = (op) => {
    if (op.shape === 'arch') {
      const r = (op.a1 - op.a0) / 2, ac = (op.a0 + op.a1) / 2, ys = op.y1 - r;
      const pts = [[op.a0, op.y0], [op.a1, op.y0], [op.a1, ys]];
      for (let k = 1; k < 14; k++) {
        const th = (k / 14) * Math.PI;
        pts.push([ac + r * Math.cos(th), ys + r * Math.sin(th)]);
      }
      pts.push([op.a0, ys]);
      return pts;
    }
    return [[op.a0, op.y0], [op.a1, op.y0], [op.a1, op.y1], [op.a0, op.y1]];
  };
  const patches = [];
  const shafts = [];
  for (const op of V.openings) {
    const wi = wallInfo[op.wall];
    const ap = apPoly(op);
    const inner3 = ap.map(([a, y]) => wi.to3(a, y, 0));
    const outer3 = ap.map(([a, y]) => wi.to3(a, y, op.th));
    const innerD = pd(inner3);
    if (!innerD) continue;
    const icl = S.clip(innerD);
    S.open({ 'clip-path': icl });
    S.path(innerD, V.reveal[0]);
    const cen = ap.reduce((s, p) => [s[0] + p[0] / ap.length, s[1] + p[1] / ap.length], [0, 0]);
    const faces = [];
    for (let i = 0; i < ap.length; i++) {
      const j = (i + 1) % ap.length;
      const e = [ap[j][0] - ap[i][0], ap[j][1] - ap[i][1]];
      let nn = [-e[1], e[0]];
      const mid = [(ap[i][0] + ap[j][0]) / 2, (ap[i][1] + ap[j][1]) / 2];
      if ((cen[0] - mid[0]) * nn[0] + (cen[1] - mid[1]) * nn[1] < 0) nn = [-nn[0], -nn[1]];
      const ln = Math.hypot(nn[0], nn[1]) || 1;
      const n3 = wi.n3(nn[0] / ln, nn[1] / ln);
      const quad = [inner3[i], inner3[j], outer3[j], outer3[i]];
      const fc = quad.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
      if (-dot3(fc, n3) <= 0) continue;
      faces.push({ quad, lam: Math.max(0, -dot3(n3, d)), z: fc[2] });
    }
    faces.sort((a, b) => b.z - a.z);
    for (const fc of faces) S.path(pd(fc.quad), mix(V.reveal[0], V.reveal[1], Math.min(1, fc.lam * 1.25)));
    const outerD = pd(outer3);
    if (outerD) {
      const ob = proj(outer3);
      const y0 = Math.min(...ob.map((p) => p[1])), y1 = Math.max(...ob.map((p) => p[1]));
      const x0 = Math.min(...ob.map((p) => p[0])), x1 = Math.max(...ob.map((p) => p[0]));
      S.path(outerD, S.lin(0, y0, 0, y1, [[0, V.ext[0]], [1, V.ext[1]]]));
      S.open({ 'clip-path': S.clip(outerD) });
      if (V.courtyard) {
        S.rect(x0, y0 + (y1 - y0) * 0.55, x1 - x0, (y1 - y0) * 0.5, '#E9C394', { opacity: 0.7, filter: S.blur(1.2 * u) });
        S.ellipse(x0 + (x1 - x0) * 0.75, y0 + (y1 - y0) * 0.55, (x1 - x0) * 0.35, (y1 - y0) * 0.22, '#7E7A55', { opacity: 0.55, filter: S.blur(2.5 * u) });
      } else {
        S.ellipse(x0 + (x1 - x0) * 0.3, y1, (x1 - x0) * 0.6, (y1 - y0) * 0.3, '#9C9670', { opacity: 0.35, filter: S.blur(3 * u) });
      }
      S.close();
    }
    S.close();
    // the sun patch through the effective aperture
    if (wi.dn > 0.01) {
      const k = op.th / wi.dn;
      const shifted = ap.map(([a, y]) => [a + wi.da * k, y + d[1] * k]);
      const eff = clipPoly(ap, shifted);
      if (eff.length >= 3) {
        const eff3 = eff.map(([a, y]) => wi.to3(a, y, 0));
        const planes = [];
        if (d[1] < 0) planes.push(['floor', (p) => (F - p[1]) / d[1], [0, 1, 0]]);
        if (d[0] > 0 && op.wall !== 'right') planes.push(['right', (p) => (Rw - p[0]) / d[0], [-1, 0, 0]]);
        if (d[0] < 0 && op.wall !== 'left') planes.push(['left', (p) => (-L - p[0]) / d[0], [1, 0, 0]]);
        if (d[2] > 0 && op.wall !== 'back') planes.push(['back', (p) => (D - p[2]) / d[2], [0, 0, -1]]);
        for (const [name, tf, nrm] of planes) {
          const hit = eff3.map((p) => {
            const t = tf(p);
            return [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
          });
          const dd = pd(hit);
          if (dd) patches.push({ name, d: dd, hit, lam: -dot3(nrm, d) });
          if (name === 'floor') shafts.push([...proj(eff3), ...proj(hit)]);
        }
      }
    }
  }
  for (const p of patches) {
    if (!sclip[p.name]) continue;
    S.open({ 'clip-path': sclip[p.name] });
    const c = p.name === 'floor' ? V.lit.floor : V.lit.wall;
    S.path(p.d, c, { opacity: V.patchA * clamp(0.55 + 0.6 * p.lam), filter: S.blur(0.6 * u) });
    S.close();
  }
  // floor joints (tiles or boards), drawn over the light
  if (V.tiles || V.boards) {
    S.open({ 'clip-path': sclip.floor, opacity: 0.32 });
    const sz = V.tiles || V.boards;
    for (let x = -L; x <= Rw + 1e-6; x += sz) {
      const s = segP([x, F, 0.5], [x, F, D]);
      if (s) S.stroke(lineD(s), '#140C07', 0.7 * u);
    }
    if (V.tiles) {
      for (let z = D; z > 0.5; z -= V.tiles) {
        const s = segP([-L, F, z], [Rw, F, z]);
        if (s) S.stroke(lineD(s), '#140C07', 0.7 * u);
      }
    }
    S.close();
  }
  // bounce light around the floor patches
  for (const p of patches.filter((q) => q.name === 'floor')) {
    const c = proj(p.hit);
    if (!c.length) continue;
    const m = c.reduce((s, q) => [s[0] + q[0] / c.length, s[1] + q[1] / c.length], [0, 0]);
    S.circle(m[0], m[1], W * 0.65, S.rad(m[0], m[1], W * 0.65, [[0, V.lit.floor, 0.22], [1, V.lit.floor, 0]]));
  }
  if (V.ambient) S.rect(0, 0, W, H, '#FFF6E8', { opacity: V.ambient * 0.25 });
  // props ------------------------------------------------------------------
  const floorPatchClip = S.clipMany(patches.filter((p) => p.name === 'floor').map((p) => p.d));
  const toFloor = (p) => {
    const t = (F - p[1]) / d[1];
    return [p[0] + d[0] * t, F, p[2] + d[2] * t];
  };
  const props = [...(V.props ?? [])].sort((a, b) => b.z - a.z);
  for (const pr of props) {
    const ca = Math.cos(pr.rot ?? 0), sa = Math.sin(pr.rot ?? 0);
    const T = ([x, y, z]) => [pr.x + x * ca - z * sa, F + y, pr.z + x * sa + z * ca];
    const shadowCol = shade(col.floor, 0.85);
    if (pr.type === 'chair') {
      const { segs, seat } = chairSegs();
      S.open({ 'clip-path': floorPatchClip });
      S.open({ filter: S.blur(0.5 * u), opacity: 0.92 });
      for (const [a, b, th] of segs) {
        const A = toFloor(T(a)), B = toFloor(T(b));
        const s = segP(A, B);
        if (s) S.stroke(lineD(s), shadowCol, (th * f) / ((A[2] + B[2]) / 2));
      }
      S.path(pd(seat.map((p) => toFloor(T(p)))), shadowCol);
      S.close();
      S.close();
      const wood = '#24170F';
      S.path(pd(seat.map(T)), '#3A2818');
      for (const [a, b, th] of segs) {
        const A = T(a), B = T(b);
        const s = segP(A, B);
        if (s) S.stroke(lineD(s), wood, (th * f) / ((A[2] + B[2]) / 2));
      }
      for (const [a, b, th] of segs) {
        const A = T(a), B = T(b);
        const s = segP(A, B);
        if (s) S.stroke(lineD(s.map(([x, y]) => [x - Math.sign(d[0]) * 0.3 * u, y])), '#8A5E3E', (th * f * 0.3) / ((A[2] + B[2]) / 2), { opacity: 0.55 });
      }
    } else if (pr.type === 'plinth' || pr.type === 'vase') {
      const ph = pr.type === 'plinth' ? pr.h : 0;
      if (pr.type === 'plinth') {
        const s = pr.s;
        const corners = [];
        for (const y of [0, ph]) for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) corners.push(T([x, y, z]));
        S.open({ 'clip-path': floorPatchClip });
        S.path(polyD(hull(corners.map((p) => P(toFloor(p))))), shadowCol, { opacity: 0.92, filter: S.blur(0.5 * u) });
        S.close();
        const faces = [
          { q: [[-s, ph, -s], [s, ph, -s], [s, ph, s], [-s, ph, s]], n: [0, 1, 0] },
          { q: [[-s, 0, -s], [s, 0, -s], [s, ph, -s], [-s, ph, -s]], n: [0, 0, -1] },
          { q: [[-s, 0, -s], [-s, 0, s], [-s, ph, s], [-s, ph, -s]], n: [-1, 0, 0] },
          { q: [[s, 0, -s], [s, 0, s], [s, ph, s], [s, ph, -s]], n: [1, 0, 0] },
        ];
        const pc = V.plinthCol ?? '#C9A57E';
        for (const fc of faces) {
          const q3 = fc.q.map(T);
          const c3 = q3.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
          if (-dot3(c3, fc.n) <= 0) continue;
          const lam = Math.max(0, -dot3(fc.n, d));
          S.path(pd(q3), mix(shade(pc, 0.3), tint(pc, 0.35), clamp(lam * 1.2 + 0.08)));
        }
      }
      const vz = pr.vase ?? pr;
      const base = T([0, ph, 0]);
      const bp = P(base);
      const sc = f / base[2];
      const vh = vz.h * sc, vw = vz.w * sc;
      if (pr.type === 'vase') {
        const pts = [];
        for (const [t, r] of PROFILES[vz.prof]) for (const sgn of [-1, 1]) pts.push(toFloor(T([sgn * r * vz.w * 0.9, t * vz.h, 0])));
        S.open({ 'clip-path': floorPatchClip });
        S.path(polyD(hull(pts.map(P))), shadowCol, { opacity: 0.9, filter: S.blur(0.8 * u) });
        S.close();
        S.ellipse(bp[0], bp[1], vw * 0.5, vw * 0.08, '#080503', { opacity: 0.7, filter: S.blur(1 * u) });
      }
      vessel(S, bp[0], bp[1], vh, vw, PROFILES[vz.prof], vz.col, d[0] > 0 ? -1 : 1, { glaze: vz.glaze ?? 0.3, matte: 0.2 });
    }
  }
  // light in the air
  for (const sh of shafts) {
    const h2 = hull(sh);
    if (h2.length >= 3) S.path(polyD(h2), V.lit.wall, { opacity: V.shaft ?? 0.06, filter: S.blur(4 * u) });
  }
}

function sceneInterior(S, v) {
  room(S, INTERIOR[v]);
}

/* ------------------------------------------------------------------------ */
/* Family 4: still life                                                     */
/* ------------------------------------------------------------------------ */

const STILL = {
  0: { light: -1, wall: ['#7A5438', '#24170F'], table: ['#5E3C26', '#A87444'], edge: '#20140C', ty: 0.6, ey: 0.84, set: 'jug', patch: 0.75 },
  1: { light: 1, wall: ['#5E4430', '#1C130D'], table: ['#4E3322', '#93633E'], edge: '#1A110B', ty: 0.62, ey: 0.86, set: 'bowl', patch: 0.55 },
  2: { light: -1, wall: ['#6C4832', '#21150E'], table: ['#5A3A26', '#9C6A42'], edge: '#1E130C', ty: 0.6, ey: 0.82, set: 'amphora', linen: true, patch: 0.45 },
  3: { light: -1, wall: ['#86705A', '#2E241B'], table: ['#7C624A', '#B89C78'], edge: '#2A2018', ty: 0.63, ey: 0.86, set: 'morandi', patch: 0.6 },
  print: { light: -1, wall: ['#7C5639', '#22160E'], table: ['#5C3B25', '#AA7646'], edge: '#1E130C', ty: 0.6, ey: 0.83, set: 'print', linen: true, patch: 0.7 },
  desk: { light: -1, wall: ['#E6D6BE', '#A88E70'], table: ['#B8946C', '#D9B88E'], edge: '#5A4230', ty: 0.6, ey: 0.9, set: 'desk', patch: 0.8, high: true },
};

function stillSet(name, R) {
  const j = (a, b) => R.range(a, b);
  switch (name) {
    case 'jug':
      return [
        { t: 'v', prof: 'jug', x: j(0.36, 0.44), dep: 0.25, h: 0.36, w: 0.27, col: '#E8D8BE', glaze: 0.8, handle: true },
        { t: 'v', prof: 'cup', x: j(0.66, 0.72), dep: 0.45, h: 0.1, w: 0.13, col: '#9A5634', glaze: 0.4 },
        { t: 'f', kind: 'lemon', x: j(0.55, 0.6), dep: 0.75, r: 0.045, col: '#D9A23C', rot: -8 },
        { t: 'f', kind: 'lemon', x: j(0.2, 0.26), dep: 0.85, r: 0.042, col: '#CF9634', rot: 12 },
      ];
    case 'bowl':
      return [
        { t: 'v', prof: 'bottle', x: j(0.62, 0.7), dep: 0.15, h: 0.42, w: 0.16, col: '#3E4228', glaze: 1, mouth: false },
        { t: 'v', prof: 'bowl', x: j(0.38, 0.44), dep: 0.55, h: 0.1, w: 0.17, col: '#C8B497', glaze: 0.5, fill: true },
        { t: 'f', x: j(0.72, 0.78), dep: 0.8, r: 0.04, col: '#D27E3A', stem: true },
      ];
    case 'amphora':
      return [
        { t: 'v', prof: 'amphora', x: j(0.3, 0.38), dep: 0.2, h: 0.42, w: 0.3, col: '#B15E3A', matte: 0.3 },
        { t: 'f', kind: 'pom', x: j(0.56, 0.6), dep: 0.6, r: 0.06, col: '#8C2E22' },
        { t: 'f', kind: 'pom', x: j(0.7, 0.74), dep: 0.45, r: 0.05, col: '#7A2A1E' },
        { t: 'v', prof: 'cup', x: j(0.84, 0.88), dep: 0.3, h: 0.08, w: 0.11, col: '#E2D2B8', glaze: 0.6 },
      ];
    case 'morandi':
      return [
        { t: 'v', prof: 'bottle', x: j(0.3, 0.34), dep: 0.2, h: 0.4, w: 0.14, col: '#D8CCB6', glaze: 0.2, mouth: false },
        { t: 'v', prof: 'cyl', x: j(0.46, 0.5), dep: 0.4, h: 0.22, w: 0.15, col: '#B98E66', glaze: 0.1 },
        { t: 'v', prof: 'vase', x: j(0.64, 0.68), dep: 0.3, h: 0.3, w: 0.2, col: '#9C8C6C', glaze: 0.15 },
        { t: 'v', prof: 'cup', x: j(0.8, 0.84), dep: 0.6, h: 0.09, w: 0.12, col: '#E6DCC8', glaze: 0.3 },
      ];
    case 'print':
      return [
        { t: 'v', prof: 'jug', x: 0.33, dep: 0.2, h: 0.4, w: 0.29, col: '#E8D8BE', glaze: 0.85, handle: true },
        { t: 'v', prof: 'bowl', x: 0.62, dep: 0.4, h: 0.09, w: 0.15, col: '#A65A36', glaze: 0.4, fill: true },
        { t: 'v', prof: 'bottle', x: 0.8, dep: 0.1, h: 0.36, w: 0.13, col: '#3C4128', glaze: 1, mouth: false },
        { t: 'f', kind: 'lemon', x: 0.5, dep: 0.85, r: 0.04, col: '#D9A23C', rot: -6 },
        { t: 'f', x: 0.18, dep: 0.9, r: 0.036, col: '#C9762F', stem: true },
      ];
    case 'desk':
      return [
        { t: 'slab', x: 0.42, dep: 0.55, w: 0.3, dp: 0.16, th: 0.03, col: '#F4ECDE', edge: '#D9CCB6', rot: -4, layers: 5 },
        { t: 'slab', x: 0.2, dep: 0.75, w: 0.2, dp: 0.13, th: 0.018, col: '#5E6046', edge: '#E9DFCC', rot: 8 },
        { t: 'v', prof: 'cup', x: 0.68, dep: 0.62, h: 0.1, w: 0.12, col: '#ECE2D0', glaze: 0.6, handle: true },
        { t: 'v', prof: 'bud', x: 0.8, dep: 0.25, h: 0.18, w: 0.1, col: '#B6643E', matte: 0.25, stems: true },
      ];
    default:
      return [];
  }
}

function sceneStill(S, v) {
  const { W, H, R, u } = S;
  const V = STILL[v];
  const L = V.light;
  const ty = H * V.ty, ey = H * V.ey;
  // wall with a pool of window light
  const lx = L < 0 ? W * 0.3 : W * 0.7;
  S.rect(-2, -2, W + 4, ty + 4, S.rad(lx, H * 0.3, W * 0.95, [[0, V.wall[0]], [1, V.wall[1]]]));
  S.texture({ box: [0, 0, W, ty], fx: 0.012 / u, fy: 0.012 / u, oct: 4, dark: V.wall[1], light: tint(V.wall[0], 0.2), amount: 0.32, contrast: 2.3 });
  if (V.patch) {
    const px = L < 0 ? W * R.range(0.04, 0.14) : W * R.range(0.5, 0.6), py = H * R.range(0.06, 0.14);
    const pw = W * 0.38, ph = ty - py + H * 0.04;
    const sk = -L * W * 0.06;
    const pp = [[px, py], [px + pw, py + sk * 0.5], [px + pw, py + ph + sk * 0.5], [px, py + ph]];
    const pc = V.high ? '#FFF6E6' : mix(V.wall[0], '#FFE4BC', 0.55);
    S.path(polyD(pp), pc, { opacity: V.patch, filter: S.blur(4.5 * u) });
    const mc = V.high ? '#7A6048' : V.wall[1];
    S.path(polyD([[px + pw * 0.48, py], [px + pw * 0.54, py], [px + pw * 0.54, py + ph + sk * 0.5], [px + pw * 0.48, py + ph]]), mc, { opacity: 0.6 * V.patch, filter: S.blur(1.6 * u) });
    S.path(polyD([[px, py + ph * 0.42], [px + pw, py + ph * 0.42 + sk * 0.5], [px + pw, py + ph * 0.47 + sk * 0.5], [px, py + ph * 0.47]]), mc, { opacity: 0.55 * V.patch, filter: S.blur(1.6 * u) });
  }
  S.rect(-2, ty - 2 * u, W + 4, 5 * u, '#000', { opacity: 0.35, filter: S.blur(2 * u) });
  // table top + front
  S.rect(-2, ty, W + 4, ey - ty, S.lin(0, ty, 0, ey, [[0, V.table[0]], [1, V.table[1]]]));
  S.texture({ box: [0, ty, W, ey - ty], fx: 0.004 / u, fy: 0.09 / u, oct: 3, dark: shade(V.table[0], 0.6), light: tint(V.table[1], 0.2), amount: 0.35, contrast: 2.5 });
  S.rect(-2, ty, W + 4, ey - ty, S.lin(L < 0 ? 0 : W, 0, L < 0 ? W : 0, 0, [[0, '#FFE6C0', 0.16], [0.45, '#000', 0], [1, '#000', 0.5]]));
  S.rect(-2, ey, W + 4, H - ey + 2, S.lin(0, ey, 0, H, [[0, V.edge], [1, shade(V.edge, 0.55)]]));
  S.rect(-2, ey - 0.6 * u, W + 4, 1.3 * u, '#FFE2B8', { opacity: V.high ? 0.6 : 0.35, filter: S.blur(0.4 * u) });
  if (V.linen) {
    const x0 = W * (L < 0 ? R.range(0.42, 0.5) : 0.1), x1 = x0 + W * R.range(0.4, 0.5);
    const yb = ty + (ey - ty) * 0.28;
    const top = [[x0 + W * 0.03, yb], [x1 - W * 0.02, yb + 2 * u], [x1 + W * 0.02, ey], [x0 - W * 0.02, ey]];
    S.path(polyD(top), S.lin(x0, 0, x1, 0, [[0, '#EFE3CE'], [1, '#B8A68C']]));
    const hang = [];
    for (let s = 0; s <= 16; s++) hang.push([lerp(x1 + W * 0.02, x0 - W * 0.02, s / 16), H + 4 + Math.sin(s * 1.3) * 3 * u]);
    const hd = polyD([[x0 - W * 0.02, ey], [x1 + W * 0.02, ey], [x1 + W * 0.04, H * 0.92], ...hang.slice(2, -2), [x0 - W * 0.04, H * 0.92]]);
    S.path(hd, S.lin(x0, 0, x1, 0, [[0, '#E2D3BA'], [0.6, '#B8A486'], [1, '#7A6A56']]));
    const hc = S.clip(hd);
    S.open({ 'clip-path': hc });
    for (let k = 0; k < 7; k++) {
      const fx = lerp(x0, x1, (k + R.range(0.2, 0.8)) / 7);
      S.stroke(`M${n2(fx)},${n2(ey)}Q${n2(fx + R.range(-6, 6) * u)},${n2((ey + H) / 2)} ${n2(fx + R.range(-8, 8) * u)},${n2(H + 4)}`, k % 2 ? '#5A4A3A' : '#FFF6E8', R.range(2, 4) * u, { opacity: k % 2 ? 0.35 : 0.3, filter: S.blur(1.8 * u) });
    }
    S.close();
    S.rect(x0 - W * 0.03, ey - 1 * u, x1 - x0 + W * 0.06, 2 * u, '#FFF8EC', { opacity: 0.5, filter: S.blur(0.6 * u) });
    S.texture({ clip: S.clip(polyD(top)), box: [x0 - W * 0.05, yb - 4, x1 - x0 + W * 0.1, H - yb], fx: 0.02, fy: 0.3, oct: 2, dark: '#8A7860', light: '#FFFFFF', amount: 0.25 });
    S.texture({ clip: hc, box: [x0 - W * 0.05, ey - 4, x1 - x0 + W * 0.1, H - ey + 8], fx: 0.3, fy: 0.02, oct: 2, dark: '#8A7860', light: '#FFFFFF', amount: 0.2 });
  }
  const objs = stillSet(V.set, R).map((o) => ({ ...o, by: ty + (ey - ty) * (0.12 + 0.78 * o.dep) }));
  objs.sort((a, b) => a.by - b.by);
  // shadows first
  for (const o of objs) {
    if (o.t === 'v') tableShadow(S, o.x * W, o.by, o.w * W * (o.prof === 'bowl' ? 1.6 : 0.9), o.h * H, L, 1);
    else if (o.t === 'f') tableShadow(S, o.x * W, o.by, o.r * W * 2.2, o.r * W * 1.6, L, 0.9);
    else if (o.t === 'slab') {
      const x = o.x * W, w = o.w * W;
      S.path(polyD([[x - w / 2 - L * 4 * u, o.by - o.dp * H], [x + w / 2 - L * 6 * u, o.by - o.dp * H], [x + w / 2 - L * 6 * u, o.by + 2 * u], [x - w / 2 - L * 4 * u, o.by + 2 * u]]), '#1A0F08', { opacity: 0.4, filter: S.blur(2.4 * u) });
    }
  }
  for (const o of objs) {
    const x = o.x * W;
    if (o.t === 'v') {
      const h = o.h * H, w = o.w * W;
      const res = vessel(S, x, o.by, h, w, PROFILES[o.prof], o.col, L, { glaze: o.glaze, handle: o.handle, mouth: o.mouth, matte: o.matte });
      if (o.fill) {
        const rr = w * 0.9;
        for (let k = 0; k < 5; k++) fruit(S, x + (k - 2) * rr * 0.36 + R.range(-1, 1) * u, res.top - rr * 0.12 - (k % 2) * rr * 0.12, rr * 0.22, k % 2 ? '#D88A3E' : '#C9702E', L, { gloss: 0.4 });
      }
      if (o.stems) {
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + R.range(-0.35, 0.35);
          const len = H * R.range(0.16, 0.26);
          const ex = x + Math.cos(a) * len, ey2 = res.top + Math.sin(a) * len;
          S.stroke(`M${n2(x)},${n2(res.top + 2 * u)}Q${n2(x + Math.cos(a) * len * 0.3 + R.range(-4, 4) * u)},${n2(res.top - len * 0.5)} ${n2(ex)},${n2(ey2)}`, '#5A4630', 0.9 * u);
          S.ellipse(ex, ey2, 2.4 * u, 5 * u, '#8A6A44', { transform: `rotate(${n2((a * 180) / Math.PI + 90)} ${n2(ex)} ${n2(ey2)})`, filter: S.blur(0.4 * u) });
        }
      }
    } else if (o.t === 'f') {
      fruit(S, x, o.by - o.r * W * 0.92, o.r * W, o.col, L, { kind: o.kind, rot: o.rot, stem: o.stem });
    } else if (o.t === 'slab') {
      const w = o.w * W, dp = o.dp * H, th = o.th * H;
      const sk = (o.rot ?? 0) * u;
      const topP = [[x - w / 2, o.by - th], [x + w / 2, o.by - th], [x + w / 2 + sk, o.by - th - dp], [x - w / 2 + sk, o.by - th - dp]];
      S.path(polyD([[x - w / 2, o.by - th], [x + w / 2, o.by - th], [x + w / 2, o.by], [x - w / 2, o.by]]), S.lin(0, o.by - th, 0, o.by, [[0, o.edge], [1, shade(o.edge, 0.7)]]));
      if (o.layers) for (let k = 1; k < o.layers; k++) S.rect(x - w / 2, o.by - th + (th * k) / o.layers, w, 0.5 * u, '#8A7A64', { opacity: 0.5 });
      S.path(polyD(topP), S.lin(x - w / 2, 0, x + w / 2, 0, [[0, tint(o.col, 0.3)], [1, shade(o.col, 0.86)]]));
      S.texture({ clip: S.clip(polyD(topP)), box: [x - w / 2 - 2, o.by - th - dp - 2, w + sk + 4, dp + 4], fx: 0.15, fy: 0.15, oct: 2, dark: shade(o.col, 0.7), light: '#FFFFFF', amount: 0.15 });
    }
  }
  // darken the far side
  S.rect(-2, -2, W + 4, H + 4, S.lin(L < 0 ? 0 : W, 0, L < 0 ? W : 0, 0, [[0, '#000', 0], [0.55, '#000', 0], [1, '#000', V.high ? 0.12 : 0.3]]));
}

/* ------------------------------------------------------------------------ */
/* Family 5: botanical                                                      */
/* ------------------------------------------------------------------------ */

const BOTANICAL = {
  0: { kind: 'olive', sky: ['#FAEBCB', '#EDBF8A', '#A97750'], leaf: '#1E1D14', hill: '#4A4030' },
  1: { kind: 'palm', sky: ['#40291F', '#A65C3C', '#F5B676'], sun: [0.64, 0.68, 0.06], leaf: '#17100B' },
  2: { kind: 'grass', sky: ['#F8E4BE', '#E5A86E', '#8E5838'], sun: [0.76, 0.17, 0.045], hill: '#2C1F15', head: '#F2CB90' },
  3: { kind: 'tree', sky: ['#C99A6C', '#EFCFA0', '#FAEACB'], leaf: '#1C1A12', field: ['#C99B62', '#6E4A2C'] },
};

function newAcc(nb = 3) {
  return { stems: [], leaves: Array.from({ length: nb }, () => []) };
}
function growBranch(S, acc, x, y, ang, len, width, depth, o) {
  const { R, u } = S;
  const n = Math.max(4, Math.round(len / (5 * u)));
  const step = len / n;
  let a = ang;
  const pts = [[x, y]];
  for (let i = 0; i < n; i++) {
    a += R.gauss() * 0.07 + (o.droop ?? 0) * 0.04;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  acc.stems.push(taperD(pts, width, width * 0.25));
  for (let i = 1; i < pts.length; i++) {
    const dir = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const q = i / pts.length;
    if (R.next() < o.leafDensity * (0.4 + q)) {
      const side = i % 2 ? 1 : -1;
      const la = dir + side * R.range(0.35, 0.95);
      const ll = o.leafLen * R.range(0.7, 1.15);
      acc.leaves[R.int(0, acc.leaves.length - 1)].push(leafD(pts[i][0], pts[i][1], la, ll, ll * o.leafW, R.range(-0.1, 0.1)));
    }
    if (depth > 0 && R.next() < o.branchP && q > 0.15 && q < 0.85) {
      growBranch(S, acc, pts[i][0], pts[i][1], dir + (R.chance(0.5) ? 1 : -1) * R.range(0.35, 0.8), len * R.range(0.3, 0.55), width * 0.55, depth - 1, o);
    }
  }
  const [tx, ty] = pts[pts.length - 1];
  for (let k = 0; k < 3; k++) acc.leaves[k % acc.leaves.length].push(leafD(tx, ty, a + R.range(-0.6, 0.6), o.leafLen * R.range(0.6, 0.9), o.leafLen * o.leafW * 0.8));
}
function drawAcc(S, acc, cols, a = {}) {
  S.open(a);
  S.path(acc.stems.join(''), cols[0]);
  acc.leaves.forEach((l, i) => S.path(l.join(''), cols[i % cols.length]));
  S.close();
}

function sceneBotanical(S, v) {
  const { W, H, R, u } = S;
  const V = BOTANICAL[v];
  if (V.kind === 'olive') {
    S.rect(0, 0, W, H, S.rad(W * 0.58, H * 0.44, W * 0.85, [[0, V.sky[0]], [0.45, V.sky[1]], [1, V.sky[2]]]));
    S.sun(W * 0.6, H * 0.5, 0, { glow: 0.45, glowCol: '#FFF4DC', glowA: 0.55 });
    for (const [yy, c, b] of [[0.74, mix(V.hill, V.sky[1], 0.55), 2.5], [0.82, V.hill, 1.5]]) {
      const pts = [];
      const ph = R.range(0, 6);
      for (let s = 0; s <= 30; s++) pts.push([-0.05 * W + (1.1 * W * s) / 30, H * yy + H * 0.03 * Math.sin(s * 0.35 + ph) + H * 0.01 * Math.sin(s * 1.3)]);
      S.path(lineD(pts) + `L${n2(1.05 * W)},${n2(H + 5)}L${n2(-0.05 * W)},${n2(H + 5)}Z`, c, { filter: S.blur(b * u) });
    }
    const o = { leafDensity: 0.85, leafLen: W * 0.075, leafW: 0.15, branchP: 0.22, droop: 0.4 };
    const bg = newAcc(1);
    growBranch(S, bg, -0.05 * W, H * 0.92, -0.5, W * 0.6, 4 * u, 1, { ...o, leafLen: W * 0.12 });
    growBranch(S, bg, 1.05 * W, H * 0.98, -2.4, W * 0.5, 4 * u, 1, { ...o, leafLen: W * 0.12 });
    drawAcc(S, bg, ['#120F0A'], { filter: S.blur(4 * u), opacity: 0.95 });
    const fg = newAcc(3);
    growBranch(S, fg, -0.05 * W, H * 0.08, 0.3, W * 0.85, 3.4 * u, 2, o);
    growBranch(S, fg, 1.05 * W, H * 0.18, Math.PI - 0.25, W * 0.7, 3 * u, 2, o);
    drawAcc(S, fg, [V.leaf, mix(V.leaf, '#4E4C34', 0.45), mix(V.leaf, '#7A7656', 0.3)]);
    for (let k = 0; k < 5; k++) {
      const ox = W * R.range(0.25, 0.75), oy = H * R.range(0.12, 0.35);
      S.ellipse(ox, oy, 3.2 * u, 4.2 * u, '#2A1A16');
      S.ellipse(ox - 1 * u, oy - 1.4 * u, 0.9 * u, 1.2 * u, '#C9A27A', { opacity: 0.5 });
    }
    S.texture({ fx: 0.4, fy: 0.4, oct: 1, dark: '#000000', amount: 0 });
  } else if (V.kind === 'palm') {
    const hz = H * 0.74;
    S.rect(0, 0, W, hz + 1, S.lin(0, 0, 0, hz, [[0, V.sky[0]], [0.55, V.sky[1]], [1, V.sky[2]]]));
    S.texture({ box: [0, 0, W, hz], fx: 0.003 / u, fy: 0.03 / u, oct: 4, light: V.sky[2], dark: V.sky[0], amount: 0.25 });
    const sx = V.sun[0] * W, sy = V.sun[1] * H;
    S.sun(sx, sy, V.sun[2] * W, { glowCol: '#FFC88A', glowA: 0.9 });
    S.rect(0, hz, W, H - hz, S.lin(0, hz, 0, H, [[0, '#9A5A3A'], [0.3, '#3A2219'], [1, '#120B08']]));
    S.rect(0, hz, W, H - hz, S.radE(sx, hz, W * 0.06, (H - hz) * 0.9, 0, [[0, '#FFD39A', 0.75], [1, '#FFD39A', 0]]));
    S.rect(0, hz - 0.5 * u, W, 1.4 * u, '#FFDCA8', { opacity: 0.7, filter: S.blur(0.5 * u) });
    const palms = [
      { bx: W * R.range(0.12, 0.22), cx: W * R.range(0.3, 0.38), cy: H * R.range(0.18, 0.26), s: 1, col: V.leaf, blur: 0 },
      { bx: W * R.range(0.8, 0.9), cx: W * R.range(0.82, 0.9), cy: H * R.range(0.46, 0.52), s: 0.55, col: mix(V.leaf, V.sky[1], 0.35), blur: 0.7 },
    ];
    for (const p of palms.reverse()) {
      const acc = newAcc(1);
      const tp = [];
      for (let s = 0; s <= 16; s++) {
        const q = s / 16;
        tp.push([lerp(p.bx, p.cx, q) + Math.sin(q * 3) * W * 0.02 * p.s, lerp(H + 5, p.cy, q)]);
      }
      acc.stems.push(taperD(tp, W * 0.04 * p.s, W * 0.022 * p.s));
      const nf = R.int(11, 15);
      for (let k = 0; k < nf; k++) {
        const th = -Math.PI / 2 + (k / nf - 0.5) * Math.PI * 1.9 + R.range(-0.12, 0.12);
        const Lf = W * R.range(0.24, 0.34) * p.s;
        const droop = Math.abs(Math.cos(th)) * 0.9 + 0.15;
        const rach = [];
        for (let s = 0; s <= 20; s++) {
          const q = s / 20;
          rach.push([p.cx + Math.cos(th) * Lf * q, p.cy + Math.sin(th) * Lf * q + droop * Lf * q * q * 0.8]);
        }
        acc.stems.push(taperD(rach, 1.6 * u * p.s, 0.4 * u));
        for (let s = 3; s <= 20; s++) {
          const q = s / 20;
          const [rx, ry] = rach[s];
          const [qx, qy] = rach[s - 1];
          const dir = Math.atan2(ry - qy, rx - qx);
          const ll = Lf * 0.28 * Math.pow(Math.sin(Math.PI * Math.min(0.98, q * 0.85 + 0.1)), 0.6);
          for (const side of [-1, 1]) {
            const la = dir + side * 1.0 + 0.45 * Math.sign(Math.cos(dir) || 1) * side * 0 + 0.35;
            acc.leaves[0].push(leafD(rx, ry, la + (side > 0 ? 0 : -0.7), ll, ll * 0.09, 0.08 * side));
          }
        }
      }
      drawAcc(S, acc, [p.col], { filter: p.blur ? S.blur(p.blur * u) : undefined });
    }
  } else if (V.kind === 'grass') {
    const hy = H * 0.5;
    S.rect(0, 0, W, H, S.lin(0, 0, 0, hy, [[0, V.sky[0]], [0.7, V.sky[1]], [1, V.sky[2]]]));
    const sx = V.sun[0] * W, sy = V.sun[1] * H;
    S.sun(sx, sy, V.sun[2] * W, { glowCol: '#FFE2B0', glowA: 0.9, glow: 0.7 });
    const pts = [];
    for (let s = 0; s <= 30; s++) pts.push([-0.05 * W + (1.1 * W * s) / 30, hy - H * 0.06 * (s / 30) + H * 0.015 * Math.sin(s * 0.5)]);
    S.path(lineD(pts) + `L${n2(1.05 * W)},${n2(H + 5)}L${n2(-0.05 * W)},${n2(H + 5)}Z`, S.lin(0, hy - H * 0.06, 0, H, [[0, mix(V.hill, V.sky[2], 0.35)], [0.4, V.hill], [1, shade(V.hill, 0.6)]]), { filter: S.blur(1.6 * u) });
    S.open({ filter: S.blur(1.2 * u) });
    for (let k = 0; k < 22; k++) {
      const bx = sx + R.gauss() * W * 0.22, by = sy + Math.abs(R.gauss()) * H * 0.32, br = R.range(3, 11) * u;
      S.circle(bx, by, br, '#FFE7BC', { opacity: R.range(0.12, 0.38) });
    }
    S.close();
    const stems = newAcc(1);
    const heads = [];
    const n = Math.round(60 * (W / 320));
    for (let k = 0; k < n; k++) {
      const x0 = W * R.range(-0.05, 1.05);
      const topY = H * R.range(0.1, 0.62);
      const x1 = x0 + R.range(-0.08, 0.12) * W;
      const sp = [];
      for (let s = 0; s <= 10; s++) {
        const q = s / 10;
        sp.push([lerp(x0, x1, q * q), lerp(H + 5, topY, q)]);
      }
      stems.stems.push(taperD(sp, R.range(0.9, 1.6) * u, 0.5 * u));
      const ang = Math.atan2(sp[10][1] - sp[9][1], sp[10][0] - sp[9][0]);
      heads.push({ x: x1, y: topY, ang, len: H * R.range(0.05, 0.1), wid: W * R.range(0.012, 0.022) });
    }
    drawAcc(S, stems, ['#1E150E']);
    for (const h of heads) {
      const cxh = h.x + Math.cos(h.ang) * h.len * 0.5, cyh = h.y + Math.sin(h.ang) * h.len * 0.5;
      const rot = (h.ang * 180) / Math.PI;
      S.ellipse(cxh, cyh, h.len * 0.75, h.wid * 1.6, V.head, { opacity: 0.45, filter: S.blur(1.8 * u), transform: `rotate(${n2(rot)} ${n2(cxh)} ${n2(cyh)})` });
      const against = cyh < hy - H * 0.04;
      S.ellipse(cxh, cyh, h.len * 0.55, h.wid, against ? '#5A3C24' : '#F6D7A4', { opacity: 0.9, filter: S.blur(0.6 * u), transform: `rotate(${n2(rot)} ${n2(cxh)} ${n2(cyh)})` });
    }
    const fgs = newAcc(1);
    for (let k = 0; k < 6; k++) {
      const x0 = W * R.range(-0.1, 1.1);
      fgs.stems.push(taperD([[x0, H + 10], [x0 + R.range(-0.1, 0.1) * W, H * R.range(0.45, 0.8)]], 4 * u, 1.5 * u));
    }
    drawAcc(S, fgs, ['#120C08'], { filter: S.blur(3 * u) });
  } else if (V.kind === 'tree') {
    const hz = H * 0.66;
    S.rect(0, 0, W, hz + 1, S.lin(0, 0, 0, hz, [[0, V.sky[0]], [0.55, V.sky[1]], [1, V.sky[2]]]));
    S.texture({ box: [0, 0, W, hz], fx: 0.004 / u, fy: 0.03 / u, oct: 4, light: V.sky[2], dark: V.sky[0], amount: 0.22 });
    const tx = W * R.range(0.42, 0.58);
    S.sun(tx + W * 0.12, hz - H * 0.22, 0, { glowCol: '#FFF0D2', glowA: 0.8, glow: 0.5 });
    S.path(`M${-5},${n2(hz + 1)}` + crSeg([[-5, hz + 1], [W * 0.3, hz - H * 0.03], [W * 0.7, hz - H * 0.01], [W + 5, hz - H * 0.04]]) + `L${W + 5},${n2(hz + 2)}Z`, mix('#7C6A50', V.sky[2], 0.4), { filter: S.blur(1.5 * u) });
    S.rect(-2, hz, W + 4, H - hz + 2, S.lin(0, hz, 0, H, [[0, V.field[0]], [1, V.field[1]]]));
    S.open({ opacity: 0.25 });
    for (let k = -12; k <= 12; k++) S.stroke(lineD([[W * 0.5 + k * W * 0.012, hz], [W * 0.5 + k * W * 0.16, H + 5]]), '#3A2416', 1.4 * u);
    S.close();
    S.texture({ box: [0, hz, W, H - hz], fx: 0.02 / u, fy: 0.08 / u, dark: V.field[1], light: V.sky[2], amount: 0.3 });
    const gy = hz + H * 0.08;
    S.ellipse(tx, gy, W * 0.24, H * 0.018, '#1A120C', { opacity: 0.55, filter: S.blur(2 * u) });
    const acc = newAcc(3);
    const trunk = [];
    for (let s = 0; s <= 10; s++) {
      const q = s / 10;
      trunk.push([tx + Math.sin(q * 4) * W * 0.012, lerp(gy, gy - H * 0.2, q)]);
    }
    acc.stems.push(taperD(trunk, W * 0.05, W * 0.022));
    const ccx = tx, ccy = gy - H * 0.33;
    for (let k = 0; k < 4; k++) growBranch(S, acc, trunk[10][0], trunk[10][1], -Math.PI / 2 + (k - 1.5) * 0.55, W * R.range(0.14, 0.2), 2.4 * u, 1, { leafDensity: 0.3, leafLen: W * 0.03, leafW: 0.18, branchP: 0.4 });
    const nc = 13;
    for (let c = 0; c < nc; c++) {
      const a = (c / nc) * Math.PI * 2;
      const kx = ccx + Math.cos(a) * W * R.range(0.08, 0.22), ky = ccy + Math.sin(a) * H * R.range(0.04, 0.11);
      const nl = Math.round(70 * Math.sqrt(W / 320));
      for (let k = 0; k < nl; k++) {
        const lx = kx + R.gauss() * W * 0.045, ly = ky + R.gauss() * H * 0.03;
        acc.leaves[k % 3].push(leafD(lx, ly, R.range(0, 6.28), W * R.range(0.016, 0.026), W * 0.005));
      }
    }
    drawAcc(S, acc, [V.leaf, mix(V.leaf, '#3E3C2A', 0.5), mix(V.leaf, '#5A5638', 0.3)]);
    const fg = newAcc(1);
    for (let k = 0; k < 26; k++) {
      const x0 = W * R.range(-0.05, 1.05);
      fg.stems.push(taperD([[x0, H + 5], [x0 + R.range(-0.04, 0.04) * W, H * R.range(0.82, 0.92)]], 1.6 * u, 0.4 * u));
    }
    drawAcc(S, fg, ['#2A1A10'], { filter: S.blur(1.2 * u) });
  }
}

/* ------------------------------------------------------------------------ */
/* Period, portrait                                                         */
/* ------------------------------------------------------------------------ */

function scenePeriod(S) {
  const { W, H, R, u } = S;
  const cx = W / 2, cy = H / 2, r = W * 0.27;
  S.rect(0, 0, W, H, S.rad(cx, cy, W * 0.78, [[0, '#7C4026'], [0.32, '#4C2817'], [0.68, '#2A1810'], [1, '#170E09']]));
  S.texture({ fx: 0.003 / u, fy: 0.03 / u, oct: 4, light: '#C27046', dark: '#140C08', amount: 0.25 });
  S.circle(cx, cy, W * 0.7, S.rad(cx, cy, W * 0.7, [[0, '#F7A35E', 0.75], [0.3, '#E07A42', 0.4], [0.6, '#B0522E', 0.12], [1, '#7A3A20', 0]]));
  S.circle(cx, cy, r, S.rad(cx, cy, r, [[0, '#FFFBF0'], [0.38, '#FFF0D2'], [0.62, '#FBD39A'], [0.84, '#EE9A58'], [0.97, '#D06E3C'], [1, '#C0603A', 0.7]]), { filter: S.blur(0.7 * u) });
  // thin strata crossing the disc
  for (const [yy, a, th] of [[0.62, 0.35, 3.5], [0.69, 0.5, 5], [0.38, 0.12, 2.5]]) S.rect(-5, H * yy, W + 10, th * u, '#5A2A18', { opacity: a, filter: S.blur(2.4 * u) });
  const pts = [];
  const ph = R.range(0, 6);
  for (let s = 0; s <= 40; s++) pts.push([-0.05 * W + (1.1 * W * s) / 40, H * 0.82 - H * 0.03 * Math.sin(s * 0.16 + ph) - H * 0.012 * Math.sin(s * 0.5)]);
  const d = lineD(pts) + `L${n2(1.05 * W)},${n2(H + 5)}L${n2(-0.05 * W)},${n2(H + 5)}Z`;
  S.path(d, S.lin(0, H * 0.78, 0, H, [[0, '#2A170E'], [1, '#0E0805']]));
  S.stroke(lineD(pts), '#FFB070', 1.4 * u, { opacity: 0.55, filter: S.blur(0.6 * u), 'clip-path': S.clip(d) });
  S.rect(0, H * 0.74, W, H * 0.12, S.lin(0, H * 0.74, 0, H * 0.86, [[0, '#E08A52', 0], [0.6, '#E08A52', 0.3], [1, '#E08A52', 0]]), { filter: S.blur(4 * u) });
}

function scenePortrait(S) {
  const { W, H, u } = S;
  S.rect(0, 0, W, H, S.rad(W * 0.26, H * 0.2, Math.hypot(W, H) * 0.85, [[0, '#DDBF98'], [0.45, '#B48C66'], [1, '#5A3F2E']]));
  S.texture({ fx: 0.011 / u, fy: 0.012 / u, oct: 4, dark: '#6A4A36', light: '#F2DCBC', amount: 0.3 });
  // window light patch with mullions
  const lp = [[W * 0.04, H * 0.06], [W * 0.46, H * 0.1], [W * 0.46, H * 0.62], [W * 0.04, H * 0.58]];
  S.path(polyD(lp), '#FFF0D6', { opacity: 0.4, filter: S.blur(9 * u) });
  S.path(polyD([[W * 0.24, H * 0.07], [W * 0.27, H * 0.08], [W * 0.27, H * 0.62], [W * 0.24, H * 0.6]]), '#6A4A36', { opacity: 0.25, filter: S.blur(3 * u) });
  const hx = W * 0.52, hy = H * 0.34, hrx = W * 0.15, hry = W * 0.2;
  const neckT = hy + hry * 0.62, neckB = H * 0.66;
  const neck = polyD([[hx - W * 0.062, neckT], [hx + W * 0.058, neckT], [hx + W * 0.075, neckB], [hx - W * 0.08, neckB]]);
  const shoulders = `M${n2(-0.02 * W)},${n2(H + 5)}L${n2(0.02 * W)},${n2(H * 0.86)}C${n2(0.06 * W)},${n2(H * 0.74)} ${n2(hx - W * 0.2)},${n2(H * 0.67)} ${n2(hx - W * 0.08)},${n2(H * 0.645)}L${n2(hx + W * 0.08)},${n2(H * 0.645)}C${n2(hx + W * 0.2)},${n2(H * 0.67)} ${n2(0.94 * W)},${n2(H * 0.74)} ${n2(0.98 * W)},${n2(H * 0.86)}L${n2(1.02 * W)},${n2(H + 5)}Z`;
  const head = `M${n2(hx - hrx)},${n2(hy)}a${n2(hrx)},${n2(hry)} 0 1 0 ${n2(2 * hrx)},0a${n2(hrx)},${n2(hry)} 0 1 0 ${n2(-2 * hrx)},0Z`;
  // cast shadow on the wall
  S.open({ transform: `translate(${n2(W * 0.09)} ${n2(H * 0.025)})`, filter: S.blur(16 * u), opacity: 0.5 });
  for (const d of [shoulders, neck]) S.path(d, '#2A1A12');
  S.ellipse(hx, hy, hrx, hry, '#2A1A12', { transform: `rotate(-6 ${n2(hx)} ${n2(hy)})` });
  S.close();
  const pl = '#E9DDC9';
  S.path(shoulders, S.lin(0, 0, W, 0, [[0, '#EFE4D2'], [0.38, '#D5C6AE'], [0.7, '#9C8A72'], [1, '#6E5E4C']]));
  S.path(shoulders, S.lin(0, H * 0.64, 0, H, [[0, '#FFF6E8', 0.15], [0.3, '#000', 0], [1, '#000', 0.35]]));
  const sc = S.clip(shoulders);
  S.ellipse(hx + W * 0.03, H * 0.665, W * 0.17, H * 0.03, '#3A2A1E', { opacity: 0.45, filter: S.blur(6 * u), 'clip-path': sc });
  S.path(neck, S.lin(hx - W * 0.08, 0, hx + W * 0.08, 0, [[0, '#E6D9C3'], [0.35, '#D2C2AA'], [0.75, '#8E7C66'], [1, '#7A6A56']]));
  S.ellipse(hx + W * 0.01, neckT + H * 0.01, W * 0.08, H * 0.035, '#3A2A1E', { opacity: 0.55, filter: S.blur(5 * u), 'clip-path': S.clip(neck) });
  S.add(`<g transform="rotate(-6 ${n2(hx)} ${n2(hy)})">`);
  S.path(head, S.rad(hx - hrx * 0.1, hy, hry * 1.25, [[0, '#F6EEDF'], [0.35, pl], [0.68, '#B4A28A'], [0.86, '#8A7862'], [1, '#9C8A72']], hx - hrx * 0.45, hy - hry * 0.4));
  const hc = S.clip(head);
  S.ellipse(hx + hrx * 0.9, hy + hry * 0.4, hrx * 0.5, hry * 0.7, '#C9A47E', { opacity: 0.25, filter: S.blur(8 * u), 'clip-path': hc });
  S.texture({ clip: hc, box: [hx - hrx, hy - hry, hrx * 2, hry * 2], fx: 0.05, fy: 0.05, oct: 3, dark: '#8A7862', light: '#FFFFFF', amount: 0.15 });
  S.close();
  S.texture({ clip: sc, box: [0, H * 0.6, W, H * 0.4], fx: 0.04, fy: 0.04, oct: 3, dark: '#7A6A56', light: '#FFFFFF', amount: 0.15 });
}

/* ------------------------------------------------------------------------ */
/* Pixel pipeline                                                           */
/* ------------------------------------------------------------------------ */

async function rasterize(svg, W, H, ss) {
  const { data, info } = await sharp(Buffer.from(svg), { limitInputPixels: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== W * ss || info.height !== H * ss) throw new Error(`raster ${info.width}x${info.height} != ${W * ss}x${H * ss}`);
  const n = W * H;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  const sw = W * ss;
  const inv = 1 / (ss * ss);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let j = 0; j < ss; j++) {
        let o = ((y * ss + j) * sw + x * ss) * 3;
        for (let i = 0; i < ss; i++, o += 3) {
          sr += SRGB2LIN[data[o]];
          sg += SRGB2LIN[data[o + 1]];
          sb += SRGB2LIN[data[o + 2]];
        }
      }
      const k = y * W + x;
      r[k] = sr * inv;
      g[k] = sg * inv;
      b[k] = sb * inv;
    }
  }
  return { W, H, r, g, b };
}

function boxesForGauss(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}
function boxH(src, dst, W, H, r) {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + clamp(k, 0, W - 1)];
    for (let x = 0; x < W; x++) {
      dst[row + x] = acc * iarr;
      acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
}
function boxV(src, dst, W, H, r) {
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[clamp(k, 0, H - 1) * W + x];
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = acc * iarr;
      acc += src[Math.min(H - 1, y + r + 1) * W + x] - src[Math.max(0, y - r) * W + x];
    }
  }
}
function gaussBlur(src, W, H, sigma) {
  const a = Float32Array.from(src);
  const t = new Float32Array(src.length);
  for (const bx of boxesForGauss(sigma)) {
    const r = (bx - 1) / 2;
    if (r < 1) continue;
    boxH(a, t, W, H, r);
    boxV(t, a, W, H, r);
  }
  return a;
}
/** Separable 3-tap [a, 1-2a, a] softening. */
function soften(p, W, H, a) {
  const t = new Float32Array(p.length);
  const c = 1 - 2 * a;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) t[row + x] = c * p[row + x] + a * (p[row + Math.max(0, x - 1)] + p[row + Math.min(W - 1, x + 1)]);
  }
  for (let y = 0; y < H; y++) {
    const up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W, row = y * W;
    for (let x = 0; x < W; x++) p[row + x] = c * t[row + x] + a * (t[up + x] + t[dn + x]);
  }
}
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function preprocess(img, P) {
  const { W, H, r, g, b } = img;
  const n = W * H;
  // bloom / halation: two scales of the highlights, tinted warm
  const hp = new Float32Array(n);
  for (let i = 0; i < n; i++) hp[i] = Math.max(0, lum(r[i], g[i], b[i]) - P.bloomThr);
  const m = Math.min(W, H);
  const b1 = gaussBlur(hp, W, H, m * 0.012);
  const b2 = gaussBlur(hp, W, H, m * 0.05);
  const tintC = [1.0, 0.78, 0.52];
  for (let i = 0; i < n; i++) {
    const v = (b1[i] * 0.55 + b2[i] * 0.45) * P.bloom;
    r[i] += v * tintC[0];
    g[i] += v * tintC[1];
    b[i] += v * tintC[2];
  }
  for (const p of [r, g, b]) soften(p, W, H, P.soft);
  // vignette
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5) / W - 0.5, dy = (y + 0.5) / H - 0.5;
      const rr = Math.sqrt(dx * dx + dy * dy) / 0.7071;
      const v = 1 - P.vignette * Math.pow(rr, 2.3);
      const i = y * W + x;
      r[i] *= v;
      g[i] *= v;
      b[i] *= v;
    }
  }
  return img;
}

function toneY(Y, p) {
  let t = (Y - p.b) / (p.w - p.b);
  if (t <= 0) return 0;
  t = Math.pow(t, p.g);
  return t > 0.8 ? 0.8 + 0.2 * (1 - Math.exp(-(t - 0.8) / 0.2)) : t;
}
function toneRGB(r, g, b, p, out) {
  const Y = lum(r, g, b);
  if (Y < 1e-7) {
    out[0] = out[1] = out[2] = 0;
    return 0;
  }
  const Yt = toneY(Y, p);
  const k = Yt / Y;
  let R = r * k, G = g * k, B = b * k;
  const mx = Math.max(R, G, B);
  if (mx > 1) {
    if (Yt >= 1) R = G = B = 1;
    else {
      const s = (1 - Yt) / (mx - Yt);
      R = Yt + (R - Yt) * s;
      G = Yt + (G - Yt) * s;
      B = Yt + (B - Yt) * s;
    }
  }
  out[0] = R;
  out[1] = G;
  out[2] = B;
  return Yt;
}

function makeProxy(img, P = 128) {
  const { W, H, r, g, b } = img;
  const pr = new Float32Array(P * P), pg = new Float32Array(P * P), pb = new Float32Array(P * P), cnt = new Float32Array(P * P);
  for (let y = 0; y < H; y++) {
    const py = Math.min(P - 1, Math.floor((y * P) / H));
    for (let x = 0; x < W; x++) {
      const px = Math.min(P - 1, Math.floor((x * P) / W));
      const i = py * P + px, k = y * W + x;
      pr[i] += r[k];
      pg[i] += g[k];
      pb[i] += b[k];
      cnt[i]++;
    }
  }
  for (let i = 0; i < P * P; i++) {
    pr[i] /= cnt[i];
    pg[i] /= cnt[i];
    pb[i] /= cnt[i];
  }
  return { P, r: pr, g: pg, b: pb };
}
function proxyMean(px, p) {
  let s = 0;
  const o = [0, 0, 0];
  for (let i = 0; i < px.r.length; i++) s += toneRGB(px.r[i], px.g[i], px.b[i], p, o);
  return s / px.r.length;
}
/** Emulates the 32x32 (sRGB-space) thumbnail and returns darkest / brightest 4x4 block luminance. */
function proxyBlocks(px, p) {
  const P = px.P;
  const s = P / 32;
  const tr = new Float32Array(1024), tg = new Float32Array(1024), tb = new Float32Array(1024);
  const o = [0, 0, 0];
  for (let i = 0; i < P * P; i++) {
    toneRGB(px.r[i], px.g[i], px.b[i], p, o);
    const x = i % P, y = (i / P) | 0;
    const t = ((y / s) | 0) * 32 + ((x / s) | 0);
    tr[t] += toSrgb(o[0]);
    tg[t] += toSrgb(o[1]);
    tb[t] += toSrgb(o[2]);
  }
  return blocksFromThumb((i) => [tr[i] / (s * s), tg[i] / (s * s), tb[i] / (s * s)]);
}
function blocksFromThumb(get) {
  let dark = 1, bright = 0;
  for (let by = 0; by < 8; by++)
    for (let bx = 0; bx < 8; bx++) {
      let sY = 0;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const [R, G, B] = get((by * 4 + y) * 32 + bx * 4 + x);
          sY += lum(toLin(R), toLin(G), toLin(B));
        }
      sY /= 16;
      dark = Math.min(dark, sY);
      bright = Math.max(bright, sY);
    }
  return { dark, bright };
}

/** Finds black point b, white point w and gamma g hitting the target mean (and the light/dark split). */
function searchTone(px, target, needSplit) {
  const combos = [];
  for (const b of [0, 0.004, 0.01, 0.02, 0.035]) for (const w of [1, 0.88, 0.76, 0.64, 0.52]) combos.push({ b, w, cost: b * 12 + (1 - w) * 2 });
  combos.sort((a, b) => a.cost - b.cost);
  let best = null;
  for (const c of combos) {
    let lo = 0.4, hi = 3.2;
    for (let it = 0; it < 26; it++) {
      const mid = (lo + hi) / 2;
      if (proxyMean(px, { ...c, g: mid }) > target) lo = mid;
      else hi = mid;
    }
    const p = { b: c.b, w: c.w, g: (lo + hi) / 2 };
    const m = proxyMean(px, p);
    if (Math.abs(m - target) > 0.01) continue;
    const gPenalty = p.g < 0.55 || p.g > 2.6 ? 1 : 0;
    if (!needSplit) {
      if (!gPenalty) return { ...p, dark: 0, bright: 1, ok: true };
      if (!best) best = { ...p, dark: 0, bright: 1, ok: false, slack: -1 };
      continue;
    }
    const bl = proxyBlocks(px, p);
    const slack = Math.min(0.045 - bl.dark, bl.bright - 0.57);
    if (slack >= 0 && !gPenalty) return { ...p, ...bl, ok: true };
    if (!best || slack > best.slack) best = { ...p, ...bl, ok: false, slack };
  }
  return best ?? { b: 0, w: 1, g: 1, ok: false };
}

function finish(img, tp, P, grainSeed, grainAmt) {
  const { W, H, r, g, b } = img;
  const n = W * H;
  const out = new Uint8Array(n * 3);
  const R = makeRng(grainSeed);
  // grain: per-pixel gaussian, clumped (low-frequency) with a small blur, plus a half-res layer
  const g1 = new Float32Array(n);
  for (let i = 0; i < n; i++) g1[i] = R.gauss();
  soften(g1, W, H, 0.25);
  const hw = Math.ceil(W / 2), hh = Math.ceil(H / 2);
  const g2 = new Float32Array(hw * hh);
  for (let i = 0; i < g2.length; i++) g2[i] = R.gauss();
  soften(g2, hw, hh, 0.2);
  const gr = new Float32Array(n);
  let sq = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fx = Math.min(hw - 1.001, x / 2), fy = Math.min(hh - 1.001, y / 2);
      const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
      const v2 = (g2[y0 * hw + x0] * (1 - ax) + g2[y0 * hw + x0 + 1] * ax) * (1 - ay) + (g2[(y0 + 1) * hw + x0] * (1 - ax) + g2[(y0 + 1) * hw + x0 + 1] * ax) * ay;
      const v = g1[y * W + x] * 0.6 + v2 * 0.8;
      gr[y * W + x] = v;
      sq += v * v;
    }
  const gs = 1 / Math.sqrt(sq / n);
  const o = [0, 0, 0];
  const lift = [0.032, 0.024, 0.018];
  const cap = [1, 0.985, 0.95];
  for (let i = 0; i < n; i++) {
    toneRGB(r[i], g[i], b[i], tp, o);
    let R0 = toSrgb(o[0]), G0 = toSrgb(o[1]), B0 = toSrgb(o[2]);
    const l = 0.2126 * R0 + 0.7152 * G0 + 0.0722 * B0;
    // gentle desaturation + warm split tone
    const sat = P.sat;
    R0 = l + (R0 - l) * sat;
    G0 = l + (G0 - l) * sat;
    B0 = l + (B0 - l) * sat;
    const sh = (1 - l) * (1 - l), hl = l * l;
    R0 += 0.016 * sh + 0.01 * hl;
    G0 += 0.004 * sh + 0.004 * hl;
    B0 += -0.014 * sh - 0.012 * hl;
    // matte warm black, cream white
    R0 = lift[0] + R0 * (cap[0] - lift[0]);
    G0 = lift[1] + G0 * (cap[1] - lift[1]);
    B0 = lift[2] + B0 * (cap[2] - lift[2]);
    const gw = grainAmt * (0.35 + 0.65 * 4 * l * (1 - l)) * gr[i] * gs;
    out[i * 3] = clamp(Math.round((R0 + gw) * 255), 0, 255);
    out[i * 3 + 1] = clamp(Math.round((G0 + gw * 0.97) * 255), 0, 255);
    out[i * 3 + 2] = clamp(Math.round((B0 + gw * 0.92) * 255), 0, 255);
  }
  return out;
}

async function encode(u8, W, H, q) {
  return sharp(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength), { raw: { width: W, height: H, channels: 3 } })
    .webp({ quality: q, effort: 6, smartSubsample: true })
    .toBuffer();
}
async function measure(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let s = 0, sr = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    s += lum(SRGB2LIN[data[i * 3]], SRGB2LIN[data[i * 3 + 1]], SRGB2LIN[data[i * 3 + 2]]);
    sr += data[i * 3];
    sb += data[i * 3 + 2];
  }
  const th = await sharp(buf).resize(32, 32, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const bl = blocksFromThumb((i) => [th[i * 3] / 255, th[i * 3 + 1] / 255, th[i * 3 + 2] / 255]);
  return { meanY: s / n, ...bl, warmth: (sr - sb) / n / 255, w: info.width, h: info.height };
}

/* ------------------------------------------------------------------------ */
/* Jobs                                                                     */
/* ------------------------------------------------------------------------ */

const FAMILIES = [
  { name: 'dunes', fn: sceneDunes, target: 0.165 },
  { name: 'coast', fn: sceneCoast, target: 0.155 },
  { name: 'architecture', fn: sceneArch, target: 0.175 },
  { name: 'still life', fn: sceneStill, target: 0.12 },
  { name: 'botanical', fn: sceneBotanical, target: 0.15 },
  { name: 'interiors', fn: sceneInterior, target: 0.13 },
];
const POST = {
  tile: { ss: 2, bloom: 0.55, bloomThr: 0.45, soft: 0.1, vignette: 0.3, sat: 0.92, grain: 0.022, cap: 22 * 1024, split: true },
  period: { ss: 2, bloom: 0.7, bloomThr: 0.5, soft: 0.08, vignette: 0.28, sat: 0.95, grain: 0.018, cap: 40 * 1024, split: true },
  print: { ss: 2, bloom: 0.5, bloomThr: 0.45, soft: 0.08, vignette: 0.28, sat: 0.92, grain: 0.016, cap: 80 * 1024, split: true },
  work: { ss: 1, bloom: 0.35, bloomThr: 0.55, soft: 0.1, vignette: 0.16, sat: 0.9, grain: 0.012, cap: 160 * 1024, split: false },
  portrait: { ss: 1, bloom: 0.25, bloomThr: 0.6, soft: 0.1, vignette: 0.22, sat: 0.88, grain: 0.012, cap: 140 * 1024, split: false },
};

const JOBS = [];
for (let n = 1; n <= 24; n++) {
  const fam = (n - 1) % 6, variant = Math.floor((n - 1) / 6);
  const F = FAMILIES[fam];
  const name = `t${String(n).padStart(2, '0')}`;
  JOBS.push({ name, file: `tiles/${name}.webp`, W: 320, H: 320, kind: 'tile', label: `${F.name} ${variant + 1}`, target: F.target + [0, 0.012, -0.01, 0.006][variant], draw: (S) => F.fn(S, variant) });
}
JOBS.push({ name: 'period', file: 'period.webp', W: 512, H: 512, kind: 'period', label: 'sun disc', target: 0.17, draw: scenePeriod });
JOBS.push({ name: 'print-01', file: 'print-01.webp', W: 960, H: 640, kind: 'print', label: 'dune landscape', target: 0.17, draw: (S) => sceneDunes(S, 'print') });
JOBS.push({ name: 'print-02', file: 'print-02.webp', W: 640, H: 800, kind: 'print', label: 'arches', target: 0.18, draw: (S) => sceneArch(S, 'print') });
JOBS.push({ name: 'print-03', file: 'print-03.webp', W: 720, H: 720, kind: 'print', label: 'still life', target: 0.14, draw: (S) => sceneStill(S, 'print') });
JOBS.push({ name: 'work-01', file: 'work-01.webp', W: 1600, H: 1000, kind: 'work', label: 'desk still life', target: 0.34, draw: (S) => sceneStill(S, 'desk') });
JOBS.push({ name: 'work-02', file: 'work-02.webp', W: 1600, H: 1000, kind: 'work', label: 'plaster niche', target: 0.38, draw: (S) => sceneArch(S, 'detail') });
JOBS.push({ name: 'work-03', file: 'work-03.webp', W: 1600, H: 1000, kind: 'work', label: 'hazy dunes', target: 0.36, draw: (S) => sceneDunes(S, 'soft') });
JOBS.push({ name: 'work-04', file: 'work-04.webp', W: 1600, H: 1000, kind: 'work', label: 'sunlit room', target: 0.3, draw: (S) => sceneInterior(S, 'bright') });
JOBS.push({ name: 'portrait', file: 'portrait.webp', W: 960, H: 1200, kind: 'portrait', label: 'plaster bust', target: 0.32, draw: scenePortrait });

async function build(job) {
  const P = POST[job.kind];
  let best = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const seed = (hash(job.name) ^ Math.imul(attempt, 0x9e3779b1)) >>> 0;
    const S = new Scene(job.W, job.H, makeRng(seed));
    job.draw(S);
    const img = preprocess(await rasterize(S.svg(P.ss), job.W, job.H, P.ss), P);
    const px = makeProxy(img);
    let target = job.target;
    let tp, buf, m;
    for (let it = 0; it < 3; it++) {
      tp = searchTone(px, target, P.split);
      buf = await encode(finish(img, tp, P, seed + 1, P.grain), job.W, job.H, 72);
      m = await measure(buf);
      if (Math.abs(m.meanY - job.target) < 0.006) break;
      target = clamp(target + (job.target - m.meanY), 0.02, 0.8);
    }
    const splitOk = !P.split || (m.dark < 0.06 && m.bright > 0.5);
    const slack = P.split ? Math.min(0.06 - m.dark, m.bright - 0.5) : 1;
    const cand = { seed, img, tp, buf, m, splitOk, slack, attempt };
    if (!best || (cand.splitOk && !best.splitOk) || (cand.splitOk === best.splitOk && cand.slack > best.slack)) best = cand;
    if (splitOk) break;
  }
  // byte cap: lower quality first, then calmer grain
  let q = 72, grainK = 1;
  const ladder = [[72, 1], [66, 1], [60, 1], [66, 0.5], [58, 0.5], [52, 0.5], [50, 0.25], [44, 0.25]];
  for (const [qq, gk] of ladder) {
    q = qq;
    grainK = gk;
    if (qq !== 72 || gk !== 1) best.buf = await encode(finish(best.img, best.tp, P, best.seed + 1, P.grain * gk), job.W, job.H, qq);
    if (best.buf.length <= P.cap) break;
  }
  best.m = await measure(best.buf);
  const file = path.join(OUT, job.file);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, best.buf);
  return { job, ...best, q, grainK, bytes: best.buf.length, cap: P.cap, file };
}

/* ------------------------------------------------------------------------ */
/* Contact sheets (QA)                                                      */
/* ------------------------------------------------------------------------ */

const PAPER = { r: 0xf7, g: 0xf3, b: 0xec };
async function sheet(file, items, cell, cols, gap, h = cell) {
  const rows = Math.ceil(items.length / cols);
  const Wd = cols * cell + (cols + 1) * gap, Hd = rows * h + (rows + 1) * gap;
  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const input = await sharp(items[i]).resize(cell, h, { fit: 'cover' }).toBuffer();
    comps.push({ input, left: gap + (i % cols) * (cell + gap), top: gap + Math.floor(i / cols) * (h + gap) });
  }
  await sharp({ create: { width: Wd, height: Hd, channels: 3, background: PAPER } }).composite(comps).png().toFile(file);
}
async function lettersSheet(file, tiles, period) {
  const cols = 64, rows = 9;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols}" height="${rows}"><rect width="${cols}" height="${rows}" fill="#000"/><text x="1" y="8" font-family="Georgia, 'Times New Roman', serif" font-size="10.5" fill="#fff">Meet Suren</text></svg>`;
  const { data } = await sharp(Buffer.from(svg)).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const cell = 14, gap = 2;
  const Wd = cols * (cell + gap) + 40, Hd = rows * (cell + gap) + 20;
  const comps = [];
  let k = 0, maxX = 0;
  const small = await Promise.all(tiles.map((t) => sharp(t).resize(cell, cell).toBuffer()));
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (data[y * cols + x] > 110) {
        comps.push({ input: small[(k * 7) % small.length], left: 10 + x * (cell + gap), top: 10 + y * (cell + gap) });
        k++;
        maxX = Math.max(maxX, x);
      }
    }
  const pc = cell * 2 + gap;
  comps.push({ input: await sharp(period).resize(pc, pc).toBuffer(), left: 10 + (maxX + 2) * (cell + gap), top: 10 + (rows - 3) * (cell + gap) });
  await sharp({ create: { width: Wd, height: Hd, channels: 3, background: PAPER } }).composite(comps).png().toFile(file);
  return k;
}

async function main() {
  const t0 = Date.now();
  const jobs = ONLY ? JOBS.filter((j) => ONLY.includes(j.name)) : JOBS;
  const results = [];
  for (const job of jobs) {
    const t = Date.now();
    const r = await build(job);
    results.push(r);
    const m = r.m;
    const flags = [];
    if (POST[job.kind].split && !(m.dark < 0.06 && m.bright > 0.5)) flags.push('SPLIT');
    if (r.bytes > r.cap) flags.push('BYTES');
    if ((job.kind === 'tile' || job.kind === 'period' || job.kind === 'print') && (m.meanY < 0.09 || m.meanY > 0.26)) flags.push('MEAN');
    if ((job.kind === 'work' || job.kind === 'portrait') && (m.meanY < 0.25 || m.meanY > 0.45)) flags.push('MEAN');
    r.flags = flags;
    console.log(
      `${job.name.padEnd(9)} ${`${m.w}x${m.h}`.padEnd(10)} ${String((r.bytes / 1024).toFixed(1) + 'KB').padStart(8)} Y=${m.meanY.toFixed(3)} dark=${m.dark.toFixed(3)} bright=${m.bright.toFixed(3)} warm=${m.warmth.toFixed(3)} q${r.q}${r.grainK < 1 ? ` grain*${r.grainK}` : ''} try${r.attempt} ${job.label} ${flags.length ? '!! ' + flags.join(',') : 'ok'} (${Date.now() - t}ms)`,
    );
  }
  const tiles = results.filter((r) => r.job.kind === 'tile');
  if (tiles.length) {
    const mean = tiles.reduce((s, r) => s + r.m.meanY, 0) / tiles.length;
    console.log(`tiles: set mean Y=${mean.toFixed(3)} (rule <= 0.20) ${mean <= 0.2 ? 'ok' : '!! MEAN'}`);
    if (mean > 0.2) process.exitCode = 1;
  }
  const cool = results.filter((r) => r.m.warmth < 0.03).map((r) => r.job.name);
  console.log(`cool-toned images: ${cool.length} ${cool.join(' ')} (rule <= 5)`);
  const bad = results.filter((r) => r.flags.length);
  if (bad.length) {
    console.log(`FAILED rules: ${bad.map((r) => `${r.job.name}[${r.flags}]`).join(' ')}`);
    process.exitCode = 1;
  }
  if (SHEETS) {
    await mkdir(SHEETS, { recursive: true });
    const byName = Object.fromEntries(results.map((r) => [r.job.name, r.buf]));
    const tb = JOBS.filter((j) => j.kind === 'tile' && byName[j.name]).map((j) => byName[j.name]);
    if (tb.length) {
      await sheet(path.join(SHEETS, 'tiles-160.png'), tb, 160, 6, 8);
      await sheet(path.join(SHEETS, 'tiles-40.png'), tb, 40, 6, 4);
      await sheet(path.join(SHEETS, 'tiles-12.png'), tb, 12, 6, 2);
      if (byName.period && tb.length === 24) console.log('letters cells:', await lettersSheet(path.join(SHEETS, 'letters-14.png'), tb, byName.period));
    }
    const big = ['period', 'print-01', 'print-02', 'print-03'].filter((n) => byName[n]).map((n) => byName[n]);
    if (big.length) await sheet(path.join(SHEETS, 'prints.png'), big, 400, 2, 10, 400);
    const work = ['work-01', 'work-02', 'work-03', 'work-04', 'portrait'].filter((n) => byName[n]).map((n) => byName[n]);
    if (work.length) await sheet(path.join(SHEETS, 'work.png'), work, 420, 3, 10, 300);
    console.log(`contact sheets -> ${SHEETS}`);
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
