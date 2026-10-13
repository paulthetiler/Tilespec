# Supervisor Operations System V2

Phase 1 architecture assessment, data foundation and delivery plan.
Baseline: `main` at `b4f5704` (13 October 2026). Phase 1 is a database and
permissions foundation only; it adds no screens. The four V2 migrations have
**not** yet been applied to the hosted database; section 2 gives the exact
order and precautions.

The working rule is that the office plans the work, the supervisor confirms or
adjusts it on site, and every record stays attributable. Each piece of work should
be traceable as **contract → location → work package → team/operatives →
inspection → outcome**. An allocation records who was assigned to work at a
location. It is never treated as proof of fault.

## 1. Assessment of the existing Supervisor Hub

**Reuse as it is.** These parts are sound:

- Supabase Auth with owner-controlled membership and five roles.
- RLS helper functions such as `can_manage_contract` and `can_access_contract`.
- Dated supervisor/manager contract assignments.
- Commercial data kept in separate tables.
- Immutable audit events written by triggers.
- Per-actor idempotency keys.
- The verified private-evidence protocol (`document_revisions` with server-side
  hash checks).
- The local PostgreSQL test harness and CI.

The morning check is the best part of the current hub. It saves 10
Pass/Issue/N/A answers with an idempotent request key and only shows "saved"
after the server confirms.

**Extend.** These need more before V2 can build on them:

| Area | Current state | V2 change |
| --- | --- | --- |
| `work_areas` | Flat list per contract | **Phase 1:** becomes the location hierarchy (no parallel table) |
| `package_assignments` | Installer access by login. No dates, and removal deletes the row | Kept unchanged for access. Who actually worked is recorded by the new allocation tables |
| `contract_assignments` | Dated, but a re-allocation overwrites the dates (history survives only in audit) | Unchanged. Each allocation stores the supervisor who confirmed it |
| Morning checks | Fixed labels duplicated in the client and API. Issues cannot create a hold, and the dashboard always says "Start daily checks" | **Phase 2:** severities, holds, next action worked out from saved records |
| Issue register | Only owner/manager may close. Shows contract IDs instead of names | **Phase 4:** decide who closes what (see section 6) |
| `supervisor-evidence` bucket | Direct upload with no hash check and no download route | **Phase 4:** new snag evidence uses the verified `document_revisions` protocol. Existing objects are kept |

**Retire, in a later phase.** Sections 2–4 of `site-workflow-preview.tsx` (area
preparation, installation QA, sign-off) are a client-only prototype. Nothing they
show is saved, and they print "Ready for supervisor sign-off in the future live
workflow". Phase 3 replaces them with location-first inspections. The site picker
always appears, even when a supervisor has only one site. The diary tab is a
placeholder.

**Integrity gaps found and fixed in this PR.** I proved these against a real
database, not by reading code:

1. Through the raw table API, a supervisor could backdate a morning inspection by
   30 days and record `issues_count = 0` even when an answer was an issue.
2. A photo record could point at an object that was never uploaded. That record
   then satisfied the "photographic evidence before closure" rule, and the issue
   closed with no photograph.
3. Private trigger functions created after the foundation migration kept
   PUBLIC execute. This was hygiene only, because `anon` has no schema access.

**Hosted database state.** This environment has no Supabase credentials, so
the following is the owner's report of work done through a separate Supabase
connection. It has not been inspected independently from here.

- The project is `odwysybvncdfdrfnnnqt`, described by the owner as the live
  TileSPEC project. No separate staging rehearsal has been reported.
- The missing prerequisite `20261012040000_supervisor_issues_evidence` has now
  been applied. That created `supervisor_issues`, `supervisor_issue_events`,
  `supervisor_issue_photos`, their creation and closure functions, and the
  private `supervisor-evidence` bucket.
- The first version of the preflight report then showed every prerequisite
  present, no name collisions and no legacy anomalies.

Because the issue register was created only now, it is empty. Two of that
report's evidence checks therefore had no rows to look at, and its clean result
proves less than it appears to. The amended report (section 2) adds two checks
that matter for this history:

- the applying role's access to stored evidence;
- inspections whose issues were recorded before the register existed.

Every V2 migration still checks its prerequisites and refuses to run over drift.

## 2. Database changes and migration risks

