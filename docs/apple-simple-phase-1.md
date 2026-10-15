# TileSPEC Admin — Apple-simple phase 1

Status: audit and clickable prototype only. Review is required before implementation.

Prototype: [`/prototype/apple-simple`](/prototype/apple-simple)

The prototype uses fictional sample data, makes no Supabase calls and changes no
records. It intentionally sits outside the authenticated admin layout so every role
can be reviewed without changing memberships. It is excluded from search indexing.

## 1. Existing workflow audit

### What is already strong

- Authentication fails closed and derives membership from
  `organisation_members`, not user-supplied claims (`lib/auth.ts`).
- PostgreSQL row-level policies scope records by organisation, contract and package.
  Commercial rows are separately protected; installer roles cannot read unrelated
  work or financial records (`supabase/migrations/20261010090000_operations_foundation.sql`).
- Mutations use checked functions, optimistic versions and idempotency keys. Audit
  events record the real actor, timestamp and changed fields.
- Documents are private, immutable revisions. The server verifies type, size,
  uploader and content hash before marking a file uploaded.
- Site operations preserve planned and actual allocations, attendance, deviations,
  inspections, evidence, snags, holds, corrections, release decisions, office
  instructions and handovers. Failed inspections and previous hold states are not
  overwritten.
- The supervisor dashboard already calculates a genuine next step from saved data:
  morning checks, stale work, workforce confirmation, QA requests, then workmanship
  checks (`app/admin/supervisor/sites/[id]/page.tsx`).

### Where the current experience breaks the three-second test

| Finding | Evidence | Effect |
| --- | --- | --- |
| Too many equal-priority destinations | The office desktop navigation exposes up to ten links in `app/admin/layout.tsx`. | Users must understand the software structure before choosing work. |
| Mobile navigation starts with structure, not responsibility | “My sites” plus an “Office menu” containing the same long list. | The most important action is not consistently first. |
| A job is split across many destinations | Contract, locations, plan, planned-v-actual, site dashboard, quality, holds, snags, alerts and documents. | Office staff repeatedly reselect the same job and lose context. |
| One contract page carries too many jobs | `app/admin/contracts/[id]/page.tsx` combines setup, 16 contract fields, budget, packages, allocations, files and audit history. | It is difficult to see what is incomplete and what to do next. |
| Quality is represented in four registers | Quality control, holds, snags and site alerts are separate primary destinations. | A user must know whether a problem is an alert, snag, inspection failure or hold. |
| Labels expose implementation language | “Contract register”, “work packages”, “actual allocations”, “document revisions”, “QA submissions”, “release snapshots”. | New staff need product training before completing ordinary work. |
| Responsibility is often implied | Contract warnings and quality counts identify missing or blocked records but commonly omit a named owner and due date. | Work can remain visible without being owned. |
| Office-to-site handoff is partial | Instructions and QA requests have recipients and optional due dates, but contract setup gaps and document needs do not create assigned actions. | Office completion and site readiness are not joined into one queue. |
| Subcontractor journey is not daily-work focused | Installer roles are directed to a large contract page; site screens return a message that allocated work is elsewhere. | Address, today’s allocation, instruction and paperwork are not presented together. |
| Owner view mixes administration and decisions | The owner receives the same operational navigation as office users, plus user access and financial tools. | Exceptions, margin and approvals compete with setup tasks. |
| Tender is an inbox, not a tender workflow | `app/admin/tenders/page.tsx` reads received enquiries and files only. | Qualification, estimating, review, submission and conversion have no persisted lifecycle. |
| Financial workflow is only an original budget | The current schema stores value, original allowances, contingency, target margin, terms and retention. | Actual costs, variations, claims, notices, certificates and cash forecasting must not be presented as working features. |
| Duplicate context entry remains possible | Locations, stage, package and team are selected in multiple plan, inspection, snag and hold forms. | Users can re-enter context that could be carried from the originating action. |
| Saved state is inconsistent across surfaces | Site forms explain retries and pending files, but registers do not use one shared saved/pending/blocked/completed language. | Users cannot infer whether work is safely stored or waiting. |

### Repeated entry to remove

1. Carry job, location, stage, package and responsible person from a next action into
   its form; never ask for them again unless the user deliberately changes scope.
2. Build attendance from the saved plan and ask only about differences.
3. Start snag and hold reports from the current inspection or location.
4. Start QA submission from the office request and require the exact subsequent
   inspection already enforced by the database.
5. Reuse contract address, contact, access, hours and current operational documents
   in the site and subcontractor day views.
6. Reuse actual attendance in end-of-day handover, as the existing handover function
   already does.

### Plain-English language

| Current term | Surface label |
| --- | --- |
| Contract | Job |
| Contract register | Jobs |
| Work area / package | Location / allocated work |
| Planned allocation | Work plan |
| Actual allocation | Work happening today |
| Operative | Person |
| Supervisor inspection | Morning checks |
| Location inspection / QA submission | Check work / send result |
| Snag | Problem or snag |
| Work hold | Work stopped |
| Release request | Ask to restart work |
| Document revision | Drawing or document, with revision shown secondarily |
| Audit event | History |

