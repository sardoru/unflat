// Print what the upload gate sees in PDFs: pages, text layer, injection scan.
// Usage: npx tsx scripts/inspect-pdf.mts <file.pdf> [more.pdf ...]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inspectPdf } from "../src/lib/server/pdf";
import { scanText } from "../src/lib/server/screen";

for (const file of process.argv.slice(2)) {
  const t0 = Date.now();
  const facts = await inspectPdf(new Uint8Array(await readFile(file)), 80);
  const chars = facts.text.reduce((a, s) => a + s.length, 0);
  console.log(path.basename(file), { pages: facts.pages, encrypted: facts.encrypted, chars, tinyChars: facts.tinyChars, ms: Date.now() - t0 });
  console.log("  scan:", JSON.stringify(scanText(facts)));
}
