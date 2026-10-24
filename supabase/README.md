# TileSPEC operational database

This is a complete Phase 1 foundation for a **dedicated TileSPEC project**. It does
not depend on, migrate, or connect to ResinSpec's database. Migrations contain no
business fixtures or invented inspections, approvals, signatures or release data.

## Provisioning and migration

1. Provision a separate TileSPEC staging Supabase project. Review the migration
   before applying it. Production migration is a separately approved operation.
2. Disable public sign-up and anonymous sign-in in Supabase Auth. Invite users
   through authorised Auth administration. Configure exact staging/production
   application redirect URLs; require strong passwords and enable available
   compromised-password protections. No email-to-person bootstrap trigger exists.
3. Apply `migrations/20261010090000_operations_foundation.sql` using trusted SQL or
   the Supabase migration CLI against the explicitly selected dedicated project.
   It assumes standard Supabase `auth.users`, `auth.uid()` and Storage schemas.
4. Create the first invited owner's Auth account. Using trusted SQL, create the
   organisation and membership below with the **actual Auth UUID**. Do not use
   an email address as authority or provide an owner bootstrap application route.
5. Set the app's explicit Supabase URL and publishable key in secure environment
   settings. Normal runtime reads/writes use the authenticated user client. A server-only
   service-role key is additionally required for verified evidence completion;
   it must never be exposed to the browser or used for general business queries.
   A publishable key is not permission to view business records.
6. Test each role against staging, including direct API attempts and private file
   access, before allowing users to upload real information.

Example bootstrap structure (replace placeholders using trusted SQL only):

```sql
begin;
insert into public.organisations(id,name,target_margin)
values ('<new-organisation-uuid>','<verified-business-name>',30);
insert into public.organisation_members
  (organisation_id,user_id,display_name,role,financial_access,active)
values ('<new-organisation-uuid>','<actual-owner-auth-uuid>',
        '<owner-display-name>','owner',true,true);
commit;
```

Bootstrap audit rows have a null `actor_id`, indicating trusted administrative
SQL rather than falsely attributing the operation to an application user.
Later membership administration uses the owner's authenticated `save_member` RPC.

## Security and scope

- One organisation per Auth account is an explicit **Phase 1 limitation**; the
  unique `organisation_members.user_id` constraint enforces it. Multi-business
  account selection requires a reviewed future migration.
- Membership and financial permissions are owner-controlled. The last active
  owner cannot be deactivated/demoted through the application.
- Contracts contain operational data. Commercial values and budgets live in a
  separate table readable only by an owner or explicitly authorised allocated
  manager. Contract target margin is owner configured; managers can edit approved
  budget fields without changing that target. Money is never protected merely by hiding fields in the browser. Organisation
  reads expose only its ID/name; the company target margin is not exposed to
  subcontractors. Phase 1 organisation target settings use trusted administration.
- Active membership is required for every helper. Contract manager/supervisor
  assignments honour their effective dates. Installers see only allocated work
  packages/areas plus relevant safe contract metadata and operational documents.
  Remove package assignments to revoke installer access. Managers can allocate
  operational staff; owners allocate other managers.
- Composite foreign keys enforce organisation/contract consistency. RPCs validate
  input, lock edited records, reject stale versions and atomically record genuine
  actor audit events. Idempotent creates use a per-actor SHA-256 payload digest and
  transaction advisory lock; reusing a key with a different payload fails.
- Client direct writes to contracts, commercials, members, work areas/packages,
  audit events and request keys are revoked. Assignment mutations are scoped and
  audited. No application user can fabricate a completed gate: contracts remain
  `draft` and area specification revisions remain `unapproved` in Phase 1.
- Audit rows contain entity identity/action, changed field names and safe
  before/after permission and assignment details. Financial before/after changes
  have their own commercial read boundary. Private notes and credentials are not
  copied into operational audit events. Audit
  events and document revisions have no client update/delete permissions.

## Private evidence protocol

The `tilespec-evidence` bucket is private with a 4 MiB maximum and PDF/JPEG/PNG
MIME allowlist. Existing unrelated broad Storage policies must not be present;
this migration is designed for a dedicated backend.

