# 2. Proposed navigation

## 2.1 Rules

1. At most four destinations per role. Never a menu behind a menu.
2. The same destinations are always on screen: a bottom bar on a phone, a left rail on a desktop. See the two layouts side by side in the prototype (`Phone` and `Desktop` toggle).
3. Every screen except the four destinations has a visible "Back" that names where it goes ("Today", "Jobs").
4. **Today** is always first. It answers one question: what should I do next.
5. Everything about a job lives inside the job. People do not choose between "Site dashboards", "Snag register" and "Holds and releases".
6. The STOP WORK button is in the header for supervisors on every screen, not in a tile.
7. A destination exists only if it holds something the role does repeatedly. Everything else is reached from Today or from inside a job.

## 2.2 The four roles

| | Owner | Office | Supervisor | Subcontractor |
| --- | --- | --- | --- | --- |
| Database role | `owner` | `contracts_manager` (money only if `financial_access`) | `supervisor` | `lead_installer`, `subcontract_installer` |
| Job | Decisions, approvals, profit, risk, exceptions | Tenders, job set-up, labour, documents, chasing | Today's site, people, inspections, snags, handover | Today's work, paperwork, fixes |
| Destination 1 | **Today** decisions waiting | **Today** | **Today** | **Today** your work |
| Destination 2 | **Jobs** | **Jobs** | **People** who is on site | **Fixes** |
| Destination 3 | **Money** | **Tenders** | **Inspect** | **Paperwork** |
| Destination 4 | **Risks** | **Labour** | **Issues** stopped work and snags | (three is enough) |
| Always visible | | | STOP WORK | |

The subcontractor has three destinations because nothing else is theirs. Fewer is better.

## 2.3 What each destination holds

| Role | Destination | Holds | Replaces or wraps today |
| --- | --- | --- | --- |
| Owner | Today | Decisions only you can take, then what is being watched | Overview, Holds and releases |
| Owner | Jobs | All jobs, status, stopped work count. Job page has plan, locations, documents, changes, money | Contracts |
| Owner | Money | Budget against target profit per job. Honest list of what is not recorded | Overview metrics, Estimator link |
| Owner | Risks | Stopped work, critical or failed items, cover problems, nothing else | Quality control, Site alerts, Snag register |
| Office | Today | One next action, then the rest, waiting-on-others, saved today | Overview, Site alerts |
| Office | Jobs | Jobs, with set-up steps, plan, locations, documents, changes, money (if allowed) | Contracts, plan, locations, actual |
| Office | Tenders | Enquiries by deadline, open, reply, decline, start estimate | Tenders, Estimator link |
| Office | Labour | Who is planned where, companies and cover, people to confirm | Workforce, Team |
| Supervisor | Today | One next action, then the rest. Messages and handover under "More" | Site dashboard |
| Supervisor | People | Planned gangs: Here, Not here, finished. Earlier unfinished work | Workforce |
| Supervisor | Inspect | Inspections needed now, start another, saved | Inspections |
| Supervisor | Issues | Stopped work and snags for the site. Raise a snag | Snag register, Holds and releases |
| Subcontractor | Today | Address, hours, instructions, supervisor, gang. One fix if there is one | (none: new) |
| Subcontractor | Fixes | Anything the gang has been asked to put right | Snag register (filtered) |
| Subcontractor | Paperwork | Drawings and documents for their job. Send a photo | Contract page documents |

## 2.4 Old page to new home

No existing page is deleted in the first phases. They remain reachable by their current links while the new screens are switched on behind a flag (see the implementation plan).

| Existing route | New home |
| --- | --- |
| `/admin` | Today (owner, office). Installers go to Today (subcontractor) |
| `/admin/contracts`, `/admin/contracts/[id]` | Jobs |
| `/admin/contracts/new` | Jobs, "New job" |
| `/admin/contracts/[id]/plan`, `/locations`, `/actual` | Inside the job: Plan, Locations, "Planned against actual" |
| `/admin/workforce`, `/admin/team` | Labour (workforce), account menu (user access) |
| `/admin/tenders` | Tenders |
| `/admin/estimator` | Tenders and Jobs, "Start an estimate" |
| `/admin/quality`, `/admin/alerts` | Today and Risks (derived from the same records) |
| `/admin/snags`, `/admin/holds` | Issues (supervisor), Risks (owner), Today (office) |
| `/admin/supervisor`, `/admin/supervisor/sites/[id]` | Today (supervisor) |
| `.../workforce` | People |
| `.../inspections`, `/admin/supervisor/inspections` | Inspect |
| `.../snags`, `/admin/snags/new` | Issues, "Raise a snag" |
| `/admin/holds/new` | STOP WORK button |
| `.../messages` | Today, "More", "Messages from the office" |
| `.../finish` | Today, "More", "End of day handover" |
| `.../commercial` (variations, dayworks) | Removed until built. Inside the job as "Changes and extra work" once B4 exists |
| `.../history`, `.../tasks/[taskId]` | Kept as detail pages |

## 2.5 Screens that are unnecessary today

| Screen | Why it is unnecessary | Disposition |
| --- | --- | --- |
| Variations and Dayworks tiles | Lead to a page saying the feature is not built | Remove tiles until B4 exists |
| Office mobile menu (`<details>`) | Four destinations fit the bottom bar | Replace |
| Contract overview warnings list | Static, no owner, no date | Replaced by set-up actions in Today and in the job |
| Separate "Site alerts" | A morning check problem is an action for someone | Becomes actions in Today |
| Separate "Quality control" | Same records as Issues and Risks | Becomes a filter in Risks |

## 2.6 Plain English

The prototype uses one vocabulary everywhere. The full table is in section 1.3 of the audit. The rules:

- Say what the person does: "Check the repair", not "Re-inspection".
- Say what will happen: "Restart work here", not "Release".
- Use the site's words: "snag", "stop work", "gang".
- No codes on screen. Rule numbers (G05, R01) appear only in the review notes.

## 2.7 The three-second test, per role

Each role's first screen has one answer in the largest type, one button, and the reason in one sentence.

| Role | Screen | The answer |
| --- | --- | --- |
| Supervisor, quiet morning | ![](screenshots/supervisor-today-mobile.png) | "Do the morning checks" |
| Supervisor, busy day | ![](screenshots/supervisor-today-busy-mobile.png) | "Check the repair" |
| Office | ![](screenshots/office-today-mobile.png) | "Check the fix and decide" |
| Owner | ![](screenshots/owner-today-mobile.png) | A decision, or "You are up to date" |
| Subcontractor | ![](screenshots/sub-today-mobile.png) | Where to be and what to do |

How to run the test with real people is in the acceptance tests.
