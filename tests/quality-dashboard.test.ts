import test from "node:test";
import assert from "node:assert/strict";
import { nextAction, type SiteDay } from "../lib/operations/site-day";
import { notificationId, qualityFilters, qualityRpcFilters, qualityStatusLabel } from "../lib/operations/quality";

const day: SiteDay = { day: "2026-10-15", cards: [], unplanned: [], exceptions: [], summary: { plannedTeams: 0, confirmedTeams: 0, unconfirmed: 0, notOnSite: 0, presentNow: 0, activeLocations: 0, openPeriods: 0 } };
const base = { siteHref: "/site", issuesHref: "/admin/snags?contract_id=site", checksDone: false, staleOpen: 0, openIssues: 0, day };
const holds = { href: "/admin/holds?contract_id=site", active_safety: 0, active_quality: 0, awaiting_release: 0, inspections_due: 0, failed_mandatory: 0 };

test("persisted safety restrictions take priority without being hidden by earlier checklist steps", () => {
  const action = nextAction({ ...base, holds: { ...holds, active_safety: 2, active_quality: 3, awaiting_release: 1 }, snags: { critical: 4, awaiting_reinspection: 0, disputed: 0, overdue: 0 } });
  assert.equal(action.key, "safety");
  assert.equal(action.href, "/admin/holds?contract_id=site&hold_type=safety");
  assert.match(action.detail, /2 saved safety stops/);
  assert.match(action.detail, /principal contractor/);
});
test("release requests and mandatory failures never advertise permission to proceed", () => {
  assert.equal(nextAction({ ...base, holds: { ...holds, awaiting_release: 1 } }).key, "release");
  assert.match(nextAction({ ...base, holds: { ...holds, awaiting_release: 1 } }).detail, /does not release work/);
  const failure = nextAction({ ...base, holds: { ...holds, failed_mandatory: 2 } });
  assert.equal(failure.href, "/site/inspections");
  assert.match(failure.detail, /remains blocked/);
  assert.equal(nextAction({ ...base, checksDone: true, holds: { ...holds, inspections_due: 1 } }).key, "inspection");
  assert.equal(nextAction(base).key, "checks", "absence of a configured assessment preserves the daily workflow, rather than inventing permission");
});
test("quality filters preserve exact location/activity scope and reject malformed selections", () => {
  const id = "a1000000-0000-4000-8000-000000000001";
  assert.deepEqual(qualityFilters({ contract_id: id, location_id: id, team_id: id, stage: "waterproofing", status: "awaiting_release", hold_type: "safety", work_status: "stopped_safety" }),
    { contract_id: id, location_id: id, team_id: id, stage: "waterproofing", status: "awaiting_release", work_status: "stopped_safety", hold_type: "safety" });
  assert.deepEqual(qualityFilters({ contract_id: [id], location_id: "other", stage: "invented", status: "active; select", hold_type: "anything", work_status: "site_released" }), {});
  assert.equal(qualityStatusLabel("released"), "Released for specified activity");
  assert.deepEqual(qualityRpcFilters(qualityFilters({ overdue: "on", rejected: "true" })), { overdue: true, rejected: true }, "checkboxes preserve database boolean types across a paginated URL");
});
test("notification read requests use an exact safe persisted identifier", () => {
  assert.equal(notificationId("42"), 42);
  for (const value of [null, "0", "-1", "1.1", "NaN", "9007199254740992", "42x"]) assert.throws(() => notificationId(value));
});
