# Phase 1 review deployment and acceptance

The feature branch is `feature/tilespec-operations-phase-1`. Deploy this branch to
a dedicated staging backend. This is a foundation, not an installation-authorising
system. Quality decisions, daily reporting, variations, payments and handover
belong to subsequent phases in [architecture.md](architecture.md).

## Account access and project creation

No TileSPEC backend or local Vercel project binding was found in this checkout.
The owner confirmed that new staging infrastructure is needed. Publishing draft
PR #4 subsequently revealed an existing GitHub-connected Vercel project named
`tilespec` under `paulthetiler-9580s-projects`; it automatically deployed the feature
branch. Reuse its preview environment rather than creating a duplicate project.
A dedicated Supabase staging project still needs creating. The cloud environment
currently has neither Supabase nor Vercel management credentials. Required token
names and API domains have been saved in environment settings for secure entry.
Do not paste tokens in chat or commit them.

- `SUPABASE_ACCESS_TOKEN`: Supabase management API access for project provisioning.
- `VERCEL_TOKEN`: Vercel account access for configuring the branch preview environment.
- API destinations: `api.supabase.com`, `api.vercel.com`, `api.github.com`.

These are provisioning credentials, not application environment variables. Use
existing free-tier capacity; do not upgrade a service plan automatically. If several
organisations or teams are available, explicitly select the owner's intended one.
Use a dedicated TileSPEC staging project, not the live ResinSpec backend.

