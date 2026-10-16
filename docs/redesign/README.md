# TileSpec Admin: Apple-simple workflow redesign

**Status: Phase 1 only. Audit and clickable prototype, for review. Nothing here is wired into the app, merged or deployed.**

Everything in this folder is documentation and a static prototype. No application code, database schema, business logic or production data was touched. See "What changed" below.

## The idea

Every person should know what to do next within three seconds. Underneath, the app stays as strict as it is today. On the surface:

- four roles, each with at most four destinations
- one prominent next action per screen, chosen by rules from what has actually been saved
- plain English
- gates (mandatory controls) never dismissed, never completed by the system

## Open the prototype

Open `docs/redesign/prototype/index.html` in any browser. No server or build is needed.

1. Pick a person in the bar at the top. Try Dave (supervisor), Sam (office), Alex (owner), Marek (subcontractor).
2. Toggle **Phone** and **Desktop**.
3. Choose **Busy day** to see a stop, snags, an inspection request and unfinished work.
4. Tick **Backend reality check** to see which parts are already built and which are not.
5. Tick **Poor signal** to see a failed save keep everything you typed.

To see the system working across people: as Dave raise a STOP WORK, choose the Kowalski gang. Switch to Marek, send a fix, ask the office to check. Switch to Dave (he cannot decide it), then to Sam.

## Documents

| # | Document | Deliverable |
| --- | --- | --- |
| 1 | [Existing workflow audit](01-workflow-audit.md) | Audit: confusing navigation, hidden actions, tasks with no owner, missing handoffs, repeated entry, jargon, backend inventory, permission matrix |
| 2 | [Proposed navigation](02-navigation.md) | Four destinations per role, old to new map |
| 3 | [Screens](03-screens.md) | Mobile and desktop, screen by screen, with backend status |
| 4 | [Next Action rules and responsibility matrix](04-next-actions.md) | Gate or reminder, rule catalogue, independence, ordering, thresholds, parallel processes |
| 5 | [Reusable components](05-reusable-components.md) | What exists and will be reused |
| 6 | [Implementation plan](06-implementation-plan.md) | Small, reversible, flagged phases |
| 7 | [Acceptance tests](07-acceptance-tests.md) | Realistic end-to-end journeys and the no-training test |

## Headline findings

1. **The office and owner share an 11-link menu, shown twice** (once collapsed behind a button on a phone). Installers get it too and land on the office overview. ([N-1, N-2, A-1](01-workflow-audit.md))
2. **There is no "what next" for the office or subcontractors.** The supervisor has one, calculated in two different places. ([N-6, R-1](01-workflow-audit.md))
3. **Some tasks have no owner.** An ordinary snag with no gang, a tender that can never be closed, a new gang on site whose insurance has lapsed. ([R-2, R-3, R-4](01-workflow-audit.md))
4. **A control is promised but not built.** The overview says owner acceptance of a low margin is required before mobilisation. I found nothing that records it. ([R-5](01-workflow-audit.md))
5. **Subcontractors cannot see what was planned for them.** The database blocks it. ([H-1](01-workflow-audit.md))
6. **The same intention is entered twice.** A gang is planned, then each installer is given access to the package separately. ([D-1](01-workflow-audit.md))
7. **Two supervisor tiles go nowhere.** Variations and Dayworks lead to "will be added". Drawings are listed but cannot be opened. ([N-4, N-5](01-workflow-audit.md))
8. **The strongest controls are already right** and are preserved: independent release, repairer is not re-inspector, unknown applicability never releases, append-only audit and cover records. ([1.2](01-workflow-audit.md))

## Decisions needed before Phase 2

1. Approve the four roles and destinations (section 2.2). In particular: should the subcontractor have three destinations, and should "Risks" and "Money" be separate owner destinations?
2. Approve the plain-English vocabulary (audit 1.3). It changes screen labels only.
3. Approve the thresholds in [4.7](04-next-actions.md): 10:00, 15:00, 17:30, 3 days, 7 days, 21 days.
4. Approve the gate and reminder list in [4.3](04-next-actions.md). Which items would you add or move?
5. Decide on each backend item: B1 (gang reads its own plan) and B5 (tender status) are small and unlock the most. B3 (owner margin acceptance) closes a promised control. B7 (expired cover blocks planning) and B8 (package access from a plan) change behaviour and are optional. B2, B4, B6 are larger.
6. Confirm the first build is Phases 2 to 4 (rules engine, supervisor Today, role shell) behind flags, with no schema change.

## What the prototype is and is not

| Is | Is not |
| --- | --- |
| Fictional data in the real table shapes | Connected to any database |
| The real rules run in the browser, tested | A second implementation to ship |
| Honest about gaps: variations, claims and owner sign-off are shown as not built | A promise those exist |
| Using the official TileSPEC logo, palette and fonts | A rebrand |

## Checks

```bash
node --test docs/redesign/prototype/rules.test.mjs   # 24 rule tests
node docs/redesign/prototype/smoke.mjs               # 648 screen openings
node docs/redesign/prototype/e2e.mjs                 # 13 clickable journeys
node docs/redesign/prototype/shots.mjs               # regenerate screenshots
```

The last three need Playwright (already a dev dependency) and a Chromium: `npx playwright install chromium`.

## What changed

The existing `npm run typecheck` and `npm test` (111 tests) pass on this branch, unchanged.

Only files under `docs/redesign/` were added. `git diff --stat main -- . ':!docs/redesign'` is empty. The existing CI workflows are path-filtered and do not run for this change.

## Prototype files

| File | Purpose |
| --- | --- |
| `prototype/index.html` | Entry, review bar |
| `prototype/data.js` | Fictional scenario data in the real schema shapes |
| `prototype/rules.js` | Next Action rules (read-only) |
| `prototype/rules.test.mjs` | Rule tests |
| `prototype/ui.js`, `screens-site.js`, `screens-office.js` | Shell, components, screens |
| `prototype/styles.css` | TileSPEC palette and fonts, 52 to 60 px targets |
| `prototype/smoke.mjs`, `e2e.mjs`, `shots.mjs` | Automated checks and screenshots |
| `screenshots/` | Phone and desktop screenshots referenced from the documents |
