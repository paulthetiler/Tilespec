# Subcontractor portal

**Subcontractors claim the work. Supervisors verify the work. The office approves the money.**
One process, built on the existing gang invoice workflow ([gang-invoices.md](gang-invoices.md)).
There is no second invoicing system, payment engine or approval route.

- Portal: `/subcontractors` (public landing page; everything private needs a personal link)
- Office: `/admin/subcontractors` (money access), with approvals still in `/admin/gang-invoices`
- Supervisor: unchanged, site dashboard → **Verify gang progress**

## 1. Audit of what existed

| Area | Existing | Works | Decision |
|---|---|---|---|
| Subcontractor records | `subcontractor_companies`, `company_insurances`, `company_accreditations`, `teams` (the gang: the party that is put on jobs and invoices), `operatives`, `team_memberships` | Yes | Reused. A "subcontractor" in the portal is the team. Missing: tax status, bank details, onboarding state |
| Allocation to jobs | `gang_subcontracts` (team on a contract, payment cycle) | Yes | Reused; `retention_percent` added |
| Agreed rates | `gang_rates` (m², linear m, items; per area or job-wide; dated; voidable) | Yes | Reused; `day` and `hour` units added |
| Variations for subcontractors | None. `dayworks` and the "variations" migration are TileSpec's charges to its *client* | n/a | New `gang_variations` (an agreed sum the subcontractor claims against) |
| Subcontractor invoices | `gang_invoices`, `gang_invoice_lines`, `gang_invoice_files`, `gang_invoice_commercials`, `gang_invoice_events`, `GI-` numbering, private `gang-claims` bucket, duplicate document and invoice-number checks, idempotent submission | Yes, upload only, login only | Reused as the single engine. Extended for link submissions, generated invoices and extras |
| Client invoicing | `payment_applications`, `commercial_documents`, receipts, notices | Yes | Untouched (different direction of money) |
| Supervisor sign-off | `gang_progress_checks` ledger, `gang_verification_requests`, `verify_gang_invoice` | Yes | Reused unchanged for measured work; extended to confirm extras by quantity |
| Office approval and payment | `decide_gang_invoice` (approve, re-check, query, return, reject, record payment), job cost posting | Yes | Reused; extended with extras and the payment calculation |
| CIS, VAT, retention | Only for TileSpec's own applications to clients. For gangs: a free-text note and "record the amount actually paid" | Gap | Added to the gang approval: recorded basis, worked out in the database, kept apart from the invoice value |
| Documents and PDF | `lib/documents` renderer and model, `commercial_document_shares` (hashed, revocable, expiring links) | Yes | Renderer reused (with an unbranded header for a subcontractor's own invoice); link pattern reused |
| Signatures / agreements | None for subcontractors (`daywork_signoffs` is a site signature for client dayworks) | n/a | New, with versioned text and acceptance evidence |
| Authentication | Supabase login, roles in `organisation_members`, RLS on every table, no service-role key anywhere; anonymous access only through narrow `security definer` functions (tender enquiries, shared documents) | Yes | Same pattern: anonymous portal functions that each require a live link's secret |
| Audit | `audit_events` triggers, append-only invoice events, guards against rewriting | Yes | Extended to every new table |

Duplicates avoided: no new invoice, line, file, approval or payment tables. Overlap to be aware
of: `subcontractor_companies` holds a company's name and address for compliance; the new tax
profile holds the *invoicing* identity of the team that is paid. Both live teams on the hosted
project have no company record, which is why the profile is keyed by team.

## 2. What was added

Migration `20261112090000_subcontractor_portal.sql` (additive, one transaction):

| Object | Purpose |
|---|---|
| `subcontractor_portal_links` | Personal links: SHA-256 of the secret only, issued-to name, expiry (≤ 90 days), revocation, last use |
| `subcontractor_tax_profiles` | Legal name and address for invoices, UTR, CIS status and verification, VAT status, self-billing period |
| `subcontractor_bank_details` | Bank details in their own table; audited by field name only |
| `subcontractor_agreement_versions` | Exact agreement text with fingerprint; draft → published (owner, with legal review on record) → withdrawn |
| `subcontractor_agreements` | Each issued copy: exact text, version, parties, and the signature record |
| `gang_variations` | Approved variations with an agreed sum (`SV-` references) |
| `gang_invoice_extras` | Day rate work, variation claims and additional (unapproved) work on an invoice |
| `gang_retention_releases` | Retention paid later, less CIS |
| Columns | `gang_subcontracts.retention_percent`; `gang_invoices.portal_link_id`, `source`; `gang_invoice_files.portal_link_id`; `gang_invoice_commercials` claim snapshot and payment calculation |
| Replaced functions | `verify_gang_invoice`, `decide_gang_invoice`, `save_gang_subcontract`, `save_gang_rate`, `complete_gang_file`, `gang_event`, `guard_gang_commercial`: identical for existing invoices |
| Portal functions (anon) | `portal_session`, `portal_preview_invoice`, `portal_prepare_invoice`, `portal_reserve_file`, `portal_complete_file`, `portal_invoice`, `portal_cancel_invoice`, `portal_answer_query`, `portal_agreement`, `portal_sign_agreement` |

## 3. Access without accounts

The office issues a link to a named person (`/admin/subcontractors/[team]` → Portal access). The
256-bit secret is shown once and only its hash is stored. Opening
`/subcontractors/access/<secret>` checks it and moves it into an http-only cookie limited to
`/subcontractors`, then redirects to a clean address. Every later request sends the secret to a
database function that checks it again (live, not revoked, not expired, team active).

- The landing page is public but shows nothing private and lists no subcontractors.
- A link sees only its own team: jobs, own agreed rates, own invoices, last four digits of the bank account.
- Anonymous visitors hold no table privileges; the only storage write allowed is to a path reserved through a live link, within two hours, once. Nothing can be read back, replaced or deleted.
- Files: PDF, JPEG or PNG up to 4 MB, checked by their real bytes on the server, by the reservation and by the bucket.
- Bank details cannot be entered or changed from the portal.
- Withdrawing a link takes effect immediately. Up to five live links per subcontractor.

## 4. The journey

1. **Onboard** (office): business and tax details, CIS verification, bank details.
2. **Agreement**: the owner publishes a version (legal review on record); the office issues it; the subcontractor reads and signs from their link. Unsigned means not accepted: portal invoicing is refused until signed.
3. **Allocate and rate** (office, `/admin/gang-invoices/setup`): job, payment cycle, retention, rates per area, day rates. Variations on the subcontractor's page.
4. **Invoice** (subcontractor): *Generate* (quantities only; the database prices from agreed rates, a PDF is made and stored) or *Upload* (own invoice with number, date, amount and what it is for).
5. **Verify** (supervisor): quantities and workmanship against the measurement ledger; days worked; whether variation or additional work was carried out. No money is shown or decided.
6. **Approve** (office, money access): approved quantities and amounts, never more than verified. Less than claimed needs a written reason.
7. **Pay**: the office records the payment made. No bank payment is initiated.

Statuses, the measurement ledger, corrections, queries, returns, replacements and rejections are
exactly those in [gang-invoices.md](gang-invoices.md).

### Duplicates

- The same invoice number or the same document cannot be sent twice (existing checks).
- A work area and unit cannot be claimed again while an earlier claim for it is open.
- A variation cannot be claimed beyond what is left of its agreed sum, at claim and again at approval.
- The supervisor can verify only measured, passed work not already verified or approved (existing ledger).

### Additional work

Work claimed without an approved variation is its own kind of extra. It is labelled "not yet
approved" in the form, on the invoice, to the supervisor and to the office, and is never merged
with approved variations. The office decides the amount; nothing is approved by default.

## 5. Money: invoice value and payment are separate

The invoice states the **gross value of the work** (and VAT where charged). Deductions belong to
the payment and are worked out at approval, in the database:

```
approved value (net)
  − retention        approved × the percentage agreed for the job
  + VAT              20% if VAT registered and not under the reverse charge
  − CIS              (approved − retention − materials) × 0%, 20% or 30%
  = payable
```

- **No deduction without a recorded basis.** CIS needs an HMRC-verified status on the profile; an unverified status blocks approval rather than guessing a rate. Retention applies only if a percentage is recorded for the job. Anything else is an office adjustment with a written reason.
- A subcontractor with no tax profile is approved exactly as before this change, with nothing calculated.
- The job cost is the approved value before deductions.
- Retention held is released later from the subcontractor's page, never more than is held, less CIS.

## 6. VAT self-billing

An invoice whose content is produced by the customer's system is at risk of being treated as a
self-billed invoice. HMRC (VAT Notice 700/62) requires, for VAT-registered suppliers: a written
self-billing agreement before invoices are issued; a set period (normally up to twelve months)
that is then renewed; the supplier agreeing not to issue their own VAT invoices for those supplies
and to notify changes of VAT status; the customer keeping the names, addresses and VAT numbers of
self-billed suppliers; and invoices that are full VAT invoices marked as self-billed.

Controls implemented:

- **Not VAT registered:** generation is allowed. No VAT invoice is issued, so the self-billing rules are not engaged. The subcontractor reviews and submits the invoice as their own, under their own number.
- **VAT registered:** generation is **switched off** unless a self-billing period covering today is recorded on their profile (maximum twelve months). They can always upload their own invoice. When enabled, the invoice is titled "Self-billed invoice", carries their VAT number, and states the reverse charge or "The VAT shown is your output tax due to HMRC" as applicable.
- The agreement's Schedule records the supplier's undertakings; the profile records the period.

Have your accountant confirm this treatment, and the default domestic reverse charge setting,
before enabling generation for any VAT-registered subcontractor.

## 7. The agreement

The standard draft is in `lib/subcontractors/agreement-template.ts`. It covers workmanship and
compliance, defective and incomplete work, notification, a reasonable opportunity to rectify,
recovery of reasonable evidenced rectification costs, damage to completed work and other trades,
site conduct and health and safety, insurance and qualifications, rates, variations and dayworks,
CIS, retention, invoicing, Construction Act payment (due date, final date, payment and pay less
notices, suspension, no pay-when-paid), disputes and adjudication, termination, data protection
and electronic signature. It contains no penalty clauses.

**It has not been reviewed by a solicitor and must be before production use.** The system enforces
this: a version cannot be issued until the owner records who reviewed it and when. Points to raise
in that review include employment status and IR35, insurance levels, retention release terms, the
notice periods in clause 9 against your actual payment cycles, and the self-billing Schedule.

Signing records: the exact text and its SHA-256, version, parties, signer's name and position,
typed signature, the three confirmations, UK time, the link used, IP address and browser, and a
fingerprint over the whole record. Signed agreements cannot be edited; the office cannot sign.

## 8. Who can see what

| | Subcontractor (link) | Supervisor | Office without money access | Office with money access |
|---|---|---|---|---|
| Own jobs, own agreed rates, own invoices and payment working | Yes | – | – | Yes |
| Other subcontractors | No | – | – | Yes |
| Quantities, workmanship, photos, extras to confirm | Own | Assigned jobs | Managed jobs | Yes |
| Rates, amounts, invoice document, variations' sums, CIS, retention | Own only | No | No | Yes |
| Tax profile, bank details, links | Bank: last four digits | No | No | Yes |
| Agreement text and status | Own | No | Yes | Yes |
| Publish an agreement version | – | – | – | Owner only |

## 9. Notifications and copies

There is no outbound email or SMS service in this application, and none was added. The
subcontractor gets an on-screen confirmation with the submission reference, a downloadable PDF of
a generated invoice and of their agreement, and the live status of every invoice from their link.
The office sees new work on the existing dashboard strip and queues; supervisors on their site
dashboard. The link itself is sent by the office from their own email or phone (buttons provided).

## 10. Tests

- `npm run test:db` → `tests/db/subcontractor-portal.test.sql`: the whole journey and its refusals under real grants and RLS.
- `npm test` → `tests/subcontractor-portal.test.ts`: form shaping, printing, agreement content, source-level security checks.
- `npm run test:portal` → the portal in a real browser at phone size against a disposable database.

## 11. Not included

- Sending emails or texts automatically (no provider is configured).
- Monthly CIS payment and deduction statements and the CIS300 return: figures are recorded per invoice; statements are still produced in your accounting or payroll software.
- Formal payment and pay less notice documents for subcontractors: the approval and its reasons are recorded and shown to the subcontractor, but no notice PDF is issued.
- Bank payments: the office records payments made elsewhere.
