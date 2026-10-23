# 4. Next Action rules and responsibility matrix

There is **one** rules engine, in `lib/operations/next-actions/` (`rules.ts` is the whole catalogue, `engine.ts` turns it into a list for a person). Everything that shows a "next action" uses it: the supervisor Today page in the real app (behind `FEATURE_NEXT_ACTIONS`) and this prototype, which loads the same code bundled by `scripts/build-preview-engine.mjs` into `prototype/engine.js`. There is no second copy of the logic. A test fails if the prototype stops using the bundle, and `npm run preview:check` fails if the bundle is out of date.

The engine is a pure function of a saved-data snapshot. The loader (`snapshot-data.ts`) reads existing tables with the signed-in user's own access and reuses existing functions (`siteDayFor`, `siteStatusFor`, `companyRecordsFor`, `inspectionHasBlockingFailure`, `budgetSummary`). It adds no stored state and changes no schema. The old `nextAction()` in `site-day.ts` stays only as the flag-off fallback and is deprecated.

## 4.1 Principles

1. **Derived, not stored.** An action exists because of a saved record. It disappears only when that record changes. There is no "mark as done" and no separate task table. This cannot drift from the truth and has nothing to migrate.
2. **Read-only.** The engine exposes no function that approves, releases, authorises or writes. A test asserts it.
3. **Every action says**: the job and location, who is responsible (role and name where known), a plain instruction, priority, due date, what you will need, when it is finished, what happens next, and which saved record it came from.
4. **Gate, alert or reminder** (below). Never mixed up, and an alert never pretends to be a gate.
5. **Nobody is invisible.** If the person who should act cannot be found (for example no supervisor on the job), the office gets a set-up action to fix that.
6. **Honest when idle.** If nothing needs you, the screen says so. It does not invent work.

## 4.2 Gate, alert or reminder

Review point 4 asked us not to imply the database blocks something when it does not. The classes are therefore defined by what the **database really does**, not by how serious the topic sounds.

| | **Required step** (`gate`) | **Needs attention** (`alert`) | **Reminder** |
| --- | --- | --- | --- |
| What it is | A step of a control the database enforces | Serious, prominently escalated, but **not** enforced by the database | A nudge or a required daily record |
| Rules | G01 to G08, G10 | A01 critical snag unassigned, A02 insurance expired | Everything else, including critical-snag repairs (S03) |
| `enforcedByBackend` | Always `true` | Always `false` | `false` |
| `blocks` text | Always says exactly what the database stops (a location and activity, never "all work") | Always `null` | `null` |
| Shown with | "Required step" and the real consequence | "Needs attention" and an honest note (see below) | "Reminder" |
| Hero treatment | Standard | Distinct alert colour, and an alert banner at the top for people who are not the one to act | Standard |
| Dismiss or snooze | Never | Never | Never. It goes away when the record changes |
| Can the system complete it | No | No | No |

Honest wording the screen uses:

- **A01** "A critical defect does not stop any work by itself. It goes to the office to choose who fixes it."
- **A02** "TileSpec does not stop work being planned for this company. Please update the certificate before they come on site."
- **Gates** state what is stopped: "Work stops for this location and activity until..." Only that location, only that activity.

The engine never approves an inspection, releases a hold, authorises work or bypasses a permission. A pass saved by a supervisor does not release a stop. A release by the office does not pass an inspection.

## 4.3 Rule catalogue

Priority: 0 safety, 1 quality or compliance gate, 2 required action, 3 housekeeping. "Act" = can complete it. "See" = sees it as waiting on someone else.

### Required steps (gates, enforced by the database)

| ID | Fires when (saved data) | Responsible | Act | See | Due | Finished when |
| --- | --- | --- | --- | --- | --- | --- |
| G01 | Safety stop `active` with no fixer | Supervisor or office | Supervisor, office | Owner | now | Gang, instruction and date saved |
| G02 | Quality hold `active` with no fixer | Supervisor or office | Supervisor, office | | now | Same |
| G03 | Stop `active` with a gang assigned | The gang | Subcontractor | Supervisor, office | target date | Correction with photos saved |
| G04 | Stop `correction_submitted` | The gang | Subcontractor | Supervisor, office | | Release review requested |
| G05 | Stop `awaiting_release` | Office or owner, **not the raiser, not whoever submitted the fix**, no critical defect open | Office, owner | Supervisor, subcontractor | | Release or send-back saved |
| G06 | A required inspection's latest result has a blocking failure | Supervisor | Supervisor | Office | | A later passing inspection saved |
| G07 | Mandatory inspection required, planned today, none saved | Supervisor | Supervisor | Office | today | A passing inspection saved |
| G08 | A plan in the planning horizon has no applicability decision | Office | Office | Supervisor | plan start | Decision saved. "Not sure" leaves it open |
| G10 | Snag `rectification_submitted` | Supervisor (office if critical or escalated), **not the repairer** | Supervisor, office | Subcontractor | | Accepted or sent back |

