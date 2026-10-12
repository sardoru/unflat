import { AXES, FROMS, MATERIALS, PART_KINDS, POSES, SHAPES, VIEWS, HARDWARE_KINDS } from "./schema";
import type {
  Act,
  AssemblySpec,
  Axis,
  ManualLayout,
  ManualOutline,
  PartDef,
  PartKind,
  Placement,
  Product,
  Step,
  SubAssembly,
  Vec3,
  Warning,
} from "./types";

/** Default [diameter, length] in cm for hardware the manual doesn't size. */
export const HARDWARE_DEFAULTS: Record<string, number[]> = {
  dowel: [0.8, 3],
  screw: [0.4, 2.5],
  bolt: [0.6, 4],
  cam_lock: [1.5, 1.2],
  cam_bolt: [0.6, 3.4],
  nail: [0.16, 2],
  shelf_pin: [0.5, 1.6],
  plug: [0.8, 3],
  washer: [1.6, 0.15],
  nut: [1, 0.6],
  hinge: [3.5, 1.2],
  knob: [3, 2.5],
  handle: [1.2, 12],
  foot: [2.5, 1],
  bracket: [6, 6, 1.6],
};

const HARDWARE = new Set<string>(HARDWARE_KINDS);

export const isHardware = (kind: PartKind) => HARDWARE.has(kind);
export const isTool = (kind: PartKind) => kind === "tool";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function text(v: unknown, max: number, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function int(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (!finite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (!finite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function oneOf<T extends string>(v: unknown, values: readonly T[], fallback: T): T {
  return typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

function vec3(v: unknown): Vec3 | null {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(finite)) return null;
  return [round(v[0]), round(v[1]), round(v[2])];
}

const round = (n: number) => Math.round(n * 100) / 100;

function positiveSizes(v: unknown): number[] {
  const a = asArr(v);
  if (!a.length || !a.every((n) => finite(n) && n > 0)) return [];
  return a.map((n) => round(n as number));
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function uniqueKey(base: string, taken: Set<string>): string {
  let k = base || "part";
  let i = 2;
  while (taken.has(k)) k = `${base}-${i++}`;
  taken.add(k);
  return k;
}

/** Required size length per shape/kind, with sensible fallbacks. */
export function partSize(p: Pick<PartDef, "kind" | "shape" | "size">): number[] {
  if (isTool(p.kind)) return p.size.length ? p.size : [2, 20];
  if (isHardware(p.kind)) {
    const want = p.kind === "bracket" ? 3 : 2;
    if (p.size.length >= want) return p.size.slice(0, want);
    return HARDWARE_DEFAULTS[p.kind] ?? [1, 2];
  }
  switch (p.shape) {
    case "box":
      return p.size.length >= 3 ? p.size.slice(0, 3) : [];
    case "cylinder":
      return p.size.length >= 2 ? p.size.slice(0, 2) : [];
    case "l-bracket":
      return p.size.length >= 3 ? p.size.slice(0, 3) : [6, 6, 1.6];
    case "sphere":
      return p.size.length >= 1 ? p.size.slice(0, 1) : [3];
  }
}

function normProduct(raw: unknown, w: Warning[]): Product {
  const r = isRec(raw) ? raw : {};
  const size = vec3(r.size);
  if (!size || size.some((n) => n <= 0)) w.push({ level: "check", text: "Overall size not found; derived from the parts." });
  return {
    name: text(r.name, 60, "Untitled"),
    type: text(r.type, 60, "Furniture"),
    size: size && size.every((n) => n > 0) ? size : [0, 0, 0],
    people: int(r.people, 1, 1, 4),
    minutes: num(r.minutes, 0, 0, 24 * 60),
    ref: text(r.ref, 40),
  };
}

function normParts(raw: unknown, w: Warning[]): PartDef[] {
  const taken = new Set<string>();
  const out: PartDef[] = [];
  for (const item of asArr(raw)) {
    if (!isRec(item)) continue;
    const name = text(item.name, 60);
    const base = text(item.key, 40) || slug(name);
    if (!base) continue;
    const kind = oneOf(item.kind, PART_KINDS, "other");
    const shape = oneOf(item.shape, SHAPES, "box");
    const p: PartDef = {
      key: uniqueKey(base, taken),
      name: name || base,
      code: text(item.code, 24),
      kind,
      qty: int(item.qty, 1, 0, 999),
      shape,
      size: positiveSizes(item.size),
      material: oneOf(item.material, MATERIALS, isHardware(kind) ? "metal" : "white"),
    };
    const size = partSize(p);
    if (!size.length) {
      w.push({ level: "check", text: `No usable size for “${p.name}”; drawn as a placeholder block.` });
      p.size = [10, 10, 10];
      p.shape = "box";
    } else p.size = size;
    out.push(p);
  }
  return out;
}

function normAssemblies(raw: unknown, stepCount: number): SubAssembly[] {
  const taken = new Set<string>();
  const out: SubAssembly[] = [];
  for (const item of asArr(raw)) {
    if (!isRec(item)) continue;
    const key = text(item.key, 40);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    out.push({
      key,
      name: text(item.name, 60, key),
      offset: vec3(item.offset) ?? [0, 0, 0],
      joins: int(item.joins, stepCount, 1, Math.max(1, stepCount)),
    });
  }
  return out;
}

/** Steps sorted, renumbered 1..N; returns the old→new number map. */
function normSteps(raw: unknown, partKeys: Set<string>, toolKeys: Set<string>): { steps: Step[]; renum: Map<number, number> } {
  const items = asArr(raw)
    .filter(isRec)
    .map((r, i) => ({ r, n: int(r.n, i + 1), i }));
  items.sort((a, b) => a.n - b.n || a.i - b.i);
  const renum = new Map<number, number>();
  const steps: Step[] = items.map(({ r, n }, idx) => {
    if (!renum.has(n)) renum.set(n, idx + 1);
    const acts: Act[] = asArr(r.acts)
      .filter(isRec)
      .slice(0, 4)
      .map((a) => ({ text: text(a.text, 200), target: text(a.target, 60) }))
      .filter((a) => a.text);
    return {
      n: idx + 1,
      title: text(r.title, 80, `Step ${idx + 1}`),
      text: text(r.text, 400),
      acts,
      pose: oneOf(r.pose, POSES, "upright"),
      view: oneOf(r.view, VIEWS, "auto"),
      tip: text(r.tip, 240),
      pages: asArr(r.pages)
        .map((p) => int(p, 0, 0, 2000))
        .filter((p) => p > 0)
        .slice(0, 6),
      people: int(r.people, 1, 1, 4),
      minutes: num(r.minutes, 0, 0, 600),
      tools: asArr(r.tools)
        .map((t) => text(t, 40))
        .filter((t) => toolKeys.has(t) || partKeys.has(t))
        .slice(0, 4),
      wall: r.wall === true,
      caution: r.caution === true,
    };
  });
  return { steps, renum };
}

export function normalizeOutline(raw: unknown): { outline: ManualOutline; warnings: Warning[] } {
  const w: Warning[] = [];
  const r = isRec(raw) ? raw : {};
  const parts = normParts(r.parts, w);
  const partKeys = new Set(parts.map((p) => p.key));
  const toolKeys = new Set(parts.filter((p) => p.kind === "tool").map((p) => p.key));
  const { steps } = normSteps(r.steps, partKeys, toolKeys);
  if (!steps.length) w.push({ level: "check", text: "No assembly steps were found in the document." });
  return {
    outline: {
      product: normProduct(r.product, w),
      parts,
      assemblies: normAssemblies(r.assemblies, steps.length),
      steps,
      assumptions: asArr(r.assumptions)
        .map((a) => text(a, 300))
        .filter(Boolean)
        .slice(0, 30),
      layout: text(r.layout, 6000),
    },
    warnings: w,
  };
}

function normPlacements(
  raw: unknown,
  parts: Map<string, PartDef>,
  assemblies: Set<string>,
  stepOf: (n: number) => number,
  w: Warning[],
): Placement[] {
  const taken = new Set<string>();
  const out: Placement[] = [];
  const dropped: string[] = [];
  for (const item of asArr(raw)) {
    if (!isRec(item)) continue;
    const partKey = text(item.part, 40);
    const part = parts.get(partKey);
    const label = text(item.id, 60) || partKey;
    if (!part) {
      dropped.push(`${label} (unknown part “${partKey}”)`);
      continue;
    }
    if (isTool(part.kind)) continue; // tools are drawn beside the work, never placed
    const at = asArr(item.at)
      .map(vec3)
      .filter((v): v is Vec3 => v !== null)
      .slice(0, 64);
    if (!at.length) {
      dropped.push(`${label} (no position)`);
      continue;
    }
    const hw = isHardware(part.kind);
    out.push({
      id: uniqueKey(slug(label) || partKey, taken),
      part: part.key,
      step: stepOf(int(item.step, 1)),
      at,
      axis: oneOf<Axis>(item.axis, AXES, hw ? "-y" : "y"),
      rot: vec3(item.rot) ?? [0, 0, 0],
      size: positiveSizes(item.size),
      asm: assemblies.has(text(item.asm, 40)) ? text(item.asm, 40) : "",
      from: oneOf(item.from, FROMS, "auto"),
    });
  }
  if (dropped.length)
    w.push({ level: "check", text: `Skipped ${dropped.length} placement(s): ${dropped.slice(0, 4).join("; ")}${dropped.length > 4 ? "…" : ""}` });
  return out;
}

export function normalizeLayout(raw: unknown, outline: ManualOutline): { layout: ManualLayout; warnings: Warning[] } {
  const w: Warning[] = [];
  const r = isRec(raw) ? raw : {};
  const parts = new Map(outline.parts.map((p) => [p.key, p]));
  const n = outline.steps.length;
  const placements = normPlacements(
    r.placements,
    parts,
    new Set(outline.assemblies.map((a) => a.key)),
    (s) => Math.min(Math.max(1, s), Math.max(1, n)),
    w,
  );
  const marks = asArr(r.marks)
    .filter(isRec)
    .map((m) => ({ step: int(m.step, 0), targets: asArr(m.targets).map((t) => text(t, 60)) }))
    .filter((m) => m.step >= 1 && m.step <= n);
  const sizes = asArr(r.sizes)
    .filter(isRec)
    .map((s) => ({ key: text(s.key, 40), size: positiveSizes(s.size) }))
    .filter((s) => parts.has(s.key) && s.size.length);
  return {
    layout: {
      placements,
      marks,
      sizes,
      assumptions: asArr(r.assumptions)
        .map((a) => text(a, 300))
        .filter(Boolean)
        .slice(0, 20),
    },
    warnings: w,
  };
}

/** Merge the two passes into one spec, then validate it as a whole. */
export function mergeSpec(outline: ManualOutline, layout: ManualLayout): { spec: AssemblySpec; warnings: Warning[] } {
  const sizes = new Map(layout.sizes.map((s) => [s.key, s.size]));
  const parts = outline.parts.map((p) => {
    const s = sizes.get(p.key);
    if (!s) return p;
    const fixed = partSize({ ...p, size: s });
    return fixed.length ? { ...p, size: fixed } : p;
  });
  const marks = new Map(layout.marks.map((m) => [m.step, m.targets]));
  const steps = outline.steps.map((s) => {
    const t = marks.get(s.n);
    return t ? { ...s, acts: s.acts.map((a, i) => ({ ...a, target: t[i] || a.target })) } : s;
  });
  return normalizeSpec({
    version: 1,
    product: outline.product,
    parts,
    assemblies: outline.assemblies,
    placements: layout.placements,
    steps,
    assumptions: [...outline.assumptions, ...layout.assumptions],
  });
}

/** Validate a full spec (merged, hand-written or loaded from storage). */
export function normalizeSpec(raw: unknown): { spec: AssemblySpec; warnings: Warning[] } {
  const w: Warning[] = [];
  const r = isRec(raw) ? raw : {};
  const parts = normParts(r.parts, w);
  const partMap = new Map(parts.map((p) => [p.key, p]));
  const toolKeys = new Set(parts.filter((p) => p.kind === "tool").map((p) => p.key));
  const { steps, renum } = normSteps(r.steps, new Set(partMap.keys()), toolKeys);
  const n = steps.length;
  const stepOf = (s: number) => renum.get(s) ?? Math.min(Math.max(1, s), Math.max(1, n));
  const assemblies = normAssemblies(r.assemblies, n).map((a) => ({ ...a, joins: stepOf(a.joins) }));
  const placements = normPlacements(r.placements, partMap, new Set(assemblies.map((a) => a.key)), stepOf, w);
  const ids = new Set(placements.map((p) => p.id));
  for (const s of steps) for (const a of s.acts) if (a.target && !ids.has(a.target)) a.target = "";

  const product = normProduct(r.product, []);
  const box = boundsOf(placements, partMap);
  if (product.size.some((v) => v <= 0) && box) {
    product.size = [round(box.max[0] - box.min[0]), round(box.max[1] - box.min[1]), round(box.max[2] - box.min[2])];
  }

  const spec: AssemblySpec = {
    version: 1,
    product,
    parts,
    assemblies,
    placements,
    steps,
    assumptions: asArr(r.assumptions)
      .map((a) => text(a, 300))
      .filter(Boolean)
      .slice(0, 40),
  };
  w.push(...checkSpec(spec));
  return { spec, warnings: dedupe(w) };
}

function dedupe(w: Warning[]): Warning[] {
  const seen = new Set<string>();
  return w.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
}

/** Size of a placement as installed: [x, y, z] extents in cm for boxes, else a bounding cube. */
export function extentsOf(pl: Placement, part: PartDef): Vec3 {
  const s = pl.size.length ? partSize({ ...part, size: pl.size }) : part.size;
  if (part.shape === "box" && !isHardware(part.kind)) {
    const [x, y, z] = s.length >= 3 ? s : [s[0] ?? 1, s[0] ?? 1, s[0] ?? 1];
    if (pl.rot.some((d) => Math.abs(d) > 0.01)) {
      const m = Math.max(x, y, z);
      return [m, m, m];
    }
    return [x, y, z];
  }
  if (part.shape === "sphere" && !isHardware(part.kind)) return [s[0], s[0], s[0]];
  const d = s[0] ?? 1;
  const len = s[1] ?? d;
  const along = (a: Axis) => (a.endsWith("x") ? 0 : a.endsWith("y") ? 1 : 2);
  const e: Vec3 = [d, d, d];
  e[along(pl.axis)] = Math.max(len, d);
  return e;
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export function boundsOf(placements: Placement[], parts: Map<string, PartDef>, filter?: (p: Placement) => boolean): Box3 | null {
  let box: Box3 | null = null;
  for (const pl of placements) {
    if (filter && !filter(pl)) continue;
    const part = parts.get(pl.part);
    if (!part) continue;
    const e = extentsOf(pl, part);
    for (const at of pl.at) {
      const lo: Vec3 = [at[0] - e[0] / 2, at[1] - e[1] / 2, at[2] - e[2] / 2];
      const hi: Vec3 = [at[0] + e[0] / 2, at[1] + e[1] / 2, at[2] + e[2] / 2];
      if (!box) box = { min: [...lo], max: [...hi] };
      else
        for (let i = 0; i < 3; i++) {
          box.min[i] = Math.min(box.min[i], lo[i]);
          box.max[i] = Math.max(box.max[i], hi[i]);
        }
    }
  }
  return box;
}

/** Plausibility checks the reader should see. */
export function checkSpec(spec: AssemblySpec): Warning[] {
  const w: Warning[] = [];
  const parts = new Map(spec.parts.map((p) => [p.key, p]));
  const [W, H, D] = spec.product.size;
  const S = Math.max(W, H, D, 1);

  if (!spec.placements.length) w.push({ level: "check", text: "Nothing was placed in 3D; only the step list is available." });

  // Placed counts against the box contents.
  const placed = new Map<string, number>();
  for (const pl of spec.placements) placed.set(pl.part, (placed.get(pl.part) ?? 0) + pl.at.length);
  for (const p of spec.parts) {
    if (isTool(p.kind) || p.qty === 0) continue;
    const c = placed.get(p.key) ?? 0;
    if (c > p.qty) w.push({ level: "check", text: `${p.name}: ${c} placed but the box holds ${p.qty}.` });
    else if (c === 0) w.push({ level: "info", text: `${p.name} is in the parts list but not used in any step.` });
  }

  // Main-assembly parts far outside the product's overall size.
  if (W > 0 && H > 0 && D > 0) {
    const slack = 0.25 * S;
    for (const pl of spec.placements) {
      if (pl.asm) continue;
      const part = parts.get(pl.part);
      if (!part) continue;
      const far = pl.at.some(
        (a) => Math.abs(a[0]) > W / 2 + slack || a[1] < -slack || a[1] > H + slack || Math.abs(a[2]) > D / 2 + slack,
      );
      if (far) w.push({ level: "check", text: `“${part.name}” (${pl.id}) sits outside the product's overall size.` });
    }
  }

  // Structural boxes that interpenetrate in the finished product.
  const boxes = spec.placements
    .filter((pl) => {
      const part = parts.get(pl.part);
      return part && !pl.asm && part.shape === "box" && !isHardware(part.kind) && !pl.rot.some((d) => Math.abs(d) > 0.01);
    })
    .flatMap((pl) => {
      const e = extentsOf(pl, parts.get(pl.part)!);
      return pl.at.map((a) => ({
        id: pl.id,
        name: parts.get(pl.part)!.name,
        min: [a[0] - e[0] / 2, a[1] - e[1] / 2, a[2] - e[2] / 2] as Vec3,
        max: [a[0] + e[0] / 2, a[1] + e[1] / 2, a[2] + e[2] / 2] as Vec3,
        vol: e[0] * e[1] * e[2],
      }));
    });
  let overlaps = 0;
  for (let i = 0; i < boxes.length && overlaps < 6; i++)
    for (let j = i + 1; j < boxes.length && overlaps < 6; j++) {
      const a = boxes[i],
        b = boxes[j];
      let v = 1;
      for (let k = 0; k < 3; k++) v *= Math.max(0, Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]));
      if (v > 0.2 * Math.min(a.vol, b.vol)) {
        overlaps++;
        w.push({ level: "check", text: `“${a.name}” (${a.id}) and “${b.name}” (${b.id}) overlap in the model.` });
      }
    }
  return w;
}

/** Part counts per step, for the "parts for this step" callout. */
export function stepParts(spec: AssemblySpec): Map<number, [string, number][]> {
  const out = new Map<number, Map<string, number>>();
  for (const pl of spec.placements) {
    const m = out.get(pl.step) ?? new Map<string, number>();
    m.set(pl.part, (m.get(pl.part) ?? 0) + pl.at.length);
    out.set(pl.step, m);
  }
  return new Map([...out].map(([k, m]) => [k, [...m]]));
}
