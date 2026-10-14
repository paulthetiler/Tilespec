import test from "node:test";
import assert from "node:assert/strict";
import { createSnagInput, isSnagOverdue, photoIdsFor, snagFilters, snagTransitionInput, type SnagPhoto } from "../lib/operations/snags";
import { londonDate } from "../lib/operations/planning";
import { ValidationError } from "../lib/operations/validation";
import { restoreSnagForm, snapshotSnagForm } from "../lib/operations/snag-create-workflow";
import { nextAction, type SiteDay } from "../lib/operations/site-day";

const id = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function form(values: Record<string, string | string[]>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) for (const item of [value].flat()) result.append(key, item);
  return result;
}
const findings = {
  contract_id: id(1), work_area_id: id(2), stage: "installation", category: "Excessive lippage", severity: "major",
  description: "Three uneven tiles at the bathroom door", required_rectification: "Remove and relay the affected tiles",
};

test("standalone findings preserve the selected location without inventing a gang or inspection", () => {
  const data = createSnagInput(form(findings));
  assert.deepEqual(data, { ...findings, work_package_id: null, inspection_id: null });
  assert.equal(Object.hasOwn(data, "team_id"), false);
  assert.equal(Object.hasOwn(data, "responsibility_team_id"), false);
});

test("linked inspection and work-package identifiers are preserved; optional empty selections are null", () => {
  const linked = createSnagInput(form({ ...findings, inspection_id: id(3), work_package_id: id(4) }));
  assert.equal(linked.inspection_id, id(3));
  assert.equal(linked.work_package_id, id(4));
  assert.equal(createSnagInput(form({ ...findings, inspection_id: "", work_package_id: "" })).inspection_id, null);
  for (const field of ["contract_id", "work_area_id", "inspection_id", "work_package_id"]) {
    assert.throws(() => createSnagInput(form({ ...findings, [field]: "not-an-id" })), ValidationError, field);
  }
});

test("Other retains a custom description and required repair instructions", () => {
  const data = createSnagInput(form({ ...findings, category: "Other", description: "  Unusual finish at doorway  ", required_rectification: "  Refer to specification detail A  " }));
  assert.equal(data.category, "Other");
  assert.equal(data.description, "Unusual finish at doorway");
  assert.equal(data.required_rectification, "Refer to specification detail A");
});

test("findings reject invalid taxonomy, missing explanations, long input and file-shaped text", () => {
  for (const values of [
    { stage: "approved" }, { severity: "emergency" }, { category: "Automatic liability" },
    { description: " " }, { required_rectification: "" }, { description: "x".repeat(2001) },
  ]) assert.throws(() => createSnagInput(form({ ...findings, ...values })), ValidationError);
  const malformed = form(findings);
  malformed.set("description", new Blob(["text"], { type: "text/plain" }), "notes.txt");
  assert.throws(() => createSnagInput(malformed), ValidationError);
});

test("repair and liability inputs remain separate and preserve evidence selected for the event", () => {
  const repair = snagTransitionInput(form({ action: "assign", note: "Different team to carry out the repair", team_id: id(3), required_action: "Relay three tiles", target_date: "2026-10-20" }));
  assert.deepEqual(repair, { action: "assign", data: { note: "Different team to carry out the repair", team_id: id(3), target_date: "2026-10-20", required_action: "Relay three tiles", photo_ids: [] } });
  const proposal = snagTransitionInput(form({ action: "propose_responsibility", note: "Review this actual work period", allocation_id: id(5) }));
  assert.equal(proposal.data.allocation_id, id(5));
  assert.equal(Object.hasOwn(proposal.data, "team_id"), false);
  const completion = snagTransitionInput(form({ action: "submit_rectification", note: "Tiles removed and relaid", completed_on: londonDate(), photo_ids: [id(6), id(7)] }));
  assert.equal(completion.action, "submit_rectification");
  assert.deepEqual(completion.data.photo_ids, [id(6), id(7)]);
});

test("lifecycle actions require meaningful notes and disallow direct status editing", () => {
  for (const action of ["close", "CLOSED", "set_status", "delete", "", "restore_liability"]) {
    assert.throws(() => snagTransitionInput(form({ action, note: "I want to close this" })), ValidationError, action);
  }
  for (const note of ["", "    ", "done", "  done  "]) {
    assert.throws(() => snagTransitionInput(form({ action: "accept", note })), ValidationError);
  }
  assert.equal(snagTransitionInput(form({ action: "cancel", note: "  Entered against the wrong room  " })).data.note, "Entered against the wrong room");
});

