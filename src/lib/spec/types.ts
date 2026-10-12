/**
 * The assembly spec: the contract between Claude's reading of a manual and the
 * 3D engine that animates it.
 *
 * Conventions (shared with the prompt in src/lib/parse/prompt.ts):
 * - Units are centimetres.
 * - Geometry is described in the FINAL product frame: the finished piece standing
 *   as it is used, origin at the centre of its footprint on the floor, +x to the
 *   right and +z toward the viewer when you face the front, +y up.
 * - Motion (pose, view, approach direction) is described in the WORLD frame: what
 *   you see on the floor at that step.
 */

export type Vec3 = [number, number, number];

export type Axis = "x" | "-x" | "y" | "-y" | "z" | "-z";

/** Whole-assembly orientation during a step (the product frame rotated onto the floor). */
export type Pose = "upright" | "on-back" | "on-front" | "on-left" | "on-right" | "upside-down";

/** Camera direction in the world frame. */
export type View =
  | "auto"
  | "front"
  | "front-right"
  | "front-left"
  | "back"
  | "back-right"
  | "back-left"
  | "left"
  | "right"
  | "top"
  | "below";

/** Where a part comes from when it lands, in the world frame. */
export type From = "auto" | "above" | "below" | "front" | "back" | "left" | "right";

export type PartKind =
  // structural: drawn from `shape` + `size`
  | "panel"
  | "board"
  | "back"
  | "door"
  | "drawer_front"
  | "rail"
  | "leg"
  | "rod"
  | "glass"
  | "other"
  // hardware: drawn from a built-in model sized by `size` = [diameter, length]
  | "dowel"
  | "screw"
  | "bolt"
  | "cam_lock"
  | "cam_bolt"
  | "nail"
  | "shelf_pin"
  | "plug"
  | "washer"
  | "nut"
  | "hinge"
  | "knob"
  | "handle"
  | "foot"
  | "bracket"
  // tools: never placed in the model; shown beside the work in the steps that use them
  | "tool";

export type Shape = "box" | "cylinder" | "l-bracket" | "sphere";

export type Material = "white" | "wood" | "dark" | "metal" | "plastic" | "glass";

export interface PartDef {
  /** Unique key. Use the manual's own label when it prints one (letter or part number). */
  key: string;
  name: string;
  /** Part number or letter printed in the manual, "" if none. */
  code: string;
  kind: PartKind;
  /** Count in the box. */
  qty: number;
  /** Structural parts only; hardware ignores it. */
  shape: Shape;
  /**
   * cm. box: [x, y, z] as installed in the final product frame.
   * cylinder and all hardware: [diameter, length].
   * l-bracket: [legA, legB, width] (thickness is derived).
   * sphere: [diameter].
   */
  size: number[];
  material: Material;
}

export interface SubAssembly {
  key: string;
  name: string;
  /** Where it is built, as an offset (cm, world frame) from its final position. */
  offset: Vec3;
  /** Step at which it moves into its final position. */
  joins: number;
}

export interface Placement {
  /** Unique id, referenced by step acts. */
  id: string;
  /** PartDef key. */
  part: string;
  /** Step that adds it (1-based). */
  step: number;
  /**
   * One or more positions (cm, product frame).
   * box/cylinder/sphere/l-bracket: the centre of the part.
   * hardware: the hole mouth on the surface it goes into.
   */
  at: Vec3[];
  /**
   * Cylinders: the long axis. Hardware: the insertion direction, pointing INTO the
   * material from the hole mouth. Boxes ignore it.
   */
  axis: Axis;
  /** Extra rotation in degrees (x, y, z), normally [0, 0, 0]. */
  rot: Vec3;
  /** Size override for this placement, [] to use the part's size. */
  size: number[];
  /** Sub-assembly key, "" for the main assembly. */
  asm: string;
  from: From;
}

export interface Act {
  text: string;
  /** Placement id this action points at, "" for none. */
  target: string;
}

export interface Step {
  /** 1-based, sequential. */
  n: number;
  title: string;
  text: string;
  acts: Act[];
  pose: Pose;
  view: View;
  tip: string;
  /** Pages of the source document this step comes from (1-based). */
  pages: number[];
  people: number;
  minutes: number;
  /** PartDef keys of kind "tool" used in this step. */
  tools: string[];
  /** Draw a wall behind the product (wall anchoring). */
  wall: boolean;
  /** The manual marks this step with a warning. */
  caution: boolean;
}

export interface Product {
  name: string;
  type: string;
  /** [width, height, depth] in cm, as assembled. */
  size: Vec3;
  people: number;
  minutes: number;
  /** Manual reference printed on it (e.g. "AA-2289108-3"), "" if none. */
  ref: string;
}

export interface AssemblySpec {
  version: 1;
  product: Product;
  parts: PartDef[];
  assemblies: SubAssembly[];
  placements: Placement[];
  steps: Step[];
  /** What the reader of the manual had to estimate or could not read. */
  assumptions: string[];
}

/** Phase 1 output: everything except geometry placements. */
export interface ManualOutline {
  product: Product;
  parts: PartDef[];
  assemblies: SubAssembly[];
  steps: Step[];
  assumptions: string[];
  /** Free-text notes for the 3D layout pass (where things go, heights, hole patterns). */
  layout: string;
}

/** Phase 2 output: the 3D layout. */
export interface ManualLayout {
  placements: Placement[];
  /** Act targets per step, in act order ("" for none). */
  marks: { step: number; targets: string[] }[];
  /** Size corrections found while laying parts out. */
  sizes: { key: string; size: number[] }[];
  assumptions: string[];
}

export interface Warning {
  level: "info" | "check";
  text: string;
}

/** A saved manual (stored as JSON; the viewer renders it). */
export interface ManualRecord {
  id: string;
  createdAt: string;
  source: { name: string; pages: number; kind: "pdf" | "images" };
  spec: AssemblySpec;
  warnings: Warning[];
  /** Page thumbnail URLs keyed by 1-based page number. */
  pageImages: Record<string, string>;
  usage?: UsageSummary;
}

export interface UsageSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  seconds: number;
}
