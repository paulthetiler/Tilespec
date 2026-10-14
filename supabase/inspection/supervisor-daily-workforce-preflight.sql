-- Supervisor daily workforce (Phase 2B) preflight report. READ-ONLY: a single
-- SELECT that changes nothing.
--
-- Run it in the Supabase SQL editor (or psql) BEFORE applying
-- 20261014120000_supervisor_daily_workforce.sql, and again afterwards.
--
--   prerequisite     every row must say "present"
--   name collision   before applying, every row must say "absent (ready)"
--   row count        must be identical before and after applying
--   data review      records worth knowing about; nothing is changed
--
-- Any "MISSING" or "ALREADY EXISTS" before applying means the live schema has
-- drifted from the repository. Stop and review; the migration will refuse to
-- run in that state.
with prerequisites(kind, name) as (values
  ('table', 'public.actual_allocations'), ('table', 'public.actual_allocation_operatives'), ('table', 'public.allocation_absences'),
  ('table', 'public.planned_allocations'), ('table', 'public.subcontractor_companies'),
  ('function', 'private.insert_actual_allocation(uuid,uuid,uuid,uuid,uuid,text,uuid[],timestamptz,timestamptz,text,uuid)'),
  ('function', 'public.record_actual_allocation(uuid,jsonb)'), ('function', 'public.reallocate_actual_allocation(uuid,uuid,jsonb)'),
  ('function', 'public.add_allocation_operative(uuid,uuid,timestamptz,text)'), ('function', 'private.guard_append_only()')
), new_objects(kind, name) as (values
  ('function', 'public.confirm_planned_allocation(uuid,jsonb)'), ('function', 'public.set_allocation_lead(uuid,uuid)'),
  ('function', 'public.end_open_allocations(uuid,timestamptz)'), ('function', 'public.allocation_actor_names(uuid)'),
  ('function', 'private.clear_contradicted_absences(uuid,date,uuid,uuid[],timestamptz)'), ('function', 'private.apply_allocation_lead(uuid,uuid)'),
  ('function', 'private.guard_allocation_lead()')
), preserved(name) as (values
  ('public.planned_allocations'), ('public.planned_allocation_operatives'), ('public.actual_allocations'),
  ('public.actual_allocation_operatives'), ('public.allocation_absences')
), reviews(item, query) as (values
  ('periods of work still open (not ended or voided); supervisors can finish them after the update',
    'select count(*) as n from public.actual_allocations where ended_at is null and voided_at is null'),
  ('of those, started on an earlier day; the site dashboard will ask for them to be finished',
    'select count(*) as n from public.actual_allocations where ended_at is null and voided_at is null and work_date < (now() at time zone ''Europe/London'')::date'),
  ('absences that contradict attendance recorded the same day (kept as they are; new records prevent this)',
    'select count(*) as n from public.allocation_absences b where b.voided_at is null and exists (select 1 from public.actual_allocation_operatives ao join public.actual_allocations a on a.id = ao.actual_allocation_id where a.contract_id = b.contract_id and a.work_date = b.work_date and a.voided_at is null and (ao.operative_id = b.operative_id or (b.operative_id is null and a.planned_allocation_id = b.planned_allocation_id)))')
)
select 'migration history' as section, 'supabase_migrations.schema_migrations' as item,
  case when to_regclass('supabase_migrations.schema_migrations') is null then 'not recorded' else 'recorded' end as status,
  case when to_regclass('supabase_migrations.schema_migrations') is null then 'Migrations may have been applied by hand; rely on the checks below.'
    else (xpath('/row/v/text()', query_to_xml('select string_agg(version, '', '' order by version) as v from supabase_migrations.schema_migrations where version >= ''20261014''', false, true, '')))[1]::text
  end as detail
union all
select 'prerequisite', kind || ' ' || name,
  case when (kind = 'table' and to_regclass(name) is not null) or (kind = 'function' and to_regprocedure(name) is not null)
  then 'present' else 'MISSING - stop and review' end, null
from prerequisites
union all
select 'name collision', kind || ' ' || name,
  case when to_regprocedure(name) is not null then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end, null
from new_objects
union all
select 'name collision', 'column public.actual_allocations.lead_operative_id', 'ALREADY EXISTS - stop and review', null
from pg_attribute where attrelid = to_regclass('public.actual_allocations') and attname = 'lead_operative_id' and not attisdropped
union all
select 'row count', name, case when to_regclass(name) is null then 'table missing' else 'rows' end,
  case when to_regclass(name) is null then null
    else (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s', name), false, true, '')))[1]::text end
from preserved
union all
select 'data review', item, case when to_regclass('public.actual_allocations') is null then 'table missing' else 'count' end,
  case when to_regclass('public.actual_allocations') is null then null else (xpath('/row/n/text()', query_to_xml(query, false, true, '')))[1]::text end
from reviews;
