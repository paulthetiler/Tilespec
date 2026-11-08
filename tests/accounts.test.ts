import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  billingProfileInput, certificateInput, creditNoteInput, nextStep, payLessInput, receiptInput, shareInput, stageInput, termsInput, valuationInput,
  type AccountRow, type Extra, type Stage,
} from "../lib/operations/accounts";
import { addPence, formatPounds, fromPence, parsePounds, penceOf, toPence } from "../lib/operations/money";
import { ValidationError } from "../lib/operations/validation";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const filesUnder = (dir: string): string[] => readdirSync(path.join(root, dir)).flatMap(name => {
  const relative = path.join(dir, name);
  return statSync(path.join(root, relative)).isDirectory() ? filesUnder(relative) : /\.(ts|tsx)$/.test(name) ? [relative] : [];
});
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const extra = (n: number, over: Partial<Extra> = {}): Extra => ({ daywork_id: id(n), kind: "variation", number: n, reference: `VO-${n}`, description: `Variation ${n}`,
  instructed_on: "2026-10-01", state: "approved", claimable: true, approved_total: 4500, latest_total: 4500, pricing_method: "quoted", included_in: null, sent: true,
  client_required: true, client_status: "authorised", ...over });
const stage = (n: number, amount: number): Stage => ({ id: id(100 + n), position: n, label: `Stage ${n}`, amount, planned_on: null, note: null, voided_at: null });

test("money is parsed into whole pence and back without floating-point error", () => {
  assert.equal(toPence("£12,345.6", "x"), 1234560);
  assert.equal(toPence("0.1", "x") + toPence("0.2", "x"), 30, "0.1 + 0.2 is exactly 30p");
  assert.equal(parsePounds("1,234,567.89", "x"), 1234567.89);
  assert.equal(JSON.stringify({ amount: parsePounds("12162.68", "x") }), '{"amount":12162.68}', "the database receives exactly what was typed");
  assert.equal(toPence("-£420", "x", { allowNegative: true }), -42000);
  for (const bad of ["", "abc", "1.234", "-5", "1e3", "12.3.4", "£"]) assert.throws(() => toPence(bad, "x"), ValidationError, bad);
  assert.throws(() => toPence("1000000000.01", "x"), ValidationError, "above £1bn");
  assert.equal(addPence(0.1, 0.2, "1.05"), 135, "database amounts are added in pence");
  assert.equal(penceOf(254548.75), 25454875);
  assert.equal(fromPence(25454875), 254548.75);
  assert.equal(formatPounds(254548.75), "£254,548.75");
  assert.equal(formatPounds(-420), "−£420.00");
  assert.equal(formatPounds(null), "");
});

test("payment terms are each contract's own, with nothing invented", () => {
  const interim = termsInput(form({ basis: "interim", valuation_frequency: "monthly", valuation_day: "25", advance_payment: "25,000", advance_recovery: "pro_rata",
    materials_on_site: "on", retention_on_materials: "on", retention_percent: "5", retention_cap_percent: "3", retention_pc_release_percent: "50",
    defects_period_months: "12", construction_act: "on", due_days: "7", final_payment_days: "21", payment_notice_days: "5", pay_less_notice_days: "7",
    vat_treatment: "reverse_charge", vat_rate: "20", cis_applies: "on", cis_rate: "20", daywork_plant_markup: "10", daywork_materials_markup: "15",
    order_reference: "SC-4471", payment_terms: "Clause 4" }));
  assert.equal(interim.basis, "interim"); assert.equal(interim.valuation_day, 25); assert.equal(interim.advance_payment, 25000);
  assert.equal(interim.retention_cap_percent, 3); assert.ok(!("retention_cap_amount" in interim), "a blank limit is not sent");
  assert.equal(interim.vat_rate, 20); assert.equal(interim.cis_rate, 20); assert.equal(interim.materials_on_site, true); assert.equal(interim.construction_act, true);
  const staged = termsInput(form({ basis: "milestones", vat_treatment: "zero" }));
  assert.ok(!("valuation_frequency" in staged) && !("vat_rate" in staged), "stage payments have no valuation cycle; zero rating has no rate to enter");
  assert.equal(staged.materials_on_site, false, "materials on site are valued only where the contract says so");
  assert.equal(staged.construction_act, false, "an unticked box is recorded as it is, for example for a residential occupier");
  assert.throws(() => termsInput(form({ retention_cap_percent: "3", retention_cap_amount: "5000" })), ValidationError, "one limit, not two");
  assert.throws(() => termsInput(form({ cis_rate: "15" })), ValidationError, "CIS is 0, 20 or 30 percent");
  assert.throws(() => termsInput(form({ retention_percent: "101" })), ValidationError);
  assert.throws(() => termsInput(form({ bill_to_email: "not an email" })), ValidationError);
});

