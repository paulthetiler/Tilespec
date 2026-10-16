# 7. Acceptance tests

Two kinds. Section 7.1 lists journeys that are already executed against the prototype (`npm run preview:e2e`, Playwright, 17 journeys). Section 7.2 lists the journeys to run against the real build in each phase. Section 7.3 is the "no training" test with real people.

Section 7.1 also includes the engine's own unit tests (`npm test`, `tests/next-actions.test.ts`), which are the executable form of the review points.

Dates, names and places are the fictional scenario used in the prototype.

## 7.1 Executed against the prototype

| ID | Journey | What it proves | Test |
| --- | --- | --- | --- |
| P-01 | Dave, quiet morning: hero is "Do the morning checks". Saving with questions missing is refused ("11 left"). He answers all, saves. The hero changes and Saved today shows the checks | Next action changes only when the record is saved. Completion is real | `Supervisor: a quiet morning flows...` |
| P-02 | Poor signal: the first save fails. Answers are still selected. Try again succeeds and reports "1 sent to the office" | A failed save loses nothing. Matches the real wording | `Poor signal...` |
| P-03 | Report an issue end to end: Dave chooses "Yes: safety stop" in Report an issue (there is no Stop Work button) and then chooses Kowalski gang and chooses Kowalski gang. Marek sees "Fix it and send photos", sends a photo, then asks the office to check. Dave (the raiser) gets "This decision is for the office". Sam is asked to decide. Sam is refused until reason, both "I looked" ticks and the principal contractor's name and reference are given. Then the work restarts and only that location | The whole chain across three people. Safety stop needs the principal contractor | `Stop work end to end...` |
| P-04 | Sam raised stop h2 and opens its decision | The raiser cannot release it. No button is present | `The person who raised a stop cannot release it` |
| P-05 | Alex (owner) opens h2 with a critical defect open | Even the owner is blocked while a critical defect is open | `Release is refused while a critical defect is open` |
| P-06 | Dave re-inspects the hollow tile repair. A note, then a photo, are demanded. The snag closes | Re-inspection needs evidence | `Snag repair...` |
| P-07 | A failed mandatory inspection shows as a gate. Only a later saved pass clears it | The system never passes an inspection | `A failed mandatory inspection blocks...` |
| P-08 | Sam sets up Northgate Unit 4 in order: locations, supervisor, specification. Then nothing is left to ask | Job set-up is guided, one step at a time | `Office sets up a new job...` |
| P-09 | Sam clears expired public liability for Mason by saving a certificate. A new record is added. Cover shows valid | Append-only insurance. Gate cleared by a person | `Expired insurance...` |
| P-10 | Marek opens every screen | No money, no other gang. Exactly Today, Fixes, Paperwork. No "Tell the supervisor" | `Subcontractor never sees money...` |
| P-11 | Jo (office, no money) opens Today, a job and Money | No figures anywhere | `Office without money access...` |
| P-12 | Alex opens Money | A 25.x% margin against 30% is information. The box says "Original budgets only" and there is no button for claims, variations or margin approval | `Owner sees a low margin...` |
| P-13 | Desktop | Same four destinations, as a left rail | `Desktop uses the same four destinations...` |
| P-14 | Owner opens Today | Three destinations (no Risks). "Risks and exceptions (n)" is on Today | `Owner has three destinations...` |
| P-15 | Marek opens Today, Fixes, Paperwork | Three tabs. "Tell the supervisor" never appears | `Subcontractor has Today, Fixes and Paperwork...` |
| P-16 | Dave on a busy day | The main button is the first task. "Then (n)" lists **every** other task, matching the engine's queue | `The whole queue stays visible...` |
| P-17 | Dave reports a **critical** snag with "No" to stopping work | A snag is recorded. No hold is created. Nothing stops | `A critical snag is reported without stopping work` |

Also run:

