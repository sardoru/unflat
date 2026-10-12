// Art for the moving parts, as kit SVG strings. Shared by the server (rest pose) and the live
// client (rebuilds while a panel turns or a part sinks into a visible face).
import { dotsSvg, fadedSvg, iso, lineSvg, pathOf, solidSvg, type Flat, type Projection } from "../../lib/iso/iso-kit";
import { arcOf, frameOf, pointOf, ribsOf, solidOf, viewOf, type Frame } from "../../lib/iso/lathe.mjs";
import { boxPaths, faceSeen, type Box } from "./box";
import { add, apply, dot, type Vec3 } from "./math";
import { CAB, CAM, PIN_R, type Part } from "./model";

const TAU = Math.PI * 2;

// ---- Holes and ply lines on panels -------------------------------------------------------------
interface Hole {
  axis: 0 | 1 | 2;
  sign: 1 | -1;
  /** Centre in the panel's own frame (on the face), and radius. */
  at: Vec3;
  r: number;
}

const circleOnFace = (box: Box, hole: Hole, P: Projection, steps = 18) => {
  const points: Flat[] = [];
  const [i, j] = ([0, 1, 2] as const).filter((axis) => axis !== hole.axis) as [0 | 1 | 2, 0 | 1 | 2];
  for (let step = 0; step < steps; step++) {
    const t = (step / steps) * TAU;
    const local: Vec3 = [hole.at[0], hole.at[1], hole.at[2]];
    local[i] += Math.cos(t) * hole.r;
    local[j] += Math.sin(t) * hole.r;
    points.push(iso(apply(box.m, box.c, local), P));
  }
  return pathOf(points, true);
};

/** Holes drilled into each panel, in the panel's own frame (centre at the origin). */
function holesOf(part: Part): Hole[] {
  const holes: Hole[] = [];
  if (part.kind !== "panel") return holes; // the hardboard back is nailed on, not drilled
  const [hx, hy, hz] = part.half;
  const cx = part.centre[0];
  const cz = part.centre[2];
  if (part.id === "side-r" || part.id === "side-l") {
    const sign = part.id === "side-r" ? 1 : -1; // the inner face
    const face = sign * hy;
    // System 32 rows for shelf pins, 37 mm in from the front and back edges.
    const pinZ = CAB.shelfZ - PIN_R;
    for (let k = -9; k <= 9; k++) {
      const z = pinZ + k * 32;
      for (const x of [37, CAB.d - 37]) holes.push({ axis: 1, sign: sign as 1 | -1, at: [x - cx, face, z - cz], r: 2.5 });
    }
    // Cam bolt and dowel holes where top and bottom meet the side, dowel holes for the shelf.
    for (const z of [CAB.plinth + CAB.t / 2, CAB.h - CAB.t / 2]) {
      for (const x of [52, 248]) holes.push({ axis: 1, sign: sign as 1 | -1, at: [x - cx, face, z - cz], r: 2.5 });
      holes.push({ axis: 1, sign: sign as 1 | -1, at: [150 - cx, face, z - cz], r: 4 });
    }
    for (const x of [72, 218]) holes.push({ axis: 1, sign: sign as 1 | -1, at: [x - cx, face, CAB.shelfZ + CAB.t / 2 - cz], r: 4 });
  } else {
    // Top, bottom and shelf: holes in both end edges, cam housings in the inner face.
    const ends = [1, -1] as const;
    for (const end of ends) {
      if (part.id === "shelf") {
        for (const x of [72, 218]) holes.push({ axis: 1, sign: end, at: [x - cx, end * hy, 0], r: 4 });
      } else {
        holes.push({ axis: 1, sign: end, at: [150 - cx, end * hy, 0], r: 4 });
        for (const x of [52, 248]) holes.push({ axis: 1, sign: end, at: [x - cx, end * hy, 0], r: 4 });
        const camFace = part.id === "top" ? -1 : 1;
        for (const x of [52, 248]) holes.push({ axis: 2, sign: camFace as 1 | -1, at: [x - cx, end * (hy - 32), camFace * hz], r: CAM.r + 0.2 });
      }
    }
    void hx;
  }
  return holes;
}

