import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { Member } from "../lib/auth";
import { buildQueue, compute, queueCounts, type NextActionSnapshot, type Viewer } from "../lib/operations/next-actions";

const root = path.resolve(__dirname, "..");
const today = "2026-10-16";
const owner: Member = { organisation_id: "org", user_id: "owner", display_name: "Alex Owner", role: "owner", financial_access: false, active: true };
const office: Member = { ...owner, user_id: "office", display_name: "Jo Office", role: "contracts_manager" };
const viewerFor = (member: Member): Viewer => ({ user_id: member.user_id, role: member.role, financial_access: member.financial_access });

async function loadComponent() {
  const result = await build({
    entryPoints: [path.join(root, "components/admin/admin-today.tsx")], absWorkingDir: root, bundle: true, write: false,
    platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"],
    plugins: [{ name: "framework-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture-link" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture-link" }, () => ({ contents: 'import {createElement} from "react"; export default function Link({children,...props}) { return createElement("a",props,children); }' }));
      plugin.onLoad({ filter: /\.css$/ }, () => ({ contents: "export default {};", loader: "js" }));
    } }],
  });
  const module = { exports: {} as { AdminToday?: (props: { snapshot: NextActionSnapshot; viewer: Viewer; member: Member }) => ReactNode } };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(__filename), module, module.exports);
  assert.ok(module.exports.AdminToday);
  return module.exports.AdminToday;
}
const component = loadComponent();

function snapshot(): NextActionSnapshot {
  return {
    today, now: "17:45", members: [owner, office, { user_id: "supervisor", display_name: "Dave Site", role: "supervisor", financial_access: false }],
    contracts: [{ id: "job", reference: "SAVED", name: "Recorded site", start_date: today, end_date: "2027-01-01", working_hours: "07:30 to 16:30", tile_specification: "" }],
    commercials: [{ contract_id: "job", contract_value: 987654321, labour_budget: 900000000, materials_budget: 80000000, preliminaries_budget: 0, contingency: 0, target_margin: 30 }],
    contract_assignments: [{ contract_id: "job", user_id: "supervisor" }, { contract_id: "job", user_id: "office" }], package_assignments: [],
    work_areas: [{ id: "room", contract_id: "job", name: "Shower room", path_ids: ["room"], parent_id: null }],
    companies: [], company_insurances: [], teams: [{ id: "gang", name: "Assigned gang", company_id: null }], operatives: [], team_memberships: [],
    planned_allocations: [], actual_allocations: [], allocation_absences: [], supervisor_inspections: [], location_inspection_templates: [],
    location_inspection_requirements: [], location_inspections: [], supervisor_issues: [],
    work_holds: [
      { id: "safety", contract_id: "job", work_area_id: "room", hold_type: "safety", status: "active", reason: "Unsafe platform", required_action: "Replace platform", raised_by: "supervisor", corrected_by: null, assigned_team_id: "gang", assigned_operative_id: null, target_date: null, critical_snags_open: false, stage: "waterproofing", activity: "Shower membrane", work_package_id: "package", work_package_name: "Wet room package", location_path: ["Shower room"] },
      { id: "independent", contract_id: "job", work_area_id: "room", hold_type: "quality", status: "awaiting_release", reason: "Failed substrate check", required_action: "Repair substrate", raised_by: "owner", corrected_by: "supervisor", assigned_team_id: "gang", assigned_operative_id: null, target_date: null, critical_snags_open: false },
      { id: "decision", contract_id: "job", work_area_id: "room", hold_type: "quality", status: "awaiting_release", reason: "Earlier water test failed", required_action: "Replace membrane", raised_by: "supervisor", corrected_by: null, assigned_team_id: "gang", assigned_operative_id: null, target_date: null, critical_snags_open: false },
      { id: "released", contract_id: "job", work_area_id: "room", hold_type: "quality", status: "released", reason: "Historic released hold", required_action: "Historic", raised_by: "supervisor", corrected_by: null, assigned_team_id: "gang", assigned_operative_id: null, target_date: null, critical_snags_open: false },
    ],
    supervisor_office_items: [], supervisor_office_acknowledgements: [], supervisor_qa_submissions: [], site_handovers: [], document_revisions: [],
  };
}

async function render(s: NextActionSnapshot, member: Member) {
  return renderToStaticMarkup((await component)({ snapshot: s, viewer: viewerFor(member), member }));
}
const actionIds = (html: string) => [...html.matchAll(/data-action-id="([^"]+)"/g)].map(match => match[1]);

