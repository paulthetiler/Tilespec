import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nextSiteStep, siteDaySteps, type SiteDayFacts } from "../lib/operations/day-steps";

const base = "/admin/supervisor/sites/site";
const none: SiteDayFacts = { checked: false, plannedTeams: 2, unconfirmed: 2, presentNow: 0, progressToday: 0, inspectionsToday: 0, handedOver: false };
const source = (file: string) => readFileSync(path.join(__dirname, "..", file), "utf8");

test("the supervisor's day is five steps in the order they are done, each opening its own page", () => {
  const steps = siteDaySteps(base, none);
  assert.deepEqual(steps.map(step => step.key), ["checks", "people", "progress", "inspect", "finish"]);
  assert.deepEqual(steps.map(step => step.href), [`${base}/checks`, `${base}/workforce`, `${base}/diary`, `${base}/inspections`, `${base}/finish`]);
  assert.ok(steps.every(step => !step.done));
});

test("each step is done only from today's saved records", () => {
  const steps = siteDaySteps(base, { ...none, checked: true, unconfirmed: 0, progressToday: 3, inspectionsToday: 1, handedOver: true });
  assert.ok(steps.every(step => step.done));
  // A planned gang still to confirm keeps People open, however many people turned up.
  assert.equal(siteDaySteps(base, { ...none, unconfirmed: 1, presentNow: 6 }).find(s => s.key === "people")?.done, false);
  // With nobody planned, People is done once someone is recorded on site.
  assert.equal(siteDaySteps(base, { ...none, plannedTeams: 0, unconfirmed: 0, presentNow: 0 }).find(s => s.key === "people")?.done, false);
  assert.equal(siteDaySteps(base, { ...none, plannedTeams: 0, unconfirmed: 0, presentNow: 2 }).find(s => s.key === "people")?.done, true);
});

test("before the site diary is installed there is no progress step, rather than one that can never be done", () => {
  assert.deepEqual(siteDaySteps(base, { ...none, progressToday: null }).map(step => step.key), ["checks", "people", "inspect", "finish"]);
});

test("the next step is the first unfinished one after this page, then any earlier one left open", () => {
  const steps = siteDaySteps(base, { ...none, checked: true, unconfirmed: 0 });
  assert.equal(nextSiteStep(steps, null)?.key, "progress");
  assert.equal(nextSiteStep(steps, "checks")?.key, "progress");
  assert.equal(nextSiteStep(steps, "inspect")?.key, "finish");
  const lateCheck: SiteDayFacts = { ...none, checked: false, unconfirmed: 0, progressToday: 1, inspectionsToday: 1 };
  assert.equal(nextSiteStep(siteDaySteps(base, lateCheck), "inspect")?.key, "finish");
  assert.equal(nextSiteStep(siteDaySteps(base, { ...lateCheck, handedOver: true }), "finish")?.key, "checks", "an earlier step left open is offered, never hidden");
  assert.equal(nextSiteStep(siteDaySteps(base, { ...none, checked: true, unconfirmed: 0, progressToday: 1, inspectionsToday: 1, handedOver: true }), "finish"), null);
});

test("the steps guide the day but never gate it, and the next-step link always lands somewhere that works", () => {
  const view = source("components/site/day-steps.tsx");
  assert.match(view, /catch \{ return null; \}/, "if the records cannot be read the strip is left out and the page works as before");
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(view), "reads only");
  const next = source("app/admin/supervisor/sites/[id]/next/page.tsx");
  assert.match(next, /requireSite\(id\)/);
  assert.match(next, /let target = base;/, "falls back to Today");
  // The supervisor's Today still takes its next action from the shared engine alone.
  const today = source("components/site/next-actions-today.tsx");
  assert.match(today, /current=\{null\}/, "Today shows the steps without a second 'next' of its own");
  for (const page of ["checks", "workforce", "diary", "inspections", "finish"])
    assert.match(source(`app/admin/supervisor/sites/[id]/${page}/page.tsx`), /member\.role === "supervisor" && <SiteDaySteps /, `${page} shows the day to supervisors`);
});

test("demonstration and test records are recognised by their naming convention, and real work is not", async () => {
  const { isDemoRecord } = await import("../lib/operations/demo");
  assert.equal(isDemoRecord({ reference: "DEMO-SM-001", name: "DEMO — Supermarket Refurbishment" }), true);
  assert.equal(isDemoRecord({ name: "TEST Gang 1 — Dave & Mark" }), true);
  assert.equal(isDemoRecord({ reference: "test-02", name: "Office" }), true);
  assert.equal(isDemoRecord({ reference: "APT-B", name: "Riverside apartments Block B" }), false);
  assert.equal(isDemoRecord({ reference: "HOT-1", name: "Test kitchen refit" }), false, "an ordinary word is not a demo marker");
  assert.equal(isDemoRecord({ reference: "DEMOLITION-4", name: "Demolition and retile" }), false);
});
