// End to end through the real UI: unlock with a code, drop a PDF, wait for both passes,
// land on the manual, check it renders. Costs one real parse.
// Usage: node scripts/e2e-upload.mjs <baseUrl> <code> <file.pdf> <outDir>
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [base, codeArg, file, outDir] = process.argv.slice(2);
// "@path" reads the code from a file, so it never appears in a command line.
const code = codeArg.startsWith("@") ? (await import("node:fs")).readFileSync(codeArg.slice(1), "utf8").trim() : codeArg;
await mkdir(outDir, { recursive: true });
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
const page = await ctx.newPage();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
page.on("pageerror", (e) => log("pageerror", e.message));
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith("/api/")) log("api", r.request().method(), u.pathname, r.status());
});

await page.goto(base, { waitUntil: "load" });
await page.getByPlaceholder("Access code").fill("wrong-code-123");
await page.getByRole("button", { name: "Unlock" }).click();
await page.getByText("That code isn't valid.").waitFor({ timeout: 15000 });
log("wrong code refused");
await page.getByPlaceholder("Access code").fill(code);
await page.getByRole("button", { name: "Unlock" }).click();
await page.getByText("Drop a manual here").waitFor({ timeout: 15000 });
log("unlocked");

await page.locator('input[type="file"]').setInputFiles(file);
await page.getByRole("button", { name: "Make the 3D manual" }).waitFor({ timeout: 30000 });
await page.screenshot({ path: path.join(outDir, "1-picked.png") });
await page.getByRole("button", { name: "Make the 3D manual" }).click();
log("started");

let shot = 2;
const timer = setInterval(async () => {
  try {
    if (!page.url().includes("/m/")) await page.screenshot({ path: path.join(outDir, `${shot++}-progress.png`) });
  } catch {}
}, 45000);
try {
  await page.waitForURL(/\/m\/[a-z0-9]+$/, { timeout: 15 * 60 * 1000 });
} catch (e) {
  await page.screenshot({ path: path.join(outDir, "fail.png") });
  const err = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
  log("did not reach the manual:", err.join(" | ") || e.message);
  clearInterval(timer);
  await browser.close();
  process.exit(1);
}
clearInterval(timer);
log("manual:", page.url());
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(outDir, "9-manual.png") });
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(outDir, "10-step1.png") });
await browser.close();
