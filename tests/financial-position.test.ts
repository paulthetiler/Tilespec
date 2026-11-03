import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { belowTarget, positionWarnings, type FinancialPosition } from "../lib/operations/financial-position";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const filesUnder = (dir: string): string[] => readdirSync(path.join(root, dir)).flatMap(name => {
  const relative = path.join(dir, name);
  return statSync(path.join(root, relative)).isDirectory() ? filesUnder(relative) : /\.(ts|tsx)$/.test(name) ? [relative] : [];
});
const position = (over: Partial<FinancialPosition> = {}): FinancialPosition => ({
  contract_id: "c1", has_budget: true, original_value: 100000, budget_cost: 70000, contingency: 3000, target_margin: 25, retention_percent: 5,
  extras_agreed: 320, extras_agreed_count: 1, extras_pending: 0, extras_pending_count: 0, extras_unpriced_count: 0, revised_value: 100320,
  labour_cost: 340, labour_hours_without_rate: 0, labour_still_on_site: 0, materials_cost: 1200, subcontract_cost: 0, plant_cost: 0, other_cost: 0,
  actual_cost: 1540, forecast_cost: 70000, forecast_profit: 27320, forecast_margin: 27.23, budget_profit: 27000, budget_margin: 27,
  applied_gross: null, certified_gross: null, certified_net: null, retention_held: null, received: 0, outstanding: null, subcontract_overlap: 0, ...over,
});

test("the forecast is judged against the target only when there is a margin to judge", () => {
  assert.equal(belowTarget(position()), false);
  assert.equal(belowTarget(position({ forecast_margin: 18.5 })), true);
  assert.equal(belowTarget(position({ forecast_margin: null })), false, "no value, no margin");
  assert.equal(belowTarget(position({ target_margin: null })), false, "no budget, no target");
});

test("anything that makes the figures incomplete is said plainly", () => {
  assert.deepEqual(positionWarnings(position()), []);
  const warnings = positionWarnings(position({ has_budget: false, labour_hours_without_rate: 6, labour_still_on_site: 1, extras_unpriced_count: 2,
    extras_pending_count: 1, subcontract_overlap: 1 }));
  assert.equal(warnings.length, 6);
  assert.match(warnings.join(" "), /No original budget/);
  assert.match(warnings.join(" "), /6 hours of labour have no cost rate/);
  assert.match(warnings.join(" "), /1 person is still on site/);
  assert.match(warnings.join(" "), /2 dayworks or variations are not priced yet/);
  assert.match(warnings.join(" "), /not agreed yet and not in the revised value/);
  assert.match(warnings.join(" "), /counted twice/);
});

test("every money screen shows the database's position and works out no figure of its own", () => {
  const view = source("components/office/financial-position.tsx");
  assert.doesNotMatch(view.replace(/\{\/\*[\s\S]*?\*\/\}/g, ""), /\.reduce\(| [+\-*/] p\.| p\.\w+ [+\-*/] /, "the view adds nothing up");
  assert.match(source("lib/operations/financial-position-data.ts"), /supabase\.rpc\("contract_financial_positions"/);
  for (const file of ["app/admin/money/page.tsx", "app/admin/contracts/[id]/money/page.tsx", "app/admin/contracts/[id]/page.tsx"])
    assert.match(source(file), /positionsFor\(supabase, /, `${file} reads the database's position`);
  const money = source("app/admin/money/page.tsx");
  assert.match(money, /if \(!canReadFinancial\(member\)\) notFound\(\);/);
  assert.match(source("app/admin/contracts/[id]/page.tsx"), /financial \? positionsFor\(supabase, \[id\]\) : Promise\.resolve\(null\)/);
});

test("nothing still says costs, extras or payments are not recorded", () => {
  for (const file of [...filesUnder("app"), ...filesUnder("components"), ...filesUnder("lib")])
    assert.doesNotMatch(source(file), /original budgets only|not recorded in TileSPEC yet|actual costs not yet tracked|claims are not recorded/i, file);
});

test("no supervisor screen, loader or action reads a financial position", () => {
  for (const file of [...filesUnder("app/admin/supervisor"), ...filesUnder("components/site"), "lib/operations/next-actions/snapshot-data.ts", "lib/operations/daywork-data.ts"])
    assert.doesNotMatch(source(file), /positionsFor|contract_financial_positions|FinancialPositionView/, file);
});
