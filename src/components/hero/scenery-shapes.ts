// Shapes of the parts that never move (carton, tray, booklet, Allen key) as oriented boxes, so the
// live sort can order flying parts against them. Pure numbers: no drawing code is shipped for them.
import type { Box } from "./box";
import { BOOK, CARTON, FILLER, TRAY } from "./model";
import type { Mat3, Vec3 } from "./math";

const RAD = Math.PI / 180;
const { x: CX, y: CY, l: L, w: W, h: H, board: T } = CARTON;

/**
 * Flap angles from closed (degrees). The near long flap droops until its outer corner meets the
 * bench; the end flaps stand open, the near one just past upright with the printed label facing out.
 */
export const FLAPS = { far: 112, near: 214.8, farEnd: 106, nearEnd: 97, width: 168, endLength: 330 } as const;

const axisBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  m: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
});

/** A flap: hinge point, its length axis, the unit vector from hinge to free edge and its outer normal. */
function flapBox(hinge: Vec3, along: Vec3, w: Vec3, t: Vec3, half: number): Box {
  const c: Vec3 = [hinge[0] + w[0] * 84 + t[0] * (T / 2), hinge[1] + w[1] * 84 + t[1] * (T / 2), hinge[2] + w[2] * 84 + t[2] * (T / 2)];
  return { c, m: [along, w, t] as Mat3, h: [half, FLAPS.width / 2, T / 2] };
}

const cs = (deg: number) => [Math.cos(deg * RAD), Math.sin(deg * RAD)] as const;

export function flapBoxes() {
  const [cf, sf] = cs(FLAPS.far);
  const [cn, sn] = cs(FLAPS.near);
  const [ce, se] = cs(FLAPS.farEnd);
  const [cq, sq] = cs(FLAPS.nearEnd);
  return {
    "flap-far": flapBox([CX + L / 2, CY, H], [1, 0, 0], [0, cf, sf], [0, -sf, cf], L / 2),
    "flap-near": flapBox([CX + L / 2, CY + W, H], [-1, 0, 0], [0, -cn, sn], [0, sn, cn], L / 2),
    "flap-end-far": flapBox([CX, CY + W / 2, H], [0, -1, 0], [ce, 0, se], [-se, 0, ce], FLAPS.endLength / 2),
    "flap-end-near": flapBox([CX + L, CY + W / 2, H], [0, 1, 0], [-cq, 0, sq], [sq, 0, cq], FLAPS.endLength / 2),
  };
}

const D = TRAY.div;
/** A 4 mm hex key on the bench beside the booklet: long leg along y, short leg back along -x. */
export const KEY = { x: 642, y: 200, long: 72, short: 24, across: 4 } as const;

export const SCENERY: Record<string, Box> = {
  "carton-floor": axisBox(CX + T, CY + T, 0, CX + L - T, CY + W - T, T),
  "carton-far": axisBox(CX, CY, 0, CX + L, CY + T, H),
  "carton-near": axisBox(CX, CY + W - T, 0, CX + L, CY + W, H),
  "carton-end-far": axisBox(CX, CY + T, 0, CX + T, CY + W - T, H),
  "carton-end-near": axisBox(CX + L - T, CY + T, 0, CX + L, CY + W - T, H),
  "carton-filler": axisBox(FILLER.x, FILLER.y, FILLER.z, FILLER.x + FILLER.w, FILLER.y + FILLER.d, FILLER.z + FILLER.h),
  ...flapBoxes(),
  "tray-floor": axisBox(TRAY.x, TRAY.y, 0, TRAY.x + TRAY.w, TRAY.y + TRAY.d, TRAY.floor),
  "tray-far": axisBox(TRAY.x, TRAY.y, 0, TRAY.x + TRAY.w, TRAY.y + TRAY.wall, TRAY.h),
  "tray-near": axisBox(TRAY.x, TRAY.y + TRAY.d - TRAY.wall, 0, TRAY.x + TRAY.w, TRAY.y + TRAY.d, TRAY.h),
  "tray-back": axisBox(TRAY.x, TRAY.y + TRAY.wall, 0, TRAY.x + TRAY.wall, TRAY.y + TRAY.d - TRAY.wall, TRAY.h),
  "tray-front": axisBox(TRAY.x + TRAY.w - TRAY.wall, TRAY.y + TRAY.wall, 0, TRAY.x + TRAY.w, TRAY.y + TRAY.d - TRAY.wall, TRAY.h),
  "tray-div-x": axisBox(TRAY.divX, TRAY.y + TRAY.wall, TRAY.floor, TRAY.divX + D, TRAY.y + TRAY.d - TRAY.wall, TRAY.h - 4),
  "tray-div-a": axisBox(TRAY.x + TRAY.wall, TRAY.divY, TRAY.floor, TRAY.divX, TRAY.divY + D, TRAY.h - 4),
  "tray-div-b": axisBox(TRAY.divX + D, TRAY.divY, TRAY.floor, TRAY.x + TRAY.w - TRAY.wall, TRAY.divY + D, TRAY.h - 4),
  booklet: axisBox(BOOK.x, BOOK.y, 0, BOOK.x + BOOK.w, BOOK.y + BOOK.d, BOOK.t),
  key: axisBox(KEY.x - KEY.short, KEY.y, 0, KEY.x + KEY.across / 2, KEY.y + KEY.long, KEY.across),
};