test("business details are only what the owner records", () => {
  const blank = billingProfileInput(form({ legal_name: "Test Tiling Ltd" }));
  assert.equal(blank.vat_registered, false); assert.equal(blank.vat_number, ""); assert.equal(blank.company_number, ""); assert.equal(blank.bank_sort_code, "");
  assert.equal(billingProfileInput(form({ vat_number: "GB123456789" })).vat_number, "", "a VAT number is ignored unless registration is ticked");
  assert.equal(billingProfileInput(form({ vat_registered: "on", vat_number: "GB 123 4567 89" })).vat_number, "GB 123 4567 89", "the database normalises and checks it");
});

test("a valuation claims only what the server says is claimable, up to its agreed value", () => {
  const extras = [extra(1), extra(2, { claimable: false, state: "submitted", approved_total: null, latest_total: 1200 }), extra(3, { claimable: false, state: "disputed" })];
  const stages = [stage(1, 10000), stage(2, 12000)];
  const parsed = valuationInput(form({ period_end: "2026-10-25", contract_works: "60,000", [`claim_${id(1)}`]: "on", [`claim_${id(2)}`]: "on", [`claim_${id(3)}`]: "on",
    materials_on_site: "8000", deduction_1: "350", deduction_1_description: "Skip hire contra", cis_materials: "9000", note: "Agreed on site" }), { extras, stages });
  assert.deepEqual(parsed, { period_end: "2026-10-25", note: "Agreed on site", cis_materials: 9000, lines: [
    { kind: "contract_works", description: "Contract works to 25 October 2026", amount: 60000 },
    { kind: "extra_work", daywork_id: id(1), description: "VO-1 Variation 1", amount: 4500 },
    { kind: "materials_on_site", description: "Materials on site", amount: 8000 },
    { kind: "deduction", description: "Skip hire contra", amount: 350 }] }, "unagreed and disputed variations are never claimed, even if ticked");
  assert.throws(() => valuationInput(form({ period_end: "2026-10-25", contract_works: "1", [`claim_${id(1)}`]: "on", [`amount_${id(1)}`]: "4500.01" }), { extras, stages }),
    ValidationError, "not above the agreed value");
  const staged = valuationInput(form({ period_end: "2026-10-25", [`stage_${stages[0].id}`]: "on", [`stage_${stages[1].id}`]: "on", [`stage_amount_${stages[1].id}`]: "6000" }),
    { extras: [], stages });
  assert.deepEqual(staged.lines.map(l => [l.kind, l.amount]), [["stage", 10000], ["stage", 6000]], "a stage may be part claimed");
  assert.throws(() => valuationInput(form({ period_end: "2026-10-25", [`stage_${stages[0].id}`]: "on", [`stage_amount_${stages[0].id}`]: "10000.01" }), { extras: [], stages }),
    ValidationError, "not above the stage value");
  assert.deepEqual(valuationInput(form({ period_end: "2026-09-30", contract_works: "100" }), { extras, stages }, "advance").lines, [], "an advance has no lines");
  assert.throws(() => valuationInput(form({ period_end: "2026-10-25", deduction_1: "50", deduction_1_description: "x" }), { extras, stages }), ValidationError,
    "a valuation needs some work, not only deductions");
  assert.throws(() => valuationInput(form({ period_end: "2026-10-25", contract_works: "1", deduction_1: "50" }), { extras, stages }), ValidationError, "say what a deduction is for");
  assert.throws(() => valuationInput(form({ period_end: "25/10/2026", contract_works: "1" }), { extras, stages }), ValidationError);
});

test("certificates, notices, payments and credit notes are pounds and pence on dates that have happened", () => {
  assert.deepEqual(certificateInput(form({ certified_gross: "71,000", certificate_reference: "PC-2", certified_retention: "3550" })),
    { certified_gross: 71000, certificate_reference: "PC-2", certified_retention: 3550 });
  assert.throws(() => certificateInput(form({ certified_gross: "1", certified_on: "2999-01-01" })), ValidationError);
  assert.deepEqual(payLessInput(form({ application_id: id(9), sum_stated: "58000", basis: "Contra for damaged tiles" })),
    { application_id: id(9), sum_stated: 58000, basis: "Contra for damaged tiles" });
  assert.throws(() => payLessInput(form({ application_id: id(9), sum_stated: "1", basis: "" })), ValidationError, "a pay less notice records its basis");
  assert.deepEqual(receiptInput(form({ application_id: id(9), amount: "18,200", cis_deducted: "9800", reference: "BACS" })),
    { application_id: id(9), amount: 18200, cis_deducted: 9800, reference: "BACS" });
  for (const amount of ["0", "-1", "abc"]) assert.throws(() => receiptInput(form({ application_id: id(9), amount })), ValidationError, amount);
  assert.deepEqual(creditNoteInput(form({ invoice_id: id(7), amount: "1000", reason: "Agreed discount" })), { invoice_id: id(7), reason: "Agreed discount", amount: 1000 });
  assert.deepEqual(creditNoteInput(form({ invoice_id: id(7), reason: "Wrong company" })), { invoice_id: id(7), reason: "Wrong company" }, "blank credits the whole invoice");
  assert.throws(() => creditNoteInput(form({ invoice_id: id(7), reason: "" })), ValidationError);
  assert.deepEqual(stageInput(form({ contract_id: id(1), label: "Ground floor", amount: "10000" })), { contract_id: id(1), label: "Ground floor", amount: 10000 });
  assert.deepEqual(shareInput(form({})), { days: 30 });
  assert.throws(() => shareInput(form({ days: "365" })), ValidationError, "a link lasts 90 days at most");
});

