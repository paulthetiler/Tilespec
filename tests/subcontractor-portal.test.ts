import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { agreementDocument, agreementSections, invoiceDocument, isPortalToken, parseClaimForm, parseSignatureForm, portalStatusLabel,
  type ClaimSnapshot, type PortalAgreement } from "../lib/subcontractors/claim";
import { AGREEMENT_TEMPLATE_BODY } from "../lib/subcontractors/agreement-template";
import { renderDocumentPdf } from "../lib/documents/pdf";
import { parseDecisionForm, parseVerificationForm } from "../lib/operations/gang-invoices";
import { everythingElse } from "../lib/operations/role-nav";
import { formatPounds } from "../lib/operations/money";
import { ValidationError } from "../lib/operations/validation";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const filesUnder = (dir: string): string[] => readdirSync(path.join(root, dir)).flatMap(name => {
  const relative = path.join(dir, name);
  return statSync(path.join(root, relative)).isDirectory() ? filesUnder(relative) : /\.(ts|tsx)$/.test(name) ? [relative] : [];
});
const form = (entries: [string, string][]) => { const f = new FormData(); for (const [k, v] of entries) f.append(k, v); return f; };
const C = "8fcdbd57-3fff-4918-890f-e67b8e472e77", A1 = "e6f679fb-bb82-4ff0-84d9-f4cd532a33fb", R1 = "69698ea1-cb85-4bb6-8866-72262677ec86", V1 = "a6600000-0000-4000-8000-000000000001";
const X1 = "a6600000-0000-4000-8000-000000000002", L1 = "a6600000-0000-4000-8000-000000000003";

const snapshot: ClaimSnapshot = { mode: "generated", self_billed: false, reference: "GI-00012",
  issuer: { name: "Dave Tiler", trading_name: "Dave Tiling", address: "1 High Street, Warrington", email: null, phone: "07700 900000", company_number: null, vat_number: null, bank_ending: "5678" },
  customer: { name: "TileSpec Ltd", address: "Unit 24, The Wharf, Warrington", vat_number: "GB123456789" },
  contract: { id: C, reference: "SM-1", name: "Supermarket refurbishment", address: "Retail Park" },
  invoice_number: "0001", invoice_date: "2026-11-10", period_start: null, period_end: "2026-11-10", note: "Week 45",
  lines: [{ work_area_id: A1, area: "Main shop floor", unit: "m2", quantity: 50, rate: 20, amount: 1000 }],
  day_rates: [{ rate_id: R1, unit: "day", rate_description: "Tiler", description: "Making good around the tills", quantity: 2, rate: 180, amount: 360 }],
  variations: [{ variation_id: V1, reference: "SV-00001", description: "Extra skirting", agreed: 500, previously_claimed: 0, amount: 300 }],
  additional: [{ description: "Moved pallets, asked by site manager", amount: 120 }],
  totals: { measured: 1000, day_rates: 360, variations: 300, additional: 120, priced: 1780, net: 1780, vat_treatment: "none", vat_rate: 0, vat: 0, vat_reverse_charge: 0, gross: 1780 },
  estimate: { retention_percent: 5, retention: 89, cis_status: "net", cis_rate: 20, cis: 338.2, payable: 1352.8 },
  payment: { due_on: "2026-11-20", cycle: "weekly", pay_weekday: 5, payment_days: 7 } };

test("a claim form carries quantities and descriptions, and never a rate or a generated total", () => {
  const payload = parseClaimForm(form([["contract_id", C], ["invoice_number", "0001"], ["line_area", A1], ["line_quantity", "50"], ["line_unit", "m2"],
    ["line_area", ""], ["line_quantity", ""], ["line_unit", "m2"], ["rate", "999"], ["line_rate", "999"], ["invoice_total", "99999"],
    ["day_rate_id", R1], ["day_quantity", "2"], ["day_description", "Making good"], ["variation_id", V1], ["variation_amount", "300"],
    ["additional_description", "Moved pallets for the electricians"], ["additional_amount", "120"], ["note", "Week 45"]]), "generated");
  assert.deepEqual(payload, { mode: "generated", contract_id: C, invoice_number: "0001", lines: [{ work_area_id: A1, unit: "m2", quantity: 50 }],
    day_rates: [{ rate_id: R1, quantity: 2, description: "Making good" }], variations: [{ variation_id: V1, amount: 300 }],
    additional: [{ description: "Moved pallets for the electricians", amount: 120 }], note: "Week 45" });
  assert.ok(!JSON.stringify(payload).includes("999"), "a typed rate or total is ignored");
});

