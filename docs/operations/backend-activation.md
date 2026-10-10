# Backend activation checkpoint

Backend activation precedes Phase 2 QA development. The existing application is
`https://tilespec.vercel.app`, with Admin at `/admin`. Phase 1 PR #4 is merged into
`main` at `6f9c9f11723170668e7dabbe182bc8fa0785544e`; GitHub reports its Vercel
deployment successful. This does not establish working authentication.

The Phase 2 branch is `feature/tilespec-phase-2-backend-qa`. No Phase 2 gate code
or migration has been implemented at this checkpoint.

## What the login message establishes

`lib/supabase/config.ts` requires both `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A missing value, rejected key type or
invalid URL makes the configuration unavailable before any Auth/database call.
The key can be `sb_publishable_*` or a legacy JWT whose role is `anon`. A secret
or service-role key is rejected. The URL must be a clean HTTPS project origin.

An integration supplying only `NEXT_PUBLIC_SUPABASE_ANON_KEY` does not meet the
current application variable names. Check actual Vercel settings before treating
this possible mismatch as the cause. Also inspect `/login` without a query string:
`?reason=configuration` forces the notice even if configuration is now valid.

An absent `SUPABASE_SERVICE_ROLE_KEY` prevents private upload verification, not
sign-in. Missing database membership, failed migrations or Auth service errors
produce different states. Do not attribute this notice to those failures without
evidence.

## Account access required

The running cloud environment has no Supabase/Vercel management tokens or app
bindings. The saved requirements have no secret values and remain unpublished.
Consequently deployed variable values, Supabase project inventory, migration
history and owner account state cannot yet be inspected. Do not describe this as
proof that the hosted variables are absent.

Paul must add `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` through secure cloud
environment settings, then review/save and publish the saved draft, including
the required API and application domains. Never paste tokens or a password into
chat. Supply Paul's intended owner email separately; email is not a role grant.
The tokens must have access to the intended Supabase organisation and the Vercel
team `paulthetiler-9580s-projects`, project `tilespec`.

## Inspect and reuse before creating anything

1. List accessible Supabase projects and the existing Vercel integration. Identify
   which project the Vercel Production and Preview variables actually reference.
   Record variable names, scope, validity and matching project; never print keys.
2. Verify project ownership, intended environment and the selected service tier.
   Reuse a suitable existing dedicated TileSPEC project. Do not create a duplicate
   or upgrade a plan automatically.
3. Run `supabase/backend-preflight.sql` through trusted database administration.
   It is read-only and queries catalogs, not customer or financial records.
   Review migration history, object collisions, private helpers, Auth triggers,
   grants and complete Storage policy expressions.
4. Confirm the backend is compatible before applying anything. The foundation
   migration creates objects and a bucket without replacement; it is transactional
   and must not be rerun after application. It also revokes execution on all
   `private` functions. A populated/shared backend therefore needs a separate
   compatibility review. ResinSpec has different audit/private helpers and is
   unsuitable for blind reuse. Auth settings and Storage policies are shared
   project configuration, not isolated per website.

## Activation and owner verification

1. Inventory backup/recovery arrangements and existing data before migration.
   Apply missing migration versions in order using trusted administration. The
   only current version is `20261010090000_operations_foundation.sql`. If an
   existing application matches its schema but lacks a migration-history entry,
   investigate before applying or marking a version complete.
2. Configure matching URL/publishable key in Vercel Preview and Production, as
   appropriate to the explicitly selected backends. Keep the service-role key
   server-only and in the same project. Rebuild/redeploy the intended environment:
   `NEXT_PUBLIC_*` variables are inlined during the build.
3. Disable public/anonymous signup, configure the exact deployed Auth Site URL and
   redirects, and install the invitation/recovery token-hash templates documented
   in `deployment.md`. Check email delivery before reporting invitation success.
4. Invite the real Paul using the supplied email. Bootstrap his actual Auth UUID
   as the active `owner` member through trusted SQL, following `supabase/README.md`.
   Reuse his existing account/organisation if present; do not duplicate them or
   infer ownership from email/user metadata. Do not seed business inspections.
5. Paul chooses his password through the secure invitation flow. Do not request
   his password in chat. Verify an actual owner session can load `/admin`,
   `/admin/team` and `/admin/estimator`, then sign out and sign in again.
6. Verify unauthorised, inactive and allocated site accounts against server routes
   and raw database/file APIs. Check secure cookies, private uploads and authorised
   signed downloads against the real project. Use isolated accounts/data for role
   tests; do not fabricate production approvals.
7. Test deployed desktop and phone sign-in and navigation. Record the exact URL,
   deployment, backend and observed outcomes. Only then begin Phase 2 QA work.

Phase 2 production merge remains subject to owner approval after preview acceptance.
