# Practical site supervisor — Phase 1

This change starts from `main` after PR #31. It simplifies the daily supervisor interface while retaining the existing workforce, morning readiness, versioned inspections, snag evidence, independent reinspection and hold-release systems. It does not edit either demo contract or seed production records.

## Daily journey

- A supervisor with one current site goes directly to that site's daily dashboard. Multiple sites use a short selector. The office retains its administrative navigation.
- The daily dashboard shows a personal greeting, site context, one next action, six everyday task links and a single prominent **FINISH TODAY** destination. STOP WORK is immediately available. Current restrictions retain their location, activity and reason; a completed checklist never grants permission to continue stopped work.
- Morning readiness uses eleven grouped YES/NO/NOT APPLICABLE questions. The two questions about obstructing trades and site-manager problems correctly treat YES as a blocker. Saved answers still create the existing office issues. Confirmation of actual people remains solely in the workforce system. The safety question explicitly refers to the site's actual briefing requirements and does not replace inductions or other required records. A photographed finding can be raised through the existing snag evidence workflow after saving the checks.
- Workmanship starts with location and stage. Only an applicable published template is presented. An office author can publish a nine-check workmanship starter after reviewing project applicability; approved templates are never silently replaced. Required checks and evidence remain enforced by the existing database rules. A reported hollow-sounding tile is recorded as an investigation issue against the installation system and project requirements.
- The supervisor's snag form focuses on location, category, verified photograph and short description. Existing assignment, responsibility, repair and independent inspection history remains accessible in details. The office's advanced workflow remains available.
- Office messages are persistent, site-scoped instructions with optional acknowledgement. QA requests identify a specific supervisor, location, stage and optional work package. The supervisor inspects the work and explicitly sends an actual saved result back to the office. Findings with issues remain findings with issues; task submission does not release holds or approve payment.
- A short permanent handover records work completed, problems, tomorrow's materials, areas needing attention and office information. Optional workforce finishing calls the existing Phase 2B function in the same transaction. It reuses existing attendance and records the actual finish time. Work starting at or after that time stays open for separate review.

## Persistent records and permissions

The hold alert stream describes immutable hold events, so it is not repurposed for arbitrary office messages. One bounded daily inbox uses `supervisor_office_items`, with append-only `supervisor_office_acknowledgements` and `supervisor_qa_submissions`. `site_handovers` stores handover text and references to existing actual allocations.

Writes use the signed-in session and checked security-definer functions. Existing current organisation, role and dated contract-assignment helpers decide access. Only authorised office users create instructions and requests. Targeted instructions are visible to the recipient and authorised office; supervisors cannot enumerate the member directory. Only the assigned supervisor can submit a genuine subsequent inspection for the exact requested scope. Records are append-only, audited and safe to retry with the same request key and payload. Failed or uncertain saves retain entries and show no success until the saved result is confirmed.

No financial approval, hold release or specification-authorisation authority is added. Existing security and Phase 3C specification-version checks remain in force.

## Migrations requiring review

Apply neither migration to hosted Supabase without approval:

1. `20261015130000_supervisor_daily_workflow.sql` — accepts both historic ten-answer and new eleven-answer readiness records; adds the daily inbox, acknowledgements, QA submissions and handovers with current-permission RLS and checked functions.
2. `20261015131000_hollow_workmanship.sql` — wraps the retained, revoked Phase 3C inspection implementation to normalise reported hollow-sound findings to investigation issues. Original template snapshots, inspection records and permission checks remain in place.

Read-only preflight checks are in `supabase/inspection/supervisor-daily-workflow-preflight.sql`. Validate schema drift, existing data and grants before a separately approved hosted rollout. Automated database and authenticated browser checks use disposable local databases only. The browser harness supplies local Auth and Storage HTTP transport; it does not replace the real business functions or row-level policies. Hosted Auth/Storage integration should also be verified in an approved staging environment.

## Deliberately deferred

- Invoice-linked QA sign-off, invoice approval and payment are Phase 2. This phase only carries an office inspection request and the supervisor's saved findings.
- There is no existing persistent variation or daywork recording/approval workflow. The dashboard destinations state this clearly and direct supervisors to their agreed office process. They do not offer fake forms or approve rates.
- The next commercial stage needs the instructing person, work description, quantities, labour hours, evidence and office approval. Existing contract budgets and estimator figures are not treated as authorised variation or daywork records.
- No chat, external push messages, commercial deductions or automated payment adjustments are introduced.

## Verification

Run `npm test`, `npm run typecheck`, `npm run test:db`, `npm run test:browser`, `npm run test:forms`, `npm run test:ui`, `npm run test:e2e` and `npm run build`.

The authenticated acceptance runner includes a dedicated fictional site and Dave's supervisor account, without changing the existing fixture sites. It checks the A–M brief scenarios, genuine office acknowledgement/QA submission, workforce reuse, a hollow-sound investigation, verified snag photographs, scoped stop-work access, handover persistence, permissions, failed/lost responses and safe retries. It captures phone and tablet screenshots. Use `SCREENSHOT_DIR` to retain them. `E2E_SIMPLE_ONLY=1` is a focused diagnostic option; the final regression run must use the default complete suite.

Verified locally on 15 October 2026:

| Check | Result |
| --- | --- |
| Unit tests | 111 passed |
| Database regression | 823 checks passed, including permissions, concurrency and populated upgrades |
| Authenticated complete regression | 74 PASS reports: 62 existing and 12 new daily-workflow reports |
| Failed-save form browser harness | 4 PASS reports |
| Office UI regression | 18 PASS reports |
| Browser boundary regression | 9 passed; 1 intentional desktop skip of the phone-only navigation test |
| TypeScript and production build | Passed |
| Responsive capture | 64 screenshots; new screens checked at 390 px mobile and 820 px tablet |

[Review selected mobile and tablet screenshots](screenshots/supervisor-simple/README.md). The complete set is also uploaded by GitHub Actions.
