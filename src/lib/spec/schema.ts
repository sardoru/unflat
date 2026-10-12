/**
 * JSON Schemas for Claude's structured output (output_config.format).
 * Every object lists all of its properties as required with
 * additionalProperties: false; "optional" values use sentinels ("" or []).
 */

export const AXES = ["x", "-x", "y", "-y", "z", "-z"] as const;
export const POSES = ["upright", "on-back", "on-front", "on-left", "on-right", "upside-down"] as const;
export const VIEWS = [
  "auto",
  "front",
  "front-right",
  "front-left",
  "back",
  "back-right",
  "back-left",
  "left",
  "right",
  "top",
  "below",
] as const;
export const FROMS = ["auto", "above", "below", "front", "back", "left", "right"] as const;
export const STRUCTURAL_KINDS = [
  "panel",
  "board",
  "back",
  "door",
  "drawer_front",
  "rail",
  "leg",
  "rod",
  "glass",
  "other",
] as const;
export const HARDWARE_KINDS = [
  "dowel",
  "screw",
  "bolt",
  "cam_lock",
  "cam_bolt",
  "nail",
  "shelf_pin",
  "plug",
  "washer",
  "nut",
  "hinge",
  "knob",
  "handle",
  "foot",
  "bracket",
] as const;
export const PART_KINDS = [...STRUCTURAL_KINDS, ...HARDWARE_KINDS, "tool"] as const;
export const SHAPES = ["box", "cylinder", "l-bracket", "sphere"] as const;
export const MATERIALS = ["white", "wood", "dark", "metal", "plastic", "glass"] as const;

type JsonSchema = Record<string, unknown>;

const str = (description?: string): JsonSchema => (description ? { type: "string", description } : { type: "string" });
const num = (description?: string): JsonSchema => (description ? { type: "number", description } : { type: "number" });
const int = (description?: string): JsonSchema => (description ? { type: "integer", description } : { type: "integer" });
const bool = (description?: string): JsonSchema => (description ? { type: "boolean", description } : { type: "boolean" });
const arr = (items: JsonSchema, description?: string): JsonSchema =>
  description ? { type: "array", items, description } : { type: "array", items };
const oneOf = (values: readonly string[], description?: string): JsonSchema =>
  description ? { type: "string", enum: [...values], description } : { type: "string", enum: [...values] };
const obj = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const vec3 = (description: string) => arr(num(), description);

const product = obj({
  name: str("Product name as printed, e.g. BILLY"),
  type: str("What it is, e.g. Bookcase"),
  size: vec3("[width, height, depth] in cm as assembled"),
  people: int("People needed (1 or 2)"),
  minutes: num("Estimated total assembly minutes"),
  ref: str("Manual reference printed on it, e.g. AA-2289108-3, or empty"),
});

const part = obj({
  key: str("Unique key; use the manual's own label (letter or part number) when it prints one"),
  name: str("Plain name, e.g. Side panel, Wooden dowel, Cam lock"),
  code: str("Part number or letter printed in the manual, or empty"),
  kind: oneOf(PART_KINDS),
  qty: int("Count in the box"),
  shape: oneOf(SHAPES, "Structural parts: box, cylinder, l-bracket or sphere. Hardware and tools: box (ignored)"),
  size: arr(
    num(),
    "cm. box: [x, y, z] as installed in the final product frame. cylinder and hardware: [diameter, length]. l-bracket: [legA, legB, width]. sphere: [diameter]",
  ),
  material: oneOf(MATERIALS),
});

const subAssembly = obj({
  key: str(),
  name: str(),
  offset: vec3("Where it is built: offset in cm (world frame) from its final position, clear of the main assembly"),
  joins: int("Step at which it moves into its final position"),
});

const act = obj({
  text: str("One short imperative action"),
  target: str("Placement id this points at, or empty"),
});

const step = obj({
  n: int("1-based, sequential"),
  title: str("Short imperative title, sentence case"),
  text: str("One or two plain sentences"),
  acts: arr(act, "2 to 4 numbered actions"),
  pose: oneOf(POSES, "How the main assembly lies on the floor during this step"),
  view: oneOf(VIEWS, "Camera direction in the world frame; auto unless the work faces a specific side"),
  tip: str("One practical tip or warning, or empty"),
  pages: arr(int(), "1-based pages of the uploaded document this step comes from"),
  people: int("1 or 2"),
  minutes: num(),
  tools: arr(str(), "Keys of tool parts used in this step"),
  wall: bool("True when the step fixes the product to a wall"),
  caution: bool("True when the manual marks the step with a warning"),
});

const outlineFields = {
  product,
  parts: arr(part),
  assemblies: arr(subAssembly, "Sub-assemblies built apart from the main body (drawers, doors). Empty if none"),
  steps: arr(step),
  assumptions: arr(str(), "Everything you had to estimate or could not read"),
  layout: str(
    "Notes for the 3D layout pass: overall frame, panel thicknesses, shelf heights, hole patterns, which edges get which hardware",
  ),
};

export const OUTLINE_SCHEMA: JsonSchema = obj(outlineFields);

const placement = obj({
  id: str("Unique id, e.g. side-left, dowels-shelf-top"),
  part: str("Part key"),
  step: int("Step that adds it"),
  at: arr(
    vec3("x, y, z"),
    "Positions in cm, product frame. Structural parts: centre. Hardware: the hole mouth on the surface it enters. Several positions = several identical parts added together",
  ),
  axis: oneOf(AXES, "Cylinders: long axis. Hardware: insertion direction pointing INTO the material. Boxes: y"),
  rot: vec3("Extra rotation in degrees, normally [0, 0, 0]"),
  size: arr(num(), "Size override for this placement, or [] to use the part size"),
  asm: str("Sub-assembly key, or empty for the main assembly"),
  from: oneOf(FROMS, "Approach direction in the world frame; auto is right for most parts"),
});

const layoutFields = {
  placements: arr(placement),
  marks: arr(
    obj({
      step: int(),
      targets: arr(str(), "Placement id for each act of the step, in order; empty string when an act points at nothing"),
    }),
  ),
  sizes: arr(obj({ key: str(), size: arr(num()) }), "Part size corrections found while laying out, or empty"),
  assumptions: arr(str(), "Layout estimates worth checking"),
};

export const LAYOUT_SCHEMA: JsonSchema = obj(layoutFields);
