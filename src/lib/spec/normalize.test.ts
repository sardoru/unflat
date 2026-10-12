import { describe, expect, it } from "vitest";
import { mergeSpec, normalizeLayout, normalizeOutline, normalizeSpec, stepParts } from "./normalize";
import billy from "../../data/demo-billy.json";

const outlineRaw = {
  product: { name: "Test", type: "Shelf", size: [60, 80, 30], people: 1, minutes: 10, ref: "" },
  parts: [
    { key: "side", name: "Side", code: "", kind: "panel", qty: 2, shape: "box", size: [1.6, 80, 30], material: "white" },
    { key: "shelf", name: "Shelf", code: "", kind: "board", qty: 1, shape: "box", size: [56.8, 1.6, 30], material: "white" },
    { key: "101351", name: "Dowel", code: "101351", kind: "dowel", qty: 4, shape: "box", size: [], material: "wood" },
    { key: "side", name: "Duplicate key", code: "", kind: "panel", qty: 1, shape: "box", size: [1, 1, 1], material: "white" },
    { key: "driver", name: "Screwdriver", code: "", kind: "tool", qty: 1, shape: "box", size: [], material: "metal" },
  ],
  assemblies: [],
  steps: [
    { n: 5, title: "Second", text: "", acts: [{ text: "Do it", target: "" }], pose: "upright", view: "auto", tip: "", pages: [3], people: 1, minutes: 2, tools: ["driver", "nope"], wall: false, caution: false },
    { n: 2, title: "First", text: "", acts: [], pose: "sideways", view: "weird", tip: "", pages: [2], people: 1, minutes: 2, tools: [], wall: false, caution: false },
  ],
  assumptions: ["a guess"],
  layout: "",
};

describe("normalizeOutline", () => {
  it("renumbers steps in order and repairs bad enums", () => {
    const { outline } = normalizeOutline(outlineRaw);
    expect(outline.steps.map((s) => [s.n, s.title])).toEqual([
      [1, "First"],
      [2, "Second"],
    ]);
    expect(outline.steps[0].pose).toBe("upright");
    expect(outline.steps[0].view).toBe("auto");
    expect(outline.steps[1].tools).toEqual(["driver"]);
  });

  it("gives hardware default sizes and de-duplicates keys", () => {
    const { outline } = normalizeOutline(outlineRaw);
    const keys = outline.parts.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(outline.parts.find((p) => p.key === "101351")!.size).toEqual([0.8, 3]);
  });

  it("survives garbage", () => {
    const { outline, warnings } = normalizeOutline("not json at all");
    expect(outline.steps).toEqual([]);
    expect(warnings.some((w) => w.level === "check")).toBe(true);
  });
});

describe("layout + merge", () => {
  const { outline } = normalizeOutline(outlineRaw);
  const layoutRaw = {
    placements: [
      { id: "side-l", part: "side", step: 1, at: [[-29.2, 40, 0]], axis: "y", rot: [0, 0, 0], size: [], asm: "", from: "auto" },
      { id: "side-r", part: "side", step: 1, at: [[29.2, 40, 0]], axis: "y", rot: [0, 0, 0], size: [], asm: "", from: "auto" },
      { id: "shelf", part: "shelf", step: 2, at: [[0, 40, 0]], axis: "y", rot: [0, 0, 0], size: [], asm: "nope", from: "sideways" },
      { id: "dowels", part: "101351", step: 99, at: [[-28.4, 40, 5], [1, 2], [-28.4, 40, -5]], axis: "x", rot: [0, 0, 0], size: [], asm: "", from: "auto" },
      { id: "ghost", part: "missing", step: 1, at: [[0, 0, 0]], axis: "y", rot: [0, 0, 0], size: [], asm: "", from: "auto" },
      { id: "tool", part: "driver", step: 1, at: [[0, 0, 0]], axis: "y", rot: [0, 0, 0], size: [], asm: "", from: "auto" },
    ],
    marks: [{ step: 2, targets: ["shelf"] }, { step: 7, targets: ["x"] }],
    sizes: [],
    assumptions: [],
  };

  it("drops unknown parts and tools, clamps steps and repairs references", () => {
    const { layout, warnings } = normalizeLayout(layoutRaw, outline);
    expect(layout.placements.map((p) => p.id)).toEqual(["side-l", "side-r", "shelf", "dowels"]);
    expect(layout.placements.find((p) => p.id === "dowels")!.step).toBe(2);
    expect(layout.placements.find((p) => p.id === "dowels")!.at).toHaveLength(2);
    expect(layout.placements.find((p) => p.id === "shelf")!.asm).toBe("");
    expect(layout.placements.find((p) => p.id === "shelf")!.from).toBe("auto");
    expect(layout.marks).toHaveLength(1);
    expect(warnings.some((w) => w.text.includes("unknown part"))).toBe(true);
  });

  it("merges marks into act targets and counts parts per step", () => {
    const { layout } = normalizeLayout(layoutRaw, outline);
    const { spec } = mergeSpec(outline, layout);
    expect(spec.steps[1].acts[0].target).toBe("shelf");
    expect(stepParts(spec).get(2)).toEqual([
      ["shelf", 1],
      ["101351", 2],
    ]);
  });

  it("flags interpenetrating boxes", () => {
    const { layout } = normalizeLayout(
      { ...layoutRaw, placements: [...layoutRaw.placements, { id: "clash", part: "shelf", step: 2, at: [[0, 40.5, 0]], axis: "y", rot: [0, 0, 0], size: [], asm: "", from: "auto" }] },
      outline,
    );
    const { warnings } = mergeSpec(outline, layout);
    expect(warnings.some((w) => w.text.includes("overlap"))).toBe(true);
  });
});

describe("normalizeSpec on real output", () => {
  it("keeps the BILLY demo intact and clean", () => {
    const { spec, warnings } = normalizeSpec((billy as { spec: unknown }).spec);
    expect(spec.steps).toHaveLength(12);
    expect(spec.placements.length).toBeGreaterThan(25);
    expect(warnings.filter((w) => w.level === "check")).toEqual([]);
    expect(spec.steps.every((s, i) => s.n === i + 1)).toBe(true);
  });

  it("caps string lengths from the model", () => {
    const long = "x".repeat(5000);
    const { spec } = normalizeSpec({ ...(billy as { spec: Record<string, unknown> }).spec, product: { name: long, type: "t", size: [1, 1, 1] } });
    expect(spec.product.name.length).toBeLessThanOrEqual(60);
  });
});
