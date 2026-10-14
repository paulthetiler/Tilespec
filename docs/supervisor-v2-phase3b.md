# Supervisor V2 Phase 3B

Phase 3B extends the existing `supervisor_issues`, `supervisor_issue_events` and
`supervisor_issue_photos` records. It uses the existing private
`supervisor-evidence` bucket, organisation membership, contract permissions,
location hierarchy and actual workforce history. It does not create a parallel
snag system or change permanent gang membership, payments or formal QA holds.

## Records and workflow

`20261014160000_snag_lifecycle.sql` is additive for historical records. New
location snags have `snag_status`; older morning-check findings keep that field
null and retain their existing workflow. The register includes both. Original
location, inspector, finding, linked inspection and repair instructions remain
immutable; the original inspection/checklist and allocation records are retained.

| Status | Meaning |
| --- | --- |
| `draft` | Findings recorded; photographs and submission still pending |
| `open` | Submitted finding, including a rejected or reopened repair |
| `assigned` | A gang or operative has been assigned rectification |
| `rectification_submitted` | Completion notes and verified photographs saved; still open |
| `reinspection` | Submitted repair awaiting an independent acceptance decision |
| `closed` | Independent authorised inspector accepted rectification |
| `cancelled` | Entered in error with a permanent explanation; record retained |

Checked database RPCs enforce each transition under a row lock, expected version
and per-actor request key. Events retain the actor, timestamp, previous/new status,
notes, snapshots and linked evidence. Assignment, rejected repair cycles,
responsibility decisions and original photographs stay in the history. A user
cannot edit the status directly to close a snag.

Responsibility is separate from repair assignment. Relevant actual workforce
periods and named operatives are shown for the location and installation stage;
plans do not prove attendance. Proposals snapshot the actual allocation and
attendance. Presence is evidence of work performed, not proof of fault. The
states are not assessed, proposed, accepted, disputed, under office review,
confirmed by office and unable to determine. No automatic liability charge or
payment deduction is made.

The site dashboard prioritises saved critical findings, repairs awaiting
reinspection, responsibility disputes and overdue repairs, then its existing
morning-check/workforce flow. Urgent snag creation is always available. Critical
findings are escalated for office review; escalation grants no stop-work or
release authority.

## Permissions and evidence

Supervisors use their assigned contract access to create findings, propose
responsibility, assign repair and reinspect. The office can review responsibility
and escalations across contracts it is authorised to manage. Critical or escalated
repairs require office acceptance. The person who submitted a repair cannot
accept it, including when that person has an office role.

Installer access requires existing package/location permission and explicit
repair assignment or a proposal naming their current team. They can respond to
the proposal and submit assigned repair notes/photos. They cannot rewrite the
original finding, delete evidence, confirm office liability decisions or approve
their own repair. RLS and database functions enforce these restrictions beyond
the UI. Historical workforce snapshots are excluded from installer event
responses.

JPEG and PNG photographs have separate original, rectification and reinspection
purposes. Each request is streamed with a 4 MiB plus 64 KiB multipart limit; an
individual image must be between one byte and 4 MiB and match its file signature.
The authenticated user reserves an immutable object path, hash, size, purpose,
actor and repair cycle, then uploads without overwrite. A server-only verifier
downloads the actual bytes, verifies signature/size/SHA-256 and completes that
exact reservation. The database also checks storage metadata and current actor
permissions. Business queries and lifecycle mutations continue to use the user
session and RLS.

A camera thumbnail is a local preview. Upload progress reaching 100% means bytes
were sent, not that storage was verified. Pending reservations cannot be viewed
as evidence or submitted as completed findings. Verified images are attached to
the relevant lifecycle event only when its action commits. Private viewing uses
an authorised route and a signed URL expiring after 60 seconds.