Vercel reports the branch deployment ready at
[the review preview](https://tilespec-git-feature-tilespe-592971-paulthetiler-9580s-projects.vercel.app).
The cloud network proxy currently rejects requests to that hostname with 403,
so its contents and authentication configuration have not been verified here.
The exact hostname has been added to the environment's draft allowlist. A ready
deployment status does not prove hosted backend acceptance.

Once provisioned, configure the app's dedicated project values in secure Vercel
preview settings and the cloud environment:

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Exact dedicated staging project origin |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public connection key; not business authorisation |
| SUPABASE_SERVICE_ROLE_KEY | Server-only actual-file verification and upload completion, same project |

Business records always use the authenticated user client and RLS. The separate
service client is confined to quarantined file verification; it is never attached
to a user's session or used to render/query commercial records. No service key may
be placed in a `NEXT_PUBLIC_*` variable. Restrict access to deployment environment
settings and keep preview credentials separate from production.

## Supabase configuration

Apply the reviewed foundation migration only to the dedicated staging project.
See [database instructions](../../supabase/README.md) for bootstrap SQL, RLS and
the immutable private evidence protocol. Create the real owner's Auth UUID and
explicit organisation membership using trusted administration. Never create the
first owner from an arbitrary website visitor.

Disable public signup/anonymous auth. Configure the exact staging application
origin as the Auth Site URL and allow only intended staging redirects. Invite staff
using Supabase Auth administration, then grant their UUID a role from Team access.
Membership and contract/package allocations are separate from successful login.

Use the following email template links (HTML escapes the ampersand):

```html
<!-- Invite user -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=invite">Set your TileSPEC password</a>
<!-- Reset password -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Reset your TileSPEC password</a>
```

The handler verifies the single-use hashed token and redirects to a clean password
page. It grants no membership or financial permission. Passwords must have 12–128
characters and matching confirmation. The owner can send recovery links through
trusted Auth administration; the public app has no signup or staff-discovery route.
Check actual email delivery and relevant Auth limits before inviting live staff.
Do not log or retain invitation tokens or passwords.

## Vercel review deployment

Use Next.js, Node 24, `npm ci`, and `npm run build`, repository root as app root.
Deploy the feature branch as a preview; do not merge or migrate production. Preview
runtime needs all three application variables above. Missing backend configuration
shows a sign-in configuration state and redirects every `/admin` path; it never
renders demo or internal financial data.

Private uploads support PDF/JPEG/PNG up to **4 MiB**, below Vercel's 4.5 MB request
ceiling including bounded multipart fields. Files are checked against their actual
signature/hash after storage upload, kept unreadable while pending, and served as
attachments by authorised signed downloads expiring after 60 seconds. A pending
revision can be resumed by its original uploader with the original matching file.
There is no automatic evidence deletion/overwrite. Storage credential failure is
an explicit upload failure, not an approval.

## Automated validation

```bash
npm ci
npm run typecheck
npm test
npm run test:db
npm run build
npx playwright install chromium
npm run test:browser
npm run test:forms
```

The SQL harness creates a disposable local cluster; it never reads a hosted
database URL. Its minimal Auth/Storage platform schemas are test fixtures only.
Tests exercise actual PostgreSQL grants, RLS, checked RPCs, transactions and
two-session concurrent retries. Set `PG_BIN` when PostgreSQL is not discoverable.
The browser boundary suite launches its own local Next server with an explicitly
unconfigured backend; it tests public-page preservation, mobile menu, responsive
login and fail-closed internal routes. `PLAYWRIGHT_CHROMIUM_PATH` may point to an
installed Chromium binary. This suite does **not** claim authenticated Supabase
journeys passed. CI uses the same tests on pull requests.

The form harness uses the real shared React component in a temporary app outside
the production route tree. It proves errors preserve fields/file/request ID and
only confirmed success resets creation fields. It uses no authenticated backend
or simulated business records.

The original estimator calculations have regression tests: a 500 m² pricework
package remains £8,500 labour when productivity falls; a day-rate gang changes
from £4,800 to £9,000 as duration increases. The lump-sum 'other costs' field remains
unchanged. Separate programme-dependent preliminaries and approved tender
conversion are Phase 4; these are not represented as completed functionality.

## Required staging acceptance before operational use

Use clearly labelled test records in the isolated staging database. Do not create
fake inspection outcomes, approvals, signatures or production customer data.

1. Invite the owner and each role; consume email links, set passwords, login and
   sign out. Confirm invalid/expired links fail. Give no-member and inactive users
   no Admin access. Check cookie security on the HTTPS deployment.
2. Owner creates a draft school tiling contract, original budget, north/south work
   areas and measured packages. Assign an allocated manager, supervisor and two
   distinct installation teams. Test contract edits and stale-version rejection.
3. Confirm managers only see allocated contracts; owner grant/revoke controls
   financial access. Manager cannot lower the owner's target margin. Installers
   only see their package/area and never receive selling prices, company margin,
   payment terms or another contractor's rates in HTML, server responses or raw APIs.
4. Upload authentic test PDF/photo revisions. Verify pending state, original-file
   retry after refresh, tampered file denial, wrong-area/financial document denial,
   4 MiB limit and 60-second private attachment download. Try direct raw API
   completion as a user: it must fail. Confirm server verification works against
   real Supabase Storage metadata and a privileged key belonging to this project.
5. Review genuine audit targets and previous/new roles, grants, allocations and
   contract versions. Revoke access and retry files/records. Confirm duplicate
   submissions create one record and no actor can edit/delete audit history.
6. On actual phones, complete the contract/upload/assignment journeys; check touch
   controls, keyboard, portrait/landscape, connection failures and error recovery.
7. Record the preview URL and acceptance evidence in the PR. Every contract must
   still be draft/unreleased. Gate approvals are Phase 2, not a foundation toggle.

## Backup and recovery

Before using real business data, record the owner's retention policy and the
selected tier's available database backup controls. Maintain a protected database
export including immutable audit history plus a separate private-object backup
and manifest of revision IDs, object paths and SHA-256 hashes. Database backups do
not include Storage bytes. Rehearse restoration into another isolated backend,
verify hashes, rerun role tests and revoke staging test accounts. Restrict export
access and record the export/restore operator and date. These hosted controls and
the restore rehearsal remain outstanding until the staging project is available.
