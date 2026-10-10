import test from "node:test";
import assert from "node:assert/strict";
import { calculateEstimate, type EstimateArea } from "../lib/estimator";
import { canManageContracts, canReadFinancial } from "../lib/operations/permissions";
import { commercialInput, contractInput, decimal, fileType, memberRole, ValidationError } from "../lib/operations/validation";
import { inspectEvidence, verifyStoredEvidence } from "../lib/operations/evidence";
import { budgetSummary, contractWarnings } from "../lib/operations/summary";
import { safeAdminRedirect } from "../lib/supabase/navigation";
import { getSupabaseConfiguration } from "../lib/supabase/config";
import type { Commercial, Contract, Member, Role } from "../lib/operations/types";

const area: EstimateArea = { id: 1, description: "School circulation floor", sqm: 500, sell: 35, sub: 17, output: 70, daysExtra: 0, materials: 7, mode: "metre", gangDay: 600 };
const member = (role: Role, financial_access = false, active = true): Member => ({ organisation_id: "company", user_id: "person", display_name: "Person", role, financial_access, active });
test("existing commercial tender defaults remain unchanged", () => {
  const result = calculateEstimate([area], 1800, 5, 30);
  assert.equal(result.revenue, 17500);
  assert.equal(result.labour, 8500);
  assert.equal(result.profit, 2825);
  assert.equal(result.margin.toFixed(1), "16.1");
  assert.equal(result.lines[0].days, 8);
});
test("slower fixed pricework changes duration, never agreed measured labour", () => {
  const faster = calculateEstimate([area], 1800, 5, 30);
  const slower = calculateEstimate([{ ...area, output: 35, daysExtra: 2 }], 1800, 5, 30);
  assert.equal(slower.labour, faster.labour);
  assert.equal(slower.lines[0].days, 17);
});
test("day-rate gang labour rises when programme duration increases", () => {
  const faster = calculateEstimate([{ ...area, mode: "day" }], 1800, 5, 30);
  const slower = calculateEstimate([{ ...area, mode: "day", output: 35 }], 1800, 5, 30);
  assert.equal(faster.labour, 4800);
  assert.equal(slower.labour, 9000);
});
test("zero area and infeasible margin are represented without false profitability", () => {
  const result = calculateEstimate([{ ...area, sqm: 0 }], 1800, 100, 30);
  assert.equal(result.lines[0].days, 0);
  assert.equal(result.margin, 0);
  assert.equal(result.required, Infinity);
});
test("commercial permission is explicit and cannot be supplied by an installer flag", () => {
  assert.equal(canReadFinancial(member("owner")), true);
  assert.equal(canReadFinancial(member("contracts_manager")), false);
  assert.equal(canReadFinancial(member("contracts_manager", true)), true);
  for (const role of ["supervisor", "lead_installer", "subcontract_installer"] as const) {
    assert.equal(canReadFinancial(member(role, true)), false);
    assert.equal(canManageContracts(member(role)), false);
  }
  assert.equal(canReadFinancial(member("owner", true, false)), false);
});
test("contract input rejects impossible dates and reversed programme", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ reference: "TS-001", name: "School", client: "Main contractor", address: "Site", scope: "500m2 corridors", start_date: "2026-02-30" })) form.set(key, value);
  assert.throws(() => contractInput(form), ValidationError);
  form.set("start_date", "2026-10-20"); form.set("end_date", "2026-10-01");
  assert.throws(() => contractInput(form), ValidationError);
});
test("money rejects negatives, exponent notation, NaN and excessive precision", () => {
  const form = new FormData();
  for (const invalid of ["-1", "NaN", "Infinity", "1e6", "12.345", "1000000001"]) {
    form.set("amount", invalid); assert.throws(() => decimal(form, "amount"), ValidationError);
  }
  form.set("amount", "12.34"); assert.equal(decimal(form, "amount"), 12.34);
});
test("unknown and client portal roles cannot be silently granted", () => {
  const form = new FormData(); form.set("role", "client");
  assert.throws(() => memberRole(form), ValidationError);
});
test("document upload checks bytes and claimed MIME, not just extension", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\nvalid test header");
  assert.equal(fileType(pdf, "application/pdf").extension, "pdf");
  assert.throws(() => fileType(pdf, "image/jpeg"), ValidationError);
  assert.throws(() => fileType(new TextEncoder().encode("<html>secret</html>"), "application/pdf"), ValidationError);
  assert.throws(() => fileType(new Uint8Array(0), "image/png"), ValidationError);
  assert.throws(() => fileType(new Uint8Array(4 * 1024 * 1024 + 1), "image/png"), ValidationError);
});
test("contingency is a reserve, never presented as actual expenditure", () => {
  const result = budgetSummary({ contract_value: 100000, labour_budget: 30000, materials_budget: 20000, preliminaries_budget: 10000, contingency: 5000 } as Commercial);
  assert.equal(result.originalCost, 60000);
  assert.equal(result.reserve, 5000);
  assert.equal(result.riskAdjustedProfit, 35000);
  assert.equal(result.margin, 35);
});
test("server completion refuses stored bytes that differ from the reserved revision", () => {
  const original = new TextEncoder().encode("%PDF-1.7\noriginal");
  const reserved = { bytes: original.length, mime_type: "application/pdf", sha256: inspectEvidence(original, "application/pdf").sha256 };
  assert.doesNotThrow(() => verifyStoredEvidence(original, reserved));
  const changed = new TextEncoder().encode("%PDF-1.7\nmodified");
  assert.equal(changed.length, original.length);
  assert.throws(() => verifyStoredEvidence(changed, reserved), ValidationError);
  assert.throws(() => verifyStoredEvidence(new TextEncoder().encode("<html>spoof</html>"), reserved), ValidationError);
});
test("manager budget input cannot lower the owner-configured margin threshold", () => {
  const form = new FormData();
  for (const key of ["contract_value", "labour_budget", "materials_budget", "preliminaries_budget", "contingency", "retention_percent", "target_margin"]) form.set(key, "0");
  assert.equal("target_margin" in commercialInput(form, false), false);
  assert.equal("target_margin" in commercialInput(form, true), true);
});
test("missing drawings/specification/programme warns and never grants installation", () => {
  const warnings = contractWarnings({ tile_specification: "", installation_system: "", movement_joints: "", start_date: null, end_date: null } as Contract, 0, 0);
  assert.equal(warnings.length, 5);
  assert.match(warnings[0], /not released/);
  assert.match(warnings.join(" "), /documents/);
});
test("login return paths cannot escape TileSPEC Admin", () => {
  for (const path of ["https://attacker.example", "//attacker.example", "/\\attacker.example", "/%2f%2fattacker.example", "/admin/../login", "/admin%0a", "/admin/%255c%255cattacker.example"]) assert.equal(safeAdminRedirect(path), "/admin");
  assert.equal(safeAdminRedirect("/admin/contracts?search=school"), "/admin/contracts?search=school");
});
test("backend configuration has no live-project fallback and rejects service keys", () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert.equal(getSupabaseConfiguration(), null);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://tilespec-staging.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_must_not_be_public";
    assert.equal(getSupabaseConfiguration(), null);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_configuration_test";
    assert.equal(getSupabaseConfiguration()?.url, "https://tilespec-staging.supabase.co");
    process.env.NEXT_PUBLIC_SUPABASE_URL += "/unexpected-path";
    assert.equal(getSupabaseConfiguration(), null);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