1. Validate actual file signatures, declared MIME, size and SHA-256 on the server.
2. Reserve immutable `document_revisions` metadata using an explicit request UUID.
   The uploader must be the actual authenticated user; `uploaded_at` starts null.
3. Upload with `upsert: false` to:
   `organisation/contract/classification/{area_uuid|contract}/{document_uuid}.{pdf|jpg|png}`.
   Storage permits only the original currently authorised reserving uploader to
   insert at that exact path. It permits neither overwrite nor deletion.
4. The authenticated server obtains the reserved metadata through the user
   client, then a narrowly used server-only service client downloads that exact
   path. Verify the actual downloaded size, MIME signature and SHA-256 against
   the reservation before calling the service-only
   `complete_document_upload(document_uuid, verified_user_uuid, verified_sha256)`.
   The database rejects ordinary user calls, verifies the original uploader and
   their current allocation, hash, object presence and managed size/MIME, then
   atomically marks completion and audits the verified uploader. Repeating
   completion is safe. Never accept the actor/hash as trusted client parameters.
5. Readers and signed download routes must require `uploaded_at`; Storage SELECT
   rechecks contract/area/classification access. Pending reservations remain
   visible only to the authorised uploader and scoped management. A failed upload
   never appears completed. On retry, compare every reserved attribute, including
   hash/path/reference/revision, before treating a conflict as the same request.

Bucket controls enforce upload size and declared MIME at Storage. File-byte
signatures and hashes are verified on the server after downloading the actual
object; PostgreSQL cannot read those bytes. Direct client uploads remain pending
and unreadable until that trusted verification succeeds. The service client must
be confined to this protocol; ordinary records retain authenticated RLS. Treat user evidence as untrusted content, use
attachment downloads, and do not execute uploaded files. The verified hash enables
later backup/download integrity checks.

## Supervisor V2 migrations

`20261014090000` to `20261014093000` add supervisor record hardening,
hierarchical locations, teams and operatives, and planned and actual allocations.
They are additive and transactional. Each checks its prerequisites and refuses to
run if its objects already exist. Before applying them to any hosted project:

1. Take a database backup.
2. Run `inspection/supervisor-v2-preflight.sql` (a single read-only SELECT) as
   the role that will apply the migrations, and keep the output. Every
   prerequisite (including that role's storage access) must be "present" and
   every name collision "absent (ready)".
3. Apply, unmodified, one file at a time, stopping at the first error:
   `20261014090000_supervisor_records_hardening.sql`,
   `20261014091000_site_locations.sql`, `20261014092000_teams_operatives.sql`,
   `20261014093000_site_allocations.sql`. Record each under its own filename in
   the migration history.
4. Re-run the report: row counts must be unchanged.

### Subcontractor companies (Phase 2A)

`20261014100000_subcontractor_companies.sql` makes subcontractor companies
proper records. It adds companies, insurance and accreditation entries, and a
`company_id` link on teams and operatives. It is additive and transactional,
and refuses to run before `20261014093000` or a second time.

The migration links the company names already typed against gangs and
operatives. Names that differ only in case or spacing become one company, and
the most common spelling is kept. Direct teams, directly employed people and
blank names stay unlinked. No existing value is changed: the typed names stay
in their columns, and each link is audited.

1. Take a database backup.
2. Run `inspection/subcontractor-companies-preflight.sql` (a single read-only
   SELECT) and keep the output. Every prerequisite must be "present" and every
   name collision "absent (ready)". Review the "backfill name" rows. They list
   each company that will be created, how many gangs and operatives it links,
   and every spelling found.
3. Apply `20261014100000_subcontractor_companies.sql`, unmodified. Record it under
   its own filename in the migration history.
4. Re-run the report. Every new object should now show, and row counts should
   be unchanged.

### Supervisor daily workforce (Phase 2B)

`20261014120000_supervisor_daily_workforce.sql` adds the acting lead column
and the supervisor's confirmation functions. It replaces four allocation
functions with the same signatures. It is additive and transactional, refuses
to run before `20261014100000` or a second time, and changes no existing
record.

1. Take a database backup.
2. Run `inspection/supervisor-daily-workforce-preflight.sql` (read-only) and
   keep the output. Every prerequisite must be "present" and every name
   collision "absent (ready)". The data review rows count open work, work
   from earlier days that was never finished, and legacy absences that
   contradict recorded attendance. Supervisors can finish open work after the
   update; nothing is changed automatically.
3. Apply `20261014120000_supervisor_daily_workforce.sql`, unmodified, recorded
   under its own filename.
4. Re-run the report. Every new object should show, and row counts should be
   unchanged.

Design, risks and permissions are in
[supervisor-v2.md](../docs/operations/supervisor-v2.md). Production application
is a separately approved step.

## Validation and recovery

`npm run test:db` runs real grants/RLS/RPC/storage-policy assertions on a disposable
local PostgreSQL cluster. Platform Auth/Storage structures are minimal test-only
stubs. No external database is contacted and no application demo mode exists.

Before production, configure database backups and a separate private-object
backup, retention and recovery plan in the project's existing service tier.
Database-only backups do not restore Storage bytes. Export an object manifest with
content hashes, rehearse restoration into an isolated backend, rerun the role
checks, and preserve all audit/document revision history. Confirm these controls
with the owner before real operational adoption.

### Location inspections (Phase 3A)

`20261014140000_location_inspections.sql` creates immutable location templates,
inspection records and actual-allocation links with attendance snapshots.
Existing morning checks, issues, evidence, allocations and permissions stay
unchanged. No work-release or specification approval is granted by this phase.

Before any hosted application, obtain approval, back up the selected project,
rehearse on separate staging and run `inspection/location-inspections-preflight.sql`
as the intended applying role. Every prerequisite must be present and all five
name collisions absent. Apply the migration unmodified under its own filename
only after approval. Rerun the report and compare preserved row counts. A second
application is refused. Local `npm run test:db` applies it only to a disposable
cluster and checks RLS, RPCs and preservation of every earlier row/grant/policy.

### Office reviews and instruction changes (M3, M2)

`20261023090000_office_reviews_instruction_changes.sql` lets the office mark an
inspection result or handover as reviewed (`office_reviews`), and change, mark urgent
or withdraw an instruction (`replaces_id` and `urgent` on `supervisor_office_items`,
and `supervisor_office_item_withdrawals`). A change is a new instruction that names
the one it replaces; nothing existing is rewritten. The acknowledgement and result
functions keep their original checks, now in `private`, behind wrappers that only
refuse a new acknowledgement of a changed or withdrawn instruction and a new result
for a withdrawn request. Additive and transactional; it refuses to run before
`20261015130000` or a second time.

1. Take a database backup.
2. Run `inspection/office-reviews-preflight.sql` (read-only) as the applying role and
   keep the output. Every prerequisite must be present and every name collision absent.
3. Apply the migration unmodified, recorded under its own filename, only after approval.
4. Re-run the report: the preserved counts must be unchanged.

The application hides every review, change, urgent and withdrawal control until this
migration is applied, so it can be deployed first.

### Job messages (M1)

`20261024090000_job_messages.sql` adds questions and replies between the office and
the supervisor about a job or one of its records (`job_messages`), and "Got it" read
receipts (`job_message_reads`). Only a supervisor on the site starts a conversation;
the office for the job and that supervisor reply. Row-level security shows each
conversation only to the office for the job and the supervisor in it. Both tables are
append-only and audited, and writes go only through `post_job_message` and
`mark_job_message_read`, with request keys for safe retries. Additive and
transactional; it refuses to run before `20261015130000` and `20261015091000` or a
second time.

1. Take a database backup.
2. Run `inspection/job-messages-preflight.sql` (read-only) as the applying role and
   keep the output. Every prerequisite must be present and every name collision absent.
3. Apply the migration unmodified, recorded under its own filename, only after approval.
4. Re-run the report: the preserved counts must be unchanged.