| Check | Command | Result |
| --- | --- | --- |
| Engine, loader, flags, navigation and review points (independence, gate vs alert classes, config from working hours, no hard-coded clock times, no dead-end actions, queue completeness, owner counts, idle copy, one engine for app and preview) | `npm test` | 170 pass: 111 existing regressions, 53 engine/flag/navigation checks and 6 app loader/rendering/access checks |
| Type check | `npm run typecheck` | Clean |
| Preview bundle is current | `npm run preview:check` | Clean |
| 624 screen openings (6 people, 26 routes, 2 scenarios, 2 layouts) | `npm run preview:smoke` | No script errors, no empty screen, owner and subcontractor 3 tabs and others at most 4, no STOP WORK, no Risks tab, no "Tell the supervisor", no dead-end buttons, no money to the wrong person |
| Actual served preview at both `/preview/workflow` and `/preview/workflow/`, plus existing public/auth boundaries | `npm run test:browser` | 13 passed; one intentional desktop skip of the phone-only menu test |
| Real Supervisor Today, role shell and issue-report components with read-only synthetic dependencies | `npm run test:next-actions-ui` | 14 reports passed at 320px, 390px and 820px; 9 screenshots; controls at least 44px, no overflow or browser errors |
| Narrow-phone review journeys including the owner-count fixes | `npm run preview:mobile` | 12 captures at 320px and 390px, zero horizontal overflow |
| Production compilation with both flags explicitly off | `npm run build` | Passed |

The app loader and component harnesses use read-only fixtures, not hosted Auth,
RLS, Storage or writes. The existing database permissions and mutating forms
remain unchanged. No database migration or live staging change is needed to run
these Phase 2 checks.

## 7.2 To run against the real build

Each is a Playwright journey with seeded data, written in the same style as `tests/e2e` and `tests/browser`. Each must also leave the same database rows and audit events that the existing screens produce.

### Supervisor

| ID | Journey | Pass when |
| --- | --- | --- |
| S-01 | Arrive on site at 07:30. Open the app. Do the morning checks. Confirm the gang. Carry on | Never opens a menu. Each step is one tap from the previous. Hero names the next thing at every step |
| S-02 | A required inspection is due. The supervisor inspects and one check fails | A gate "Required inspection failed" appears. Work at that location stays blocked. Other locations are not affected |
| S-03 | Office sends an instruction needing acknowledgement and a QA request | Both appear on Today. Acknowledging does not complete the QA request. The QA result does not lift any stop |
| S-04 | Report an issue (no stop needed) with a photo | It appears under Issues. The supervisor is told to choose a gang. When they do, the gang sees it |
| S-05 | Report an issue from a screen deep in the app, choosing "Yes: safety stop" | "Report an issue" is present on every site screen and there is no prominent Stop Work button. The existing safety stop form opens. The record, permissions and audit event are identical to before |
| S-10 | Report a **critical** snag without stopping work | It goes to the office. No hold is created and no other work stops |
| S-06 | Yesterday's work has no finish time | People shows it first. Today's hero says to finish it before confirming |
| S-07 | The supervisor did the repair themselves (as a lead installer would) | They cannot be the one to check it. The reason is shown |
| S-08 | End of day | Handover is pre-filled from today's records. One tap after adding notes |
| S-09 | Loses signal mid-inspection | Entries are kept. "Not saved" is clear. Retry succeeds without duplicates (request key) |

### Office

| ID | Journey | Pass when |
| --- | --- | --- |
| O-01 | New tender arrives | It appears in Tenders. Open and read documents. There is no reply or decline button until B5 exists |
| O-02 | New job won. Set it up | Each missing step appears in order. When the job is complete, nothing is left to ask |
| O-03 | Plan a gang for next week | Applicability, checklist and package access prompts appear if missing. (Package access is still a separate step unless B8 is approved) |
| O-04 | A gang finishes a stop fix | The office sees "Check the fix and decide" the same day, without opening Holds and releases |
| O-05 | The office user raised the stop | They cannot release it. Another office user can |
| O-06 | A critical snag | Review defect appears. After a gang is chosen, the office is not asked again until it is repaired |
| O-07 | A gang's public liability has expired and they are planned in 4 days | A prominent "Needs attention" alert (A02) appears naming the date. The note says TileSpec does not stop work being planned. Saving a certificate adds a record and clears it |
| O-08 | A fix is 4 days late | The office is told to chase. The owner sees it as well after 3 days |
| O-09 | Office without money access | No figure anywhere, including Jobs, Today and the job page |

