# TileSpec Admin: Apple-simple workflow redesign

**Status: Phase 1 was squash-merged into `main` as `9cebbbe`. Phase 2 continues the seven saved commits through `cb0ce756` on a fresh branch, without replaying Phase 1. The shared rules engine, Supervisor Today and role navigation are behind flags that stay off by default in every environment. No schema changes or production rollout. See [08-review-response.md](08-review-response.md) for scope and validation.**

The documents describe the design. The code is in `lib/operations/next-actions/`, `lib/operations/role-nav.ts` and `components/`. The mobile preview in `docs/redesign/prototype/` runs the same engine as the app.

## The idea

Every person should know what to do next within three seconds. Underneath, the app stays as strict as it is today. On the surface:

- four roles, each with at most four destinations (owner and subcontractor have three)
- one prominent next action per screen, chosen by rules from what has actually been saved
- plain English
- required steps (gates), alerts and reminders kept honestly apart: only what the database really enforces is called a gate. None can be dismissed or completed by the system

## Open the mobile preview

Open `docs/redesign/prototype/index.html` in any browser, or serve the folder (`npx serve docs/redesign/prototype`) and open it on a phone. For a direct link to the phone view as a supervisor add `?role=u-dave&device=mobile`. The preview needs no build step (the bundled engine is committed).

On a Vercel Preview deployment the same fictional-data prototype is served at `/preview/workflow/?role=u-dave&device=mobile#/today`. That path is removed from production builds. Both `FEATURE_NEXT_ACTIONS` and `FEATURE_ROLE_SHELL` remain **off by default in every environment**, including previews. Reviewing the real Supervisor Today (`/admin/supervisor`, after sign-in) requires explicit role-scoped opt-in on an approved test environment; the static preview does not enable either application flag.

1. Pick a person in the bar at the top. Try Dave (supervisor), Sam (office), Alex (owner), Marek (subcontractor).
2. Toggle **Phone** and **Desktop**.
3. Choose **Busy day** to see a stop, snags, an inspection request and unfinished work.
4. Tick **Backend reality check** to see which parts are already built and which are not.
5. Tick **Poor signal** to see a failed save keep everything you typed.

To see the system working across people: as Dave tap **Report an issue**, choose "Yes: safety stop", then choose the Kowalski gang. Switch to Marek, send a fix, ask the office to check. Switch to Dave (he cannot decide it), then to Sam.

## Documents

| # | Document | Deliverable |
| --- | --- | --- |
| 1 | [Existing workflow audit](01-workflow-audit.md) | Audit: confusing navigation, hidden actions, tasks with no owner, missing handoffs, repeated entry, jargon, backend inventory, permission matrix |
| 2 | [Proposed navigation](02-navigation.md) | Four destinations per role, old to new map |
| 3 | [Screens](03-screens.md) | Mobile and desktop, screen by screen, with backend status |
| 4 | [Next Action rules and responsibility matrix](04-next-actions.md) | Gate, alert or reminder, rule catalogue, independence, ordering, thresholds, parallel processes |
| 5 | [Reusable components](05-reusable-components.md) | What exists and will be reused |
| 6 | [Implementation plan](06-implementation-plan.md) | Small, reversible, flagged phases |
| 7 | [Acceptance tests](07-acceptance-tests.md) | Realistic end-to-end journeys and the no-training test |
| 8 | [Review response and Phase 2](08-review-response.md) | How each review point was addressed, feature flags, configuration, how to try it |

## Headline findings

