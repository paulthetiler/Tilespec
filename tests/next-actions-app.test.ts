import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "../lib/auth";
import type { NextActionSnapshot, Viewer } from "../lib/operations/next-actions/types";
import { compute, flagEnabled } from "../lib/operations/next-actions";
import { londonDate } from "../lib/operations/planning";

const root = path.resolve(__dirname, "..");
const contractId = "a1000000-0000-4000-8000-000000000001";
const otherContractId = "a1000000-0000-4000-8000-000000000002";
const actor: Member = { organisation_id: "org", user_id: "supervisor", display_name: "Dave Supervisor", role: "supervisor", financial_access: false, active: true };
type Row = Record<string, unknown>;

// Bundle the actual server loader/component, replacing only framework build
// markers, CSS and Next's client-side Link. Business reads and rules are real.
async function serverModule(entry: string) {
  const result = await build({
    entryPoints: [path.join(root, entry)], absWorkingDir: root, bundle: true, write: false,
    platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"],
    alias: {
      "server-only": path.join(root, "tests/rpc-contract/server-only-stub.ts"),
      "@/lib/auth": path.join(root, "tests/rpc-contract/auth-stub.ts"),
    },
    plugins: [{ name: "framework-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture-link" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture-link" }, () => ({ contents: 'import {createElement} from "react"; export default function Link({children,...props}) { return createElement("a",props,children); }' }));
      plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture-navigation" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture-navigation" }, () => ({ contents: 'export function notFound(){throw new Error("NEXT_NOT_FOUND")} export function redirect(url){throw new Error("NEXT_REDIRECT:"+url)}' }));
      plugin.onLoad({ filter: /\.css$/ }, () => ({ contents: "export default {};", loader: "js" }));
    } }],
  });
  const module = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(__filename), module, module.exports);
  return module.exports;
}
const loaderModule = serverModule("lib/operations/next-actions/snapshot-data.ts");
const todayModule = serverModule("components/site/next-actions-today.tsx");
const siteAccessModule = serverModule("app/admin/supervisor/site-access.ts");
const reportModule = serverModule("app/admin/supervisor/sites/[id]/report/page.tsx");
const load = async (client: SupabaseClient, member = actor) => {
  const { loadSiteSnapshot } = await loaderModule;
  return (loadSiteSnapshot as (client: SupabaseClient, member: Member, id: string, horizon: number) => Promise<{ snapshot: NextActionSnapshot; viewer: Viewer }>)(client, member, contractId, 7);
};

