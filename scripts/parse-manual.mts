// Run both passes on a manual from the command line and save the results.
// Usage: npx tsx --env-file=.env.local scripts/parse-manual.mts <file.pdf> <outDir> ["hint"]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runPhase, type PhaseEvent, type SourceFile } from "../src/lib/parse/run";
import { mergeSpec, normalizeLayout, normalizeOutline } from "../src/lib/spec/normalize";

const [file, outDir, hint = ""] = process.argv.slice(2);
if (!file || !outDir) {
  console.error("usage: parse-manual.mts <file.pdf> <outDir> [hint]");
  process.exit(2);
}
await mkdir(outDir, { recursive: true });
const src: SourceFile = { kind: "pdf", name: path.basename(file), data: await readFile(file) };

let thinking = "";
const log = (phase: string) => (e: PhaseEvent) => {
  if (e.type === "thinking") thinking += e.text;
  else if (e.type === "progress") process.stdout.write(`\r${phase}: ${e.chars} chars of JSON   `);
  else if (e.type === "fallback") console.log(`\n${phase}: served by fallback ${e.model}`);
};

const t0 = Date.now();
const read = await runPhase("read", src, { hint, onEvent: log("read") });
await writeFile(path.join(outDir, "read.raw.json"), JSON.stringify(read.json, null, 2));
const { outline, warnings: w1 } = normalizeOutline(read.json);
console.log(`\nread: ${outline.steps.length} steps, ${outline.parts.length} parts, ${read.usage.seconds}s, $${read.usage.costUsd.toFixed(3)}`, read.usage);

const build = await runPhase("build", src, { hint, outline, onEvent: log("build") });
await writeFile(path.join(outDir, "build.raw.json"), JSON.stringify(build.json, null, 2));
const { layout, warnings: w2 } = normalizeLayout(build.json, outline);
const { spec, warnings: w3 } = mergeSpec(outline, layout);
console.log(`\nbuild: ${layout.placements.length} placements, ${build.usage.seconds}s, $${build.usage.costUsd.toFixed(3)}`, build.usage);

await writeFile(path.join(outDir, "spec.json"), JSON.stringify(spec, null, 2));
await writeFile(path.join(outDir, "warnings.json"), JSON.stringify([...w1, ...w2, ...w3], null, 2));
await writeFile(path.join(outDir, "thinking.txt"), thinking);
await writeFile(path.join(outDir, "usage.json"), JSON.stringify({ read: read.usage, build: build.usage, totalSeconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s → ${outDir}`);
console.log("warnings:", [...w1, ...w2, ...w3].map((w) => `[${w.level}] ${w.text}`).join("\n  "));