const HOLES = new Map<string, Hole[]>();
const holesFor = (part: Part) => {
  let list = HOLES.get(part.id);
  if (!list) HOLES.set(part.id, (list = holesOf(part)));
  return list;
};

/** Plywood edges: two ply lines along each visible edge face, running the full face. */
function plyLines(part: Part, box: Box, P: Projection) {
  if (part.kind !== "panel") return "";
  const thin: 0 | 1 | 2 = part.id.startsWith("side") ? 1 : 2;
  const lines: string[] = [];
  const h = part.half;
  for (const axis of [0, 1, 2] as const) {
    if (axis === thin) continue;
    for (const sign of [1, -1] as const) {
      if (!faceSeen(box, axis, sign, P)) continue;
      const along = ([0, 1, 2] as const).find((other) => other !== axis && other !== thin)!;
      for (const share of [-1 / 3, 1 / 3]) {
        const a: Vec3 = [0, 0, 0];
        const b: Vec3 = [0, 0, 0];
        a[axis] = b[axis] = sign * h[axis];
        a[thin] = b[thin] = share * h[thin];
        a[along] = -h[along];
        b[along] = h[along];
        lines.push(pathOf([iso(apply(box.m, box.c, a), P), iso(apply(box.m, box.c, b), P)]));
      }
    }
  }
  return lineSvg(lines.join(""), { tone: "faint" });
}

export function panelSvg(part: Part, box: Box, P: Projection, lit: boolean) {
  const paths = boxPaths(box, P, part.kind === "panel" ? 2.6 : 0);
  const holes = holesFor(part)
    .filter((hole) => faceSeen(box, hole.axis, hole.sign, P))
    .map((hole) => circleOnFace(box, hole, P, hole.r > 5 ? 28 : 14))
    .join("");
  const inner = plyLines(part, box, P) + (holes ? `<path class="uf-hole" d="${holes}"/>` : "");
  return solidSvg(paths, { tone: "hi", crease: "lo", lit, inner });
}

// ---- Turned hardware ---------------------------------------------------------------------------
const AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** The frame of a turned part lying along y, at a given world offset from its built place. */
export function hardwareFrame(part: Part, offset: Vec3): Frame {
  const dir = part.dir ?? 1;
  const a: Vec3 = [AXES[1]![0] * dir, AXES[1]![1] * dir, AXES[1]![2] * dir];
  const u: Vec3 = [1, 0, 0];
  const v: Vec3 = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  return frameOf(add(part.origin ?? part.centre, offset), a, u, v);
}

export const lengthOf = (part: Part) => (part.kind === "cam" ? CAM.h : part.profile![part.profile!.length - 1]![0]);

/** Cut a profile to the span [a, b] along its axis, interpolating the radius at the cut. */
export function cutProfile(profile: Array<[number, number]>, a: number, b: number): Array<[number, number]> {
  const rAfter = (s: number) => {
    for (let index = 0; index < profile.length - 1; index++) {
      const [s0, r0] = profile[index]!;
      const [s1, r1] = profile[index + 1]!;
      if (s0 <= s && s < s1) return r0 + ((r1 - r0) * (s - s0)) / (s1 - s0);
    }
    return profile[profile.length - 1]![1];
  };
  const rBefore = (s: number) => {
    for (let index = 0; index < profile.length - 1; index++) {
      const [s0, r0] = profile[index]!;
      const [s1, r1] = profile[index + 1]!;
      if (s0 < s && s <= s1) return r0 + ((r1 - r0) * (s - s0)) / (s1 - s0);
    }
    return profile[0]![1];
  };
  const out: Array<[number, number]> = [[a, rAfter(a)]];
  for (const point of profile) if (point[0] > a + 1e-6 && point[0] < b - 1e-6) out.push([point[0], point[1]]);
  out.push([b, rBefore(b)]);
  return out;
}

