import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { documentModel, longDate, type DocumentModel, type DocumentRecord } from "../lib/documents/model";
import { renderDocumentPdf } from "../lib/documents/pdf";
import { formatPounds } from "../lib/operations/money";
import { sampleRecord } from "../scripts/render-sample-documents";

// Snapshots the real database functions produced for the fictitious job in
// scripts/sample-commercial-documents.sql (regenerate with npm run samples:documents).
const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", "documents", `${name}.json`), "utf8")) as DocumentRecord;
const text = (model: DocumentModel) => JSON.stringify(model);
const amountsPrinted = (model: DocumentModel) => [...text(model).matchAll(/−?£[\d,]+\.\d{2}/g)].map(m => m[0]);
const amountsIn = (value: unknown, found = new Set<string>()): Set<string> => {
  if (typeof value === "number") { found.add(formatPounds(value)); found.add(formatPounds(-value)); }
  else if (Array.isArray(value)) value.forEach(v => amountsIn(v, found));
  else if (value && typeof value === "object") Object.values(value).forEach(v => amountsIn(v, found));
  return found;
};

test("every amount a document prints was worked out by the database", () => {
  for (const name of ["payment-application", "invoice", "credit-note", "statement", "final-account", "final-account-invoice"]) {
    const record = fixture(name), known = amountsIn(record.snapshot);
    for (const amount of amountsPrinted(documentModel(record)))
      assert.ok(known.has(amount.replace(/^−/, "")) || known.has(amount), `${name} prints ${amount}, which is in its snapshot`);
  }
});

test("the payment application shows the contract sum, valuation, retention, previous sums, VAT and CIS", () => {
  const record = fixture("payment-application"), s = record.snapshot, model = documentModel(record), all = text(model);
  assert.equal(model.title, "Payment application"); assert.equal(model.reference, "TS-2417/PA-04"); assert.equal(model.mode, "issued");
  assert.deepEqual(model.headline, { label: "Amount applied for", value: formatPounds(s.figures.applied_this_period), detail: "Excluding VAT" });
  assert.equal(model.headline?.value, "£58,245.85");
  const sum = model.blocks.find(b => b.type === "summary" && b.heading === "Contract sum");
  assert.ok(sum && sum.type === "summary" && sum.rows.some(r => r.label === "Revised contract sum" && r.value === "£496,523.53"));
  assert.ok(sum && sum.type === "summary" && sum.rows.some(r => /not yet agreed/.test(r.label) && r.value === "£5,235.00"), "unagreed extras are shown apart, not added");
  const valuation = model.blocks.find(b => b.type === "summary" && b.heading === "Valuation summary");
  assert.ok(valuation && valuation.type === "summary");
  const row = (label: string) => valuation.rows.find(r => r.label === label)?.value;
  assert.equal(row("Gross valuation to date"), "£243,253.53");
  assert.equal(row("Less retention held"), "(£12,162.68)");
  assert.equal(row("Less agreed deductions"), "(£420.00)");
  assert.equal(row("Net valuation to date"), "£230,670.85");
  assert.equal(row("Less previously certified or notified"), "(£172,425.00)");
  assert.equal(row("Amount due this application (excluding VAT)"), "£58,245.85");
  assert.equal(row("Expected payment"), "£54,316.68");
  assert.match(all, /VAT at 20%: to be accounted for by the customer/);
  assert.match(all, /Reverse charge: customer to pay the VAT to HMRC\. VAT Act 1994 Section 55A applies\./);
  assert.match(all, /Housing Grants, Construction and Regeneration Act 1996, as amended/);
  assert.match(all, new RegExp(`payment notice is to be given by ${longDate(s.application.payment_notice_by)}`));
  assert.match(all, new RegExp(`no later than ${longDate(s.application.pay_less_by)}`));
  assert.match(all, /deducts CIS at 20% from the labour element only, excluding materials of £38,600\.00/);
  const notAgreed = model.blocks.find(b => b.type === "table" && b.heading === "Submitted but not yet agreed");
  assert.ok(notAgreed && notAgreed.type === "table" && notAgreed.rows.map(r => r.cells[0]).join() === "VO-3,VO-4");
  const history = model.blocks.find(b => b.type === "table" && b.heading === "Previous applications");
  assert.ok(history && history.type === "table" && history.rows.length === 3 && history.rows.every(r => r.cells[6] === "Paid"));
});

test("only recorded business details are printed; nothing is invented", () => {
  const raw = fixture("payment-application");
  assert.ok(documentModel(raw).issuer.legal.some(line => line === `VAT registration ${raw.snapshot.issuer.vat_number}`), "a recorded VAT number is printed");
  const sample = documentModel(sampleRecord(raw), { sample: true });
  assert.equal(sample.mode, "sample");
  assert.deepEqual(sample.issuer.legal, [], "with no registered office, company number or VAT number recorded, none is printed");
  assert.equal(sample.issuer.name, "TileSPEC");
  assert.ok(!sample.blocks.some(b => b.type === "pairs" && b.heading === "Payment details"), "no bank details are printed unless recorded");
  const unregistered = structuredClone(raw);
  unregistered.snapshot.issuer = { ...unregistered.snapshot.issuer, vat_registered: false, vat_number: null };
  unregistered.snapshot.figures = { ...unregistered.snapshot.figures, vat_treatment: "not_registered", vat: 0, vat_reverse_charge: 0 };
  const plain = text(documentModel(unregistered));
  assert.doesNotMatch(plain, /VAT at|VAT registration|reverse charge/i, "without a VAT registration, no VAT is shown at all");
});