### Alerts (prominent, not enforced)

| ID | Fires when | Responsible | Act | See | Done when | What it does **not** do |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Critical snag `open` with no gang | Office | Office | Owner, supervisor | Gang and date saved | Does not stop any work. A critical snag on its own never stops a location, let alone a job |
| A02 | A gang on site or planned within the horizon has expired cover (latest entry per type) | Office | Office | Owner, supervisor if on site | New certificate saved (a new record, the old one stays) | The database does **not** refuse `plan_allocation` for expired cover (see B7). It is a rule people follow |

### Reminders

| ID | Fires when | Responsible | Act | See | Done when |
| --- | --- | --- | --- | --- | --- |
| R01 | Plan covers today and no morning check saved | Supervisor | Supervisor | Office after the configured offset (4.7) | Check saved |
| R02 | Earlier work with no finish time | Supervisor | Supervisor | Office | Finish time saved |
| R03 | A planned gang is not confirmed or absent today | Supervisor | Supervisor | Office | Confirmed or absent saved |
| R04 | A provisional person exists | Office | Office | Supervisor | Person confirmed |
| R05 | Instruction needing acknowledgement unread, and not replaced or withdrawn | The recipient | Recipient | Office | Acknowledged. An **urgent** one is titled "Urgent:" and sits above everything except safety stops; a changed one is titled "Changed:" and names the one it replaces (M2) |
| R06 | Work today and no handover | Supervisor | Supervisor from the configured reminder time | Office from the configured offset | Handover saved |
| R07 | A fix is past its date | Office | Office | Supervisor, owner after the configured days | Fix submitted or new date saved |
| R08 | Live job missing locations, supervisor, specification or plan | Office | Office | | One action per missing step, in that order |
| R09 | Plan has no checklist for that activity | Office | Office | Supervisor | Checklist published |
| R10 | Plan names a gang whose login has no package access | Office | Office | | Access saved. **Entered twice today (D-1)** |
| R11 | Cover expires within the warning period | Office | Office | | New certificate saved |
| R13 | Ordinary snag `open` with no gang | Office | Office | Supervisor (waiting on the office) | Gang, repair instructions and date saved. One owner: the supervisor reports, the office decides who fixes it (confirmed by the owner). A supervisor can still assign it from the snag page |
| R14 | Budget margin below target | Owner | Owner (information only, no button) | Office with money | Nothing to press. Owner acceptance needs B3 |
| R15 | Responsibility proposed or disputed | The gang, then office if disputed | Subcontractor, office | Supervisor | Accepted, disputed or decided |
| R16 | Office QA request not yet answered and not withdrawn | The supervisor it was sent to | That supervisor | Office | Result sent back |
| R18 | Inspection result with problems not yet reviewed (M3) | Office | Office, owner | Supervisor (waiting on the office) | Office review saved |
| R19 | Handover with problems or notes for the office not yet reviewed (M3) | Office | Office, owner | | Office review saved |
| S03 | Snag assigned to a gang (critical or not) | The gang | Subcontractor | Supervisor, office | Repair submitted with photo |

Changes from the first draft: G09 became **A01**, G13 became **A02** (both are alerts, not gates). G11 became **R15** and G12 became **R16** (they are reminders: the database does not stop anything while they are open). **R12 (new tender) was removed** because a tender's outcome cannot be recorded today (B5), so it could never be completed. Tenders stay a read-only list.

## 4.4 Responsibility matrix

Who does what across the parallel processes. `A` = acts, `S` = sees, `—` = does not see. A person barred by independence sees it as "Blocked" with the reason.

