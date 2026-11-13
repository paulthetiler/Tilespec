# Navigation and workflow overhaul

**Date:** 13 November 2026. **Scope:** every signed-in screen for the owner, contracts managers, supervisors and
subcontractor gangs. The underlying records, permissions, rules engine, audit trails and safety controls are unchanged.
No database migration, and nothing in the hosted database or on Vercel was changed.

The aim: the same powerful system, with the complexity kept behind the scenes. A supervisor should be able to
pick up a tablet and work without training. An owner should understand the business within seconds. The office
should run the day without going through dozens of unrelated screens.

## 1. How the audit was done

- Read every navigation component, dashboard and role check in the code, and the earlier redesign
  ([docs/redesign](../redesign/README.md)) and command centre audit ([2026-11 audit](../audits/2026-11-office-command-centre-audit.md)).
- Read the production settings on Vercel (read-only) to see which experience each role actually gets.
- Ran the real app against a disposable database with every migration and the end-to-end seed records, signed
  in as each role, and followed every link at phone (390 px), tablet (800 px) and desk (1366 px) widths.
  `npm run stack:local` now does the same for anyone reviewing locally.

## 2. What the audit found

### Navigation

| # | Finding | Evidence |
|---|---|---|
| N1 | Three navigation systems existed side by side: the original flat menu (19 links, shown twice: a desk bar and a phone drop-down), role tabs with an "Everything else" list, and the office sidebar with a separate "Menu and search" button. Which one a person saw depended on two settings. | `app/admin/layout.tsx` before this change |
| N2 | In production, subcontractor gangs still got the original flat menu, because the role navigation was switched on only for supervisors, owners and contracts managers. Several of its links led gangs to pages that refused them ("Site dashboards are for supervisors and the office") or bounced them back. | Vercel production: `FEATURE_ROLE_SHELL=supervisor,owner,contracts_manager` |
| N3 | The office menu had 31 links, several overlapping: Inbox, Messages and handovers, Site alerts, Quality control, and Holds and releases. On a desk, search appeared three times (sidebar box, sidebar "Search" link, Today's header). | `lib/operations/role-nav.ts` |
| N4 | Office navigation on a phone was split: tabs at the bottom, and a "Menu and search" button at the top. | Screens at 390 px |
| N5 | Once "Docs" replaced "Issues" as a supervisor tab, a site's outstanding snags could no longer be reached from the supervisor's Today. The link was only drawn when the role navigation was off. | `components/site/next-actions-today.tsx` |
| N6 | Money, Paperwork, Messages and Job activity answered "not found" unless a setting was on, although menus could still link to them. | `notFound()` behind flags |
| N7 | Three pages (company Documents, the site's Drawings and Documents, and the job programme) drew a second page body inside the app's own. Screen readers then announce two main areas. This was found by the new journey test. | `<main>` nested in `app/admin/layout.tsx`'s `<main>` |

### Dashboards

| # | Finding |
|---|---|
| D1 | The owner's Today was about 15,000 px tall on a phone (about 18 screens). Most of it was 14 cards of about 500 px each for work that was with someone else. Each card repeated the same two sentences of small print and showed dates as `2026-11-12`. |
| D2 | A card saying "Nothing needs you right now" sat directly above "14 outstanding problems still need attention". Both were true (the problems were with the contracts manager), but they read as a contradiction. |
| D3 | Stopped work (safety stops and quality holds) appeared below the summary figures and the decision queue, not first. |
| D4 | Every job page said "Draft · unreleased: Installation is not authorised … Quality gates must be implemented". That is no longer true: work is released location by location through inspections and holds. |
| D5 | Every job page showed a literal `\n` on screen, from escape sequences written into the page markup. |
| D6 | Demonstration and test records sat alongside real ones with nothing to mark them apart except their names. Production has two "DEMO —" jobs and two "TEST" gangs. |

### Supervisor

| # | Finding |
|---|---|
| S1 | Each step of the day (morning checks, people, progress, inspections, handover) ended with "Back to site dashboard". The supervisor had to return to Today after every step to find the next one. |
| S2 | Nothing showed how far through the day they were, or what was still to do before leaving. |
| S3 | Today did not show who the office had planned on site. That was one screen away. |

### Subcontractor gangs

| # | Finding |
|---|---|
| G1 | The gang's home page told a gang with allocated work that it was "not set up on a job yet". That check is for invoicing set-up only. The page did not list the gang's jobs, fixes or stopped work. |
| G2 | The Fixes page showed a gang seven office count tiles and ten office filters before any fix. |
| G3 | The job page showed gangs the office's set-up gaps and 16 "Not recorded" fields. |

### Tests

| # | Finding |
|---|---|
| T1 | The main end-to-end regression ran with every setting off, so it tested the supervisor dashboard that production no longer uses. No test followed the experience production users actually get, for every role, from end to end. |

## 3. What changed

### One navigation for every role

There is now one navigation for every role (`lib/operations/role-nav.ts`, `components/admin/role-tabs.tsx`). It is no
longer behind a setting, and the original flat menu is gone.

| Role | Bottom bar on a phone or tablet (tabs on a desk) | Everything else |
|---|---|---|
| Owner | Today · Inbox · Jobs · Money · **Menu** | Grouped menu with search: the sidebar on a desk, the Menu tab on a phone or tablet |
| Contracts manager | Today · Inbox · Jobs · People · **Menu** | Same grouped menu (no money pages without money access) |
| Supervisor | Today · People · Inspect · Drawings (inside a site) | Site bar on every site screen: ← Today and Report an issue |
| Gang | Today · Fixes · Jobs | Work restrictions, from Today |

The office menu is grouped by how the work is done, with plain names:

- **Your day:** Today, Inbox
- **Jobs and sites:** Jobs, Planner, Sites (supervisor view), Materials, Instructions and handovers, Job documents
- **Quality and safety:** Stops and holds, Snags, Quality overview
- **People:** Gangs and workforce, Subcontractor onboarding, User access
- **Money:** Money overview, Job money, Customer invoices, Gang invoices, Startup expenses
- **Sales:** Customers, Tenders, Quotations, Estimator
- **Settings:** Business settings, Company documents (RAMS, COSHH), Email notifications, Website and enquiries

No page was removed and every existing link still works. Site alerts are now reached from Stops and holds, the page
they belong to. Search is the box at the top of the menu on every page; on a desk, Today no longer repeats it. The
header is compact on a phone, and page headings are smaller.

### Owner and office Today, in priority order

1. **Work that is stopped:** every active safety stop and quality hold, safety first, with its exact scope and a
   link to the record. It is never folded away.
2. **Summary figures:** six figures, smaller on a phone.
3. **Needs you:** the next action, then the rest of your own actions, then problems and work waiting on other
   people. Each item is a compact row with what, where and when, plus one button, and plain dates ("Overdue since
   Thu 12 Nov"). Rows for work with someone else open with a tap and say who it is waiting on. The explanation
   of each kind of item appears once, at the top of its list.
4. **Live jobs** and **Yesterday on site.**
5. **Planning: next 14 days.**
6. **Financial control** and **Administration.**

On a phone, Yesterday, Planning, Money and Administration fold to one line that summarises what is inside. On a
desk they are open. The owner's phone page went from about 15,000 px to about 6,800 px with the same records.

### The supervisor's day

- Every step's page (morning checks, people, progress, inspect, finish) and Today show **"Your day here"**:
  five steps, each ticked from today's saved records, so the supervisor can see what is done and what is left
  before leaving.
- Each step's page offers the next step. While the current step is still open, the link says "After this:"
  so nobody is nudged to skip it. After saving the morning checks, **Next step →** goes straight to the next
  unfinished step.
- Today shows who the office planned on site and whether each gang is confirmed, in one line that opens to the list.
- Snags are one tap from Today again.

The steps guide the day; they do not enforce anything. Stops, holds and the rules engine still decide what is
allowed, and Today still puts the most urgent thing first.

### Subcontractor gangs

- **Today** shows stopped work on the gang's jobs first, then its jobs (each opening its work areas and
  drawings), the fixes it has been asked to make, and its invoices. It no longer says the gang is "not set up on a
  job" when only invoicing is not set up.
- **Fixes** has the gang's own title and three counts. The office filters are folded away.
- The **job page** shows gangs only what has been recorded, without the office's set-up checklist.

### Demo and test records

Jobs whose reference starts `DEMO-` or `TEST-`, or whose name starts with the capitalised word DEMO or TEST, are
labelled **Demo record** on the jobs list, Today's live jobs, the supervisor's site list, the supervisor's Today and
a gang's Today (`lib/operations/demo.ts`). That is how the existing demo jobs are named. The check is strict about
capitals, so "Test kitchen refit" is not caught. Nothing is deleted or hidden: what to do with the demo records is
still the owner's decision.

### Job page

The literal `\n` is fixed, and no page draws a second page body inside the app's own. The permanent "Installation is not authorised" banner is replaced by **Still to set
up**, which lists only real gaps and explains that work is released area by area, with a link to see what is
released.

## 4. Settings and rollout

- `FEATURE_ROLE_SHELL` is no longer read. Navigation is the same for everyone. It can be removed from Vercel.
- `FEATURE_NEXT_ACTIONS` now defaults to **on**. It stays as an emergency switch: `off` brings back the earlier
  dashboards for everyone, and a role list still limits it. Production's current value
  (`supervisor,owner,contracts_manager`) keeps working exactly as today.
- No migration. The two migrations that are still waiting for the owner's approval
  ([command-centre-rollout.md](command-centre-rollout.md)) are unaffected. Until they are applied, the hosted app
  shows "arrives with the latest database update" where it did before. The supervisor's "Progress" step is
  hidden until the site diary exists.
- Rollback is Vercel's instant rollback to the previous deployment.

## 5. Tests

| Check | What it proves |
|---|---|
| `npm run typecheck`, `npm test` | Types, and 330 unit tests: navigation per role and money access, flags, Today rendering, permissions and money boundaries |
| `npm run test:journeys` (new) | The real app with default settings, signed in as owner, contracts manager, supervisor and gang. Checks each role's landing page and bottom bar, and opens every link on its tabs, menu and Today: none broken, refused or wider than a phone. Follows the supervisor's day step by step (checks → next step → people → progress → handover), a safety stop raised on site appearing first on the owner's Today on a phone and a desk, and money staying with money access. |
| `npm run test:e2e`, `test:admin-today`, `test:command-centre`, `test:pre-migration`, `test:portal` | The existing journeys, updated for the new menu names. `test:e2e` keeps proving the earlier dashboards behind the emergency switch, and with them every shared form. |
| `npm run test:ui`, `test:next-actions-ui`, `test:admin-today-ui`, `test:forms` | Components at 320, 390 and 820 px with 44 px touch targets |
| `npm run test:db` | Database functions and policies (no database changes in this work) |

`npm run stack:local` starts the app, database and seed records locally and keeps them running for review. Every
seed account signs in with the password printed on start-up.

## 6. Still outstanding

- **Owner decisions** (unchanged from the command centre rollout): applying the two waiting migrations, and what
  to do with the demo and test records in production. Nothing was deleted.
- **Earlier dashboards:** still in the code behind `FEATURE_NEXT_ACTIONS=off`. Remove them once this release has
  run in production without needing the switch.
- **Inspections:** the "Inspect" step depends on the office publishing inspection checks for each location and
  stage.
- **Devices:** tested in Chromium at phone, tablet and desk sizes. Not yet tried on a physical Samsung Galaxy tablet.