The underlying record names and legal/quality wording remain unchanged.

## 2. Simplified navigation

Each role receives four persistent destinations. “More” preserves access to
lower-frequency tools without making them compete with today’s work.

| Role | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| Owner | Today | Jobs | Money | More |
| Office | Today | Jobs | Schedule | More |
| Supervisor | Today | Team | Quality | More |
| Subcontractor | Today | Work | Updates | More |

- **Owner Today:** decisions and exceptions only. More contains tenders, people and
  access, settings and history.
- **Office Today:** one assigned queue across tender intake, setup, planning,
  documents and site follow-ups. More contains the existing specialist registers.
- **Supervisor Today:** current site, active restrictions and one next step. More
  contains messages, stop work, snags, history and end-of-day handover.
- **Subcontractor Today:** address, arrival, allocated location, instruction,
  required documents and progress. No unrelated jobs, people or money.

## 3. Screen-by-screen prototype

Open `/prototype/apple-simple`, switch role in the review bar, then use the desktop
sidebar or phone bottom navigation.

### Owner

- **Today:** one margin exception, then only material risk and healthy-state context.
- **Jobs:** sorted by attention rather than alphabetically.
- **Money:** current original budgets only, explicitly stating that actual costs,
  variations and claims are not implemented.
- **More:** lower-frequency administration.

### Office

- **Today:** priority queue with blocking handoffs ahead of reminders.
- **Jobs:** each job summarizes its next setup gap.
- **Schedule:** saved teams, people, locations and stages; incomplete plans surface
  the missing field.
- **More:** tenders, documents, access, quality and estimator.

### Supervisor

- **Today:** site and address, active next action, daily tasks and end-of-day handover.
- **Team:** the saved plan is prefilled; the supervisor records exceptions.
- **Quality:** active stops first, requested checks second, completed evidence last.
- **More:** messages, stop work, snags, history and handover.

### Subcontractor

- **Today:** address, arrival, allocation, current instruction and progress action.
- **Work:** only the signed-in person’s allocated package and context.
- **Updates:** instructions and own saved updates.
- **More:** required paperwork, own documents, report a problem and help.

The prototype demonstrates responsive mobile and desktop layouts, 44–56 px touch
targets, obvious back paths, persistent navigation, reduced-motion support,
progressive disclosure and explicit saved/blocked/complete states.

## 4. Next Action rules and responsibility matrix

### Action shape

A future action projection should be computed from source records, not become a
second manually maintained task database:

```text
source record + stable rule id + job/location + responsible actor or role
+ plain-English instruction + priority + due date + required information
+ completion predicate + next candidate + kind (reminder | required | gate)
```

Deterministic IDs (`rule + source record + actor`) prevent duplicates. Source
records remain authoritative. Parallel lanes are ranked independently, so a daily
inspection does not disappear because a variation or payment action exists.

### Rules that can use current saved data

| Trigger | Next action | Responsible | Kind | Complete when | Then |
| --- | --- | --- | --- | --- | --- |
| No morning check for site today | Complete morning checks | Assigned supervisor | Required | Today’s inspection is saved | Check stale work |
| Earlier actual allocation has no finish | Add the finish time | Supervisor who can supervise site | Required | Allocation is ended or validly corrected | Confirm today’s team |
| Planned work is not confirmed today | Confirm who is on site | Assigned supervisor | Required | Actual allocation/attendance is saved | Check office QA requests |
| Unacknowledged instruction requires acknowledgement | Read and acknowledge instruction | Named supervisor | Required | Append-only acknowledgement exists | Resume prior lane |
| Open QA request | Inspect the named location and stage | Named supervisor | Quality gate input | Exact later inspection is submitted | Office reviews result; no release implied |
| Mandatory inspection due/missing | Inspect before affected work proceeds | Authorised supervisor/inspector | Quality gate | Valid inspection satisfies current requirement | Recalculate work status |
| Failed inspection or active hold | Keep scoped work stopped and correct it | Assigned correction team/person; office monitors | Quality gate | Correction evidence is submitted | Eligible independent person reviews release |
| Hold awaiting release | Review correction and decide | Existing authorised release role only | Quality gate | Explicit saved release/rejection decision | Recalculate only affected scope |
| Planned team missing | Assign team to saved location/stage/dates | Owner or assigned contracts manager | Required | Current planned allocation is complete | Site can confirm plan |
| Pending document upload belongs to actor | Retry the same file | Original uploader | Required | Verified immutable revision has `uploaded_at` | Notify dependent user if an instruction exists |
| End of day and no handover | Finish today | Assigned supervisor | Required | Handover is saved | Tomorrow’s queue |
| Active critical snag | Review and scope a hold if needed | Supervisor/office within existing permissions | Quality gate warning | Snag progresses through saved lifecycle; hold separately decided | Correction/reinspection |
| Expired insurance for a company on site | Tell office and review cover | Office; supervisor is informer | Compliance warning | Valid cover record is saved or workforce is changed | Recalculate site warning |
| Original budget margin below target | Review budget exception | Owner | Decision | Current implementation only supports updating budget; approval record is not implemented | No automatic mobilisation |