| Process | Step | Owner | Office | Supervisor | Subcontractor |
| --- | --- | --- | --- | --- | --- |
| Stop work | Raise | A | A | A | — |
| | Choose the fixer | S (safety) | A | A | — |
| | Fix and send photos | — | S | S | **A** |
| | Ask for the check | — | S | S | **A** |
| | Decide release | A* | A* | S | S |
| Snag | Raise | A | A | A | A in their areas |
| | Choose the gang | — | **A** | S (can still assign on the snag page) | — |
| | Critical review | S | **A** | S | — |
| | Repair | — | S | S | **A** |
| | Re-inspect | — | A† | A† | S |
| Inspection | Decide applicability | — | **A** | S | — |
| | Do mandatory inspection | — | S | **A** | — |
| | Do an office QA request | — | S | **A** | — |
| Daily site | Morning checks, people, handover | — | S | **A** | — |
| | Chase a late fix | S (after 3 days) | **A** | S | — |
| Job set-up | Locations, supervisor, spec, plan, access, checklist | — | **A** | S | — |
| Compliance | Insurance | S | **A** | S (on site) | — |
| Tender | Review, reply | — | **A** | — | — |
| Money | See budgets | A | A if money access | — | — |

\* Independent of the raiser and of whoever submitted the fix. Not while a critical defect is open on that work. For a safety stop the principal contractor's name and reference are required.
† Not the person who did the repair. Critical or escalated repairs: office only.

### Independence rules

| Rule | Enforced in the database today? | Where the prototype applies it |
| --- | --- | --- |
| Releaser is not the raiser | Yes, `work_holds.sql` 320, 355, 367 | G05 `independence.forbidden` (shown as Blocked, never as ready) |
| Releaser is not whoever submitted the correction | Yes, same functions | G05 |
| Re-inspector is not the repairer | Yes, snag lifecycle | G10 |
| Critical or escalated repairs are checked by the office | Yes | G10 audience |
| Release needs no open critical defect | Yes, release status | G05 `blockers` |
| Owner and office are treated the same for release | Yes | G05 |
| Insurance expired blocks planning | **No** | A02 is an alert with `enforcedByBackend: false` and `blocks: null` |

## 4.5 Priority and ordering

1. Actionable items above waiting or blocked ones.
2. Priority: 0, 1, 2, 3.
3. `order`: preserves the order of the existing `nextAction()` in `site-day.ts`: safety, release, quality, failed mandatory, critical, re-inspection, disputed, overdue, checks, earlier work, confirm, issues, inspection due, monitor.
4. Gate, then alert, then reminder at the same order.
5. Earlier due date, then id, so the list never reshuffles randomly.

A deterministic, tested order means two people looking at the same job see the same top action.

### The queue (review point 8)

`buildQueue()` splits the sorted list into: the **main button** (the first ready action only), **Then** (every other ready action, never truncated), **For your information** (information-only items such as a low margin), **Risks and exceptions** (owner only: gates, alerts and overdue items they cannot act on), **Waiting on others** and **alerts** for items the viewer does not act on. Every action appears in exactly one list, and a test proves nothing is dropped. Information-only items never become the main button, and they are never counted as work to do or as a risk that has been cleared. The idle heading never says "you are up to date" while a restriction is still active.

## 4.6 Parallel processes

Daily site inspections, stop work and snags are different record streams. They never block each other:

- Each process produces its own actions with its own ids (`morning:c1:2026-10-15`, `inspection-due:pa1`, `hold-fix:h2`).
- A gate blocks only its own location and activity. A stop at Flat 32 does not stop Flat 31.
- Several can be in flight at once. A supervisor can have a failed inspection, an unacknowledged instruction and a late handover. The list shows the highest first and the rest in order.
- Completing one never completes another. A test checks parallel actions coexist with no duplicate ids.

### Variations, dayworks, payment claims (not built, no actions)

These processes have no tables today (B4, B6). **No rule or Next Action exists for them** in the engine or the prototype; the earlier draft's V01 to V04 and P01 to P04 proposals were removed. They return as actions only when the matching records exist, each with its own approval. A test fails if any variation, daywork, claim or margin-approval action appears.