1. **The office and owner share an 11-link menu, shown twice** (once collapsed behind a button on a phone). Installers get it too and land on the office overview. ([N-1, N-2, A-1](01-workflow-audit.md))
2. **There is no "what next" for the office or subcontractors.** The supervisor has one, calculated in two different places. ([N-6, R-1](01-workflow-audit.md))
3. **Some tasks have no owner.** An ordinary snag with no gang, a tender that can never be closed, a new gang on site whose insurance has lapsed. ([R-2, R-3, R-4](01-workflow-audit.md))
4. **A control is promised but not built.** The overview says owner acceptance of a low margin is required before mobilisation. I found nothing that records it. ([R-5](01-workflow-audit.md))
5. **Subcontractors cannot see what was planned for them.** The database blocks it. ([H-1](01-workflow-audit.md))
6. **The same intention is entered twice.** A gang is planned, then each installer is given access to the package separately. ([D-1](01-workflow-audit.md))
7. **Two supervisor tiles go nowhere.** Variations and Dayworks lead to "will be added". Drawings are listed but cannot be opened. ([N-4, N-5](01-workflow-audit.md))
8. **The strongest controls are already right** and are preserved: independent release, repairer is not re-inspector, unknown applicability never releases, append-only audit and cover records. ([1.2](01-workflow-audit.md))

## Decisions still needed

1. Approve the vocabulary and the three alert wordings in [4.2](04-next-actions.md).
2. Approve the working-hours defaults and offsets in [4.7](04-next-actions.md). They are configuration, not code.
3. Decide on each backend item: B1 (gang reads its own plan) and B5 (tender status) are small and unlock the most. B3 (owner margin acceptance) closes a promised control. B7 (expired cover blocks planning) and B8 change behaviour and are optional. B2, B4, B6 are larger. Until each exists, nothing on screen depends on it.
4. Approve a staged rollout: `FEATURE_ROLE_SHELL` and `FEATURE_NEXT_ACTIONS` for one role first (for example `supervisor`).

## What the prototype is and is not

| Is | Is not |
| --- | --- |
| Fictional data in the real table shapes | Connected to any database |
| The **real** shared engine, bundled from the TypeScript source and tested | A separate copy of the logic |
| Honest about gaps: nothing is shown for variations, dayworks, claims, tender replies or owner sign-off, because no record exists for them | A promise those exist |
| Using the official TileSPEC logo, palette and fonts | A rebrand |

## Checks

```bash
npm run typecheck        # tsc --noEmit
npm test                 # existing regression suite plus Phase 2 rules, loader and permission tests
npm run preview:check    # the bundled engine in the preview matches the TypeScript source
npm run preview:smoke    # 624 screen openings
npm run preview:e2e      # 17 clickable journeys
npm run preview:mobile   # 320px and 390px review journeys; set SCREENSHOT_DIR to keep captures
node docs/redesign/prototype/shots.mjs   # regenerate screenshots
```

After changing anything in `lib/operations/next-actions/`, run `npm run preview:build` to refresh `prototype/engine.js`. The preview scripts need Playwright (already a dev dependency) and Chromium: `npx playwright install chromium`.

## What changed

Application code changed only behind flags that are off by default:

- `lib/operations/next-actions/` (new engine), `lib/operations/role-nav.ts` (new)
- `app/admin/supervisor/sites/[id]/page.tsx` renders the new Today only when `FEATURE_NEXT_ACTIONS` is on; the old page is otherwise untouched
- `app/admin/supervisor/sites/[id]/report/page.tsx` (new) and `app/admin/money/page.tsx` (new), both 404 when the flag is off
- `app/admin/layout.tsx` renders the role tabs only when `FEATURE_ROLE_SHELL` is on
- `components/site/site-nav.tsx`, `components/holds/create-hold.tsx` and `app/admin/holds/new/page.tsx` gained optional props with unchanged defaults

No migration, table, policy, RPC, financial calculation or quality control was touched. Existing records, permissions and audit trails are as before.

## Prototype files

| File | Purpose |
| --- | --- |
| `prototype/index.html` | Entry, review bar |
| `prototype/data.js` | Fictional scenario data in the real schema shapes |
| `prototype/engine.js` | **Generated** bundle of `lib/operations/next-actions` (do not edit; `npm run preview:build`) |
| `prototype/preview-engine.js` | Thin adapter exposing the engine to the screens |
| `prototype/ui.js`, `screens-site.js`, `screens-office.js` | Shell, components, screens |
| `prototype/styles.css` | TileSPEC palette and fonts, 52 to 60 px targets |
| `prototype/smoke.mjs`, `e2e.mjs`, `shots.mjs` | Automated checks and screenshots |
| `screenshots/` | Phone and desktop screenshots referenced from the documents |
