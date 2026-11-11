# Office command centre audit

**Date:** 11 November 2026 · **Scope:** `main` at `2142df5`, the hosted TileSpec Supabase project
(`odwysybvncdfdrfnnnqt`), the Vercel `tilespec` production deployment and every admin interface.
**Nature:** audit and design only. Nothing in production, the database or the application was changed.
All database access was read-only (`select` only).

The question this audit answers: *the owner arrives at 9 am, logs in, and needs to run the whole company from
one page. Can they, and if not, what is the shortest path to a page where they can?*

---

## 1. Summary

TileSPEC has far more working machinery than its homepage shows. Supervisor reporting, holds, snags,
inspections, dayworks, variations, gang invoices, the subcontractor portal, commercial accounts and job
financial positions are all built, tested and deployed. What is missing is mostly **connection and
presentation**, not new systems.

The eight findings that matter most:

1. **The owner's homepage says "Nothing needs you right now" while nine jobs of office work are waiting.**
   Production shows the owner `AdminToday`. Its rules give most office work to a separate "office" audience
   (contracts manager). The owner is not part of that audience, and production has **no active contracts
   manager**. I ran the real rules engine over today's production records: the owner gets 0 actions and
   2 "waiting" items. A contracts manager on the same jobs would get 9 actions. These include a quality stop
   nobody has been told to fix, two jobs with no supervisor, and no plan for the next 7 days. 22 of the 36
   rules never reach the owner. Three more cannot appear on the production homepage today: R14 is stripped
   because it carries money, and R18/R19 need the unapplied migration.
2. **Production contains no real business yet.** It has two contracts, both marked "DEMO ONLY" (fictional
   sites), plus TEST gangs, TEST invoices and TEST stops. Six of the eight user accounts are inactive test
   accounts. The one active supervisor is not assigned to any job, so they currently see no sites. **Nothing has
   been verified end to end with real work.**
3. **Money is deliberately kept off the homepage.** This is a design rule: *"Today never fetches commercial
   numbers, even for an authorised owner."* Payments due, overdue debts, invoices to approve and margins
   all need a separate visit to Money, Invoices or Gang invoices. The only money signal on the homepage is
   a one-line gang-invoice count strip.
4. **There are no notifications outside the app.** No email, SMS, push or scheduled job exists. Every alert
   is worked out when someone opens a page. A supervisor's question or a safety stop waits until the owner
   happens to look.
5. **One reviewed migration was never applied** (`20261023090000_office_reviews_instruction_changes`).
   Without it the office cannot record that it has reviewed a site result or handover, and cannot change,
   withdraw or mark an instruction urgent. Five other migrations are applied but missing from the hosted
   migration history, so `supabase db push` is unsafe until history is repaired (runbook:
   `docs/operations/migration-reconciliation.md`).
6. **Navigation hides real pages from the owner.** With the role shell on, the owner has three tabs (Today,
   Jobs, Money) plus an "Everything else" list. Startup expenses, the RAMS/COSHH/H&S/terms document
   generators and business settings are missing from that list. The homepage also hides its Job setup,
   People and Paperwork shortcuts because it assumes they are tabs, which is only true for contracts managers.
7. **Communication works in code but has never been used.** Job conversations, instructions and QA requests
   have 0 rows in production. There is no "decision requested" type with a recorded outcome, and no resolved
   state.
8. **Several genuinely missing pieces block a true command centre:**
   - a job lifecycle (every contract is permanently `draft` by a database check)
   - a cross-job planner
   - aged debt and cash flow
   - a quotations register
   - a tender pipeline UI
   - materials requirements
   - a daily site photo and quantity record
   - global search

The recommended path (section 7) starts with configuration and three small code fixes that make today's
homepage truthful for a one-owner business. It then adds read-only command-centre panels built over
existing tables and functions, then notifications, and only then new modules.

---

## 2. What production actually shows the owner

### 2.1 Which dashboard is live

| Setting (Vercel production) | Value | Effect |
|---|---|---|
| `FEATURE_NEXT_ACTIONS` | `supervisor,owner,contracts_manager` | `/admin` renders `AdminToday` (built by `loadOfficeSnapshot`) for owner and contracts managers instead of the older "Portfolio overview" |
| `FEATURE_ROLE_SHELL` | `supervisor,owner,contracts_manager` | The long office nav bar is replaced by `RoleTabs`: **Today · Jobs · Money** for the owner, plus "Everything else" |
| `NEXT_ACTIONS_*` timing overrides | not set | Defaults: 7-day plan horizon, 21-day setup lead, 30-day insurance warning, 7-day "From site" window |
| Supabase URL / publishable key | production only | Preview deployments have no backend, so admin pages cannot be checked on a preview before release |

Production deployment `dpl_35XvsA3VLwjaS1jD8rLgYPjez86y` is `main` at `2142df5` (READY). The owner page is
`app/admin/page.tsx` → `GangOfficeStrip` (only when a gang invoice waits on the office) + `AdminToday`.
The legacy "Portfolio overview" below it in the same file is unreachable for owner and contracts manager while
the flag is on.

