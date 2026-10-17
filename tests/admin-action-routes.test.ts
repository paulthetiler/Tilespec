import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import Data from "../docs/redesign/prototype/data.js";
import { adminActionHref, compute, rules, type NextActionSnapshot } from "../lib/operations/next-actions";

const make = () => Data.make("start") as unknown as NextActionSnapshot;
const manager = (snapshot: NextActionSnapshot) => snapshot.members.find(member => member.user_id === "u-sam")!;

test("a cold engine includes saved morning findings and never changes its rule catalogue during reads", () => {
  const s = make();
  s.readiness_issues = [{ id: "cold-finding", contract_id: "c1", inspection_id: "check", check_label: "Missing adhesive", description: "Delivery needed", state: "open", created_at: `${s.today}T08:00:00Z` }];
  const count = rules.length;
  const first = compute(s, manager(s));
  assert.ok(first.some(action => action.id === "readiness:cold-finding"), "the first request must include the saved finding");
  for (let attempt = 0; attempt < 3; attempt++) assert.deepEqual(compute(s, manager(s)), first);
  assert.equal(rules.length, count, "deriving tasks must never register more rules");
});

test("every office setup task opens its actual existing form or selected inspection location", () => {
  const s = make();
  const office = manager(s);
  const job = s.contracts[0];
  job.start_date = null;
  job.end_date = null;
  s.contract_assignments = s.contract_assignments.filter(row => row.user_id !== "u-dave");
  s.document_revisions = [];
  const actions = compute(s, office);
  const setup = (step: string) => actions.find(action => action.id === `setup:${job.id}:${step}`)!;
  assert.equal(adminActionHref(setup("details")), `/admin/contracts/${job.id}#contract-information`);
  assert.equal(setup("details").due, null, "missing dates never become an invented deadline");
  assert.equal(adminActionHref(setup("supervisor")), `/admin/contracts/${job.id}#staff-allocations`);
  assert.equal(adminActionHref(setup("spec")), `/admin/contracts/${job.id}#documents`);
  s.location_inspection_requirements = [];
  const applicable = compute(s, office).find(action => action.rule === "G08")!;
  const url = new URL(adminActionHref(applicable), "http://test.invalid");
  assert.equal(url.pathname, `/admin/supervisor/sites/${applicable.job.id}/inspections`);
  assert.equal(url.searchParams.get("location"), s.planned_allocations.find(plan => plan.id === applicable.id.split(":")[1])?.work_area_id);
  assert.ok(url.searchParams.get("stage"));
});

test("open saved morning findings remain office tasks without becoming invented snags or holds", () => {
  const s = make();
  s.readiness_issues = [{ id: "finding", contract_id: "c1", inspection_id: "check", check_label: "Missing adhesive", description: "Adhesive has not arrived", state: "open", created_at: `${s.today}T08:00:00Z` }];
  const action = compute(s, manager(s)).find(action => action.id === "readiness:finding")!;
  assert.equal(action.state, "ready");
  assert.equal(action.kind, "reminder");
  assert.equal(action.enforcedByBackend, false);
  assert.equal(action.blocks, null);
  assert.equal(adminActionHref(action), "/admin/snags/finding");
  assert.match(action.why, /Existing restrictions still apply/);
  s.readiness_issues[0].state = "closed";
  assert.ok(!compute(s, manager(s)).some(action => action.id === "readiness:finding"));
});

test("office handover and message tasks open saved records, while decisions retain their exact hold", () => {
  assert.equal(adminActionHref({ rule: "R06", job: { id: "c1", reference: "", name: "" }, route: { screen: "handover" } }), "/admin/messages?contract_id=c1");
  assert.equal(adminActionHref({ rule: "G05", job: { id: "c1", reference: "", name: "" }, route: { screen: "decision", id: "h1" } }), "/admin/holds/h1");
  assert.equal(adminActionHref({ rule: "R04", job: { id: null, reference: "", name: "" }, route: { screen: "labour" } }), "/admin/workforce#people-heading");
});

test("office and owner engine links never return to Today or unsupported features", () => {
  const s = Data.make("busy") as unknown as NextActionSnapshot;
  for (const role of ["owner", "contracts_manager"] as const) {
    for (const member of s.members.filter(member => member.role === role)) {
      for (const action of compute(s, member)) {
        const href = adminActionHref(action);
        assert.notEqual(href, "/admin", action.id);
        assert.ok(!/variation|daywork|claim|approve-margin/.test(href), action.id);
        const route = href.split(/[?#]/)[0].replace(/\/tasks\/[^/]+$/, "/tasks/[taskId]").replace(/\/(c\d+|h\d+|s\d+|l-[^/]+|m\d+|qa\d+)(?=\/|$)/g, "/[id]");
        assert.ok(existsSync(path.join(__dirname, "..", "app", route, "page.tsx")), `${action.id}: ${href}`);
      }
    }
  }
});
