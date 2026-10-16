# 8. Review response and Phase 2

This answers the eight review points on Phase 1 and describes what Phase 2 adds. Phase 1 is already on `main` at `9cebbbe`; this delivery replays only the seven Phase 2 commits through `cb0ce756`. Phase 2 stays behind feature flags that are off by default. There are no schema changes or production rollout.

## 8.1 The eight review points

| # | Review point | What changed | Where to check |
| --- | --- | --- | --- |
| 1 | Remove the prominent Stop Work button. Use "Report an issue" as the everyday supervisor action. Keep the hold mechanisms, permissions and audit history | The header button is now **Report an issue**. One sheet asks "Does work need to stop here?" with No, "Yes: quality hold", "Yes: safety stop". In the real app `/admin/supervisor/sites/[id]/report` links to the **existing** snag, quality hold and safety stop forms. No new record type, no new permission, no change to release rules or audit events | `02-navigation.md` 2.7, `e2e.mjs` "Report an issue end to end", `tests/next-actions.test.ts` "report page" |
| 2 | Remove Risks as an owner destination. Risks and exceptions belong under Today. Keep Money separate | Owner has **Today, Jobs, Money**. Today has a "Risks and exceptions (n)" section | `role-nav.ts`, `e2e.mjs` "Owner has three destinations" |
| 3 | Subcontractor: Today, Fixes, Paperwork. No "Tell the supervisor" until the backend supports it | Exactly those three. "Tell the supervisor" and "Send a progress photo" removed. Paperwork is read-only. The plan card on Today is labelled preview-only (B1) | `e2e.mjs` "Subcontractor has Today, Fixes and Paperwork" |
| 4 | Review gate classes. Expired insurance prominent but not implied to be enforced. A critical snag must not mean all work stops | Three classes, defined by what the database really enforces: **gate** (G01 to G08, G10), **alert** (A01 critical snag unassigned, A02 insurance expired), **reminder**. Alerts always have `blocks: null` and `enforcedByBackend: false` and say so in plain words. A critical snag stops nothing by itself. G09 and G13 were renamed A01 and A02. G11 and G12 became reminders R15 and R16 | `04-next-actions.md` 4.2 and 4.3 |
| 5 | Do not hard-code reminder times | Times are derived from each job's own working hours with a configurable default and offsets. For "07:30 to 16:30" the defaults happen to give 10:00, 15:00 and 17:30. A test fails if a clock time literal appears in the rules | `config.ts`, `04-next-actions.md` 4.7 |
| 6 | No dead-end buttons for variations, dayworks, claims or margin approval | None exists in the engine, the app or the preview. Tender reply and decline also removed (B5). Margin below target (R14) is information only. A test fails if such an action appears | `tests/next-actions.test.ts` "no dead-end functionality", `smoke.mjs` |
| 7 | One source of truth | One engine in `lib/operations/next-actions/`. The supervisor Today page renders it (the old inline logic is only on the flag-off path). The preview runs the same code, bundled into `prototype/engine.js`. `rules.js` was deleted. Tests check both the component and the preview use it, and `npm run preview:check` fails if the bundle drifts | `npm run preview:check` |
| 8 | Keep the rest of the queue visible | The highest-priority action gets the main button. **Every** other task is listed under "Then (n)", never truncated, then "Waiting on others". The queue test proves every action lands in exactly one list | `engine.ts` `buildQueue`, `e2e.mjs` "The whole queue stays visible" |

## 8.2 What Phase 2 adds

| Piece | Behind flag | What it does | Fallback |
| --- | --- | --- | --- |
| Shared rules engine | none (library only) | Pure function from a saved-data snapshot to a list of actions for one viewer | n/a |
| Supervisor Today | `FEATURE_NEXT_ACTIONS` | Renders the engine's queue, with Report an issue in the header | Flag off: the existing page |
| Report an issue page | `FEATURE_NEXT_ACTIONS` | Three links to existing forms | 404 when off |
| Role navigation | `FEATURE_ROLE_SHELL` | Bottom bar (phone) or left rail (desktop) with 3 or 4 destinations per role, plus an "Everything else" menu that keeps every original link | Flag off: the existing menu |
| Money page | `FEATURE_ROLE_SHELL` | Read-only budgets against target. Requires `canReadFinancial` | 404 when off |

