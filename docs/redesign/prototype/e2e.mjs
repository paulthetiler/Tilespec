// Clicks through the realistic journeys in docs/redesign/07-acceptance-tests.md
// against the prototype. People switch with the review bar, state carries over,
// so one person's saved work changes what the next person is asked to do.
// Run with:  node docs/redesign/prototype/e2e.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const results = [];

async function scenario(name, qs, fn) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, reducedMotion: "reduce" });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`file://${dir}/index.html?${qs.includes("device=") ? "" : "device=mobile&"}${qs}#/today`);
  const as = async (id) => { await page.selectOption("#person", id); await page.waitForTimeout(30); };
  const hero = async () => (await page.locator(".hero h2").count()) ? (await page.locator(".hero h2").innerText()).trim() : null;
  const click = async (text, scope = "#device") => { await page.locator(scope).getByRole("button", { name: text }).or(page.locator(scope).getByRole("link", { name: text })).first().click(); await page.waitForTimeout(450); };
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(40); };
  const text = async () => page.locator("#device").innerText();
  const pick = async (group, value) => page.locator(`[data-choice="${group}"] [data-v="${value}"]`).click();
  const ctx = { page, as, hero, click, go, text, pick };
  try { await fn(ctx); assert.deepEqual(errs, [], "script errors"); results.push(["ok", name]); }
  catch (e) { results.push(["FAIL", name + ": " + e.message]); }
  await page.close();
}

await scenario("Supervisor: a quiet morning flows from one action to the next", "role=u-dave&scenario=start", async ({ page, hero, click, go, text, pick }) => {
  assert.equal(await hero(), "Do the morning checks");
  await click("Start morning checks");
  await click("Save morning checks");
  assert.match(await text(), /Answer every question\. 11 left/);
  for (let i = 0; i < 11; i++) await pick("q" + i, "yes");
  await click("Save morning checks");
  assert.match(await text(), /Saved: Morning checks/);
  assert.notEqual(await hero(), "Do the morning checks");
  assert.match(await text(), /Saved today/);
  assert.match(await hero(), /Read:|Confirm who is here/);
});

await scenario("Poor signal: a failed save keeps what was typed and the retry succeeds", "role=u-dave&scenario=start&flaky=1", async ({ page, click, go, text, pick }) => {
  await go("/morning");
  for (let i = 0; i < 11; i++) await pick("q" + i, i === 3 || i >= 9 ? "no" : "yes");
  await click("Save morning checks");
  await page.waitForTimeout(800);
  assert.match(await text(), /Not saved\. Nothing you entered was lost/);
  assert.equal(await page.locator('[data-choice="q3"] [aria-pressed="true"]').getAttribute("data-v"), "no", "answers kept");
  await click("Try again");
  await page.waitForTimeout(800);
  assert.match(await text(), /Saved: Morning checks, 1 sent to the office/);
});

await scenario("Report an issue end to end: supervisor reports a safety stop, gang fixes, office releases, nobody approves their own", "role=u-dave&scenario=start", async ({ page, as, hero, click, go, text, pick }) => {
  assert.equal(await page.getByText("STOP WORK").count(), 0, "no prominent Stop Work button");
  await click("Report an issue");
  await pick("stop", "safety");
  await page.fill('.sheet [name="what"]', "Exposed cable above the wet area");
  await page.locator(".sheet").getByRole("button", { name: "Report it" }).click();
  await page.waitForTimeout(500);
  assert.match(await text(), /Who fixes it/);
  await page.selectOption('[name="team"]', "t1");
  await page.fill('[name="action"]', "Electrician to make the cable safe");
  await click("Save", "main");
  await go("/today");
  assert.match(await text(), /Waiting on Kowalski gang|Waiting on Marek/);
  await as("u-marek");
  assert.equal(await hero(), "Fix it and send photos");
  await click("Fix it and send photos", ".hero");
  await page.locator(".photo").click();
  await click("Send fix");
  await go("/today");
  assert.equal(await hero(), "Ask the office to check the fix");
  await click("Ask for the check");
  await page.fill('[name="note"]', "Cable made safe by the electrician");
  await click("Ask the office to check");
  await as("u-dave");
  await go("/decision/" + (await page.evaluate(() => P.S.work_holds.at(-1).id)));
  assert.match(await text(), /This decision is for the office/);
  assert.equal(await page.getByRole("button", { name: "Restart work here" }).count(), 0);
  await as("u-sam");
  assert.equal(await hero(), "Check the fix and decide: safety stop");
  await click("Review and decide");
  await click("Restart work here");
  assert.match(await text(), /Write your reason/);
  await page.fill('[name="why"]', "Electrician certificate seen, cable safe");
  await page.locator('[name="photos"]').check();
  await page.locator('[name="insp"]').check();
  await click("Restart work here");
  assert.match(await text(), /Principal contractor/);
  await page.fill('[name="pc"]', "Priti, ref PC-118");
  await click("Restart work here");
  await page.waitForTimeout(500);
  assert.match(await text(), /Work restarted for this location/);
  assert.equal(await page.evaluate(() => P.S.work_holds.at(-1).status), "released");
});