### 2.2 What the owner's homepage contains today (verified)

I rebuilt today's snapshot from the production rows and ran the real engine (`compute`, `buildQueue`,
`withoutFigures` and `siteUpdates` from `lib/operations/next-actions`):

| Section | Owner sees | Same records seen by a contracts manager assigned to both jobs |
|---|---|---|
| Header | "Nothing needs you right now." | "9 things need you." |
| Do this next | Idle card: "Work is still restricted" | "Say who will fix the quality hold" |
| Then | — | 2 morning findings to review; 2 × give the job a supervisor; 2 × add the specification and drawings; 2 × plan who works where |
| Waiting on others | 2 morning findings (15 Oct, 24 Oct), shown as *someone else's* job, but there is no one else | — |
| From site | "Handover … notes for the office, problems, areas needing attention". **False alert**: every box said "none" | same false alert |
| Work that is stopped | 1 quality hold (test record, Back of house) | same |
| Gang invoice strip | hidden (no invoice waiting) | hidden |
| Money | link only | link only |

Also invisible from the homepage:

- a daywork recorded on 10 Nov but never sent (only the supervisor is told)
- a snag left in `draft` (no rule reads draft snags)

### 2.3 Who each rule reaches

`roleKey()` maps the owner to `owner`, not `office`. Each rule's `audience` decides who sees it:

| Owner can **act** | Owner can **see** | Owner never sees (office or supervisor only) |
|---|---|---|
| G05 release a stop · R18/R19 review a result/handover (needs the missing migration) · R20 reply to site · R22, R26–R28 daywork review, pricing, charge, client | G01 *safety* stop needs fixer · A01 critical snag · A02 expired insurance · R07 overdue fix (after 3 days) · R17 morning finding | G02 *quality* stop needs fixer · G03/G04 fix progress · G06–G08 inspection gates · R13 snag needs a gang · S03 snag repair assigned · G10 re-inspection · R15 responsibility dispute · R16 QA request · R01 morning checks missed · R02/R03 workforce · R04 provisional person · R05 unread instruction · R21 reply awaiting site · R06 handover missing · **R08 job setup** · R09 missing checklist · R10 installer access · **R11 insurance expiring** · R23–R25 dayworks with site |

The design assumes an office person exists. In a business where the owner *is* the office, two thirds of
the operational signal never reaches anyone.

---

## 3. Platform state

### 3.1 Status levels used in this report

| Level | Meaning |
|---|---|
| **Code** | Implemented on `main` |
| **Tested** | Covered by automated tests. In this audit: `npm test` 303/303 pass and `npm run typecheck` is clean. CI also runs DB, end-to-end and UI suites against local PostgreSQL/PostgREST (not re-run here) |
| **DB** | Tables and functions present on the hosted project |
| **Reachable** | The owner can reach it in production with the current flags and navigation |
| **Exercised** | Records exist in production showing the workflow has been run (test or demo data) |
| **Real use** | Used with real jobs, gangs or clients. **Nothing qualifies yet** |

### 3.2 Capability matrix

| Capability | Code | DB | Reachable by owner | Exercised in production |
|---|---|---|---|---|
| Owner Today (rules engine) | ✓ | ✓ | ✓ | ✓ demo data only (§2.2) |
| Morning checks and readiness findings | ✓ | ✓ | via site dashboard | 6 checks, last 9 Nov; 2 findings open since Oct |
| Workforce confirmation, planned vs actual | ✓ | ✓ | ✓ | ✗ 0 planned, 0 actual |
| End-of-day handover | ✓ | ✓ | ✓ | 1 (9 Nov) |
| Location inspections, mandatory checks, hold points | ✓ | ✓ | ✓ | ✗ 0 templates, 0 requirements |
| Snags with photos and independent re-inspection | ✓ | ✓ | ✓ | 1 test snag left in draft |
| Holds/stops with photos and independent release | ✓ | ✓ | ✓ | 1 test hold, never assigned or released |
| Office review of results and handovers | ✓ | **✗ migration not applied** | shown as "cannot record" | ✗ |
| Change, withdraw or mark instructions urgent | ✓ | **✗** | ✗ | ✗ |
| Instructions and QA requests to site | ✓ | ✓ | ✓ | ✗ 0 |
| Job conversations (questions and replies) | ✓ | ✓ | ✓ | ✗ 0 |
| Dayworks and variations, site → office → client | ✓ | ✓ | ✓ | 1 test daywork, recorded, never sent |
| Gang invoices: upload/generate, verify, approve, pay | ✓ | ✓ | ✓ | **8 test invoices run end to end** (4 paid, 1 rejected, 2 cancelled, 1 superseded) |
| Subcontractor portal, agreements, tax, bank | ✓ | ✓ | ✓ (Everything else) | ✗ 0 links. **No agreement version published, so portal invoicing is refused** |
| Companies, insurance, accreditations | ✓ | ✓ | ✓ | ✗ 0 |
| Plan and programme | ✓ | ✓ | ✓ per job | ✗ 0 |
| Job costs and financial position | ✓ | ✓ | ✓ Money | 4 test costs, all voided; 1 budget |
| Client applications, invoices, notices, statements | ✓ | ✓ | ✓ | ✗ 0 documents; 1 payment terms record |
| Tender enquiry inbox (website form) | ✓ | ✓ | ✓ | 1 received 10 Nov |
| Estimator | ✓ | n/a | ✓ | not recorded (results are not saved) |
| Startup expense register | ✓ | ✓ | **direct URL only**; missing from role navigation | 1 |
| RAMS/COSHH/H&S/terms PDF generators | ✓ | n/a | **direct URL only** | Terms PDF failed 15× on 9 Nov (missing pdfkit font); a tracing rule now exists in `next.config.ts`, so re-check |
| Notifications (email/SMS/push/digest) | ✗ | ✗ | ✗ | ✗ |
| Global search | ✗ | | | |
| Cross-job planner | ✗ | | | |
| Job lifecycle beyond draft | ✗ (`contracts.state` check allows only `draft`) | | | |
| Quotations register, tender pipeline UI | ✗ (the database allows tender statuses `reviewing`/`pricing`/`declined`/`submitted`, but no screen sets them) | | | |
| Aged debt, cash flow, materials ordering, photo diary, operative cards (CSCS) | ✗ | | | |

