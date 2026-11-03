import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applicationInput, certifyInput, receiptInput, type ClaimableExtra } from "../lib/operations/payments";
import { ValidationError } from "../lib/operations/validation";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const extras: ClaimableExtra[] = [{ id: id(1), reference: "DW-1", description: "Bin store wall", priced: 320 }, { id: id(2), reference: "VO-1", description: "Full height", priced: 1250.5 }];

test("a valuation is the work to date, the extras ticked at their values, materials on site and any other amount", () => {
  const parsed = applicationInput(form({ period_end: "2026-10-31", contract_works: "£10,000", [`claim_${id(1)}`]: "on", [`amount_${id(1)}`]: "",
    [`claim_${id(2)}`]: "on", [`amount_${id(2)}`]: "1200", materials_on_site: "500", other_amount: "-100", other_description: "Contra charge for skip" }), extras);
  assert.deepEqual(parsed, { period_end: "2026-10-31", lines: [
    { kind: "contract_works", description: "Work completed to 2026-10-31", amount: 10000 },
    { kind: "extra_work", daywork_id: id(1), description: "DW-1: Bin store wall", amount: 320 },
    { kind: "extra_work", daywork_id: id(2), description: "VO-1: Full height", amount: 1200 },
    { kind: "materials_on_site", description: "Materials on site", amount: 500 },
    { kind: "other", description: "Contra charge for skip", amount: -100 }] });
  assert.deepEqual(applicationInput(form({ period_end: "2026-10-31", contract_works: "0" }), extras).lines.length, 1, "unticked extras are not claimed");
  assert.equal(applicationInput(form({ period_end: "2026-10-31", contract_works: "1", [`claim_${id(9)}`]: "on" }), extras).lines.length, 1,
    "only extras the server says are claimable can be ticked");
  const badCases: Record<string, string>[] = [{ contract_works: "" }, { contract_works: "-5" }, { period_end: "" }, { other_amount: "50" }, { materials_on_site: "1.234" }];
  for (const bad of badCases)
    assert.throws(() => applicationInput(form({ period_end: "2026-10-31", contract_works: "100", ...bad }), extras), ValidationError, JSON.stringify(bad));
});

test("a certificate and a payment are pounds and pence on a date that has happened", () => {
  assert.deepEqual(certifyInput(form({ certified_gross: "12500", certificate_reference: "PC-1" })), { certified_gross: 12500, certificate_reference: "PC-1" });
  assert.throws(() => certifyInput(form({ certified_gross: "12500", certified_on: "2999-01-01" })), ValidationError);
  assert.deepEqual(receiptInput(form({ application_id: id(3), amount: "11,000.00", reference: "BACS" })), { application_id: id(3), amount: 11000, reference: "BACS" });
  for (const amount of ["0", "-1", "abc"]) assert.throws(() => receiptInput(form({ application_id: id(3), amount })), ValidationError, amount);
});

test("payment applications are shown only on the money page, from the database's own figures", () => {
  const component = source("components/office/payment-applications.tsx");
  assert.doesNotMatch(component, /\.reduce\(|gross \*|\* row\.retention/, "the component works out no figure of its own");
  assert.match(source("lib/operations/payments-data.ts"), /supabase\.rpc\("payment_application_summaries"/);
  assert.match(source("app/admin/contracts/[id]/money/page.tsx"), /<PaymentApplications contractId=\{id\}/);
  for (const file of ["app/admin/supervisor/daywork-actions.ts", "app/admin/supervisor/material-actions.ts", "components/site/next-actions-today.tsx",
    "app/admin/supervisor/sites/[id]/page.tsx", "app/admin/supervisor/sites/[id]/materials/page.tsx", "lib/operations/next-actions/snapshot-data.ts"])
    assert.doesNotMatch(source(file), /payments(-data)?"|payment_application|payment_receipts/, `${file} never touches payment applications`);
});
