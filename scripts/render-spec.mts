// Render a spec JSON to a standalone manual HTML file (for checks and captures).
// Usage: npx tsx scripts/render-spec.mts <spec.json> <out.html>
import { readFile, writeFile } from "node:fs/promises";
import { renderManualHtml } from "../src/lib/engine/render";
import { normalizeSpec } from "../src/lib/spec/normalize";

const [inFile, outFile] = process.argv.slice(2);
const raw = JSON.parse(await readFile(inFile, "utf8"));
const { spec, warnings } = normalizeSpec(raw.spec ?? raw);
await writeFile(outFile, renderManualHtml(spec, { warnings, homeUrl: "https://example.com" }));
console.log(`wrote ${outFile}: ${spec.steps.length} steps, ${spec.placements.length} placements, ${warnings.length} warnings`);
for (const w of warnings) console.log(`  [${w.level}] ${w.text}`);