test("Office Today renders every non-financial engine task exactly once, including a long Then queue", async () => {
  const s = snapshot();
  // Enough genuine, unfinished setup records to catch a hard-coded top-five or
  // top-twenty queue limit. These fixtures stay entirely inside the test.
  s.contracts.push(...Array.from({ length: 24 }, (_, index) => ({ ...s.contracts[0], id: `job-${index}`, reference: `JOB-${index}`, name: `Saved job ${index}` })));
  s.contract_assignments.push(...s.contracts.slice(1).map(contract => ({ contract_id: contract.id, user_id: office.user_id })));
  const expected = compute(s, viewerFor(office)).filter(action => !action.financial && action.process !== "money");
  const q = buildQueue(expected);
  assert.ok(q.then.length > 20);
  const html = await render(s, office);
  assert.deepEqual(actionIds(html).sort(), expected.map(action => action.id).sort());
  assert.equal(new Set(actionIds(html)).size, actionIds(html).length);
  assert.ok(html.includes(`Then (${q.then.length})`));
  assert.ok(html.includes(`${queueCounts(q).actions} things need you.`));
  assert.match(html, /Waiting on others/);
  assert.match(html, /Waiting on Assigned gang/);
  assert.ok(html.includes('href="#today-waiting"'));
  assert.ok(html.includes('id="today-waiting"'));
  assert.ok(html.indexOf('href="#today-waiting"') < html.indexOf('aria-label="Then"'));
  assert.ok(html.includes('href="/admin/messages"'));
  assert.ok(html.includes('href="/admin/paperwork"'));
});

test("owner Today separates an independent decision from blocked problems and never offers the blocked decision", async () => {
  const s = snapshot();
  const html = await render(s, owner);
  const expected = compute(s, viewerFor(owner)).filter(action => !action.financial && action.process !== "money");
  assert.deepEqual(actionIds(html).sort(), expected.map(action => action.id).sort());
  assert.match(html, /Your attention today/);
  assert.match(html, /Do this next/);
  assert.match(html, /Outstanding problems \(1\)/);
  assert.ok(html.includes('href="#today-problems"'));
  assert.ok(html.includes('id="today-problems"'));
  assert.match(html, /You cannot take this decision/);
  assert.match(html, /someone else has to check it/);
  const blocked = html.match(/<article[^>]*data-action-id="hold-release:independent"[\s\S]*?<\/article>/)?.[0];
  assert.ok(blocked);
  assert.ok(blocked.includes('href="/admin/holds/independent"'));
  assert.match(blocked, /View saved details/);
  assert.ok(!blocked.includes("Review and decide"));
});

test("all active restrictions remain prominent with exact scope and history links", async () => {
  const s = snapshot();
  s.now = "07:00";
  const html = await render(s, owner);
  assert.match(html, /Work that is stopped \(3\)/);
  assert.match(html, /1 safety stop · 2 quality holds/);
  assert.ok(html.includes('href="#today-stopped"'));
  assert.ok(html.includes('id="today-stopped"'));
  assert.ok(html.indexOf('aria-label="Do this next"') < html.indexOf('data-hold-id="safety"'), "many holds must not bury the primary action");
  assert.deepEqual([...html.matchAll(/data-hold-id="([^"]+)"/g)].map(match => match[1]).sort(), ["decision", "independent", "safety"]);
  assert.match(html, /Shower room · waterproofing · Work package: Wet room package · Shower membrane/);
  assert.match(html, /Unsafe platform/);
  assert.match(html, /Completing a task here does not release any hold/);
  assert.match(html, /Other restrictions still apply/);
  assert.ok(!html.includes("Historic released hold"));
});

test("Today never renders financial figures and Money links follow the authenticated permission", async () => {
  const s = snapshot();
  for (const member of [owner, office, { ...office, financial_access: true }]) {
    const html = await render(s, member);
    assert.ok(!/987.?654.?321|Budget margin|budgeted profit|margin:job|£/.test(html));
    assert.equal(html.includes('href="/admin/money"'), member.role === "owner" || member.financial_access);
  }
});

test("a remaining restriction is never described as cleared when there are no owner actions", async () => {
  const s = snapshot();
  s.work_holds = [s.work_holds[0]];
  const html = await render(s, owner);
  assert.match(html, /Nothing needs you right now/);
  assert.match(html, /Work is still restricted/);
  assert.match(html, /Affected work stays stopped/);
  assert.ok(!html.includes("Do this next"));
});

test("Today refuses an inactive or mismatched actor and does not expose office UI to a site role", async () => {
  const AdminToday = await component;
  const s = snapshot();
  assert.throws(() => AdminToday({ snapshot: s, viewer: viewerFor(owner), member: { ...owner, active: false } }), /authenticated office or owner/);
  assert.throws(() => AdminToday({ snapshot: s, viewer: viewerFor(owner), member: office }), /authenticated office or owner/);
  const supervisor: Member = { ...office, role: "supervisor" };
  assert.throws(() => AdminToday({ snapshot: s, viewer: viewerFor(supervisor), member: supervisor }), /authenticated office or owner/);
});
