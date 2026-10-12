// Large-file path: a PDF over 4 MB goes browser → private Blob → server. Drives the real UI,
// stops as soon as Claude starts reading (so only the gate runs), and reports each request.
// Usage: node scripts/e2e-blob-path.mjs <baseUrl> <@codefile> <big.pdf>
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const [base, codeArg, file] = process.argv.slice(2);
const code = codeArg.startsWith("@") ? readFileSync(codeArg.slice(1), "utf8").trim() : codeArg;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith("/api/") || u.hostname.includes("blob")) log(r.request().method(), u.hostname.includes("blob") ? `${u.hostname}${u.pathname.slice(0, 40)}` : u.pathname, r.status());
});
await page.goto(base, { waitUntil: "load" });
await page.getByPlaceholder("Access code").fill(code);
await page.getByRole("button", { name: "Unlock" }).click();
await page.getByText("Drop a manual here").waitFor({ timeout: 15000 });
await page.locator('input[type="file"]').setInputFiles(file);
await page.getByRole("button", { name: "Make the 3D manual" }).waitFor({ timeout: 60000 });
await page.getByRole("button", { name: "Make the 3D manual" }).click();
log("started");
// The gate passed once the "Read every page" stage is the live one (its dot is pulsing).
try {
  await page.locator("li", { hasText: "Read every page" }).locator(".working-dot").waitFor({ timeout: 180000 });
  log("gate passed: reading started → stopping");
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByText("Stopped. Nothing more will be read.").waitFor({ timeout: 15000 });
  log("stopped cleanly");
} catch (e) {
  const err = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
  log("did not reach reading:", err.join(" | ") || e.message);
}
await browser.close();