test("the office is told plainly what is needed next", () => {
  const row = { display_status: "submitted", construction_act: true, payment_notice_by: "2026-11-08", default_notice_on: null, payable: 54316.68, outstanding: 1000,
    overdue_days: 4, final_on_effective: "2026-11-24" } as unknown as AccountRow;
  assert.match(nextStep(row, "2026-11-01"), /Waiting for the client's payment notice, due by 8 November 2026/);
  assert.match(nextStep(row, "2026-11-09"), /default payment notice/);
  assert.match(nextStep({ ...row, display_status: "overdue" }), /£1,000\.00 overdue by 4 days/);
  assert.match(nextStep({ ...row, display_status: "certified" }), /£54,316\.68 expected/);
});

test("every accounts action refuses anyone without money access before calling the database", () => {
  const actions = source("app/admin/accounts-actions.ts");
  const bodies = actions.split(/export async function /).slice(1);
  assert.ok(bodies.length >= 20);
  for (const body of bodies) {
    const name = body.slice(0, body.indexOf("("));
    const firstCall = body.indexOf("supabase.rpc"), guard = Math.min(...["moneyActor()", "claimOptions("].map(g => body.indexOf(g)).filter(i => i >= 0));
    assert.ok(Number.isFinite(guard) && guard < firstCall, `${name} checks money access before the database`);
    assert.doesNotMatch(body, /\.from\("[a-z_]+"\)\.(insert|update|delete|upsert)/, `${name} writes only through checked functions`);
  }
  assert.match(actions, /if \(member\.role !== "owner"\) throw new ValidationError\("Only the owner can change TileSPEC's business details\."\)/);
});

test("accounts pages and documents are for money access only, and never reach supervisors", () => {
  for (const page of ["app/admin/contracts/[id]/accounts/page.tsx", "app/admin/contracts/[id]/accounts/applications/[applicationId]/page.tsx", "app/admin/accounts/settings/page.tsx"])
    assert.match(source(page), /await requireFinancialActor\(\)/, page);
  for (const route of ["app/admin/contracts/[id]/accounts/documents/[documentId]/route.ts", "app/admin/contracts/[id]/accounts/preview/route.ts"])
    assert.match(source(route), /if \(!canReadFinancial\(member\)\) return notFound\(\);/, route);
  const supervisorFiles = [...filesUnder("app/admin/supervisor"), ...filesUnder("components/site"), "lib/operations/next-actions/snapshot-data.ts"];
  for (const file of supervisorFiles) assert.doesNotMatch(source(file), /accounts-data|accounts-actions|commercial_account|commercial_documents|lib\/documents/, `${file} never touches accounts`);
  const shared = source("app/shared/documents/[token]/route.ts"), reader = source("lib/supabase/shared-documents.ts");
  assert.match(shared, /readSharedDocument\(token\)/);
  assert.equal((reader.match(/\.rpc\(/g) ?? []).length, 1, "the shared link reader makes exactly one call");
  assert.match(reader, /serviceClient\.rpc\("shared_commercial_document"/);
  assert.doesNotMatch(source("lib/operations/accounts-data.ts"), /token_sha256/, "the link secret's hash is never read by the app");
});

test("no screen or document adds up amounts in floating point", () => {
  for (const file of [...filesUnder("lib/documents"), ...filesUnder("components/office/accounts"), "app/admin/contracts/[id]/accounts/page.tsx",
    "app/admin/contracts/[id]/accounts/applications/[applicationId]/page.tsx"]) {
    const text = source(file);
    assert.doesNotMatch(text, /parseFloat|\.reduce\(\(?\w*,?\s*\w*\)?\s*=>\s*\w+\s*\+/, `${file} sums nothing itself`);
  }
  assert.doesNotMatch(source("lib/documents/model.ts"), /Number\([^)]*\)\s*[+\-*/]\s*Number\(/, "the document model does no float arithmetic");
});
