# TileSPEC — Financial integration and supervisor permissions audit

**Date:** 3 November 2026
**Status:** Audit of `main` at `7ca6b44` and of the live project on 3 November 2026. The owner's decisions are in §5; the
staged implementation that follows them is described in [commercial-integration.md](commercial-integration.md).

**Sources checked**
- Repository `paulthetiler/Tilespec`, `main` at `7ca6b44`: 19 migrations, all pages, server actions, API routes, navigation and tests.
- Live Supabase project **TileSpec** (`odwysybvncdfdrfnnnqt`): read-only queries of tables, row counts, functions, RLS policies and grants, plus the Supabase security advisor.
- Unit test suite (`npm test`): **245 of 245 passing** on the current code. The database tests (`npm run test:db`) need a local Postgres and were not run. They were read instead.

---

## 1. Summary

**Financial**
TileSPEC has two separate financial pieces:
- an **original budget** per job (`contract_commercials`)
- a **complete daywork workflow**, from site record through pricing, internal charge approval and client authorisation.

Nothing combines them. Variations, labour costs, material costs, subcontractor costs, payment applications and actual costs are **not built**. The Money page reads the original budget only, so its disclaimer is accurate.

The data needed to cost labour is already captured: who was on which job, and when they arrived and left. It is never turned into hours or cost.

**Security**
Money values are protected properly at the database layer, not only in the interface.
- Supervisors cannot read contract values, budgets, margins, daywork rates, prices or totals, commercial documents or commercial audit rows.
- I confirmed this in the migration code, in the live RLS policies and in the existing database tests.
- In the code, the bottom-navigation **Money tab is shown only to the owner**.
- The live database has **one user, the owner**. Any screenshot of the live app with a bottom bar is therefore the owner's view.

There is one real gap. Supervisors can see **commercial approval statuses** on dayworks: "Priced", "Charge approved internally", and "Client authorised/declined the cost", along with the client's instruction reference and the owner's override reasons. No amounts are exposed, but this conflicts with your rule that commercial pricing and approvals are restricted.

**Live database state**
- 1 member (owner, with money access)
- 2 contracts
- 0 budgets, 0 dayworks, 0 daywork rates
- 0 contract assignments, 0 operatives on attendance

Two repository migrations are **not applied** live:
- office reviews and instruction changes
- tender enquiries

Four migrations are applied live but **missing from the migration history**:
- `supervisor_daily_workforce`
- `work_holds`
- `supervisor_daily_workflow`
- `hollow_workmanship`

---

## 2. Financial audit

### 2.1 Feature-by-feature

| Feature | Built in code | Live DB | Feeds job financials? | Evidence |
|---|---|---|---|---|
| Original budget: contract value, labour/materials/preliminaries budgets, contingency, target margin, payment terms, retention % | Yes | Table present, **0 rows** | Is the only input to "profit" | `contract_commercials`, `save_contract_commercial` RPC, form on `app/admin/contracts/[id]/page.tsx:105-126` |
| Money page | Yes, read-only | — | Budget only | `app/admin/money/page.tsx:25` shows "original budgets only…" |
| Budgeted margin | Yes | — | value − (labour + materials + prelims) − contingency | `lib/operations/summary.ts` `budgetSummary` |
| Estimator | Yes | Not stored | **No.** Client-side calculator, unsaved, not linked to a job | `app/admin/estimator/estimator-client.tsx:116` |
| **Dayworks** | **Yes, complete**: site record (description, location, who instructed), labour hours, plant and material lines, photos, client rep signature or refusal, office approve/reject/ask for detail (cannot approve own), per-job versioned **charge-out rates**, pricing that snapshots each rate, internal charge approval, client cost authorisation with instruction reference or evidence | Migration applied, **0 rows, 0 rates** | **No.** Priced and authorised totals are never added to the contract value, the Money page, the contract page or Owner Today | `supabase/migrations/20261028090000_dayworks.sql`, `app/admin/supervisor/sites/[id]/dayworks/*` |
| **Variations** | **No.** Placeholder page: "Not built yet. Nothing on this page is saved." Supervisors are told to write it in the handover | — | No | `app/admin/supervisor/sites/[id]/commercial/page.tsx:78` |
| Office "instruction changes" (M2) | Yes | **Not applied live** | No. These change office instructions to site, not contract variations | `20261023090000_office_reviews_instruction_changes.sql` |
| **Labour attendance and hours** | Attendance yes: per operative, per job, location and stage, with `joined_at`/`left_at` | Tables present, 0 rows | **No.** Hours are never calculated. No operative, team or company has a cost rate anywhere in the schema | `actual_allocations`, `actual_allocation_operatives` in `20261014093000_site_allocations.sql` |
| **Materials used** | **No** structured record. The handover has free text "Materials needed for tomorrow". Daywork lines record materials for that daywork only | — | No | `app/admin/supervisor/sites/[id]/finish/page.tsx:45` |
| **Subcontractor costs** | Companies, insurances, accreditations, operatives and gangs only. **No rates, orders or payments** | Tables present, 0 rows | No | `20261014100000_subcontractor_companies.sql` |
| **Payment applications**, certificates, notices | **No.** Planned as "Phase 4" in the architecture doc | — | No | `docs/operations/architecture.md:52` |
| **Actual cost entries** | **No.** Planned as "Phase 4" | — | No | `docs/operations/architecture.md:50` |
| Owner margin decision | **No.** The page says "There is nowhere to record an owner decision" | — | — | `app/admin/money/page.tsx:38` |
| Margin alert in Today (rule R14) | Rule exists | — | **Never fires**: both Today snapshots load `commercials: []` | `lib/operations/next-actions/office-snapshot.ts:186`, `snapshot-data.ts:97` |

