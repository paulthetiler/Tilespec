# Commercial accounts and invoicing (stage C6)

**Status:** for review. Nothing here has been applied to any hosted database. Apply only after C1–C5, following
[migration-reconciliation.md](migration-reconciliation.md), and only with the owner's approval.

C6 completes the commercial integration ([commercial-integration.md](commercial-integration.md)) with what an established
commercial contractor's accounts need: each contract's own payment terms, properly numbered applications and invoices,
retention and its release, Construction Act dates and notices, VAT and CIS, credit notes, statements and final accounts. Every
issued document is a numbered, immutable record with an audit trail. It reuses the existing contracts, budgets, dayworks,
variations, payment applications, receipts, permissions, request keys and audit. There is no second system.

## What already existed and is reused

| Existing record | Used for |
|---|---|
| `contracts`, `contract_commercials` | Parties, contract sum, retention percentage and the contract's written payment terms |
| `dayworks` (both dayworks and variations, C2) with their pricing, charge approval and client authorisation | The extras on applications and schedules: only *agreed* extras are claimed |
| `daywork_signoffs`, `daywork_photos` | Site acknowledgement and evidence on the daywork summary |
| `payment_applications`, `payment_application_lines`, `payment_receipts` (C4) | Applications, cumulative valuation lines and payments received, extended rather than replaced |
| `contract_financial_positions` (C5) | Now counts only undisputed agreed extras, and payments including CIS deducted |
| `can_view_financials`, `has_money_access`, request keys, `audit_financial_mutation`, append-only guards | Every new record and function |

## Database changes (`20261108090000_commercial_accounts.sql`)

New tables, all readable only with money access (row-level security on `can_view_financials`) and written only through
checked functions:

| Table | Holds |
|---|---|
| `organisation_billing_profiles` | TileSPEC's own details for documents: names, address, company number, VAT registration, CIS status, bank details, footer. Entered by the owner; every field optional; nothing seeded. A VAT number is required only if registration is ticked. |
| `contract_payment_terms` | One row per contract: payment basis (interim, stages, bespoke schedule, completion), valuation cycle, advance payment and its recovery, materials on site, retention limit and release shares, defects period, Construction Act timing, VAT treatment and rate, CIS, daywork markups, who documents are addressed to, practical completion and making good dates. |
| `contract_payment_stages` | Stage and milestone payments or a bespoke schedule. Append-only; voided with a reason; a stage applied for cannot be removed. |
| `variation_daywork_inclusions` | A daywork valued within a variation, so it is never charged twice. |
| `commercial_disputes` | A dispute over an application or an extra, and its resolution. |
| `payment_notices` | The client's pay less notice, or TileSPEC's default payment notice, with its date, sum, basis and whether it was in time. |
| `commercial_documents` | Every issued document: kind, number, revision, the snapshot of everything printed, its SHA-256, totals and dates. Append-only. |
| `commercial_document_shares` | Revocable, expiring links to one document. Only the hash of each link's secret is stored. |

Columns added to existing tables (all defaulted, so existing rows are unchanged):

- `payment_applications`: `kind` (interim, advance or final), `cis_materials`, the `terms` and `valuation` fixed on submission,
  the Construction Act dates (`applied_on`, `due_on`, `final_on`, `payment_notice_by`, `pay_less_by`) and the client's
  certificate breakdown (`cert_retention`, `cert_deductions`, `cert_net`).
- `payment_application_lines`: two more kinds, `stage` (naming a stage) and `deduction` (agreed contra charges), and `stage_id`.
- `payment_receipts`: `cis_deducted`.
- `daywork_pricing_lines`: `markup_percent` and `markup`, copied from the contract's agreed markups when a daywork is priced.

