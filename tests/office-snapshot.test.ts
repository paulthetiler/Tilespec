import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "../lib/auth";
import type { NextActionSnapshot, Viewer } from "../lib/operations/next-actions/types";
import { compute } from "../lib/operations/next-actions";
import { addDays, londonDate, londonTimeToIso } from "../lib/operations/planning";

type Row = Record<string, unknown>;
const root = path.resolve(__dirname, "..");
const org = "organisation-a";
const site = "site-a";
const otherSite = "site-b";
const manager: Member = { organisation_id: org, user_id: "manager", display_name: "Office person", role: "contracts_manager", financial_access: false, active: true };
const owner: Member = { ...manager, user_id: "owner", role: "owner", display_name: "Owner" };

// Bundle the actual server loader. Only the framework's server-only build marker
// is replaced; mapping, permissions, dates, pagination and engine remain real.
const loader = build({
  entryPoints: [path.join(root, "lib/operations/next-actions/office-snapshot.ts")],
  absWorkingDir: root, bundle: true, write: false, platform: "node", format: "cjs",
  alias: { "server-only": path.join(root, "tests/rpc-contract/server-only-stub.ts") },
}).then(result => {
  const bundled = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(__filename), bundled, bundled.exports);
  return bundled.exports.loadOfficeSnapshot as (client: SupabaseClient, member: Member) => Promise<{ snapshot: NextActionSnapshot; viewer: Viewer }>;
});

