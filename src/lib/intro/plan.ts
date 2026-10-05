/**
 * The intro planner.
 *
 * Given the measured layout (viewport, mosaic position, every tile slot), it computes
 * the full flight of every print as a deterministic function of time and compiles it
 * into Web Animations keyframes. Nothing here touches the DOM.
 *
 * Choreography (seconds):
 *   0.10–2.4  four ribbons of prints wind in from off-screen (and out of a warm haze)
 *             while a few large prints drift past close to the camera
 *   1.1–2.5   the ribbons merge into one tilted vortex that tightens and speeds up
 *   2.5–2.86  the vortex inhales, then whips; loose prints are flung out past the lens
 *   2.8–3.5   the storm bursts outward into a slow orbit that frames the empty word
 *   3.55–4.5  "Meet" is written: prints peel off, hover, and fall into their slots in
 *             pen-stroke order, letter by letter
 *   ~4.7–5.8  after a breath, "Suren" follows the same way, left to right
 *   T_P       the full stop rises, hangs, and drops hard; the table dips and a ripple
 *             of light runs through the word; the camera settles flat
 *
 * Space: board coordinates are pixels relative to the mosaic centre C, x right, y down,
 * z toward the viewer. The stage projects with perspective P from C.
 */

import {
  DEG,
  bump,
  clamp,
  cubicHermite,
  damped,
  hashSeed,
  integrate,
  lerp,
  mulberry32,
  pchip,
  quintic,
  smootherstep,
  smoothstep,
  type Vec3,
} from "./math";

export type FrameSlot = {
  order: number;
  /** Tile centre relative to C (px). */
  x: number;
  y: number;
  /** Tile size (px). */
  size: number;
  span: 1 | 2;
  glyph: number;
  line: number;
  img: string;
  focal?: string;
};

export type Frame = {
  /** Viewport size (layout width without scrollbar). */
  W: number;
  H: number;
  /** Mosaic centre in viewport coordinates. */
  Cx: number;
  Cy: number;
  /** Pitch, gap and tile size of the mosaic grid. */
  p: number;
  g: number;
  s: number;
  /** Mosaic half extents. */
  wm: number;
  hm: number;
  slots: FrameSlot[];
  tileImages: string[];
  heroPrints: { src: string; aspect: number }[];
  seed: number;
};

/** Opacity is omitted for the camera: animating it would flatten the 3D context. */
export type Keyframe = { offset: number; transform: string; opacity?: number };

export type PlanElement = {
  kind: "tile" | "period" | "decoy";
  /** Landing slot (order index), or -1 for prints that never land. */
  slot: number;
  /** Layout box (px); the element is centred on the camera origin. */
  w: number;
  h: number;
  img: string;
  focal?: string;
  /** Paper mat width (px) for loose prints; 0 for tiles. */
  mat: number;
  frames: Keyframe[];
};

export type Plan = {
  P: number;
  /** Timeline length (s); the intro is "done" at the end. */
  duration: number;
  /** Full-stop impact time (s). */
  tP: number;
  elements: PlanElement[];
  shadows: Keyframe[][];
  cam: Keyframe[];
  plate: Keyframe[];
  /** Time (s) at which each slot's static tile takes over from its print. */
  handoff: number[];
  /** Contact time (s) per slot, for debugging. */
  contact: number[];
};

// ------------------------------------------------------------------ constants

const FPS = 60;
const DT = 1 / FPS;

const MEET_START = 3.55;
const BREATH = 0.17;
const CONTACT = 0.45;
const PERIOD_CONTACT = 0.55;

/** Arrival streams: cubic Béziers in screen units (X·W/2, Y·H/2 from the viewport centre; z·P). */
const STREAMS: Vec3[][] = [
  [[-1.45, 0.3, -1.1], [-0.95, 0.55, -0.45], [-0.55, 0.2, -0.15], [-0.4, -0.05, 0]],
  [[1.2, -1.35, 0.25], [0.75, -0.7, 0.3], [0.3, -0.25, 0.2], [0.35, 0.05, 0.05]],
  [[-0.15, 1.4, -1.05], [0.1, 0.95, -0.4], [0.3, 0.5, -0.2], [0.1, 0.3, -0.05]],
  [[1.5, 0.35, -0.2], [1.05, 0.1, 0.1], [0.7, -0.2, 0], [0.5, -0.25, -0.1]],
];
const STREAM_START = [0.1, 0.32, 0.54, 0.76];

// Vortex keys (PCHIP).
const OMEGA = pchip([[0.2, 0.6], [1.1, 1.1], [2.0, 1.9], [2.3, 2.2], [2.5, 2.4], [2.72, 1.85], [2.86, 2.8], [3.3, 2.2]]);
const RADIUS = pchip([[0.2, 1.05], [1.1, 0.92], [2.0, 0.62], [2.3, 0.55], [2.5, 0.5], [2.72, 0.42], [2.86, 0.4], [3.3, 0.42]]);
const CHI = pchip([[0.2, 8], [1.1, 6], [2.0, 0], [2.3, -1.5], [2.5, -3], [2.72, -5]]);
const PSI = pchip([[0.2, -8], [1.1, -4], [2.0, 2], [2.3, 4], [2.5, 5], [2.72, 6], [2.86, 7]]);
const CZ = pchip([[0.2, -0.3], [1.1, -0.18], [2.0, -0.12], [2.3, -0.1], [2.5, -0.08], [2.72, -0.06], [2.86, -0.05], [3.3, -0.02]]);
const THICK = pchip([[0.2, 0.34], [1.1, 0.3], [2.0, 0.22], [2.3, 0.19], [2.5, 0.17], [2.72, 0.14], [2.86, 0.13]]);
const TURB = pchip([[0.2, 0.3], [1.1, 0.6], [2.0, 1.0], [2.3, 1.0], [2.5, 0.9], [2.72, 0.5], [2.86, 0.6], [3.4, 0.45]]);
const FLUTTER = pchip([[0.2, 1], [1.1, 1], [2.0, 0.9], [2.3, 0.85], [2.5, 0.75], [2.72, 0.5], [2.86, 0.6], [3.4, 0.55]]);
const SIZE = pchip([[0.2, 1], [2.3, 1], [2.5, 0.92], [2.72, 0.8], [2.86, 0.78], [3.3, 0.8]]);
/** Speed of the holding orbit around the word (px/s at a 1440-wide viewport). */
const HALO_SPEED = pchip([[2.8, 760], [3.4, 540], [4.2, 320], [5.2, 200], [6.4, 150]]);