Retries use the same request key and original file/payload. A conflicting object
is accepted only after its actual bytes match the reservation. An uncertain
creation response locks the original findings for retry; an explicit validation
refusal permits correction. Once submission starts, its photograph IDs are
frozen. If submission is confirmed but the separate responsibility proposal fails,
the UI says the snag is submitted and retries only the proposal. After refresh,
open the saved draft/detail to inspect server status and continue. Removing an
unsaved camera selection removes only the local choice; it never deletes private
stored records or bytes. Abandoned reservations remain pending records rather
than becoming silently attached evidence.

## Deployment preflight

Use an isolated TileSPEC staging project and branch preview. Applying hosted
migrations or changing production still requires approval. Before deployment,
check the project's migration history, existing private bucket, grants and
policies using the read-only `supabase/inspection/snags-preflight.sql` report;
investigate every MISSING, ALREADY EXISTS or UNSAFE result. Preserve a database
backup and separate Storage-object backup. Apply
only missing migrations in filename order, with all migrations through Phase 3A
`20261014140000_location_inspections.sql` present before
`20261014160000_snag_lifecycle.sql`. Do not replay already applied migrations or
apply the test platform/seed files to a hosted project. Deploy the matching app
after the reviewed migration is available; lifecycle screens require its RPCs.

Set these in secure deployment settings for the same dedicated project:

| Variable | Scope |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Dedicated project origin |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public project connection key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only private-file verification/completion |

Never expose the service key with a `NEXT_PUBLIC_` prefix or copy it into source,
logs or saved setup scripts. Missing verification configuration fails before
creating a photo reservation. Verify Auth redirect settings, real invitation and
login flows, active memberships, supervisor contract assignments and installer
package access. Check private Storage metadata and signed viewing with actual
test images on the staging project before operational use.

## Validation scope

`npm test` covers parsers, eligibility, request snapshots, dashboard priorities,
multipart bounds and byte verification. `npm run typecheck` and `npm run build`
validate the application. `npm run test:db` uses a fresh local PostgreSQL cluster
with real application migrations, RLS, RPCs and concurrency checks; it never
consults a hosted database URL. `npm run test:browser` checks the unconfigured
public/authentication boundary. Forms/UI suites exercise their local fixtures.

`npm run test:e2e` uses the real local Next app and PostgREST against a disposable
database, with test Auth and Storage services. It checks authenticated workflow
and fault handling, including private evidence, without hosted project
credentials. These fixtures cannot establish that hosted Supabase Storage,
provider limits, email delivery, HTTPS cookies or preview deployment configuration
work. Run separate authorised staging acceptance with real roles and images,
including cross-organisation denial, upload failure, lost responses, multiple
repair cycles, independent closure and phone/tablet portrait/landscape use.

The local Storage fixture models the non-upsert permission path in official
Supabase Storage [v1.83.1](https://github.com/supabase/storage/releases/tag/v1.83.1),
pinned at `23f25e74de05119b8171fe704afb7422f5f106e8`.
[Upload authorisation](https://github.com/supabase/storage/blob/23f25e74de05119b8171fe704afb7422f5f106e8/src/storage/uploader.ts#L84-L99)
runs a caller-scoped create-object permission probe; the
[database implementation](https://github.com/supabase/storage/blob/23f25e74de05119b8171fe704afb7422f5f106e8/src/storage/database/pg.ts#L1561-L1601)
uses plain `INSERT` without `RETURNING`, and the probe transaction is rolled back.
[Final persistence](https://github.com/supabase/storage/blob/23f25e74de05119b8171fe704afb7422f5f106e8/src/storage/uploader.ts#L239-L305)
uses a superuser transaction after a caller-policy recheck. An authenticated
PostgREST `INSERT ... RETURNING *` fixture would demand additional SELECT access
and would not represent this upload path. The current policies therefore keep
pending new evidence hidden without adding uploader SELECT access. Legacy photo
uploads also use `upsert:false`: their scoped legacy INSERT policy permits the
object before the photo metadata is recorded, after which normal authorised
viewing is available. This source comparison does not replace checking the
Storage version and behaviour of the selected hosted project.