await scenario("The person who raised a stop cannot release it", "role=u-sam&scenario=busy", async ({ go, text, page }) => {
  await go("/decision/h2");
  assert.match(await text(), /Sam Patel raised this stop, so someone else has to check it/);
  assert.equal(await page.getByRole("button", { name: "Restart work here" }).count(), 0);
});

await scenario("Release is refused while a critical defect is open (even for the owner)", "role=u-alex&scenario=busy", async ({ go, text, page }) => {
  await go("/decision/h2");
  assert.match(await text(), /A critical defect is still open on this work/);
  assert.equal(await page.getByRole("button", { name: "Restart work here" }).count(), 0);
});

await scenario("Snag repair: the supervisor re-inspects and the snag closes", "role=u-dave&scenario=busy", async ({ page, hero, click, go, text }) => {
  assert.equal(await hero(), "Check the repair");
  await click("Check the repair", ".hero");
  await click("Repair is good");
  assert.match(await text(), /Add a note/);
  await page.fill('[name="note"]', "Tiles solid, checked in person");
  await click("Repair is good");
  assert.match(await text(), /Add a photo of the repair/);
  await page.locator(".photo").click();
  await click("Repair is good");
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => P.S.supervisor_issues.find((i) => i.id === "s2").snag_status), "closed");
});

await scenario("A failed mandatory inspection blocks work until a later pass is saved", "role=u-dave&scenario=busy", async ({ page, as, hero, click, go, text, pick }) => {
  await go("/inspect/l-f31-bath?stage=installation");
  for (let i = 0; i < 5; i++) await pick("c" + i, i === 2 ? "fail" : "pass");
  await page.fill('[name="note"]', "Lippage at the threshold");
  await click("Save inspection");
  await page.waitForTimeout(400);
  await go("/today");
  assert.ok((await text()).includes("Required inspection failed"), "failure shows as a gate");
  await go("/inspect/l-f31-bath?stage=installation");
  for (let i = 0; i < 5; i++) await pick("c" + i, "pass");
  await click("Save inspection");
  await page.waitForTimeout(400);
  await go("/today");
  assert.ok(!(await text()).includes("Required inspection failed"), "gate closes only after a saved pass");
});

await scenario("Office sets up a new job in the order the system asks", "role=u-sam&scenario=start", async ({ page, hero, click, go, text }) => {
  await go("/job/c2");
  assert.equal(await hero(), "Add the locations");
  await click("Set it up", ".hero");
  await click("Save", ".sheet");
  await page.waitForTimeout(400);
  assert.equal(await hero(), "Give the job a supervisor");
  await click("Set it up", ".hero");
  await click("Save", ".sheet");
  await page.waitForTimeout(400);
  assert.equal(await hero(), "Add the specification and drawings");
  await click("Set it up", ".hero");
  await page.fill('.sheet [name="spec"]', "600 x 600 matt porcelain");
  await click("Save", ".sheet");
  await page.waitForTimeout(400);
  assert.equal(await hero(), null, "a fully set up job has nothing left to ask");
});

await scenario("Expired insurance is a gate the office clears by saving a certificate", "role=u-sam&scenario=busy", async ({ page, go, text, click }) => {
  await go("/labour");
  assert.match(await text(), /public liability expired/);
  await click("Mason and Daughters Tiling");
  await click("Save certificate");
  await page.waitForTimeout(400);
  await go("/labour");
  assert.match(await text(), /Cover is valid/);
});

await scenario("Subcontractor never sees money or other gangs' work", "role=u-marek&scenario=busy", async ({ page, go, text }) => {
  for (const r of ["/today", "/fixes", "/papers", "/money", "/jobs", "/job/c1"]) {
    await go(r);
    const t = await text();
    assert.ok(!/£|margin|Budget|Mason/i.test(t), `no money or other gangs on ${r}`);
  }
  assert.equal(await page.locator(".tab").count(), 3);
});

