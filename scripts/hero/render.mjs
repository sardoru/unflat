// Renders still pages of Fig 1 at chosen moments, straight from the TypeScript modules, so the
// figure can be captured and checked without a dev server.
//   node scripts/hero/render.mjs --out <dir> [--s 0,1,3.5,7] [--light]
import "./ts-hooks.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const out = option("--out", join(ROOT, ".hero-shots"));
const moments = option("--s", "0,0.5,1,4,7").split(",").map(Number);
const theme = args.includes("--light") ? "light" : "dark";

const k = await import(join(ROOT, "src/lib/iso/iso-kit.ts"));
const { sceneAt, sceneSvg } = await import(join(ROOT, "src/components/hero/scene.ts"));
const { WIDTH, HEIGHT } = await import(join(ROOT, "src/components/hero/view.ts"));
const heroCss = readFileSync(join(ROOT, "src/components/hero/hero.css"), "utf8");

mkdirSync(out, { recursive: true });
for (const s of moments) {
  const started = performance.now();
  const scene = sceneAt(s);
  const ms = performance.now() - started;
  const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: "Fig 1", body: sceneSvg(scene) });
  const body = `<div class="iso uf-hero" data-theme="${theme}">${k.plateHtml({
    fig: "Fig 1",
    title: "Flat-pack, unflattened",
    hint: "Hover to assemble",
    readout: scene.readout,
    body: `<div class="uf-stage">${svg}</div>`,
  })}</div>`;
  const html = k.pageHtml({ title: `Fig 1 s=${s}`, theme, body, width: 640 }).replace("</style>", `${heroCss}</style>`);
  const file = join(out, `still-${theme}-${String(s).replace(".", "_")}.html`);
  writeFileSync(file, html);
  console.log(`s=${s} ${theme} · ${scene.items.length} items · ${ms.toFixed(1)} ms · ${(html.length / 1024).toFixed(0)} KB · ${scene.readout} → ${file}`);
}
