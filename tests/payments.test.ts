import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

// The forms for applications, notices, invoices and payments moved to the job's accounts (C6); their
// parsing is tested in accounts.test.ts.
test("payment applications are shown only on the money page, from the database's own figures", () => {
  const component = source("components/office/payment-applications.tsx");
  assert.doesNotMatch(component, /\.reduce\(|gross \*|\* row\.retention/, "the component works out no figure of its own");
  assert.match(component, /href=\{`\/admin\/contracts\/\$\{contractId\}\/accounts`\}/, "the summary leads to the job's accounts");
  assert.doesNotMatch(component, /<form|OperationsForm/, "applications are no longer changed from the money page");
  assert.match(source("lib/operations/payments-data.ts"), /supabase\.rpc\("payment_application_summaries"/);
  assert.match(source("app/admin/contracts/[id]/money/page.tsx"), /<PaymentApplications contractId=\{id\}/);
  for (const file of ["app/admin/supervisor/daywork-actions.ts", "app/admin/supervisor/material-actions.ts", "components/site/next-actions-today.tsx",
    "app/admin/supervisor/sites/[id]/page.tsx", "app/admin/supervisor/sites/[id]/materials/page.tsx", "lib/operations/next-actions/snapshot-data.ts"])
    assert.doesNotMatch(source(file), /payments(-data)?"|payment_application|payment_receipts/, `${file} never touches payment applications`);
});