Functions replaced, keeping their signatures and grants: `insert_payment_lines`, `create_`, `update_`, `submit_`,
`certify_` and `cancel_payment_application`, `record_payment_receipt`, `price_daywork`, `payment_application_figures`
(C4's figures, unchanged when a contract has no payment terms) and `contract_financial_position` (C5).

## How the figures work

All arithmetic is PostgreSQL `numeric`, rounded to the penny where a percentage is applied. The application never adds up
money: it parses what is typed into whole pence and shows what the database returns.

**Valuation (cumulative to the period end)**

```
gross        = contract works + stages + variations + dayworks + materials on site + other additions
retention    = rate × gross (less materials on site if retention is not taken on them), no more than the limit
held         = retention − share released at practical completion − balance released on making good
net to date  = gross − retention held + advance paid − advance recovered − agreed deductions
```

The advance is recovered pro rata to contract works valued, in full at the first interim, or in the final account, as
agreed. A final account recovers whatever remains.

**This period, without double counting.** Each application's *notified sum* is, in order: the client's pay less notice if
it was given in time (or the Construction Act does not apply), else the client's certificate, else TileSPEC's default
payment notice, else the application itself. The amount applied for is the net to date less the notified net to date
of the previous application. A stage, extra or retention amount is therefore counted once, however many applications it
appears in.

**VAT and CIS.** VAT is charged only if TileSPEC's VAT registration is recorded. The domestic reverse charge shows the VAT for
the customer to account for, not charged, with the HMRC wording. CIS is shown as an expectation on the labour element
(the sum due less the materials element entered); a payment received records the cash and the CIS the client deducted, and
together they settle the application.

**Statuses.** Draft, submitted, certified, part-paid, paid, disputed, overdue (unpaid after the final date for payment,
which a default notice postpones), and cancelled.

**Only agreed extras.** An extra is claimable when the office approved it, its charge was approved, the client authorised it
where the contract requires, it is not disputed, and it is not included in a variation. It may be claimed up to its agreed
value. Submitted, disputed and rejected extras are shown on applications for information only and never added to the
contract sum. Submitting re-checks every extra, so one disputed after the draft was saved is refused.

## Construction Act (Housing Grants, Construction and Regeneration Act 1996, as amended)

Each contract sets its own periods; the defaults follow the shape of the Scheme for Construction Contracts. On submission:

- due date = the later of the valuation date and the application date, plus the due period;
- final date for payment = due date plus the final period;
- payer's payment notice due by = due date plus the notice period (5 days by default);
- pay less notice by = final date less the pay less period (7 days by default).

A certificate records the client's payment notice and whether it was in time. A pay less notice given late is recorded but
is not effective where the Act applies. If no payment notice arrives in time, TileSPEC can issue a default payment notice
(section 110B); the application's sum then stands and the final date is postponed by the days the notice was late. The Act
can be switched off per contract, for example for a residential occupier.

## Documents

Payment applications, final accounts, invoices, credit notes, default payment notices, variation schedules, daywork
summaries and statements of account. Each is built by the database (`private.build_document`) into a JSON snapshot, then
printed by `lib/documents` as an A4 PDF in TileSPEC's slate, teal and white, with the brand fonts embedded.

- **Preview** prints the snapshot as it would be issued now, watermarked "Draft · not issued". Nothing is saved.
- **Approve and issue** submits a draft application (fixing its figures and dates) and stores the document's snapshot and
  SHA-256 in one transaction. The PDF is always printed from that stored snapshot, so it never changes.
- **Numbering:** invoices `INV-00001` and credit notes `CN-00001` run in one unbroken sequence across the business;
  applications are `<job>/PA-03`, final accounts `<job>/FA-05`, and schedules and statements `<job>/VS-01`, `DS-01`, `ST-01`.
- **Corrections:** an application, schedule or statement is re-issued as Rev A, Rev B with a reason; the earlier one stays,
  marked superseded. An invoice is never revised: a credit note credits it in part or in full, and after a full credit a
  corrected invoice can be issued. An invoiced application cannot be cancelled until its invoices are fully credited.
- **Business details:** only what the owner recorded is printed. No VAT number, company number, registered office or bank
  detail is printed unless recorded; nothing is invented.
- **Sharing:** a link opens one issued document for up to 90 days, can be revoked, counts how often it was opened, and is
  served by `/shared/documents/<token>`, which uses the server's key for that single database call. No browser role can
  call it.

Samples, made by running a fictitious job through the real functions, are in [samples](samples/README.md).

## Permissions at every layer

| | Supervisor | Contracts manager without money access | Owner, or contracts manager with money access |
|---|---|---|---|
| Accounts pages, previews, documents, terms, notices, disputes, links | No | No | Yes |
| Business details | No | No | Read; the owner changes them |
| Site acknowledgement and photos of dayworks | As before | As before | As before |

- **Database:** RLS on every new table; column grants hide each link's secret hash; every function checks money access.
- **Server actions:** `app/admin/accounts-actions.ts` refuses before calling the database.
- **Pages and routes:** `requireFinancialActor` on pages; the PDF routes answer "Not found" to anyone else.

## Deploying

1. Back up, then apply C1–C5 as in [migration-reconciliation.md](migration-reconciliation.md).
2. Run the read-only `supabase/inspection/commercial-accounts-preflight.sql`, then apply `20261108090000_commercial_accounts.sql`.
3. Deploy the application. Before the migration is applied, the accounts pages say they are not available yet.
4. The owner records the business details (Accounts → Business details), confirming the legal name, address and VAT and
   company numbers first. Then set each contract's payment terms.

The shared-link route needs no service key: the link's secret token is checked by the database function.

## Tests

- `npm test`: `tests/accounts.test.ts` (money parsing, forms, permissions in actions and routes, no floating-point sums)
  and `tests/documents.test.ts` (every printed amount comes from the snapshot; required wording; PDFs render as A4 with
  the fonts embedded).
- `npm run test:db`: `tests/db/commercial-accounts.test.sql` runs a contract with an advance, interim valuations, a
  certificate, pay less and default notices, part and full payments with CIS, an invoice and credit notes, the retention
  limit, release at practical completion and making good, an overdue application, disputes, a final account, a statement,
  schedules, stage payments with standard VAT and payment on completion, with every figure worked out by hand beside it.
  It also proves supervisor and non-money denial, immutability and the shared link. `commercial-upgrade.test.sh` applies
  C1–C6 to a database shaped like the hosted project and checks nothing existing changes.
- `npm run test:e2e`: `scripts/accounts-e2e-flows.mjs` sets up business details and terms, then drafts, previews, issues,
  certifies, invoices, part-pays and pays an application, downloads it, shares and revokes a link, and checks supervisors
  and office users without money access are refused.
- `npm run samples:documents` regenerates the samples and the document test fixtures from the real functions.

## Not included

- Late payment interest under the Late Payment of Commercial Debts (Interest) Act 1998 is not calculated.
- Payments to TileSPEC's own subcontractors (TileSPEC as payer) are not covered.
- Accounting-package export.
- Emailing documents from the app; documents are downloaded or shared by link.