const camProfile = (): Array<[number, number]> => [
  [0, CAM.r - 0.5],
  [0.6, CAM.r],
  [CAM.h - 0.7, CAM.r],
  [CAM.h, CAM.r - 0.6],
];

/** A closed outline on a frame's face plane at s, from 2D points in (u, v). */
const onFace = (F: Frame, s: number, points: Array<[number, number]>, P: Projection) =>
  pathOf(
    points.map(([x, y]) => iso([F.o[0] + F.a[0] * s + F.u[0] * x + F.v[0] * y, F.o[1] + F.a[1] * s + F.u[1] * x + F.v[1] * y, F.o[2] + F.a[2] * s + F.u[2] * x + F.v[2] * y], P)),
    true,
  );

function slotPoints(angle: number, half: number, width: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const steps = 5;
  for (const end of [1, -1]) {
    for (let step = 0; step <= steps; step++) {
      const t = -Math.PI / 2 + (step / steps) * Math.PI;
      const x = end * (half + Math.cos(t) * width);
      const y = end * Math.sin(t) * width;
      out.push([x * c - y * s, x * s + y * c]);
    }
  }
  return out;
}

/** The face of a cam lock: rim, screwdriver slot (turned by `turn`) and the arrow toward its bolt. */
function camFace(F: Frame, s: number, turn: number, toward: number, P: Projection) {
  const rim = onFace(F, s, Array.from({ length: 28 }, (_, index) => [Math.cos((index / 28) * TAU) * (CAM.r - 1.3), Math.sin((index / 28) * TAU) * (CAM.r - 1.3)] as [number, number]), P);
  const slot = onFace(F, s, slotPoints(toward + turn + Math.PI / 2, 3.6, 0.7), P);
  const a = toward + turn;
  const tip: [number, number] = [Math.cos(a) * (CAM.r - 2.1), Math.sin(a) * (CAM.r - 2.1)];
  const arrow = onFace(
    F,
    s,
    [tip, [Math.cos(a + 0.32) * (CAM.r - 4), Math.sin(a + 0.32) * (CAM.r - 4)], [Math.cos(a - 0.32) * (CAM.r - 4), Math.sin(a - 0.32) * (CAM.r - 4)]],
    P,
  );
  return lineSvg(rim, { tone: "faint" }) + lineSvg(slot + arrow, { tone: "lo" });
}

export interface HardwareDraw {
  /** Visible span along the axis, or null when nothing shows. */
  span: [number, number] | null;
  offset: Vec3;
  turn: number;
  lit: boolean;
}