### Flags

Both default to off. Set in the server environment:

```text
FEATURE_NEXT_ACTIONS=1              # on for everyone ("1", "true", "on", "yes" or "all")
FEATURE_ROLE_SHELL=supervisor       # on for one role only (comma list of database roles)
```

A value that is not recognised turns the flag off. Both flags stay off by default in local development, Vercel Preview and production. The fictional-data preview at `/preview/workflow/` is independent of these application flags. Reviewing the real Supervisor Today requires explicit role-scoped opt-in in an approved test environment. Unset, empty and `off` values all keep the application flags disabled.

### Configuration (all optional)

`NEXT_ACTIONS_WORKDAY_START`, `NEXT_ACTIONS_WORKDAY_END`, `NEXT_ACTIONS_MORNING_OFFICE_AFTER_START_MIN`, `NEXT_ACTIONS_HANDOVER_REMINDER_BEFORE_END_MIN`, `NEXT_ACTIONS_HANDOVER_OFFICE_AFTER_END_MIN`, `NEXT_ACTIONS_INSURANCE_WARNING_DAYS`, `NEXT_ACTIONS_PLAN_HORIZON_DAYS`, `NEXT_ACTIONS_JOB_SETUP_LEAD_DAYS`, `NEXT_ACTIONS_OVERDUE_ESCALATES_AFTER_DAYS`. Details in [4.7](04-next-actions.md). Bad values are ignored.

## 8.3 What was deliberately not done

- No schema, policy, RPC or migration change.
- No change to release independence, critical-defect blocking, applicability, append-only audit or insurance records, or `budgetSummary`.
- The engine can only read. It has no function that approves, releases, authorises or writes.
- Only the supervisor Today is wired into the real app. Office, owner and subcontractor Today screens exist in the preview and engine but are not yet rendered by the app.
- No settings screen for the configuration (it would need storage, which is a schema change).
- The old `nextAction()` in `lib/operations/site-day.ts` is kept only for the flag-off page and is deprecated.

## 8.4 Verification

```bash
npm run typecheck
npm test                 # engine, flags, navigation, independence, owner counts, idle copy
npm run preview:check
npm run preview:smoke    # 624 screen openings
npm run preview:e2e      # 17 journeys
npm run preview:mobile   # narrow-phone screenshots and overflow checks
npm run test:browser     # existing boundaries plus both deployed preview URL forms
npm run test:next-actions-ui # real components at 320px, 390px and 820px with read-only fixtures
npm run build           # production build; both flags stay off unless explicitly set
```

Mobile screenshots for every screen are in `screenshots/`. The preview itself is `prototype/index.html`.

## 8.5 Phase 2 completion on the current main

`feat/phase-2-next-actions` starts at the Phase 1 squash commit `9cebbbe` and
replays exactly the seven Phase 2 commits from
`cursor/phase-2-next-actions-0e69`, ending at saved commit
`cb0ce7564259fe1af675e32a295822538477e7fe`. The initial replay has the same
tree as that saved commit, and `git range-diff` matches all seven patches.
The owner-count, idle-copy, action-routing and preview base-path fixes are retained.

Focused completion fixes keep the implementation within that scope:

- Both flags require explicit opt-in in every environment. The static fictional
  preview remains separate, and only supervisors use the real new Today page.
- Supervisor snapshot loading uses the signed-in identity instead of calling
  the office-only recipient directory. Reads remain scoped to the site and page
  through append-only inspection and hold histories.
- A required inspection matches the exact location, checklist, package and
  approval timestamp. Missing/replaced configuration stays outstanding; a room
  pass cannot clear a floor or an earlier specification revision. PostgreSQL
  fractional timestamp ordering is preserved.
- Acknowledgements and handovers complete only the relevant supervisor's work.
  Stopped-work cards retain the recorded activity and package, and reporting a
  snag never implies that an existing restriction has been released.
- Browser checks cover actual served preview assets and real components as well
  as the existing fictional-data prototype. The shared preview bundle is current.

All local checks listed in [7.1](07-acceptance-tests.md) pass. CI runs those
checks and the existing operations regression suite, and uploads the preview
and real-component mobile screenshots separately. The component fixtures do
not establish hosted Auth/RLS/Storage behaviour. No migration, permission,
financial calculation or live deployment was changed.
