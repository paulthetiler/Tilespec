# 1. Existing workflow audit

Phase 1 is read-only. Nothing in `app/`, `lib/`, `components/`, `supabase/` or `tests/` was changed. File and line references are to the repository as of this branch's base commit, so a reviewer can check every finding.

## 1.1 What was inspected

| Area | Where |
| --- | --- |
| Shell and navigation | `app/admin/layout.tsx`, `app/admin/page.tsx` |
| Contracts, plan, actuals, locations | `app/admin/contracts/**`, `components/office/**` |
| Supervisor site flow | `app/admin/supervisor/**`, `components/site/**`, `lib/operations/site-day.ts`, `daily*.ts`, `morning-checks.ts` |
| Inspections and quality | `lib/operations/inspections.ts`, `quality*.ts`, `app/admin/quality`, `app/admin/supervisor/inspections` |
| Snags and holds | `app/admin/snags/**`, `app/admin/holds/**`, `lib/operations/snags*.ts`, `holds*.ts` |
| Workforce and companies | `app/admin/workforce`, `lib/operations/companies.ts`, `planning.ts` |
| Tenders | `app/admin/tenders/page.tsx`, `supabase/migrations/20261013210000_tender_enquiries.sql` |
| Money | `lib/operations/summary.ts`, `app/admin/estimator`, `contract_commercials` |
| Database | all 16 files in `supabase/migrations/` (tables, row-level security, security-definer functions, triggers) |
| Permissions | `lib/auth.ts`, `lib/operations/permissions.ts` |
| Tests | `tests/**` (to know which behaviour is already pinned) |

## 1.2 What the app does well and must be preserved

The redesign sits on top of these. None of them is touched.

| Strength | Evidence |
| --- | --- |
| Only a different office person can release a stop. The raiser and the person who submitted the correction are both barred, in the database. | `work_holds.sql` lines 320 to 322, 355, 367, 558 (`raised_by = auth.uid()` is refused) |
| Release also needs no open critical snag, current mandatory inspections, and a principal-contractor acknowledgement for safety stops. | `work_holds.sql`, `work_release_status` |
| Unknown inspection applicability never grants release. | `work_holds.sql` line 499 onward |
| A repairer cannot re-inspect their own repair. Critical or escalated repairs need the office. | `snag_lifecycle.sql` |
| Append-only audit events and append-only insurance records. | `private.audit_mutation()`, `company_insurance_append_only` trigger |
| Idempotent saves (request keys) and an honest "could not confirm it saved" message on a failed connection. | `components/operations/operations-form.tsx` line 25 |
| Row-level security on every table; private storage for photos and documents. | all migrations |
| Money is gated by `financial_access`, not by role name alone. | `lib/operations/permissions.ts` |
| Subcontractors are limited to their allocated packages. | `contracts/[id]/page.tsx` lines 72, 116 to 141 |

## 1.3 Findings

Severity: **High** means a person can get stuck or a control can be missed. **Medium** means time is wasted or the right thing is hard to find. **Low** is polish.

### Navigation and unnecessary screens

| ID | Finding | Evidence | Sev |
| --- | --- | --- | --- |
| N-1 | Owner and office share an 11-link navigation (Overview, Contracts, Workforce, Site dashboards, Snag register, Holds and releases, Site alerts, Quality control, Tenders, User access, Estimator). It is rendered twice, once for desktop and once inside a collapsed menu on mobile. | `app/admin/layout.tsx` lines 42 to 52 and 59 to 69 | High |
| N-2 | Installers and lead installers get the same office navigation and land on the office overview, which is a contract list with static warnings. Nothing tells them where to be today. | `layout.tsx` line 39 (`!supervisor` branch), `app/admin/page.tsx` | High |
| N-3 | Five destinations show overlapping views of the same quality records (Site dashboards, Snag register, Holds and releases, Site alerts, Quality control). A user has to know which one holds the thing they want. | `layout.tsx` lines 45 to 49 | Medium |
| N-4 | The supervisor's site page has six tiles. Two (Variations, Dayworks) lead to a page that says the feature "will be added in the next delivery stage". | `supervisor/sites/[id]/page.tsx` lines 80 and 81, `commercial/page.tsx` | Medium |
| N-5 | The supervisor sees a list of drawings and documents on the site page with no way to open them. | `supervisor/sites/[id]/page.tsx` lines 172 to 174 | Medium |
| N-6 | The "next action" is calculated twice and differently. `nextAction()` in `site-day.ts` (line 170) is tested but the page uses its own inline version (page.tsx line 63). The office has no equivalent at all. | `site-day.ts`, `site page.tsx` | Medium |
| N-7 | Reaching the same record takes a different path per role. A supervisor reaches a hold from a site tile, the office from "Holds and releases", the owner from "Quality control". | `layout.tsx`, `supervisor/**` | Low |

