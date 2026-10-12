// Open a manual, the original-page overlay and the notes panel; screenshot each.
// Usage: node scripts/viewer-check.mjs <manualUrl> <outDir>
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [url, outDir] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
page.on("response", (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
await page.goto(url + "#step1", { waitUntil: "load" });
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(outDir, "step1.png") });
const pg = page.locator("button.pg").first();
if (await pg.count()) {
  await pg.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, "page-overlay.png") });
  await page.keyboard.press("Escape");
}
const notes = page.locator("#notesBtn");
if (await notes.isVisible()) {
  await notes.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "notes.png") });
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "no problems");