### Owner

| ID | Journey | Pass when |
| --- | --- | --- |
| W-01 | Opens the app | The first screen answers "what needs me". If nothing does, it says so |
| W-02 | A safety stop is raised by the supervisor | Appears under "Risks and exceptions" on Today. The owner can decide release only if independent |
| W-03 | A job is below target margin | Shown as information with the figures. No tick-box that implies a record. (Acceptance needs B3) |
| W-04 | Looks at Money | Matches `budgetSummary` to the penny. Plain list of what is not recorded |

### Subcontractor

| ID | Journey | Pass when |
| --- | --- | --- |
| U-01 | Opens the app at 07:00 | Sees a fix if there is one. Where to be, hours and instructions appear only once B1 exists |
| U-02 | Asked to fix a snag | Fix, photo, send. Then waits. Cannot check their own repair |
| U-03 | A stop on their work | Fix with photo, then "Ask the office to check". Cannot release |
| U-04 | Looks for prices, other jobs, other gangs | None exist on any screen or in any API response. Row-level security tests still pass |
| U-05 | Opens a drawing | It opens. The supervisor can too (finding N-5) |

### Cross-role and regression

| ID | Journey | Pass when |
| --- | --- | --- |
| X-01 | The three-second test (7.3) for each first screen | At least 9 of 10 people say the right next thing |
| X-02 | Parallel: morning checks overdue, failed inspection, snag awaiting re-inspection | All appear, ordered by priority, with none truncated. Completing one leaves the others. (Variations and claims return only once B4 and B6 exist) |
| X-10 | Feature flags off | Every page is byte-for-byte the old behaviour. Turning `FEATURE_NEXT_ACTIONS` or `FEATURE_ROLE_SHELL` on changes only that area |
| X-11 | Working hours | A job with `working_hours` "06:00 to 14:00" moves the reminder times with it. A job with none uses the configured default |
| X-03 | Every existing quality control | Release independence, critical blocks release, unknown applicability never releases, repairer is not re-inspector. The existing tests in `tests/` pass unchanged |
| X-04 | Audit trail | Every save made through a new screen writes the same audit event as through the old screen |
| X-05 | Financial calculations | `budgetSummary` output is identical before and after. `tests/job-costing.test.ts` and `tests/operations.test.ts` unchanged |
| X-06 | Records | A job created before the change opens with all its history. No migration touches existing rows in phases 2 to 6 |
| X-07 | Accessibility | Axe: no critical or serious violations. Keyboard: every control reachable. Focus visible. Text zoom to 200 percent usable. Colour is never the only signal (chips carry words and icons) |
| X-08 | Reduced motion | No animation beyond the logo, which already respects it |
| X-09 | Old links | Every route in the table in section 2.4 still resolves or redirects |

## 7.3 The "no training" test

Run it with people who have never seen the app, one per role, on a phone. Use the prototype first, then each phase of the real build.

| Step | Instruction given | Success |
| --- | --- | --- |
| 1 | "You have just arrived at work. Open this." Do not say more | Within three seconds they point to the main button and say what it is for |
| 2 | "Do what it says." Then, "What now?" | They finish the morning routine without asking anything |
| 3 | A snag is raised and a gang is told to fix it. "Make sure it gets fixed." | They find Issues or the hero without help |
| 4 | "This bathroom screed is wet and nobody should tile it." | They find Report an issue in under five seconds and choose to stop work |
| 5 | For the office: "A tender has come in. What do you do?" | They open it from Tenders and read it |
| 6 | For the subcontractor: "Where do you need to be today?" | They answer from the first screen |
| 7 | "What does this tell you to do next?" on a screen with a blocked item | They can read why they cannot do it and who can |

Record time to first correct tap, wrong taps, and questions asked. The success criterion from the brief is that a new office employee, supervisor or subcontractor completes normal daily tasks without training.
