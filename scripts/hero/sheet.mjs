// A contact sheet of Fig 1 stills at many moments s, on one page, for checking motion frame by frame.
//   node scripts/hero/sheet.mjs --out <file.html> --s 0,0.1,...  [--light] [--cols 4] [--crop x,y,w,h]
import "./ts-hooks.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const out = option("--out", join(ROOT, ".hero-shots", "sheet.html"));
const moments = option("--s", "0,0.2,0.4,0.6,0.8,1").split(",").map(Number);
const theme = args.includes("--light") ? "light" : "dark";
const cols = Number(option("--cols", "3"));
const crop = option("--crop", null)?.split(",").map(Number);

const k = await import(join(ROOT, "src/lib/iso/iso-kit.ts"));
const { sceneAt, sceneSvg } = await import(join(ROOT, "src/components/hero/scene.ts"));
const { WIDTH, HEIGHT } = await import(join(ROOT, "src/components/hero/view.ts"));
const heroCss = readFileSync(join(ROOT, "src/components/hero/hero.css"), "utf8");

const viewBox = crop ? crop.join(" ") : `0 0 ${WIDTH} ${HEIGHT}`;
const cells = moments.map((s) => {
  const scene = sceneAt(s);
  const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: `s ${s}`, body: sceneSvg(scene) }).replace(`viewBox="0 0 ${WIDTH} ${HEIGHT}"`, `viewBox="${viewBox}"`);
  return `<div class="cell"><div class="tag">s ${s.toFixed(2)} · ${scene.readout}</div>${svg}</div>`;
});
const css = `${heroCss}
body{margin:0;background:var(--anatomy-card)}
.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px}
.cell{position:relative;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-faint)}
.tag{position:absolute;left:6px;top:4px;font:10px ui-monospace,monospace;color:var(--anatomy-text)}`;
const page = `<!doctype html><html><head><meta charset="utf-8"><style>${k.ISO_CSS}${css}</style></head><body class="iso uf-hero" data-theme="${theme}"><div class="grid iso-plate" style="padding:6px">${cells.join("")}</div></body></html>`;
writeFileSync(out, page);
console.log("wrote", out, moments.length, "frames");
