-- Subcontractor companies preflight report. READ-ONLY: a single SELECT that changes nothing.
--
-- Run it in the Supabase SQL editor (or psql) BEFORE applying
-- 20261014100000_subcontractor_companies.sql, and again afterwards.
--
--   prerequisite      every row must say "present"
--   name collision    before applying, every row must say "absent (ready)"
--   backfill preview  what the migration will create and link. Review the
--                     names, especially spellings that will be merged
--   backfill name     one row per company the migration will create: its
--                     name, how many gangs and operatives it links, and every
--                     spelling found
--   row count         teams and operatives must be identical before and after
--
-- Any "MISSING" or "ALREADY EXISTS" before applying means the live schema has
-- drifted from the repository. Stop and review; the migration will refuse to
-- run in that state.
with prerequisites(kind, name) as (values
  ('table', 'public.teams'), ('table', 'public.operatives'), ('table', 'public.team_memberships'), ('table', 'public.actual_allocations'),
  ('function', 'public.location_work_history(uuid,timestamptz,timestamptz)'), ('function', 'private.guard_append_only()'),
  ('function', 'private.assert_choice(text,text,text[])'), ('function', 'private.is_office()'), ('function', 'private.is_site_staff()'),
  ('function', 'public.create_team(uuid,jsonb)'), ('function', 'public.update_team(uuid,integer,jsonb)'),
  ('function', 'public.create_operative(uuid,jsonb)'), ('function', 'public.update_operative(uuid,integer,jsonb)')
), new_objects(kind, name) as (values
  ('table', 'public.subcontractor_companies'), ('table', 'public.company_insurances'), ('table', 'public.company_accreditations'),
  ('function', 'private.company_label(text)'), ('function', 'private.linkable_company(uuid)'),
  ('function', 'public.create_company(uuid,jsonb)'), ('function', 'public.update_company(uuid,integer,jsonb)'),
  ('function', 'public.record_company_insurance(uuid,jsonb)'), ('function', 'public.record_company_accreditation(uuid,jsonb)'),
  ('function', 'public.void_company_insurance(uuid,text)'), ('function', 'public.void_company_accreditation(uuid,text)')
), ready(ok) as (values (to_regclass('public.teams') is not null and to_regclass('public.operatives') is not null
  and to_regclass('public.subcontractor_companies') is null)
), typed(query) as (values (
  -- The same normalisation and exclusions as the migration's backfill.
  'select t.organisation_id, btrim(regexp_replace(t.contractor_name, ''\s+'', '' '', ''g'')) as name, ''gang'' as source from public.teams t where t.kind <> ''direct_team''
   union all select o.organisation_id, btrim(regexp_replace(o.company_name, ''\s+'', '' '', ''g'')), ''operative'' from public.operatives o where o.engagement <> ''direct_employee'''
)), previews(item, query) as (
  select 'companies that will be created', format('select count(*) as n from (select 1 from (%s) s where name <> '''' group by organisation_id, lower(name)) g', query) from typed
  union all select 'gangs that will be linked to a company', format('select count(*) as n from (%s) s where name <> '''' and source = ''gang''', query) from typed
  union all select 'operatives that will be linked to a company', format('select count(*) as n from (%s) s where name <> '''' and source = ''operative''', query) from typed
  union all select 'company names typed in more than one way (merged into one company; the most common spelling is kept)',
    format('select count(*) as n from (select 1 from (%s) s where name <> '''' group by organisation_id, lower(name) having count(distinct name) > 1) g', query) from typed
  union all select 'direct teams or directly employed operatives with a typed company name (left unlinked; the text is kept)',
    'select (select count(*) from public.teams where kind = ''direct_team'' and btrim(contractor_name) <> '''')
      + (select count(*) from public.operatives where engagement = ''direct_employee'' and btrim(company_name) <> '''') as n'
  union all select 'gangs and operatives with no company name (left unlinked)', format('select count(*) as n from (%s) s where name = ''''', query) from typed
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
  case when (kind = 'table' and to_regclass(name) is not null) or (kind = 'function' and to_regprocedure(name) is not null)
  then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end, null
from new_objects
union all
select 'name collision', 'column public.' || c.relname || '.company_id', 'ALREADY EXISTS - stop and review', null
from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
where n.nspname = 'public' and c.relname in ('teams', 'operatives') and a.attname = 'company_id' and not a.attisdropped
union all
select 'backfill preview', item, case when ok then 'count' else 'not applicable (already applied or prerequisites missing)' end,
  case when ok then (xpath('/row/n/text()', query_to_xml(query, false, true, '')))[1]::text end
from previews, ready
union all
select 'backfill name', x.name, 'gangs ' || x.gangs || ', operatives ' || x.people, x.spellings
from typed, ready, xmltable('/table/row' passing query_to_xml(case when ready.ok then format(
  'select mode() within group (order by name) as name, count(*) filter (where source = ''gang'') as gangs,
     count(*) filter (where source = ''operative'') as people, string_agg(distinct ''"'' || name || ''"'', '', '') as spellings
   from (%s) s where name <> '''' group by organisation_id, lower(name) order by 1', typed.query)
  else 'select null::text as name, 0 as gangs, 0 as people, null::text as spellings where false' end, false, false, '')
  columns name text path 'name', gangs integer path 'gangs', people integer path 'people', spellings text path 'spellings') x
union all
select 'row count', name, case when to_regclass(name) is null then 'table missing' else 'rows' end,
  case when to_regclass(name) is null then null
    else (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s', name), false, true, '')))[1]::text end
from (values ('public.teams'), ('public.operatives'), ('public.team_memberships')) preserved(name);
