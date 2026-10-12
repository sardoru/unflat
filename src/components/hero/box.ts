// An oriented box drawn the kit's way, at any rotation: paper fill, four side tones and a lighter
// top bucketed by the kit's light (`bandOf(n · L)`, the rule `prismOf` and `lathe` use), creases
// where the top meets a visible side, a bevel inset on the top, and the silhouette as outline.
import { iso, pathOf, type Flat, type Projection, type SolidPaths } from "../../lib/iso/iso-kit";
import { bandOf, hullOf, lightOf, viewOf } from "../../lib/iso/lathe.mjs";
import { apply, dot, type Mat3, type Vec3 } from "./math";

export interface Box {
  c: Vec3;
  m: Mat3;
  h: Vec3;
}

const SIGNS: Array<[number, number, number]> = Array.from({ length: 8 }, (_, index) => [index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1]);

/** Faces as [axis, sign, corner indices in a cycle]. */
export const FACES: Array<{ axis: 0 | 1 | 2; sign: 1 | -1; ring: [number, number, number, number] }> = [
  { axis: 0, sign: 1, ring: [1, 3, 7, 5] },
  { axis: 0, sign: -1, ring: [0, 4, 6, 2] },
  { axis: 1, sign: 1, ring: [2, 6, 7, 3] },
  { axis: 1, sign: -1, ring: [0, 1, 5, 4] },
  { axis: 2, sign: 1, ring: [4, 5, 7, 6] },
  { axis: 2, sign: -1, ring: [0, 2, 3, 1] },
];

export const cornersOf = (box: Box): Vec3[] => SIGNS.map(([sx, sy, sz]) => apply(box.m, box.c, [sx * box.h[0], sy * box.h[1], sz * box.h[2]]));

export const normalOf = (box: Box, axis: 0 | 1 | 2, sign: 1 | -1): Vec3 => {
  const column = box.m[axis];
  return [column[0] * sign, column[1] * sign, column[2] * sign];
};

export const faceSeen = (box: Box, axis: 0 | 1 | 2, sign: 1 | -1, P: Projection) => dot(normalOf(box, axis, sign), viewOf(P)) > 1e-6;

const signedArea = (points: Flat[]) => {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const [ax, ay] = points[index]!;
    const [bx, by] = points[(index + 1) % points.length]!;
    area += ax * by - bx * ay;
  }
  return area / 2;
};
const oriented = (points: Flat[]) => (signedArea(points) < 0 ? [...points].reverse() : points);

export interface BoxPaths extends SolidPaths {
  /** Which faces are visible, and their bucket (0..3 sides, 4 = top). */
  seen: Array<{ axis: 0 | 1 | 2; sign: 1 | -1; band: number }>;
}

export function boxPaths(box: Box, P: Projection, bevel = 0): BoxPaths {
  const V = viewOf(P);
  const L = lightOf(P);
  const corners = cornersOf(box);
  const flat = corners.map((point) => iso(point, P));
  const buckets: string[][] = [[], [], [], [], []];
  const seen: BoxPaths["seen"] = [];
  const faceBand = new Map<string, number>();
  for (const face of FACES) {
    const normal = normalOf(box, face.axis, face.sign);
    if (dot(normal, V) <= 1e-6) continue;
    const band = bandOf(dot(normal, L));
    seen.push({ axis: face.axis, sign: face.sign, band });
    faceBand.set(`${face.axis}${face.sign}`, band);
    buckets[band]!.push(pathOf(oriented(face.ring.map((index) => flat[index]!)), true));
  }
  // Creases: every edge between a visible top face (band 4) and another visible face.
  const creases: string[] = [];
  let bevelPath = "";
  for (const face of FACES) {
    if (faceBand.get(`${face.axis}${face.sign}`) !== 4) continue;
    const ring = face.ring;
    // For each edge of this face, find the neighbouring face across it.
    const flags = ring.map((a, index) => {
      const b = ring[(index + 1) % 4]!;
      const neighbour = FACES.find((other) => other !== face && other.ring.includes(a) && other.ring.includes(b));
      return neighbour ? faceBand.has(`${neighbour.axis}${neighbour.sign}`) : false;
    });
    ring.forEach((a, index) => {
      if (flags[index]) creases.push(pathOf([flat[a]!, flat[ring[(index + 1) % 4]!]!]));
    });
    if (bevel > 0) {
      // Runs of consecutive visible edges: start corner, inset inner corners, end corner.
      const start = flags.findIndex((flag, index) => flag && !flags[(index + 3) % 4]);
      if (start >= 0) {
        const run: number[] = [ring[start]!];
        let index = start;
        while (flags[index % 4] && run.length < 5) {
          run.push(ring[(index + 1) % 4]!);
          index++;
        }
        const insetOf = (corner: number) => {
          const at = ring.indexOf(corner);
          const prev = corners[ring[(at + 3) % 4]!]!;
          const next = corners[ring[(at + 1) % 4]!]!;
          const here = corners[corner]!;
          const towards = (to: Vec3): Vec3 => {
            const d: Vec3 = [to[0] - here[0], to[1] - here[1], to[2] - here[2]];
            const l = Math.hypot(d[0], d[1], d[2]) || 1;
            return [(d[0] / l) * bevel, (d[1] / l) * bevel, (d[2] / l) * bevel];
          };
          const a = towards(prev);
          const b = towards(next);
          return iso([here[0] + a[0] + b[0], here[1] + a[1] + b[1], here[2] + a[2] + b[2]], P);
        };
        const points = [flat[run[0]!]!, ...run.slice(1, -1).map(insetOf), flat[run[run.length - 1]!]!];
        bevelPath += pathOf(points);
      }
    }
  }
  const hull = pathOf(hullOf(flat), true);
  return {
    fill: hull,
    outline: hull,
    crease: creases.join(""),
    top: buckets[4]!.join(""),
    shades: buckets.slice(0, 4).map((list) => list.join("")),
    bevel: bevelPath || undefined,
    seen,
  };
}

/** Project a point given in the box's own frame (centre at the origin). */
export const boxPoint = (box: Box, local: Vec3, P: Projection): Flat => iso(apply(box.m, box.c, local), P);
