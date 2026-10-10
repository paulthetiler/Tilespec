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
