#!/usr/bin/env bash
# Enquiry email alerts over a database shaped like the hosted project today (every migration before the
# office command centre, without office reviews), holding enquiries received before the update. Proves that
# the migration:
#   - changes no existing enquiry and queues no alert for one received before it
#   - queues one alert when an enquiry that was still uploading is confirmed afterwards
#   - refuses a second application
#   - lets the office command centre install after it, and survives the command centre's rollback
#   - rolls back cleanly, leaving every enquiry, and installs again
# Disposable local database only.
set -euo pipefail
psql_bin="$1"; socket="$2"; port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
base=("$psql_bin" -X -q -A -t -w -h "$socket" -p "$port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database enquiry_alerts_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists enquiry_alerts_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d enquiry_alerts_upgrade)
grep -v '^create role' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
alerts="$repository_root/supabase/migrations/20261115090000_enquiry_email_notifications.sql"
command_centre="$repository_root/supabase/migrations/20261114090000_office_command_centre.sql"
for migration in "$repository_root"/supabase/migrations/*.sql; do
  name="$(basename "$migration")"
  [[ "$name" < 20261114 && "$name" != 20261023090000_* ]] && "${psql[@]}" -f "$migration" >/dev/null
done
"${psql[@]}" -c "select test.assert(to_regclass('public.notification_outbox') is null and to_regclass('public.office_reviews') is null
  and to_regprocedure('public.complete_tender_enquiry(uuid,text)') is not null,'the fixture has the hosted project''s shape')" >/dev/null

# Enquiries already on the hosted project: one received before the update, one still uploading.
"${psql[@]}" >/dev/null <<'SQL'
insert into public.tender_enquiries(id,reference,kind,name,email,company,project,status,token_hash,received_at) values
 ('e7b10000-0000-4000-8000-000000000001','TS-E7B10000','tender','Earlier Buyer','earlier@example.invalid','Earlier Ltd','Earlier job','received',repeat('a',64),now()-interval '1 day'),
 ('e7b20000-0000-4000-8000-000000000002','TS-E7B20000','general','Uploading Buyer','uploading@example.invalid','','','uploading',
  encode(sha256(convert_to(repeat('b',48),'UTF8')),'hex'),null);
SQL
snapshot() { "${psql[@]}" -c "select md5(string_agg(to_jsonb(e)::text,'|' order by id)) from public.tender_enquiries e"; }
before="$(snapshot)"
"${psql[@]}" -f "$alerts" >/dev/null
[[ "$before" == "$(snapshot)" ]] || { echo 'FAIL: the alerts migration changed an existing enquiry.' >&2; exit 1; }
"${psql[@]}" -c "select test.assert((select count(*)=0 from public.enquiry_notifications),'no alert is queued for an enquiry received before the update')"
"${psql[@]}" -c "set role anon; select test.assert(public.complete_tender_enquiry('e7b20000-0000-4000-8000-000000000002',repeat('b',48))='received','an enquiry uploading during the update is confirmed afterwards')" >/dev/null
"${psql[@]}" -c "select test.assert((select count(*)=1 from public.enquiry_notifications where enquiry_id='e7b20000-0000-4000-8000-000000000002'),'and its alert is queued')"

if "${psql[@]}" -f "$alerts" >"$socket/alerts-reapply.log" 2>&1 || ! grep -q 'Preflight failed' "$socket/alerts-reapply.log"; then
  cat "$socket/alerts-reapply.log" >&2; echo 'FAIL: the alerts migration did not refuse a second application.' >&2; exit 1
fi
"${psql[@]}" -c "select test.assert((select count(*)=1 from public.enquiry_notifications),'a refused second application changes nothing')" >/dev/null

# The office command centre after the alerts, then its rollback: the alerts keep working throughout.
"${psql[@]}" -f "$command_centre" >/dev/null
"${psql[@]}" -c "select test.assert(to_regclass('public.notification_outbox') is not null and to_regclass('public.enquiry_notifications') is not null,
  'the office command centre installs after the enquiry alerts')"
"${psql[@]}" -f "$repository_root/supabase/rollback/20261114090000_office_command_centre_down.sql" >/dev/null
"${psql[@]}" >/dev/null <<'SQL'
insert into public.tender_enquiries(id,reference,kind,name,email,status,token_hash) values
 ('e7b30000-0000-4000-8000-000000000003','TS-E7B30000','general','Later Buyer','later@example.invalid','uploading',encode(sha256(convert_to(repeat('c',48),'UTF8')),'hex'));
set role anon;
select test.assert(public.complete_tender_enquiry('e7b30000-0000-4000-8000-000000000003',repeat('c',48))='received','an enquiry is confirmed after the command centre rollback');
reset role;
select test.assert((select count(*)=2 from public.enquiry_notifications),'enquiry alerts survive the command centre rollback and still queue');
SQL

# The alerts' own rollback leaves every enquiry, and the migration installs again.
before="$(snapshot)"
"${psql[@]}" -f "$repository_root/supabase/rollback/20261115090000_enquiry_email_notifications_down.sql" >/dev/null
[[ "$before" == "$(snapshot)" ]] || { echo 'FAIL: the alerts rollback changed an enquiry.' >&2; exit 1; }
"${psql[@]}" -c "select test.assert(to_regclass('public.enquiry_notifications') is null and not exists(select 1 from pg_trigger where tgname='queue_enquiry_notification')
  and to_regprocedure('public.report_enquiry_notification(uuid,text,text,text,text)') is null,'the alerts rollback removes only the alerts')"
"${psql[@]}" -f "$alerts" >/dev/null
"${psql[@]}" -c "select test.assert(to_regclass('public.enquiry_notifications') is not null and (select count(*)=0 from public.enquiry_notifications),
  'the alerts install again after a rollback, queueing nothing for earlier enquiries')"