### 3.3 Data, accounts and configuration

- **Records:**
  - 2 contracts, both "DEMO", fictional, `draft`, ending 13 Nov and 4 Dec
  - 6 locations, 14 work packages
  - 2 TEST gangs (inactive)
  - 0 subcontractor companies
- **Accounts:** 1 active owner and 1 active supervisor. 6 TEST accounts are inactive. All 4 contract
  assignments expired on 10 Nov and belong to the inactive test users, so the real supervisor is not on any
  job.
- **Migration history:** 28 rows recorded. One reviewed migration is not applied; five are applied without
  history rows (§1 point 5).
- **Vercel:**
  - `BLOB_READ_WRITE_TOKEN` is set for every environment, flagged by Vercel as a readable secret, and not
    used by any code
  - runtime logs are kept for less than 24 hours on this plan, so usage history could not be read

---

## 4. Workflow gap analysis

Each workflow lists what exists, what works in production, what is disconnected or hidden, what is
genuinely missing, what is over-complicated, what belongs on the homepage and what to reuse.

### 4.1 Supervisor reporting: "what happened on every live job yesterday?"

- **Exists:**
  - morning checks with readiness findings
  - workforce confirmation (actual against planned, with absences and lead operative)
  - location inspections with photos
  - snags, holds and dayworks with photos
  - materials used
  - gang progress checks (supervisor confirms claimed quantities)
  - an end-of-day handover covering work completed, problems, materials needed, areas needing attention and
    notes for the office
  - each job also has an activity timeline (`/admin/supervisor/sites/[id]/activity`)
- **Works in production:** the forms and tables work. Only demo records exist.
- **Disconnected or hidden:**
  - Yesterday's information is spread across eight places: activity, messages, quality, planned vs actual,
    materials, snags, holds and alerts.
  - The homepage's "From site" list shows only handovers whose problem or notes boxes contain text, and any
    text counts. "none" raises an alert.
  - Attendance and handover-missing signals (R01, R06) go to the office audience only, and only for today.
- **Genuinely missing:**
  - a cross-job "yesterday" digest
  - general progress photos (photos exist only on snags, holds, dayworks and gang claims)
  - daily quantities or measurements installed per location (only gang invoice claims carry quantities)
  - any record that the office has read a handover (needs the unapplied migration)
- **Over-complicated:** the office must open each job and then several tabs to rebuild one day.
- **On the homepage:** a **Yesterday on site** panel with one row per live job:
  - people and gangs, planned against confirmed
  - handover received or not, with work completed
  - inspections passed or failed
  - snags and stops raised
  - photos
  - materials needed
  - one click to that job's activity for that date
- **Reuse:**
  - `lib/operations/activity-data.ts` (already merges every record type for a job)
  - `site_handovers`, `actual_allocations`
  - the planned-vs-actual logic in `/admin/contracts/[id]/actual`
  - `gang_progress_checks`

### 4.2 Office communication: questions, decisions, problems

- **Exists:**
  - job conversations (`job_messages` and read receipts, "needs an answer", linked to a snag, stop, daywork or
    instruction)
  - office instructions with required acknowledgement
  - QA requests with returned results
  - in-app hold notifications (`/admin/alerts`)
  - rule R20 puts "reply to site" on the owner's Today
- **Works in production:** tables and screens exist. There are 0 messages and 0 instructions: never used.
  The review, withdraw, change and urgent features fail because their migration is not applied.
- **Disconnected or hidden:**
  - To reply, the office uses the supervisor's site pages (`/admin/supervisor/sites/[id]/messages`).
  - `/admin/messages` lists instructions and the last 20 handovers across jobs, but cannot reply.
  - Communication is split between messages, alerts, the quality page's "Daily site updates" and Today's
    "From site".
