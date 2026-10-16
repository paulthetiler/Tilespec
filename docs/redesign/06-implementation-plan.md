# 6. Implementation plan

**Status.** Phase 1 (audit and prototype) was reviewed and the direction approved with eight review points, all addressed in this branch (see `08-review-response.md`). **Phase 2 is built behind feature flags that are off by default**: the shared rules engine, Supervisor Today and role-specific navigation. There are no schema changes. Nothing is merged or deployed until approved.

## 6.1 Ground rules for every phase

| Rule | How it is kept |
| --- | --- |
| Small and reversible | Each phase is one pull request, behind a flag, deletable without a data change |
| No wholesale rewrite | Existing pages stay reachable. New screens call existing functions and components (section 5) |
| No schema change without approval | Phases 1 to 6 change no table, policy or function. Phase 7 items each need a separate approval |
| Records, permissions, audit trail, financial calculations, quality controls preserved | Nothing in section 1.2 is edited. Regression tests listed per phase |
| Role scoping before display | Money and other people's work are removed in the rules, then checked again by row-level security, which is unchanged |
| Flags | `FEATURE_NEXT_ACTIONS` and `FEATURE_ROLE_SHELL`. Off by default. Value `1` or `all` turns a flag on for everyone, or a comma list of roles (for example `supervisor`) stages it. A typo turns it off. Rollback is unsetting it |
| Parallel run | Old and new navigation can be switched per user for a period before any old page is retired |

## 6.2 Phases

| # | Phase | Scope | Likely files | Schema | Flag | Verification | Rollback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Approval | Review this branch, answer the questions in the README | none | none | n/a | Written approval | n/a |
| 1 | Audit and prototype | Done and reviewed | `docs/redesign/**` | none | n/a | `smoke.mjs`, `e2e.mjs` | Close the pull request |
| 2 | **Built (Phase 2).** Shared rules engine | One TypeScript engine in `lib/operations/next-actions/`, one loader that reads existing tables with the user's own access, config derived from working hours. `rules.js` is deleted and the preview runs the bundled engine | `lib/operations/next-actions/*`, `scripts/build-preview-engine.mjs`, `tests/next-actions.test.ts` | none | `FEATURE_NEXT_ACTIONS` | `npm test` (38 engine tests), `npm run preview:check` | Delete the folder |
| 3 | **Built (Phase 2).** Supervisor Today and Report an issue | Replace the inline logic on the site page with the engine. Show the hero, Then, Waiting, Saved today. Every button goes to an **existing** page or form | `supervisor/sites/[id]/page.tsx`, `components/next-actions/*` | none | `FEATURE_NEXT_ACTIONS` | Playwright supervisor journeys. Compare against `docs/screenshots/supervisor-simple/`. Existing tests green | Flag off restores the current page |
| 4 | **Built (Phase 2).** Role shell | Four-destination bar and rail. Office and owner Today. Installers stop landing on the office overview | `app/admin/layout.tsx`, new shell component | none | `FEATURE_ROLE_SHELL` | Navigation tests per role. Axe accessibility. Old links still work | Flag off restores the 11-link nav |
| 5 | Office job page | One job page with set-up steps. Sheets call the existing actions (`plan_allocation`, location builder, package assignment, requirements, templates, insurance record) | `contracts/[id]/page.tsx`, `components/office/*` | none | `JOB_PAGE` | Existing office tests. Same request keys and audit events | Flag off |
| 6 | Owner Money (Risks now lives under Today) | Read-only views over existing budget fields and register functions | new pages | none | `OWNER_VIEWS` | Money filtered for office without access. Budget numbers equal `budgetSummary` | Flag off |
| 7 | Backend additions, each separately approved | B1 gang reads own plan. B5 tender status. B3 owner margin acceptance. B2 gang message. Later: B4 variations, B6 claims. Optional: B7, B8 | `supabase/migrations/*`, RPC contract tests, RLS tests | **Yes, one per item** | One per item | pgTAP or existing `tests/db` and `tests/rpc-contract` style tests for each policy. Security review | A down migration per item. Flag off hides the UI |
| 8 | Subcontractor Today | Needs B1. Until then installers see their packages and fixes only | `components/next-actions`, new page | B1 | `SUB_TODAY` | Subcontractor sees no money, no other gang | Flag off |
| 9 | Retire | Remove old navigation and tiles only after a parallel run and sign-off | many deletions | none | none | Redirect map from section 2.4. No broken bookmarks | Revert the pull request |

Ordering gives value early. Phases 3 and 4 reach supervisors and the office before any backend change.

## 6.3 What each phase must prove

| Phase | Must show |
| --- | --- |
| 2 | The engine is read-only. No approve, release or authorise function exists. Gates cannot be dismissed. Independence cases from section 4.4 pass |
| 3 | A supervisor finishes the morning routine without opening a menu. Failed mandatory inspection still blocks. Offline and failed saves keep entries |
| 4 | Every role has at most four destinations. Back works everywhere. Keyboard and screen reader reach every destination |
| 5 | The same actions produce the same database rows and audit events as today |
| 6 | Office without `financial_access` sees no figure anywhere |
| 7 | New policies do not widen existing access. A gang sees only its own gang |
| 8 | Subcontractor acceptance tests in the next document |

## 6.4 Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Rules disagree with a database rule | Rules are advisory. The database still refuses. A test compares rule output to `work_release_status` for the same data |
| Next action is wrong for a case we did not think of | "Show everything" remains one tap away. Existing registers stay |
| Performance of deriving actions on every load | Reuse the existing register functions that are already paginated. Measure before enabling for the owner view |
| Users distrust a screen that says "nothing to do" | The screen says what it checked and when. Saved today shows the last actions |
| Reminder times are wrong for a job | Derived from each job's working hours with a configurable default and offsets (4.7). Reminders only, never a gate |
| Scope creep into variations and claims | Not in phases 2 to 6. No control for them is shown anywhere until the records exist |

## 6.5 Size of each change, in technical terms

| Phase | Touches | Invasiveness |
| --- | --- | --- |
| 2 | New pure TypeScript module and tests | None to existing code |
| 3 | One page and new presentational components | Low. One file replaced behind a flag |
| 4 | Layout and a shell component | Medium. Layout is shared, so the flag is tested for every role |
| 5 | One page and sheets that call existing actions | Medium |
| 6 | New read-only pages | Low |
| 7 | Migrations and RPCs | High per item. Each is reviewed on its own |
| 8 | One new page | Low once B1 exists |
| 9 | Deletions | Low if the parallel run is clean |
