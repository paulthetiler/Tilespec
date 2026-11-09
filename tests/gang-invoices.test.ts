import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  gangStatusLabel, parseDecisionForm, parseGangInvoiceForm, parseVerificationForm, paymentDue, paymentTermsText, quantityText, rateFor, type GangRate,
} from "../lib/operations/gang-invoices";
import { ValidationError } from "../lib/operations/validation";
import { destinationsFor, everythingElse } from "../lib/operations/role-nav";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const filesUnder = (dir: string): string[] => readdirSync(path.join(root, dir)).flatMap(name => {
  const relative = path.join(dir, name);
  return statSync(path.join(root, relative)).isDirectory() ? filesUnder(relative) : /\.(ts|tsx)$/.test(name) ? [relative] : [];
});
const form = (entries: [string, string][]) => { const f = new FormData(); for (const [k, v] of entries) f.append(k, v); return f; };
const C = "8fcdbd57-3fff-4918-890f-e67b8e472e77", T = "a6400000-0000-4000-8000-000000000001";
const A1 = "e6f679fb-bb82-4ff0-84d9-f4cd532a33fb", A2 = "69698ea1-cb85-4bb6-8866-72262677ec86";
const L1 = "a6600000-0000-4000-8000-000000000001", L2 = "a6600000-0000-4000-8000-000000000002";

test("the plain status labels the brief asks for", () => {
  assert.equal(gangStatusLabel("awaiting_check"), "Awaiting check");
  assert.equal(gangStatusLabel("with_office", "satisfactory"), "Checked and passed · Sent to office");
  assert.equal(gangStatusLabel("with_office", "correction_needed"), "Correction needed · Sent to office");
  assert.equal(gangStatusLabel("approved"), "Approved for payment");
  assert.equal(gangStatusLabel("paid"), "Payment recorded");
  assert.equal(quantityText(55, "m2"), "55 m²");
});

test("payment dates match the database rule: invoice Friday, paid the following Friday", () => {
  const weekly = { payment_cycle: "weekly", pay_weekday: 5, payment_days: 7, cycle_anchor: null };
  assert.equal(paymentDue(weekly, "2026-11-06"), "2026-11-13");
  assert.equal(paymentDue(weekly, "2026-11-09"), "2026-11-20");
  assert.equal(paymentDue({ payment_cycle: "fortnightly", pay_weekday: 5, payment_days: 7, cycle_anchor: "2026-11-06" }, "2026-11-09"), "2026-11-27");
  assert.equal(paymentDue({ payment_cycle: "custom", pay_weekday: 5, payment_days: 30, cycle_anchor: null }, "2026-11-09"), "2026-12-09");
  assert.match(paymentTermsText(weekly), /invoices in by Friday are paid the following Friday/);
});

test("the gang's form: one simple line, or several areas and units", () => {
  const simple = parseGangInvoiceForm(form([["job", `${C}:${T}`], ["line_area", A1], ["line_quantity", "55"], ["line_unit", "m2"]]));
  assert.deepEqual(simple, { contract_id: C, team_id: T, lines: [{ work_area_id: A1, unit: "m2", quantity: 55 }] });
  const several = parseGangInvoiceForm(form([["job", `${C}:${T}`], ["line_area", A1], ["line_quantity", "55.5"], ["line_unit", "m2"],
    ["line_area", A1], ["line_quantity", "12"], ["line_unit", "lm"], ["line_area", ""], ["line_quantity", ""], ["line_unit", "m2"],
    ["invoice_number", "INV-7"], ["invoice_total", "£1,017.50"]]));
  assert.equal(several.lines.length, 2, "an unused extra row is ignored");
  assert.equal(several.invoice_total, 1017.5);
  assert.throws(() => parseGangInvoiceForm(form([["job", `${C}:${T}`], ["line_area", A1], ["line_quantity", "5"], ["line_unit", "m2"], ["line_area", A1], ["line_quantity", "6"], ["line_unit", "m2"]])), ValidationError);
  assert.throws(() => parseGangInvoiceForm(form([["job", `${C}:${T}`], ["line_area", A2], ["line_quantity", "0"], ["line_unit", "m2"]])), ValidationError);
  assert.throws(() => parseGangInvoiceForm(form([["job", ""], ["line_area", A2], ["line_quantity", "4"]])), /Choose the job/);
  assert.throws(() => parseGangInvoiceForm(form([["job", `${C}:${T}`], ["line_area", ""], ["line_quantity", "4"]])), /work area/);
});

test("the supervisor's check: correction needed must be described", () => {
  const ok = parseVerificationForm(form([[`verified_${L1}`, "50"], [`passed_${L1}`, "50"], ["workmanship", "satisfactory"]]), [L1]);
  assert.deepEqual(ok, { lines: [{ line_id: L1, verified_quantity: 50, measured_passed: 50 }], workmanship: "satisfactory" });
  assert.throws(() => parseVerificationForm(form([[`verified_${L1}`, "5"], [`correction_${L1}`, "3"]]), [L1]), /Describe the correction/);
  const fix = parseVerificationForm(form([[`verified_${L1}`, "0"], [`correction_${L1}`, "3"], ["correction_note", "Relay lippage at the door"]]), [L1]);
  assert.equal(fix.workmanship, "correction_needed");
});

