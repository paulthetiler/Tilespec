# 5. Existing components and logic to reuse

The redesign is a new arrangement of what exists. The aim is to add as few new components as possible and to call existing logic rather than copy it.

## 5.1 Reuse as is

| What | Path | Use in the redesign |
| --- | --- | --- |
| `OperationsForm` | `components/operations/operations-form.tsx` | Every form. Already handles request keys (idempotent saves), a "Saving" state, and the "could not confirm it saved, your entries are still here" message that the poor-signal behaviour in the prototype copies. Has `freezeOnFailure` |
| `ConnectionStatus` | `components/site/connection-status.tsx` | The "Not saved" and offline cue on site screens |
| `SiteNav` | `components/site/site-nav.tsx` | Starting point for the supervisor's four-destination bar |
| `DailyForm` | `components/site/daily-form.tsx` | Morning checks and handover forms |
| `TeamCardView`, `PeriodView`, `UnplannedForm` | `components/site/workforce-day.tsx`, `unplanned-form.tsx` | People screen: confirm, not here, finish, add someone not on the plan |
| `OfficeMessageForm` | `components/site/office-message-form.tsx` | Office to supervisor instructions and QA requests |
| `WorkReleaseList` | `components/site/work-release-list.tsx` | Per-location "may work proceed" status inside a job and in Risks |
| `WorkmanshipForm` | `components/operations/workmanship-form.tsx` | The inspection form |
| `HoldForm`, `CreateHold`, `HoldPhotoUploader` | `components/holds/*` | STOP WORK sheet and the gang's fix with photos |
| `CreateSnag`, `SnagPhotoUploader`, `WorkCandidates` | `components/snags/*` | Raise a snag, the gang's repair photos, "who was working here" evidence |
| `LocationPicker`, `LocationTree`, `LocationBuilder` | `components/office/*` | Location choosers in every sheet; add locations |
| `PlanForm`, `PlanBoard` | `components/office/plan-form.tsx`, `plan-board.tsx` | Plan work sheet, Labour and Job plan lists |
| `SiteSetup` | `components/office/site-setup.tsx` | The existing set-up checklist: the Job screen's set-up steps start from it |
| `CompanyList`, `WorkforceView` | `components/office/*` | Labour: companies, cover, people to confirm |
| `AuditHistory` | `components/operations/audit-history.tsx` | Job "Recent activity" |
| `ContractFields` | `components/operations/contract-fields.tsx` | New job and the specification step |

## 5.2 Logic to call, not copy

| What | Path | Use |
| --- | --- | --- |
| `buildSiteDay`, `nextAction` | `lib/operations/site-day.ts` | The supervisor ordering is the base of the Next Action `order` field. The inline logic in the site page is replaced by one shared call (finding N-6) |
| Morning checks | `lib/operations/morning-checks.ts` | The 11 questions and which answer is an issue. The prototype reproduces the wording from here |
| Inspections and requirements | `lib/operations/inspections.ts`, `quality*.ts` | Applicability, blocking failures, templates, `everydayWorkmanshipChecks` |
| Snags and holds | `lib/operations/snags*.ts`, `holds*.ts` | States, labels, filters, input parsing, overdue test |
| `work_release_status`, `hold_register`, `snag_register` (database functions), `outstandingQa`, `unacknowledgedInstructions` (`lib/operations/daily.ts`) | `supabase/migrations/20261015091000_work_holds.sql`, `20261014160000_snag_lifecycle.sql`, `lib/operations/daily.ts` | Inputs to the rules. Rules sit on top and add no calculation |
| `insuranceSummary`, `EXPIRY_WARNING_DAYS` | `lib/operations/companies.ts` | G13 and R11. Latest entry per type. 30-day warning |
| `planCoversDay`, `londonDate`, `weekStart` | `lib/operations/planning.ts` | Date logic in every rule |
| `locationPath`, `indexLocations`, `subtreeIds` | `lib/operations/locations.ts` | Breadcrumbs ("Block B › Level 3 › Flat 31 › Bathroom") |
| `budgetSummary`, `contractWarnings` | `lib/operations/summary.ts` | Money screen, R08 and R14 inputs. The formula is not touched: profit equals value minus labour, materials and preliminaries, minus contingency |
| `canReadFinancial`, `canManageContracts` | `lib/operations/permissions.ts` | The single source for what money a person sees |
| `requireActor`, `requireSite` | `lib/auth.ts`, `supervisor/site-access.ts` | Server-side access. The new screens use them unchanged |
| Snag and workforce save confirmation | `lib/operations/snag-save-confirmation.ts`, `workforce-save-confirmation.ts` | Confirm a save really happened before showing "Saved" |
| Evidence helpers | `lib/operations/evidence.ts`, `photo-form.ts` | Photos for fixes and repairs |

## 5.3 Styles and brand

| What | Path |
| --- | --- |
| Palette: ink `#0f2a3a`, teal `#7fb8b0`, deep teal `#326e67`, paper `#f8fafb`, line `#dce3e6`, stop red `#9b3527` | `app/globals.css`, `app/admin/admin.module.css` |
| Fonts: Barlow Condensed (headings) and DM Sans (body) | `app/layout.tsx`, `globals.css` |
| Official animated logo | `public/tilespec-logo-animated.svg`. Copied unchanged into the prototype |
| Existing daily-flow tokens and 44 to 48 px targets | `components/site/daily.module.css` |

## 5.4 What is genuinely new

| New | Why |
| --- | --- |
| `lib/operations/next-actions/` (rules and types) | The read-only rules. Pure functions, unit-tested, no I/O of their own |
| A role-aware shell with four destinations | Replaces the 11-link navigation behind a flag |
| `Hero`, `ActionRow`, `StateChip`, `Sheet` | Four small presentational components shared by all screens |
| Subcontractor Today | Needs B1 |
| Everything labelled "New backend" in the prototype | Not built until approved |

Nothing in the first build rewrites an existing form, action, RPC or policy.