### Hidden actions

| ID | Finding | Evidence | Sev |
| --- | --- | --- | --- |
| A-1 | The mobile office navigation is inside a collapsed `<details>`. The only way to move between sections on a phone is to open a menu first. | `layout.tsx` lines 56 to 57 | High |
| A-2 | On the contract page, allocating an installer and uploading a document are inside collapsed sections. Both are required to make a job usable on site. | `contracts/[id]/page.tsx` lines 146 and 167 | Medium |
| A-3 | The supervisor's secondary links ("Messages", "History", etc.) sit inside a collapsed section. | `supervisor/sites/[id]/page.tsx` line 156 | Low |
| A-4 | Raising a stop and raising a snag are two separate flows with overlapping fields (location, photo, note). The stop-work button is clear; the snag button is one of six tiles. | `components/holds/hold-form.tsx`, `components/snags/create-snag.tsx` | Low |

### Tasks without a responsible person

| ID | Finding | Evidence | Sev |
| --- | --- | --- | --- |
| R-1 | The office overview shows warnings per contract ("missing locations", "no documents") with no person, no date and no order. | `app/admin/page.tsx` lines 46 to 60, `summary.ts` `contractWarnings` | High |
| R-2 | An ordinary snag that has been raised but not given to a gang has no owner and no reminder. It sits in the register until someone looks. | `snags.ts` states; no rule or screen surfaces it | High |
| R-3 | A tender enquiry stays "received" forever. The inbox only lists `status = received` and has no way to record a reply, decline or outcome. | `app/admin/tenders/page.tsx` line 13 | Medium |
| R-4 | Subcontractor insurance is recorded and summarised (30 day warning) but nothing stops, or even flags, a plan for a company whose cover has expired. `plan_allocation` does not check it. | `companies.ts`, `site_allocations.sql` line 219, no other reference in migrations | High |
| R-5 | The overview says "Owner acceptance with a recorded reason is required before mobilisation" for a margin below target, but I found no table, function or form that records that acceptance. The control is described, not implemented. | `app/admin/page.tsx` line 58; no match in `supabase/migrations/` | High |
| R-6 | A person added on site as "provisional" needs office confirmation. There is a place to do it but nothing prompts the office. | `components/office/workforce-view.tsx`, `unplanned-form.tsx` | Medium |
| R-7 | Where a job has no supervisor allocated, supervisor-facing steps have no recipient and nothing says so. | `contract_assignments`, `layout.tsx` | Medium |

### Missing office to site handoffs

| ID | Finding | Evidence | Sev |
| --- | --- | --- | --- |
| H-1 | Planned allocations are readable only by supervisors and above. A subcontractor cannot see what the office planned for their gang, so the office's instructions cannot reach them from the plan. | `site_allocations.sql` line 191 (`planned_allocation_read` uses `can_supervise_contract`) | High |
| H-2 | Morning-check problems go to "Site alerts". The office must remember to open that page. Nothing appears on their own landing screen. | `app/admin/alerts`, `layout.tsx` | High |
| H-3 | The supervisor's handover exists (`finish` page) but the office is not prompted to read it. | `supervisor/sites/[id]/finish/page.tsx` | Medium |
| H-4 | When a gang finishes a stop-work correction there is no prompt to the office. It appears in "Holds and releases" only for people who go there. | `holds/page.tsx` | Medium |
| H-5 | Failed mandatory inspection blocks release, but the person who must fix and re-check it is not told. | `work_holds.sql`, `inspections.ts` | Medium |

### Repeated data entry

| ID | Finding | Evidence | Sev |
| --- | --- | --- | --- |
| D-1 | The office plans a gang onto a location (`planned_allocations.team_id`) and separately allocates each installer to the package (`package_assignments`). If the second is forgotten the installer cannot see the job. Two saves for one intention. | `plan-form.tsx`, `contracts/[id]/page.tsx` line 146 | High |
| D-2 | Setting up a job takes five separate screens: create the contract, add locations, upload documents, allocate a supervisor, plan work. No screen shows what is left. | `contracts/new`, `locations`, `plan`, `[id]` | High |
| D-3 | For each location and activity the office must decide whether a mandatory inspection applies. Until then work is not released. There is no prompt to decide, so the first sign is a supervisor who cannot proceed. | `work_holds.sql` line 499, `inspections.ts` `requirementInput` | High |
| D-4 | A hold and a snag each re-ask for location, activity and evidence the supervisor has just been looking at. | `hold-form.tsx`, `create-snag.tsx` | Low |

### Jargon

