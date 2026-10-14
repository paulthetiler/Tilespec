-- Phase 3A. Additive only: legacy morning checks, issues, evidence and workforce
-- rows are never rewritten. Review before applying to any hosted database.
begin;
do $$ begin
  if to_regprocedure('private.can_supervise_contract(uuid)') is null
    or to_regprocedure('public.confirm_planned_allocation(uuid,jsonb)') is null
    or to_regprocedure('private.guard_append_only()') is null
    or to_regclass('public.subcontractor_companies') is null
    or to_regprocedure('private.only_keys(jsonb,text[])') is null
    or to_regprocedure('private.audit_mutation()') is null then
    raise exception 'Preflight failed: apply supervisor daily workforce first';
  end if;
  if to_regclass('public.location_inspection_templates') is not null
    or to_regclass('public.location_inspections') is not null
    or to_regclass('public.location_inspection_allocations') is not null
    or to_regprocedure('public.create_location_inspection_template(uuid,jsonb)') is not null
    or to_regprocedure('public.record_location_inspection(uuid,jsonb)') is not null then
    raise exception 'Preflight failed: location inspection objects already exist';
  end if;
end $$;

-- Each edit is a new revision; no silent replacement of an inspected checklist.
create table public.location_inspection_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  work_area_id uuid not null,
  stage public.installation_stage not null,
  title text not null check(length(trim(title)) between 1 and 160),
  specification_reference text not null check(length(trim(specification_reference)) between 1 and 160),
  specification_revision text not null check(length(trim(specification_revision)) between 1 and 80),
  wet_area boolean not null,
  checklist jsonb not null check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist) between 1 and 50),
  supersedes_id uuid unique,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,supersedes_id) references public.location_inspection_templates(organisation_id,contract_id,id)
);
create table public.location_inspections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  work_area_id uuid not null,
  template_id uuid not null,
  location_path text[] not null,
  answers jsonb not null,
  issues_count integer not null check(issues_count between 0 and 50),
  actor_id uuid not null default auth.uid() references auth.users(id),
  actor_name text not null,
  created_at timestamptz not null default now(),
  unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,template_id) references public.location_inspection_templates(organisation_id,contract_id,id)
);
create table public.location_inspection_allocations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  inspection_id uuid not null,
  actual_allocation_id uuid not null,
  -- Captures the attendance known at inspection time. Original allocation and
  -- attendance IDs remain in the snapshot, even after departures or voiding.
  workforce_snapshot jsonb not null,
  unique(inspection_id,actual_allocation_id),
  foreign key(organisation_id,contract_id,inspection_id) references public.location_inspections(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,actual_allocation_id) references public.actual_allocations(organisation_id,contract_id,id)
);
create index location_inspections_history on public.location_inspections(contract_id,work_area_id,created_at desc);
create index location_templates_scope on public.location_inspection_templates(contract_id,work_area_id,stage);

-- No widening of existing evidence or issue permissions, no synthetic approvals
-- or work-release state. Stage outcomes are observations only in Phase 3A.
do $$ declare t text; begin
  foreach t in array array['location_inspection_templates','location_inspections','location_inspection_allocations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy site_read on public.%I for select to authenticated using (organisation_id=private.current_org() and private.can_supervise_contract(contract_id))',t);
    execute format('create trigger immutable before update or delete on public.%I for each row execute function private.guard_append_only()',t);
    execute format('create trigger audit_insert after insert on public.%I for each row execute function private.audit_mutation()',t);
  end loop;
end $$;

create function public.create_location_inspection_template(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); c uuid := (p_data->>'contract_id')::uuid;
  area uuid := (p_data->>'work_area_id')::uuid; previous uuid := (p_data->>'supersedes_id')::uuid;
  result uuid; item jsonb; prior public.location_inspection_templates;
begin
  perform private.only_keys(p_data,array['contract_id','work_area_id','stage','title','specification_reference','specification_revision','wet_area','checklist','supersedes_id']);
  perform private.field_text(p_data,'title',160,true);
  perform private.field_text(p_data,'specification_reference',160,true);
  perform private.field_text(p_data,'specification_revision',80,true);
  perform private.assert_choice(p_data->>'stage','stage',private.installation_stages());
  if not private.can_manage_contract(c) then raise exception 'Office permission required' using errcode='42501'; end if;
  result := private.request_result(org,'create_location_inspection_template',p_request_key,p_data);
  if result is not null then return result; end if;
  if not exists(select 1 from public.work_areas where id=area and contract_id=c and organisation_id=org and archived_at is null) then
    raise exception 'Choose an active location on this site' using errcode='22023'; end if;
  if p_data->>'wet_area' is null or jsonb_typeof(p_data->'wet_area') <> 'boolean'
    or jsonb_typeof(p_data->'checklist') is distinct from 'array' then
    raise exception 'Specify wet-area applicability and a checklist' using errcode='22023'; end if;
  if jsonb_array_length(p_data->'checklist') not between 1 and 50 then
    raise exception 'Supply between 1 and 50 checks' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_data->'checklist') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'label') is distinct from 'string'
      or length(trim(item->>'label')) not between 1 and 500
      or jsonb_typeof(item->'wet_only') is distinct from 'boolean'
      or (select count(*) from jsonb_object_keys(item)) <> 2 then
      raise exception 'Each check needs a label and wet-only flag' using errcode='22023'; end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(p_data->'checklist') i where not (i->>'wet_only')::boolean or (p_data->>'wet_area')::boolean) then
    raise exception 'The template needs at least one applicable check' using errcode='22023'; end if;
  if previous is not null then
    select * into prior from public.location_inspection_templates where id=previous for update;
    if not found or prior.organisation_id<>org or prior.contract_id<>c or prior.work_area_id<>area
      or prior.stage::text<>p_data->>'stage' then
      raise exception 'Revise a template for the same location and stage' using errcode='22023'; end if;
    if exists(select 1 from public.location_inspection_templates where supersedes_id=previous) then
      raise exception 'This template has already been revised. Refresh first' using errcode='40001'; end if;
  end if;
  insert into public.location_inspection_templates(organisation_id,contract_id,work_area_id,stage,title,
    specification_reference,specification_revision,wet_area,checklist,supersedes_id)
  values(org,c,area,(p_data->>'stage')::public.installation_stage,p_data->>'title',p_data->>'specification_reference',
    p_data->>'specification_revision',(p_data->>'wet_area')::boolean,p_data->'checklist',previous) returning id into result;
  perform private.record_request(org,'create_location_inspection_template',p_request_key,p_data,result);
  return result;