- **Genuinely missing:**
  - a "decision request" type with a recorded outcome (approved or refused, by whom, when)
  - a resolved or closed state: a thread drops off once someone replies, which does not mean it is resolved
  - ageing ("waiting 2 days")
  - any notice outside the app
- **Over-complicated:** four inbox-like places with different rules.
- **On the homepage:** one **Inbox** panel listing every unanswered question, decision request and problem
  across all jobs, oldest first, with its age and a reply or decide button.
- **Reuse:**
  - `job_messages` threads and `conversation-data.ts`
  - rule R20
  - `supervisor_office_items` and acknowledgements
  - the unapplied `office_reviews` migration (apply it rather than rebuild it)

### 4.3 Subcontractor onboarding

- **Exists:**
  - company, insurance, accreditation, gang and operative records (Workforce)
  - gang on job with agreed rates (Gang invoices → Setup)
  - tax and CIS status, VAT, bank details, personal portal links (hashed, at most 90 days, at most 5 per
    gang), versioned agreements with typed-signature evidence, variations, retention release
    (`/admin/subcontractors/[teamId]`)
- **Works in production:**
  - not yet usable: 0 links, 0 tax profiles, 0 companies
  - **no published agreement version**, and portal invoicing is refused until the owner publishes one and
    the gang signs it
- **Disconnected or hidden:**
  - Onboarding spans four places: Workforce (company, insurance, gang, people), Gang invoices → Setup
    (job and rates), Subcontractors (tax, bank, agreement, link) and the job plan (allocation).
  - Giving a gang member phone access is entered twice: in the plan and in package access (rule R10 says so).
  - A gang can exist without a linked company, and then insurance alerts never fire for it (the TEST gangs
    have none).
- **Genuinely missing:**
  - one onboarding checklist showing completion across gangs
  - sending the portal link from the app (the office uses its own email or phone)
  - CIS verification with HMRC (recorded by hand)
  - operative cards (CSCS) and expiry dates
- **Over-complicated:** four pages and a double entry before a gang can work and be paid.
- **On the homepage:**
  - "Gangs not ready", e.g. "Gang A: agreement unsigned, insurance missing"
  - a quick action **Add gang**, leading through one guided flow
- **Reuse:** every table and function above. The new work is a checklist view and a guided flow that
  calls existing RPCs in order.

### 4.4 Subcontractor invoices

- **Exists:**
  - one gang invoice engine: uploaded or generated from agreed rates (portal), supervisor verification
    against quantities, office approval with CIS, retention and VAT, agreed payment date, recorded payment,
    queries and returns, duplicate checks, files in a private bucket
  - an approved invoice becomes a job cost
  - the homepage strip shows counts: ready to approve, needs a supervisor, due within a week
- **Works in production:** the most exercised workflow, with 8 TEST invoices run through every outcome.
  Test data only.
- **Disconnected or hidden:** the strip shows counts but not amounts or a payment list. Retention is shown
  per gang only.
- **Genuinely missing:**
  - a payment run (what to pay this week and its total)
  - total CIS deducted this month
  - CIS monthly statements and the CIS300 return
  - subcontractor payment and pay-less notices
  - payments are recorded, not made
- **Over-complicated:** nothing significant.
- **On the homepage:** the **Money out** part of a Money panel:
  - to approve, as a count and £
  - waiting for a supervisor
  - due this week, listed with £ and date
  - overdue to pay
  - retention held
  - CIS deducted this month
- **Reuse:** `officeGangSummary` (`lib/operations/gang-data.ts`) and `gang_invoice_commercials`
  (`payment_due_on`, `agreed_payment_on`, `paid_on`).

### 4.5 Live jobs

- **Exists:**
  - contract register with search
  - the job page: details, budget, "Position now", packages, documents, audit history
  - job money: revised value, cost to date by type, forecast final cost, forecast profit, applications,
    certificates, retention, received, outstanding
  - plan, programme revisions, planned vs actual, locations, accounts
- **Works in production:** screens and database functions work. 2 demo jobs, 1 budget.
- **Disconnected or hidden:**
  - Every register card is hard-coded "Draft · unreleased".
  - The register shows no supervisor, gangs, progress, margin or open items.
  - Money lists one job at a time with no portfolio total.
- **Genuinely missing:**
  - a job lifecycle: tender → won → mobilising → live → complete → defects → final account → closed
    (the database allows only `draft`)
  - % complete. Candidate source: `work_packages.quantity` against verified gang quantities.
  - programme status ("3 days behind")
  - a portfolio table
- **Over-complicated:** answering "how are my jobs?" needs every job opened, three pages per job.
- **On the homepage:** a **Live jobs** table with one row per job:
  - supervisor
  - on site today (planned against confirmed)
  - yesterday's handover ✓ or ✗
  - finish date and days left or behind
  - % complete
  - forecast margin against target (owner only)
  - open stops, snags and actions
  - link to the job
