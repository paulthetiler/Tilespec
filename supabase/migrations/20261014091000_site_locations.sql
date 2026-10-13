-- Supervisor V2, Phase 1: hierarchical work locations.
-- Extends public.work_areas in place instead of adding a parallel location
-- table. Existing areas become top-level locations with unchanged IDs, names,
-- packages, documents and permissions. Additive only; nothing is deleted.
-- Examples: Block B > Level 5 > Flat 52 > Bathroom; Ward 4 > Room 12 > Ensuite.
-- Level names are data entered by the office; none are hardcoded here.
begin;

do $$
begin
  if to_regclass('public.work_areas') is null or to_regclass('public.work_packages') is null
    or to_regclass('public.package_assignments') is null
    or to_regprocedure('private.can_access_area(uuid)') is null
    or to_regprocedure('private.can_manage_contract(uuid)') is null
    or to_regprocedure('private.request_result(uuid,text,uuid,jsonb)') is null
    or to_regprocedure('private.record_request(uuid,text,uuid,jsonb,uuid)') is null
    or to_regprocedure('private.audit_mutation()') is null then
    raise exception 'Preflight failed: the operations foundation is not installed as expected. Run supabase/inspection/supervisor-v2-preflight.sql and review drift before applying.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'work_areas'
      and column_name in ('parent_id','path_ids','location_type','code','sort_order','version','updated_at',
        'archived_at','archived_by','archive_reason','created_request'))
    or to_regprocedure('private.only_keys(jsonb,text[])') is not null then
    raise exception 'Preflight failed: location hierarchy objects already exist (schema drift). Review the preflight report before applying.';
  end if;
end $$;

-- Shared request validation for Supervisor V2 RPCs. Each failure raises 22023
-- naming the field, so the application can show an explicit error.
create function private.only_keys(p_data jsonb, p_keys text[]) returns void language plpgsql stable set search_path='' as $$
declare extra text;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Expected an object of named fields' using errcode='22023'; end if;
  select string_agg(k, ', ' order by k) into extra from jsonb_object_keys(p_data) k where not (k = any(p_keys));
  if extra is not null then raise exception 'Unsupported fields: %', extra using errcode='22023'; end if;
  if octet_length(p_data::text) > 500000 then raise exception 'Request too large' using errcode='22023'; end if;
