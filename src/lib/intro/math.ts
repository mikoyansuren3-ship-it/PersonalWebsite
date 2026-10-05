/** Small numeric toolkit for the intro planner. Everything here is pure and deterministic. */

export type Rand = () => number;

/** mulberry32: fast, seedable PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a list of values, for deriving independent seeds. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const DEG = Math.PI / 180;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Quintic smoothstep on [0, 1] (C2), clamped. */
export function smootherstep(u: number): number {
  const t = clamp(u, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** A C1 bump: 0 with zero slope at x = 0, peaks at 1 when x = 1, then decays. */
export function bump(x: number): number {
  return x <= 0 ? 0 : x * x * Math.exp(2 * (1 - x));
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson) through keys, with zero slope at
 * both ends; held constant outside the key range.
 */
export function pchip(keys: [number, number][]): (t: number) => number {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]);
    const w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1]);
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return (t: number) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const s = (t - xs[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * ys[i] +
      (s3 - 2 * s2 + s) * h * m[i] +
      (-2 * s3 + 3 * s2) * ys[i + 1] +
      (s3 - s2) * h * m[i + 1]
    );
  };
}

/** Running integral of f over [t0, t1], tabulated at step dt, linearly interpolated. */
export function integrate(f: (t: number) => number, t0: number, t1: number, dt: number): (t: number) => number {
  const n = Math.ceil((t1 - t0) / dt) + 1;
  const table = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const a = t0 + (i - 1) * dt;
    table[i] = table[i - 1] + ((f(a) + 4 * f(a + dt / 2) + f(a + dt)) / 6) * dt;
  }
  return (t: number) => {
    const x = (clamp(t, t0, t1) - t0) / dt;
    const i = Math.min(n - 2, Math.floor(x));
    return lerp(table[i], table[i + 1], x - i);
  };
}

/**
 * Quintic Hermite segment matching position, velocity and acceleration at both ends
 * (C2 joins). Returns position at τ ∈ [0, T].
 */
export function quintic(
  p0: number, v0: number, a0: number,
  p1: number, v1: number, a1: number,
  T: number,
): (tau: number) => number {
  return (tau: number) => {
    const s = clamp(tau / T, 0, 1);
    const s2 = s * s, s3 = s2 * s, s4 = s3 * s, s5 = s4 * s;
    const h0 = 1 - 10 * s3 + 15 * s4 - 6 * s5;
    const h1 = s - 6 * s3 + 8 * s4 - 3 * s5;
    const h2 = 0.5 * s2 - 1.5 * s3 + 1.5 * s4 - 0.5 * s5;
    const h3 = 0.5 * s3 - s4 + 0.5 * s5;
    const h4 = -4 * s3 + 7 * s4 - 3 * s5;
    const h5 = 10 * s3 - 15 * s4 + 6 * s5;
    return h0 * p0 + h1 * v0 * T + h2 * a0 * T * T + h3 * a1 * T * T + h4 * v1 * T + h5 * p1;
  };
}

/** Cubic Hermite segment matching position and velocity at both ends. */
export function cubicHermite(p0: number, v0: number, p1: number, v1: number, T: number): (tau: number) => number {
  return (tau: number) => {
    const s = clamp(tau / T, 0, 1);
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * T * v0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * T * v1;
  };
}

/**
 * Impulse response of an under-damped spring that starts at rest position with
 * velocity v0: used to absorb the velocity a print carries into its landing.
 */
export function damped(v0: number, omega: number, zeta: number, tau: number): number {
  if (tau <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return (v0 / wd) * Math.exp(-zeta * omega * tau) * Math.sin(wd * tau);
}

export type Vec3 = [number, number, number];