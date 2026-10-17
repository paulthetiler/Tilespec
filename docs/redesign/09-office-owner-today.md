# Phase 3: real Office and Owner Today

This implements [issue #36](https://github.com/paulthetiler/Tilespec/issues/36)
and the Owner Today scope requested alongside it. `/admin` reads the caller's
saved, authorised job records and renders the existing shared Next Action engine.
It does not load the prototype or its fictional data.

## What a person sees

- **Office:** one **Do this next** action, every remaining action under **Then**,
  and **Waiting on others**, including real inspection requests, instructions and
  unfinished daily work. Current safety and quality restrictions stay explicit.
- **Owner:** decisions they can take, problems requiring attention, and work
  awaiting other people. A blocked independent decision opens its saved record
  without pretending that the current person can approve it.
- **Money:** a separate authenticated page. Today never queries commercial
  values or renders financial actions, even for an owner. Existing financial
  permissions still govern Money, commercial documents and their download routes.
- **Office navigation:** Today, Jobs, People, Paperwork. The owner keeps Today,
  Jobs, Money. **Everything else** retains all existing features.
- **Paperwork and messages:** paginated indexes of actual document revisions,
  instructions, QA requests and recent permanent handovers. Links open the
  original upload, download, messaging, inspection and correction workflows.

On small phones the next-action title appears above the fixed navigation. The
compact warning above it distinguishes safety stops from quality holds and
says that affected work remains stopped. Full recorded scopes and the complete
queue remain available below it, with jump links for waiting work and problems.

[Review the phone screenshots](../screenshots/office-owner-today/README.md).

## Data and permission boundaries

`loadOfficeSnapshot` uses the authenticated caller's Supabase client, explicit
organisation/contract scopes and the existing RLS. Paginated reads preserve all
active holds and append-only inspection requirements; contract-ID batches avoid
one request set per job. Read failures remain errors rather than empty queues.

The loader preserves current checklist revisions, exact location/package scope,
approval timestamps, current team membership and per-person acknowledgements
and handovers. It trusts the database's existing contract-access decision rather
than narrowing it again with a conflicting UTC/London calendar date.

Saved drafts without programme dates remain setup work. Legacy morning findings
retain their original workflow and history; their new engine reminder neither
invents snag severity nor creates or releases a hold. Task links open the exact
saved record, selected inspection location or original setup form.

No table, migration, policy, RPC, approval rule, audit record or financial
calculation changes. Rendering Today makes no business writes. Existing records
are not backfilled, rewritten or marked complete by the engine.

## Opt-in and rollback

Both `FEATURE_NEXT_ACTIONS` and `FEATURE_ROLE_SHELL` default **OFF** in every
environment. For an approved test environment, opt in with actual database roles:

```text
FEATURE_NEXT_ACTIONS=contracts_manager,owner
FEATURE_ROLE_SHELL=contracts_manager,owner
```

The flags work independently. Unsetting them restores the original overview and
navigation; the new paperwork/messages routes return 404. Supervisor and installer
boundaries remain unchanged. No production opt-in is performed by this branch.

## Verification

```bash
npm run typecheck
npm test
npm run test:db
npm run build
npm run preview:check
npm run preview:smoke
npm run preview:e2e
npm run preview:mobile
npm run test:browser
npm run test:forms
npm run test:ui
npm run test:next-actions-ui
npm run test:admin-today-ui
npm run test:e2e
npm run test:admin-today
```

`test:db` and both authenticated suites create disposable local PostgreSQL only.
The normal authenticated suite checks the original flag-off admin and all earlier
operations journeys. The Phase 3 mode opts in its child server for office/owner
roles and uses the real app, migrated business functions and RLS to exercise saved
job setup, uploads, QA/messages, reported findings, holds, roles and mobile layouts.
Dashboard GETs must preserve row counts and audit history.

The separate component harness uses read-only synthetic test dependencies outside
the application. It stresses complete queues, exact scopes and financial exclusion
at 320px, 390px and 820px, including a regression check that the next task is visible
on the first screen. Its fixtures never enter a production route. Auth and Storage
transports in local authenticated tests are fixtures; approved hosted validation
remains a separate rollout step.

## Production review prerequisites

1. Review the PR and phone screenshots before enabling either production flag.
2. Check that the existing reviewed schema is present, especially the daily
   instructions/QA/handover tables. The existing read-only
   `supabase/inspection/supervisor-daily-workflow-preflight.sql` helps inspect those
   prerequisites. This phase creates no new migration and does not apply earlier
   migrations to a hosted project.
3. Configure a preview-only role opt-in to review `/admin` against an approved
   backend and validate native hosted Auth, RLS, private downloads and Storage.
   A ready Vercel build alone does not establish that validation or enable flags.

No production environment, deployment or merge is changed by this work.