- **Reuse:** `positionsFor` and the financial position function, `contract_assignments`, plans and actuals,
  and the engine's per-job action counts.

### 4.6 Commercial administration

- **Exists:**
  - commercial accounts: payment terms, numbered applications, invoices, credit notes, statements, final
    accounts, retention release, Construction Act dates and payment notices, VAT and CIS, branded PDFs,
    revocable share links
  - variations and dayworks with client authorisation, pricing and internal approval
  - job costs and material matching
  - the tender inbox
  - the estimator
  - startup expenses
- **Works in production:** the database is fully migrated (commercial migrations C1–C6 recorded), but there
  are 0 applications, 0 issued documents and 0 notices. There is 1 tender enquiry.
- **Disconnected or hidden:**
  - The invoice list shows issue and due dates but not paid, outstanding or overdue status.
  - Tenders can be read but not moved through `reviewing`, `pricing`, `submitted` or `declined`, although
    the database allows those statuses.
  - The estimator result is not saved.
- **Genuinely missing:**
  - a quotations register (saved quotes with value, version and outcome)
  - a tender pipeline with return dates
  - aged debt
  - a cash-flow forecast
  - "notices due this week" across jobs
  - variations and dayworks waiting for the client, across jobs
  - contracts without payment terms
- **Over-complicated:** invoicing starts at Invoices → choose contract → job accounts. Applications are
  only per job.
- **On the homepage:**
  - **Money in**: applications due this week (by valuation date), payment and pay-less notices due,
    invoices overdue (£ and days), certified but unpaid, retention due for release, extras waiting for the
    client (£)
  - **New business**: tenders by return date, quotes awaiting an answer
- **Reuse:** `accounts-data.ts`, `contract_payment_terms` dates, `payment_notices`, `commercial_documents`,
  `dayworks`/`variation_daywork_inclusions`, and the `tender_enquiries` status column.

### 4.7 Planning

- **Exists:**
  - per-job planned allocations (gang, location, stage, dates) and programme revisions
  - inspection requirements that gate release
  - setup and planning rules: R03 confirm teams, R08 plan the next 7 days, R09 missing checklist,
    R10 package access
  - morning readiness checks
  - "materials needed" in the handover, as free text
- **Works in production:** 0 plans, 0 programme revisions.
- **Disconnected or hidden:** only the job page reads planned allocations, so there is no view across
  jobs. The planning and setup rules are office-only, so the owner never sees them (§2.3).
- **Genuinely missing:**
  - a cross-job planner (gangs × days)
  - double-booking and idle-gang detection
  - upcoming starts list
  - pre-start readiness (RAMS approved, inductions, access, materials delivered)
  - materials requirements, orders and deliveries
- **Over-complicated:** planning gang by gang inside each job.
- **On the homepage:** **Next 14 days**:
  - starts and finishes
  - work not allocated
  - gangs without work, or booked twice
  - jobs not set up
  - materials needed from handovers
- **Reuse:** `planned_allocations`, `site_programme_revisions`, rules R03/R08/R09/R10, `team_memberships`.

### 4.8 Quality and compliance

- **Exists:**
  - mandatory inspections and hold points
  - QA requests
  - snag lifecycle with an independent re-inspection
  - safety and quality stops with an independent release
  - the quality page: daily updates, morning blockers, hold decisions, release status
  - snag and hold registers
  - site alerts
  - insurance alerts (A02 expired, R11 expiring within 30 days)
  - accreditations
  - RAMS, COSHH, H&S and terms PDF generators
- **Works in production:** 1 test stop (never assigned), 1 draft test snag, 2 morning findings open for 3–4
  weeks. 0 inspection templates and 0 insurance records.
- **Disconnected or hidden:**
  - The owner sees only *safety* stops needing a fixer.
  - Quality stops appear only in the "stopped" list, not as an action.
  - Insurance expiring is office-only.
  - Draft snags are invisible.
  - The PDF generators are missing from role navigation.
- **Genuinely missing:**
  - a compliance register across gangs and operatives (CSCS and other cards, expiries)
  - RAMS approval status per job before start
  - defects-liability end dates
- **Over-complicated:** quality, holds, snags and alerts are four pages with overlapping content.
- **On the homepage:** **Quality and compliance**:
  - stops with their age
  - critical and overdue snags
  - failed or due inspections
  - stale morning findings
  - insurance and accreditations expiring within 30 days
  - gangs not onboarded
- **Reuse:** rules G01–G10, A01, A02, R07, R11, R13, R15, R17; `hold_register`; `work_release_status`.

### 4.9 Navigation

- **Exists:** role tabs (owner: Today, Jobs, Money) and an "Everything else" drop-down with 17 links.
- **Disconnected or hidden:**
  - Startup expenses, Documents (RAMS/COSHH/H&S/terms) and business settings are missing from the owner's
    navigation.
  - Today's "Open a record" hides Job setup, People and Paperwork whenever the role shell is on
    (`components/admin/admin-today.tsx`: `!tabs`), but only contracts managers have those tabs.
  - Acting on a job sends office users into supervisor routes (`/admin/supervisor/sites/...`).
  - Gangs live on three pages: Workforce, Gang invoices, Subcontractors.
