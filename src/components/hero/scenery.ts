// Static art for Fig 1: the bench plate (painted first) and the parts that never move but take part
// in the depth sort (carton, tray, booklet, key). Built once on the server as kit SVG strings.
import * as k from "../../lib/iso/iso-kit";
import { frameOf, prismOf, sphereOf } from "../../lib/iso/lathe.mjs";
import { boxPaths, type Box } from "./box";
import { BOOK, CAB, CARTON, TRAY } from "./model";
import { KEY, SCENERY } from "./scenery-shapes";
import { FOOT_H, P, PLATE, PLATE_H, at } from "./view";
import type { Vec3 } from "./math";

const S = k.solidSvg;
const L = k.lineSvg;
const D = k.dotsSvg;
const byDepth = <T extends [number, number]>(points: T[]) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const path = (points: Vec3[], closed = false) => k.pathOf(points.map(at), closed);

// ---- Bench plate -------------------------------------------------------------------------------
const STRIP: k.Plan = { x: PLATE.x + 60, y: PLATE.y + PLATE.d - 30, w: PLATE.w - 120, d: 16, r: 2 };
const LABEL: k.Plan = { x: PLATE.x + PLATE.w - 210, y: PLATE.y + PLATE.d - 104, w: 150, d: 50, r: 3 };

export function plateSvg() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 66))) {
    out.push(S(k.cylinder(x, y, 34, -PLATE_H - FOOT_H, 4, P, 44), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 27, -PLATE_H - FOOT_H + 4, FOOT_H - 4, P, 44), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 10, 4.5), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 20), 0, P, 10), { tone: "lo" }));
  const screws = k.corners(PLATE, 36);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 8, 0, P, 20)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // Ruler strip along the front-left edge: 10 mm ticks, every 100 mm long.
  out.push(S(k.slabOf(STRIP, 0, 1.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(STRIP.x + 20, STRIP.x + STRIP.w - 20, 10, 10, STRIP.y, 1.6, [5, 10], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([STRIP.x + 9, STRIP.y + STRIP.d / 2, 1.6]), at([STRIP.x + STRIP.w - 9, STRIP.y + STRIP.d / 2, 1.6])], { size: 0.45 }));
  // Label plate with three rule lines and two screws.
  out.push(S(k.slabOf(LABEL, 0, 1.4, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(LABEL, 5), 1.4, P), { tone: "faint" }));
  const rule = (row: number, to: number) => k.onTop([[LABEL.x + 22, LABEL.y + 14 + row * 10], [LABEL.x + to, LABEL.y + 14 + row * 10]], 1.4, P);
  out.push(L(rule(0, 118) + rule(1, 96) + rule(2, 108), { tone: "lo", free: true }));
  out.push(D([at([LABEL.x + 11, LABEL.y + LABEL.d / 2, 1.4]), at([LABEL.x + LABEL.w - 11, LABEL.y + LABEL.d / 2, 1.4])], { size: 0.45 }));
  return out.join("");
}

/** Where the cabinet will stand: a dotted outline on the plate, faded out as it is built. */
export const footprintSvg = () => L(k.planOutline({ x: 0, y: 0, w: CAB.d, d: CAB.w, r: 0 }, 0, P), { tone: "mid", dotted: true });

/** Static halos under the carton and the tray. */
export function sceneryHalosSvg() {
  const carton: k.Plan = { x: CARTON.x, y: CARTON.y, w: CARTON.l, d: CARTON.w, r: 4 };
  const tray: k.Plan = { x: TRAY.x, y: TRAY.y, w: TRAY.w, d: TRAY.d, r: 6 };
  return `<path class="iso-halo" d="${k.haloOf(carton, 0, CARTON.h, P)}"/><path class="iso-halo uf-halo-small" d="${k.haloOf(tray, 0, TRAY.h, P)}"/>`;
}

// ---- Carton -------------------------------------------------------------------------------------
const { x: CX, y: CY, l: CL, w: CW, h: CH, board: CT } = CARTON;

function slab(id: string, steps = 2, bevel = 0.8) {
  const box = SCENERY[id]!;
  const plan: k.Plan = { x: box.c[0] - box.h[0], y: box.c[1] - box.h[1], w: box.h[0] * 2, d: box.h[1] * 2, r: 0.8 };
  return k.slabOf(plan, box.c[2] - box.h[2], box.h[2] * 2, P, steps, bevel);
}

/**
 * A printed label on the outer face (+t) of an oriented board: a thin white plate, an inset frame,
 * three rule lines standing for text and a barcode whose bars run the full height of their box.
 * The rectangle is given in the face's own (along, across) coordinates.
 */
