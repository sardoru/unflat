// Type declarations for the subset of `lathe.mjs` (anatomy kit, MIT) used from TypeScript.
// The implementation is the unmodified kit file next to this one.
import type { Flat, Point3, Projection, SolidPaths } from "./iso-kit";

export type Vec3 = Point3;

export interface Frame {
  o: Vec3;
  a: Vec3;
  u: Vec3;
  v: Vec3;
}

/** A meridian point: [s, r] or [s, r, smooth]. */
export type Knot = [number, number] | [number, number, number];

export interface LatheOptions {
  steps?: number;
  fill?: "auto" | "surface" | "hull" | "facets";
  hole?: [number, number] | null;
  bevel?: number;
  rims?: "all" | "none" | "first" | "last" | "ends";
  smooth?: boolean | "auto" | { rows?: number; slope?: (s: number) => number; radius?: (s: number) => number };
  waist?: number;
}

export interface ArcOptions {
  slope?: number;
  steps?: number;
  least?: number;
  inward?: boolean;
  from?: number;
  to?: number;
  trim?: number;
}

export interface FadedLine {
  d: string;
  alpha: number;
}

export const dot3: (a: Vec3, b: Vec3) => number;
export const add3: (a: Vec3, b: Vec3) => Vec3;
export const sub3: (a: Vec3, b: Vec3) => Vec3;
export const mul3: (a: Vec3, k: number) => Vec3;
export const len3: (a: Vec3) => number;
export const unit3: (a: Vec3) => Vec3;
export const cross3: (a: Vec3, b: Vec3) => Vec3;
export const lerp3: (a: Vec3, b: Vec3, t: number) => Vec3;

export function viewOf(P: Projection): Vec3;
export function lightOf(P: Projection): Vec3;
export const scaleOf: (P: Projection) => number;
export function bandOf(score: number): number;
export const toneOf: (normal: Vec3, P: Projection) => number;

export function frameAlong(o: Vec3, a: Vec3): Frame;
export const frameOf: (o: Vec3, a: Vec3, u: Vec3, v: Vec3) => Frame;
export function pointOf(F: Frame, s: number, r: number, angle: number): Vec3;
export const radialOf: (F: Frame, angle: number) => Vec3;
export const hullOf: (points: Flat[]) => Flat[];
export const stepsFor: (radius: number, least?: number, most?: number, scale?: number) => number;

export function lathe(meridian: Knot[], F: Frame, P: Projection, options?: LatheOptions): SolidPaths;
export const disc: (s0: number, s1: number, r: number, F: Frame, P: Projection, options?: LatheOptions) => SolidPaths;
export const ringBand: (s0: number, s1: number, rIn: number, rOut: number, F: Frame, P: Projection, options?: LatheOptions) => SolidPaths;
export function solidOf(profile: Knot[], F: Frame, P: Projection, options?: LatheOptions): SolidPaths;
export function prismOf(F: Frame, polygon: Flat[], s0: number, s1: number, P: Projection): SolidPaths;
export function sphereOf(centre: Vec3, r: number, P: Projection, options?: { steps?: number }): SolidPaths;

export function arcOf(F: Frame, s: number, r: number, P: Projection, options?: ArcOptions): string;
export function circleOf(F: Frame, s: number, r: number, P: Projection, steps?: number): string;
export const fadeOf: (value: number, range: [number, number]) => number;
export function ribsOf(
  F: Frame,
  s0: number,
  s1: number,
  r: number,
  count: number,
  P: Projection,
  options: { phase?: number; twist?: number; least?: number; r1?: number; fade: [number, number]; seams?: boolean | "first" | "last" },
): FadedLine[];
export function ribsOf(
  F: Frame,
  s0: number,
  s1: number,
  r: number,
  count: number,
  P: Projection,
  options?: { phase?: number; twist?: number; least?: number; r1?: number; fade?: null; seams?: boolean | "first" | "last" },
): string;
export function dotsOf(
  F: Frame,
  s: number,
  r: number,
  count: number,
  P: Projection,
  options?: { phase?: number; slope?: number; least?: number; all?: boolean; fade?: [number, number] | null },
): Array<Flat | [number, number, number]>;
