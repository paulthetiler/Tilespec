// Captures the screenshots referenced from docs/redesign/*.md.
// Run with:  node docs/redesign/prototype/shots.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "..", "screenshots");
fs.mkdirSync(out, { recursive: true });
const url = (qs, hash) => `file://${dir}/index.html?${qs}#${hash}`;

const shots = [
  // [file, person, scenario, hash, extra query]
  ["supervisor-today", "u-dave", "start", "/today"],
  ["supervisor-today-busy", "u-dave", "busy", "/today"],
  ["supervisor-morning-checks", "u-dave", "start", "/morning"],
  ["supervisor-people", "u-dave", "busy", "/people"],
  ["supervisor-inspect", "u-dave", "busy", "/inspect/l-f31-bath?stage=installation"],
  ["supervisor-issues", "u-dave", "busy", "/issues"],
  ["supervisor-check-repair", "u-dave", "busy", "/snag/s2"],
  ["supervisor-handover", "u-dave", "busy", "/handover", "&now=15:10"],
  ["office-today", "u-sam", "busy", "/today"],
  ["office-decision", "u-sam", "busy", "/decision/h1"],
  ["office-decision-blocked", "u-sam", "busy", "/decision/h2"],
  ["office-job", "u-sam", "busy", "/job/c2"],
  ["office-tenders", "u-sam", "busy", "/tenders"],
  ["office-labour", "u-sam", "busy", "/labour"],
  ["owner-today", "u-alex", "busy", "/today"],
  ["owner-money", "u-alex", "busy", "/money"],
  ["owner-risks", "u-alex", "busy", "/risks"],
  ["sub-today", "u-marek", "start", "/today"],
  ["sub-today-fix", "u-marek", "busy", "/today"],
  ["sub-fix", "u-marek", "busy", "/fix/s1?kind=snag"],
  ["sub-papers", "u-marek", "start", "/papers"],
  ["hints-supervisor-today", "u-dave", "busy", "/today", "&hints=1"],
  ["login", "", "start", "/today"],
];

const browser = await chromium.launch();
for (const device of ["mobile", "desktop"]) {
  const page = await browser.newPage({ viewport: device === "mobile" ? { width: 640, height: 860 } : { width: 1366, height: 860 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
  for (const [name, who, scenario, hash, extra = ""] of shots) {
    if (device === "desktop" && name.startsWith("hints-")) continue;
    await page.goto(url(`role=${who}&scenario=${scenario}&device=${device}&clean=1${extra}`, hash));
    await page.waitForTimeout(2100);
    await page.locator("#device").screenshot({ path: path.join(out, `${name}-${device}.png`) });
  }
  await page.close();
}
await browser.close();
console.log("screenshots written to", out);
