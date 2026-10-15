# 4. Next Action rules and responsibility matrix

The rules are in `docs/redesign/prototype/rules.js` and are tested in `rules.test.mjs` (24 tests, `node --test docs/redesign/prototype/rules.test.mjs`). They read the same record shapes as the real tables. In the real build they would compose existing functions (`work_release_status`, `snag_register`, `hold_register`, `buildSiteDay`, `insuranceSummary`, `outstandingQa`, `unacknowledgedInstructions`) and add no stored state.

## 4.1 Principles

1. **Derived, not stored.** An action exists because of a saved record. It disappears only when that record changes. There is no "mark as done" and no separate task table. This cannot drift from the truth and has nothing to migrate.
2. **Read-only.** The engine exposes no function that approves, releases, authorises or writes. A test asserts it.
3. **Every action says**: the job and location, who is responsible (role and name where known), a plain instruction, priority, due date, what you will need, when it is finished, what happens next, and which saved record it came from.
4. **Gate or reminder** (below). Never mixed up.
5. **Nobody is invisible.** If the person who should act cannot be found (for example no supervisor on the job), the office gets a set-up action to fix that.
6. **Honest when idle.** If nothing needs you, the screen says so. It does not invent work.

## 4.2 Gate or reminder

| | **Gate** | **Reminder** |
| --- | --- | --- |
| What it is | A mandatory compliance or quality control | A helpful nudge or a required daily record |
| Examples | Release review, mandatory inspection, critical defect, re-inspection, applicability unknown, insurance expired | Morning checks, confirm who is on site, handover, chase a late fix, set a job up |
| Can be dismissed or snoozed | **Never** | Not in the first build either. It goes away when done |
| Completed by | Only the named, authorised person, by saving the named outcome | The responsible person saving the record |
| Shown with | "Must be done before work continues" | "Reminder" |
| Ordering | Safety first, then by priority and order, not by kind (see 4.5) | |
| Can the system complete it | **No** | **No** |
| `enforcedByBackend` | Recorded separately. True where a database rule really blocks it (releases, repairs). **False for insurance**: today it is a rule people follow | n/a |

The engine never approves an inspection, releases a hold, authorises work or bypasses a permission. A pass saved by a supervisor does not release a stop. A release by the office does not pass an inspection.

## 4.3 Rule catalogue

Priority: 0 safety, 1 quality or compliance gate, 2 required action, 3 housekeeping. "Act" = can complete it. "See" = sees it as waiting on someone else.

### Gates

| ID | Fires when (saved data) | Responsible | Act | See | Due | Finished when | Backend |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | Safety stop `active` with no fixer | Supervisor or office | Supervisor, office | Owner | now | Gang, instruction and date saved | Built |
| G02 | Quality hold `active` with no fixer | Supervisor or office | Supervisor, office | | now | Same | Built |
| G03 | Stop `active` with a gang assigned | The gang | Subcontractor | Supervisor, office | target date | Correction with photos saved | Built |
| G04 | Stop `correction_submitted` | The gang | Subcontractor | Supervisor, office | | Release review requested | Built |
| G05 | Stop `awaiting_release` | Office or owner, **not the raiser, not whoever submitted the fix**, no critical defect open | Office, owner | Supervisor, subcontractor | | Release or send-back saved | Built |
| G06 | A required inspection's latest result failed | Supervisor | Supervisor | Office | | A later passing inspection saved | Built |
| G07 | Mandatory inspection required, planned today, none saved | Supervisor | Supervisor | Office | today | A passing inspection saved | Built |
| G08 | A plan in the next 7 days has no applicability decision | Office | Office | Supervisor | plan start | Decision saved. "Not sure" leaves it open | Built |
| G09 | Critical snag `open` with no gang | Office | Office | Owner, supervisor | target date | Gang and date saved | Built |
| G10 | Snag `rectification_submitted` | Supervisor (office if critical or escalated), **not the repairer** | Supervisor, office | Subcontractor | | Accepted or sent back | Built |
| G11 | Responsibility proposed or disputed | The gang, then office if disputed | Subcontractor, office | Supervisor | | Accepted, disputed or decided | Built |
| G12 | Office QA request not yet answered | The supervisor it was sent to | That supervisor | Office | due date | Result sent back | Built |
| G13 | A gang on site or planned in the next 7 days has expired cover (latest entry per type) | Office | Office | Owner, supervisor if on site | plan start | New certificate saved (a new record, the old one stays) | Built, **not enforced** |
| S03 | Snag assigned to a gang | The gang | Subcontractor | Supervisor, office | target date | Repair submitted with photo | Built. Gate if critical, reminder otherwise |

