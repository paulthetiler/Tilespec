import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { jobCostInput, labourRateInput, labourSummary, materialsInput } from "../lib/operations/job-costs";
import { londonDate } from "../lib/operations/planning";
import { ValidationError } from "../lib/operations/validation";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("materials used carry what, how much and where, never a price", () => {
  const parsed = materialsInput(form({ contract_id: id(1), materials: JSON.stringify([
    { item: " Flexible adhesive ", quantity: "10", unit: "bag", work_area_id: id(2) }, { item: "", quantity: "1", unit: "bag" },
    { item: "Grout", quantity: "2.5", unit: "tub", note: "Bathrooms", price: "12.00" }]) }));
  assert.deepEqual(parsed, { contract_id: id(1), lines: [
    { item: "Flexible adhesive", quantity: 10, unit: "bag", work_area_id: id(2) }, { item: "Grout", quantity: 2.5, unit: "tub", note: "Bathrooms" }] });
  assert.ok(!JSON.stringify(parsed).includes("12.00"), "a price typed into the form is never sent");
  for (const bad of [[], [{ item: "Adhesive", quantity: "0", unit: "bag" }], [{ item: "Adhesive", quantity: "1", unit: "pallet" }], [{ item: "Adhesive", quantity: "1.234", unit: "bag" }]])
    assert.throws(() => materialsInput(form({ contract_id: id(1), materials: JSON.stringify(bad) })), ValidationError, JSON.stringify(bad));
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  assert.throws(() => materialsInput(form({ contract_id: id(1), work_date: tomorrow, materials: JSON.stringify([{ item: "A", quantity: "1", unit: "bag" }]) })), /not in the future/);
  assert.equal(materialsInput(form({ contract_id: id(1), work_date: londonDate(), materials: JSON.stringify([{ item: "A", quantity: "1", unit: "bag" }]) })).work_date, londonDate());
});

test("labour cost rates: operative, subcontractor per operative, or gang per day; for one job or every job", () => {
  const base = { contract_id: id(1), request_key: id(9), rate: "22.50", effective_from: "2026-11-01", scope: "all" };
  assert.deepEqual(labourRateInput(form({ ...base, subject: "operative", operative_id: id(3), basis: "hour" })),
    { subject: "operative", subject_id: id(3), basis: "hour", rate: 22.5, effective_from: "2026-11-01" });
  assert.deepEqual(labourRateInput(form({ ...base, subject: "team", team_id: id(4), basis: "hour", scope: "job" })),
    { subject: "team", subject_id: id(4), basis: "day", rate: 22.5, effective_from: "2026-11-01", contract_id: id(1) }, "a gang rate is always per day");
  assert.equal(labourRateInput(form({ ...base, subject: "company", company_id: id(5), basis: "day", rate: "£1,250" })).rate, 1250);
  for (const bad of [{ rate: "0" }, { rate: "abc" }, { subject: "agency" }, { scope: "" }, { effective_from: "soon" }])
    assert.throws(() => labourRateInput(form({ ...base, subject: "operative", operative_id: id(3), basis: "hour", ...bad })), ValidationError, JSON.stringify(bad));
});

test("a job cost is net of VAT, says who it is from, and may be a credit", () => {
  const base = { contract_id: id(1), category: "materials", supplier: "Tile Supplies Ltd", description: "Adhesive delivery", net_amount: "1200" };
  assert.deepEqual(jobCostInput(form(base)), { contract_id: id(1), category: "materials", supplier: "Tile Supplies Ltd", description: "Adhesive delivery", net_amount: 1200 });
  assert.equal(jobCostInput(form({ ...base, net_amount: "-50.25" })).net_amount, -50.25);
  assert.equal((jobCostInput(form({ ...base, daywork_id: id(7) })) as Record<string, unknown>).daywork_id, id(7));
  for (const bad of [{ net_amount: "0" }, { net_amount: "" }, { supplier: "" }, { category: "wages" }, { description: "x" }, { net_amount: "1.001" }])
    assert.throws(() => jobCostInput(form({ ...base, ...bad })), ValidationError, JSON.stringify(bad));
});

test("the labour summary separates what is costed from hours without a rate and people still on site", () => {
  assert.deepEqual(labourSummary([{ hours: 4, cost: 80, status: "costed" }, { hours: 16, cost: 600, status: "costed" }, { hours: 6, cost: null, status: "no_rate" },
    { hours: 2, cost: null, status: "open" }]), { cost: 680, costedHours: 20, noRateHours: 6, open: 1 });
});

test("the supervisor's materials screen and actions never read or send money", () => {
  for (const file of ["app/admin/supervisor/sites/[id]/materials/page.tsx", "app/admin/supervisor/material-actions.ts", "components/site/material-lines.tsx"]) {
    // Comments may say "never a price"; the code itself must not touch money.
    const text = source(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(text, /jobMoneyFor|job_cost_entries|labour_cost_rates|material_cost_matches|contract_labour_costs|pounds\(|price|net_amount/i, file);
  }
  const loader = source("lib/operations/job-costs-data.ts");
  const materials = loader.slice(loader.indexOf("export async function materialsFor"), loader.indexOf("export type JobMoney"));
  assert.doesNotMatch(materials, /cost|rate|match|amount/i, "the materials loader reads quantities only");
});

test("job money is behind money access in the page, every action, and the database", () => {
  const page = source("app/admin/contracts/[id]/money/page.tsx");
  assert.match(page, /const \{ supabase \} = await requireFinancialActor\(\);/);
  const actions = source("app/admin/money-actions.ts");
  const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map(match => match[1]);
  assert.ok(exported.length >= 6);
  for (const name of exported) {
    const body = actions.slice(actions.indexOf(`export async function ${name}(`), actions.indexOf("\n}\n", actions.indexOf(`export async function ${name}(`)));
    assert.ok(body.indexOf("await moneyActor()") >= 0 && body.indexOf("await moneyActor()") < body.indexOf(".rpc("), `${name} checks money access first`);
  }
  assert.match(actions, /if \(!canReadFinancial\(actor\.member\)\) throw/);
  const contractPage = source("app/admin/contracts/[id]/page.tsx");
  assert.match(contractPage, /\{financial && <Link href=\{`\/admin\/contracts\/\$\{id\}\/money`\}>Job money<\/Link>\}/, "only money users are offered the link");
  const migration = source("supabase/migrations/20261104110000_job_costs.sql");
  for (const table of ["labour_cost_rates", "job_cost_entries", "material_cost_matches"])
    assert.match(migration, new RegExp(`create policy ${table}_read[^;]*(can_view_financials|has_money_access)`), table);
  assert.match(migration, /create policy site_material_records_read[^;]*can_supervise_contract/);
});