test("office decisions: approval needs a rate, a rejection needs a reason", () => {
  const approve = parseDecisionForm(form([["action", "approve"], [`approved_${L1}`, "50"], [`rate_${L1}`, "18.50"], [`approved_${L2}`, "0"], [`rate_${L2}`, ""],
    ["adjustment_amount", "-25"], ["adjustment_reason", "Agreed deduction for skip"], ["note", "5 m² not laid"]]), [L1, L2]);
  assert.deepEqual(approve.data, { lines: [{ line_id: L1, approved_quantity: 50, rate: 18.5 }, { line_id: L2, approved_quantity: 0, rate: 0 }],
    adjustment_amount: -25, adjustment_reason: "Agreed deduction for skip", note: "5 m² not laid" });
  assert.throws(() => parseDecisionForm(form([["action", "approve"], [`approved_${L1}`, "50"]]), [L1]), /agreed rate/);
  assert.throws(() => parseDecisionForm(form([["action", "reject"], ["note", "no"]]), []), /reason/);
  assert.deepEqual(parseDecisionForm(form([["action", "mark_paid"], ["paid_amount", "740"], ["paid_on", "2026-11-13"]]), []).data, { paid_amount: 740, paid_on: "2026-11-13" });
  assert.throws(() => parseDecisionForm(form([["action", "pay_now"]]), []), ValidationError, "there is no action that pays a bank");
});

test("the agreed rate prefers the most specific location, then the latest", () => {
  const rates: GangRate[] = [
    { id: "1", work_area_id: null, unit: "m2", rate: 18.5, effective_from: "2026-01-01", created_at: "2026-01-01", voided_at: null },
    { id: "2", work_area_id: A2, unit: "m2", rate: 22, effective_from: "2026-01-01", created_at: "2026-01-01", voided_at: null },
    { id: "3", work_area_id: null, unit: "m2", rate: 19, effective_from: "2026-12-01", created_at: "2026-11-01", voided_at: null },
    { id: "4", work_area_id: A1, unit: "m2", rate: 99, effective_from: "2026-01-01", created_at: "2026-01-01", voided_at: "2026-02-01" },
  ];
  assert.equal(rateFor(rates, [A1], "m2", "2026-11-09")?.rate, 18.5, "a withdrawn rate is never used; a future rate is not yet in force");
  assert.equal(rateFor(rates, [A2], "m2", "2026-11-09")?.rate, 22);
  assert.equal(rateFor(rates, [A1], "lm", "2026-11-09"), null);
});

test("supervisor screens never ask for money records, and gangs reach theirs only through their own function", () => {
  const supervisorFiles = [...filesUnder("app/admin/supervisor"), "components/gang/verify-line.tsx", "lib/operations/gang-data.ts"]
    .filter(f => !f.endsWith("gang-data.ts"));
  for (const file of supervisorFiles) {
    const text = source(file);
    for (const table of ["gang_invoice_commercials", "gang_rates", "gang_subcontracts", "job_cost_entries"]) assert.ok(!text.includes(`"${table}"`), `${file} reads ${table}`);
    assert.doesNotMatch(text, /from\("gang_invoice_files"\)[^;]*\.eq\("kind", "invoice"\)/, `${file} reads the invoice document`);
  }
  for (const file of filesUnder("app/admin/gang")) {
    const text = source(file);
    for (const table of ["gang_invoice_commercials", "gang_rates", "gang_subcontracts", "gang_progress_checks", "gang_verification_requests"]) assert.ok(!text.includes(`from("${table}")`), `${file} reads ${table}`);
  }
  for (const file of filesUnder("app/admin/gang-invoices").filter(f => !f.includes("files"))) {
    assert.match(source(file), /requireFinancialActor/, `${file}: office gang invoice screens require money access`);
  }
});

test("a gang's Today is its invoices, and office money users can reach the queue", () => {
  assert.equal(destinationsFor("subcontract_installer", "/admin")[0].href, "/admin/gang");
  assert.ok(everythingElse("lead_installer", false).some(l => l.href === "/admin/gang"));
  assert.ok(everythingElse("owner", true).some(l => l.href === "/admin/gang-invoices"));
  assert.ok(!everythingElse("contracts_manager", false).some(l => l.href === "/admin/gang-invoices"), "no money access, no gang invoice money");
});

test("the supervisor dashboard shows the count without reintroducing a STOP WORK button", () => {
  const today = source("components/site/next-actions-today.tsx");
  assert.match(today, /Verify gang progress/);
  assert.match(today, /pendingGangChecks\(supabase, contract\.id\)/);
  assert.doesNotMatch(today, /STOP WORK/i);
  assert.doesNotMatch(source("app/admin/supervisor/sites/[id]/page.tsx"), /STOP WORK/i);
});
