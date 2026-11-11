# Office command centre: production rollout

**Status:** ready for the owner's go-ahead. Nothing in this document has been run against the hosted
TileSpec project (`odwysybvncdfdrfnnnqt`). Every step that writes to it needs the owner's explicit approval.

## What changes

| Layer | Change | Reversible |
|---|---|---|
| Database | `20261023090000_office_reviews_instruction_changes` (written in October, never applied) | Restore from backup |
| Database | `20261114090000_office_command_centre` (customers, job stages, quotations, tender tracking, materials, site progress and photographs, message categories and decisions, search, debt ageing, cash flow, email outbox) | `supabase/rollback/20261114090000_office_command_centre_down.sql` (tested) |
| App | The command centre homepage, office inbox, planner, materials, finance, customers, quotations, notifications, site diary, grouped navigation | Vercel instant rollback |
| Hosting | A Vercel Cron entry every ten minutes (`vercel.json`) | Remove the entry |
| Settings | New, optional: `RESEND_API_KEY`, `NOTIFICATIONS_FROM`, `CRON_SECRET`, `NOTIFICATIONS_DISPATCH_TOKEN`, `NOTIFICATIONS_BASE_URL` | Remove them |

Neither migration rewrites an existing record. Existing jobs keep no stored stage (the app reads their stage from
their programme dates until the office confirms one) and existing clients become customers without the jobs being
changed. This is proved by the upgrade tests in `tests/db/` (`commercial-upgrade`, `upgrade-preserves-data`,
`holds-upgrade` and others), which apply the migrations over populated databases and compare every original value.

## 1. Backup

1. Confirm a point-in-time restore point exists for the project (Supabase dashboard → Database → Backups), or take a
   dump: `pg_dump --no-owner --format=custom --file=tilespec-before-command-centre.dump "$DATABASE_URL"`.
2. Record the time. A restore to this point is the rollback for `office_reviews_instruction_changes`.

## 2. Rehearse on a copy

Restore the backup to a separate Supabase project or branch and run steps 3–5 there first. The same order is
rehearsed automatically on every CI run by `tests/db/commercial-upgrade.test.sh`. That test builds the hosted
project's exact shape, applies the outstanding migrations and then the command centre, and checks that no
existing value changed. `tests/db/command-centre-rollback.test.sh` proves the rollback and a second installation.

## 3. Apply, in this order

Each file checks its prerequisites first, runs in one transaction and refuses a second application.

```bash
psql "$DATABASE_URL" -f supabase/migrations/20261023090000_office_reviews_instruction_changes.sql
psql "$DATABASE_URL" -f supabase/migrations/20261114090000_office_command_centre.sql
```

Record both in the migration history so later `supabase db push` runs stay clean (see
[migration-reconciliation.md](migration-reconciliation.md) for repairing the earlier entries, which is optional
and independent):

```bash
supabase migration repair --status applied 20261023090000 20261114090000
```

## 4. Verify (read-only)

```sql
select to_regclass('public.office_reviews') is not null as reviews,
       to_regclass('public.notification_outbox') is not null as outbox,
       (select count(*) from public.customers) as customers_from_existing_clients,
       (select count(*) from public.contracts where lifecycle_stage is not null) as jobs_with_stored_stage, -- expect 0
       (select count(*) from public.notification_outbox) as queued_emails;                                 -- expect 0
select * from public.notification_settings;  -- live = false
```

Then sign in as the owner on production and check:

- the homepage shows the command centre
- **Inbox**, **Planner** and **Debtors and cash flow** open
- the job pages show **Stage and customer**

## 5. Release the app

Merge the pull request. Vercel deploys `main`; the existing production flags (`FEATURE_NEXT_ACTIONS` and
`FEATURE_ROLE_SHELL` for `supervisor,owner,contracts_manager`) already turn the command centre on. If the
database steps above have not been applied, every new page says that the database update is not applied and the
rest of the app is unaffected.

## 6. Switch on email (owner, when ready)

1. Create an account with the email service (Resend). Verify the sending domain, then add `RESEND_API_KEY` and
   `NOTIFICATIONS_FROM` (for example `TileSPEC <alerts@yourdomain>`) in Vercel → Settings → Environment Variables,
   for Production only.
2. Add a long random `CRON_SECRET` in Vercel. Vercel sends it with each scheduled call.
3. In TileSPEC → **Email notifications**, create the dispatcher key and add it to Vercel as
   `NOTIFICATIONS_DISPATCH_TOKEN`, then redeploy.
4. Add each recipient, send each a test message, check it arrives and confirm the mailbox.
5. Switch delivery on. Until then, every alert and summary is prepared and logged as “Prepared, not sent”.

## Rollback

1. **App:** Vercel → Deployments → the previous production deployment → Instant Rollback.
2. **Command centre database objects** (only if needed; take a backup first, because the command centre's own
   records are removed with it):
   `psql "$DATABASE_URL" -f supabase/rollback/20261114090000_office_command_centre_down.sql`
3. **Office reviews:** restore from the backup taken in step 1.

## Housekeeping decided by the owner

The migrations do not delete anything. The demo and test records found by the audit (two "DEMO" jobs, test gangs,
test invoices and six inactive test accounts) stay until the owner decides to archive or remove them. The real
supervisor also needs assigning to real jobs.