test("an uploaded invoice needs its number, date and amount, and something it is for", () => {
  const base: [string, string][] = [["contract_id", C], ["invoice_number", "DT-77"], ["line_area", A1], ["line_quantity", "10"], ["line_unit", "m2"]];
  assert.throws(() => parseClaimForm(form(base), "upload"), /amount on your invoice/);
  assert.throws(() => parseClaimForm(form([...base, ["invoice_total", "230"]]), "upload"), /date on your invoice/);
  assert.throws(() => parseClaimForm(form([...base, ["invoice_total", "230"], ["invoice_date", "2026-02-31"]]), "upload"), /real date/);
  assert.throws(() => parseClaimForm(form([["contract_id", C], ["invoice_number", "DT-77"], ["invoice_total", "230"], ["invoice_date", "2026-11-01"]]), "upload"), /what work this invoice is for/);
  assert.throws(() => parseClaimForm(form([["contract_id", C], ["line_area", A1], ["line_quantity", "10"]]), "upload"), /invoice number/);
  assert.equal(parseClaimForm(form([...base, ["invoice_total", "£1,230.50"], ["invoice_date", "2026-11-01"]]), "upload").invoice_total, 1230.5);
  assert.throws(() => parseClaimForm(form([...base, ["line_area", A1], ["line_quantity", "5"], ["line_unit", "m2"]]), "generated"), /listed twice/);
  assert.throws(() => parseClaimForm(form([["contract_id", C], ["invoice_number", "1"], ["additional_description", "abc"], ["additional_amount", "5"]]), "generated"), ValidationError);
});

test("signing needs every confirmation and a typed signature matching the name", () => {
  const sha = "a".repeat(64);
  const ok: [string, string][] = [["body_sha256", sha], ["signer_name", "Dave Tiler"], ["signature_text", " dave  tiler "], ["confirm_read", "on"], ["confirm_authority", "on"], ["confirm_electronic", "on"]];
  assert.deepEqual(parseSignatureForm(form(ok)), { body_sha256: sha, signer_name: "Dave Tiler", signature_text: "dave  tiler", confirm_read: true, confirm_authority: true, confirm_electronic: true });
  assert.throws(() => parseSignatureForm(form(ok.filter(([k]) => k !== "confirm_authority"))), /Tick all three/);
  assert.throws(() => parseSignatureForm(form(ok.map(([k, v]) => [k, k === "signature_text" ? "D Tiler" : v]))), /type your full name again/);
  assert.throws(() => parseSignatureForm(form(ok.map(([k, v]) => [k, k === "body_sha256" ? "nope" : v]))), /Open the agreement again/);
});

test("a link's secret is exactly 64 hexadecimal characters", () => {
  assert.ok(isPortalToken("0123456789abcdef".repeat(4)));
  for (const bad of ["", "abc", "0123456789ABCDEF".repeat(4), `${"0".repeat(63)}g`, `${"0".repeat(64)}/..`, null, undefined, 5]) assert.equal(isPortalToken(bad), false);
});