- **Genuinely missing:**
  - global search: there are 5 separate page searches (contracts, invoices, snags, holds, locations)
  - a consistent desktop sidebar
  - breadcrumbs back to Today
- **On the homepage:** a search box and quick actions (section 6).
- **Reuse:** `role-nav.ts` (one place to fix), and `routes.ts` (`adminActionHref` already deep-links every
  action).

### 4.10 Notifications

- **Exists:** derived in-app signals only: the Today engine (worked out on page load), `hold_notifications`
  with read state (`/admin/alerts`), and the gang invoice strip.
- **Genuinely missing:**
  - an email, SMS or push provider
  - scheduled jobs (no Vercel cron)
  - a daily digest
  - immediate alerts for safety stops, critical defects, decision requests and invoices ready
  - sending portal links from the app
- **Consequence:** the owner must visit pages to discover events. Combined with §2.3, most events are
  never surfaced to the owner at all.
- **Reuse:** run the same `compute()` on the server for a digest, so there is one source of truth. The
  `hold_notifications` read-state pattern can serve an in-app notification bell.

---

## 5. Cross-cutting causes

1. **Audience model assumes a separate office.** Fix this in the engine once, not page by page.
2. **"No money on Today" rule.** It made sense for contracts managers. For the owner it hides the most
   important daily numbers. The owner needs to decide whether money appears on their homepage.
3. **Four overlapping inboxes**: Today "From site", Messages, Alerts and Quality "Daily site updates".
   Merge them into one Inbox, and keep the registers for history.
4. **Single-job design.** Plans, applications and activity are only per job, so there is no portfolio view
   of anything except contracts.
5. **No lifecycle.** Without job states, "live", "starting soon" and "finished" have to be inferred from
   dates.
6. **Production readiness.** Demo data, inactive test accounts, an expired supervisor assignment, an
   unapplied migration and history drift all need resolving before real use can be verified.

---

## 6. Proposed command centre

### 6.1 Principles

- **One derived truth.** Every alert comes from saved records through the existing engine. Nothing is
  ticked off by hand; an item leaves when its record changes.
- **Every row is a link** to the exact job, invoice, report, stop or decision (`adminActionHref`), with a
  way back to Today.
- **Order by urgency:** urgent decisions → live operations → money → communication → upcoming work.
- **The owner sees everything the office would see** when there is no office person for that job.
- **No duplicate entry.** Quick actions open the existing forms.

### 6.2 Desktop layout (from 1280 px)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ TileSPEC   [ 🔍 Search jobs, gangs, invoices, snags, tenders…  ⌘K ]   [+ New ▾]   🔔 3   Owner ▾ │
├──────────┬────────────────────────────────────────────────────────────────────────────────────┤
│ Today    │ ⛔ 1 safety stop · 2 quality holds — work stays stopped   [View stops →]          │
│ Jobs     ├────────────────────────────────────────────────────────────────────────────────────┤
│ Planning │ [Decisions 5] [Site questions 3] [On site 4 jobs·9 gangs] [Money in £18.4k due/£6.2k │
│ Gangs    │  overdue] [Money out £7.9k this week] [Compliance 2 expiring]   ← each tile is a link│
│ Money    ├──────────────────────────────────────────────────────┬─────────────────────────────┤
│ Quality  │ NEEDS YOUR DECISION (oldest first)                   │ INBOX — from site            │
│ Inbox    │ • Release quality hold · Hotel · Bath 104 · 2d  [Decide]│ • "Can we tile over…?" Hotel │
│ Documents│ • Approve GI-00012 · Gang A · £1,240 · CIS £248 [Review]│   needs decision · 1d [Reply]│
│ Tenders  │ • Price daywork DW-3 · Supermarket            [Price] │ • Problem: scaffold in way   │
│ Settings │ • Give Supermarket a supervisor               [Assign]│   Supermarket · 3h   [Reply] │
│          │ • Plan next week · Hotel                      [Plan]  │ • Handover with problems ·   │
│          │                                    [Show all 12 →]  │   Hotel · yesterday [Review] │
│          ├──────────────────────────────────────────────────────┴─────────────────────────────┤
│          │ LIVE JOBS                                                                          │
│          │ Job        Supervisor  On site (plan/conf) Handover  Finish   Progress Margin  Open│
│          │ Hotel      A. Smith    3/3 gangs          ✓ yday    4 Dec ✓  62%      18% ▲  4  →│
│          │ Supermkt   —  ⚠        0/1                ✗ missing  13 Nov ⚠ 85%      9% ▼  7  →│
│          ├──────────────────────────────────────────────┬─────────────────────────────────────┤
│          │ YESTERDAY ON SITE (per job, expandable)      │ MONEY                               │
│          │ Hotel: 6 people · 42 m² walls · 18 photos ·  │ In: Application 7 due Fri · £18.4k  │
│          │   2 inspections passed · 1 snag · "need grout"│     Pay-less deadline Mon · Hotel   │
│          │ Supermarket: no handover ⚠                  │     Overdue: INV-031 £6.2k · 12 days │
│          │                                              │ Out: 3 to approve £3.1k · 5 due    │
│          │                                              │      this week £7.9k · CIS £1.2k   │
│          ├──────────────────────────────────────────────┼─────────────────────────────────────┤
│          │ NEXT 14 DAYS                                 │ QUALITY & COMPLIANCE                │
│          │ Starts: Office fit-out Mon 17 (not set up ⚠) │ 2 critical snags · 1 repair overdue │
│          │ Unallocated: Hotel L2 corridors 18–21 Nov    │ 1 inspection failed · Bath 106      │
│          │ Idle gang: Gang B from Thu · Double-booked: — │ Gang C insurance expires 28 Nov     │
│          │ Materials needed: grout (Hotel)              │ Gang D: agreement unsigned          │
│          ├──────────────────────────────────────────────┴─────────────────────────────────────┤
│          │ NEW BUSINESS: 2 tenders due back this week · 1 quote awaiting answer               │
└──────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Mobile (390 px)