function fixture(options: { failure?: string; nullData?: string; thrown?: string; holds?: number; contracts?: number; actor?: Member; databaseDay?: string } = {}) {
  const today = londonDate();
  const at = londonTimeToIso(today, "08:00");
  const saved = (row: Row): Row => ({ organisation_id: org, ...row });
  const contract = (id: string) => saved({ id, reference: id.toUpperCase(), name: `Saved ${id}`, start_date: today, end_date: "2099-12-31", working_hours: "07:30 to 16:30", tile_specification: "Approved saved specification" });
  const rows: Record<string, Row[]> = {
    contracts: [contract(site), contract(otherSite), { ...contract("foreign-site"), organisation_id: "organisation-b" }],
    organisation_members: [
      saved({ ...manager }), saved({ ...owner }),
      saved({ user_id: "current-supervisor", display_name: "Current supervisor", role: "supervisor", financial_access: false, active: true }),
      saved({ user_id: "second-supervisor", display_name: "Second supervisor", role: "supervisor", financial_access: false, active: true }),
      saved({ user_id: "expired-supervisor", display_name: "Expired supervisor", role: "supervisor", financial_access: false, active: true }),
      saved({ user_id: "future-supervisor", display_name: "Future supervisor", role: "supervisor", financial_access: false, active: true }),
      saved({ user_id: "inactive-supervisor", display_name: "Inactive supervisor", role: "supervisor", financial_access: false, active: false }),
      saved({ user_id: "installer", display_name: "Installer", role: "lead_installer", financial_access: false, active: true }),
      saved({ user_id: "inactive-installer", display_name: "Inactive installer", role: "lead_installer", financial_access: false, active: false }),
    ],
    contract_assignments: [
      saved({ contract_id: site, user_id: manager.user_id, valid_from: "2020-01-01", valid_until: null }),
      saved({ contract_id: otherSite, user_id: manager.user_id, valid_from: "2020-01-01", valid_until: "2020-01-02" }),
      ...["current-supervisor", "second-supervisor", "inactive-supervisor"].map(user_id => saved({ contract_id: site, user_id, valid_from: "2020-01-01", valid_until: null })),
      saved({ contract_id: site, user_id: "expired-supervisor", valid_from: "2020-01-01", valid_until: "2020-01-02" }),
      saved({ contract_id: site, user_id: "future-supervisor", valid_from: "2099-01-01", valid_until: null }),
    ],
    package_assignments: [
      saved({ contract_id: site, work_package_id: "package", user_id: "installer" }),
      saved({ contract_id: site, work_package_id: "package", user_id: "inactive-installer" }),
    ],
    work_areas: [saved({ id: "room", contract_id: site, name: "Bathroom", parent_id: null, path_ids: ["room"] }), saved({ id: "other-room", contract_id: otherSite, name: "Hidden room", parent_id: null, path_ids: ["other-room"] })],
    work_packages: [saved({ id: "package", contract_id: site, name: "Bathroom tiling" })],
    subcontractor_companies: [saved({ id: "company", name: "Saved contractor" })],
    company_insurances: [saved({ id: "insurance", company_id: "company", insurance_type: "public_liability", expires_on: "2099-12-31", voided_at: null })],
    teams: [saved({ id: "team", name: "Saved gang", company_id: "company" })],
    operatives: [
      saved({ id: "current-operative", display_name: "Current lead", company_id: "company", user_id: "installer", status: "active" }),
      saved({ id: "inactive-operative", display_name: "Former lead", company_id: "company", user_id: "inactive-installer", status: "inactive" }),
    ],
    team_memberships: [
      saved({ id: "current-membership", team_id: "team", operative_id: "current-operative", is_lead: true, valid_from: "2020-01-01", valid_until: null, voided_at: null }),
      saved({ id: "inactive-membership", team_id: "team", operative_id: "inactive-operative", is_lead: true, valid_from: "2020-01-01", valid_until: null, voided_at: null }),
      saved({ id: "expired-membership", team_id: "team", operative_id: "current-operative", is_lead: true, valid_from: "2019-01-01", valid_until: "2019-12-31", voided_at: null }),
      saved({ id: "future-membership", team_id: "team", operative_id: "current-operative", is_lead: true, valid_from: "2099-01-01", valid_until: null, voided_at: null }),
      saved({ id: "void-membership", team_id: "team", operative_id: "current-operative", is_lead: true, valid_from: "2020-01-01", valid_until: null, voided_at: at }),
    ],
    planned_allocations: [saved({ id: "plan", contract_id: site, work_area_id: "room", work_package_id: "package", team_id: "team", stage: "waterproofing", planned_start: today, planned_end: today, cancelled_at: null, superseded_by: null })],
    actual_allocations: [
      saved({ id: "today-actual", contract_id: site, planned_allocation_id: "plan", work_area_id: "room", team_id: "team", work_date: today, started_at: at, ended_at: null, voided_at: null }),
      saved({ id: "stale-actual", contract_id: site, planned_allocation_id: null, work_area_id: "room", team_id: "team", work_date: "2020-01-01", started_at: "2020-01-01T08:00:00Z", ended_at: null, voided_at: null }),
      saved({ id: "finished-earlier", contract_id: site, planned_allocation_id: null, work_area_id: "room", team_id: "team", work_date: "2020-01-01", started_at: "2020-01-01T08:00:00Z", ended_at: "2020-01-01T16:00:00Z", voided_at: null }),
      saved({ id: "void-actual", contract_id: site, planned_allocation_id: "plan", work_area_id: "room", team_id: "team", work_date: today, started_at: at, ended_at: null, voided_at: at }),
    ],
    allocation_absences: [],
    supervisor_inspections: [saved({ id: "morning", contract_id: site, created_at: londonTimeToIso(today, "00:01") })],
    location_inspection_templates: [
      saved({ id: "old-template", contract_id: site, work_area_id: "room", stage: "waterproofing", supersedes_id: null, wet_area: true, checklist: [{ label: "Old membrane check", mandatory: true }] }),
      saved({ id: "new-template", contract_id: site, work_area_id: "room", stage: "waterproofing", supersedes_id: "old-template", wet_area: true, checklist: [{ label: "New membrane check", mandatory: true }] }),
      saved({ id: "dry-template", contract_id: site, work_area_id: "room", stage: "grouting", supersedes_id: null, wet_area: false, checklist: [{ label: "Wet only check", wet_only: true, mandatory: true }] }),
    ],
    location_inspection_requirements: [
      saved({ id: "old-requirement", contract_id: site, work_area_id: "room", work_package_id: "package", stage: "waterproofing", applicability: "required", template_id: "old-template", created_at: "2020-01-01T09:00:00.000001Z", supersedes_id: null }),
      saved({ id: "requirement", contract_id: site, work_area_id: "room", work_package_id: "package", stage: "waterproofing", applicability: "required", template_id: "old-template", created_at: `${today}T09:00:00.000002Z`, supersedes_id: "old-requirement" }),
    ],
    location_inspections: [saved({ id: "old-pass", contract_id: site, work_area_id: "room", work_package_id: "package", template_id: "old-template", issues_count: 0, answers: [{ item: "Check", status: "pass", mandatory: true }], created_at: `${today}T09:00:00.000001Z` })],
    supervisor_issues: [],
    work_holds: Array.from({ length: options.holds ?? 1 }, (_, index) => saved({ id: `hold-${String(index).padStart(4, "0")}`, contract_id: site, work_area_id: "room", work_package_id: "package", stage: "waterproofing", activity: "Saved wall membrane", location_path: ["Bathroom"], hold_type: "safety", status: "awaiting_release", reason: "Unsafe access", required_action: "Make access safe", raised_by: "current-supervisor", corrected_by: manager.user_id, assigned_team_id: "team", assigned_operative_id: null, target_date: today })),
    supervisor_office_items: [saved({ id: "instruction", contract_id: site, kind: "instruction", title: "Saved instruction", body: "Use the revised drawing", recipient_id: null, acknowledgement_required: true, work_area_id: null, stage: null, created_by: manager.user_id, created_at: at, due_on: null })],
    supervisor_office_acknowledgements: [saved({ id: "acknowledgement", contract_id: site, item_id: "instruction", actor_id: "current-supervisor" })],
    supervisor_qa_submissions: [],
    site_handovers: [saved({ id: "handover", contract_id: site, actor_id: "current-supervisor", work_date: today, created_at: at })],
    document_revisions: [
      saved({ id: "saved-document", contract_id: site, classification: "operational", uploaded_at: at }),
      saved({ id: "pending-document", contract_id: site, classification: "operational", uploaded_at: null }),
      saved({ id: "financial-document", contract_id: site, classification: "commercial", uploaded_at: at }),
    ],
  };
  if (options.contracts) {
    for (let index = 0; index < options.contracts; index++) rows.contracts.push(contract(`batch-site-${String(index).padStart(4, "0")}`));
  }
  const calls: { table: string; filters: [string, string, unknown][]; range?: number[] }[] = [];
  class Query implements PromiseLike<{ data: Row[] | null; error: { code: string } | null }> {
    private predicates: ((row: Row) => boolean)[] = [];
    private first = 0;
    private last = 999;
    private columns = "*";
    private orders: string[] = [];
    private call: typeof calls[number];
    constructor(private table: string) { this.call = { table, filters: [] }; calls.push(this.call); }
    select(columns: string) { this.columns = columns; return this; }
    eq(key: string, value: unknown) { this.call.filters.push(["eq", key, value]); this.predicates.push(row => row[key] === value); return this; }
    neq(key: string, value: unknown) { this.call.filters.push(["neq", key, value]); this.predicates.push(row => row[key] !== value); return this; }
    is(key: string, value: unknown) { this.call.filters.push(["is", key, value]); this.predicates.push(row => (row[key] ?? null) === value); return this; }
    not(key: string, operator: string, value: unknown) { assert.equal(operator, "is"); this.call.filters.push(["not", key, value]); this.predicates.push(row => (row[key] ?? null) !== value); return this; }
    in(key: string, values: unknown[]) { this.call.filters.push(["in", key, values]); this.predicates.push(row => values.includes(row[key])); return this; }
    gte(key: string, value: string) { this.call.filters.push(["gte", key, value]); this.predicates.push(row => String(row[key]) >= value); return this; }
    lte(key: string, value: string) { this.call.filters.push(["lte", key, value]); this.predicates.push(row => String(row[key]) <= value); return this; }
    lt(key: string, value: string) { this.call.filters.push(["lt", key, value]); this.predicates.push(row => String(row[key]) < value); return this; }
    order(key: string) { this.orders.push(key); return this; }
    range(first: number, last: number) { this.first = first; this.last = last; this.call.range = [first, last]; return this; }
    then<TResult1 = { data: Row[] | null; error: { code: string } | null }, TResult2 = never>(onfulfilled?: ((value: { data: Row[] | null; error: { code: string } | null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
      const response = async () => {
        if (options.thrown === this.table) throw new Error("Transport interrupted");
        if (options.failure === this.table) return { data: null, error: { code: "42501" } };
        if (options.nullData === this.table) return { data: null, error: null };
        const actor = options.actor ?? manager;
        const databaseDay = options.databaseDay ?? today;
        // Match the real contract RLS boundary, including its database calendar
        // date. The loader cannot turn an arbitrary supplied ID into access.
        const visible = new Set(rows.contracts.filter(row => actor.role === "owner" || rows.contract_assignments.some(assignment => assignment.contract_id === row.id
          && assignment.user_id === actor.user_id && String(assignment.valid_from) <= databaseDay && (!assignment.valid_until || String(assignment.valid_until) >= databaseDay))).map(row => row.id));
        let data = (rows[this.table] ?? []).filter(row => row.organisation_id === org
          && (this.table === "contracts" ? visible.has(row.id) : !row.contract_id || visible.has(row.contract_id))
          && this.predicates.every(predicate => predicate(row)));
        data.sort((a, b) => { for (const key of this.orders) { const result = String(a[key]).localeCompare(String(b[key])); if (result) return result; } return 0; });
        data = data.slice(this.first, this.last + 1).map(row => this.columns === "*" ? row : Object.fromEntries(this.columns.split(",").map(column => [column, row[column]])));
        return { data, error: null };
      };
      return response().then(onfulfilled, onrejected);
    }
  }
  const client = { from: (table: string) => {
    assert.notEqual(table, "contract_commercials", "Today must never query commercial numbers, including authorised owners");
    return new Query(table);
  } } as unknown as SupabaseClient;
  return { client, calls, rows, today, saved };
}

test("real office loader rejects inactive and site-only roles before any read", async () => {
  const load = await loader;
  for (const actor of [{ ...manager, active: false }, { ...manager, role: "supervisor" as const }, { ...manager, role: "lead_installer" as const }, { ...manager, role: "subcontract_installer" as const }]) {
    const f = fixture({ actor });
    await assert.rejects(load(f.client, actor), /permission/);
    assert.equal(f.calls.length, 0);
  }
});

test("manager snapshot scopes every saved site read to current assigned jobs and its organisation", async () => {
  const f = fixture();
  const { snapshot, viewer } = await (await loader)(f.client, manager);
  assert.deepEqual(snapshot.contracts.map(row => row.id), [site]);
  assert.deepEqual(snapshot.work_areas.map(row => row.id), ["room"]);
  assert.equal(viewer.financial_access, false);
  assert.ok(!JSON.stringify(snapshot).includes("Hidden room"));
  const scopedTables = new Set(["work_areas", "work_packages", "package_assignments", "planned_allocations", "actual_allocations", "allocation_absences", "supervisor_inspections", "location_inspection_templates", "location_inspection_requirements", "location_inspections", "supervisor_issues", "work_holds", "supervisor_office_items", "supervisor_office_acknowledgements", "supervisor_qa_submissions", "site_handovers", "document_revisions"]);
  for (const call of f.calls) {
    assert.ok(call.filters.some(([operator, key, value]) => operator === "eq" && key === "organisation_id" && value === org), `${call.table} needs organisation scope`);
    if (scopedTables.has(call.table)) assert.deepEqual(call.filters.find(([operator, key]) => operator === "in" && key === "contract_id")?.[2], [site], `${call.table} needs authorised job scope`);
  }
});

test("owner sees all authorised jobs while Today keeps financial reads and uploaded commercial documents separate", async () => {
  for (const actor of [owner, { ...manager, financial_access: true }]) {
    const f = fixture({ actor });
    const { snapshot, viewer } = await (await loader)(f.client, actor);
    assert.equal(viewer.financial_access, true);
    assert.deepEqual(snapshot.commercials, []);
    assert.deepEqual(snapshot.document_revisions.map(row => row.id), ["saved-document"]);
    assert.ok(!f.calls.some(call => call.table === "contract_commercials"));
    assert.deepEqual(snapshot.contracts.map(row => row.id), actor.role === "owner" ? [site, otherSite] : [site]);
  }
});

test("a manager's RLS-authorised job remains visible when database date differs from the London work day", async () => {
  const previousDay = addDays(londonDate(), -1);
  const f = fixture({ databaseDay: previousDay });
  const assignment = f.rows.contract_assignments.find(row => row.user_id === manager.user_id && row.contract_id === site)!;
  assignment.valid_until = previousDay;
  const { snapshot, viewer } = await (await loader)(f.client, manager);
  assert.deepEqual(snapshot.contracts.map(row => row.id), [site]);
  assert.ok(snapshot.contract_assignments.some(row => row.contract_id === site && row.user_id === manager.user_id));
  assert.equal(snapshot.work_holds.length, 1);
  assert.ok(compute(snapshot, viewer).some(action => action.rule === "G05"), "a timezone re-check cannot hide an authorised active hold");
});

test("saved morning blockers are separate from snags, paginate completely and retain the existing issue route", async () => {
  const f = fixture();
  f.rows.supervisor_issues = [
    ...Array.from({ length: 501 }, (_, index) => f.saved({ id: `readiness-${String(index).padStart(4, "0")}`, contract_id: site, inspection_id: "morning", check_label: "Materials ready", description: "The delivery is missing", state: index === 0 ? "reinspection_required" : "open", created_at: londonTimeToIso(f.today, "08:00"), snag_status: null })),
    f.saved({ id: "closed-readiness", contract_id: site, inspection_id: "morning", check_label: "Access ready", description: "Now resolved", state: "closed", created_at: londonTimeToIso(f.today, "08:00"), snag_status: null }),
    f.saved({ id: "hidden-readiness", contract_id: otherSite, inspection_id: "hidden-morning", check_label: "Hidden check", description: "Another job's problem", state: "open", created_at: londonTimeToIso(f.today, "08:00"), snag_status: null }),
  ];
  const { snapshot, viewer } = await (await loader)(f.client, manager);
  assert.equal(snapshot.readiness_issues?.length, 501);
  assert.deepEqual(snapshot.supervisor_issues, [], "morning checks must not be assigned a fictional snag lifecycle");
  const first = snapshot.readiness_issues![0];
  assert.equal(first.inspection_id, "morning");
  assert.equal(first.state, "reinspection_required");
  assert.equal(first.description, "The delivery is missing");
  assert.ok(!JSON.stringify(snapshot).includes("Another job's problem"));
  const actions = compute(snapshot, viewer).filter(action => action.rule === "R17");
  assert.equal(actions.length, 501);
  assert.ok(actions.every(action => action.state === "ready" && action.source.table === "supervisor_issues" && action.route.screen === "snag"));
});

test("current supervisors and memberships retain per-person acknowledgements, handovers and package access", async () => {
  const f = fixture();
  const { snapshot, viewer } = await (await loader)(f.client, manager);
  assert.deepEqual(snapshot.contract_assignments.map(row => row.user_id).sort(), ["current-supervisor", "manager", "second-supervisor"]);
  assert.deepEqual(snapshot.package_assignments.map(row => row.user_id), ["installer"]);
  assert.deepEqual(snapshot.team_memberships, [{ team_id: "team", operative_id: "current-operative", is_lead: true }]);
  assert.deepEqual(snapshot.actual_allocations.map(row => row.id).sort(), ["stale-actual", "today-actual"]);
  assert.equal(snapshot.site_handovers[0].actor_id, "current-supervisor");
  assert.equal(snapshot.supervisor_office_acknowledgements[0].user_id, "current-supervisor");
  const actions = compute({ ...snapshot, now: "23:59" }, viewer);
  assert.ok(actions.some(action => action.rule === "R05"), "one person's acknowledgement cannot clear a broadcast for the second supervisor");
  assert.ok(actions.some(action => action.rule === "R06"), "one person's handover cannot clear the second supervisor's day");
  assert.ok(!actions.some(action => action.rule === "R01"), "a real check saved in the London day is recognised");
});

test("saved current requirement, template, package and microsecond approval metadata cannot be replaced by an earlier pass", async () => {
  const f = fixture();
  const { snapshot, viewer } = await (await loader)(f.client, manager);
  assert.deepEqual(snapshot.location_inspection_requirements.map(row => row.id), ["requirement"]);
  const requirement = snapshot.location_inspection_requirements[0];
  assert.equal(requirement.template_current, false);
  assert.equal(requirement.template_id, "old-template");
  assert.equal(requirement.work_package_id, "package");
  assert.equal(requirement.created_at, `${f.today}T09:00:00.000002Z`);
  assert.equal(snapshot.location_inspections[0].created_at, `${f.today}T09:00:00.000001Z`);
  assert.equal(snapshot.location_inspections[0].template_id, "old-template");
  assert.equal(snapshot.location_inspections[0].work_package_id, "package");
  assert.equal(snapshot.location_inspection_templates.find(row => row.id === "new-template")?.mandatory, true);
  assert.equal(snapshot.location_inspection_templates.find(row => row.id === "dry-template")?.mandatory, false);
  assert.ok(compute(snapshot, viewer).some(action => action.rule === "G08"));
});

test("active hold pagination preserves every restriction and independent release metadata", async () => {
  const f = fixture({ holds: 1001 });
  const { snapshot, viewer } = await (await loader)(f.client, manager);
  assert.equal(snapshot.work_holds.length, 1001);
  assert.equal(snapshot.work_holds.at(-1)?.id, "hold-1000");
  const hold = snapshot.work_holds[0];
  assert.equal(hold.work_package_name, "Bathroom tiling");
  assert.equal(hold.activity, "Saved wall membrane");
  assert.equal(hold.stage, "waterproofing");
  assert.equal(hold.raised_by, "current-supervisor");
  assert.equal(hold.corrected_by, manager.user_id);
  assert.deepEqual(f.calls.filter(call => call.table === "work_holds").map(call => call.range?.[0]), [0, 500, 1000]);
  const decisions = compute(snapshot, viewer).filter(action => action.rule === "G05");
  assert.equal(decisions.length, 1001);
  assert.ok(decisions.every(action => action.state === "blocked" && action.blockedBy?.includes("submitted the fix")));
});

test("office pages the job list and batches IDs instead of performing a complete snapshot per site", async () => {
  const f = fixture({ contracts: 501, actor: owner });
  const { snapshot } = await (await loader)(f.client, owner);
  assert.equal(snapshot.contracts.length, 503);
  assert.deepEqual(f.calls.filter(call => call.table === "contracts").map(call => call.range?.[0]), [0, 500]);
  assert.equal(f.calls.filter(call => call.table === "work_holds").length, 6);
  assert.equal(f.calls.filter(call => call.table === "organisation_members").length, 1);
  assert.equal(f.calls.filter(call => call.table === "team_memberships").length, 1);
  assert.ok(f.calls.filter(call => call.table === "work_holds").every(call => (call.filters.find(([operator, key]) => operator === "in" && key === "contract_id")?.[2] as string[]).length <= 100));
});

test("a replacement checklist beyond the first page invalidates the earlier approved template", async () => {
  const f = fixture();
  for (let index = 0; index < 500; index++) {
    f.rows.location_inspection_templates.push(f.saved({ id: `history-${String(index).padStart(4, "0")}`, contract_id: site, work_area_id: "room", stage: "grouting", supersedes_id: null, wet_area: false, checklist: [{ label: "Historic observation", mandatory: false }] }));
  }
  f.rows.location_inspection_templates.push(f.saved({ id: "z-current-template", contract_id: site, work_area_id: "room", stage: "waterproofing", supersedes_id: "new-template", wet_area: true, checklist: [{ label: "Latest mandatory membrane check", mandatory: true }] }));
  f.rows.location_inspection_requirements[1].template_id = "new-template";
  const { snapshot, viewer } = await (await loader)(f.client, manager);
  assert.ok(snapshot.location_inspection_templates.some(row => row.id === "z-current-template"));
  assert.ok(!snapshot.location_inspection_templates.some(row => row.id === "new-template"));
  assert.equal(snapshot.location_inspection_requirements[0].template_current, false);
  assert.ok(compute(snapshot, viewer).some(action => action.rule === "G08"));
});

test("null, refused, missing and interrupted reads remain unavailable instead of an empty successful queue", async () => {
  const load = await loader;
  for (const options of [{ failure: "work_holds" }, { failure: "supervisor_office_items" }, { nullData: "location_inspection_requirements" }, { thrown: "supervisor_inspections" }]) {
    const f = fixture(options);
    await assert.rejects(load(f.client, manager), /permission|could not be read/);
  }
});

test("plans, current absences and daily records respect saved dates instead of manufacturing work", async () => {
  const f = fixture();
  f.rows.planned_allocations.push(
    f.saved({ ...f.rows.planned_allocations[0], id: "cancelled-plan", cancelled_at: `${f.today}T08:00:00Z` }),
    f.saved({ ...f.rows.planned_allocations[0], id: "replaced-plan", superseded_by: "plan" }),
    f.saved({ ...f.rows.planned_allocations[0], id: "future-plan", planned_start: addDays(f.today, 8), planned_end: addDays(f.today, 10) }),
  );
  f.rows.allocation_absences.push(
    f.saved({ id: "absence", contract_id: site, planned_allocation_id: "plan", work_date: f.today, voided_at: null }),
    f.saved({ id: "void-absence", contract_id: site, planned_allocation_id: "plan", work_date: f.today, voided_at: `${f.today}T08:00:00Z` }),
  );
  const { snapshot } = await (await loader)(f.client, manager);
  assert.deepEqual(snapshot.planned_allocations.map(row => row.id), ["plan"]);
  assert.deepEqual(snapshot.allocation_absences, [{ planned_allocation_id: "plan", work_date: f.today }]);
});
