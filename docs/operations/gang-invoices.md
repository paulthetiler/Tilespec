# Gang invoices and supervisor verification

**Gangs claim the work. Supervisors verify the work. The office approves the money.**

## Who does what

| Step | Who | Screen |
|---|---|---|
| Put a gang on a job, with payment terms and agreed rates | Office with money access | `/admin/gang-invoices/setup` |
| Send an invoice: job, invoice file (PDF or photo), work area + quantity | Gang member (lead or subcontract installer linked to the gang) | `/admin/gang` → **Send an invoice** |
| Check quantity and workmanship | Supervisor assigned to the job | Site dashboard → **Verify gang progress (n)** → `/admin/supervisor/sites/[id]/progress` |
| Approve, adjust, query, re-check, return, reject, record payment | Office with money access | `/admin/gang-invoices` |

Sending an invoice never authorises payment. Completing the upload opens exactly one verification
request for the job. Supervisors assigned to the job see it counted on their site dashboard; if no
supervisor is assigned it is routed to the office (**Needs a supervisor**) and appears on a supervisor's
site as soon as one is assigned. Verifying, returning, rejecting or withdrawing closes the request.

## Measurements are incremental

`gang_progress_checks` is the site measurement ledger. Each row is **new work completed in its
period**, never a running total, recorded against a gang, job, work area and unit. Rows are never
overwritten: a correction is cleared once ("corrected and checked") and a mistake is voided with a reason.

For each gang, job, area and unit the ledger gives:

* **passed** – measured and passed, plus corrections since checked
* **correction** – measured but needing correction (never eligible for payment until cleared)
* **approved** – approved for payment on approved or paid invoices
* **verified** – verified on invoices still with the office
* **available = passed − approved − verified** – the most that can still be verified

A supervisor can verify at most the available quantity (adding newly measured work first if needed),
and the office can approve at most what was verified. Both checks run in the database under a lock per
gang and job, so the same work cannot be verified or paid twice, even by simultaneous users.

## What each role can see

* **Gangs**: only their own gang's jobs (name and areas), invoices, checked/approved quantities,
  scheduled payment date and their own amounts — through `my_gang_jobs()` / `my_gang_invoices()`.
  No other gangs, no rates tables, no job finances.
* **Supervisors**: claims, quantities, workmanship, photos and history for jobs they are assigned to.
  Never the invoice document, invoice amounts, rates, payment terms, approved money or job costs —
  those live in `gang_invoice_commercials`, `gang_rates`, `gang_subcontracts` and office-only events,
  which row-level security limits to money-access office users.
* **Office (owner, or contracts manager with money access)**: everything, including the original
  invoice, the difference between claimed and verified, previously approved quantities, rates and
  payment terms. Only these users can approve or record payment.

## Payment terms

Weekly (invoice week ends on the pay day; paid `payment_days` later — Friday + 7 = the following
Friday), fortnightly (periods end every 14 days from an anchor date) or custom (days after the
invoice). The scheduled date is fixed when the invoice is sent; the office can record a different
agreed date on approval. Approving less than claimed requires a written reason; disputed quantities
are never deducted automatically. A pay less notice may be needed under the subcontract and the
Construction Act. No bank payment is initiated: the office records payments made.

Approval also records a `subcontract` job cost entry for the approved amount, so the job's financial
position includes approved gang costs.

## Corrections

When the supervisor records work needing correction it is linked to the gang and area, described,
can have photos, and is excluded from payment. The supervisor records it as corrected and checked
on the progress page; the history is kept. Formal defects can also be raised in the snag register.

## Subcontractor portal

Subcontractors can also send these invoices without a login, from a personal link, and can have the
invoice created for them from the agreed rates. Onboarding, the signed agreement, day rates,
variations, CIS and retention are described in [subcontractor-portal.md](subcontractor-portal.md).
The checking and approval steps on this page are unchanged.