// ------------------------------------------------------------------ helpers

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: Vec3): Vec3 => {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function bezier(c: Vec3[], u: number): Vec3 {
  const v = 1 - u;
  const a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u;
  return [
    a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0],
    a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1],
    a * c[0][2] + b * c[1][2] + d * c[2][2] + e * c[3][2],
  ];
}
function bezierTangent(c: Vec3[], u: number): Vec3 {
  const v = 1 - u;
  const a = 3 * v * v, b = 6 * v * u, d = 3 * u * u;
  return [
    a * (c[1][0] - c[0][0]) + b * (c[2][0] - c[1][0]) + d * (c[3][0] - c[2][0]),
    a * (c[1][1] - c[0][1]) + b * (c[2][1] - c[1][1]) + d * (c[3][1] - c[2][1]),
    a * (c[1][2] - c[0][2]) + b * (c[2][2] - c[1][2]) + d * (c[3][2] - c[2][2]),
  ];
}

/** Uniform Catmull–Rom through 4 points (with phantom ends), u ∈ [0, 1] over the 3 segments. */
function catmull(pts: Vec3[], u: number): Vec3 {
  const P = [
    add(scale3(pts[0], 2), scale3(pts[1], -1)),
    ...pts,
    add(scale3(pts[3], 2), scale3(pts[2], -1)),
  ];
  const x = clamp(u, 0, 1) * 3;
  const i = Math.min(2, Math.floor(x));
  const t = x - i;
  const [p0, p1, p2, p3] = [P[i], P[i + 1], P[i + 2], P[i + 3]];
  const t2 = t * t, t3 = t2 * t;
  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

const fmt = (n: number, d: number) => {
  const v = Number(n.toFixed(d));
  return Object.is(v, -0) ? "0" : String(v);
};

type Track = {
  stream: number;
  tm: number;
  Ts: number;
  ribR: number;
  ribPhi: number;
  rho: number;
  rhoK: number;
  nu: number;
  wob: number;
  theta0: number;
  tb: number;
  lane: Lane;
  sigma0: number;
  zLane: number;
  sizeVar: number;
  decoy: boolean;
  period: boolean;
  shedAt: number;
  phase: number;
};

type Lane = { table: Float64Array; L: number };

type Channels = {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  rz: Float64Array;
  ry: Float64Array;
  rx: Float64Array;
  sz: Float64Array;
  op: Float64Array;
  forced: Set<number>;
};
// ------------------------------------------------------------------ plan

export function compilePlan(frame: Frame): Plan {
  const { W, H, Cx, Cy, p, s, wm, hm, slots } = frame;
  const rnd = mulberry32(hashSeed("intro", frame.seed));
  const U = Math.min(W, H);
  const R0 = Math.max(W, H) / 2;
  const P = clamp(1.1 * Math.max(W, H), 900, 2000);
  const landscape = W >= H;
  const F = Math.round(clamp(Math.sqrt((0.4 * W * H) / 109), 40, 96));
  const speedScale = clamp(R0 / 720, 0.55, 1.4);
  const chiStar = Math.acos(clamp(U / 2 / R0, 0.35, 0.8));
  const small = W * H < 600_000;

  // Screen (viewport px) -> board, at depth z (px).
  const unproject = (sx: number, sy: number, z: number): Vec3 => [((sx - Cx) * (P - z)) / P, ((sy - Cy) * (P - z)) / P, z];
  const fromUnits = (X: number, Y: number, Z: number): Vec3 => unproject(W / 2 + (X * W) / 2, H / 2 + (Y * H) / 2, Z * P);
  const project = (b: Vec3): [number, number] => {
    const k = P / (P - b[2]);
    return [Cx + b[0] * k, Cy + b[1] * k];
  };
  const fog = (z: number) => smoothstep(-0.75 * P, -0.1 * P, z);

  // ---------------------------------------------------------------- landing schedule
  const letterSlots = slots.filter((sl) => sl.span === 1);
  const periodSlot = slots.find((sl) => sl.span === 2);
  const glyphs = new Map<number, FrameSlot[]>();
  for (const sl of letterSlots) {
    if (!glyphs.has(sl.glyph)) glyphs.set(sl.glyph, []);
    glyphs.get(sl.glyph)!.push(sl);
  }
  const glyphIds = [...glyphs.keys()].sort((a, b) => a - b);
  const contact = new Array<number>(slots.length).fill(0);
  {
    // Each letter's strokes arrive as a wave along its pen path; letters overlap a little
    // and the gaps shrink as the line goes on (an accelerando).
    const F1 = [0.66, 0.62, 0.58, 0.56];
    const F2 = [0.62, 0.58, 0.54, 0.46, 0.46];
    let start = MEET_START;
    let prevLine = 0;
    let lineIdx = 0;
    let lastEnd = MEET_START;
    let prevSpan = 0;
    glyphIds.forEach((gid, gi) => {
      const cells = glyphs.get(gid)!.sort((a, b) => a.order - b.order);
      const n = cells.length;
      const span = 0.34 * Math.pow(n / 12, 0.35);
      const line = cells[0].line;
      if (gi > 0) {
        if (line !== prevLine) {
          start = lastEnd + BREATH;
          lineIdx = 0;
        } else {
          start += (line === 0 ? F1 : F2)[Math.min(lineIdx - 1, 3)] * prevSpan;
        }
      }
      const step = n > 1 ? span / (n - 1) : 0;
      const jit = Math.min(0.012, 0.45 * step);
      cells.forEach((c, k) => {
        contact[c.order] = start + step * k + (rnd() * 2 - 1) * jit;
      });
      lastEnd = Math.max(lastEnd, start + span);
      prevSpan = span;
      prevLine = line;
      lineIdx++;
    });
  }
  const lastLetter = Math.max(...letterSlots.map((sl) => contact[sl.order]));
  const tP = lastLetter + 0.29;
  if (periodSlot) contact[periodSlot.order] = tP;
  const tDone = tP + 0.8;
  const N = Math.ceil(tDone / DT) + 1;
  const duration = (N - 1) * DT;

  // ---------------------------------------------------------------- vortex + orbit
  const Theta = integrate(OMEGA, 0, duration + 0.5, 1 / 240);
  const Sh = integrate((t) => (t < 2.8 ? 0 : HALO_SPEED(t) * speedScale), 0, duration + 0.5, 1 / 240);
  // The vortex spins about a point halfway between the word's centre and the screen's.
  const V0x = 0.5 * (W / 2 - Cx);
  const V0y = 0.5 * (H / 2 - Cy);

  const streamCtrl = STREAMS.map((c) => c.map(([X, Y, Z]) => fromUnits(X, Y, Z)));

  const orbitPos = (tr: Track, t: number): Vec3 => {
    const th = tr.theta0 - Theta(t) * tr.rhoK;
    const r = tr.rho * RADIUS(t) * R0;
    let qx = r * Math.cos(th);
    let qy = r * Math.sin(th);
    let qz = tr.nu * THICK(t) * U + 0.04 * U * Math.sin(2 * Math.PI * 0.35 * t + tr.wob);
    const chi = chiStar + CHI(t) * DEG;
    const cc = Math.cos(chi), sc = Math.sin(chi);
    if (landscape) {
      const y2 = qy * cc - qz * sc;
      qz = qy * sc + qz * cc;
      qy = y2;
    } else {
      const x2 = qx * cc + qz * sc;
      qz = -qx * sc + qz * cc;
      qx = x2;
    }
    const psi = PSI(t) * DEG;
    const cp = Math.cos(psi), sp = Math.sin(psi);
    const cz = CZ(t) * P;
    const k = (P - cz) / P;
    return [V0x * k + qx * cp - qy * sp, V0y * k + qx * sp + qy * cp, cz + qz];
  };

  const streamPos = (tr: Track, t: number): Vec3 => {
    const sN = clamp((t - tr.tm) / tr.Ts, 0, 1);
    const u = 1 - (1 - sN) * (1 - sN);
    const c = streamCtrl[tr.stream];
    const B = bezier(c, u);
    const Tg = norm3(bezierTangent(c, Math.min(u, 0.999)));
    let N1 = cross(Tg, [0, 0, 1]);
    if (len3(N1) < 1e-3) N1 = cross(Tg, [0, 1, 0]);
    N1 = norm3(N1);
    const N2 = cross(Tg, N1);
    const a = tr.ribPhi + 2 * Math.PI * 0.7 * u;
    return add(B, add(scale3(N1, tr.ribR * Math.cos(a)), scale3(N2, tr.ribR * Math.sin(a))));
  };

  // After the burst, prints circle the word on a rounded-rectangle (superellipse) lane
  // that keeps clear of the board, tabulated by arc length so speed is uniform.
  const makeLane = (d: number): Lane => {
    const ex = wm + d;
    const ey = Math.max(hm + d, landscape ? 0 : 0.31 * H);
    const clear = 0.55 * F;
    const pts = 720;
    let table = new Float64Array(pts * 3);
    let L = 0;
    for (let n = 6; n <= 14; n += 2) {
      table = new Float64Array(pts * 3);
      let ok = true;
      L = 0;
      let px = 0, py = 0;
      for (let i = 0; i < pts; i++) {
        const ph = (i / pts) * 2 * Math.PI;
        const c = Math.cos(ph), sN = Math.sin(ph);
        const x = ex * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
        const y = ey * Math.sign(sN) * Math.pow(Math.abs(sN), 2 / n);
        if (Math.max(Math.abs(x) - wm, Math.abs(y) - hm) < clear) ok = false;
        if (i > 0) L += Math.hypot(x - px, y - py);
        table[i * 3] = x;
        table[i * 3 + 1] = y;
        table[i * 3 + 2] = L;
        px = x;
        py = y;
      }
      L += Math.hypot(table[0] - px, table[1] - py);
      if (ok) break;
    }
    return { table, L };
  };
  const lanePoint = (lane: Lane, sigma: number): [number, number] => {
    const { table, L } = lane;
    let sg = sigma % L;
    if (sg < 0) sg += L;
    const pts = table.length / 3;
    let lo = 0, hi = pts - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (table[mid * 3 + 2] <= sg) lo = mid;
      else hi = mid - 1;
    }
    const i = lo, j = (lo + 1) % pts;
    const s0 = table[i * 3 + 2];
    const s1 = j === 0 ? L : table[j * 3 + 2];
    const f = s1 > s0 ? (sg - s0) / (s1 - s0) : 0;
    return [lerp(table[i * 3], table[j * 3], f), lerp(table[i * 3 + 1], table[j * 3 + 1], f)];
  };
  const haloPos = (tr: Track, t: number): Vec3 => {
    const [x, y] = lanePoint(tr.lane, tr.sigma0 - Sh(t));
    return [x, y, tr.zLane + 0.02 * P * Math.sin(2 * Math.PI * 0.4 * t + tr.wob)];
  };

  // Coherent turbulence: neighbouring prints gust together.
  const phi = Array.from({ length: 5 }, () => rnd() * Math.PI * 2);
  const k1 = (2 * Math.PI) / (1.1 * R0);
  const k2 = (2 * Math.PI) / (0.55 * R0);
  const A0 = 0.03 * U;
  const turbulence = (g: Vec3, t: number, amp: number, ph: number): Vec3 => [
    amp * A0 * (Math.sin(k1 * g[1] + 1.3 * t + phi[0] + ph) + 0.5 * Math.sin(k2 * g[2] + 2.1 * t + phi[1])),
    amp * A0 * (Math.sin(k1 * g[2] + 1.7 * t + phi[2] + ph) + 0.5 * Math.sin(k2 * g[0] + 1.1 * t + phi[3])),
    amp * A0 * 0.6 * Math.sin(k1 * g[0] + 1.5 * t + phi[4] + ph),
  ];

  // ---------------------------------------------------------------- tracks
  // Loose "orbit" prints ride the storm and are flung out past the lens at the climax.
  const orbitDecoys = small ? 5 : 8;
  const K = orbitDecoys + slots.length;
  let periodTrack = -1;
  if (periodSlot) for (let i = orbitDecoys; i < K; i++) if (i % 4 === 1) periodTrack = i;

  const tracks: Track[] = [];
  for (let i = 0; i < K; i++) {
    const stream = i % 4;
    const member = Math.floor(i / 4);
    const tm = STREAM_START[stream] + 0.022 * member + 0.01 * rnd();
    const Ts = 1.1 + 0.2 * (rnd() - 0.5);
    const rho = Math.sqrt(0.3 + 0.7 * rnd());
    const tr: Track = {
      stream,
      tm,
      Ts,
      ribR: (0.04 + 0.08 * Math.sqrt(rnd())) * R0,
      ribPhi: rnd() * Math.PI * 2,
      rho,
      rhoK: Math.pow(rho, -0.5) * (1 + 0.08 * rnd()),
      nu: rnd() - 0.5,
      wob: rnd() * Math.PI * 2,
      theta0: 0,
      tb: 2.78 + 0.12 * rnd(),
      lane: makeLane((0.5 + 0.85 * rnd()) * F),
      sigma0: 0,
      zLane: (0.012 + 0.06 * rnd()) * P,
      sizeVar: 0.88 + 0.24 * rnd(),
      decoy: i < orbitDecoys,
      period: i === periodTrack,
      shedAt: 2.74 + 0.04 * i,
      phase: rnd() * 0.6,
    };
    // Join the vortex at the angle where the stream delivers the print.
    const tJoin = tm + 0.6 * Ts + 0.275;
    const end = streamPos(tr, tm + Ts);
    const kz = (P - CZ(tJoin) * P) / P;
    let dx = end[0] - V0x * kz;
    let dy = end[1] - V0y * kz;
    const psi = -PSI(tJoin) * DEG;
    [dx, dy] = [dx * Math.cos(psi) - dy * Math.sin(psi), dx * Math.sin(psi) + dy * Math.cos(psi)];
    const chi = chiStar + CHI(tJoin) * DEG;
    if (landscape) dy /= Math.max(0.2, Math.cos(chi));
    else dx /= Math.max(0.2, Math.cos(chi));
    const spread = (((member * 137.5) % 50) - 25) * DEG;
    tr.theta0 = Math.atan2(dy, dx) + spread + Theta(tJoin) * tr.rhoK;
    // Burst out onto the frame orbit at the matching angle, so prints fly straight out.
    const tbm = tr.tb + 0.4;
    const o = orbitPos(tr, tbm);
    const ang = Math.atan2(o[1], o[0]);
    let best = 0, bestD = Infinity;
    const pts = tr.lane.table.length / 3;
    for (let j = 0; j < pts; j += 2) {
      const a = Math.atan2(tr.lane.table[j * 3 + 1], tr.lane.table[j * 3]);
      let dA = Math.abs(a - ang);
      if (dA > Math.PI) dA = 2 * Math.PI - dA;
      if (dA < bestD) {
        bestD = dA;
        best = j;
      }
    }
    tr.sigma0 = tr.lane.table[best * 3 + 2] + Sh(tbm);
    tracks.push(tr);
  }

  const guide = (tr: Track, tIn: number): Vec3 => {
    const t = Math.max(tIn, tr.tm);
    const st = streamPos(tr, t);
    const wj = smootherstep((t - tr.tm - 0.6 * tr.Ts) / 0.55);
    let g = wj > 0 ? lerp3(st, orbitPos(tr, t), wj) : st;
    let wb = 0;
    if (!tr.decoy) {
      wb = smootherstep((t - tr.tb) / 0.7);
      if (wb > 0) g = lerp3(g, haloPos(tr, t), wb);
    }
    const amp = lerp(TURB(t), 0.35, wb) * smootherstep((tIn - tr.tm) / 0.5);
    return add(g, turbulence(g, t, amp, tr.phase));
  };

  // Sample every track's storm path.
  const pos: Float64Array[] = tracks.map((tr) => {
    const a = new Float64Array(N * 3);
    let shed: { p: Vec3; v: Vec3; r: Vec3 } | null = null;
    for (let n = 0; n < N; n++) {
      const t = n * DT;
      let q: Vec3;
      if (tr.decoy && t >= tr.shedAt) {
        if (!shed) {
          const p0 = guide(tr, tr.shedAt);
          const p1 = guide(tr, tr.shedAt + 1e-3);
          const v: Vec3 = scale3(add(p1, scale3(p0, -1)), 1000);
          shed = { p: p0, v, r: norm3([p0[0] - V0x, p0[1] - V0y, 0]) };
        }
        const tau = t - tr.shedAt;
        const acc: Vec3 = [2.6 * R0 * shed.r[0], 2.6 * R0 * shed.r[1], 1.2 * P];
        q = add(add(shed.p, scale3(shed.v, tau)), scale3(acc, 0.5 * tau * tau));
      } else {
        q = guide(tr, t);
      }
      a[n * 3] = q[0];
      a[n * 3 + 1] = q[1];
      a[n * 3 + 2] = q[2];
    }
    return a;
  });
  const at = (k: number, n: number): Vec3 => {
    const i = clamp(n, 0, N - 1) * 3;
    return [pos[k][i], pos[k][i + 1], pos[k][i + 2]];
  };
  const velAt = (k: number, n: number): Vec3 => scale3(add(at(k, n + 1), scale3(at(k, n - 1), -1)), 0.5 / DT);
  const accAt = (k: number, n: number): Vec3 =>
    scale3(add(add(at(k, n + 1), scale3(at(k, n), -2)), at(k, n - 1)), 1 / (DT * DT));
  // ---------------------------------------------------------------- matching slots to tracks
  // Each slot (in landing order) takes the free print that is closest to it and already
  // heading its way at the moment it must peel off, so no print doubles back.
  const assigned = new Array<number>(slots.length).fill(-1);
  const free = new Set<number>();
  tracks.forEach((tr, k) => {
    if (!tr.decoy && !tr.period) free.add(k);
  });
  const byContact = [...letterSlots].sort((a, b) => contact[a.order] - contact[b.order]);
  const dropTime = (sl: FrameSlot) => (sl.span === 2 ? 0.42 : sl.line === 0 ? 0.34 : 0.36);
  for (const sl of byContact) {
    const n = Math.round((contact[sl.order] - dropTime(sl) - 0.55) / DT);
    const sx = Cx + sl.x, sy = Cy + sl.y;
    let best = -1, bestJ = Infinity;
    for (const k of free) {
      const q = at(k, n);
      const v = velAt(k, n);
      const [qx, qy] = project(q);
      const dx = sx - qx, dy = sy - qy;
      const dist = Math.hypot(dx, dy);
      const vl = Math.hypot(v[0], v[1]) || 1;
      const cosA = dist > 1 ? (v[0] * dx + v[1] * dy) / (vl * dist) : 1;
      const off = qx < 0 || qx > W || qy < 0 || qy > H ? 0.8 : 0;
      const deep = q[2] < -0.25 * P ? 0.5 : 0;
      const J = (0.6 * dist) / R0 + 0.9 * (1 - cosA) + off + deep;
      if (J < bestJ) {
        bestJ = J;
        best = k;
      }
    }
    assigned[sl.order] = best;
    free.delete(best);
  }
  if (periodSlot) assigned[periodSlot.order] = periodTrack;

  // ---------------------------------------------------------------- per-element channels
  const sHoverBase = clamp(1.6 * s, 28, Math.max(28, 0.8 * F));
  const Bbox = Math.round(1.4 * F);
  const BboxP = Math.round(1.9 * F);
  const handoff = new Array<number>(slots.length).fill(0);
  const newCh = (): Channels => ({
    x: new Float64Array(N), y: new Float64Array(N), z: new Float64Array(N),
    rz: new Float64Array(N), ry: new Float64Array(N), rx: new Float64Array(N),
    sz: new Float64Array(N), op: new Float64Array(N), forced: new Set([0, N - 1]),
  });

  /** Storm-phase rotation: spin plus a speed-driven flutter, integrated sample by sample. */
  const stormRotation = (k: number, ch: Channels, upto: number, r: () => number) => {
    const fx = 0.7 + 0.6 * r(), fy = 0.7 + 0.6 * r();
    const Ax = 28 + 34 * r(), Ay = 24 + 34 * r();
    const wz = (r() < 0.5 ? -1 : 1) * (60 + 140 * r());
    let phx = r() * Math.PI * 2, phy = r() * Math.PI * 2;
    let rz = r() * 360;
    let sv = 0;
    const tr = tracks[k];
    for (let n = 0; n <= upto && n < N; n++) {
      const t = n * DT;
      const target = clamp(len3(velAt(k, n)) / (1.2 * R0), 0, 1.6);
      sv += (target - sv) * (1 - Math.exp(-DT / 0.25));
      phx += 2 * Math.PI * fx * (0.6 + 0.8 * sv) * DT;
      phy += 2 * Math.PI * fy * (0.6 + 0.8 * sv) * DT;
      rz += wz * (0.25 + sv) * DT;
      const wb = tr.decoy ? 0 : smootherstep((t - tr.tb) / 0.7);
      const amp = lerp(FLUTTER(t), 0.45, wb) * smootherstep((t - tr.tm) / 0.5) * Math.pow(sv, 0.7);
      let rx = amp * Ax * Math.sin(phx);
      let ry = amp * Ay * Math.sin(phy);
      // Soft tilt limit: prints never turn edge-on or show their backs.
      const mag = Math.hypot(rx, ry);
      if (mag > 1e-6) {
        const f = (55 * Math.tanh(mag / 55)) / mag;
        rx *= f;
        ry *= f;
      }
      ch.rx[n] = rx;
      ch.ry[n] = ry;
      ch.rz[n] = rz;
    }
  };

  const elements: PlanElement[] = [];
  const shadows: Keyframe[][] = [];

  for (const sl of slots) {
    const k = assigned[sl.order];
    if (k < 0) {
      handoff[sl.order] = contact[sl.order];
      continue;
    }
    const tr = tracks[k];
    const isPeriod = sl.span === 2;
    const r = mulberry32(hashSeed("tile", frame.seed, sl.order));
    const ch = newCh();
    const tL = contact[sl.order];
    const dB = dropTime(sl);
    const box = isPeriod ? BboxP : Bbox;
    const sFinal = sl.size;
    const sx = Cx + sl.x, sy = Cy + sl.y;

    // Release timing: the swoop takes longer for prints that are further away.
    let dA: number;
    let nR: number;
    if (isPeriod) {
      nR = Math.round((tP - 1.2) / DT);
      dA = tP - dB - nR * DT;
    } else {
      const [qx, qy] = project(at(k, Math.round((tL - dB - 0.55) / DT)));
      dA = clamp(0.4 + (0.45 * Math.hypot(sx - qx, sy - qy)) / R0, 0.42, 1.0);
      nR = Math.round((tL - dB - dA) / DT);
      dA = tL - dB - nR * DT;
    }
    const tR = nR * DT;
    const pR = at(k, nR), vR = velAt(k, nR), aR = accAt(k, nR);
    const [rqx, rqy] = project(pR);

    // Hover point (or the full stop's apex), chosen in screen space inside the viewport.
    let Hh: number;
    let Q: [number, number];
    let sHover: number;
    if (isPeriod) {
      Hh = 0.2 * P;
      sHover = Math.max(1.35 * sFinal, 0.9 * F);
      const m = 0.71 * ((sHover * P) / (P - Hh)) + 8;
      const want: [number, number] = [sx + 0.3 * p, sy - 4.5 * p];
      Q = [clamp(want[0], m, W - m), clamp(want[1], m, H - m)];
      if (Math.hypot(Q[0] - want[0], Q[1] - want[1]) > 1.5 * p) {
        Q = [clamp(sx - 2.5 * p, m, W - m), clamp(sy - 5.5 * p, m, H - m)];
      }
    } else {
      Hh = (0.13 + 0.06 * r()) * P * (sl.line === 1 ? 1.15 : 1);
      sHover = sHoverBase;
      let ux = sx - rqx, uy = sy - rqy;
      const ul = Math.hypot(ux, uy);
      if (ul < 0.3 * p) [ux, uy] = sl.line === 0 ? [0.29, 0.96] : [0.96, 0.29];
      else {
        ux /= ul;
        uy /= ul;
      }
      const m = 0.71 * ((sHover * P) / (P - Hh)) + 8;
      Q = [clamp(sx - 0.8 * p * ux, m, W - m), clamp(sy - 0.8 * p * uy, m, H - m)];
    }
    const hover = unproject(Q[0], Q[1], Hh);

    // Drop: falls from the hover onto the slot, accelerating; the full stop hangs first.
    // Authored in screen space (a short, monotone slide while the print shrinks), then
    // unprojected at the current height, so nothing bulges outward on its way down.
    const g = isPeriod ? (2 * Hh) / (dB * dB) : (0.8 * Hh) / (dB * dB);
    const v0z = isPeriod ? 0 : -0.6 * (Hh / dB);
    const ease = isPeriod ? quintic(0, 0.6, 0, 1, 0.2, 0, 1) : quintic(0, 1.5, 0, 1, 0.4, 0, 1);
    const drop = (tau: number): Vec3 => {
      const e = ease(tau / dB);
      const z = Hh + v0z * tau - 0.5 * g * tau * tau;
      const k = (P - z) / P;
      return [(lerp(Q[0], sx, e) - Cx) * k, (lerp(Q[1], sy, e) - Cy) * k, z];
    };
    const h = 1e-3;
    const d0 = drop(0), d1 = drop(h), d2 = drop(2 * h);
    const vB0 = [0, 1, 2].map((i) => (-3 * d0[i] + 4 * d1[i] - d2[i]) / (2 * h));
    const aB0 = [0, 1, 2].map((i) => (d0[i] - 2 * d1[i] + d2[i]) / (h * h));
    const e0 = drop(dB), e1 = drop(dB - h), e2 = drop(dB - 2 * h);
    const vImp = [0, 1, 2].map((i) => (3 * e0[i] - 4 * e1[i] + e2[i]) / (2 * h));

    // Swoop: from the storm state to the drop's initial state (C2 at both ends).
    const swoop = [0, 1, 2].map((i) => quintic(pR[i], vR[i], aR[i], hover[i], vB0[i], aB0[i], dA));

    // Rotation: storm spin and flutter, then planned so the print lands square.
    stormRotation(k, ch, nR + 1, r);
    const rzR = ch.rz[nR];
    const rzRate = (ch.rz[nR + 1] - ch.rz[nR - 1]) / (2 * DT);
    const rxRate = (ch.rx[nR + 1] - ch.rx[nR - 1]) / (2 * DT);
    const ryRate = (ch.ry[nR + 1] - ch.ry[nR - 1]) / (2 * DT);
    const dir = rzRate >= 0 ? 1 : -1;
    const wc = dir * (150 + 70 * r());
    const D = dA + dB;
    let target = 360 * Math.round((rzR + ((rzRate + wc) * D) / 2) / 360);
    for (let tries = 0; tries < 4; tries++) {
      const m = (target - rzR) / D;
      const al = m !== 0 ? rzRate / m : -1;
      const be = m !== 0 ? wc / m : -1;
      if (al >= 0 && be >= 0 && al * al + be * be <= 9) break;
      target += 360 * dir;
    }
    const rzSeg = cubicHermite(rzR, rzRate, target, wc, D);
    const thX = (r() < 0.5 ? -1 : 1) * (4 + 4 * r());
    const thY = (r() < 0.5 ? -1 : 1) * (4 + 4 * r());
    const rxA = quintic(ch.rx[nR], rxRate, 0, thX, 0, 0, dA);
    const ryA = quintic(ch.ry[nR], ryRate, 0, thY, 0, 0, dA);
    const rxB = quintic(thX, 0, 0, 0, (-1.8 * thX) / dB, 0, dB);
    const ryB = quintic(thY, 0, 0, 0, (-1.8 * thY) / dB, 0, dB);

    // Size: large in the storm, hover size while docking, exact tile size at contact.
    const sizeAt = (t: number) => {
      const base = F * tr.sizeVar * (isPeriod ? 1.5 : 1) * SIZE(t);
      return lerp(base, (isPeriod ? 1.3 : 0.85) * F * tr.sizeVar, smootherstep((t - tr.tb) / 0.7));
    };
    const sRate = (sizeAt(tR + 1e-3) - sizeAt(tR - 1e-3)) / 2e-3;
    const sizeA = quintic(sizeAt(tR), sRate, 0, sHover, 0, 0, dA);

    const contactDur = isPeriod ? PERIOD_CONTACT : CONTACT;
    const seat = isPeriod ? 0.14 : 0.1;
    const Az = Math.min(isPeriod ? 5 : 4.5, (isPeriod ? 0.0045 : 0.004) * P);
    const wZ = (0.4988 * Math.abs(vImp[2])) / Az;
    // Hand off to the static tile once the print has settled, and always before the ripple
    // (which lifts the static tiles) reaches this cell, so the two never show at once.
    const dRipple = periodSlot ? Math.hypot(sl.x - periodSlot.x, sl.y - periodSlot.y) / p : 99;
    const tRipple = tP + 0.013 * dRipple;
    const tHand = isPeriod ? tP + PERIOD_CONTACT : Math.max(tL + 0.2, Math.min(tL + CONTACT, tRipple - 0.1));
    const fadeStart = tHand + 0.04;
    const fadeEnd = isPeriod ? tHand + 0.2 : Math.min(tHand + 0.2, Math.max(fadeStart + 0.04, tRipple));
    handoff[sl.order] = tHand;

    for (let n = 0; n < N; n++) {
      const t = n * DT;
      let q: Vec3;
      let size: number;
      if (n <= nR) {
        q = at(k, n);
        size = sizeAt(t);
      } else if (t <= tR + dA) {
        const tau = t - tR;
        q = [swoop[0](tau), swoop[1](tau), swoop[2](tau)];
        size = sizeA(tau);
        ch.rx[n] = rxA(tau);
        ch.ry[n] = ryA(tau);
        ch.rz[n] = rzSeg(tau);
      } else if (t <= tL) {
        const tau = t - tR - dA;
        q = drop(tau);
        size = tau < 0.6 * dB ? sHover : lerp(sHover, sFinal, smootherstep((tau - 0.6 * dB) / (0.4 * dB)));
        ch.rx[n] = rxB(tau);
        ch.ry[n] = ryB(tau);
        ch.rz[n] = rzSeg(dA + tau);
      } else {
        const tau = t - tL;
        if (tau < contactDur) {
          // Contact: absorb the incoming velocity with small damped springs, and "seat"
          // the print with a brief press (scale dip) — the main landing cue.
          q = [
            sl.x + damped(vImp[0], 2 * Math.PI * 10, 0.8, tau),
            sl.y + damped(vImp[1], 2 * Math.PI * 10, 0.8, tau),
            damped(vImp[2], wZ, 0.6, tau),
          ];
          size = sFinal * (1 - seat * bump(tau / 0.04));
          ch.rz[n] = target + damped(wc, 2 * Math.PI * 6, 0.45, tau);
          ch.rx[n] = damped((-1.8 * thX) / dB, 2 * Math.PI * 9, 0.5, tau);
          ch.ry[n] = damped((-1.8 * thY) / dB, 2 * Math.PI * 9, 0.5, tau);
        } else {
          q = [sl.x, sl.y, 0];
          size = sFinal;
          ch.rz[n] = target;
          ch.rx[n] = 0;
          ch.ry[n] = 0;
        }
      }
      ch.x[n] = q[0];
      ch.y[n] = q[1];
      ch.z[n] = q[2];
      ch.sz[n] = size / box;
      ch.op[n] = fog(q[2]) * (1 - smoothstep(fadeStart, fadeEnd, t));
    }
    for (const t of [tR, tR + dA, tL, tL + contactDur, fadeStart, fadeEnd]) {
      ch.forced.add(clamp(Math.round(t / DT), 0, N - 1));
    }

    elements.push({
      kind: isPeriod ? "period" : "tile",
      slot: sl.order,
      w: box,
      h: box,
      img: sl.img,
      focal: sl.focal,
      mat: 0,
      frames: compile(ch, N, duration, false),
    });

    // Contact shadow on the table while the print docks (light from the upper left).
    const shx = new Float64Array(N), shy = new Float64Array(N), shs = new Float64Array(N), sho = new Float64Array(N);
    const nShEnd = Math.min(N - 1, Math.round((tL + 0.36) / DT));
    for (let n = 0; n < N; n++) {
      // Outside its visible window the shadow holds still (so it compiles to few keyframes).
      const m = clamp(n, nR, nShEnd);
      const t = m * DT;
      const z = Math.max(0, ch.z[m]);
      shx[n] = ch.x[m] + 0.18 * z;
      shy[n] = ch.y[m] + 0.42 * z;
      shs[n] = (1.15 * ch.sz[m] * box * (1 + (1.6 * z) / P)) / 32;
      sho[n] = n <= nR || n >= nShEnd ? 0 : 0.36 * Math.pow(1 - smoothstep(0, 0.2 * P, z), 2) * smootherstep((t - tR) / 0.25) * (1 - smootherstep((t - tL) / 0.35));
    }
    // Phones skip contact shadows: 109 extra layers buy little at that size.
    if (!small) shadows.push(compileShadow(shx, shy, shs, sho, N, duration, [nR, Math.round(tL / DT)]));
  }
  // ---------------------------------------------------------------- loose prints (never land)
  const decoyImg = (i: number) => frame.tileImages[(i * 7 + 3) % frame.tileImages.length];
  tracks.forEach((tr, k) => {
    if (!tr.decoy) return;
    const r = mulberry32(hashSeed("orbit-decoy", frame.seed, k));
    const ch = newCh();
    stormRotation(k, ch, N - 1, r);
    const size = F * (1.0 + 0.1 * r());
    let maxApp = size;
    for (let n = 0; n < N; n++) {
      const t = n * DT;
      const q = at(k, n);
      const z = Math.min(q[2], 0.5 * P);
      ch.x[n] = q[0];
      ch.y[n] = q[1];
      ch.z[n] = z;
      ch.op[n] = fog(z) * (1 - smoothstep(0.38 * P, 0.48 * P, z)) * (1 - smootherstep((t - 3.15) / 0.3));
      if (ch.op[n] > 0.01) maxApp = Math.max(maxApp, (size * P) / (P - z));
    }
    const box = Math.round(clamp(maxApp / 1.2, F, 4 * F));
    for (let n = 0; n < N; n++) ch.sz[n] = size / box;
    elements.push({
      kind: "decoy",
      slot: -1,
      w: box,
      h: box,
      img: decoyImg(k),
      mat: Math.max(2, Math.round(box * 0.045)),
      frames: compile(ch, N, duration, true),
    });
  });

  // Large prints drifting past close to the lens, crossers, and faint far drifters.
  type Drift = { start: number; dur: number; X: number[]; Y: number[]; Z: number[]; size: number; aspect: number; src?: string };
  const hp = frame.heroPrints;
  const drifts: Drift[] = [
    { start: 0.15, dur: 2.0, X: [-1.4, -0.45, 0.45, 1.4], Y: [0.55, 0.45, 0.32, 0.2], Z: [0.1, 0.4, 0.46, 0.2], size: 1.55, aspect: hp[0]?.aspect ?? 1.5, src: hp[0]?.src },
    { start: 0.45, dur: 1.9, X: [1.4, 0.45, -0.45, -1.4], Y: [-0.62, -0.52, -0.44, -0.32], Z: [0.05, 0.3, 0.36, 0.14], size: 1.25, aspect: hp[1]?.aspect ?? 0.8, src: hp[1]?.src },
    { start: 0.75, dur: 2.0, X: [-1.4, -0.45, 0.45, 1.4], Y: [-0.86, -0.76, -0.7, -0.6], Z: [0.1, 0.36, 0.42, 0.2], size: 1.2, aspect: hp[2]?.aspect ?? 1, src: hp[2]?.src },
    { start: 1.5, dur: 1.8, X: [1.4, 0.45, -0.45, -1.4], Y: [-0.3, -0.36, -0.4, -0.46], Z: [0.1, 0.34, 0.4, 0.16], size: 1.15, aspect: 1.5 },
    { start: 0.5, dur: 2.3, X: [1.5, 0.5, -0.5, -1.5], Y: [-0.5, -0.46, -0.42, -0.4], Z: [-0.58, -0.55, -0.53, -0.52], size: 1.4, aspect: 1.5 },
    { start: 1.1, dur: 2.1, X: [1.5, 0.5, -0.5, -1.5], Y: [0.58, 0.54, 0.5, 0.46], Z: [-0.58, -0.56, -0.55, -0.54], size: 1.4, aspect: 0.8 },
  ];
  if (!small) {
    drifts.push(
      { start: 1.95, dur: 1.7, X: [-1.4, -0.45, 0.45, 1.4], Y: [0.62, 0.48, 0.4, 0.34], Z: [0.12, 0.36, 0.38, 0.14], size: 1.1, aspect: 0.8 },
      { start: 0.8, dur: 2.2, X: [1.5, 0.5, -0.5, -1.5], Y: [0.1, 0.06, 0.02, 0], Z: [-0.52, -0.5, -0.49, -0.48], size: 1.3, aspect: 1 },
    );
  }
  drifts.forEach((d, i) => {
    const r = mulberry32(hashSeed("drift", frame.seed, i));
    const pts: Vec3[] = d.X.map((X, j) => fromUnits(X, d.Y[j], d.Z[j]));
    const ch = newCh();
    const physW = d.size * F * (d.aspect >= 1 ? 1 : d.aspect);
    const physH = d.size * F * (d.aspect >= 1 ? 1 / d.aspect : 1);
    const fx = 0.3 + 0.3 * r(), fy = 0.3 + 0.3 * r();
    const ax = (15 + 10 * r()) * (r() < 0.5 ? -1 : 1);
    const ay = (15 + 10 * r()) * (r() < 0.5 ? -1 : 1);
    const spin = (10 + 20 * r()) * (r() < 0.5 ? -1 : 1);
    const rz0 = (r() - 0.5) * 30;
    let maxZ = -Infinity;
    for (let n = 0; n < N; n++) {
      const t = n * DT;
      const q = catmull(pts, (t - d.start) / d.dur);
      maxZ = Math.max(maxZ, q[2]);
      ch.x[n] = q[0];
      ch.y[n] = q[1];
      ch.z[n] = q[2];
      ch.rx[n] = ax * Math.sin(2 * Math.PI * fx * t + i);
      ch.ry[n] = ay * Math.sin(2 * Math.PI * fy * t + 2 * i);
      ch.rz[n] = rz0 + spin * t;
      ch.op[n] = fog(q[2]) * (1 - smoothstep(0.46 * P, 0.5 * P, q[2])) * (1 - smootherstep((t - 3.2) / 0.3));
    }
    const kMax = P / (P - Math.min(maxZ, 0.49 * P));
    const boxW = Math.round(Math.max(physW, (physW * kMax) / 1.2));
    const boxH = Math.round(Math.max(physH, (physH * kMax) / 1.2));
    for (let n = 0; n < N; n++) ch.sz[n] = physW / boxW;
    elements.push({
      kind: "decoy",
      slot: -1,
      w: boxW,
      h: boxH,
      img: d.src ?? decoyImg(i + 11),
      mat: Math.max(2, Math.round(Math.min(boxW, boxH) * 0.045)),
      frames: compile(ch, N, duration, true),
    });
  });

  // ---------------------------------------------------------------- camera
  // The table starts tilted away and slowly settles flat; it dips and nods when the
  // full stop lands. The static mosaic shares exactly this camera, so prints hand off
  // to their tiles without a seam.
  const camX = pchip([[0, 8], [1.4, 8], [2.5, 8.5], [2.72, 9.2], [2.86, 8.6], [3.6, 6], [4.6, 3.8], [5.6, 1.8], [tP, 1.2], [tP + 0.68, 0]]);
  const camY = pchip([[0, -4], [1.4, -1.5], [2.5, 2], [2.72, 3], [2.86, 4], [3.6, 2.5], [4.6, 1.2], [5.6, 0.6], [tP, 0.4], [tP + 0.68, 0]]);
  const camZ = pchip([[0, 0], [1.4, 0], [2.5, -0.2], [2.72, -1], [2.86, -0.6], [3.6, 0], [tP + 0.68, 0]]);
  const dip = Math.max(1.5, 0.065 * p);
  const cam: Keyframe[] = [];
  const plate: Keyframe[] = [];
  const camN = Math.ceil(duration * 30);
  for (let i = 0; i <= camN; i++) {
    const t = Math.min(duration, i / 30);
    const rest = 1 - smootherstep((t - tP - 0.68) / 0.12);
    const Dy = dip * bump((t - tP) / 0.08) * rest;
    const ax = (camX(t) + 1.2 * bump((t - tP) / 0.1)) * rest;
    const body = `translateY(${fmt(Dy, 2)}px) rotateX(${fmt(ax, 3)}deg) rotateY(${fmt(camY(t) * rest, 3)}deg) rotateZ(${fmt(camZ(t) * rest, 3)}deg)`;
    const offset = i === camN ? 1 : Number((t / duration).toFixed(6));
    cam.push({ offset, transform: body });
    plate.push({ offset, transform: `perspective(${fmt(P, 1)}px) ${body}` });
  }

  return { P, duration, tP, elements, shadows, cam, plate, handoff, contact };
}

