# Supervisor V2 Phase 3C

This phase records formal quality holds and safety stop-work restrictions, verified corrective evidence and independent office release decisions. It builds on merged PRs #27–#30; it does not replace or rewrite their inspection, snag, workforce or document records.

## Database and deployment

Apply these reviewed migrations in order, after Phase 3B:

1. `20261015090000_mandatory_inspections.sql`
2. `20261015091000_work_holds.sql`

No hosted migration is applied by the development or acceptance scripts. The scripts create disposable local PostgreSQL databases only. Production deployment and hosted migrations require approval. Run the read-only preflight report before an approved staged deployment. Take the existing deployment backup and test the migrations against a representative staging copy before production approval.

The evidence API uses the existing private `supervisor-evidence` bucket and the existing server-only, same-project Storage verifier. JPEG/PNG photographs are bounded to 4 MiB, hashed, reserved through the authenticated RPC, uploaded without overwrite and downloaded by the verifier to compare the actual bytes. Completion is service-role only. Pending objects cannot be read as saved evidence; signed reads expire after 60 seconds. Operational PDF and other supporting documents use existing verified `document_revisions`, including their private download route. No new public bucket, browser service key or competing document repository is introduced.

Deploying application code before the approved migrations shows an unavailable-feature message in the supervisor and office overview; this never means zero restrictions or permission to proceed. Formal hold pages need the migrations to operate.

## Scope and work status

A hold covers its saved contract, selected location and descendants, optional work package and selected installation stage. An explicitly selected entire-site scope covers all locations. A blank stage covers all installation activities. Free-text activity notes explain the concern and do not narrow this restriction. Unrelated branches, stages and packages retain their own status.

`work_release_status` derives the current result from persisted holds, critical snags, configured requirements and saved independent release decisions. It never stores a global site release Boolean. Unknown applicability remains unassessed; outstanding or failed mandatory requirements remain blocked. A passing inspection alone is not a work-release decision. Releasing one hold preserves every overlapping active restriction. A work-release decision identifies its office reviewer and time and applies only while current mandatory requirements remain satisfied.

The conservative baseline for normally inspected work with no explicit office release record is **Not assessed**. This phase authorises release through the hold review process; it does not silently convert an inspection-applicability approval into permission to proceed.

## Versioned inspection requirements

Office owners and assigned contracts managers configure stage applicability against verified operational specification or manufacturer document revisions, recording their basis. Decisions are immutable revisions. Required templates must have applicable mandatory checks or hold points. Applicable ancestor requirements accumulate; a narrower “not required” decision cannot cancel an ancestor hold point. Unknown scopes are never treated as approved.

New template checklist lines support `[mandatory]`, `[hold]`, `[evidence]` and the existing `[wet]` flags. These are optional metadata on a new version of the existing template model. Historical checklist JSON and inspection answer snapshots remain unchanged. New inspections snapshot applicable flags and verified evidence links. A mandatory or hold-point answer recorded as N/A remains a blocking result and cannot authorise work. No universal tiling tolerance or technical threshold is invented.

Release review checks every active leaf location and affected stage in a broad hold. Required passing inspections must follow the corrective action; linked failed inspections need a saved passing reinspection. New requirements, a superseded template or later failed mandatory result invalidate a current release claim.

## Lifecycle and independence

The supervisor can immediately save **STOP AFFECTED WORK** without a photograph. The first saved event creates the restriction and relevant in-application alerts. A connection error is an unconfirmed outcome; the page never claims that an unsaved button press stopped the site. Retries retain the same request key and exact payload.

The normal lifecycle is `active → correction_submitted → awaiting_release → released`. An assigned active team or operative, or authorised site staff acting on their behalf, submits verified correction evidence with completion time and notes. Original evidence or a documented explanation is required before requesting release. Office rejection returns the hold to active and opens a new correction cycle; all previous attempts and evidence remain visible.

Only the owner or an assigned contracts manager can authorise release. The raiser and anyone who submitted a correction in any cycle cannot release that hold. Installers cannot release it. Database checks also enforce role, current contract scope, exact evidence, mandatory inspections and unresolved source/critical findings. Release, supersession and entered-in-error decisions require an explicit review confirmation in the interface and a permanent independent office event. Supersession requires a live successor covering the original restriction; it cannot shrink a safety stop into a quality hold.

Every safety stop additionally requires a recorded principal-contractor or designated site-safety authority acknowledgement/authorisation after corrective work, including identity, role, reference, time and the office actor recording it. TileSPEC records that decision and never overrides statutory procedures or external controls. The acknowledgement is an office record of external authority, not an electronic signature or an independently authenticated external approval.

## Supervisor and office workflows

One-site supervisors land on their assigned site's dashboard. Office staff can choose a site directly. Morning checks, workforce confirmation, location inspection, snag reporting, stopping work, reviewing holds and finishing workforce records share the site context. Urgent actions remain accessible before checklist completion. Historical readiness, inspection, issue, snag, evidence and allocation records stay readable through their existing routes.

The office Quality control page shows saved restrictions, release requests, overdue correction, rejected requests, critical snags, inspection requirements and location-stage status. Filters use authorised contracts, branches, teams and stages. Read/unread alerts are persisted per recipient and checked against current contract permissions; email, SMS and push are not implemented or claimed.

## Verification and hosted acceptance

Local acceptance uses real migrations, PostgREST, authenticated Next routes/actions, business RPCs and RLS. Auth and Storage HTTP transports are local fixtures: image bytes are real and private Storage permission checks execute against PostgreSQL, but these fixtures do not establish hosted Supabase Auth or native Storage compatibility. The Phase 3B pinned native Storage permission-probe audit remains applicable because hold uploads use the same non-upsert reservation/verification flow.

The authenticated runner uses an explicit child-only `TILESPEC_E2E_OUTPUT=1` setting and its own ignored `.next/e2e` output. It clears that test namespace before startup so production/public-browser compiled modules cannot contaminate the fixture backend. It also compiles protected routes through read-only authenticated requests using the official SSR cookie encoder before a browser downloads the dev runtime; every journey still signs in through the actual password form and checks browser errors strictly. Default application output stays `.next`. Cleanup stops its processes and disposable database and restores only recognised generated TypeScript references, preserving unrelated working-tree edits.

Before an approved hosted deployment, verify the same-project server verifier credential, private bucket settings, real supervisor/installer/office sessions, camera uploads, private thumbnails and full-size signed reads. Verify revoked membership/contract permissions, actual independent release, safety-authority recording and lost-response retries against staged native Auth/Storage. Hosted credentials and live migrations are not exercised by the local suite.

Local verification passed: TypeScript, production build, 87 unit tests, 756 database assertions (including upgrade/security/concurrency), browser boundary checks (9 passed, 1 intentional desktop skip for phone-only navigation), 3 form checks and 18 office UI checks. The complete authenticated suite produced 62 PASS reports across Phase 2A/2B/3A/3B and Phase 3C A–P, with 48 screenshots. A final focused run also passed all 20 Phase 3C report groups after strengthening confirmation to re-read the saved hold version and release state; even HTTP 200 carrying the correct hold UUID without a saved decision cannot report success.

CI results and preview readiness are recorded in the draft pull request. Hosted Auth/Storage acceptance remains subject to the staged checks above.