### Reminders

| ID | Fires when | Responsible | Act | See | Done when | Backend |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | Plan covers today and no morning check saved | Supervisor | Supervisor | Office after 10:00 | Check saved | Built |
| R02 | Earlier work with no finish time | Supervisor | Supervisor | Office | Finish time saved | Built |
| R03 | A planned gang is not confirmed or absent today | Supervisor | Supervisor | Office | Confirmed or absent saved | Built |
| R04 | A provisional person exists | Office | Office | Supervisor | Person confirmed | Built |
| R05 | Instruction needing acknowledgement unread | The recipient | Recipient | Office | Acknowledged | Built |
| R06 | Work today and no handover | Supervisor | Supervisor from 15:00 | Office from 17:30 | Handover saved | Built |
| R07 | A fix is past its date | Office | Office | Supervisor, owner after 3 days | Fix submitted or new date saved | Built |
| R08 | Live job missing locations, supervisor, specification or plan | Office | Office | | One action per missing step, in that order | Built |
| R09 | Plan has no checklist for that activity | Office | Office | Supervisor | Checklist published | Built |
| R10 | Plan names a gang whose login has no package access | Office | Office | | Access saved. **Entered twice today (D-1)** | Built |
| R11 | Cover expires within 30 days | Office | Office | | New certificate saved | Built |
| R12 | Tender `received` | Office | Office | | Priced, declined or replied | List built. Outcome New (B5) |
| R13 | Ordinary snag `open` with no gang | Supervisor | Supervisor, office | | Gang and date saved | Built |
| R14 | Budget margin below target | Owner | Owner (information) | Office with money | Not recordable. Needs B3 | New (B3) |

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
| | Choose the gang | — | A | A (not critical) | — |
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
| Releaser is not the raiser | Yes, `work_holds.sql` 320, 355, 367 | G05 `independence.forbidden` |
| Releaser is not whoever submitted the correction | Yes, same functions | G05 |
| Re-inspector is not the repairer | Yes, snag lifecycle | G10 |
| Critical or escalated repairs are checked by the office | Yes | G10 audience |
| Release needs no open critical defect | Yes, release status | G05 `blockers` |
| Owner and office are treated the same for release | Yes | G05 |
| Insurance expired blocks planning | **No** | G13 flagged `enforcedByBackend: false` |

## 4.5 Priority and ordering

1. Actionable items above waiting or blocked ones.
2. Priority: 0, 1, 2, 3.
3. `order`: preserves the order of the existing `nextAction()` in `site-day.ts`: safety, release, quality, failed mandatory, critical, re-inspection, disputed, overdue, checks, earlier work, confirm, issues, inspection due, monitor.
4. Gate before reminder at the same order.
5. Earlier due date, then id, so the list never reshuffles randomly.

A deterministic, tested order means two people looking at the same job see the same top action.

## 4.6 Parallel processes

Daily site inspections, variations and staged payment claims are different record streams. They never block each other:

- Each process produces its own actions with its own ids (`morning:c1:2026-10-15`, `inspection-due:pa1`, `variation:…`, `claim:…`).
- A gate blocks only its own location and activity. A stop at Flat 32 does not stop Flat 31.
- Several can be in flight at once. A supervisor can have a failed inspection, an unacknowledged instruction and a late handover. The list shows the highest first and the rest in order.
- Completing one never completes another. A test checks parallel actions coexist with no duplicate ids.

### Variations and payment claims (not built)

These processes have no tables today. The rules below are a proposal for review. **They are not in the prototype's engine and cannot be built without B4 and B6.**

| ID | Fires when | Responsible | Gate or reminder |
| --- | --- | --- | --- |
| V01 | A supervisor records extra work instructed on site | Office | Reminder: price it |
| V02 | A variation is priced and not sent | Office | Reminder |
| V03 | A variation is sent and the client has not answered for N days | Office | Reminder: chase |
| V04 | A variation is not approved and the work has started | Owner | **Gate**: authorise or stop. Needs an explicit authorisation record |
| P01 | A claim stage is reached (for example staged by location complete) | Office | Reminder: prepare the claim |
| P02 | A claim is due on the contract's payment terms | Office | Reminder |
| P03 | Evidence for the stage is incomplete (inspections, handover) | Office | **Gate**: cannot issue a claim for work not passed |
| P04 | A claim is unpaid past terms | Office, owner after N days | Reminder: chase |

## 4.7 Thresholds that need approval

None of these is decided by the business. Changing a value changes reminders only, never a gate. The existing 30-day cover warning (`EXPIRY_WARNING_DAYS`) is reused as is.

| Name | Proposed | Used by |
| --- | --- | --- |
| Office sees missing morning checks after | 10:00 | R01 |
| Supervisor reminded to hand over after | 15:00 | R06 |
| Office sees missing handover after | 17:30 | R06 |
| Cover warning | 30 days (existing) | R11 |
| Plan horizon for checks and applicability | 7 days | G07, G08, R09, R10, G13 |
| Job set-up lead time | 21 days before start | R08 |
| Overdue fix escalates to owner after | 3 days | R07 |

## 4.8 Process flows

```
Stop work     raised -> choose fixer -> gang fixes -> gang asks for check -> office decides (independent) -> restart, or back to the gang
Snag          raised -> choose gang -> gang repairs -> supervisor re-inspects (not the repairer) -> closed, or back
              critical: office reviews first, office re-inspects
Inspection    applicability decided (office) -> checklist published (office) -> inspect (supervisor) -> pass clears, fail blocks until a later pass
Daily site    morning checks -> confirm gangs -> work -> finish times -> handover
Job set-up    locations -> supervisor -> specification and drawings -> plan -> checklists -> access
Tender        received -> look -> estimate -> reply or decline          (outcome needs B5)
```

## 4.9 Backend gaps

| ID | Gap | Why it matters | Notes |
| --- | --- | --- | --- |
| B1 | A gang reads its own plan for today (a narrow security-definer function) | Subcontractor Today | Returns location, activity, instructions, address, hours, contact, supervisor name, operational documents. No money. No other gang |
| B2 | A gang's progress message to the supervisor | "Finished today", "Need help" | Could reuse the office-message table in the other direction |
| B3 | Owner acceptance of a low margin, with reason, in the audit trail | The overview already promises it (R-5) | |
| B4 | Variations and dayworks | Supervisor tiles lead nowhere | Large: record, price, approval |
| B5 | Tender status (replied, declined, won) | The inbox never shortens | Small |
| B6 | Payment claims, retention, actual costs | Money and V/P rules | Large |
| B7 | Optional: refuse or warn on `plan_allocation` when cover is expired | Closes finding R-4 as a control, not only a reminder | Business decision |
| B8 | Optional: granting package access from a plan | Removes double entry D-1 | Touches permissions, needs explicit approval |

Nothing in B1 to B8 is assumed to exist. Each is shown in the prototype with a "New backend" label and none is part of the first build.
