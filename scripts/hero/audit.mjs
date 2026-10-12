// Audit for Fig 1, run over every frame of the motion (s from 0 to 7 in small steps):
//   through  two solids pass through each other in some frame (a part flying through another, or
//            sunk into it). The painter's sort is exact only for disjoint solids, so this must be 0.
//   order    a pair that overlaps on screen is painted against its depth rule (a broken cycle).
// Sort shapes are the parts' true boxes; turned parts are cut where they sink into a host face.
//   node scripts/hero/audit.mjs [--step 0.01]
import "./ts-hooks.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const at = args.indexOf("--step");
const step = at >= 0 ? Number(args[at + 1]) : 0.01;

const { frameAt } = await import(join(ROOT, "src/components/hero/frame.ts"));
const { paintOrder, inFront, hullsOverlap } = await import(join(ROOT, "src/components/hero/order.ts"));
const { SCENERY } = await import(join(ROOT, "src/components/hero/scenery-shapes.ts"));
const { cornersOf } = await import(join(ROOT, "src/components/hero/box.ts"));
const { P, PLATE, PLATE_H } = await import(join(ROOT, "src/components/hero/view.ts"));
const { S_BUILT } = await import(join(ROOT, "src/components/hero/model.ts"));
const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
// The bench plate under everything: nothing may sink into it.
const BENCH = { c: [PLATE.x + PLATE.w / 2, PLATE.y + PLATE.d / 2, -PLATE_H / 2], m: IDENTITY, h: [PLATE.w / 2, PLATE.d / 2, PLATE_H / 2] };
const { iso } = await import(join(ROOT, "src/lib/iso/iso-kit.ts"));
const { viewOf, hullOf } = await import(join(ROOT, "src/lib/iso/lathe.mjs"));

const V = viewOf(P);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const radius = (box, n) => box.h[0] * Math.abs(dot(n, box.m[0])) + box.h[1] * Math.abs(dot(n, box.m[1])) + box.h[2] * Math.abs(dot(n, box.m[2]));

/** How deep two boxes overlap along their best separating axis (≤ 0 when disjoint or touching). */
function penetration(a, b) {
  const axes = [...a.m, ...b.m];
  for (const p of a.m)
    for (const q of b.m) {
      const n = cross(p, q);
      const l = Math.hypot(...n);
      if (l > 1e-6) axes.push(n.map((x) => x / l));
    }
  const d = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]];
  let least = Infinity;
  for (const n of axes) least = Math.min(least, radius(a, n) + radius(b, n) - Math.abs(dot(n, d)));
  return least;
}

const through = new Map();
const wrong = new Map();
let frames = 0;
const started = performance.now();
for (let index = 0; index * step <= S_BUILT + 1e-9; index++) {
  const s = Math.min(S_BUILT, index * step);
  frames++;
  const states = frameAt(s, P);
  const items = Object.entries(SCENERY).map(([id, box]) => ({ id, box, moving: false }));
  for (const state of states) if (state.visible && state.box) items.push({ id: state.id, box: state.box, moving: true });
  for (const item of items) {
    if (!item.moving) continue;
    const depth = penetration(BENCH, item.box);
    if (depth > 0.25) {
      const key = `bench × ${item.id}`;
      const seen = through.get(key) ?? { from: s, to: s, depth: 0 };
      seen.to = s;
      seen.depth = Math.max(seen.depth, depth);
      through.set(key, seen);
    }
  }
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (!a.moving && !b.moving) continue;
      const depth = penetration(a.box, b.box);
      if (depth > 0.25) {
        const key = `${a.id} × ${b.id}`;
        const seen = through.get(key) ?? { from: s, to: s, depth: 0 };
        seen.to = s;
        seen.depth = Math.max(seen.depth, depth);
        through.set(key, seen);
      }
    }
  const order = paintOrder(items, P);
  const rank = new Map(order.map((id, position) => [id, position]));
  const hulls = items.map((item) => hullOf(cornersOf(item.box).map((point) => iso(point, P))));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      if (!hullsOverlap(hulls[i], hulls[j])) continue;
      const verdict = inFront(items[i].box, items[j].box, V);
      if (verdict === 0) continue;
      const front = verdict > 0 ? items[j] : items[i];
      const back = verdict > 0 ? items[i] : items[j];
      if (rank.get(front.id) < rank.get(back.id)) {
        const key = `${back.id} under ${front.id}`;
        const seen = wrong.get(key) ?? { from: s, to: s };
        seen.to = s;
        wrong.set(key, seen);
      }
    }
}

const fmt = (value) => value.toFixed(2);
console.log(`frames: ${frames} (s 0..${S_BUILT} every ${step}) · ${((performance.now() - started) / 1000).toFixed(1)} s`);
console.log(`through: ${through.size} pairs`);
for (const [key, { from, to, depth }] of through) console.log(`  through  ${key}  s ${fmt(from)}..${fmt(to)}  depth ${depth.toFixed(1)} mm`);
console.log(`order: ${wrong.size} pairs painted against their depth rule`);
for (const [key, { from, to }] of wrong) console.log(`  order    ${key}  s ${fmt(from)}..${fmt(to)}`);
const failures = through.size + wrong.size;
console.log(failures ? `audit failed: ${failures} problems` : "audit passed");
process.exitCode = failures ? 1 : 0;