test("transitions validate calendar dates and refuse future completion dates", () => {
  for (const value of ["2026-02-29", "2026-04-31", "20/10/2026", "2026-1-01"]) {
    for (const field of ["completed_on", "target_date"]) assert.throws(() => snagTransitionInput(form({ action: "submit_rectification", note: "Completed the repair", [field]: value })), ValidationError);
  }
  assert.throws(() => snagTransitionInput(form({ action: "submit_rectification", note: "Completed the repair", completed_on: "9999-12-31" })), /future/);
  assert.equal(snagTransitionInput(form({ action: "assign", note: "Repair planned next week", target_date: "9999-12-31" })).data.target_date, "9999-12-31");
});

test("event evidence rejects duplicates, malformed identifiers and more than twelve photos", () => {
  const base = { action: "submit", note: "Original photographs and findings" };
  assert.throws(() => snagTransitionInput(form({ ...base, photo_ids: [id(1), id(1)] })), ValidationError);
  assert.throws(() => snagTransitionInput(form({ ...base, photo_ids: ["not-an-id"] })), ValidationError);
  assert.throws(() => snagTransitionInput(form({ ...base, photo_ids: Array.from({ length: 13 }, (_, n) => id(n + 1)) })), ValidationError);
  assert.equal((snagTransitionInput(form({ ...base, photo_ids: Array.from({ length: 12 }, (_, n) => id(n + 1)) })).data.photo_ids as string[]).length, 12);
});

test("only verified, unattached evidence owned by this actor and repair cycle is offered for submission", () => {
  const base: SnagPhoto = { id: id(1), issue_id: id(20), purpose: "rectification", event_id: null, repair_cycle: 3, actor_id: id(21), uploaded_at: "2026-10-14T10:00:00Z", created_at: "2026-10-14T10:00:00Z", mime_type: "image/jpeg" };
  const photos = [base,
    { ...base, id: id(2), purpose: "original" as const },
    { ...base, id: id(3), uploaded_at: null },
    { ...base, id: id(4), event_id: 99 },
    { ...base, id: id(5), repair_cycle: 2 },
    { ...base, id: id(6), actor_id: id(22) },
    { ...base, id: id(7), purpose: null },
  ];
  assert.deepEqual(photoIdsFor(photos, "rectification", 3, id(21)), [id(1)]);
  assert.deepEqual(photoIdsFor(photos, "original", 3, id(21)), [id(2)]);
  assert.deepEqual(photoIdsFor(photos, "rectification", 4, id(21)), []);
});

test("overdue follows saved status and excludes drafts, closed and entered-in-error records", () => {
  for (const snag_status of ["open", "assigned", "rectification_submitted", "reinspection"]) assert.equal(isSnagOverdue({ snag_status, state: "open", target_date: "2026-10-13" }, "2026-10-14"), true, snag_status);
  for (const snag_status of ["draft", "closed", "cancelled"]) assert.equal(isSnagOverdue({ snag_status, state: "open", target_date: "2026-10-13" }, "2026-10-14"), false, snag_status);
  assert.equal(isSnagOverdue({ snag_status: "assigned", state: "open", target_date: "2026-10-14" }, "2026-10-14"), false);
  assert.equal(isSnagOverdue({ snag_status: "assigned", state: "open", target_date: null }, "2026-10-14"), false);
  assert.equal(isSnagOverdue({ snag_status: null, state: "closed", target_date: "2026-10-13" }, "2026-10-14"), false);
});

test("register filters retain recognised scope and exclude ambiguous or injected query fields", () => {
  assert.deepEqual(snagFilters({ contract_id: id(1), location_id: id(2), assigned_team_id: id(3), assigned_operative_id: id(4), stage: " installation ", search: "  bathroom door  ", overdue: "on", awaiting_reinspection: "true", disputed: "false", role: "owner", organisation_id: id(99) }), {
    contract_id: id(1), location_id: id(2), assigned_team_id: id(3), assigned_operative_id: id(4), stage: "installation", search: "bathroom door", overdue: true, awaiting_reinspection: true,
  });
  assert.deepEqual(snagFilters({ contract_id: [id(1), id(2)], search: ["one", "two"], overdue: ["on"], stage: " " }), {});
  assert.throws(() => snagFilters({ team_id: "not-a-team" }), ValidationError);
  assert.throws(() => snagFilters({ search: "x".repeat(201) }), ValidationError);
});

test("lost-response retries restore the original findings even if the form or a retry payload changes", () => {
  const original = form({ ...findings, request_key: id(30), responsibility_allocation: id(31), responsibility_note: "Review the gang's actual work record" });
  const snapshot = snapshotSnagForm(original);
  original.set("description", "Changed after the response was lost");
  original.set("responsibility_allocation", "unknown");
  const retry = restoreSnagForm(snapshot);
  assert.equal(retry.get("description"), findings.description);
  assert.equal(retry.get("responsibility_allocation"), id(31));
  retry.set("description", "Changed retry object");
  assert.equal(restoreSnagForm(snapshot).get("description"), findings.description);
  assert.equal(restoreSnagForm(snapshot).get("request_key"), id(30));
});