await scenario("Office without money access does not see money", "role=u-jo&scenario=busy", async ({ go, text }) => {
  for (const r of ["/today", "/job/c1", "/money"]) { await go(r); assert.ok(!/£|Budgeted/.test(await text()), r); }
});

await scenario("Owner sees a low margin as information, never as an approval they must tick", "role=u-alex&scenario=busy", async ({ go, text, page }) => {
  await go("/money");
  assert.match(await text(), /Original budgets only/);
  assert.match(await text(), /25\.\d%/);
  assert.equal(await page.getByRole("button").filter({ hasText: /approve|variation|daywork|claim/i }).count(), 0, "no dead-end money buttons");
});

await scenario("Desktop uses the same four destinations as a side rail", "role=u-sam&scenario=busy&device=desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const box = await page.locator(".tabbar").boundingBox(), dev = await page.locator("#device").boundingBox();
  assert.ok(box.x - dev.x < 20 && box.width < 300 && box.y < dev.y + 200, "rail on the left");
  assert.equal(await page.locator(".tab").count(), 4);
});

await scenario("Owner has three destinations and risks live under Today", "role=u-alex&scenario=busy", async ({ page, text }) => {
  assert.equal(await page.locator(".tab").count(), 3);
  assert.equal(await page.locator(".tab", { hasText: /^Risks$/ }).count(), 0);
  const t = await text();
  assert.doesNotMatch(t, /You are up to date/i);
  const counts = await page.evaluate(() => {
    const a = TSRules.compute(P.S, P.viewer());
    const q = TSRules.buildQueue(a, { groupExceptions: true });
    const c = TSRules.queueCounts(q);
    const attention = q.alerts.filter((x) => x.state !== "ready");
    const listed = q.exceptions.filter((x) => !attention.some((b) => b.id === x.id)).length;
    return { ...c, attention: attention.length, listed };
  });
  assert.match(t, new RegExp(counts.actions === 1 ? "1 thing needs you" : `${counts.actions} things need you`));
  assert.match(t, new RegExp(counts.attention === 1 ? "1 needs attention" : `${counts.attention} need attention`));
  assert.match(t, new RegExp(`${counts.informational} informational alert`));
  const risks = Number((t.match(/Risks and exceptions \((\d+)\)/) || [])[1]);
  assert.equal(risks, counts.listed, "banner alerts are not counted again under risks");
  for (const title of ["Review the critical defect", "public liability has expired"]) {
    assert.equal(t.split(title).length - 1, 1, `${title} is shown once`);
  }
});

await scenario("Subcontractor has Today, Fixes and Paperwork and no Tell the supervisor", "role=u-marek&scenario=busy", async ({ page, go, text }) => {
  assert.deepEqual((await page.locator(".tab").allInnerTexts()).map((t) => t.trim().split("\n")[0]), ["Today", "Fixes", "Paperwork"]);
  for (const r of ["/today", "/fixes", "/papers"]) { await go(r); assert.doesNotMatch(await text(), /Tell the supervisor/i, r); }
});

await scenario("The whole queue stays visible under the main button", "role=u-dave&scenario=busy", async ({ page, text }) => {
  const t = await text();
  assert.match(t, /Then \(\d+\)/);
  const n = Number(t.match(/Then \((\d+)\)/)[1]);
  const queue = await page.evaluate(() => { const a = TSRules.compute(P.S, P.viewer(), TSRules.config); return TSRules.buildQueue(a).then.length; });
  assert.equal(n, queue, "every queued task is listed");
});

await scenario("A critical snag is reported without stopping work", "role=u-dave&scenario=start", async ({ page, click, pick, text }) => {
  await click("Report an issue");
  await pick("sev", "critical");
  await page.fill('.sheet [name="what"]', "Substrate failing under the tray");
  const before = await page.evaluate(() => P.S.work_holds.length);
  await page.locator(".sheet").getByRole("button", { name: "Report it" }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => P.S.work_holds.length), before, "no hold was created");
  assert.match(await text(), /Snag recorded/);
});

await browser.close();
for (const [s, m] of results) console.log(s.padEnd(5), m);
if (results.some(([s]) => s === "FAIL")) process.exit(1);
console.log(`\n${results.length} journeys passed`);