// A read-only, role-aware PostgREST boundary fixture: the office recipient RPC
// is denied to supervisors, just as the existing migration requires. No SQL,
// Auth session, table permission or mutation is mocked as a successful write.
function fixture(options: { holds?: number; failure?: string } = {}) {
  const today = londonDate();
  const at = `${today}T08:00:00Z`;
  const contract = { id: contractId, reference: "TEST", name: "Acceptance site", address: "", start_date: today, end_date: "2099-12-31", working_hours: "07:30 to 16:30", tile_specification: "Approved project specification" };
  const rows: Record<string, Row[]> = {
    contracts: [contract, { ...contract, id: otherContractId, name: "Other site" }],
    work_areas: [{ id: "room", contract_id: contractId, name: "Bathroom", parent_id: null, path_ids: ["room"], archived_at: null }],
    planned_allocations: [{ id: "plan", contract_id: contractId, work_area_id: "room", work_package_id: null, team_id: "team", stage: "waterproofing", planned_start: today, planned_end: today, cancelled_at: null, superseded_by: null }],
    subcontractor_companies: [], teams: [{ id: "team", name: "Direct team", company_id: null }], operatives: [],
    team_memberships: [
      { id: "current", team_id: "team", operative_id: "current", is_lead: true, valid_from: "2020-01-01", valid_until: null, voided_at: null },
      { id: "former", team_id: "team", operative_id: "former", is_lead: true, valid_from: "2020-01-01", valid_until: "2020-01-02", voided_at: null },
    ],
    actual_allocations: [], allocation_absences: [], planned_allocation_operatives: [], company_insurances: [], company_accreditations: [],
    supervisor_inspections: [], supervisor_issues: [], document_revisions: [],
    location_inspection_templates: [
      { id: "old-template", contract_id: contractId, work_area_id: "room", stage: "waterproofing", supersedes_id: null, wet_area: true, checklist: [{ label: "Test", wet_only: false, mandatory: true }] },
      { id: "current-template", contract_id: contractId, work_area_id: "room", stage: "waterproofing", supersedes_id: "old-template", wet_area: true, checklist: [{ label: "Test", wet_only: false, mandatory: true }] },
      { id: "dry-template", contract_id: contractId, work_area_id: "room", stage: "grouting", supersedes_id: null, wet_area: false, checklist: [{ label: "Wet only", wet_only: true, mandatory: true }] },
    ],
    location_inspection_requirements: [{ id: "requirement", contract_id: contractId, work_area_id: "room", work_package_id: null, stage: "waterproofing", applicability: "required", template_id: "old-template", created_at: at, supersedes_id: null }],
    location_inspections: [{ id: "inspection", contract_id: contractId, work_area_id: "room", work_package_id: "package", template_id: "old-template", issues_count: 0, answers: [{ item: "Test", status: "pass", mandatory: true }], created_at: at }],
    supervisor_office_items: [], supervisor_office_acknowledgements: [], supervisor_qa_submissions: [],
    site_handovers: [{ id: "someone-elses-handover", contract_id: contractId, actor_id: "other-supervisor", work_date: today, created_at: at }],
    work_holds: Array.from({ length: options.holds ?? 1 }, (_, index) => ({ id: `hold-${String(index).padStart(4, "0")}`, contract_id: contractId, work_area_id: "room", work_package_id: "package", stage: "waterproofing", activity: "Shower wall membrane", location_path: ["Bathroom"], hold_type: "safety", status: "active", reason: "Recorded unsafe access", required_action: "Make the platform safe", raised_by: "supervisor", corrected_by: null, assigned_team_id: null, assigned_operative_id: null, target_date: null })),
  };
  const calls: { table: string; contract?: unknown; range?: number[] }[] = [];
  const rpcs: string[] = [];
  class Query implements PromiseLike<{ data: Row[] | Row | null; error: { code: string } | null }> {
    private predicates: ((row: Row) => boolean)[] = [];
    private columns = "*";
    private first = 0;
    private last = 999;
    private one = false;
    private orders: { key: string; ascending: boolean }[] = [];
    private call: typeof calls[number];
    constructor(private table: string) { this.call = { table }; calls.push(this.call); }
    select(columns: string) { this.columns = columns; return this; }
    eq(key: string, value: unknown) { if (key === "contract_id" || (this.table === "contracts" && key === "id")) this.call.contract = value; this.predicates.push(row => row[key] === value); return this; }
    neq(key: string, value: unknown) { this.predicates.push(row => row[key] !== value); return this; }
    is(key: string, value: unknown) { this.predicates.push(row => (row[key] ?? null) === value); return this; }
    not(key: string, operator: string, value: unknown) { assert.equal(operator, "is"); this.predicates.push(row => (row[key] ?? null) !== value); return this; }
    in(key: string, values: unknown[]) { this.predicates.push(row => values.includes(row[key])); return this; }
    gte(key: string, value: string) { this.predicates.push(row => String(row[key]) >= value); return this; }
    lte(key: string, value: string) { this.predicates.push(row => String(row[key]) <= value); return this; }
    lt(key: string, value: string) { this.predicates.push(row => String(row[key]) < value); return this; }
    order(key: string, options?: { ascending?: boolean }) { this.orders.push({ key, ascending: options?.ascending !== false }); return this; }
    range(first: number, last: number) { this.first = first; this.last = last; this.call.range = [first, last]; return this; }
    limit(limit: number) { this.last = limit - 1; return this; }
    single() { this.one = true; return this; }
    maybeSingle() { return this.single(); }
    then<TResult1 = { data: Row[] | Row | null; error: { code: string } | null }, TResult2 = never>(onfulfilled?: ((value: { data: Row[] | Row | null; error: { code: string } | null }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
      // The authenticated fixture can see this one contract, matching the
      // database access boundary; asking for another ID does not grant access.
      let data = (rows[this.table] ?? []).filter(row => (this.table === "contracts" ? row.id === contractId : !row.contract_id || row.contract_id === contractId)
        && this.predicates.every(predicate => predicate(row)));
      data.sort((a, b) => { for (const order of this.orders) { const result = String(a[order.key]).localeCompare(String(b[order.key])); if (result) return order.ascending ? result : -result; } return 0; });
      data = data.slice(this.first, this.last + 1).map(row => this.columns === "*" ? row : Object.fromEntries(this.columns.split(",").map(column => [column, row[column]])));
      return Promise.resolve({ data: options.failure === this.table ? null : this.one ? data[0] ?? null : data, error: options.failure === this.table ? { code: "42501" } : null }).then(onfulfilled, onrejected);
    }
  }
  const client = {
    from: (table: string) => new Query(table),
    rpc: async (name: string) => {
      rpcs.push(name);
      if (name === "site_supervisor_recipients") return { data: null, error: { code: "42501", message: "Office permission required for this site" } };
      if (name === "allocation_actor_names") return { data: [{ user_id: actor.user_id, display_name: actor.display_name }], error: null };
      if (name === "hold_register") return { data: { work_statuses: [], work_statuses_truncated: false }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  } as unknown as SupabaseClient;
  return { client, calls, rpcs, rows, contract };
}

test("enabled Supervisor Today loads with the office-only recipient directory denied", async () => {
  assert.equal(flagEnabled("nextActions", actor.role, { FEATURE_NEXT_ACTIONS: "supervisor" }), true);
  const f = fixture();
  const { snapshot, viewer } = await load(f.client);
  assert.equal(viewer.user_id, actor.user_id);
  assert.equal(snapshot.members.find(member => member.user_id === actor.user_id)?.role, "supervisor");
  assert.ok(!f.rpcs.includes("site_supervisor_recipients"), "the live supervisor must never enumerate office recipients");
  assert.deepEqual(snapshot.contracts.map(contract => contract.id), [contractId]);
  assert.deepEqual(snapshot.team_memberships.map(member => member.operative_id), ["current"]);
  assert.equal(snapshot.site_handovers[0].actor_id, "other-supervisor");
  assert.ok(compute({ ...snapshot, now: "23:59" }, viewer).some(action => action.rule === "R06"), "someone else's handover does not finish this person's day");
});

test("the actual Today component renders the loader result and exact stopped-work scope", async () => {
  const f = fixture();
  const { NextActionsToday } = await todayModule;
  const tree = await (NextActionsToday as (props: { supabase: SupabaseClient; member: Member; contract: typeof f.contract }) => Promise<ReactNode>)({ supabase: f.client, member: actor, contract: f.contract });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Acceptance site/);
  assert.match(html, /Report an issue/);
  assert.match(html, /Shower wall membrane/);
  assert.match(html, /waterproofing/);
  assert.match(html, /Work package: package/);
  assert.match(html, /Recorded unsafe access/);
  assert.match(html, /Other restrictions still apply/);
  assert.ok(!f.rpcs.includes("site_supervisor_recipients"));
});

test("snapshot pages through active stops instead of silently accepting the response cap", async () => {
  const f = fixture({ holds: 501 });
  const { snapshot } = await load(f.client);
  assert.equal(snapshot.work_holds.length, 501);
  assert.equal(snapshot.work_holds.at(-1)?.id, "hold-0500");
  assert.ok(f.calls.some(call => call.table === "work_holds" && call.range?.[0] === 500));
  for (const call of f.calls.filter(call => ["work_holds", "location_inspection_templates", "location_inspection_requirements", "location_inspections"].includes(call.table))) assert.equal(call.contract, contractId);
});

test("snapshot preserves requirement revisions, exact package and template applicability", async () => {
  const { client } = fixture();
  const { snapshot } = await load(client);
  assert.equal(snapshot.location_inspection_requirements[0].template_current, false);
  assert.equal(snapshot.location_inspection_requirements[0].template_id, "old-template");
  assert.ok(snapshot.location_inspection_requirements[0].created_at);
  assert.equal(snapshot.location_inspections[0].template_id, "old-template");
  assert.equal(snapshot.location_inspections[0].work_package_id, "package");
  assert.equal(snapshot.location_inspection_templates.find(template => template.id === "current-template")?.mandatory, true);
  assert.equal(snapshot.location_inspection_templates.find(template => template.id === "dry-template")?.mandatory, false);
});

test("a refused signed-in read stays an error instead of reporting no restrictions", async () => {
  const { client } = fixture({ failure: "work_holds" });
  await assert.rejects(load(client), /permission/);
});

test("real site and issue-report routes reject inaccessible sites and installers and require explicit opt-in", async () => {
  const { requireSite } = await siteAccessModule;
  const site = requireSite as (id: string) => Promise<{ contract: Row | null }>;
  const { default: ReportIssue } = await reportModule;
  const report = ReportIssue as (props: { params: Promise<{ id: string }> }) => Promise<ReactNode>;
  const globals = globalThis as typeof globalThis & { officeActor?: { supabase: SupabaseClient; member: Member } };
  const previousActor = globals.officeActor;
  const previousFlag = process.env.FEATURE_NEXT_ACTIONS;
  const f = fixture();
  try {
    delete globals.officeActor;
    await assert.rejects(site(contractId), /No acting member set/, "the route cannot read a site without the authenticated actor boundary");
    globals.officeActor = { supabase: f.client, member: actor };
    await assert.rejects(site(otherContractId), /NEXT_NOT_FOUND/, "a hidden contract is not accessible merely by supplying its ID");
    await assert.rejects(site("not-a-uuid"), /NEXT_NOT_FOUND/);
    assert.equal((await site(contractId)).contract?.id, contractId);
    globals.officeActor = { supabase: f.client, member: { ...actor, role: "lead_installer" } };
    assert.equal((await site(contractId)).contract, null, "installers are not given supervisor site screens");
    assert.equal(await report({ params: Promise.resolve({ id: contractId }) }), null);
    globals.officeActor = { supabase: f.client, member: actor };
    process.env.FEATURE_NEXT_ACTIONS = "";
    await assert.rejects(report({ params: Promise.resolve({ id: contractId }) }), /NEXT_NOT_FOUND/, "disabled issue report is a 404");
    process.env.FEATURE_NEXT_ACTIONS = "supervisor";
    const html = renderToStaticMarkup(await report({ params: Promise.resolve({ id: contractId }) }));
    assert.match(html, new RegExp(`/admin/snags/new\\?contract=${contractId}`));
    assert.ok(html.includes(`/admin/holds/new?contract=${contractId}&amp;type=quality`));
    assert.ok(html.includes(`/admin/holds/new?contract=${contractId}&amp;type=safety`));
    assert.match(html, /Existing work restrictions still apply/);
    assert.ok(!html.includes("Work carries on"));
  } finally {
    if (previousActor) globals.officeActor = previousActor; else delete globals.officeActor;
    if (previousFlag === undefined) delete process.env.FEATURE_NEXT_ACTIONS; else process.env.FEATURE_NEXT_ACTIONS = previousFlag;
  }
});