test("submission replay keeps the same ordered photographs and version under its request key", () => {
  const original = form({ issue_id: id(1), request_key: id(32), version: "1", action: "submit", note: "Original finding", photo_ids: [id(2), id(3)] });
  const snapshot = snapshotSnagForm(original);
  original.append("photo_ids", id(4));
  original.set("version", "2");
  assert.deepEqual(restoreSnagForm(snapshot).getAll("photo_ids"), [id(2), id(3)]);
  assert.equal(restoreSnagForm(snapshot).get("version"), "1");
  assert.equal(restoreSnagForm(snapshot).get("request_key"), id(32));
});

test("finding snapshots cannot accidentally include an unverified camera file", () => {
  const data = form(findings); data.set("file", new Blob(["camera-preview"], { type: "image/jpeg" }), "preview.jpg");
  assert.throws(() => snapshotSnagForm(data), ValidationError);
});

const emptyDay: SiteDay = {
  day: "2026-10-14", cards: [], unplanned: [], exceptions: [],
  summary: { plannedTeams: 0, confirmedTeams: 0, unconfirmed: 0, notOnSite: 0, presentNow: 0, activeLocations: 0, openPeriods: 0 },
};
const dashboard = { siteHref: `/admin/supervisor/sites/${id(1)}`, issuesHref: `/admin/snags?contract_id=${id(1)}`, checksDone: false, staleOpen: 2, openIssues: 3, day: emptyDay };

test("saved critical defects take priority over reinspection, disputes, overdue repairs and morning checks", () => {
  const action = nextAction({ ...dashboard, snags: { critical: 2, awaiting_reinspection: 3, disputed: 1, overdue: 4 } });
  assert.equal(action.key, "critical");
  assert.equal(action.href, `${dashboard.issuesHref}&severity=critical`);
  assert.match(action.detail, /2 critical findings require immediate office review/);
  assert.match(action.detail, /does not grant a stop-work hold/);
});

test("saved reinspection, responsibility disputes and overdue repairs retain that priority before checks", () => {
  const reinspection = nextAction({ ...dashboard, snags: { critical: 0, awaiting_reinspection: 3, disputed: 1, overdue: 4 } });
  assert.equal(reinspection.key, "reinspection");
  assert.equal(reinspection.href, `${dashboard.issuesHref}&awaiting_reinspection=true`);
  assert.match(reinspection.detail, /independent reinspection/);
  assert.match(reinspection.detail, /Submission is not acceptance/);
  const disputed = nextAction({ ...dashboard, snags: { critical: 0, awaiting_reinspection: 0, disputed: 1, overdue: 4 } });
  assert.equal(disputed.key, "disputed");
  assert.equal(disputed.href, `${dashboard.issuesHref}&disputed=true`);
  const overdue = nextAction({ ...dashboard, snags: { critical: 0, awaiting_reinspection: 0, disputed: 0, overdue: 4 } });
  assert.equal(overdue.key, "overdue");
  assert.equal(overdue.href, `${dashboard.issuesHref}&overdue=true`);
});

test("zero saved snag counts restore the established checks, earlier work, workforce and monitoring flow", () => {
  const noPriority = { ...dashboard, snags: { critical: 0, awaiting_reinspection: 0, disputed: 0, overdue: 0 } };
  assert.equal(nextAction(noPriority).key, "checks");
  assert.equal(nextAction({ ...noPriority, checksDone: true }).key, "earlier");
  const unconfirmed = { ...emptyDay, summary: { ...emptyDay.summary, plannedTeams: 2, unconfirmed: 2 } };
  assert.equal(nextAction({ ...noPriority, checksDone: true, staleOpen: 0, day: unconfirmed }).key, "confirm");
  assert.equal(nextAction({ ...noPriority, checksDone: true, staleOpen: 0, day: { ...unconfirmed, summary: { ...unconfirmed.summary, confirmedTeams: 1 } } }).key, "review");
  assert.equal(nextAction({ ...noPriority, checksDone: true, staleOpen: 0 }).key, "issues");
  assert.equal(nextAction({ ...noPriority, checksDone: true, staleOpen: 0, openIssues: 0 }).key, "monitor");
  assert.equal(nextAction({ ...dashboard, snags: undefined }).key, "checks", "legacy dashboards without snag counts retain the existing flow");
});

test("snag next-action links add a first filter when the register URL has no query string", () => {
  assert.equal(nextAction({ ...dashboard, issuesHref: "/admin/snags", snags: { critical: 0, awaiting_reinspection: 0, disputed: 0, overdue: 1 } }).href, "/admin/snags?overdue=true");
});
