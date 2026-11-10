#!/usr/bin/env bash
# The commercial migrations (20261104* and later, including commercial accounts) over a database shaped exactly like the hosted project on
# 3 November 2026: every earlier migration EXCEPT tender enquiries and office reviews, holding a
# fully processed daywork. Proves that they:
#   - install without tender enquiries or office reviews, and keep every existing value
#   - change no grant or policy apart from the intended supervisor restrictions
#   - leave tender enquiries and office reviews still installable afterwards
#   - refuse a second application, changing nothing
# This script receives only the disposable runner's private local Unix socket.
set -euo pipefail
psql_binary="$1"
test_socket="$2"
test_port="$3"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
base=("$psql_binary" -X -q -A -t -w -h "$test_socket" -p "$test_port" -U postgres -v ON_ERROR_STOP=1)
"${base[@]}" -d postgres -c 'create database commercial_upgrade' >/dev/null
trap '"${base[@]}" -d postgres -c "drop database if exists commercial_upgrade" >/dev/null 2>&1 || true' EXIT
psql=("${base[@]}" -d commercial_upgrade)
sed '/^create role/d' "$repository_root/tests/db/platform.sql" | "${psql[@]}" >/dev/null
outstanding=(20261013210000_tender_enquiries.sql 20261023090000_office_reviews_instruction_changes.sql)
# The public enquiry form deliberately creates the enquiry table and bucket and opens the inbox to
# the office, so it is applied with the outstanding migrations, after the "existing values are
# unchanged" comparison.
intake=20261110112916_public_intake_without_service_key.sql
commercial=()
for migration in "$repository_root"/supabase/migrations/*.sql; do
  name="$(basename "$migration")"
  [[ "$name" != "$intake" ]] || continue
  if [[ "$name" > 20261104 ]]; then commercial+=("$migration")
  elif [[ " ${outstanding[*]} " != *" $name "* ]]; then "${psql[@]}" -f "$migration" >/dev/null; fi
done
(( ${#commercial[@]} > 0 )) || { echo 'FAIL: no commercial migrations found' >&2; exit 1; }
"${psql[@]}" -c "select test.assert(to_regclass('public.office_reviews') is null and to_regclass('public.tender_enquiries') is null
  and to_regclass('public.dayworks') is not null,'the fixture has the hosted project''s shape')" >/dev/null

# Existing records, made through the real functions: a daywork priced, approved and authorised.
"${psql[@]}" >/dev/null <<'SQL'
begin;
insert into auth.users(id,email) values
 ('c0610000-0000-4000-8000-000000000001','commercial-upgrade-owner@example.invalid'),
 ('c0610000-0000-4000-8000-000000000002','commercial-upgrade-supervisor@example.invalid'),
 ('c0610000-0000-4000-8000-000000000003','commercial-upgrade-manager@example.invalid');
insert into public.organisations(id,name) values('c0620000-0000-4000-8000-000000000001','Commercial upgrade fixture');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('c0620000-0000-4000-8000-000000000001','c0610000-0000-4000-8000-000000000001','Upgrade owner','owner',true),
 ('c0620000-0000-4000-8000-000000000001','c0610000-0000-4000-8000-000000000002','Upgrade supervisor','supervisor',false),
 ('c0620000-0000-4000-8000-000000000001','c0610000-0000-4000-8000-000000000003','Upgrade manager','contracts_manager',false);
insert into public.contracts(id,organisation_id,reference,name,created_by) values
 ('c0630000-0000-4000-8000-000000000001','c0620000-0000-4000-8000-000000000001','COMMERCIAL-UPGRADE','Existing fictional site','c0610000-0000-4000-8000-000000000001');
insert into public.contract_assignments(organisation_id,contract_id,user_id) values
 ('c0620000-0000-4000-8000-000000000001','c0630000-0000-4000-8000-000000000001','c0610000-0000-4000-8000-000000000002'),
 ('c0620000-0000-4000-8000-000000000001','c0630000-0000-4000-8000-000000000001','c0610000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0610000-0000-4000-8000-000000000001"}',true);
select public.save_contract_commercial('c0630000-0000-4000-8000-000000000001',0,
 '{"contract_value":80000,"labour_budget":30000,"materials_budget":20000,"preliminaries_budget":4000,"contingency":2000,"retention_percent":3}'::jsonb);
select set_config('request.jwt.claims','{"sub":"c0610000-0000-4000-8000-000000000002"}',true);
select public.create_daywork('c0640000-0000-4000-8000-000000000001',jsonb_build_object('contract_id','c0630000-0000-4000-8000-000000000001',
 'description','Existing daywork before the upgrade','instructed_by_name','Sam Site','lines',jsonb_build_array(
 jsonb_build_object('kind','labour','label','Marek','role','operative','work_date',private.site_today(),'quantity',3))));
select public.send_daywork((select id from public.dayworks),gen_random_uuid(),1);
select public.post_job_message(gen_random_uuid(),jsonb_build_object('contract_id','c0630000-0000-4000-8000-000000000001','body','Existing question'));
select set_config('request.jwt.claims','{"sub":"c0610000-0000-4000-8000-000000000003"}',true);
select public.decide_daywork((select id from public.dayworks),gen_random_uuid(),2,'{"decision":"approve"}');
select public.record_daywork_client_authorisation((select id from public.dayworks),gen_random_uuid(),'{"outcome":"authorised","client_name":"Main Contractor","reference":"CVI-9"}');
select set_config('request.jwt.claims','{"sub":"c0610000-0000-4000-8000-000000000001"}',true);
select public.save_daywork_rate(gen_random_uuid(),'{"contract_id":"c0630000-0000-4000-8000-000000000001","category":"operative","item":"Operative","unit":"hour","rate":28}');
select public.price_daywork((select id from public.dayworks),gen_random_uuid(),4,jsonb_build_object('lines',jsonb_build_array(jsonb_build_object(
 'line_id',(select id from public.daywork_lines),'rate_id',(select id from public.contract_daywork_rates)))));
select public.approve_daywork_charge((select id from public.dayworks),gen_random_uuid(),5,'{}');
commit;
create table test.commercial_original_tables as select n.nspname as schema_name,c.relname as table_name,
  c.relacl::text as grants,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','auth','storage') and c.relkind='r';
create table test.commercial_original_policies as select * from pg_policies where schemaname in ('public','private','auth','storage');
SQL

# Row hashes of every table. Columns the commercial migrations add are left out, and the audit
# classification flag is compared separately below; nothing else may change.
snapshot() {
  "${psql[@]}" <<'SQL'
select schema_name||'.'||table_name||':'||(xpath('/row/hash/text()',query_to_xml(format(
 'select md5(coalesce(string_agg((to_jsonb(x)-%L::text[])::text,''|'' order by (to_jsonb(x)-%L::text[])::text),'''')) hash from %I.%I x',
 case when table_name='contracts' then '{daywork_client_authorisation,variation_client_authorisation}'
      when table_name='dayworks' then '{kind}' when table_name='daywork_pricings' then '{method,note}'
      when table_name='daywork_pricing_lines' then '{markup_percent,markup}'
      when table_name='audit_events' then '{commercial}' else '{}' end,
 case when table_name='contracts' then '{daywork_client_authorisation,variation_client_authorisation}'
      when table_name='dayworks' then '{kind}' when table_name='daywork_pricings' then '{method,note}'
      when table_name='daywork_pricing_lines' then '{markup_percent,markup}'
      when table_name='audit_events' then '{commercial}' else '{}' end,
 schema_name,table_name),false,true,'')))[1]::text from test.commercial_original_tables order by schema_name,table_name;
SQL
}
before="$(snapshot)"
for preflight in "$repository_root"/supabase/inspection/commercial-*-preflight.sql; do
  "${psql[@]}" -f "$preflight" >/dev/null
done
[[ "$before" == "$(snapshot)" ]] || { echo 'FAIL: a read-only commercial preflight changed data.' >&2; exit 1; }
for migration in "${commercial[@]}"; do "${psql[@]}" -f "$migration" >/dev/null; done
if [[ "$before" != "$(snapshot)" ]]; then
  diff <(echo "$before") <(snapshot) >&2 || true
  echo 'FAIL: the commercial migrations changed existing values.' >&2; exit 1
fi

"${psql[@]}" <<'SQL'
-- Only the intended grants and policies change.
select test.assert(not exists(select 1 from test.commercial_original_tables t join pg_namespace n on n.nspname=t.schema_name
 join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
 where (c.relacl::text is distinct from t.grants and t.table_name not in ('dayworks','daywork_events'))
   or c.relrowsecurity<>t.relrowsecurity or c.relforcerowsecurity<>t.relforcerowsecurity),
 'commercial migrations keep every original table grant except the daywork column restrictions, and every RLS flag');
select test.assert((select array_agg(policyname::text order by policyname) from (select * from test.commercial_original_policies
   except select * from pg_policies) changed)=array['daywork_client_authorisations_read','daywork_events_read'],
 'commercial migrations change only the two intended daywork read policies');
select test.assert((select count(*)=1 from public.dayworks) and (select count(*)=1 from public.contract_commercials)
 and (select count(*)=1 from public.daywork_client_authorisations) and (select count(*)=1 from public.daywork_commercial_approvals)
 and (select count(*)=1 from public.job_messages),'every existing commercial and site record is kept');
select test.assert((select count(*)>=3 and bool_and(commercial) from public.audit_events
   where entity_type='daywork_client_authorisations' or (entity_type='dayworks' and action='update'
     and details->'changed_fields' ?| array['commercial_status','client_status'])),
 'existing audit rows about commercial and client statuses are reclassified as commercial');
select test.assert((select count(*)=0 from public.audit_events where commercial and not (entity_type in
   ('contract_commercials','daywork_client_authorisations','contract_daywork_rates','daywork_pricings','daywork_pricing_lines','daywork_commercial_approvals')
   or (entity_type='dayworks' and action='update'))),'no other audit row is reclassified');
select test.assert((select daywork_client_authorisation from public.contracts),'existing contracts require the client''s authorisation for dayworks');
-- Commercial accounts (C6): existing priced lines carry no markup and keep their price; no business
-- details or payment terms are invented.
select test.assert((select bool_and(markup=0 and markup_percent=0) from public.daywork_pricing_lines)
 and (select total=84 from public.daywork_pricings) and (select count(*)=0 from public.organisation_billing_profiles)
 and (select count(*)=0 from public.contract_payment_terms) and (select count(*)=0 from public.commercial_documents),
 'commercial accounts keep every existing price and invent no business details, terms or documents');
-- The existing supervisor now sees the go-ahead, and no commercial approval.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0610000-0000-4000-8000-000000000002"}',true);
select test.assert((select go_ahead='proceed' from public.daywork_site_statuses(array['c0630000-0000-4000-8000-000000000001'::uuid])),
 'the existing approved and authorised daywork shows go ahead to its supervisor');
select test.assert((select count(*)=0 from public.daywork_client_authorisations)
 and not exists(select 1 from public.daywork_events where action in ('price','commercial_approval','client_authorisation')),
 'the existing supervisor no longer sees the client''s authorisation or commercial history steps');
rollback;
SQL

# The two migrations not yet applied on the hosted project still install afterwards.
for name in "${outstanding[@]}" "$intake"; do "${psql[@]}" -f "$repository_root/supabase/migrations/$name" >/dev/null; done
if "${psql[@]}" -f "$repository_root/supabase/migrations/$intake" >"$test_socket/intake-reapply.log" 2>&1 || ! grep -q 'Preflight failed' "$test_socket/intake-reapply.log"; then
  cat "$test_socket/intake-reapply.log" >&2
  echo "FAIL: $intake did not refuse a second application." >&2; exit 1
fi
"${psql[@]}" -c "select test.assert(to_regclass('public.office_reviews') is not null and to_regclass('public.tender_enquiries') is not null,
  'tender enquiries and office reviews still install after the commercial migrations')" >/dev/null

# A second application is refused and changes nothing.
after="$(snapshot)"
for migration in "${commercial[@]}"; do
  if "${psql[@]}" -f "$migration" >"$test_socket/commercial-reapply.log" 2>&1 || ! grep -q 'Preflight failed' "$test_socket/commercial-reapply.log"; then
    cat "$test_socket/commercial-reapply.log" >&2
    echo "FAIL: $(basename "$migration") did not refuse a second application." >&2; exit 1
  fi
done
[[ "$after" == "$(snapshot)" ]] || { echo 'FAIL: a refused commercial migration changed data.' >&2; exit 1; }
"${psql[@]}" -c "select test.assert(true,'commercial migrations install on the hosted shape, keep every value, and refuse a second application')"
