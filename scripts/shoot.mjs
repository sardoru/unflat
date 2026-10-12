// Screenshot a manual (file or URL) at given steps, phone and desktop, and report console errors.
// Usage: node scripts/shoot.mjs <file-or-url> <outDir> [steps=0,1,2] [sizes=phone,desktop] [--anim ms]
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [target, outDir, stepsArg = "0,1", sizesArg = "phone,desktop", ...rest] = process.argv.slice(2);
const animIdx = rest.indexOf("--anim");
const animMs = animIdx >= 0 ? Number(rest[animIdx + 1]) : 0;
const SIZES = { phone: { width: 390, height: 844, deviceScaleFactor: 2 }, desktop: { width: 1280, height: 800, deviceScaleFactor: 1 } };
await mkdir(outDir, { recursive: true });
const url = /^https?:/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
for (const size of sizesArg.split(",")) {
  for (const step of stepsArg.split(",")) {
    const page = await browser.newPage({ viewport: { width: SIZES[size].width, height: SIZES[size].height }, deviceScaleFactor: SIZES[size].deviceScaleFactor });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${size} #${step}] ${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`[${size} #${step}] pageerror: ${e.message}`));
    const hash = animMs ? `#step${step}` : `#step${step}&still`;
    await page.goto(url + hash, { waitUntil: "load" });
    await page.waitForTimeout(animMs || 1200);
    const file = path.join(outDir, `${size}-step${step}${animMs ? "-t" + animMs : ""}.png`);
    await page.screenshot({ path: file });
    await page.close();
    console.log(file);
  }
}
await browser.close();
console.log(errors.length ? `console problems:\n${errors.join("\n")}` : "no console errors");
