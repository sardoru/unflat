// Everything the figure shows at a moment s, from the model: where each part is, how much of it
// shows above the faces it sinks into, the box it sorts by, and the one lit part.
import { iso, pathOf, type Flat, type Projection } from "../../lib/iso/iso-kit";
import { hullOf, viewOf } from "../../lib/iso/lathe.mjs";
import { boxPaths, cornersOf, type Box } from "./box";
import { add, dot, matOf, sub, type Vec3 } from "./math";
import { CAM, PART, PARTS, camTurnOf, litOf, poseOf, type Part } from "./model";
import { lengthOf, hardwareSvg, panelSvg } from "./parts-art";

export interface PartState {
  id: string;
  visible: boolean;
  /** Sort shape (the part of it outside every face it sinks into). */
  box: Box | null;
  /** "home": the prebuilt built-pose art moved by `shift`; "rebuild": `svg` replaces it. */
  mode: "home" | "rebuild";
  shift: Flat;
  /** Builds the replacement art (only called when `sig` changed). */
  render: () => string;
  lit: boolean;
  /** Soft floor shadow for panels: path and opacity. */
  halo?: { d: string; alpha: number };
  /** A key that changes whenever the rebuilt art would (to skip identical rebuilds). */
  sig: string;
}

const IDENTITY_EPS = 1e-6;
const isIdentity = (q: [number, number, number, number]) => Math.abs(q[0]) < IDENTITY_EPS && Math.abs(q[1]) < IDENTITY_EPS && Math.abs(q[2]) < IDENTITY_EPS;

const screenShift = (offset: Vec3, P: Projection): Flat => {
  const o = iso([0, 0, 0], P);
  const p = iso(offset, P);
  return [Math.round((p[0] - o[0]) * 100) / 100, Math.round((p[1] - o[1]) * 100) / 100];
};

/** The world box of a panel or leaf in a pose. */
export function panelBox(part: Part, s: number): Box {
  const pose = poseOf(part, s);
  return { c: pose.centre, m: matOf(pose.rot), h: part.half };
}

const aabbOf = (box: Box) => {
  const corners = cornersOf(box);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const point of corners)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, point[axis]!);
      max[axis] = Math.max(max[axis]!, point[axis]!);
    }
  return { min, max };
};

const overlaps = (a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }, pad = 0.6) =>
  a.min[0] < b.max[0] + pad && b.min[0] < a.max[0] + pad && a.min[1] < b.max[1] + pad && b.min[1] < a.max[1] + pad && a.min[2] < b.max[2] + pad && b.min[2] < a.max[2] + pad;

/** Axis, origin and half-width of a turned part at an offset. */
function hardwareLine(part: Part, offset: Vec3) {
  if (part.kind === "cam") {
    const up = part.dir !== -1;
    const c = add(part.centre, offset);
    return { o: [c[0], c[1], c[2] + (up ? -CAM.h / 2 : CAM.h / 2)] as Vec3, a: [0, 0, up ? 1 : -1] as Vec3, across: CAM.r };
  }
  return { o: add(part.origin!, offset), a: [0, part.dir ?? 1, 0] as Vec3, across: part.half[0] };
}

/**
 * The span of a turned part outside the faces it sinks into. `drawn` keeps only faces the reader
 * can see (a hidden face's host is painted after the part and hides what is inside it).
 */
function spanOf(part: Part, offset: Vec3, s: number, P: Projection, drawn: boolean): [number, number] | null {
  const length = lengthOf(part);
  let lo = 0;
  let hi = length;
  const { o, a, across } = hardwareLine(part, offset);
  const end = add(o, [a[0] * length, a[1] * length, a[2] * length]);
  const own = {
    min: [Math.min(o[0], end[0]) - across, Math.min(o[1], end[1]) - across, Math.min(o[2], end[2]) - across] as Vec3,
    max: [Math.max(o[0], end[0]) + across, Math.max(o[1], end[1]) + across, Math.max(o[2], end[2]) + across] as Vec3,
  };
  const V = viewOf(P);
  for (const entry of part.entries) {
    const host = PART[entry.host]!;
    const hostPose = poseOf(host, s);
    if (hostPose.out < 1 || !isIdentity(hostPose.rot)) continue;
    const box: Box = { c: hostPose.centre, m: matOf(hostPose.rot), h: host.half };
    if (!overlaps(own, aabbOf(box))) continue;
    const n: Vec3 = [box.m[entry.axis][0] * entry.sign, box.m[entry.axis][1] * entry.sign, box.m[entry.axis][2] * entry.sign];
    if (drawn && dot(n, V) <= 1e-6) continue;
    const q = add(box.c, [n[0] * box.h[entry.axis], n[1] * box.h[entry.axis], n[2] * box.h[entry.axis]]);
    const an = dot(a, n);
    if (Math.abs(an) < 1e-9) continue;
    const at = dot(sub(q, o), n) / an;
    if (an > 0) lo = Math.max(lo, at);
    else hi = Math.min(hi, at);
  }
  if (part.kind === "cam") {
    // A cam's slot face stays in view at the surface of its housing.
    if (hi < length - 1e-6 || lo > hi + 1e-6) return null;
    return [Math.min(lo, length), hi];
  }
  return hi - lo > 0.05 ? [lo, hi] : null;
}