### 2.2 Answers to your questions

1. **Which financial features are implemented?** Original budgets, the read-only Money page, the unsaved estimator and the full daywork workflow, including charge-out rates, pricing and approvals.
2. **Which are connected to the live database?** Budgets and dayworks have live tables and working functions. Neither holds any data yet.
3. **Which are incomplete or disconnected?**
   - Variations: placeholder only.
   - Labour costing: attendance exists, but there are no rates and no hours calculation.
   - Materials: no record.
   - Subcontractor costs: no record.
   - Payment applications: not built.
   - Actual costs: not built.
   - Estimator: not linked to jobs.
   - Office reviews and instruction changes: built, not deployed.
4. **Do dayworks and variations feed contract financials?** No. Dayworks are priced and approved in isolation. Variations do not exist.
5. **Can labour, materials and subcontractor costs be captured against jobs?**
   - Labour: time on site yes, cost no.
   - Materials: no.
   - Subcontractors: no.
6. **Are payment applications, approved variations and actual costs reflected in profitability?** No. Profit is the original budget only.

### 2.3 What already exists and can be reused (do not rebuild)

- **Permission model:** `can_view_financials`, money held in separate RLS-gated tables, all writes through checked RPCs, append-only records, idempotent request keys, and commercial audit segregation.
- **Daywork workflow:** site record → office decision → pricing → internal approval → client authorisation. This is the right shape for variations too.
- **Attendance records:** per operative, per job, per day, with times.
- **Subcontractor and operative registers.**
- **Private evidence storage** with commercial document classification.
- **Job messages and office instructions** for communication.

---

## 3. Supervisor access and security audit

### 3.1 Role model

- Roles: `owner`, `contracts_manager`, `supervisor`, `lead_installer`, `subcontract_installer`.
- `financial_access` can be true only for owner or contracts manager. A database check enforces this, so even the owner cannot grant it to a supervisor.
- App check `canReadFinancial` (`lib/operations/permissions.ts`): owner, or contracts manager with `financial_access`.
- Database check `can_view_financials`: the same, **plus** the contracts manager must be assigned to that job. The database is the stricter of the two, which is correct.

### 3.2 Navigation

| Role | Bottom bar (`FEATURE_ROLE_SHELL`) | "Everything else" |
|---|---|---|
| Owner | Today · Jobs · **Money** | full menu incl. Estimator, Money |
| Contracts manager | Today · Jobs · People · Paperwork | Estimator, Money **only if** money access |
| Supervisor | Today · People · Inspect · Issues, only inside a site | **none** (`role-nav.ts:63`) |

- With the flag off, supervisors get no office menu at all (`app/admin/layout.tsx`).
- **Money tab:** in `lib/operations/role-nav.ts:19-24` only the `owner` case includes Money. The live database contains only one member, the owner. A screenshot showing Money in the bottom bar is the owner's view. It would also be what you saw if you were checking "as a supervisor" while signed in as the owner. There is no supervisor account to test with.

### 3.3 Pages

| Page | Guard | Result for supervisor |
|---|---|---|
| `/admin/money` | flag + `canReadFinancial`, else 404 | Blocked |
| `/admin/estimator` | `requireFinancialActor` | Redirected |
| `/admin` | supervisors redirected; figures fetched only if financial | Blocked |
| `/admin/contracts/[id]` | budget, rates and commercial upload option shown only if financial; RLS returns nothing anyway | No money shown |
| `/admin/paperwork` | filters to operational documents unless financial, and RLS also filters | No commercial docs |
| `/admin/tenders` | owner/CM only (uses service key server-side) | Blocked |
| `/admin/workforce`, `/admin/quality`, `/admin/team` | office or owner only | Blocked |
| `/admin/supervisor/sites/[id]/dayworks/[dayworkId]` | rates, prices and totals loaded only if financial | No amounts, but **see F1** |
| `/admin/supervisor/sites/[id]/commercial` | rates link only if financial | No amounts, but **see F1** |