test("the invoice prints only amounts the database worked out, at gross value, with additional work kept apart", async () => {
  const model = invoiceDocument(snapshot), all = JSON.stringify(model);
  const known = new Set<string>(); JSON.stringify(snapshot, (_, v) => { if (typeof v === "number") known.add(formatPounds(v)); return v; });
  for (const amount of all.match(/£[\d,]+\.\d{2}/g) ?? []) assert.ok(known.has(amount), `${amount} is in the snapshot`);
  assert.equal(model.plainHeader, true, "printed under the subcontractor's own name, not TileSPEC's logo");
  assert.equal(model.issuer.name, "Dave Tiler"); assert.equal(model.parties[0].lines[0], "TileSpec Ltd"); assert.equal(model.headline?.value, "£1,780.00");
  const headings = model.blocks.map(b => ("heading" in b ? b.heading : undefined));
  assert.ok(headings.includes("Approved variations") && headings.includes("Additional work claimed (not yet approved)"), "additional work is separate from approved variations");
  assert.match(all, /deductions and any agreed retention are made from the payment/); assert.match(all, /ending 5678/);
  assert.ok(!/338|1,352|£89\.00/.test(all), "CIS and retention estimates are not part of the invoice");
  const reverse = invoiceDocument({ ...snapshot, self_billed: true, totals: { ...snapshot.totals, vat_treatment: "reverse_charge", vat_rate: 20, vat_reverse_charge: 356 } });
  assert.equal(reverse.title, "Self-billed invoice"); assert.match(JSON.stringify(reverse), /Reverse charge: customer to pay the VAT to HMRC/);
  const [first, second] = [await renderDocumentPdf(model), await renderDocumentPdf(invoiceDocument(snapshot))];
  assert.equal(first.subarray(0, 5).toString(), "%PDF-"); assert.ok(first.equals(second), "the same snapshot always prints the same bytes, so a retried upload matches");
});

test("the standard agreement covers the required subjects in measured terms and preserves payment rights", () => {
  const sections = agreementSections(AGREEMENT_TEMPLATE_BODY);
  assert.ok(sections.length >= 15 && sections.every(s => s.heading && s.paragraphs.length > 0));
  for (const subject of [/reasonable skill and care/, /Defective Work/, /notify the Subcontractor/, /reasonable opportunity/, /reasonable and properly evidenced cost/, /damages? completed work/i,
    /Health and Safety at Work/, /public liability insurance/, /CSCS/, /Variation/, /day or hourly rate/, /Construction Industry Scheme/, /Retention/, /payment notice/, /pay less notice/,
    /final date for payment/, /section 112/, /adjudication/, /end this agreement/, /Housing Grants, Construction and Regeneration Act 1996/, /Late Payment of Commercial Debts/, /self-billed invoices/])
    assert.match(AGREEMENT_TEMPLATE_BODY, subject);
  assert.match(AGREEMENT_TEMPLATE_BODY, /No sum is recoverable under this clause as a penalty/);
  assert.match(AGREEMENT_TEMPLATE_BODY, /not conditional on the Contractor being paid/);
  assert.doesNotMatch(AGREEMENT_TEMPLATE_BODY, /\bfine[ds]?\b|forfeit|penalty of|£\d+ per (day|defect)/i, "no penalty clauses");
  assert.match(source("lib/subcontractors/agreement-template.ts"), /has NOT been\n \* reviewed by a solicitor/);
});

test("an unsigned agreement is never printed as accepted", () => {
  const issued = { id: "1", reference: "SA-00001", status: "issued", title: "Subcontractor Agreement", version_label: "1.0", issued_at: "2026-11-10T09:00:00Z", signed_at: null, signer_name: null,
    body: "## 1. Work\n\nText.", body_sha256: "b".repeat(64), parties: { contractor: { name: "TileSpec Ltd" }, subcontractor: { name: "Dave Tiler" } }, issued_by: "Faye", signer_position: null,
    signature_text: null, evidence_sha256: null } as PortalAgreement;
  const unsigned = agreementDocument(issued);
  assert.equal(unsigned.watermark, "NOT SIGNED"); assert.equal(unsigned.statusLabel, "Awaiting signature"); assert.match(JSON.stringify(unsigned), /has no effect until the Subcontractor signs it/);
  const signed = agreementDocument({ ...issued, status: "signed", signed_at: "2026-11-10T10:00:00Z", signer_name: "Dave Tiler", signature_text: "Dave Tiler", evidence_sha256: "c".repeat(64) });
  assert.equal(signed.watermark, undefined); assert.match(JSON.stringify(signed), /Signed electronically by the Subcontractor/); assert.match(JSON.stringify(signed), new RegExp("c".repeat(64)));
});

