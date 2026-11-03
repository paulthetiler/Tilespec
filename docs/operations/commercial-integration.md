# Commercial integration (stages C1–C5)

This implements the owner's decisions in [commercial-audit.md §5](commercial-audit.md#5-owner-decisions-3-november-2026). It extends the existing
records and patterns: no new application, and no duplicate of anything that already worked.

**Nothing here has been applied to any hosted database.** See [migration-reconciliation.md](migration-reconciliation.md) for the
approval steps.

## What each stage adds

| Stage | Migration | Adds | Reuses |
|---|---|---|---|
| C1 Supervisor commercial boundary | `20261104090000_supervisor_commercial_boundary.sql` | Column-level read limits on dayworks and their history; office-only client authorisations; commercial audit classification; one **go-ahead** answer for site; a per-contract "client authorisation required" setting | Daywork tables, RLS helpers, audit |
| C2 Variations | `20261104100000_variations.sql` | `kind` on dayworks (VO-n numbering), quoted-sum pricing for variations, a separate variation authorisation setting | The entire daywork workflow, unchanged |
| C3 Job costs | `20261104110000_job_costs.sql` | Labour cost rates; labour cost worked out from attendance; purchases and invoices; materials used (quantities only); office matching | Attendance, operatives, gangs, subcontractor companies, documents |
| C4 Payment applications | `20261104120000_payment_applications.sql` | Applications (draft → submitted → certified), lines including approved extras, payments received | Contract retention %, approved dayworks and variations |
| C5 Financial position | `20261104130000_financial_position.sql` | One read-only function per contract: value, extras, costs, forecast, applications, cash, warnings | Everything above |

## How site records reach the office without retyping

| Site records (supervisor) | Office sees it as |
|---|---|
| Attendance: who was on which job, from when to when | Labour cost, at the rate in force each day (C3) |
| A daywork or variation, with photos and the client rep's signature | The office decision, then pricing, internal charge approval and client authorisation; agreed extras raise the contract value (C5) and can be claimed (C4) |
| Materials used: item, quantity, location | Matched by the office to purchases and supplier invoices (C3) |
| Handover, progress, issues, messages | Unchanged existing workflows |

## Go-ahead rule (decision 1)

A daywork or variation may go ahead only when the office has approved it **and**, where the contract requires it, the client has
authorised it. The office records the requirement on the job page, separately for dayworks and variations. It defaults to *required*.
TileSPEC's internal charge approval is never an input. The database works this out (`private.daywork_go_ahead`), and site sees one
plain line.

## Labour costing (decision 2)

The office sets a rate from a date, for every job or one job:
- an operative, per hour or per day
- a subcontractor company, per operative per hour or day
- a gang, per gang day

For each day on site, the cost is worked out like this:
1. A gang with a day rate is costed per gang day, and its members are not costed again individually.
2. Everyone else is costed at their own rate, or else their company's.
3. A day rate is shared across that day's jobs in proportion to the hours on each.
4. A rate for one job comes before a rate for every job.
5. Attendance still open is not costed until it ends. Hours without a rate are reported, never guessed.

If a subcontract invoice comes from a company whose people are also costed from attendance, it is flagged as a possible double count.

## Payment applications (decision 3)

- The office enters the gross value of work completed to date.
- Approved dayworks and variations are ticked to claim them; the suggested value is their approved price.
- Materials on site and other amounts can be added.
- Submission fixes the gross figure and the contract's retention percentage. The client's certificate and each payment received are
  recorded against the application.
- Retention, net to date, this period, certified and received are all worked out by `payment_application_summaries`.

## The financial position (decision 6)

`contract_financial_positions` returns, per contract:

**Value**
- original value
- agreed extras: office approved, charge approved, and client authorised where required, at the approved price
- pending extras: priced but not agreed, shown separately and not in the revised value
- revised value

**Cost**
- cost to date, by labour, materials, subcontract, plant and other
- forecast final cost: cost to date plus the unspent cost budget, never less than nothing
- the contingency reserve, held back as the original budget does

**Profit**
- forecast profit and margin against the target
- original budgeted profit and margin, for comparison

**Cash**
- latest gross applied and latest certificate
- retention held
- received, and outstanding against the certificate

**Warnings**
- hours without a rate
- people still on site
- unpriced extras
- possible subcontract double counting

The Money page, the job page and the job money page show exactly this. No page adds figures up itself.

## Permissions at every layer (decision 7)

| | Supervisor | Contracts manager (no money access) | Owner / contracts manager with money access |
|---|---|---|---|
| Daywork/variation site record, photos, signature, office decision | Read and record | Read and decide | Read and decide |
| Go-ahead | Read | Read | Read |
| Client's commercial authorisation, internal charge status, commercial history steps | **No** (database column grants and RLS) | Client status: yes. Charge status: no | Yes |
| Daywork rates, prices, charge approvals | No | No | Yes |
| Materials used | Record and read (quantities only) | Read | Read and match |
| Labour rates and costs, purchases, invoices, matches | No | No | Yes |
| Payment applications, certificates, payments | No | No | Yes |
| Financial position | No | No | Yes |

Each restriction is enforced at three levels:
- **Database:** RLS, column grants, and checks inside every writing function.
- **Server actions:** each refuses in the application before calling the database.
- **Pages:** each loads money only for money users.

Tests cover each layer.

## Deploying

1. Apply the migrations first (staging, then production with approval), in order, each after its read-only preflight in
   `supabase/inspection/commercial-*-preflight.sql`.
2. Then deploy the application.

If the application is deployed first, it degrades safely:
- Variations, materials, job money and the position show "not available until the database update is applied".
- A daywork's go-ahead shows "Ask the office".
- The office sees no client or charge statuses until C1 is applied.

`/admin/money` stays behind the existing `FEATURE_ROLE_SHELL` / `FEATURE_NEXT_ACTIONS` opt-in, as before. Each job's money page is
linked from the job page for money users.

## Test evidence

- `npm test`: unit and source checks, including the commercial boundary, variations, job costs, payments and position.
- `npm run test:db`: database tests on local PostgreSQL, including:
  - `supervisor-commercial-boundary`, `variations`, `job-costs`, `payment-applications` and `financial-position`, with worked figures
    checked by hand
  - `commercial-upgrade.test.sh`, which applies C1–C5 to a database shaped like the hosted project, then the two outstanding migrations
- UI, browser and end-to-end suites, as in CI.

## Not included (open items)

- Construction Act payment and pay-less notice dates.
- Office overrides of cost to complete. The forecast assumes unspent budget is still to be spent.
- Owner sign-off of a margin below target is not built. The below-target warning is information only.
- Office Today shows no money figures, by existing design. The margin reminder (R14) therefore stays dormant.
- Accounting-package export.
