// Print the engine's computed cameras for a manual at a given page.
// Usage: node scripts/engine-debug.mjs <file.html> [page]
import { chromium } from "playwright-core";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [file, pageArg = "0"] = process.argv.slice(2);
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(pathToFileURL(path.resolve(file)).href + `#step${pageArg}&still`);
await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.evaluate(() => window.UNFLAT_ENGINE.debug())));
await browser.close();