test("the supervisor confirms extras by quantity only; the office approves amounts and may exclude materials from CIS", () => {
  const check = parseVerificationForm(form([[`verified_${L1}`, "45"], [`extra_confirmed_${X1}`, "0"], [`extra_note_${X1}`, "Not instructed"], ["workmanship", "satisfactory"]]), [L1], [X1]);
  assert.deepEqual(check.extras, [{ extra_id: X1, confirmed_quantity: 0, note: "Not instructed" }]);
  assert.ok(!/amount|rate/.test(JSON.stringify(check)), "nothing about money is sent by the supervisor's check");
  assert.equal(parseVerificationForm(form([[`verified_${L1}`, "45"]]), [L1]).extras, undefined, "invoices without extras are checked exactly as before");
  const decision = parseDecisionForm(form([["action", "approve"], [`approved_${L1}`, "45"], [`rate_${L1}`, "20"], [`extra_approved_${X1}`, "0"], ["cis_materials", "150"], ["note", "Reason"]]), [L1], [X1]);
  assert.deepEqual(decision.data, { lines: [{ line_id: L1, approved_quantity: 45, rate: 20 }], extras: [{ extra_id: X1, approved_amount: 0 }], cis_materials: 150, note: "Reason" });
  assert.throws(() => parseDecisionForm(form([["action", "approve"], [`approved_${L1}`, "45"], [`rate_${L1}`, "20"]]), [L1], [X1]), /approved amount for each extra item/);
  assert.deepEqual(parseDecisionForm(form([["action", "approve"], [`approved_${L1}`, "45"], [`rate_${L1}`, "20"]]), [L1]).data, { lines: [{ line_id: L1, approved_quantity: 45, rate: 20 }] });
});

test("status wording for subcontractors is plain", () => {
  assert.equal(portalStatusLabel("awaiting_check"), "Sent · waiting for the site check");
  assert.equal(portalStatusLabel("returned"), "Returned to you to correct");
  assert.equal(portalStatusLabel("paid"), "Paid");
});

test("the portal holds no login, no service key and no direct table access; the admin hub needs money access", () => {
  const portalFiles = [...filesUnder("app/subcontractors"), ...filesUnder("components/subcontractors"), ...filesUnder("lib/subcontractors")].filter(f => !f.endsWith("issue-link.tsx"));
  for (const file of portalFiles) {
    const text = source(file);
    assert.doesNotMatch(text, /service_role|SERVICE_ROLE|requireActor|supabase\/server/, `${file} uses no session or service key`);
    assert.doesNotMatch(text, /\.from\("(?!gang-claims)[a-z_]+"\)/, `${file} reads no table directly`);
    for (const call of text.matchAll(/\.rpc\("([a-z_]+)"/g)) assert.match(call[1], /^portal_/, `${file} calls only portal functions`);
  }
  assert.match(source("lib/subcontractors/portal.ts"), /httpOnly: true/); assert.match(source("lib/subcontractors/portal.ts"), /path: "\/subcontractors"/);
  assert.match(source("app/subcontractors/access/[token]/route.ts"), /Location: `\/subcontractors/, "the link redirects to a clean address");
  assert.doesNotMatch(source("components/subcontractors/claim-form.tsx"), /name="[a-z_]*rate[a-z_]*"(?<!name="day_rate_id")/, "the invoice form has no rate input");
  for (const file of filesUnder("app/admin/subcontractors")) assert.match(source(file), /requireFinancialActor/, `${file} requires money access`);
  assert.ok(everythingElse("owner", true).some(l => l.href === "/admin/subcontractors"));
  assert.ok(!everythingElse("contracts_manager", false).some(l => l.href === "/admin/subcontractors"));
  assert.ok(!everythingElse("supervisor", false).some(l => l.href === "/admin/subcontractors"));
  const migration = source("supabase/migrations/20261112090000_subcontractor_portal.sql");
  assert.doesNotMatch(migration, /grant[^;]*on public\.(subcontractor_bank_details|subcontractor_tax_profiles)[^;]*to anon/i);
  assert.match(source("next.config.ts"), /'\/subcontractors\/:path\*'/);
});