### 3.4 Server actions

- `saveCommercialAction` checks money access in the app **and** in the database.
- `saveRateAction`, `priceDayworkAction`, `approveChargeAction`, `decideDayworkAction` and `clientAuthorisationAction` have **no app-level check**. They rely on the database function, which does reject unauthorised users (`can_view_financials` / `can_manage_contract`). This is safe, but there is only one layer (**F2**).

### 3.5 API routes

- `/api/supervisor/*` (inspections, issues, snag/hold/daywork photos) touch no money.
- The service key is used only to verify uploaded bytes after an RLS-checked reservation, and for the tender inbox (owner/CM only) and the public enquiry form.
- Document downloads use the user's own session, so storage RLS applies.

### 3.6 Database (RLS and grants), verified live

| Table / data | Who can read |
|---|---|
| `contract_commercials` (value, budgets, margin, payment terms, retention) | `can_view_financials` |
| `contract_daywork_rates`, `daywork_pricings`, `daywork_pricing_lines`, `daywork_commercial_approvals` | `can_view_financials` |
| `organisations.target_margin` | not granted to any app user (only `id`, `name`) |
| `audit_events` where `commercial` | `can_view_financials` |
| `document_revisions` / storage where `classification = 'commercial'` | `can_view_financials` |
| `daywork_rate_items()` | supervisors get item names and units, **never rates** |
| `dayworks`, `daywork_events`, `daywork_client_authorisations` | **supervisors on the job** (see F1) |

- All writes go through security-definer functions that check permissions.
- The advisor's 73 "security definer executable" warnings are the intended design. Each function checks permission internally.
- Existing tests already prove supervisor denial:
  - `tests/db/foundation.test.sql:107, 219, 371, 413`
  - `tests/db/dayworks.test.sql:184, 186, 321`

### 3.7 Findings

**F1 — Medium. Supervisors can see commercial approvals (no amounts).**
- What they see:
  - Daywork statuses "Charge: Priced, waiting for internal approval / Charge approved internally" and "Client: authorised / declined the cost" (`dayworks/[dayworkId]/page.tsx:70-71`, list at `commercial/page.tsx:67`).
  - The "Client's authorisation of the cost" section: client name, instruction reference and evidence link (`:153`).
  - History lines "priced DW-n" and "approved the charge… (owner override): *reason*" (`:214`). The same lines appear in the shared activity feed.
- Where it comes from: the `dayworks.commercial_status` and `client_status` columns, `daywork_events` rows for `price` / `commercial_approval` / `client_authorisation`, and the `daywork_client_authorisations` table. All are readable by supervisors through RLS, so hiding the screen would not be enough.
- This was a deliberate earlier design. `tests/db/dayworks.test.sql:315-321` asserts "a supervisor sees that the charge was approved". It now conflicts with your rule.

**F2 — Low. Single layer on five office/money server actions.** See 3.4.

**F3 — Low. Supabase leaked-password protection is off.** The project README requires it. It is a dashboard toggle.

**F4 — Info. No supervisor account exists live**, and there are no contract assignments. Role behaviour has never been exercised on the live project.

**F5 — Info. Migration drift.** See §1. This must be reconciled before any new migration, otherwise preflight checks and history will disagree.

Verified OK (no change needed):
- money RLS
- commercial documents
- commercial audit
- the estimator gate
- Money page gate
- Today snapshots never load figures
- financial Next Actions hidden from non-money users
- supervisors cannot be granted money access

---

## 4. Proposed changes — smallest practical set

**Principles**
- Extend existing tables and the daywork pattern. No duplicate tables, no second app.
- Store facts once and **calculate** totals. No stored running totals to drift.
- Every new money table uses the existing `can_view_financials` RLS, RPC-only writes, append-only records and commercial audit.
- Supervisor screens gain one button ("Raise a variation") and one optional section ("Materials used"). Everything else stays as it is.

### Phase A — Security (do first; one migration plus small UI edits)

**A1. Remove commercial approvals from the supervisor's view, at the database.**
- `daywork_client_authorisations`: read policy changes to office only (`can_manage_contract`).
- `daywork_events`: supervisors no longer read `price`, `commercial_approval` or `client_authorisation` rows.
- `dayworks.commercial_status` / `client_status`: revoke column read from app users. The office reads them through a small checked function. App queries using `select("*")` on `dayworks` must list columns instead. The affected loaders are `daywork-data.ts`, `daywork-actions.ts` and `office-snapshot.ts`.
- Supervisor sees one site instruction instead: **Waiting for approval / Approved — go ahead / Rejected — do not continue**.
- Daywork page: the Charge, Client and client-authorisation sections render only for office or money users.
- Update `tests/db/dayworks.test.sql:315-321` to assert the new rule. Add a direct-API test that a supervisor gets zero rows or a permission error.