Variations and dayworks are essential commercial functions, so each job keeps a way in through its secondary navigation (Today → More, the original dashboard's site details, the office job page). The link and the page both say "Not built yet": the page tells the supervisor what to do today and lists what the record will hold. It has no form or button, so nothing can look submitted. A test enforces this. The proposed records and their next actions are in [11-two-way-communication.md](11-two-way-communication.md).

## 4.7 Timings and thresholds (configurable, review point 5)

Nothing is a fixed clock time. Reminder times are **derived from the job's working hours**.

- Each contract already stores free-text `working_hours`, for example "07:30 to 16:30", "7.30am until 4.30pm" or "0700-1530". `resolveTimings()` reads it.
- If a job has none, or the text cannot be understood, the company default working day is used (07:30 to 16:30).
- The reminder times are offsets from that day, held in `NextActionConfig` (`config.ts`).

| Setting | Default | Environment variable | Used by |
| --- | --- | --- | --- |
| Default working day start | 07:30 | `NEXT_ACTIONS_WORKDAY_START` | fallback |
| Default working day end | 16:30 | `NEXT_ACTIONS_WORKDAY_END` | fallback |
| Office sees missing morning checks | start + 150 min | `NEXT_ACTIONS_MORNING_OFFICE_AFTER_START_MIN` | R01 |
| Supervisor reminded to hand over | end - 90 min | `NEXT_ACTIONS_HANDOVER_REMINDER_BEFORE_END_MIN` | R06 |
| Office sees missing handover | end + 60 min | `NEXT_ACTIONS_HANDOVER_OFFICE_AFTER_END_MIN` | R06 |
| Cover warning | 30 days (existing `EXPIRY_WARNING_DAYS`) | `NEXT_ACTIONS_INSURANCE_WARNING_DAYS` | R11 |
| Planning horizon | 7 days | `NEXT_ACTIONS_PLAN_HORIZON_DAYS` | G07, G08, R09, R10, A02 |
| Job set-up lead time | 21 days | `NEXT_ACTIONS_JOB_SETUP_LEAD_DAYS` | R08 |
| Overdue fix escalates to owner after | 3 days | `NEXT_ACTIONS_OVERDUE_ESCALATES_AFTER_DAYS` | R07 |
| How far back results and handovers are offered for review (R18, R19), or listed under "From site" before office reviews are installed | 7 days | `NEXT_ACTIONS_SITE_UPDATE_DAYS` | Office Today |

For a "07:30 to 16:30" job the offsets give 10:00, 15:00 and 17:30, but those numbers are an output, not an input. A job on "06:00 to 14:00" gets 08:30, 12:30 and 15:00. Invalid environment values are ignored (the default stays). Changing any value changes **reminders and who sees them only, never a gate**. A test asserts that no `HH:MM` literal appears in `rules.ts` or `engine.ts`.

A settings screen would need somewhere to store values. That is a schema change and is deferred.

## 4.8 Process flows

```
Stop work     raised -> choose fixer -> gang fixes -> gang asks for check -> office decides (independent) -> restart, or back to the gang
Snag          raised -> choose gang -> gang repairs -> supervisor re-inspects (not the repairer) -> closed, or back
              critical: office reviews first, office re-inspects
Inspection    applicability decided (office) -> checklist published (office) -> inspect (supervisor) -> pass clears, fail blocks until a later pass
Daily site    morning checks -> confirm gangs -> work -> finish times -> handover
Job set-up    locations -> supervisor -> specification and drawings -> plan -> checklists -> access
Tender        received -> look (read-only list)                          (reply, decline and outcome need B5)
```

## 4.9 Backend gaps

| ID | Gap | Why it matters | Notes |
| --- | --- | --- | --- |
| B1 | A gang reads its own plan for today (a narrow security-definer function) | Subcontractor Today | Returns location, activity, instructions, address, hours, contact, supervisor name, operational documents. No money. No other gang |
| B2 | A gang's progress message to the supervisor | "Tell the supervisor" is **not shown** until this exists | Could reuse the office-message table in the other direction |
| B3 | Owner acceptance of a low margin, with reason, in the audit trail | The overview already promises it (R-5) | |
| B4 | Variations and dayworks | Nothing is shown until these exist | Large: record, price, approval |
| B5 | Tender status (replied, declined, won) | The inbox never shortens | Small |
| B6 | Payment claims, retention, actual costs | Money and V/P rules | Large |
| B7 | Optional: refuse or warn on `plan_allocation` when cover is expired | Closes finding R-4 as a control, not only a reminder | Business decision |
| B8 | Optional: granting package access from a plan | Removes double entry D-1 | Touches permissions, needs explicit approval |

Nothing in B1 to B8 is assumed to exist. None is part of the first build, and no screen offers a control that depends on one.