end $$;

create function public.record_location_inspection(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); c uuid := (p_data->>'contract_id')::uuid;
  area uuid := (p_data->>'work_area_id')::uuid; result uuid; template public.location_inspection_templates;
  target public.work_areas; checks jsonb; answer jsonb; normalized jsonb := '[]'; item jsonb; n integer := 0; issues integer := 0;
  allocation uuid; allocation_ids uuid[]; a public.actual_allocations; snapshot jsonb;
begin
  perform private.only_keys(p_data,array['contract_id','work_area_id','template_id','answers','allocation_ids']);
  if not private.can_supervise_contract(c) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  result := private.request_result(org,'record_location_inspection',p_request_key,p_data);
  if result is not null then return result; end if;
  select * into target from public.work_areas where id=area and contract_id=c and organisation_id=org for share;
  if not found or target.archived_at is not null then raise exception 'Choose an active location on this site' using errcode='22023'; end if;
  select * into template from public.location_inspection_templates where id=(p_data->>'template_id')::uuid for share;
  if not found or template.organisation_id<>org or template.contract_id<>c or not(template.work_area_id=any(target.path_ids)) then
    raise exception 'Choose a template for this location or its containing location' using errcode='22023'; end if;
  if exists(select 1 from public.location_inspection_templates where supersedes_id=template.id) then
    raise exception 'The template has been revised. Refresh before inspecting' using errcode='40001'; end if;
  select jsonb_agg(value order by ord) into checks from jsonb_array_elements(template.checklist) with ordinality i(value,ord)
    where not (value->>'wet_only')::boolean or template.wet_area;
  if jsonb_typeof(p_data->'answers') is distinct from 'array' then
    raise exception 'Answer every applicable check' using errcode='22023'; end if;
  if jsonb_array_length(p_data->'answers')<>jsonb_array_length(checks) then
    raise exception 'Answer every applicable check' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(checks) loop
    answer := p_data->'answers'->n; n := n+1;
    if jsonb_typeof(answer) is distinct from 'object' or answer->>'status' is null or answer->>'status' not in ('pass','issue','na')
      or jsonb_typeof(answer->'note') is distinct from 'string' or length(answer->>'note')>2000
      or (answer->>'status' in ('issue','na') and length(trim(answer->>'note'))=0) then
      raise exception 'Every check needs Pass, Issue or N/A; Issue and N/A need a reason' using errcode='22023'; end if;
    normalized := normalized || jsonb_build_array(jsonb_build_object('item',item->>'label','status',answer->>'status','note',trim(answer->>'note')));
    if answer->>'status'='issue' then issues := issues+1; end if;
  end loop;
  if jsonb_typeof(p_data->'allocation_ids') is distinct from 'array' then
    raise exception 'Supply the actual work periods, or an empty list' using errcode='22023'; end if;
  allocation_ids := private.field_uuids(p_data,'allocation_ids',100);
  insert into public.location_inspections(organisation_id,contract_id,work_area_id,template_id,location_path,answers,issues_count,actor_name)
  values(org,c,area,template.id,array(select w.name from unnest(target.path_ids) with ordinality p(id,ord)
    join public.work_areas w on w.id=p.id order by p.ord),normalized,issues,(select display_name from public.organisation_members where user_id=auth.uid() and organisation_id=org)) returning id into result;
  foreach allocation in array allocation_ids loop
    select * into a from public.actual_allocations where id=allocation for share;
    if not found or a.organisation_id<>org or a.contract_id<>c or a.voided_at is not null
      or a.started_at>now() or a.stage<>template.stage or not exists(select 1 from public.work_areas w where w.id=a.work_area_id
        and (w.id=any(target.path_ids) or w.path_ids @> array[target.id])) then
      raise exception 'Link only genuine, non-voided work at this location branch and stage' using errcode='22023'; end if;
    select jsonb_build_object('allocation',to_jsonb(a),
      'team_name',(select name from public.teams where id=a.team_id),
      'company_name',(select c.name from public.teams t join public.subcontractor_companies c on c.id=t.company_id where t.id=a.team_id),
      'attendance',coalesce(jsonb_agg(to_jsonb(ao) || jsonb_build_object('display_name',o.display_name) order by ao.joined_at,ao.id),'[]'))
      into snapshot from public.actual_allocation_operatives ao join public.operatives o on o.id=ao.operative_id where ao.actual_allocation_id=a.id;
    insert into public.location_inspection_allocations(organisation_id,contract_id,inspection_id,actual_allocation_id,workforce_snapshot)
      values(org,c,result,a.id,snapshot);
  end loop;
  perform private.record_request(org,'record_location_inspection',p_request_key,p_data,result);
  return result;
end $$;
revoke all on function public.create_location_inspection_template(uuid,jsonb),public.record_location_inspection(uuid,jsonb) from public,anon;
grant execute on function public.create_location_inspection_template(uuid,jsonb),public.record_location_inspection(uuid,jsonb) to authenticated;
commit;
