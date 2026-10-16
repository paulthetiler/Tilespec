// Captures Supervisor Today at 390px and 320px for the four review journeys.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const proto = path.join(dir, "..", "docs/redesign/prototype");
const out = process.env.SCREENSHOT_DIR || path.join(dir, "..", "docs/redesign/screenshots");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const results = [];

async function shot(name, width, qs, hash, after) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.goto(`file://${proto}/index.html?device=mobile&${qs}#${hash}`);
  await page.addStyleTag({ content: '.review { display: none !important; } .stage { padding: 0 !important; }' });
  await page.waitForTimeout(400);
  if (after) await after(page);
  const device = page.locator("#device");
  const box = await device.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflow: el.scrollWidth - el.clientWidth }));
  if (box.overflow > 1) errs.push(`${name}: horizontal overflow ${box.overflow}px`);
  const file = path.join(out, `${name}.png`);
  await device.screenshot({ path: file });
  await page.close();
  results.push({ name, width, file, overflow: box.overflow, errs });
  if (errs.length) throw new Error(`${name}: ${errs.join("; ")}`);
}

await shot("supervisor-today-ordinary-390", 390, "role=u-dave&scenario=start", "/today");
await shot("supervisor-today-ordinary-320", 320, "role=u-dave&scenario=start", "/today");
await shot("supervisor-today-busy-390", 390, "role=u-dave&scenario=busy", "/today", async page => {
  const then = page.locator("#device").getByText("Then (");
  if (await then.count()) await then.first().scrollIntoViewIfNeeded();
});
await shot("supervisor-today-busy-320", 320, "role=u-dave&scenario=busy", "/today", async page => {
  const then = page.locator("#device").getByText("Then (");
  if (await then.count()) await then.first().scrollIntoViewIfNeeded();
});
await shot("supervisor-today-hold-390", 390, "role=u-dave&scenario=busy", "/today", async page => {
  await page.locator("#device").getByText("Work that is stopped").first().scrollIntoViewIfNeeded();
});
await shot("supervisor-failed-save-390", 390, "role=u-dave&scenario=start&flaky=1", "/morning", async page => {
  for (let i = 0; i < 11; i++) await page.locator(`[data-choice="q${i}"] [data-v="${i === 3 || i >= 9 ? "no" : "yes"}"]`).click();
  await page.getByRole("button", { name: "Save morning checks" }).click();
  await page.waitForTimeout(900);
  const text = await page.locator("#device").innerText();
  if (!/Not saved/.test(text)) throw new Error("failed save did not keep the form");
});
await shot("owner-today-counts-390", 390, "role=u-alex&scenario=busy", "/today");
await shot("owner-today-counts-320", 320, "role=u-alex&scenario=busy", "/today");
await shot("owner-today-risks-390", 390, "role=u-alex&scenario=busy", "/today", async page => {
  const info = page.locator("#device").getByText("For your information");
  if (await info.count()) await info.first().scrollIntoViewIfNeeded();
});
await shot("report-issue-390", 390, "role=u-dave&scenario=start", "/today", async page => {
  await page.getByRole("button", { name: "Report an issue" }).click();
  await page.waitForTimeout(200);
  await page.locator("#device").getByText("Does work need to stop here?").scrollIntoViewIfNeeded();
});
await shot("report-issue-320", 320, "role=u-dave&scenario=start", "/today", async page => {
  await page.getByRole("button", { name: "Report an issue" }).click();
  await page.waitForTimeout(200);
  await page.locator("#device").getByText("Does work need to stop here?").scrollIntoViewIfNeeded();
});
await shot("report-issue-destinations-390", 390, "role=u-dave&scenario=start", "/today", async page => {
  await page.getByRole("button", { name: "Report an issue" }).click();
  await page.waitForTimeout(200);
  await page.locator("#device [data-choice='stop'] [data-v='safety']").click();
  await page.locator("#device").getByText("Does work need to stop here?").scrollIntoViewIfNeeded();
});

await browser.close();
for (const r of results) console.log(`${r.name}  overflow=${r.overflow}px  ${path.relative(process.cwd(), r.file)}`);
console.log(`${results.length} mobile captures, no overflow`);
