// Small vector, quaternion and easing helpers for the hero figure. Pure, no DOM.

export type Vec3 = [number, number, number];
/** Unit quaternion [x, y, z, w]. */
export type Quat = [number, number, number, number];
/** Rotation matrix as its three columns (the images of the local x, y and z axes). */
export type Mat3 = [Vec3, Vec3, Vec3];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** Smootherstep: zero slope and zero curvature at both ends, so parts leave and land calmly. */
export const ease = (t: number) => {
  const u = clamp(t);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

/** Progress of `s` through the window [a, b], eased. */
export const windowed = (s: number, [a, b]: readonly [number, number]) => ease((s - a) / (b - a || 1));

export const IDENTITY: Quat = [0, 0, 0, 1];

export function axisAngle(axis: Vec3, degrees: number): Quat {
  const [x, y, z] = unit(axis);
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half);
  return [x * s, y * s, z * s, Math.cos(half)];
}

/** a then b: rotate by b first, then by a (q = a * b). */
export function mulQ(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    const out: Quat = [a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t];
    const l = Math.hypot(...out) || 1;
    return [out[0] / l, out[1] / l, out[2] / l, out[3] / l];
  }
  const angle = Math.acos(cos);
  const sin = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / sin;
  const wb = Math.sin(t * angle) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

export function matOf([x, y, z, w]: Quat): Mat3 {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/** Local point -> world, for a frame with origin `o` and rotation columns `m`. */
export const apply = (m: Mat3, o: Vec3, p: Vec3): Vec3 => [
  o[0] + m[0][0] * p[0] + m[1][0] * p[1] + m[2][0] * p[2],
  o[1] + m[0][1] * p[0] + m[1][1] * p[1] + m[2][1] * p[2],
  o[2] + m[0][2] * p[0] + m[1][2] * p[1] + m[2][2] * p[2],
];

export const rotate = (m: Mat3, v: Vec3): Vec3 => apply(m, [0, 0, 0], v);

/** Cubic Bezier through four points. */
export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]];
}

export const round2 = (value: number) => Math.round(value * 100) / 100;