export function hardwareSvg(part: Part, draw: HardwareDraw, P: Projection) {
  if (!draw.span) return "";
  const [a, b] = draw.span;
  const V = viewOf(P);
  if (part.kind === "cam") {
    // Cams are framed from their back face toward the slot face; the arrow points at the bolt.
    const C = camFrame(part, draw.offset);
    const toward = boltSideOf(part) > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (b - a < 0.4) {
      // Seated flush in its housing: only the face shows, level with the panel.
      const disc = onFace(C, CAM.h, Array.from({ length: 40 }, (_, index) => [Math.cos((index / 40) * TAU) * CAM.r, Math.sin((index / 40) * TAU) * CAM.r] as [number, number]), P);
      return `<g class="iso-solid uf-flush"${draw.lit ? ' data-lit=""' : ""}><path class="iso-fill" d="${disc}"/><path class="iso-top" d="${disc}"/>${camFace(C, CAM.h, draw.turn, toward, P)}<path class="iso-line iso-edge" data-tone="mid" d="${disc}"/></g>`;
    }
    const paths = solidOf(cutProfile(camProfile(), a, b), C, P);
    const faceShows = dot(C.a, V) > 0 && b >= CAM.h - 1e-6;
    const inner = (faceShows ? camFace(C, CAM.h, draw.turn, toward, P) : "") + mouthOf(C, part, a, b, P);
    return solidSvg(paths, { tone: "hi", crease: "lo", lit: draw.lit, inner });
  }
  const F = hardwareFrame(part, draw.offset);
  const profile = cutProfile(part.profile!, a, b);
  const paths = solidOf(profile, F, P);
  let inner = "";
  if (part.kind === "dowel") {
    const s0 = Math.max(a, 0.9);
    const s1 = Math.min(b, 29.1);
    if (s1 - s0 > 0.5) inner += fadedSvg(ribsOf(F, s0, s1, 4, 12, P, { fade: [0.12, 0.6] }), { tone: "lo" });
  } else if (part.kind === "bolt") {
    const rings: string[] = [];
    for (let s = 2.4; s < 10.6; s += 1.15) if (s > a + 0.2 && s < b - 0.2) rings.push(arcOf(F, s, 2.5, P));
    inner += lineSvg(rings.join(""), { tone: "faint" });
    const end = lengthOf(part);
    if (b >= end - 1e-6 && dot(F.a, V) > 0.05) {
      inner += lineSvg(onFace(F, end, Array.from({ length: 6 }, (_, index) => [Math.cos((index / 6) * TAU) * 1.4, Math.sin((index / 6) * TAU) * 1.4] as [number, number]), P), { tone: "lo" });
    }
  } else if (part.kind === "pin") {
    if (b > 9.4 && a < 9.2) inner += lineSvg(arcOf(F, 8.6, 3.8, P), { tone: "faint" });
  }
  return solidSvg(paths, { tone: "hi", crease: "lo", lit: draw.lit, inner });
}

/** Which way (±y) a cam's bolt comes from: the side panel nearest it. */
const boltSideOf = (part: Part) => (part.centre[1] < CAB.w / 2 ? -1 : 1);

/**
 * Cam frame: origin at the cam's back face, axis toward its slot face (up for the bottom panel,
 * down for the top panel), u along x and v completing a right-handed frame (+y when the slot faces up).
 */
export function camFrame(part: Part, offset: Vec3): Frame {
  const up = part.dir !== -1;
  const c = add(part.centre, offset);
  const o: Vec3 = [c[0], c[1], c[2] + (up ? -CAM.h / 2 : CAM.h / 2)];
  return frameOf(o, [0, 0, up ? 1 : -1], [1, 0, 0], [0, up ? 1 : -1, 0]);
}

/** The cut in a cam's side where the bolt head enters, drawn when that side faces the reader. */
function mouthOf(C: Frame, part: Part, a: number, b: number, P: Projection) {
  const toward = boltSideOf(part);
  if (dot([0, toward, 0], viewOf(P)) < 0.2) return "";
  // World +y is angle π/2 when v = +y (slot up) and -π/2 when v = -y (slot down).
  const angle = (toward > 0 ? Math.PI / 2 : -Math.PI / 2) * (part.dir === -1 ? -1 : 1);
  const s0 = Math.max(a + 0.6, 2.6);
  const s1 = Math.min(b - 0.6, 8.2);
  if (s1 - s0 < 1) return "";
  const half = 0.42;
  const points: Flat[] = [];
  const ring = (s: number, from: number, to: number) => {
    for (let step = 0; step <= 6; step++) points.push(iso(pointOf(C, s, CAM.r, from + ((to - from) * step) / 6), P));
  };
  ring(s0, angle - half, angle + half);
  ring(s1, angle + half, angle - half);
  return `<path class="uf-hole" d="${pathOf(points, true)}"/>`;
}

export const dotsAt = (points: Vec3[], P: Projection, size = 0.45) => dotsSvg(points.map((point) => iso(point, P)), { size });