function printedLabel(board: Box, [a0, b0, a1, b1]: [number, number, number, number]) {
  // Read the face from outside: "along" runs left to right for someone facing its outer normal.
  const [axis, across, normal] = board.m;
  const along: Vec3 = [-axis[0], -axis[1], -axis[2]];
  const at = (a: number, b: number, lift: number): Vec3 => [
    board.c[0] + along[0] * a + across[0] * b + normal[0] * (board.h[2] + lift),
    board.c[1] + along[1] * a + across[1] * b + normal[1] * (board.h[2] + lift),
    board.c[2] + along[2] * a + across[2] * b + normal[2] * (board.h[2] + lift),
  ];
  const plate: Box = { c: at((a0 + a1) / 2, (b0 + b1) / 2, 0.35), m: board.m, h: [(a1 - a0) / 2, (b1 - b0) / 2, 0.35] };
  const face = (points: Array<[number, number]>, closed = false) => path(points.map(([a, b]) => at(a, b, 0.7)), closed);
  const frame = face(
    [
      [a0 + 5, b0 + 5],
      [a1 - 5, b0 + 5],
      [a1 - 5, b1 - 5],
      [a0 + 5, b1 - 5],
    ],
    true,
  );
  const rules = [0, 1, 2]
    .map((row) =>
      face([
        [a0 + 12, b1 - 15 - row * 10],
        [a0 + [128, 96, 112][row]!, b1 - 15 - row * 10],
      ]),
    )
    .join("");
  const bx0 = a1 - 72;
  const bx1 = a1 - 14;
  const by0 = b0 + 12;
  const by1 = b0 + 36;
  const barBox = face(
    [
      [bx0, by0],
      [bx1, by0],
      [bx1, by1],
      [bx0, by1],
    ],
    true,
  );
  const bars: string[] = [];
  let x = bx0 + 3;
  let index = 0;
  while (x < bx1 - 3) {
    bars.push(
      face([
        [x, by0],
        [x, by1],
      ]),
    );
    x += [2.2, 3.4, 1.6, 4.2, 2.6][index++ % 5]!;
  }
  return S(boxPaths(plate, P), { tone: "mid", crease: "none" }) + L(frame, { tone: "faint" }) + L(rules, { tone: "lo", free: true }) + L(barBox + bars.join(""), { tone: "lo" });
}

/** Packing tape on the near end wall: up over the top edge, its torn end serrated by the dispenser. */
function tapeTab() {
  const x = CX + CL + 0.5;
  const mid = CY + CW / 2;
  const half = 24;
  const bottom = 40;
  const points: Vec3[] = [
    [x, mid - half, CH],
    [x, mid + half, CH],
  ];
  const teeth = 12;
  for (let index = 0; index <= teeth; index++) {
    const y = mid + half - (index / teeth) * half * 2;
    points.push([x, y, bottom + (index % 2 ? 2.6 : 0)]);
  }
  const outline = path(points, true);
  const over = path(
    [
      [CX + CL - CT, mid - half, CH + 0.3],
      [CX + CL - CT, mid + half, CH + 0.3],
      [CX + CL + 0.5, mid + half, CH + 0.3],
      [CX + CL + 0.5, mid - half, CH + 0.3],
    ],
    true,
  );
  return `<path class="uf-tape" d="${outline}"/><path class="uf-tape" d="${over}"/>`;
}

export function cartonSvg(id: string): string {
  const box = SCENERY[id]!;
  if (id === "flap-end-near") return S(boxPaths(box, P), { tone: "mid", crease: "faint" }) + printedLabel(box, [-112, -22, 112, 60]);
  if (id.startsWith("flap")) return S(boxPaths(box, P), { tone: "mid", crease: "faint" });
  if (id === "carton-floor") return S(slab(id, 2, 0), { tone: "lo", crease: "faint" });
  if (id === "carton-filler") {
    // A spacer of three folded layers of board: the layer joints wrap its visible faces.
    const box = SCENERY[id]!;
    const plan: k.Plan = { x: box.c[0] - box.h[0], y: box.c[1] - box.h[1], w: box.h[0] * 2, d: box.h[1] * 2, r: 1.5 };
    const z0 = box.c[2] - box.h[2];
    const layers = L(k.sideSeam(plan, z0 + 16, P, 3) + k.sideSeam(plan, z0 + 32, P, 3), { tone: "faint" });
    return S(k.slabOf(plan, z0, box.h[2] * 2, P, 3, 0.8), { tone: "mid", crease: "faint", inner: layers });
  }
  const solid = S(slab(id), { tone: "mid", crease: "faint" });
  if (id === "carton-end-near") return solid + tapeTab();
  return solid;
}

// ---- Tray ---------------------------------------------------------------------------------------
export function traySvg(id: string): string {
  const box = SCENERY[id]!;
  const plan: k.Plan = { x: box.c[0] - box.h[0], y: box.c[1] - box.h[1], w: box.h[0] * 2, d: box.h[1] * 2, r: id === "tray-floor" ? 5 : 0.8 };
  const solid = k.slabOf(plan, box.c[2] - box.h[2], box.h[2] * 2, P, id === "tray-floor" ? 6 : 2, id.startsWith("tray-div") ? 0 : 0.6);
  return S(solid, { tone: id === "tray-floor" ? "lo" : "mid", crease: "faint" });
}

// ---- Booklet ------------------------------------------------------------------------------------
/** A page point: px across the page from its spine-side edge, py down the page from its top. */
function pageAt(page: "left" | "right", px: number, py: number): Vec3 {
  const spine = BOOK.y + BOOK.d / 2;
  const y = page === "right" ? spine - px : BOOK.y + BOOK.d - px;
  return [BOOK.x + py, y, BOOK.t];
}