### Rules that require later backend work

Do not enable these until their source records, permissions, transitions and audit
events exist:

- tender qualification, estimate review, submission and tender-to-job conversion;
- persistent variation/daywork capture and authorisation;
- actual cost, payment claim, notice, certificate and payment workflows;
- document “current/approved” policy beyond immutable revision history;
- general assigned office actions for setup gaps;
- subcontractor daily-plan read model if current RLS does not expose every required
  planned-allocation field safely.

### Safety invariants

- Reminders may be dismissed or deferred; required actions and gates may not.
- A checklist result never approves an inspection, releases a hold, authorises work,
  certifies payment or changes a permission.
- A passed inspection is not enough where an independent release decision is required.
- Active safety stops outrank all routine actions and remain visible.
- Rules fail closed when required source data cannot be read.
- Every completion predicate is based on a saved server record, never a client-only tick.

## 5. Reusable existing components

| Existing asset | Reuse |
| --- | --- |
| Official SVG (`public/tilespec-logo-animated.svg`) | Header identity |
| Brand tokens in `app/globals.css` | Navy, teal, paper and typography |
| `OperationsForm` | Pending/error/success handling and controlled server actions |
| `ConnectionStatus` | Offline/online warning on site workflows |
| `SiteNav` | Source behavior to replace with four-role persistent navigation |
| `WorkReleaseList` | Scoped location/activity restrictions |
| `WorkforceDay` and site workforce forms | Planned-to-actual attendance behavior |
| `WorkmanshipForm` and inspection forms | Saved template checks and evidence |
| Snag `PhotoUpload`, `CreateSnag`, `WorkCandidates` | Camera and attribution flow |
| Hold create/detail components | Stop, correction and explicit release workflow |
| `AuditHistory` | Advanced “History” disclosure |
| Location picker/tree and office planning components | Job setup and schedule |
| Existing badge, card, form and touch-target CSS | State vocabulary after visual simplification |

Reuse behavior and security contracts first. The prototype CSS is intentionally
isolated; it is not a replacement design system yet.

## 6. Reversible implementation plan

1. **Read-only action projection:** add typed rule evaluators and fixture tests for
   the existing supervisor sequence. No schema or mutation change.
2. **Navigation shell behind a feature flag:** role-specific four-item navigation,
   preserving every old route and direct URL.
3. **Supervisor Today:** compose existing checks, workforce, QA, holds and handover
   into the approved surface. Keep existing pages as fallback.
4. **Office Today and job context:** aggregate existing setup gaps and handoffs.
   Deep-link to existing forms with job/location context.
5. **Owner Today:** show only saved budget exceptions, holds and material risks.
   Do not add an approval button until an audited approval transition exists.
6. **Subcontractor Today:** introduce a least-privilege read model using current
   package assignment rules; security-test financial and cross-job denial.
7. **Shared state language:** standardize saved, pending, blocked and complete
   presentation without changing underlying transitions.
8. **Later workflow slices:** tender lifecycle, variations and payment claims each
   require a separate reviewed schema/API/UI phase. No combined migration.

Every phase keeps existing routes, can be disabled independently, includes an
upgrade/data-preservation test where schema changes eventually become necessary,
and requires explicit review before merge or deployment.

## 7. End-to-end acceptance tests

1. A new office user signs in and sees one highest-priority action in under three
   seconds, opens it, and reaches a pre-contextualized existing form without
   reselecting job or location.
2. The office plans a saved team onto a saved location. The supervisor sees it;
   confirming attendance creates one actual record and a retry does not duplicate it.
3. A supervisor with one site lands directly on Today, completes morning checks,
   and sees the next genuine action. A blocked answer remains visible to office.
4. A supervisor with multiple sites gets a short chooser, then retains that site
   context through team, quality and handover.
5. An active Level 3 hold remains prominent while unrelated Level 2 work continues.
   Completing an inspection does not release Level 3.
6. A named QA request accepts only the assigned supervisor’s later inspection for
   the exact location, stage and package. An issue result is submitted honestly and
   does not become approval.
7. A failed or lost save shows pending/uncertain, retains entered data, and retries
   safely with the same request key.
8. A subcontractor sees only their allocation, address, operational files and own
   updates. Attempts to read another package, commercial document or budget fail.
9. An owner sees a below-target original budget exception but no fabricated actual
   cost, claim or approval status.
10. An expired on-site company insurance record produces a warning; it never
    fabricates a compliance failure outside the recorded policy.
11. A pending document revision is not shown as available. Only the original
    uploader can retry the exact file; verified completion is immutable.
12. Keyboard, screen-reader and 390 px phone tests can reach all four destinations,
    identify the current destination, operate 44 px minimum targets and return from
    every detail screen.
13. Existing records, audit rows, permissions, financial calculations, rejected
    inspections, prior hold events and snag history are byte/row equivalent before
    and after enabling each UI-only phase.
14. Owner, office, supervisor and subcontractor fixture journeys complete without
    using hidden URLs or knowledge of database terms.