// ------------------------------------------------------------------ keyframe compilation

const TOL = { xyz: 0.45, rot: 0.5, rz: 0.35, sz: 0.003, op: 0.01 };
const MAX_SPAN = 32;

/** Greedy decimation: keep only the samples linear interpolation cannot reproduce. */
function decimate(chs: Float64Array[], tols: number[], N: number, forced: Set<number>): number[] {
  const keep = [0];
  let a = 0;
  while (a < N - 1) {
    let good = a + 1;
    if (!forced.has(good)) {
      for (let b = a + 2; b < N && b - a <= MAX_SPAN; b++) {
        let ok = true;
        for (let i = a + 1; i < b && ok; i++) {
          const f = (i - a) / (b - a);
          for (let c = 0; c < chs.length; c++) {
            const v = chs[c];
            if (Math.abs(v[i] - (v[a] + (v[b] - v[a]) * f)) > tols[c]) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) break;
        good = b;
        if (forced.has(b)) break;
      }
    }
    keep.push(good);
    a = good;
  }
  return keep;
}

function compile(ch: Channels, N: number, duration: number, loose: boolean): Keyframe[] {
  const m = loose ? 1.5 : 1;
  const idx = decimate(
    [ch.x, ch.y, ch.z, ch.rz, ch.ry, ch.rx, ch.sz, ch.op],
    [TOL.xyz * m, TOL.xyz * m, TOL.xyz * 2 * m, TOL.rz * m, TOL.rot * m, TOL.rot * m, TOL.sz * m, TOL.op],
    N,
    ch.forced,
  );
  return idx.map((n) => ({
    offset: n === N - 1 ? 1 : Number(((n * DT) / duration).toFixed(6)),
    transform: `translate3d(${fmt(ch.x[n], 2)}px, ${fmt(ch.y[n], 2)}px, ${fmt(ch.z[n], 2)}px) rotateZ(${fmt(ch.rz[n], 2)}deg) rotateY(${fmt(ch.ry[n], 2)}deg) rotateX(${fmt(ch.rx[n], 2)}deg) scale(${fmt(ch.sz[n], 4)})`,
    opacity: Number(clamp(ch.op[n], 0, 1).toFixed(3)),
  }));
}

function compileShadow(x: Float64Array, y: Float64Array, s: Float64Array, o: Float64Array, N: number, duration: number, forcedIdx: number[]): Keyframe[] {
  const idx = decimate([x, y, s, o], [0.5, 0.5, 0.01, 0.01], N, new Set([0, N - 1, ...forcedIdx]));
  return idx.map((n) => ({
    offset: n === N - 1 ? 1 : Number(((n * DT) / duration).toFixed(6)),
    transform: `translate3d(${fmt(x[n], 2)}px, ${fmt(y[n], 2)}px, 0px) scale(${fmt(s[n], 4)})`,
    opacity: Number(clamp(o[n], 0, 1).toFixed(3)),
  }));
}