test("the invoice carries what a VAT invoice needs", () => {
  const record = fixture("invoice"), inv = record.snapshot.invoice, model = documentModel(record), all = text(model);
  assert.equal(model.title, "Invoice"); assert.equal(model.reference, "INV-00001");
  assert.ok(model.facts.some(f => f.label === "Invoice number" && f.value === "INV-00001"));
  assert.ok(model.facts.some(f => f.label === "Invoice date and tax point" && f.value === longDate(record.issued_on)));
  assert.equal(model.parties[0].label, "Invoice to"); assert.equal(model.parties[0].lines[0], "Example Construction Ltd");
  assert.ok(model.issuer.legal.includes(`VAT registration ${record.snapshot.issuer.vat_number}`));
  assert.match(all, /Interim payment application No\. 3, works valued to 25 September 2026, in accordance with certificate PC-03/);
  assert.match(all, new RegExp(`"Net amount","value":"${formatPounds(inv.net).replace(/[£.]/g, "\\$&")}"`));
  assert.match(all, /Reverse charge: customer to pay the VAT to HMRC/);
  assert.equal(model.headline?.value, formatPounds(inv.total));
});

test("credit notes, statements, schedules and the final account read correctly", () => {
  const cn = documentModel(fixture("credit-note"));
  assert.equal(cn.title, "Credit note"); assert.equal(cn.headline?.label, "Total credited");
  assert.ok(cn.facts.some(f => f.label === "Credits invoice" && f.value === "INV-00001"));
  assert.match(text(cn), /"label":"Total credited","value":"£500\.00"/);
  const st = fixture("statement"), statement = documentModel(st);
  assert.equal(statement.headline?.value, formatPounds(st.snapshot.balance));
  const ledger = statement.blocks.find(b => b.type === "table" && b.heading === "Account");
  assert.ok(ledger && ledger.type === "table" && ledger.rows.at(-1)?.cells.at(-1) === formatPounds(st.snapshot.balance));
  const vs = text(documentModel(fixture("variation-schedule")));
  assert.match(vs, /Includes DW-3/); assert.match(vs, /"Disputed"/); assert.match(vs, /"Application 4"/);
  assert.match(vs, /"label":"Approved \(in the revised contract sum\)","value":"£9,190\.00"/);
  const ds = text(documentModel(fixture("daywork-summary")));
  assert.match(ds, /Site acknowledgement: signed by A\. Example, Site manager/);
  assert.match(ds, /Commercial approval: approved/);
  assert.match(ds, /Client authorisation: DWS-1/);
  assert.match(ds, /Included in VO-1; not charged separately/);
  assert.match(ds, /£6\.50 \(10%\)/, "an agreed plant markup is shown on its line");
  const fa = documentModel(fixture("final-account")), all = text(fa);
  assert.equal(fa.title, "Final account"); assert.equal(fa.headline?.label, "Balance due on the final account");
  assert.match(all, /No retention is held under this contract/);
  assert.match(all, /"label":"Total including VAT","value":"£18,294\.00"/);
});

test("a preview is marked as not issued, and a superseded document says so", () => {
  const record = fixture("payment-application");
  assert.equal(documentModel({ ...record, preview: true }).mode, "preview");
  assert.equal(documentModel({ ...record, reference: null }).mode, "preview");
  assert.equal(documentModel({ ...record, superseded: true }).superseded, true);
  assert.equal(documentModel({ ...record, snapshot_sha256: "a".repeat(64) }).checksum, "a".repeat(64));
});

test("documents render as print-ready A4 PDFs with the brand fonts embedded", async () => {
  for (const [name, pages] of [["payment-application", 2], ["invoice", 1], ["statement", 1]] as const) {
    const bytes = await renderDocumentPdf(documentModel(sampleRecord(fixture(name)), { sample: true }));
    const raw = bytes.toString("latin1");
    assert.ok(raw.startsWith("%PDF-"), `${name} is a PDF`);
    assert.equal((raw.match(/\/Type \/Page\b/g) ?? []).length, pages, `${name} has ${pages} page(s)`);
    assert.match(raw, /\/MediaBox \[0 0 595\.28\d* 841\.89\d*\]/, "A4: 595.28 by 841.89 points");
    assert.match(raw, /DMSans/); assert.match(raw, /BarlowCondensed/);
    assert.ok(bytes.length < 200_000, `${name} stays small (${bytes.length} bytes)`);
  }
});
