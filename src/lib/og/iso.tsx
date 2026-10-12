/**
 * A tiny isometric renderer for share cards: a spec's structural parts as shaded
 * boxes with ink edges, seen from the manual's own camera direction.
 */
import { isHardware } from "../spec/normalize";
import type { AssemblySpec, Vec3 } from "../spec/types";
import { extentsOf } from "../spec/normalize";

export interface IsoBox {
  min: Vec3;
  max: Vec3;
  hot?: boolean;
}

const V = norm([1, 0.8, 1.25]);
const RIGHT = norm(cross([0, 1, 0], V));
const UP = cross(V, RIGHT);

function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The finished product's structural boxes (cm), optionally pulled apart along each part's thin axis. */
export function boxesOf(spec: AssemblySpec, opts: { explode?: number; hot?: (key: string, i: number) => boolean } = {}): IsoBox[] {
  const parts = new Map(spec.parts.map((p) => [p.key, p]));
  const boxes: IsoBox[] = [];
  const [W, H, D] = spec.product.size;
  const c: Vec3 = [0, H / 2, 0];
  const S = Math.max(W, H, D, 1);
  spec.placements.forEach((pl, i) => {
    const p = parts.get(pl.part);
    if (!p || p.kind === "tool" || isHardware(p.kind) || pl.asm === "__") return;
    const e = extentsOf(pl, p);
    const thin = e.indexOf(Math.min(...e));
    for (const at of pl.at) {
      const o: Vec3 = [at[0], at[1], at[2]];
      if (opts.explode) {
        const d = o[thin] - c[thin];
        if (Math.abs(d) > 0.08 * S) o[thin] += Math.sign(d) * opts.explode * S;
      }
      boxes.push({
        min: [o[0] - e[0] / 2, o[1] - e[1] / 2, o[2] - e[2] / 2],
        max: [o[0] + e[0] / 2, o[1] + e[1] / 2, o[2] + e[2] / 2],
        hot: opts.hot?.(pl.part, i),
      });
    }
  });
  return boxes.slice(0, 160);
}

interface Palette {
  top: string;
  front: string;
  side: string;
  hotTop: string;
  hotFront: string;
  hotSide: string;
  ink: string;
}

export const PAPER: Palette = { top: "#ffffff", front: "#f0f0ee", side: "#dededa", hotTop: "#d6e2fc", hotFront: "#b9cdf8", hotSide: "#9db7f2", ink: "#141414" };

/**
 * Back-to-front order for axis-aligned boxes. The view looks down every axis from
 * its positive side, so a box lying wholly on the negative side of another along
 * any axis can never cover it: draw it first. Boxes that interpenetrate (a back
 * panel sitting in grooves) have no such axis and fall back to centre depth.
 */
function paintOrder(boxes: IsoBox[]): number[] {
  const n = boxes.length;
  const depth = boxes.map((b) => dot([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], V));
  const behind = (a: IsoBox, b: IsoBox) => [0, 1, 2].some((k) => a.max[k] <= b.min[k] + 1e-6);
  const after: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const ij = behind(boxes[i], boxes[j]), ji = behind(boxes[j], boxes[i]);
      if (ij && !ji) {
        after[i].push(j);
        indeg[j]++;
      } else if (ji && !ij) {
        after[j].push(i);
        indeg[i]++;
      }
    }
  const out: number[] = [];
  const done = new Array<boolean>(n).fill(false);
  while (out.length < n) {
    // among the boxes nothing is waiting on, draw the farthest first; break a cycle the same way
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || depth[i] < depth[pick])) pick = i;
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || depth[i] < depth[pick])) pick = i;
    done[pick] = true;
    out.push(pick);
    for (const j of after[pick]) indeg[j]--;
  }
  return out;
}

/** Boxes as an <svg> that fits width × height. */
export function IsoSvg({ boxes, width, height, pad = 24, palette = PAPER, stroke = 1.6 }: { boxes: IsoBox[]; width: number; height: number; pad?: number; palette?: Palette; stroke?: number }) {
  const proj = (p: Vec3) => [dot(p, RIGHT), -dot(p, UP)] as const;
  type Face = { pts: (readonly [number, number])[]; fill: string; depth: number };
  const faces: { depth: number; list: Face[] }[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const quads: [Vec3[], string][] = [
      [[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], b.hot ? palette.hotTop : palette.top],
      [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], b.hot ? palette.hotFront : palette.front],
      [[[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], b.hot ? palette.hotSide : palette.side],
    ];
    const centre: Vec3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const list = quads.map(([q, fill]) => {
      const pts = q.map(proj);
      for (const [x, y] of pts) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      return { pts, fill, depth: 0 };
    });
    faces.push({ depth: dot(centre, V), list });
  }
  const order = paintOrder(boxes);
  const sorted = order.map((i) => faces[i]);
  faces.length = 0;
  faces.push(...sorted);
  const k = Math.min((width - 2 * pad) / Math.max(1e-6, maxX - minX), (height - 2 * pad) / Math.max(1e-6, maxY - minY));
  const ox = (width - (maxX - minX) * k) / 2 - minX * k;
  const oy = (height - (maxY - minY) * k) / 2 - minY * k;
  const pts = (p: (readonly [number, number])[]) => p.map(([x, y]) => `${(x * k + ox).toFixed(1)},${(y * k + oy).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
      {faces.flatMap((f, i) =>
        f.list.map((face, j) => (
          <polygon key={`${i}-${j}`} points={pts(face.pts)} fill={face.fill} stroke={palette.ink} strokeWidth={stroke} strokeLinejoin="round" />
        )),
      )}
    </svg>
  );
}