function hardwareBox(part: Part, offset: Vec3, span: [number, number]): Box {
  const { o, a, across } = hardwareLine(part, offset);
  const mid = (span[0] + span[1]) / 2;
  const half = Math.max(0, (span[1] - span[0]) / 2);
  const c = add(o, [a[0] * mid, a[1] * mid, a[2] * mid]);
  const h: Vec3 = [across, across, across];
  const axis = a[2] !== 0 ? 2 : 1;
  h[axis] = half;
  return {
    c,
    m: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    h,
  };
}

/** Floor shadow of a panel: its corners dropped to the bench, fading with height. */
function haloOf(box: Box, P: Projection) {
  const corners = cornersOf(box);
  const lowest = Math.min(...corners.map((point) => point[2]));
  const alpha = Math.max(0, Math.min(1, 1 - lowest / 420));
  if (alpha <= 0.01) return { d: "", alpha: 0 };
  const flat = hullOf(corners.map((point) => iso([point[0], point[1], 0], P)));
  return { d: pathOf(flat, true), alpha: Math.round(alpha * 100) / 100 };
}

export function partState(part: Part, s: number, P: Projection, lit: string): PartState {
  const isLit = part.kind === "leaf" ? lit === "back" : lit === part.id;
  if (part.kind === "panel" || part.kind === "leaf") {
    const pose = poseOf(part, s);
    const box: Box = { c: pose.centre, m: matOf(pose.rot), h: part.half };
    const home = isIdentity(pose.rot);
    const offset = sub(pose.centre, part.centre);
    const halo = haloOf(box, P);
    if (home) return { id: part.id, visible: true, box, mode: "home", shift: screenShift(offset, P), render: NONE, lit: isLit, halo, sig: "home" };
    return { id: part.id, visible: true, box, mode: "rebuild", shift: [0, 0], render: () => panelSvg(part, box, P, false), lit: isLit, halo, sig: `${pose.centre.join(",")}|${pose.rot.join(",")}` };
  }
  const pose = poseOf(part, s);
  const offset = sub(pose.centre, part.centre);
  // Hidden once it is wholly inside the faces it sinks into; drawn up to the faces the reader sees.
  const sortSpan = spanOf(part, offset, s, P, false);
  const drawSpan = sortSpan ? spanOf(part, offset, s, P, true) : null;
  const turn = camTurnOf(part, s);
  const length = lengthOf(part);
  if (!sortSpan || !drawSpan) return { id: part.id, visible: false, box: null, mode: "home", shift: [0, 0], render: NONE, lit: isLit, sig: "hidden" };
  const box = hardwareBox(part, offset, sortSpan);
  const whole = drawSpan[0] <= 1e-6 && drawSpan[1] >= length - 1e-6 && turn === 0;
  if (whole) return { id: part.id, visible: true, box, mode: "home", shift: screenShift(offset, P), render: NONE, lit: isLit, sig: "home" };
  const sig = `${offset.join(",")}|${drawSpan.join(",")}|${turn}`;
  return { id: part.id, visible: true, box, mode: "rebuild", shift: [0, 0], render: () => hardwareSvg(part, { span: drawSpan, offset, turn, lit: false }, P), lit: isLit, sig };
}

const NONE = () => "";

/** Built-pose art of every part, untruncated: what "home" mode moves around. */
export function homeSvg(part: Part, P: Projection) {
  if (part.kind === "panel" || part.kind === "leaf") return panelSvg(part, { c: part.centre, m: matOf([0, 0, 0, 1]), h: part.half }, P, false);
  return hardwareSvg(part, { span: [0, lengthOf(part)], offset: [0, 0, 0], turn: 0, lit: false }, P);
}

export function frameAt(s: number, P: Projection) {
  const lit = litOf(s);
  return PARTS.map((part) => partState(part, s, P, lit));
}

export { boxPaths };
