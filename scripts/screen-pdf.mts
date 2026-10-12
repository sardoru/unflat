// Run the full content gate (local scan + Haiku classifier) on PDFs.
// Usage: npx tsx --env-file=.env.local scripts/screen-pdf.mts <file.pdf> [more.pdf ...]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { documentBlocks } from "../src/lib/parse/run";
import { inspectPdf } from "../src/lib/server/pdf";
import { classify, scanText } from "../src/lib/server/screen";

const files = process.argv.slice(2);
await Promise.all(
  files.map(async (file) => {
    const data = await readFile(file);
    const facts = await inspectPdf(new Uint8Array(data), 80);
    const scan = scanText(facts);
    if (!scan.ok) return console.log(`${path.basename(file)}: BLOCKED locally — ${scan.reason}`);
    const t0 = Date.now();
    const v = await classify(documentBlocks({ kind: "pdf", name: path.basename(file), data }), scan.flags);
    console.log(`${path.basename(file)}: ${v.ok ? "PASS" : "BLOCKED by classifier — " + v.reason} (${v.product || "-"}; $${v.costUsd.toFixed(4)}; ${Date.now() - t0} ms; flags: ${scan.flags.join(", ") || "none"})`);
  }),
);
