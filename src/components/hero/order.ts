// Painter's order for a scene of oriented boxes, re-solved whenever parts move.
// Two convex solids that don't interpenetrate have a separating plane; where their screen hulls
// overlap, every separating plane puts the same one on the reader's side, and that one is painted
// later. The pairwise rules are then sorted topologically, ties going far to near.
import { iso, type Flat, type Projection } from "../../lib/iso/iso-kit";
import { hullOf, viewOf } from "../../lib/iso/lathe.mjs";
import { cornersOf, type Box } from "./box";
import { cross, dot, type Vec3 } from "./math";

export interface Sortable {
  id: string;
  box: Box;
  /** Optional nudge for exact ties (e.g. a flush cam face over its panel). */
  bias?: number;
}

interface Prepared {
  id: string;
  box: Box;
  key: number;
  hull: Flat[];
  min: Flat;
  max: Flat;
}

const TOUCH = 0.02;

function prepare(item: Sortable, P: Projection, V: Vec3): Prepared {
  const hull = hullOf(cornersOf(item.box).map((point) => iso(point, P)));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of hull) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { id: item.id, box: item.box, key: dot(item.box.c, V) + (item.bias ?? 0), hull, min: [minX, minY], max: [maxX, maxY] };
}

/** Do two convex screen polygons overlap by more than a hairline? */
export function hullsOverlap(a: Flat[], b: Flat[]) {
  for (const poly of [a, b]) {
    for (let index = 0; index < poly.length; index++) {
      const [x0, y0] = poly[index]!;
      const [x1, y1] = poly[(index + 1) % poly.length]!;
      const nx = y1 - y0;
      const ny = x0 - x1;
      const length = Math.hypot(nx, ny) || 1;
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const [x, y] of a) {
        const p = (x * nx + y * ny) / length;
        if (p < aMin) aMin = p;
        if (p > aMax) aMax = p;
      }
      for (const [x, y] of b) {
        const p = (x * nx + y * ny) / length;
        if (p < bMin) bMin = p;
        if (p > bMax) bMax = p;
      }
      if (aMax <= bMin + 0.05 || bMax <= aMin + 0.05) return false;
    }
  }
  return true;
}

const radius = (box: Box, n: Vec3) => box.h[0] * Math.abs(dot(n, box.m[0])) + box.h[1] * Math.abs(dot(n, box.m[1])) + box.h[2] * Math.abs(dot(n, box.m[2]));

/**
 * +1 when b is nearer the reader than a (paint a first), -1 for the reverse, 0 when there is no
 * constraint (their outlines only touch or they don't overlap on screen).
 */
export function inFront(a: Box, b: Box, V: Vec3): number {
  const axes: Vec3[] = [...a.m, ...b.m];
  for (const p of a.m) {
    for (const q of b.m) {
      const n = cross(p, q);
      const length = Math.hypot(n[0], n[1], n[2]);
      if (length > 1e-6) axes.push([n[0] / length, n[1] / length, n[2] / length]);
    }
  }
  const d: Vec3 = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]];
  let least = Infinity;
  let leastVerdict = 0;
  for (const n of axes) {
    const along = dot(n, d);
    const gap = Math.abs(along) - (radius(a, n) + radius(b, n));
    const facing = dot(n, V);
    if (gap > -TOUCH) {
      if (Math.abs(facing) < 1e-4) return 0;
      return Math.sign(along) * Math.sign(facing);
    }
    // Interpenetrating so far: remember the axis of least overlap as a fallback.
    if (-gap < least && Math.abs(facing) > 1e-4) {
      least = -gap;
      leastVerdict = Math.sign(along) * Math.sign(facing);
    }
  }
  return leastVerdict;
}

export function paintOrder(items: Sortable[], P: Projection): string[] {
  const V = viewOf(P);
  const nodes = items.map((item) => prepare(item, P, V));
  const count = nodes.length;
  const after: number[][] = Array.from({ length: count }, () => []);
  const before = new Array<number>(count).fill(0);
  for (let i = 0; i < count; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < count; j++) {
      const b = nodes[j]!;
      if (a.max[0] <= b.min[0] || b.max[0] <= a.min[0] || a.max[1] <= b.min[1] || b.max[1] <= a.min[1]) continue;
      if (!hullsOverlap(a.hull, b.hull)) continue;
      const verdict = inFront(a.box, b.box, V);
      if (verdict > 0) {
        after[i]!.push(j);
        before[j]!++;
      } else if (verdict < 0) {
        after[j]!.push(i);
        before[i]!++;
      }
    }
  }
  const done = new Array<boolean>(count).fill(false);
  const order: string[] = [];
  for (let step = 0; step < count; step++) {
    let pick = -1;
    for (let index = 0; index < count; index++) {
      if (done[index] || before[index]! > 0) continue;
      if (pick < 0 || nodes[index]!.key < nodes[pick]!.key) pick = index;
    }
    if (pick < 0) {
      // A cycle: break it at the farthest remaining node.
      for (let index = 0; index < count; index++) if (!done[index] && (pick < 0 || nodes[index]!.key < nodes[pick]!.key)) pick = index;
    }
    done[pick] = true;
    order.push(nodes[pick]!.id);
    for (const next of after[pick]!) before[next]!--;
  }
  return order;
}
