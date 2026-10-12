// Screenshot site pages in dark and light at phone and desktop sizes.
// Usage: node scripts/shoot-site.mjs <url> <outDir> [--full] [--wait ms]
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [url, outDir, ...rest] = process.argv.slice(2);
const full = rest.includes("--full");
const wi = rest.indexOf("--wait");
const wait = wi >= 0 ? Number(rest[wi + 1]) : 1500;
await mkdir(outDir, { recursive: true });
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const sizes = { phone: { width: 390, height: 844, deviceScaleFactor: 2 }, desktop: { width: 1440, height: 900, deviceScaleFactor: 1 } };
const problems = [];
for (const [name, vp] of Object.entries(sizes)) {
  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, colorScheme: scheme });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`[${name}/${scheme}] pageerror ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") problems.push(`[${name}/${scheme}] ${m.text()}`); });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(wait);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`[${name}/${scheme}] horizontal overflow ${overflow}px`);
    const file = path.join(outDir, `${name}-${scheme}.png`);
    await page.screenshot({ path: file, fullPage: full });
    console.log(file);
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "no problems");