All changes are additive. Each migration runs in a single transaction. It checks
that its prerequisites exist and its own objects do not, and stops with
"Preflight failed" otherwise. No existing row is changed except for one backfill:
each existing area gets `path_ids = [id]`.

| Migration | Adds |
| --- | --- |
| `20261014090000_supervisor_records_hardening` | Inspections record server time and an issue count worked out from the answers. Photo records require the stored object; so does closure. Refuses to run if the applying role cannot read stored objects past RLS. Narrows Supabase's default grants on the four supervisor tables: no `anon` access; signed-in users keep only what the app uses (no `TRUNCATE`). Revokes PUBLIC execute on the internal functions. |
| `20261014091000_site_locations` | `work_areas` gains: optional `parent_id`; `path_ids` (the ancestry chain, maintained by triggers); office-defined `location_type`/`code`; `sort_order`, `version`, `archived_*`. Adds `create_locations` (nested bulk creation, up to 2,000 per request, idempotent), `update_location` (rename or move, IDs kept) and `archive_location` (cascades, requires a reason, never deletes). Also shared request validation and a London "today". |
| `20261014092000_teams_operatives` | `operatives` (people, with or without a login; engagement recorded); `teams` (gang, individual, direct, mixed, temporary); `team_memberships` (dated, one lead per period, never rewritten). A shared append-only guard. Office RPCs, plus provisional operatives that supervisors can register. |
| `20261014093000_site_allocations` | `planned_allocations` (+ planned operatives), `actual_allocations` (+ per-person attendance) and `allocation_absences`. RPCs to plan, revise, cancel, confirm, end, move or split, add or remove people, void and record absence. Adds `location_work_history` for attribution. |

**Risks and how each is handled:**

- **The live schema may differ from the repository.** Run the amended preflight
  report first. Any "MISSING" or "ALREADY EXISTS" means stop. The migrations
  refuse to run in that state anyway, and so does any file applied before its
  prerequisite. The upgrade test proves both.
- **The hosted issue register is exposed until hardening is applied.** It is live
  now, with Supabase's default grants and the fabricated-evidence gap from
  section 1. Hardening is first in the order for that reason.
- **The evidence checks depend on the applying role.** They run as the role that
  applies the migration and read `storage.objects`. The hardening migration
  refuses to run unless that role bypasses RLS on `storage.objects`, so a
  mismatch cannot silently break photo uploads. On Supabase the project's
  `postgres` role qualifies; it was able to create the storage policies in
  `20261012040000`.
- **Inspections recorded before the register existed.** Their issues never
  reached the register, because its trigger acts only on new inspections. They
  are preserved and counted by the report, not backfilled. Any backfill is a
  separate owner decision (section 6).
- **Migration history.** A tool that records migrations by its own timestamp
  will not match the repository's filenames. Record each file under its own name.
  Before anyone later uses the Supabase CLI against this project, reconcile
  `supabase_migrations.schema_migrations` with `supabase/migrations`.
- **The `work_areas` change takes a lock.** `ALTER` plus a one-off `UPDATE` hold
  an exclusive lock on `work_areas` for a moment. That is trivial at current
  volumes, but apply in a quiet period.
- **New rule: no duplicate sibling names.** A second *active* location with the
  same name under the same parent is now refused, including through the existing
  `create_work_area`. The app shows its existing "already exists" message.
  Existing duplicates are kept and do not block the upgrade; the preflight
  report counts them.
- **Hardening behaviour change.** Raw API backdating and photo records without a
  stored object now fail. The app's own flows are unaffected. An issue whose only
  "evidence" is such a record can no longer be closed until a real photo is
  uploaded. The preflight report counts these.
- **Permission widening, for review.** An installer can now *read* the location
  rows above and below their package areas, for example "Flat 52 › Bathroom"
  rather than a bare "Bathroom". Their package, document and contract access is
  unchanged, and the upgrade test asserts their visible areas and documents are
  identical.
- **Rollback.** Changes are forward-only. Code on `main` ignores the new objects,
  so an unused migration is harmless. Removing it would mean dropping tables and
  columns, which is destructive and needs explicit approval. Take a backup before
  applying.
- **Time zone.** New logic uses the London calendar date. The foundation's
  contract-assignment checks use the database's `current_date` (UTC), which
  differs between midnight and 01:00 during BST.