end $$;
create function private.field_text(p_data jsonb, p_key text, p_max integer, p_required boolean default false) returns text
language plpgsql stable set search_path='' as $$
declare v jsonb := p_data->p_key; t text;
begin
  if v is null or v = 'null'::jsonb then
    if p_required then raise exception 'Missing required field: %', p_key using errcode='22023'; end if;
    return null;
  end if;
  if jsonb_typeof(v) <> 'string' then raise exception 'Field % must be text', p_key using errcode='22023'; end if;
  t := trim(v #>> '{}');
  if length(t) > p_max then raise exception 'Field % exceeds % characters', p_key, p_max using errcode='22023'; end if;
  if p_required and t = '' then raise exception 'Missing required field: %', p_key using errcode='22023'; end if;
  return t;
end $$;
create function private.field_uuid(p_data jsonb, p_key text, p_required boolean default false) returns uuid
language plpgsql stable set search_path='' as $$
declare t text := private.field_text(p_data, p_key, 36, p_required);
begin
  if t is null or t = '' then return null; end if;
  if t !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Field % must be a record identifier', p_key using errcode='22023';
  end if;
  return t::uuid;
end $$;
-- Returned sorted so sets of people can be compared exactly.
create function private.field_uuids(p_data jsonb, p_key text, p_max integer) returns uuid[]
language plpgsql stable set search_path='' as $$
declare v jsonb := p_data->p_key; result uuid[];
begin
  if v is null or v = 'null'::jsonb then return '{}'; end if;
  if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > p_max then
    raise exception 'Field % must be a list of at most % identifiers', p_key, p_max using errcode='22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string'
    or (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Field % must contain record identifiers only', p_key using errcode='22023';
  end if;
  select array_agg(distinct (e #>> '{}')::uuid order by (e #>> '{}')::uuid) into result from jsonb_array_elements(v) e;
  if coalesce(cardinality(result), 0) <> jsonb_array_length(v) then
    raise exception 'Field % lists the same record more than once', p_key using errcode='22023';
  end if;
  return coalesce(result, '{}');
end $$;
create function private.field_date(p_data jsonb, p_key text, p_required boolean default false) returns date
language plpgsql stable set search_path='' as $$
declare t text := private.field_text(p_data, p_key, 10, p_required);
begin
  if t is null or t = '' then return null; end if;
  if t !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Field % must be a YYYY-MM-DD date', p_key using errcode='22023'; end if;
  begin return t::date; exception when others then raise exception 'Field % is not a real date', p_key using errcode='22023'; end;
end $$;
-- An explicit UTC offset is required so the server never guesses a time zone.
create function private.field_timestamp(p_data jsonb, p_key text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare t text := private.field_text(p_data, p_key, 40);
begin
  if t is null or t = '' then return null; end if;
  if t !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' then
    raise exception 'Field % must be an ISO 8601 time with a UTC offset', p_key using errcode='22023';
  end if;
  begin return t::timestamptz; exception when others then raise exception 'Field % is not a real time', p_key using errcode='22023'; end;
end $$;
create function private.field_integer(p_data jsonb, p_key text, p_min integer, p_max integer) returns integer
language plpgsql stable set search_path='' as $$
declare v jsonb := p_data->p_key;
begin
  if v is null or v = 'null'::jsonb then return null; end if;
  if jsonb_typeof(v) <> 'number' or (v::text)::numeric <> trunc((v::text)::numeric)
    or (v::text)::numeric < p_min or (v::text)::numeric > p_max then
    raise exception 'Field % must be a whole number from % to %', p_key, p_min, p_max using errcode='22023';
  end if;
  return (v::text)::integer;
end $$;
create function private.field_boolean(p_data jsonb, p_key text) returns boolean
language plpgsql stable set search_path='' as $$
declare v jsonb := p_data->p_key;
begin
  if v is null or v = 'null'::jsonb then return null; end if;
  if jsonb_typeof(v) <> 'boolean' then raise exception 'Field % must be true or false', p_key using errcode='22023'; end if;
  return v::text::boolean;
end $$;
-- TileSPEC sites are in the UK: "today" is the London calendar date, not UTC.
create function private.site_today() returns date language sql stable set search_path='' as $$
  select (now() at time zone 'Europe/London')::date
$$;

alter table public.work_areas
  add column parent_id uuid,
  add column path_ids uuid[],
  add column location_type text not null default '' check (length(location_type) <= 60),
  add column code text not null default '' check (length(code) <= 40),
  add column sort_order integer not null default 0 check (sort_order between 0 and 1000000),
  add column version integer not null default 1 check (version > 0),
  add column updated_at timestamptz not null default now(),
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id),
  add column archive_reason text check (archive_reason is null or length(trim(archive_reason)) between 5 and 2000),
  add column created_request uuid;
update public.work_areas set path_ids = array[id], updated_at = created_at;
alter table public.work_areas
  alter column path_ids set not null,
  add constraint work_areas_parent_same_contract foreign key (organisation_id, contract_id, parent_id)
    references public.work_areas(organisation_id, contract_id, id),
  add constraint work_areas_path_consistent check (
    cardinality(path_ids) between 1 and 8 and path_ids[cardinality(path_ids)] = id
    and (parent_id is null) = (cardinality(path_ids) = 1)
    and (parent_id is null or path_ids[cardinality(path_ids) - 1] = parent_id)),
  add constraint work_areas_archive_reason check ((archived_at is null) = (archive_reason is null));
create index work_areas_parent on public.work_areas(contract_id, parent_id, sort_order);
create index work_areas_path on public.work_areas using gin (path_ids);

-- path_ids is the ordered chain of ancestor IDs ending with the location itself.
-- It is maintained only by these triggers; table writes are only via RPCs.
create function private.set_location_path() returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.work_areas;
begin
  if new.parent_id is null then
    new.path_ids := array[new.id];
    return new;
  end if;
  select * into parent from public.work_areas where id = new.parent_id;
  if not found or parent.contract_id <> new.contract_id or parent.organisation_id <> new.organisation_id then
    raise exception 'The parent location must belong to the same contract' using errcode='23514';
  end if;
  if new.id = any(parent.path_ids) then raise exception 'A location cannot be placed inside itself' using errcode='23514'; end if;
  if parent.archived_at is not null then raise exception 'Locations cannot be added inside an archived location' using errcode='23514'; end if;
  if cardinality(parent.path_ids) >= 8 then raise exception 'Location hierarchies are limited to 8 levels' using errcode='23514'; end if;
  new.path_ids := parent.path_ids || new.id;
  return new;
end $$;
create trigger location_path_guard before insert or update of parent_id on public.work_areas
  for each row execute function private.set_location_path();

-- Moving a location carries its whole subtree; IDs never change.
create function private.cascade_location_path() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.path_ids is distinct from old.path_ids then
    if exists (select 1 from public.work_areas d where old.id = any(d.path_ids) and d.id <> old.id
      and cardinality(new.path_ids) + cardinality(d.path_ids) - array_position(d.path_ids, old.id) > 8) then
      raise exception 'Moving this location would exceed 8 hierarchy levels' using errcode='23514';
    end if;
    update public.work_areas d set path_ids = new.path_ids || d.path_ids[array_position(d.path_ids, old.id) + 1:]
      where old.id = any(d.path_ids) and d.id <> old.id;
  end if;
  return null;
end $$;
create trigger location_path_cascade after update of parent_id on public.work_areas
  for each row execute function private.cascade_location_path();

-- Two active locations with the same name under one parent cause mistakes on
-- site. Enforced for new and changed rows only, so legacy duplicates (if any)
-- never block this migration.
create function private.guard_location_siblings() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.archived_at is null and (tg_op = 'INSERT' or new.name is distinct from old.name
    or new.parent_id is distinct from old.parent_id or old.archived_at is not null) then
    perform pg_advisory_xact_lock(hashtextextended('tilespec-location-siblings:' || new.contract_id::text || ':' || coalesce(new.parent_id::text, 'root'), 0));
    if exists (select 1 from public.work_areas s where s.contract_id = new.contract_id and s.parent_id is not distinct from new.parent_id
      and s.id <> new.id and s.archived_at is null and lower(trim(s.name)) = lower(trim(new.name))) then
      raise exception 'Another active location here is already called "%"', trim(new.name) using errcode='23505';
    end if;
  end if;
  return new;
end $$;
create trigger location_sibling_guard before insert or update of name, parent_id, archived_at on public.work_areas
  for each row execute function private.guard_location_siblings();

-- Updates are audited; a subtree's path-only rewrite after a move is not
-- repeated per descendant because the moved location's own event records it.
create trigger audit_area_update after update on public.work_areas for each row
  when ((to_jsonb(old) - 'path_ids' - 'updated_at' - 'version') is distinct from (to_jsonb(new) - 'path_ids' - 'updated_at' - 'version'))
  execute function private.audit_mutation();

-- Installers keep exactly their package-derived access to areas, packages and
-- documents. They may additionally read the location rows above and below
-- their allocated areas so a room is shown as "Flat 52 > Bathroom".
create function private.can_view_location_hierarchy(p_area uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.current_role() in ('lead_installer','subcontract_installer'), false) and exists (
    select 1 from public.work_areas target
      join public.work_areas mine on mine.contract_id = target.contract_id
        and (target.id = any(mine.path_ids) or mine.id = any(target.path_ids))
      join public.work_packages p on p.work_area_id = mine.id
      join public.package_assignments pa on pa.work_package_id = p.id and pa.user_id = auth.uid()
    where target.id = p_area and target.organisation_id = private.current_org())
$$;
create policy area_hierarchy_read on public.work_areas for select to authenticated using (private.can_view_location_hierarchy(id));

create function private.insert_location_items(p_org uuid, p_contract uuid, p_parent uuid, p_items jsonb, p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; created uuid; item_index integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Provide at least one location' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    item_index := item_index + 1;
    perform private.only_keys(item, array['name','location_type','code','description','sort_order','children']);
    insert into public.work_areas(organisation_id, contract_id, parent_id, name, location_type, code, location, sort_order, created_by, created_request)
    values (p_org, p_contract, p_parent, private.field_text(item, 'name', 160, true),
      coalesce(private.field_text(item, 'location_type', 60), ''), coalesce(private.field_text(item, 'code', 40), ''),
      coalesce(private.field_text(item, 'description', 500), ''),
      coalesce(private.field_integer(item, 'sort_order', 0, 1000000), item_index), auth.uid(), p_request)
    returning id into created;
    if item->'children' is not null and item->'children' <> 'null'::jsonb then
      perform private.insert_location_items(p_org, p_contract, created, item->'children', p_request);
    end if;
  end loop;
end $$;

-- Bulk, nested creation so an apartment block or hospital can be set up in one
-- request, e.g. Flats 51-58 each with a Bathroom and Kitchen. Idempotent: a
-- retried request returns the same locations without creating duplicates.
create function public.create_locations(p_contract uuid, p_request_key uuid, p_parent uuid, p_items jsonb)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare org uuid; payload jsonb; prior uuid; total integer;
begin
  if not private.can_manage_contract(p_contract) then raise exception 'Location management permission required' using errcode='42501'; end if;
  org := private.current_org();
  payload := jsonb_build_object('contract', p_contract, 'parent', p_parent, 'items', p_items);
  prior := private.request_result(org, 'create_locations', p_request_key, payload);
  if prior is null then
    if p_parent is not null and not exists (select 1 from public.work_areas where id = p_parent and contract_id = p_contract) then
      raise exception 'Parent location not found on this contract' using errcode='23503';
    end if;
    if jsonb_typeof(p_items) is distinct from 'array' or octet_length(p_items::text) > 500000 then
      raise exception 'Provide a list of locations' using errcode='22023';
    end if;
    with recursive nodes(n) as (
      select value from jsonb_array_elements(p_items)
      union all
      select c.value from nodes, jsonb_array_elements(case when jsonb_typeof(nodes.n->'children') = 'array' then nodes.n->'children' else '[]'::jsonb end) c)
    select count(*) into total from nodes;
    if total = 0 or total > 2000 then raise exception 'Create between 1 and 2,000 locations per request' using errcode='22023'; end if;
    perform private.insert_location_items(org, p_contract, p_parent, p_items, p_request_key);
    perform private.record_request(org, 'create_locations', p_request_key, payload, p_request_key);
    prior := p_request_key;
  end if;
  return array(select id from public.work_areas where created_request = prior and created_by = auth.uid()
    order by cardinality(path_ids), sort_order, name, id);
end $$;

-- Rename, re-describe, reorder or move a location. Moving keeps the ID, so all
-- history recorded against it (allocations, inspections, snags) stays attached.
create function public.update_location(p_area uuid, p_version integer, p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare a public.work_areas; next_version integer;
begin
  select * into a from public.work_areas where id = p_area for update;
  if not found or not private.can_manage_contract(a.contract_id) then raise exception 'Location management permission required' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['name','location_type','code','description','substrate_notes','system_notes','sort_order','parent_id']);
  if a.version is distinct from p_version then raise exception 'Location changed; reload before saving' using errcode='40001'; end if;
  if a.archived_at is not null then raise exception 'Archived locations cannot be edited' using errcode='23514'; end if;
  update public.work_areas set
    name = case when p_data ? 'name' then private.field_text(p_data, 'name', 160, true) else name end,
    location_type = case when p_data ? 'location_type' then coalesce(private.field_text(p_data, 'location_type', 60), '') else location_type end,
    code = case when p_data ? 'code' then coalesce(private.field_text(p_data, 'code', 40), '') else code end,
    location = case when p_data ? 'description' then coalesce(private.field_text(p_data, 'description', 500), '') else location end,
    substrate_notes = case when p_data ? 'substrate_notes' then coalesce(private.field_text(p_data, 'substrate_notes', 4000), '') else substrate_notes end,
    system_notes = case when p_data ? 'system_notes' then coalesce(private.field_text(p_data, 'system_notes', 4000), '') else system_notes end,
    sort_order = case when p_data ? 'sort_order' then coalesce(private.field_integer(p_data, 'sort_order', 0, 1000000), 0) else sort_order end,
    parent_id = case when p_data ? 'parent_id' then private.field_uuid(p_data, 'parent_id') else parent_id end,
    version = version + 1, updated_at = now()
  where id = p_area returning version into next_version;
  return next_version;
end $$;

-- Archiving retires a location and everything inside it from new work while
-- keeping every record made against it. There is no delete.
create function public.archive_location(p_area uuid, p_version integer, p_reason text)
returns integer language plpgsql security definer set search_path='' as $$
declare a public.work_areas; archived integer;
begin
  select * into a from public.work_areas where id = p_area for update;
  if not found or not private.can_manage_contract(a.contract_id) then raise exception 'Location management permission required' using errcode='42501'; end if;
  if a.version is distinct from p_version then raise exception 'Location changed; reload before saving' using errcode='40001'; end if;
  if a.archived_at is not null then raise exception 'Location is already archived' using errcode='23514'; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 2000 then
    raise exception 'Record why this location is being archived' using errcode='22023';
  end if;
  update public.work_areas set archived_at = now(), archived_by = auth.uid(), archive_reason = trim(p_reason),
    version = version + 1, updated_at = now()
  where p_area = any(path_ids) and contract_id = a.contract_id and archived_at is null;
  get diagnostics archived = row_count;
  return archived;
end $$;

revoke all on function private.only_keys(jsonb,text[]), private.field_text(jsonb,text,integer,boolean),
  private.field_uuid(jsonb,text,boolean), private.field_uuids(jsonb,text,integer), private.field_date(jsonb,text,boolean),
  private.field_timestamp(jsonb,text), private.field_integer(jsonb,text,integer,integer), private.field_boolean(jsonb,text),
  private.site_today(), private.set_location_path(), private.cascade_location_path(), private.guard_location_siblings(),
  private.can_view_location_hierarchy(uuid), private.insert_location_items(uuid,uuid,uuid,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function private.can_view_location_hierarchy(uuid), private.site_today() to authenticated;
revoke all on function public.create_locations(uuid,uuid,uuid,jsonb), public.update_location(uuid,integer,jsonb),
  public.archive_location(uuid,integer,text) from public, anon;
grant execute on function public.create_locations(uuid,uuid,uuid,jsonb), public.update_location(uuid,integer,jsonb),
  public.archive_location(uuid,integer,text) to authenticated;
commit;
