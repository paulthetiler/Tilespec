-- Supervisor V2 preflight report. READ-ONLY: a single SELECT that changes nothing.
--
-- Run it in the Supabase SQL editor (or psql) against staging and then
-- production BEFORE applying the 202610140900xx migrations, and attach the
-- output to the pull request. Run it again afterwards to compare row counts.
--
--   prerequisite      every row must say "present"
--   name collision    before applying, every row must say "absent (ready)"
--   row count         must be identical before and after applying
--   data review       legacy records the migrations deliberately leave as they
--                     are; review them, nothing is changed automatically
--
-- Any "MISSING" or "ALREADY EXISTS" before applying means the live schema has
-- drifted from the repository. Stop and review; the migrations will refuse to
-- run in that state.
with prerequisites(kind, name) as (values
  ('table', 'public.organisations'), ('table', 'public.organisation_members'), ('table', 'public.contracts'),
  ('table', 'public.contract_commercials'), ('table', 'public.contract_assignments'), ('table', 'public.work_areas'),
  ('table', 'public.work_packages'), ('table', 'public.package_assignments'), ('table', 'public.document_revisions'),
  ('table', 'public.audit_events'), ('table', 'private.idempotency_keys'), ('table', 'public.supervisor_inspections'),
  ('table', 'public.supervisor_issues'), ('table', 'public.supervisor_issue_events'), ('table', 'public.supervisor_issue_photos'),
  ('table', 'storage.objects'), ('table', 'storage.buckets'),
  ('function', 'private.current_org()'), ('function', 'private.current_role()'), ('function', 'private.is_owner()'),
  ('function', 'private.can_manage_contract(uuid)'), ('function', 'private.can_access_contract(uuid)'),
  ('function', 'private.can_access_area(uuid)'), ('function', 'private.request_result(uuid,text,uuid,jsonb)'),
  ('function', 'private.record_request(uuid,text,uuid,jsonb,uuid)'), ('function', 'private.audit_mutation()'),
  ('function', 'private.inspection_issues()'), ('function', 'private.enforce_issue_closure()'),
  ('function', 'public.create_work_area(uuid,uuid,jsonb)'), ('function', 'public.transition_supervisor_issue(uuid,text,text)'),
  ('function', 'auth.uid()'), ('bucket', 'tilespec-evidence'), ('bucket', 'supervisor-evidence')
), new_objects(kind, name) as (values
  ('table', 'public.operatives'), ('table', 'public.teams'), ('table', 'public.team_memberships'),
  ('table', 'public.planned_allocations'), ('table', 'public.planned_allocation_operatives'), ('table', 'public.actual_allocations'),
  ('table', 'public.actual_allocation_operatives'), ('table', 'public.allocation_absences'), ('type', 'public.installation_stage'),
  ('function', 'private.only_keys(jsonb,text[])'), ('function', 'private.guard_append_only()'),
  ('function', 'private.guard_supervisor_inspection()'), ('function', 'private.guard_issue_photo()'),
  ('function', 'public.create_locations(uuid,uuid,uuid,jsonb)'), ('function', 'public.record_actual_allocation(uuid,jsonb)'),
  ('function', 'public.location_work_history(uuid,timestamptz,timestamptz)')
), preserved(name) as (values
  ('public.organisation_members'), ('public.contracts'), ('public.contract_commercials'), ('public.contract_assignments'),
  ('public.work_areas'), ('public.work_packages'), ('public.package_assignments'), ('public.document_revisions'),
  ('public.audit_events'), ('public.supervisor_inspections'), ('public.supervisor_issues'), ('public.supervisor_issue_events'),
  ('public.supervisor_issue_photos')
), reviews(item, needs, query) as (values
  ('issue photo records whose stored object is missing (closure will no longer accept them)', 'public.supervisor_issue_photos',
    'select count(*) as n from public.supervisor_issue_photos p where not exists (select 1 from storage.objects o where o.bucket_id = ''supervisor-evidence'' and o.name = p.object_path)'),
  ('closed issues whose only evidence object is missing', 'public.supervisor_issues',
    'select count(*) as n from public.supervisor_issues i where i.state = ''closed'' and not exists (select 1 from public.supervisor_issue_photos p join storage.objects o on o.bucket_id = ''supervisor-evidence'' and o.name = p.object_path where p.issue_id = i.id)'),
  ('inspections whose recorded issue count differs from their answers', 'public.supervisor_inspections',
    'select count(*) as n from public.supervisor_inspections i where i.issues_count <> (select count(*) from jsonb_array_elements(i.answers) a where a->>''status'' = ''issue'')'),
  ('inspections timestamped in the future', 'public.supervisor_inspections',
    'select count(*) as n from public.supervisor_inspections where created_at > now() + interval ''5 minutes'''),
  ('groups of work areas sharing a name on one contract (kept; new duplicates under one parent are refused)', 'public.work_areas',
    'select count(*) as n from (select 1 from public.work_areas group by contract_id, lower(trim(name)) having count(*) > 1) d')
)
select 'migration history' as section, 'supabase_migrations.schema_migrations' as item,
  case when to_regclass('supabase_migrations.schema_migrations') is null then 'not recorded'
    else 'recorded' end as status,
  case when to_regclass('supabase_migrations.schema_migrations') is null then 'Migrations may have been applied by hand; rely on the checks below.'
    else (xpath('/row/v/text()', query_to_xml('select string_agg(version, '', '' order by version) as v from supabase_migrations.schema_migrations', false, true, '')))[1]::text
  end as detail
union all
select 'prerequisite', kind || ' ' || name,
  case when case kind when 'table' then to_regclass(name) is not null when 'function' then to_regprocedure(name) is not null
      else case when to_regclass('storage.buckets') is null then false
        else (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from storage.buckets where id = %L', name), false, true, '')))[1]::text <> '0' end end
  then 'present' else 'MISSING - stop and review' end, null
from prerequisites
union all
select 'name collision', kind || ' ' || name,
  case when (kind = 'table' and to_regclass(name) is not null) or (kind = 'function' and to_regprocedure(name) is not null)
    or (kind = 'type' and to_regtype(name) is not null) then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end, null
from new_objects
union all
select 'name collision', 'column public.work_areas.' || column_name, 'ALREADY EXISTS - stop and review', null
from information_schema.columns where table_schema = 'public' and table_name = 'work_areas'
  and column_name in ('parent_id','path_ids','location_type','code','sort_order','version','updated_at','archived_at','archived_by','archive_reason','created_request')
union all
select 'row count', name, case when to_regclass(name) is null then 'table missing' else 'rows' end,
  case when to_regclass(name) is null then null
    else (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s', name), false, true, '')))[1]::text end
from preserved
union all
select 'row level security', name, case when c.relrowsecurity then 'enabled' else 'DISABLED - stop and review' end, null
from preserved join pg_class c on c.oid = to_regclass(name)
union all
select 'data review', item, case when to_regclass(needs) is null then 'table missing' else 'count' end,
  case when to_regclass(needs) is null then null
    else (xpath('/row/n/text()', query_to_xml(query, false, true, '')))[1]::text end
from reviews;