| Today | Plain English used in the prototype |
| --- | --- |
| Holds and releases | Stopped work |
| Hold, safety stop-work | Stop work (safety) |
| Hold, quality | Stop work (quality) |
| Release | Restart work here |
| Awaiting release | Waiting for the office to check |
| Correction submitted | Fix sent |
| Rectification submitted, re-inspection | Repair sent, needs checking |
| Applicability | Does this need a mandatory inspection? |
| Work package | The job for one location |
| Planned vs actual | What was planned, what happened |
| Allocation | Who is planned where |
| Workforce | Who is on site (supervisor), Labour (office) |
| Quality control | Folded into Today and Risks |
| Site alerts | Folded into Today |
| Operative, provisional | Person, not yet confirmed |
| Principal-contractor acknowledgement | Principal contractor's name and reference |

## 1.4 Backend capability inventory

This is the list the prototype is held to. "Built" means the table, function and permission exist now.

| Capability | Status | Notes |
| --- | --- | --- |
| Locations tree, work packages, package access | Built | |
| Plan work (`plan_allocation`), cancel, supersede | Built | No insurance check (R-4) |
| Confirm planned gang on site, absences, finish times | Built | Supervisor only |
| Morning checks (11 questions, problems to alerts) | Built | `morning-checks.ts` |
| Location inspections, templates, requirements | Built | Applicability is a per-location decision |
| Snags with full lifecycle, independence, photos | Built | |
| Stop work with release review, independence | Built | |
| Office messages, acknowledgements, QA requests | Built | |
| Site handover | Built | |
| Subcontractor companies, insurance, accreditation | Built | Append-only |
| Document revisions (private storage), upload by installers into their areas | Built | |
| Contract budget and margin | Built | Original budgets only |
| Estimator | Built | `app/admin/estimator` |
| Tender inbox (list and documents) | Built, read-only | No status change |
| A gang reading its own plan | Not built | RLS blocks it (H-1) |
| Gang progress message to supervisor | Not built | |
| Owner acceptance of low margin | Not built | UI text promises it (R-5) |
| Variations and dayworks | Not built | Supervisor page says so |
| Payment claims, retention, actual costs | Not built | |
| Tender outcome (replied, declined, won) | Not built | |

## 1.5 Permission matrix as implemented

| | Owner | Office (money) | Office (no money) | Supervisor | Lead or subcontract installer |
| --- | --- | --- | --- | --- | --- |
| See jobs | all | allocated | allocated | allocated | packages only |
| See budgets and margin | yes | yes | no | no | no |
| Plan work, set up jobs | yes | yes | yes | no | no |
| Read planned allocations | yes | yes | yes | yes | **no** |
| Confirm who is on site | yes | yes | yes | yes | no |
| Raise stop work or snag | yes | yes | yes | yes | snags in their areas |
| Release a stop | yes, not the raiser or corrector | yes, same | yes, same | no | no |
| Re-inspect a repair | office | office | office | yes, not the repairer | no |
| Upload documents or photos | yes | yes | yes | yes | into allocated areas |
| Tender inbox | yes | yes | yes | no | no |

## 1.6 Opportunities to determine the next action automatically

Every row below is derived from records that already exist. None needs a new table. Section 4 turns them into rules.

| Moment | Saved fact that already tells us what is next |
| --- | --- |
| Start of day | No `supervisor_inspections` row today for a job with a plan covering today |
| Gang arrives | A `planned_allocations` row covers today with no `actual_allocations` or absence |
| A stop is raised | `work_holds.status = active` with no assigned team |
| A gang finishes a fix | `correction_submitted`, then `awaiting_release` |
| Inspection needed | A `location_inspection_requirements` row of `required` with no passing inspection |
| Applicability unknown | A plan within the next 7 days with no requirement row |
| Snag raised | `supervisor_issues.snag_status = open` with no `assigned_team_id` |
| Repair sent | `rectification_submitted` and `rectified_by` is known, so independence can be applied |
| Job being set up | No locations, no supervisor, no specification, no plan |
| Cover expiring | `company_insurances.expires_on` (latest per type) |
| Margin below target | `budgetSummary` against `target_margin` |

## 1.7 Risks the redesign must not introduce

| Risk | Safeguard in the design |
| --- | --- |
| A tidy screen hides a mandatory control | Gates are never dismissible and never auto-completed. Section 4. |
| "One next action" nudges people to skip the safer action | Priority puts safety stops first, then release, then quality gates, before any reminder. |
| Simplified wording changes meaning | The words are screen labels only. Stored values and audit text are unchanged. |
| A new role view leaks money | Money is filtered in the rules before any screen sees it. Smoke test checks every screen. |
| Independence is shown but not enforced | The prototype shows the database rule. It adds no new bypass. |
| New screens duplicate business logic | The real build calls existing functions. No calculation is re-implemented. |