Same order, stacked:

1. stop banner
2. six tiles (2 × 3)
3. Needs your decision (5, then "show all")
4. Inbox
5. Live jobs as cards
6. Yesterday, Money, Next 14 days, Quality as collapsible sections

Bottom tabs: **Today · Jobs · Inbox · Money · More**. Search sits in the header.

### 6.4 Panels, their sources and destinations

| Panel | Source (existing unless marked new) | Each row opens |
|---|---|---|
| Stop banner | `work_holds` (already on Today) | `/admin/holds/[id]` |
| Needs your decision | engine queue with owner-as-office (§7 P1.1), gang invoices `with_office`, daywork R22/R26–R28, decision requests (*new type*) | `adminActionHref`, `/admin/gang-invoices/[id]` |
| Inbox | `job_messages` (R20), handovers and results to review (`office_reviews`, *apply migration*), unacknowledged instructions | the thread, handover or result |
| Live jobs | contracts, assignments, plans and actuals, `positionsFor`, engine counts; *lifecycle state (new)*, *progress (new calc)* | `/admin/contracts/[id]` |
| Yesterday on site | `activity-data.ts` grouped by job for one date | job activity for that date |
| Money in | `contract_payment_terms`, `payment_applications`, `payment_notices`, `commercial_documents`, `payment_receipts`; *aged debt (new query)* | job accounts, application or invoice |
| Money out | `gang_invoice_commercials`, `officeGangSummary`, retention | gang invoice, gang page |
| Next 14 days | `planned_allocations`, R08/R09/R10, handover materials; *cross-job planner (new page)* | job plan, planner |
| Quality and compliance | rules G01–G10, A01, A02, R07, R11, R13, R17; onboarding checklist (*new view*) | stop, snag, inspection, gang |
| New business | `tender_enquiries` (+ *status UI*), *quotes (new)* | tender, quote |

### 6.5 Global search

One box searches:

- jobs: reference, name, client, address
- gangs, companies and operatives
- client and gang invoices (`INV-`, `GI-`)
- applications
- dayworks and variations by number
- snags and stops
- tenders
- documents

**Implementation:** a `security invoker` Postgres function (so RLS still decides what each person sees)
returning `{type, id, label, context, href}`, backed by trigram indexes. Results are grouped by type, and
money types appear only with money access.

### 6.6 Quick actions (+ New)

Each opens an existing form:

- New job
- Add gang (guided onboarding)
- Issue portal link
- Plan a gang
- Send instruction to site
- Raise a snag or stop
- Record payment received
- Approve gang invoices
- New application or invoice
- Log tender or quote
- Record expense

---

## 7. Prioritised implementation plan

Sizes are relative (S under a day, M a few days, L a week or more). Each step reuses the test harnesses
already in the repository (`test:admin-today-ui`, `test:admin-today`, `test:db`).

### Phase 0: make production trustworthy (decisions and configuration, little or no code)

| # | Step | Size | Notes |
|---|---|---|---|
| P0.1 | Owner decides the open questions in §8 | — | Blocks P1.1 and P2.4 |
| P0.2 | Remove or isolate DEMO/TEST data and inactive TEST accounts; assign the real supervisor to real jobs | S | Do this on a backup first, or create real jobs alongside and archive the demo ones |
| P0.3 | Rehearse and then run the migration history repair, and apply `office_reviews_instruction_changes` | S–M | Runbook exists. Unlocks review, withdraw, change and urgent |
| P0.4 | Owner publishes the subcontractor agreement version (with legal review on record) | S | Without it no gang can invoice through the portal |
| P0.5 | Staging backend for preview deployments | S | So every later step is verified before production |
| P0.6 | Remove the unused `BLOB_READ_WRITE_TOKEN`; re-test the six document PDF routes | S | Housekeeping |