**A2.** Add app-level `canManageContracts` / `canReadFinancial` checks to the five actions in F2, matching `saveCommercialAction`.

**A3.** Turn on leaked-password protection. Create real supervisor and contracts-manager test accounts on staging. Run the role checks, including direct REST calls with a supervisor token against every money table.

**A4.** Reconcile migration history: record the four unrecorded migrations, and decide whether to apply office reviews and tender enquiries.

### Phase B — One commercial position per job

**B1. Job financial position (no new table).**
- One read-only database function, gated by `can_view_financials`, that calculates for each job:
  - original value
  - **agreed** dayworks and variations (charge approved **and** client authorised)
  - **pending** (priced, not yet authorised)
  - revised contract value
  - budget
  - actual cost by labour, materials, subcontract and other
  - applied, certified and paid to date
  - retention held
  - forecast profit and margin against target
- The Money page, contract page and Owner Today (rule R14) all read this one function. The "original budgets only" text is removed.
- With dayworks alone, this already joins dayworks into job financials.

**B2. Variations on the existing daywork workflow (no new table).**
- Add `kind` (`daywork` | `variation`) to `dayworks`, with numbering per kind (DW-1, VO-1).
- Add a pricing `method` (`day_rates` | `quoted`) so a variation can be priced as a quoted lump sum.
- Everything else is reused: lines, photos, signature, office decision, independence rule, client authorisation (already requires an instruction reference or evidence), history and RLS.
- Supervisor: "Raise a variation" uses the same short form. It replaces the "Not built yet" page and warns that work must not start until approved.
- Live has 0 dayworks, so the constraint change is safe.
- Trade-off: the table keeps the name `dayworks`.

**B3. Labour cost from attendance supervisors already record (one money-only table).**
- `operative_cost_rates`: hourly cost per operative, versioned with effective dates, like `contract_daywork_rates`.
- Labour cost per job = attended hours (`joined_at`→`left_at`, voided records excluded) × the rate on that date.
- **No new input from supervisors.**
- Gangs paid on price work are costed through B4, not hours.

**B4. Materials, subcontract and other costs (one money-only table).**
- `job_cost_entries`, entered by the office from invoices and delivery notes. Fields:
  - category (materials | subcontract | plant | other)
  - company (existing subcontractor register) or supplier
  - invoice reference, date, net amount
  - optional location
  - optional daywork/variation link
  - optional commercial document
- Append-only, with void-and-reason.

**B5. Payment applications (two money-only tables).**
- `payment_applications` holds: number, period, status (draft → submitted → certified → paid), amounts and dates, and notice dates. Retention comes from the existing `contract_commercials.retention_percent`.
- `payment_application_lines` holds cumulative lines: contract works, each agreed daywork/variation (linked, pre-filled, no re-entry), materials on site, other.

**B6. Materials used on site (optional; supervisor, quantities only).**
- An optional "Materials used" section on the existing **Finish the day** handover: item, quantity, unit, location.
- No prices. The office reconciles it against B4.

### What is deliberately not proposed

- a separate variations table
- a finance app
- stored totals
- payroll or CIS
- accounting-package integration (Xero or similar can feed B4 later)
- package-rate valuation

### Effect on the supervisor interface

- Phase A removes 2 status lines and 1 section from the daywork screen and adds 1 plain go / no-go line.
- Phase B adds "Raise a variation" (replacing a dead-end page) and an optional materials section on the handover.
- Labour costing needs nothing extra from them.

---

## 5. Owner decisions (3 November 2026)

1. Dayworks and variations require office approval, with client authorisation wherever the contract requires it.
   Internal (charge) approval alone never implies permission to proceed.
2. Labour is costed from hourly operative cost rates, with agreed subcontractor day rates and gang day rates also supported.
3. Payment applications initially use office-entered valuations of completed work, including approved variations and dayworks.
4. Outstanding migrations are reconciled, and dependencies tested, before anything is applied to production.
5. Supervisors record materials and quantities without seeing costs. The office matches them against purchases and supplier invoices.
6. One integrated financial position per contract: original value, approved extras, actual costs, payment applications,
   payments received and forecast profit.
7. Supervisor commercial permissions stay restricted at both application and database level.

Use the existing architecture, with no duplicate systems. Implement in controlled stages with tests and a pull request.
Do not modify production data or apply migrations without explicit approval.