const pagePath = (page: "left" | "right", points: Array<[number, number]>, closed = false) => path(points.map(([px, py]) => pageAt(page, px, py)), closed);

function stepDrawing() {
  const R = "right" as const;
  // A board drawn as the manual draws it: its face and front edge, two dowel holes, two dowels above
  // them and an arrow pressing them home. The step number is the figure's one engraved label.
  const face = pagePath(R, [[34, 104], [112, 84], [134, 112], [56, 132]], true);
  const edge = pagePath(R, [[56, 132], [134, 112], [134, 120], [56, 140]], true);
  const holes = [
    [70, 114],
    [102, 106],
  ]
    .map(([px, py]) => pagePath(R, Array.from({ length: 12 }, (_, index) => [px! + Math.cos((index / 12) * Math.PI * 2) * 3.6, py! + Math.sin((index / 12) * Math.PI * 2) * 2.2] as [number, number]), true))
    .join("");
  const dowels = [
    [70, 72],
    [102, 64],
  ]
    .map(([px, py]) => pagePath(R, [[px! - 3.6, py! - 16], [px! + 3.6, py! - 16], [px! + 3.6, py!], [px! - 3.6, py!]], true))
    .join("");
  const shaft = [pageAt(R, 86, 22), pageAt(R, 86, 44)].map(at);
  const head = pagePath(R, [[86, 52], [80.5, 43], [91.5, 43]], true);
  const number = k.topMatrix([pageAt(R, 14, 30)[0], pageAt(R, 14, 30)[1]], BOOK.t, P, "y");
  return (
    L(face + edge, { tone: "lo" }) +
    L(holes, { tone: "lo" }) +
    L(dowels, { tone: "lo" }) +
    k.fadeLineSvg(shaft, { fade: [6, 0], tone: "lo" }) +
    L(head, { tone: "lo" }) +
    k.faceTextSvg(number, "2", { size: 18, tone: "lo", anchor: "start" })
  );
}

function textPage() {
  const Lf = "left" as const;
  // Rule lines stand for printed text; a small pictogram of the cabinet sits above them.
  const rows: string[] = [];
  const lengths = [96, 112, 84, 104, 70, 108, 90];
  lengths.forEach((length, index) => rows.push(pagePath(Lf, [[22, 118 + index * 10], [22 + length, 118 + index * 10]])));
  const icon = pagePath(Lf, [[48, 28], [102, 28], [102, 98], [48, 98]], true);
  const shelf = pagePath(Lf, [[48, 63], [102, 63]]);
  return L(icon + shelf, { tone: "lo" }) + L(rows.join(""), { tone: "faint", free: true });
}

export function bookletSvg() {
  const half = BOOK.d / 2;
  const right: k.Plan = { x: BOOK.x, y: BOOK.y, w: BOOK.w, d: half, r: 2 };
  const left: k.Plan = { x: BOOK.x, y: BOOK.y + half, w: BOOK.w, d: half, r: 2 };
  const leaves = (plan: k.Plan) => L(k.sideSeam(plan, BOOK.t * 0.36, P, 3) + k.sideSeam(plan, BOOK.t * 0.7, P, 3), { tone: "faint" });
  return (
    S(k.slabOf(right, 0, BOOK.t, P, 3, 0.6), { tone: "mid", crease: "faint", inner: leaves(right) }) +
    S(k.slabOf(left, 0, BOOK.t, P, 3, 0.6), { tone: "mid", crease: "faint", inner: leaves(left) }) +
    stepDrawing() +
    textPage()
  );
}

// ---- Hex key ------------------------------------------------------------------------------------
export function keySvg() {
  const r = KEY.across / Math.sqrt(3); // circumradius of a 4 mm hex
  const hex: Array<[number, number]> = Array.from({ length: 6 }, (_, index) => [Math.cos((index * Math.PI) / 3) * r, Math.sin((index * Math.PI) / 3) * r]);
  const z = KEY.across / 2;
  const corner: Vec3 = [KEY.x, KEY.y + KEY.long, z];
  const long = prismOf(frameOf([KEY.x, KEY.y, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]), hex.map(([u, v]) => [v, u] as [number, number]), 0, KEY.long, P);
  const short = prismOf(frameOf(corner, [-1, 0, 0], [0, 1, 0], [0, 0, 1]), hex.map(([u, v]) => [v, u] as [number, number]), 0, KEY.short, P);
  const knuckle = sphereOf(corner, r * 1.04, P);
  return S(short, { tone: "mid", crease: "lo" }) + S(long, { tone: "mid", crease: "lo" }) + S(knuckle, { tone: "mid", crease: "none" });
}

export function scenerySvg(id: string) {
  if (id.startsWith("carton") || id.startsWith("flap")) return cartonSvg(id);
  if (id.startsWith("tray")) return traySvg(id);
  if (id === "booklet") return bookletSvg();
  if (id === "key") return keySvg();
  return "";
}

void CT;