**How to apply (after the owner's approval):**

1. Confirm a restorable backup of `odwysybvncdfdrfnnnqt` exists, and take a
   manual export if the plan has no point-in-time recovery. This is the live
   database, with no staging rehearsal.
2. Run the amended `supabase/inspection/supervisor-v2-preflight.sql` as the role
   that will apply the migrations, and keep the full output. Every prerequisite,
   including the storage-access row, must be "present", and every name collision
   "absent (ready)".
3. Apply these files, unmodified, one at a time, in this order, stopping at the
   first error. Each file is all-or-nothing:
   1. `supabase/migrations/20261014090000_supervisor_records_hardening.sql`
   2. `supabase/migrations/20261014091000_site_locations.sql`
   3. `supabase/migrations/20261014092000_teams_operatives.sql`
   4. `supabase/migrations/20261014093000_site_allocations.sql`
4. Re-run the report. Every new object should now show "ALREADY EXISTS" (27
   rows), and the row counts must match step 2.
5. Check the live app: submit a morning check, upload an issue photo, and create
   a work area.

## 3. Permissions model

Permissions are enforced in PostgreSQL (RLS plus security-definer RPCs that
check the actual signed-in member), never by hiding buttons. Tables give
`authenticated` SELECT only. Every write goes through a checked RPC, and every
history table rejects UPDATE/DELETE even from privileged SQL, except for
once-only lifecycle fields (ended, superseded, voided).

| Capability | Owner | Allocated manager | Allocated supervisor | Installer |
| --- | --- | --- | --- | --- |
| Create, move and archive locations | Yes | Yes | No (records against them) | No |
| Read locations | All | Allocated contracts | Allocated contracts | Package areas, plus the rows above and below them |
| Operatives and teams: manage | Yes | Yes (organisation-wide) | Register a provisional operative only | No |
| Operatives and teams: read | All | All | All (needed to confirm attendance) | Self and current gang only |
| Plan, revise or cancel work | Yes | Yes | No | No |
| Confirm, end, move/split, absences | Yes | Yes | Yes | No |
| Void an actual allocation | Yes | Yes | Own records only | No |
| Read allocations and attribution | Yes | Yes | Allocated contracts | **None in Phase 1** |
| Audit history | All | Contract events | Contract events (non-commercial) | None |

**Rules for later phases**, designed now:

- An installer never approves their own rectification. Closure needs an actor
  different from the one who recorded the rectification; this rule already
  exists for issues.
- Installers will see their own team's allocations and snags through
  `private.my_team_ids()`, never another contractor's.
- Commercial deductions live in a separate commercial-boundary table and are
  never written automatically from a snag.
- Employment type never selects a workflow.

Contracts managers cannot read organisation-level audit events (team and
operative changes). Under the existing policy only the owner can (see section 6).

## 4. Planned allocation and historical attribution model

```
planned_allocations ──supersedes──▶ planned_allocations (revision)
      │  team, location, package, stage, dates, instructions
      ├── planned_allocation_operatives (where known)
      ├── allocation_absences (team or person did not attend, with reason)
      ▼
actual_allocations ──previous_allocation_id──▶ actual_allocations (move/split)
      │  location, team, stage, started_at/ended_at, deviations + reason,
      │  confirmed_by, recorded_at, voided_* (record made in error)
      └── actual_allocation_operatives (each person: joined_at, left_at, notes)
```

- **A plan never proves attendance.** Each actual allocation names the people
  present, at least one. Fields left out are taken from the plan.
- **The database computes deviations.** It compares the actual allocation with
  the plan (`unplanned`, `outside_planned_dates`, `location_changed`,
  `team_changed`, `package_changed`, `stage_changed`, `operatives_changed`) and
  then requires a reason. The client cannot supply or suppress these flags.
  Working inside the planned location (a bathroom within the planned flat) is
  not a change.
- **Moving or splitting a gang mid-day is one atomic call.** It ends the current
  allocation at the given time and starts the new ones, each linked back to it.
  People can join (with a note) or leave individually.
- **Nothing is overwritten.** Plan revisions supersede. Actual allocations are
  ended or voided with who and why. Times cannot be silently changed; repeating
  the same end or departure is a safe retry.
- **One place at a time.** Nobody can be recorded at two overlapping times, on
  this site or any other. Combined with idempotent request keys, a retried or
  queued submission (Phase 5 offline) can never create a duplicate; tested with
  two real concurrent connections.
- Recorded and claimed times are separate. `recorded_at` is server time.
  `started_at` may be up to 31 days back, so a late confirmation is visible as
  late.

**Attribution.** `location_work_history(location, from, to)` runs with the
caller's own RLS. It returns every non-voided allocation at the location itself
(`exact`), at anything containing it (`containing`: a flat-wide allocation covers
its bathroom), or within it (`within`). Each row includes the team, the
contractor, the team lead on that date, the people present, the stage, the times,
the plan and any deviation with its reason.

The neighbouring kitchen and records voided as mistakes are excluded. The
results are candidates for the supervisor to confirm, dispute or mark unknown.
In Phase 4 a snag will store a snapshot of the candidates and the chosen
responsibility status, so later corrections never rewrite what was known when
the snag was raised.

**Later phases attach to this model as follows:**

- **Inspection records (Phase 3):** contract, location, package, stage, actual
  allocation (if identifiable), supervisor, checklist specification and revision,
  outcome, notes, verified photos.
- **QA holds and authorised exceptions (Phase 3):** scoped to a location and
  stage.
- **Snags (Phase 4):** reference and classification; links to the inspection and
  location; attribution snapshot; responsibility `suggested`, `confirmed`,
  `disputed` or `unknown`; rectification by the team; independent reinspection;
  escalation history. Commercial referral sits in a separate commercial-boundary
  table and is never automatic.
- **Daily report (Phase 5):** derived from the records above. It stores only the
  supervisor's additions and the submission.

## 5. Implementation PRs

| PR | Scope | Status |
| --- | --- | --- |
| **1 (this)** | Phase 1: hardening, locations, teams, allocations, attribution, preflight report, tests. Each migration is its own commit | Draft. Stop for review before any hosted migration |
| 2a | Office setup: location builder (bulk flats/rooms), teams and operatives, planning board | In review (section 8) |
| 2b | Supervisor dashboard: auto-open a single site, next action from saved records, morning checks with severities and holds, allocation confirmation (confirm, amend, move, split, absent), office planned-vs-actual view | Phase 2 |
| 3a | Inspection requirements: specification revisions, conditional checklists (wet areas only where specified), mandatory hold points, authorised exceptions | Phase 3 |
| 3b | Location-first inspection UI; retire prototype sections 2–4 | Phase 3 |
| 4a | Snag register with verified photo evidence and attribution snapshot | Phase 4 |
| 4b | Installer team-based access, rectification, independent reinspection, disputes and escalation, separate commercial referral | Phase 4 |
| 5a | Pre-filled daily handover and office exception dashboard | Phase 5 |
| 5b | Offline drafts and queued submissions with explicit sync states; tablet and phone usability testing | Phase 5 |

## 6. Decisions that need the owner

1. ~~Which Supabase project, and what is applied?~~ Answered: `odwysybvncdfdrfnnnqt`,
   with the missing prerequisite now applied. Please post the full output of the
   amended report on the PR for the record.
   - **Still open:** if the report counts inspections whose issues never reached
     the register, should they be backfilled? That would be a separate, reviewed
     data change.
2. **Installer hierarchy visibility** (section 2): may installers read the
   location rows above and below their package areas? This PR assumes yes.
3. **Subcontract companies with several gangs.** Should the contractor company
   be its own record, for confidentiality between contractors and for future
   commercial referrals? This PR keeps a `contractor_name` on each team, and
   installers see only their own current gang.
4. **Who closes defects.** The brief lets supervisors close snags within their QA
   authority. The current issue register lets only the owner or a manager close.
   The proposal for Phase 4: a supervisor may close a snag they did not record
   the rectification for; disputed or serious ones go to the office.
5. **Supervisors adding locations on site** (for example, a missing cupboard).
   This PR allows office only; supervisors record against the parent and raise
   an issue.
6. **Minor.** Should managers see the organisation-level audit of team and
   operative changes? Are all sites in the UK (London time)?

## 7. Phase 1 validation

Run locally on 13 October 2026 (Node 22, PostgreSQL 16, Chromium 1194). The
commands match CI.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` (application, invitation, estimator, location helper, stage/deviation sync) | 27 passed |
| `npm run test:db` (real PostgreSQL grants, RLS, RPCs, triggers, concurrency, upgrade) | 332 checks passed (148 existing + 184 new) |
| `npm run build` | Passed |
| `npm run test:browser` | 9 passed, 1 desktop-only skip (phone menu), unchanged |
| `npm run test:forms` | 2 passed |

**New database coverage:**

- Hardening regressions. The suite fails when the hardening migration is
  removed, confirming it detects the gaps.
- Locations: bulk creation, retries, depth and size limits, moves, cycles,
  cross-contract and cross-tenant denial, archival, installer visibility.
- Teams: overlapping membership and lead rules, a transfer between gangs with
  history kept, voiding, provisional operatives, directory visibility by role.
- Allocations through Scenarios A (showroom), B (apartment block: absence,
  replacement, split, move, departure, attribution for the Flat 52 bathroom,
  plan revision) and C (hospital: overlapping teams by stage, an operative on two
  sites).
- Two-connection races.
- An upgrade over legacy data that replays the hosted history: inspections
  recorded before the issue register migration, then the register, then V2. It
  proves:
  - every existing record and an installer's view are unchanged;
  - the preflight report flags the seeded anomalies (including issues that never
    reached the register) and no drift;
  - hardening refuses a role that cannot read stored evidence;
  - the teams and allocations migrations refuse to run before their
    prerequisites;
  - every V2 migration refuses to run a second time.
- Supabase default grants mirrored in the test platform. They prove:
  - no application table or function is open to `anon`;
  - no signed-in user can `TRUNCATE` any table;
  - V2 and issue-register tables are read-only to signed-in users;
  - every security-definer function pins its `search_path`;
  - RLS is on for every public table.

**Not covered in Phase 1:**

- Scenario D (disputes) needs the Phase 4 snag register.
- Scenario E (offline) is covered only at the data layer: idempotent retries,
  duplicate refusal and safe repeats. The client queue is Phase 5.
- QA holds are Phase 3.
- No authenticated hosted journey, Supabase Storage behaviour or deployment was
  exercised from here. No production merge, migration or deployment was
  performed by this work.

## 8. Phase 2A: office management

The four Phase 1 migrations are applied to the hosted project (owner's
report). Phase 2A adds screens only: **no schema change and no migration.**
Every write is a Phase 1 database function called with the user's own session.

| Screen | Where | What the office does there |
| --- | --- | --- |
| Workforce | `/admin/workforce` (owner, contracts manager) | Add teams (gang, individual, direct, mixed, temporary) with a company and lead. Add and end memberships; history is kept. Add operatives with an optional login. Confirm people supervisors added on site. Filter everything by company. |
| Locations | Contract › Locations | Create a numbered series ("Flat 51 to 58") or a list, with rooms inside each, in one step, with a preview. Find a location by typing ("52 bath"). Rename, move or archive. |
| Plan work | Contract › Plan work | Plan a team at a location, with a stage, days, optional named people, a package and instructions. See the week grouped by team. Change (creates a new version) or cancel; history stays visible. |
| Site setup | Contract page | Three steps (locations, teams, plan), with the next one highlighted. |

**Design decisions:**

- **Subcontract companies.** Companies are the existing `contractor_name` and
  `company_name` fields, with suggestions to keep spelling consistent and
  company chips that filter the Workforce screen. A first-class company record
  (contacts, insurance, competence expiry) would need a small additive migration.
  It is left for a reviewed decision, so the PR 2A preview works against the
  database as it is.
- **One way to add locations.** The contract page's old flat "add work area"
  form is replaced by the builder. Its substrate and system notes move to the
  location editor.
- **Plain-English errors.** Errors written for people by the database (for
  example *Another active location here is already called "Flat 52"*) are shown
  as written. Raw PostgreSQL text never is.
- **Naming.** The owner's "Team" navigation link is now "User access", so it
  isn't confused with Workforce.

**Preview caution.** The Vercel preview uses the hosted Supabase project.
Anything created while reviewing is real and, by design, cannot be deleted:
locations archive, memberships end or void, plans cancel. Review against a
clearly labelled test contract.

**Validation.** `npm run test:ui` renders the real screens with fictional
fixture data at iPad portrait (768px), iPad landscape (1180px) and phone
(390px). It fails on any of:

- sideways scrolling;
- a control under 44px;
- a browser console error;
- a failure in any main flow.

The stub actions run the real server parsers, so each flow proves the screen
submits a request the server accepts. Authenticated journeys against hosted
Supabase still need checking on the preview.
