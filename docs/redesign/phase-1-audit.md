# TileSPEC Admin — phase 1 audit and proposed workflow

Review only. This document and the clickable prototype do not change records, schema, permissions, calculations or quality controls. Do not implement until this experience is approved.

Open the prototype from a local server at the repository root so the logo resolves:

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/docs/redesign/prototype.html`. The phone frame is 390px. Use Phone and Desktop, and the four roles. The Situation menu covers several open tasks, a long job name, nothing outstanding, records that could not be read, and a save that fails. On Supervisor, the checkboxes are the saved-record conditions. They feed one queue. The first item is the button. The rest stay listed underneath and are not cleared by completing the first.

Saving in the prototype updates that sample only. It does not write to the database. A failed save leaves the previous sample unchanged.

Sample job “Riverside Retail” shows the shape of saved records. It is not a live site. The long-name situation uses the full trading name so wrapping can be checked on a phone.

## What already works, and what must stay

Roles in `organisation_members`: owner, contracts manager, supervisor, lead installer, subcontract installer. Financial figures are a separate permission. Owners always have it. A contracts manager has it only when `financial_access` is true. Installers never do.

These behaviours are implemented and must be preserved:

- Invite-only sign-in, one active membership, and row-level access by organisation, contract assignment and package assignment.
- Contracts, original budgets, locations, work packages, private document revisions, and audit history.
- Teams, operatives, companies, insurance, accreditations, and the week plan.
- Supervisor confirmation of who is actually on site, including moves, absences and finish times.
- Morning checks, location inspections, snags with photos, responsibility and independent reinspection.
- Safety stops and quality holds, with release only through the existing authorised decision. A request does not restart work.
- Office messages, inspection requests, acknowledgements and the end-of-day handover.
- The public tender inbox (received enquiries and short-lived file links).
- The unsaved estimator. It is not a job budget.

These are described in the architecture notes and are **not** implemented. The prototype must not pretend they save:

- Variations, dayworks and their approval.
- Actual cost, valuations, payment claims, notices and certificates.
- An owner “acceptance” record when a budget is under the company target margin. The overview copy asks for a recorded reason. No such record exists.
- A read receipt on a handover or an office instruction. Acknowledgement is a saved row. “Seen” is not.
- A labour plan visible to installers. `planned_allocations` can be read only by people who can supervise the contract. The smallest safe change is a new function, described below. It is not built.

Lead installer and subcontract installer share one proposed experience. The lead flag on a team stays in the workforce record. It does not become a fifth app.

## 1. Existing workflow audit

### Navigation is a map of the database

Office and owner share one bar. An owner sees up to eleven destinations: Overview, Contracts, Workforce, Site dashboards, Snag register, Holds and releases, Site alerts, Quality control, Tenders, User access, Estimator. On a phone they collapse into “Office menu”, plus a separate “My sites” link.

A supervisor skips that bar and lands on today’s site, which is the right idea. The site “More” menu then adds nine links beside Stop work. Two of the six everyday tiles, Variations and Dayworks, open a page that says the feature will be added later.

An installer is given the office bar without Workforce, Quality, Tenders, User access or Estimator. “Site dashboards” then says the page is not for them. “Plan work” says the same. Their useful record is the contract page: a long specification, packages, documents and allocations, with no single next step.

### The same fact is entered or hunted more than once

| Already saved | Asked for again |
| --- | --- |
| Who is on site, in the workforce day | Morning check “Are the expected lads on site?” The workforce record remains the only confirmation. The question still asks. |
| Job address, contact, scope and specification | Repeated as a read-only block on the supervisor’s site page, under “Site details”. |
| Drawings uploaded on the contract | Listed again on the site page as titles, without the download link. |
| Price built in the estimator | Typed again into the original budget. The estimator is unsaved and resets on leaving the page. |
| A hold, its place and its reason | Also counted on Quality control, Site alerts, the supervisor dashboard and Holds and releases. |
| An office inspection request | Created from Quality control’s “Daily site updates”, which links into each site’s messages. The supervisor sees it on Today only after other steps. |

### Actions sit behind the wrong door

- Sending a site instruction is inside Quality control, then a per-site messages page, inside a collapsed “Send a message”.
- Booking labour is on the contract, then Plan work, after locations exist. The contract page does show the three setup steps. They sit under a permanent warning that installation is not authorised.
- Confirming a person added on site is inside Workforce, not on the office home screen.
- Insurance that is expired or about to expire is shown to the supervisor as “tell the office”. The office home does not list it.
- The live supervisor Today screen puts a red STOP WORK control above the next button. The form behind it is the full hold record: type, place, stage, category, severity, reason and required correction. That form stays. The proposed Today screen does not show that control as a prominent button. A text link, “Stop affected work”, opens the same form. An active stop is still the first item in the queue, as a review, and the supervisor still cannot release it.

### Work without a named person

| Situation | What is saved | Who should act | Gap |
| --- | --- | --- | --- |
| Contract missing dates, specification, locations or drawings | Warning text on the overview | Office user who can manage the contract | The warning does not name them or the first missing item. |
| Budget under target margin | Original budget figures | Owner | Copy requires a recorded reason. No acceptance row exists. Do not add an Approve button in this phase. |
| Tender received | Enquiry, contact, files | Office | No assignee, no priced or declined status. The complete route only confirms the public upload. |
| Morning problem | `supervisor_issues` when the check is saved | Office, to read it | It does not by itself stop work or name a fixer. |
| Provisional operative | Operative status `provisional` | Office or owner, via the existing confirm action | Easy to miss inside Workforce. |
| Insurance expiring | Company insurance dates | Office | Supervisor is told to pass it on. No office task is created. |
| Handover with a materials request | `site_handovers` | Office | Supervisors and office can read it. There is no read receipt, so “unread” cannot be invented. |
| Snag | Status, optional team or person, target date | Named repair party, then an independent reinspection | A snag with responsibility “not assessed” has no fixer until the office proposes one. |
| Hold | Place, stage, status, optional correction assignee | Supervisor keeps work stopped. Release is a named authorised user | Correct. Do not shortcut it. |
| Inspection request | Recipient supervisor, place, stage | That supervisor | Correct. Submitting the result does not release a hold or approve money. |

### Office and site do not meet in the middle

- The supervisor can finish the day in a handover. The office has to open that site’s messages to read it. It is not on Overview.
- The installer never sees office messages. Those rows are limited to the office and the named supervisor. Instructions reach the gang through the supervisor. The proposed subcontractor home must not show an inbox the database will not return.
- The installer never sees who is booked today. The plan is supervise-only. Address, site contact and operational drawings on their package are already readable. Today’s place needs the narrow function in section 9. The prototype labels that one line as the proposed read. It does not show other gangs, rates or other jobs.
- Extra work has no record. The supervisor tiles imply that it does. The honest path is a note on the handover and the current office process.

### The next action is already calculated, then not used

`nextAction` in `lib/operations/site-day.ts` is tested. Safety stops come first, then release requests, quality holds, failed mandatory inspections, serious snags, repairs waiting to be checked, disputed responsibility, overdue repairs, morning checks, unfinished earlier times, unconfirmed teams, open issues, inspections still due, and only then “keep the day current”.

The live supervisor page does not call it. Its button order is morning checks, unfinished earlier work, who is on site, an office inspection request, then check workmanship. A safety stop is a banner. The button can still say “Check workmanship” while that stop is active. Completing the checks does not clear the stop, which is correct. The button should say so.

Every contract is stored as `draft`. The overview always adds “Installation not released — acceptance gates are not yet available.” That line is not a next step. Where a real hold or a failed required inspection exists, say that. Where the job is only missing locations, say that.

### Language that hides the next step

Prefer the words already used on the supervisor day. Retire the register language on the home screens. Keep the precise record in the existing form.

| On screen today | Say |
| --- | --- |
| Portfolio overview, contract register | Today, Jobs |
| Contracts manager, QA / Site supervisor | Office, Supervisor |
| Mobilisation, acceptance gates, unreleased | The first thing still missing, or the real stop |
| Holds and releases | Stopped work |
| Snag register | Snags |
| Quality control | The decision or the check, named |
| Site alerts | The unread item, on Today |
| Work packages | The work you are given |
| Planned versus actual | Booked, and who is here |
| Variations, dayworks | Not a button. A note to the office until a real record exists |
| Estimator | Price a job. Say that it is unsaved |
| User access | People |

## 2. Proposed navigation

Four destinations. Finish today and Stop affected work are text links on the supervisor’s Today screen, not tabs and not a prominent button. Anything else is one tap from the screen that needs it, with Back returning to Today. A screen that has no saved record says so. It does not offer a button that only pretends to save.

| Role | Today | Second | Third | Fourth | Not on the bar |
| --- | --- | --- | --- | --- | --- |
| Owner | Decisions and exceptions | Jobs | Money | People | Setup, labour booking, snag administration, estimator mechanics |
| Office | What to chase | Jobs, including setup | Labour | Money, including enquiries | A separate quality, holds, alerts and tender menu |
| Supervisor | This site. One button from the shared queue, remaining tasks listed under it | Checks | People | Snags | A prominent Stop work button, variations, dayworks, the office register |
| Subcontractor | This package, address, contact, and today’s place when the proposed read exists | The snag assigned to them | Papers for their area | The repair update | Prices, other gangs, other jobs, office messages, release |

A supervisor with one current site still opens straight onto it. More than one site still asks which site, as now.

A contracts manager without financial access does not see budget figures on Money. They still see enquiries, because the tender page is already available to the office. An installer never sees Money.

Old URLs stay. The new home is a shell over the current pages, not a replacement of the forms.

## 3. Screens

The prototype is the screen list. Each row is a jump target in the prototype, on phone (390px) and desktop.

| Role | Screen | One button | What it reuses | What it must not do |
| --- | --- | --- | --- | --- |
| Owner | Today | Review the live safety stop, if one exists | Hold register the owner can already open | Release from Today |
| Owner | Jobs | Open the job that needs a decision | Contract list | Show every setup field |
| Owner | Job | Review the stop or the price | Contract, budget summary, active holds | Treat the original budget as actual cost |
| Owner | Money | Review a below-target price | `budgetSummary` | Offer Accept. No acceptance record exists |
| Owner | People | Leave provisional people to the office, or open access | Team page, confirm operative | Change financial rules |
| Office | Today | The first chase item | Setup counts, insurance dates, handover text, enquiry count, unconfirmed inspection requests | Mark a handover read |
| Office | Jobs | Open the job whose setup is unfinished | Contract list | — |
| Office | Job | The first of locations, teams, this week’s plan | `SiteSetup` | Show a variation form |
| Office | Labour | Book or confirm the unfinished item | Plan board, workforce, provisional status | Block a gang because a reminder exists |
| Office | Money | Open the received enquiry | Tender inbox, budgets if permitted | Show a payment claim |
| Office | Send to site | The existing message fields | `OfficeMessageForm` | Mark the message read. Sending writes the sample item only |
| Supervisor | Today | The first item from the one queue | `nextAction`, plus the two ranks proposed inside that function | A prominent Stop work button. Clear a stop by finishing checks |
| Supervisor | Checks | Save the morning check | Morning checks | Treat a pass as permission to work, or clear a hold |
| Supervisor | People | Confirm who is here | Workforce day | Ask the morning check to be a second register |
| Supervisor | Snags | Open the snag the queue selected | Snag register for this site | Close a snag the installer submitted |
| Supervisor | Finish today | Save the handover | `site_handovers` | Create a variation |
| Supervisor | Stop affected work | Save the stop, reached by the text link | Create hold | Narrow a stop with the activity note. The note does not reduce the saved scope |
| Subcontractor | Today | The assigned repair, or the missing drawing | Their packages, address, contact. Today’s place is the proposed narrow read | Show another gang, a price, or an inbox |
| Subcontractor | Snag | Add repair photos | Snag party permissions | Show snags that are not theirs |
| Subcontractor | Papers | Open the drawing | Document download on their area | Show commercial documents |
| Subcontractor | Update | Submit the repair for a check | `submit_rectification` | Close the snag or report a percentage complete |

Desktop is the same screens with the four destinations on the left and the button at the top of a single column. It is not a second product.

## 4. Next-action rules

An action is either a **gate** or a **reminder**.

A gate blocks the named place and stage until a person with the existing permission saves the required record. The software must not approve, release, or authorise it. A reminder needs a person to look, book, chase or record. It does not stop tiling.

Parallel work stays parallel. Morning checks, an open variation note, a staged inspection request and a payment conversation can all be true on the same day. The button shows the highest gate, then the highest reminder. The others remain on the list. Sending an inspection result does not release a hold. A handover note does not price a variation. A budget does not certify a payment.

### Supervisor — one function, called by the screen

Responsible person: the supervisor assigned to that contract. If the action is a release, the supervisor may only review. The office user with release permission decides.

The live site page does not call `nextAction`. It builds a shorter list in the page: morning checks, unfinished earlier work, who is on site, an inspection request, then check workmanship. A safety stop can sit in a banner while the button says something else. The proposed screen calls `nextAction` and renders that result. It does not keep a second order in the page.

Two ranks are proposed inside that function, after unconfirmed teams and before open issues. They use rows that already exist. They are not a second sorter in the interface.

- Required acknowledgement. Proof is a row in `supervisor_office_acknowledgements` for that item and that supervisor.
- Outstanding inspection request. Proof is a row in `supervisor_qa_submissions` for that request. Saving it does not release a hold or approve money.

The prototype’s `supervisorQueue` is a review copy of this order so the button and the list underneath stay in step. The checkboxes change the inputs. They do not contain their own ranking.

| Order | Saved condition | Instruction | Kind | Done when | Then |
| --- | --- | --- | --- | --- | --- |
| 1 | Active safety stop | Review stopped work. Keep that place and activity stopped. | Gate | An authorised release is saved on that hold | The next rule. The stop is not cleared by a check |
| 2 | Hold awaiting release | Review the request. Opening it does not restart the work | Gate | The existing release decision is saved by someone allowed to release | Next rule |
| 3 | Active quality hold | Review the hold | Gate | Same as a release, or the hold is superseded through the existing path | Next rule |
| 4 | Failed mandatory inspection | Review the failed check | Gate | A later saved inspection meets the requirement, under the current rules | Next rule |
| 5 | Critical snag | Review the serious snag. It does not stop work until a hold is recorded | Reminder | The office has the existing snag review, or a hold is explicitly raised | Next rule |
| 6 | Repair awaiting reinspection | Check the repair. Photos are not acceptance | Gate for closing | A saved reinspection accepts or rejects | Next rule |
| 7 | Disputed responsibility | The office must review who owns the repair | Reminder | Responsibility is confirmed, or marked unable to determine, on the snag | Next rule |
| 8 | Overdue repair | Review the date | Reminder | Target date is still in the future, or the snag is closed through the existing path | Next rule |
| 9 | No morning check today | Start morning checks | Reminder | Today’s check is saved | Next rule |
| 10 | Earlier work still open | Finish those times | Gate for confirming today | The open periods have an end time | Next rule |
| 11 | Planned team not confirmed | Who is here? | Reminder, required before the day is complete | Each booked team is confirmed, marked not on site, or recorded as a change | Next rule |
| 12 | Office instruction that requires acknowledgement, and none is saved | Read it and acknowledge | Reminder | `supervisor_office_acknowledgements` has a row for this item and this supervisor | Next rule. This is a proposed rank inside `nextAction` |
| 13 | Office inspection request without a submission | Inspect that place and stage | Gate for that request only | `supervisor_qa_submissions` has a row for that request | Next rule. Holds and payment are untouched. Proposed rank inside `nextAction` |
| 14 | Other open snags | Look at open snags | Reminder | None open, or a later rule applies | Next rule |
| 15 | Mandatory inspection still due | Inspect against the approved requirement | Gate | The inspection is saved | Next rule |
| 16 | None of the above | Keep today’s record current | Reminder | Arrivals and leaving times are recorded as they happen | Finish today, when the supervisor is ready |

### Office

Responsible person: the contracts manager assigned to the job, or the owner if no manager is assigned. Items that are waiting on site name the supervisor or the gang. The office chases. They do not complete the site step.

| Order | Saved condition | Instruction | Kind | Done when |
| --- | --- | --- | --- | --- |
| 1 | Unread safety alert, or an active safety stop | Review the stop | Gate | The existing hold path is followed. Today does not release it |
| 2 | Hold awaiting release and this user may release | Review the request to restart | Gate | The existing decision is saved. A request is not a release |
| 3 | Job has no locations, no active team, or nothing planned this week | Do the first unfinished setup step | Gate for booking labour | `SiteSetup` would show that step done |
| 4 | Provisional operative | Confirm the person added on site | Gate before they are active | Existing confirm action sets them active |
| 5 | Inspection request with no submission | Waiting on the named supervisor | Waiting | A submission exists. The office cannot save it for them |
| 6 | Instruction that requires acknowledgement, and none is saved | Waiting on the named supervisor | Waiting | An acknowledgement row exists. There is no read receipt to tick |
| 7 | Submission saved with issues | Read the result | Reminder | A person opens the submission. Do not auto-create a snag or a hold |
| 8 | Company on a current or upcoming plan with insurance expired or inside 30 days | Record the certificate | Reminder | A later insurance row covers the date. Do not cancel the plan automatically |
| 9 | Handover text for materials or problems | Read it from the saved row | Reminder | No read receipt exists. Show the text. Do not store “read” |
| 10 | Enquiry status received | Read the enquiry | Reminder | A person creates a job, or leaves the enquiry. There is no declined status |
| 11 | None | Nothing to chase | — | — |

Every office row names the job, the role or person, the thing to do, and the saved record that proves it. Waiting rows stay visible under the office button. Completing an office step does not mark a supervisor step done.

The handoff, using only rows that exist today:

1. The office sends an instruction or an inspection request. The saved item is the proof it was sent, including the time.
2. The supervisor’s queue includes it at the rank above. They acknowledge the instruction, or they submit what they saw.
3. The office Today screen shows that acknowledgement or submission, and any handover text. If the row is absent, the screen says it is not saved yet. It does not invent a read receipt.

### Owner

The owner sees gates and money exceptions. They do not see setup chores the office can finish.

| Order | Saved condition | Instruction | Kind | Done when |
| --- | --- | --- | --- | --- |
| 1 | Active safety stop | Review it | Gate | Same release rule as the office. Not from a new button |
| 2 | Hold awaiting their release | Review the request | Gate | Existing release |
| 3 | Budget margin under the company target | Review the price | Reminder | There is no acceptance record. Do not write one in this phase |
| 4 | Enquiry received | Optional. The office can own this | Reminder | Office creates a job or leaves it |
| 5 | Provisional person, if the office has not confirmed them | Leave it to the office unless no office user exists | Reminder | Existing confirm action |

### Subcontractor

Rows they can already read: their packages, the job address and site contact through `can_access_contract`, operational documents on those areas through `can_read_document` (commercial files still require financial access, which installers do not have), and snags where they are the repair party or the proposed responsible team.

Today’s place is the one proposed permission change. It is not available until that function is reviewed and built. The prototype shows the line only as that proposal.

| Order | Saved condition | Instruction | Kind | Done when |
| --- | --- | --- | --- | --- |
| 1 | Snag assigned to their team or operative, status open or assigned | Send repair photos and submit the repair | Gate for closing, which they cannot do | `submit_rectification` is saved. Status becomes waiting for a check |
| 2 | Responsibility proposed to their team | Say whether it is theirs | Reminder | Accept or dispute, the existing actions |
| 3 | No operational drawing on their area | Ask the supervisor. The button opens Papers | Reminder | A document revision is uploaded on that area |
| 4 | None | Show the address and the package. No further button | — | The supervisor records attendance |

They cannot see other packages, other gangs, commercial documents, budgets, plan instructions, office messages, or the member directory.

### Proposed installer read — not built

Do not change the `planned_allocations` select policy. That policy is `private.can_supervise_contract`. Widening it would return other teams, named operatives and free-text instructions.

The smallest safe change is one security-definer function for the signed-in installer. It returns a narrow projection only when all of these are true:

- The role is `lead_installer` or `subcontract_installer`.
- The plan is not cancelled and not superseded.
- The plan dates cover today, using the existing site date.
- `plan.team_id` is in `private.my_team_ids()`. That helper is the active operative linked to the signed-in user, with a membership valid today.
- If the plan names operatives, this user’s operative is one of them.
- The plan’s package is assigned to them, or the plan’s location is on the branch of a package assigned to them.

Return the location path, the stage, the package name and the dates. Do not return other teams, other operatives, or the plan instructions. Address, site contact and operational drawings stay on the reads that already exist.

## 5. Responsibility matrix

| Work | Owner | Office | Supervisor | Subcontractor |
| --- | --- | --- | --- | --- |
| Who may sign in, and who may see prices | Decides | No | No | No |
| New enquiry | May read | Reads and creates the job | No | No |
| Job details, locations, drawings | May read | Records | Reads, including a real download link | Reads drawings on their area only |
| Original budget and unsaved estimate | Decides the target and may read | Reads only with financial access | No | No |
| Book labour | No, unless acting as office | Books | Sees the plan and confirms the day | Sees their package now. Today’s place only after the proposed function. Never another gang |
| Who is here, moves, finish times | No | Reads the comparison | Records | No |
| Morning check | No | Reads problems | Records | No |
| Workmanship inspection | No | May request one | Records the result | No |
| Snag | Reads exceptions | Assigns responsibility | Raises, reinspects, closes | Repair photos and submit, only if assigned. May accept or dispute a proposal |
| Stop work | May review | May raise and, if permitted, release | Raises. Cannot release | No financial or unrelated hold. May see a stop that covers their package only if the current hold read already allows it |
| Office instruction | No | Sends | Acknowledges when asked | Hears it from the supervisor. No inbox |
| Handover | No | Reads | Writes | No |
| Extra work and payment claims | Not recorded | Not recorded | A note on the handover only | No |
| Insurance and accreditations | May read | Records | Told when a company on site is expired or close | No |

“No” means the proposed home does not offer it. It does not remove a permission the database already grants on a deep link. Phase 2 of implementation must keep those checks.

## 6. Reusable components and modules

Use these. Do not rewrite the forms.

| Piece | Path | Use on the new home |
| --- | --- | --- |
| Logo | `public/tilespec-logo-animated.svg` | Header, as on the admin bar |
| Ink, teal, paper, warning and stop colours | `app/globals.css`, `app/admin/admin.module.css`, `components/site/daily.module.css` | Shell only. No new palette |
| Membership and financial checks | `lib/auth.ts`, `lib/operations/permissions.ts` | Who sees which of the four destinations |
| Contract warnings and budget maths | `lib/operations/summary.ts` | Office and owner reminders. Do not add an acceptance write |
| Three setup steps | `components/office/site-setup.tsx` | Office job screen |
| Week plan | `components/office/plan-board.tsx`, `components/office/plan-form.tsx` | Labour, linked from the job |
| Companies, cover, people | `components/office/workforce-view.tsx`, `lib/operations/companies.ts` | Insurance reminder and provisional people |
| Site day and the tested next action | `lib/operations/site-day.ts` | Supervisor button. Call `nextAction` from the site page |
| Morning questions | `lib/operations/morning-checks.ts`, `app/admin/supervisor/morning-readiness.tsx` | Checks |
| Who is here | `components/site/workforce-day.tsx` | People |
| Workmanship | `components/operations/workmanship-form.tsx` | The inspection the office requested |
| Office message and handover | `components/site/office-message-form.tsx`, `components/site/daily-form.tsx`, `lib/operations/daily.ts` | Ask the supervisor, acknowledge, finish today |
| Snags | `components/snags/create-snag.tsx`, `photo-upload.tsx`, `work-candidates.tsx` | Raise, and the subcontractor repair |
| Holds | `components/holds/create-hold.tsx`, `hold-form.tsx`, `lib/operations/holds.ts` | Stop work and review. No new release control |
| Release list | `components/site/work-release-list.tsx` | Behind “Stopped work”, not on the first screen |
| Location search | `components/office/location-picker.tsx`, `lib/operations/locations.ts` | Already inside holds, snags, messages and plans |
| Save states | `components/operations/operations-form.tsx`, `components/site/connection-status.tsx` | Saved, failed and retry stay as they are |
| Money format and dates | `components/operations/format.ts`, `lib/operations/planning.ts` | Labels only |
| Estimator maths | `lib/estimator.ts` | Keep unsaved. Do not copy it into a budget automatically |
| Audit list | `components/operations/audit-history.tsx` | Stays on the job record, not on Today |

## 7. What existing data can deliver

These changes use rows, functions and forms that already exist. They need no new table and no change to a select policy.

| Change | Existing source |
| --- | --- |
| Four destinations and plain labels | Current routes. Old URLs stay |
| Supervisor button and the list under it | One call to `nextAction`. The page stops keeping its own order |
| Acknowledgement and inspection ranks | Inserted inside `nextAction`, after unconfirmed teams. Proof is `supervisor_office_acknowledgements` and `supervisor_qa_submissions` |
| Office queue | Holds, location and plan counts, provisional operatives, insurance dates, office items, acknowledgements, submissions, enquiries, handover text |
| Handoff | The item row, then the acknowledgement or submission, then the handover text. Absence of a row means it is not done |
| No prominent Stop work button | The existing hold form, opened from a text link. Release stays on the hold |
| No variation or daywork button | The handover note. `/commercial` still explains that those records do not exist |
| Drawing open | The download that already exists on the contract, linked from the site list |
| Subcontractor address, contact, package, drawing, assigned snag | `can_access_contract`, package assignment, `can_read_document`, `is_snag_party` |
| Failed save | The existing retry behaviour. The previous record stays |

## 8. What needs a schema or permission change

| Change | Why it is not an existing read | Smallest change |
| --- | --- | --- |
| Today’s place on the subcontractor home | `planned_allocations` select is `can_supervise_contract` only | The security-definer function in section 4. Do not widen the table policy |
| Variations, dayworks, actual cost, valuations, claims | No tables. The commercial page says they come later | Separate schema review. Do not draw the form |
| Margin acceptance | Overview copy asks for a recorded reason. No row exists | Separate review. No Approve button |
| Handover or instruction read receipt | Not stored. Acknowledgement is a different row | Do not add one |
| Tender priced or declined | The complete route only confirms the public upload | Do not add a status in this pass |

## 9. Implementation plan

Each phase is reversible and leaves the current pages working. No phase here is a rewrite. Implementation is not authorised. None of these phases run until this revised prototype is approved. None of them merge on their own.

**Phase A — shell, flag off by default.** A new home per role with four links into existing routes. Supervisors keep the current site page. Installers stop seeing Site dashboards in the bar. Old URLs do not move. Remove the flag to restore the current bar.

**Phase B — supervisor button.** The site page calls `nextAction` instead of the shorter order in `app/admin/supervisor/sites/[id]/page.tsx`. Add the acknowledgement and inspection ranks inside that function, not in the page. Remove the prominent STOP WORK control from Today and keep a text link to the existing hold form. Remove the Variations and Dayworks tiles. Keep `/commercial` so an old link still explains that those records do not exist. Put a download link on drawings that are already uploaded. Revert by restoring the page.

**Phase C — office and owner Today, read only.** Compose the lists in section 4 from queries that already exist: contracts, area and document counts, `SiteSetup` inputs, insurance summaries, provisional operatives, quality counts, unread hold alerts, handover text, outstanding inspection requests, received enquiries. No new tables. No “mark handover read”. No margin acceptance.

**Phase D — subcontractor home, read only.** Packages, address, contact, operational documents and snags `is_snag_party` already allows. Hide prices and the office menus. Do not query `planned_allocations`. Today’s place waits for the function in section 4.

**Phase E — plain labels on the new shells only.** The stored statuses and the existing forms keep their current words until a later copy pass is reviewed.

**Not in these phases.** The installer plan function, variation records, payment claims, a margin-acceptance record, and any read receipt. Each needs its own review. Building the screens before the records would create a false save.

## 10. Acceptance tests

Run the existing suite after each implementation phase: `npm test`, `npm run typecheck`, `npm run test:db`, `npm run test:browser`, `npm run test:forms`, `npm run test:ui`, `npm run test:e2e` and `npm run build`. Add the cases below to the phase that introduces the behaviour. Use the disposable fixtures. Do not point them at hosted data.

1. **Office, first morning.** A contracts manager with one unfinished job opens the home. The button is the first missing setup step. They can reach locations, teams and the week plan without using the eleven-item menu. Creating a location still requires the existing permission.
2. **Owner is not the office.** An owner with a safety stop and a below-target budget sees the stop first and the price second. They do not see a location-setup button. There is no control that writes an acceptance.
3. **Prices stay hidden.** A contracts manager with `financial_access` false can open enquiries and cannot see contract value or margin. A lead installer and a subcontract installer cannot open Money, the estimator, or another gang’s package.
4. **Supervisor button matches the tested order.** With a saved safety stop and no morning check, the button is “Review stopped work”, not “Start morning checks”. Saving the check does not change the hold status and does not authorise work.
5. **Release stays put.** From Today, the supervisor can open the hold and cannot release it. An office user without release permission cannot release it. An allowed user still uses the current hold decision, including the note. A failed save does not show success.
6. **Parallel work.** The same day can have a saved morning check, an open inspection request, a handover that mentions extra work, and an active hold. Submitting the inspection does not release the hold, does not create a variation, and does not change the original budget.
7. **No fake commercial record.** The supervisor home has no Variations or Dayworks action. Finish today still saves the existing handover fields. The database has no new variation row.
8. **Subcontractor day.** With one package and one assigned snag, the home shows the address, the site contact, the package and “Send repair photos”. It does not show another gang, office messages, budgets, or a snag assigned to someone else. Submit repair uses the existing action and leaves the snag waiting for reinspection. Today’s place appears only after the proposed function exists, and only for that installer’s own booking.
9. **Subcontractor with nothing assigned.** The home says the office has not given them a package. It does not show an empty labour plan or other jobs.
10. **Installer plan table is still refused.** A direct read of `planned_allocations` as either installer role still fails the current policy. The proposed function, once built, returns only that installer’s location, stage, package and dates.
11. **Insurance is a reminder.** A company on a plan with cover inside 30 days appears for the office. The plan is not cancelled and the location is not held because of that date alone.
12. **Provisional person.** A name added on site appears for the office. Confirming them uses the existing action. Until then they stay provisional.
13. **Enquiry.** A received enquiry appears for the office. Opening it does not create a contract. The estimator still warns that it is unsaved.
14. **Old paths.** `/admin/contracts`, `/admin/holds`, `/admin/snags`, `/admin/supervisor/sites/[id]` and the workforce day still perform their current saves, including retry after a lost response and the audit row.
15. **One site, many sites.** A supervisor with one assignment lands on that site. With two, they are asked which site. An installer is not redirected into the supervisor hub.
16. **Phone and desktop.** At 390px the four destinations are a bottom bar, long job names wrap, and the button is full width. Empty, missing-record and failed-save states are readable without a second menu. At desktop width the same four destinations are on the left, the button is the same action, and Back returns to Today. Supervisor Today has no prominent Stop work button. “Stop affected work” is a text link to the existing hold form.
17. **Remaining tasks stay visible.** With a safety stop, an unconfirmed gang and an unacknowledged instruction, the button is the stop. The gang and the instruction stay listed. Saving morning checks does not remove them and does not release the hold.
18. **Office handoff.** Sending an instruction creates the item. The supervisor acknowledges it. The office screen shows the acknowledgement time. With no acknowledgement saved, the office screen says none is saved. Neither screen offers a read receipt.

## Success check

A new office user can set up a job, book labour, send a check request and see the saved site reply without learning the menu. A supervisor sees one instruction from the shared queue, with the other open tasks still listed, and cannot clear a stop by finishing the day. A subcontractor sees their address, their papers and their repair, and cannot see another gang or the business.
