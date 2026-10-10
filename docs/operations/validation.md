# Phase 1 validation — 10 October 2026

The foundation was validated locally on Node 24, PostgreSQL 17 and Chromium.
The architecture and delivery boundaries are in [architecture.md](architecture.md).

| Check | Result |
| --- | --- |
| Next.js production build including type checking | Passed |
| Application and invitation tests | 18 passed |
| Real PostgreSQL permissions, RLS and transactional acceptance | 147 checks passed |
| Phone/desktop browser boundary tests | 9 passed; 1 desktop-only skip for the phone menu |
| Shared mobile form retry/success checks | 2 passed |
| Independent security review | No remaining material findings |
| GitHub Actions acceptance workflow | Passed on the foundation commit |

Database coverage includes financial and tenant isolation, expired/revoked
allocations, original-uploader-only evidence, service-only upload completion,
immutable audit records, owner-controlled margin thresholds, concurrent
idempotency, stale edits and the absence of an installation-release bypass.

Browser checks use an unconfigured backend and prove public-page preservation,
responsive login, protected internal routes, private response headers and safe
invitation handling. The form harness tests the actual shared component's field,
file and request-key preservation on error, and resets only after success.

Estimator regression checks prove fixed pricework stays fixed when duration rises
and day-rate labour changes with duration. Tender conversion, programme-dependent
preliminaries, variations, notices and quality decisions are subsequent phases.

## Outstanding hosted acceptance

The owner confirmed new staging infrastructure is needed. Draft PR #4 revealed
an existing GitHub-connected Vercel project, which automatically deployed the
branch. Its review URL is recorded in [deployment.md](deployment.md); Vercel reports
it ready, but the cloud proxy rejects requests to that hostname with 403.
A dedicated Supabase staging project still needs creating. Neither management
credential is available in the running environment. Backend project
provisioning, migration against real Supabase Auth/Storage, email invitation
delivery, authenticated phone journeys, signed file verification against hosted
Storage and backup restoration remain unverified. Follow the required
staging checks in [deployment.md](deployment.md) before operational use.

No production merge, migration or deployment was performed. No inspection,
approval, signature, certification or demo business data was invented.

The feature branch is published for review in
[draft PR #4](https://github.com/paulthetiler/Tilespec/pull/4).
Its [acceptance run](https://github.com/paulthetiler/Tilespec/actions/runs/38058605062)
completed successfully, including a fresh dependency install, database tests,
production build and browser/form checks.
