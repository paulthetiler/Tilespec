# Migration reconciliation (hosted TileSpec project)

**Status:** runbook for review. Nothing here has been run against the hosted project. Every step that writes to it
needs the owner's explicit approval.

Hosted project: **TileSpec** (`odwysybvncdfdrfnnnqt`, eu-west-2). Observed read-only on 3 November 2026.

## 1. What the hosted database contains

The hosted migration history (`supabase_migrations.schema_migrations`) has 13 rows. **None of their version numbers match
the repository file names**, because each was recorded at the time it was applied (for example `20261011111212
operations_foundation` for the repository's `20261010090000_operations_foundation.sql`). Four further migrations were
applied without a history row, and two have not been applied at all.

| Repository migration | Objects present | Recorded in history as |
|---|---|---|
| 20261010090000_operations_foundation | yes | 20261011111212 |
| 20261012030000_supervisor_inspections | yes | 20261012020331 |
| 20261012040000_supervisor_issues_evidence | yes | 20261013221437 |
| **20261013210000_tender_enquiries** | **no** | — |
| 20261014090000_supervisor_records_hardening | yes | 20261013223247 |
| 20261014091000_site_locations | yes | 20261013223251 |
| 20261014092000_teams_operatives | yes | 20261013223259 |
| 20261014093000_site_allocations | yes | 20261013223305 |
| 20261014100000_subcontractor_companies | yes | 20261014071814 |
| **20261014120000_supervisor_daily_workforce** | yes | **not recorded** |
| 20261014140000_location_inspections | yes | 20261014200733 |
| 20261014160000_snag_lifecycle | yes | 20261014231207 |
| 20261015090000_mandatory_inspections | yes | 20261015110255 |
| **20261015091000_work_holds** | yes | **not recorded** |
| **20261015130000_supervisor_daily_workflow** | yes | **not recorded** |
| **20261015131000_hollow_workmanship** | yes | **not recorded** |
| **20261023090000_office_reviews_instruction_changes** | **no** | — |
| 20261024090000_job_messages | yes | 20261028163603 |
| 20261028090000_dayworks | yes | 20261028165123 |

Consequence: `supabase db push` would treat every repository migration as unapplied. Each migration's own preflight
refuses to run over existing objects, so nothing would be damaged, but the push would fail at the first file.

Re-check before acting (both read-only):

```sql
\i supabase/inspection/migration-fingerprint.sql
select version, name from supabase_migrations.schema_migrations order by version;
```

## 2. Dependencies, proven by tests

`tests/db/commercial-upgrade.test.sh` builds a database in the hosted project's exact shape: every migration except
tender enquiries and office reviews, with existing records. It then:

- applies the five commercial migrations in this pull request, and checks every pre-existing record, grant and
  policy is unchanged apart from the intended supervisor restrictions
- applies `tender_enquiries` and `office_reviews_instruction_changes` afterwards, proving they still install after
  dayworks, job messages and the commercial migrations
- confirms each commercial migration refuses a second application and changes nothing when it does

The commercial migrations depend only on objects already present on the hosted project (dayworks and its
prerequisites). They do not depend on tender enquiries or office reviews.

## 3. Proposed steps (each needs approval; staging first)

1. **Back up.** Confirm a point-in-time restore point, or take a `pg_dump` of the hosted project.
2. **Rehearse on a copy.** Restore that backup to a separate Supabase project or branch, and run steps 3–6 there first.
3. **Fingerprint.** Run `supabase/inspection/migration-fingerprint.sql` and the history query. Stop if the results differ
   from §1.
4. **Repair history only** (no schema change). Remove the 13 timestamp versions and record the repository versions that
   are present:

   ```bash
   supabase migration repair --status reverted 20261011111212 20261012020331 20261013221437 20261013223247 \
     20261013223251 20261013223259 20261013223305 20261014071814 20261014200733 20261014231207 20261015110255 \
     20261028163603 20261028165123
   supabase migration repair --status applied 20261010090000 20261012030000 20261012040000 20261014090000 \
     20261014091000 20261014092000 20261014093000 20261014100000 20261014120000 20261014140000 20261014160000 \
     20261015090000 20261015091000 20261015130000 20261015131000 20261024090000 20261028090000
   ```

5. **Decide the two outstanding migrations.** `tender_enquiries` is independent. `office_reviews_instruction_changes`
   needs the daily workflow, which is present. Both are older than the last applied version, so applying them needs
   `supabase db push --include-all`. Run `supabase db push --include-all --dry-run` first and check it lists only the
   expected files.
6. **Apply the commercial migrations in order**, each after its read-only preflight in `supabase/inspection/`:
   `20261104090000` → `20261104100000` → `20261104110000` → `20261104120000` → `20261104130000`.
7. **Verify roles** with real test accounts (owner, contracts manager with and without money access, supervisor):
   sign in as the supervisor and query every money table and function directly through the REST API. Each must return
   no rows or a permission error.
