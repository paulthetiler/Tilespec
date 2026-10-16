// Opens every screen for every person in both scenarios and fails on any script
// error, empty screen, more than four tabs, or money shown to the wrong person.
// Run with:  node docs/redesign/prototype/smoke.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = (qs, hash = "") => `file://${dir}/index.html?${qs}#${hash}`;
const people = [["u-alex", "owner"], ["u-sam", "office"], ["u-jo", "office"], ["u-dave", "supervisor"], ["u-ellie", "supervisor"], ["u-marek", "subcontractor"]];
const routes = ["/today", "/jobs", "/job/c1", "/job/c2", "/tenders", "/tender/te1", "/labour", "/money", "/risks", "/people", "/inspect", "/inspect/l-f31-bath?stage=installation", "/issues", "/snag/s1", "/snag/s2", "/snag/s3", "/hold/h1", "/hold/h2", "/decision/h1", "/decision/h2", "/messages", "/handover", "/morning", "/fixes", "/fix/s1?kind=snag", "/fix/h3?kind=hold", "/papers"];

const browser = await chromium.launch();
const errors = [];
let screens = 0;
for (const device of ["mobile", "desktop"]) {
  for (const scenario of ["start", "busy"]) {
    for (const [id, role] of people) {
      const page = await browser.newPage({ viewport: device === "mobile" ? { width: 430, height: 900 } : { width: 1366, height: 900 } });
      page.on("pageerror", (e) => errors.push(`${device}/${scenario}/${id}: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error" && !/fonts\.googleapis|ERR_/.test(m.text())) errors.push(`${device}/${scenario}/${id}: ${m.text()}`); });
      await page.goto(url(`role=${id}&scenario=${scenario}&device=${device}${scenario === "busy" ? "&now=15:10" : ""}`));
      for (const r of routes) {
        await page.evaluate((h) => { location.hash = h; }, r);
        const text = await page.locator("#device").innerText();
        screens++;
        if (text.trim().length < 20) errors.push(`${device}/${scenario}/${id}${r}: empty screen`);
        const tabs = await page.locator(".tab").count();
        if (tabs > 4) errors.push(`${device}/${scenario}/${id}: ${tabs} tabs`);
        if (role === "subcontractor" && /£|margin|contract value|budget/i.test(text)) errors.push(`${scenario}/${id}${r}: money visible to subcontractor`);
        if (id === "u-jo" && /£|Budgeted/.test(text)) errors.push(`${scenario}/${id}${r}: money visible to office without money access`);
      }
      await page.close();
    }
  }
}
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`ok: ${screens} screens opened, no errors`);