### Phase 1: make today's homepage truthful (small code changes, high value)

| # | Step | Size | Reuse |
|---|---|---|---|
| P1.1 | **Owner acts as office** when no active contracts manager is assigned to that job, or by an organisation setting. Give the owner the `office` audience in `forViewer` for those jobs | S–M | `engine.ts`, `lookups.ts`; members are already in the snapshot. Add engine tests for the one-person business |
| P1.2 | Fix navigation: add Startup expenses, Documents and Business settings to `everythingElse`; show the Job setup, People and Paperwork shortcuts when the role does not have those tabs | S | `role-nav.ts`, `admin-today.tsx` |
| P1.3 | Stop "none" counting as a problem in handovers (treat none, n/a, nil and no as empty), and turn the problem boxes into yes/no + detail | S | `site-updates.ts`, rule R19, handover form |
| P1.4 | Surface stale items: draft snags not sent, morning findings older than N days, dayworks recorded but not sent | S | New rules in the same catalogue |
| P1.5 | Add totals to the gang invoice strip: £ to approve and £ due this week | S | `officeGangSummary` |

### Phase 2: the command centre (read-only panels over existing data)

| # | Step | Size | Depends on |
|---|---|---|---|
| P2.1 | Layout shell: sidebar, KPI tiles, the order in §6, mobile stacking | M | P1.2 |
| P2.2 | **Needs your decision** + **Inbox** (merge the four inboxes; add a resolved state and ageing) | M | P0.3, P1.1 |
| P2.3 | **Live jobs** table; job lifecycle states (migration to widen `contracts.state`); programme status; % complete from package quantities | M–L | P0.2 |
| P2.4 | **Money in / Money out** panel for the owner (and money-access office), including aged debt and payment run | M | P0.1 decision |
| P2.5 | **Yesterday on site** digest | M | — |
| P2.6 | **Next 14 days** + cross-job planner page | M–L | — |
| P2.7 | **Quality and compliance** panel + gang onboarding checklist | M | — |
| P2.8 | Global search + quick actions | M | — |

### Phase 3: notifications

| # | Step | Size |
|---|---|---|
| P3.1 | Email provider (and optional SMS) with environment secrets; send portal links from the app | S–M |
| P3.2 | Daily 07:30 digest built from the same `compute()` + Money and Yesterday panels (Vercel cron) | M |
| P3.3 | Immediate alerts: safety stop, critical defect, decision requested, invoice ready to approve, insurance expired on site | M |
| P3.4 | In-app notification bell with read state (follow the `hold_notifications` pattern) | M |

### Phase 4: genuinely missing modules

In suggested order:

1. decision requests with outcomes
2. quotations register (save estimator output) and tender pipeline statuses
3. cash-flow forecast
4. materials requirements, orders and deliveries
5. site photo diary and daily quantities
6. operative compliance cards
7. guided gang onboarding flow
8. CIS monthly statements
9. subcontractor payment and pay-less notices

Each is size L and should be its own reviewed change with migration, preflight and tests, following the
existing pattern.

### What not to build

- A second rules engine or a task table. Keep actions derived.
- A separate subcontractor system. The gang invoice and portal engine is the single route.
- A new messaging system. Extend `job_messages`.

---

## 8. Decisions needed from the owner

1. **Should you receive office work when no contracts manager is on a job?** Recommended: yes, automatically,
   per job.
2. **Should money figures appear on your homepage?** The current design says never. Recommended: yes, for the
   owner and for office staff with money access only, in one Money panel.
3. **Demo and test records in production:** delete, archive, or move to a separate demo organisation?
4. **Email or SMS provider** for digests, alerts and portal links.
5. **Approve applying** the outstanding `office_reviews_instruction_changes` migration after a rehearsal on a
   copy.
6. **Job lifecycle stages:** confirm the stages you use, so "live" means what you mean.

---

## Appendix: evidence

- Flags: Vercel project `tilespec` production environment variables (§2.1). Code:
  `lib/operations/next-actions/flags.ts`, `app/admin/page.tsx`, `app/admin/layout.tsx`.
- Owner audience: `lib/operations/next-actions/lookups.ts` (`roleKey`), `engine.ts` (`forViewer`), and each
  rule's `audience` in `rules.ts`.
- Engine run: today's production rows rebuilt into a snapshot and passed to `compute`, `buildQueue` and
  `siteUpdates`. Output reproduced in §2.2.
- Navigation: `lib/operations/role-nav.ts` (`destinationsFor`, `everythingElse`),
  `components/admin/admin-today.tsx` ("Open a record").
- Data counts: read-only `select` queries against the hosted project on 11 Nov 2026.
- Migrations: hosted `supabase_migrations` history compared with `supabase/migrations/`, plus object checks
  for each unrecorded file.
- Runtime errors: Vercel runtime error groups, last 7 days.
- Tests: `npm test` (303 pass) and `npm run typecheck` (clean) on `2142df5`.
