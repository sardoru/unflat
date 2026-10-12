// Camera and layout for Fig 1. The cabinet front faces +x, so an azimuth under 45° turns the
// open front toward the reader; at 35° the kit's prism tones and lathe tones agree on every
// axis-aligned face, so a panel looks the same whether it is drawn flat-packed or standing.
import { boxCorners, fitProjection, iso, type Flat, type Plan, type Point3, type Projection } from "../../lib/iso/iso-kit";
import { CAB } from "./model";

export const WIDTH = 600;
export const HEIGHT = 440;
export const AZIMUTH = 35;

/** The bench plate: under the carton and its drooping flaps, the cabinet apart, the booklet and tray. */
export const PLATE: Plan = { x: -260, y: -770, w: 1050, d: 1500, r: 28 };
export const PLATE_H = 28;
export const FOOT_H = 14;

export const P: Projection = fitProjection(
  [
    ...boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    ...boxCorners({ x: -126, y: 0, w: CAB.d + 126, d: CAB.w, r: 0 }, 0, CAB.h),
    [CAB.d, CAB.w + 92, CAB.h],
  ],
  WIDTH,
  HEIGHT,
  { pad: 14, azimuth: AZIMUTH },
);

export const at = (point: Point3): Flat => iso(point, P);
