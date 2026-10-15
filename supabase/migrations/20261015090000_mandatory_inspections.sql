-- Phase 3C: explicit, versioned inspection applicability. Historical templates,
-- answers, photographs and actual allocation snapshots are never rewritten.
begin;
do $$ begin
 if to_regclass('public.location_inspection_templates') is null or to_regclass('public.supervisor_issue_photos') is null
  or to_regprocedure('public.snag_context(uuid)') is null or to_regprocedure('private.can_read_snag(uuid)') is null
  or to_regprocedure('private.only_keys(jsonb,text[])') is null or to_regprocedure('private.guard_append_only()') is null then
  raise exception 'Preflight failed: apply location inspections and snag lifecycle first';
 end if;
 if to_regclass('public.location_inspection_requirements') is not null
  or to_regprocedure('private.mandatory_work_requirements(uuid,uuid,uuid,text)') is not null
  or to_regprocedure('private.assert_hold_requirements(uuid,uuid,text,uuid,timestamp with time zone)') is not null
  or to_regprocedure('public.configure_inspection_requirement(uuid,jsonb)') is not null
  or to_regprocedure('public.inspection_requirements(uuid,uuid,uuid,text)') is not null
  or exists(select 1 from pg_attribute where attrelid='public.location_inspections'::regclass and attname='work_package_id' and not attisdropped) then
  raise exception 'Preflight failed: mandatory inspection objects already exist';
 end if;
end $$;

alter table public.location_inspections add column work_package_id uuid,
 add constraint inspection_package_scope foreign key(organisation_id,contract_id,work_package_id)
 references public.work_packages(organisation_id,contract_id,id);

create table public.location_inspection_requirements (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null,
 contract_id uuid not null, work_area_id uuid not null, work_package_id uuid,
 stage public.installation_stage not null, applicability text not null check(applicability in ('required','not_required')),
 template_id uuid, approved_document_ids uuid[] not null check(cardinality(approved_document_ids) between 1 and 12),
 basis text not null check(length(trim(basis)) between 5 and 2000),
 supersedes_id uuid unique, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), unique(organisation_id,contract_id,id),
 foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
 foreign key(organisation_id,contract_id,work_package_id) references public.work_packages(organisation_id,contract_id,id),
 foreign key(organisation_id,contract_id,template_id) references public.location_inspection_templates(organisation_id,contract_id,id),
 foreign key(organisation_id,contract_id,supersedes_id) references public.location_inspection_requirements(organisation_id,contract_id,id),
 check((applicability='required' and template_id is not null) or (applicability='not_required' and template_id is null))
);
create index mandatory_requirement_scope on public.location_inspection_requirements(contract_id,work_area_id,stage);
alter table public.location_inspection_requirements enable row level security;
revoke all on public.location_inspection_requirements from public,anon,authenticated;
grant select on public.location_inspection_requirements to authenticated;
create policy requirement_read on public.location_inspection_requirements for select to authenticated
 using(organisation_id=private.current_org() and private.can_supervise_contract(contract_id));
create trigger immutable before update or delete on public.location_inspection_requirements
 for each row execute function private.guard_append_only();
create trigger audit_insert after insert on public.location_inspection_requirements
 for each row execute function private.audit_mutation();

create function public.configure_inspection_requirement(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid:=(p_data->>'contract_id')::uuid;
 area uuid:=(p_data->>'work_area_id')::uuid; package uuid:=(p_data->>'work_package_id')::uuid;
 previous uuid:=(p_data->>'supersedes_id')::uuid; template uuid:=(p_data->>'template_id')::uuid;
 result uuid; docs uuid[]; doc uuid; target public.work_areas; prior public.location_inspection_requirements;
 checklist public.location_inspection_templates;
begin
 perform private.only_keys(p_data,array['contract_id','work_area_id','work_package_id','stage','applicability','template_id','approved_document_ids','basis','supersedes_id']);
 perform private.field_text(p_data,'basis',2000,true);
 if length(trim(p_data->>'basis'))<5 then raise exception 'Record the approved specification basis' using errcode='22023'; end if;
 perform private.assert_choice(p_data->>'stage','stage',private.installation_stages());
 perform private.assert_choice(p_data->>'applicability','applicability',array['required','not_required']);
 if not private.can_manage_contract(c) then raise exception 'Office permission required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tilespec-work-release:'||c::text,0));
 result:=private.request_result(org,'configure_inspection_requirement',p_request_key,p_data);
 if result is not null then return result; end if;
 select * into target from public.work_areas where id=area and contract_id=c and organisation_id=org and archived_at is null for share;
 if not found then raise exception 'Choose an active location on this site' using errcode='22023'; end if;
 if package is not null and not exists(select 1 from public.work_packages p where p.id=package and p.contract_id=c and p.organisation_id=org and p.work_area_id=any(target.path_ids)) then
  raise exception 'Choose a work package covering this location' using errcode='22023'; end if;
 docs:=private.field_uuids(p_data,'approved_document_ids',12);
 if cardinality(docs)=0 then raise exception 'Approve at least one verified specification or manufacturer document revision' using errcode='22023'; end if;
 foreach doc in array docs loop
  if not exists(select 1 from public.document_revisions d where d.id=doc and d.organisation_id=org and d.contract_id=c
   and d.classification='operational' and d.uploaded_at is not null
   and (d.work_area_id is null or d.work_area_id=any(target.path_ids))) then
   raise exception 'Approve only verified operational documents covering this location' using errcode='22023'; end if;
 end loop;
 if p_data->>'applicability'='required' then
  select * into checklist from public.location_inspection_templates where id=template;
  if not found or checklist.organisation_id<>org or checklist.contract_id<>c or not(checklist.work_area_id=any(target.path_ids))
   or checklist.stage::text<>p_data->>'stage' or exists(select 1 from public.location_inspection_templates where supersedes_id=template)
   or not exists(select 1 from jsonb_array_elements(checklist.checklist) i where (not (i->>'wet_only')::boolean or checklist.wet_area)
    and (coalesce((i->>'mandatory')::boolean,false) or coalesce((i->>'hold_point')::boolean,false))) then
   raise exception 'Choose a current applicable template with a mandatory check or hold point' using errcode='22023'; end if;
 elsif template is not null then raise exception 'Not-required applicability must not select a template' using errcode='22023'; end if;
 if previous is not null then
  select * into prior from public.location_inspection_requirements where id=previous for update;
  if not found or prior.organisation_id<>org or prior.contract_id<>c or prior.work_area_id<>area
   or prior.work_package_id is distinct from package or prior.stage::text<>p_data->>'stage' then
   raise exception 'Revise the same requirement scope' using errcode='22023'; end if;
  if exists(select 1 from public.location_inspection_requirements where supersedes_id=previous) then
   raise exception 'This requirement has already been revised. Refresh first' using errcode='40001'; end if;
 elsif exists(select 1 from public.location_inspection_requirements r where r.contract_id=c and r.work_area_id=area
   and r.work_package_id is not distinct from package and r.stage::text=p_data->>'stage'
   and not exists(select 1 from public.location_inspection_requirements n where n.supersedes_id=r.id)) then
  raise exception 'Revise the existing applicability decision for this scope' using errcode='40001';
 end if;
 insert into public.location_inspection_requirements(organisation_id,contract_id,work_area_id,work_package_id,stage,applicability,template_id,approved_document_ids,basis,supersedes_id,created_at)
 values(org,c,area,package,(p_data->>'stage')::public.installation_stage,p_data->>'applicability',template,docs,trim(p_data->>'basis'),previous,clock_timestamp()) returning id into result;
 perform private.record_request(org,'configure_inspection_requirement',p_request_key,p_data,result);
 return result;
end $$;

-- All current ancestor requirements accumulate. A narrower not-required
-- decision never clears an ancestor's mandatory check. Omitted package scope
-- evaluates every relevant package requirement rather than bypassing it.
create function private.mandatory_work_requirements(p_contract uuid,p_area uuid,p_package uuid,p_stage text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target public.work_areas; r public.location_inspection_requirements; t public.location_inspection_templates;
 inspection public.location_inspections; items jsonb:='[]'; blockers jsonb:='[]'; state text; configured boolean:=false;
 bad boolean:=false; passed boolean:=true; missing boolean:=false; scope_known boolean:=false;
begin
 select * into target from public.work_areas where id=p_area and contract_id=p_contract and organisation_id=private.current_org() and archived_at is null;
 if not found or p_stage is null or p_stage<>all(private.installation_stages()) then
  return jsonb_build_object('configured',false,'unknown',true,'passed',false,'failed',false,'requirements','[]'::jsonb,'blockers',jsonb_build_array('Location or activity applicability is unknown'));
 end if;
 if p_package is not null and not exists(select 1 from public.work_packages p where p.id=p_package
  and p.organisation_id=private.current_org() and p.contract_id=p_contract and p.work_area_id=any(target.path_ids)) then
  raise exception 'Choose a work package covering this location' using errcode='22023'; end if;
 for r in select req.* from public.location_inspection_requirements req where req.organisation_id=private.current_org() and req.contract_id=p_contract
  and req.work_area_id=any(target.path_ids) and req.stage::text=p_stage
  and (p_package is null or req.work_package_id is null or req.work_package_id=p_package)
  and not exists(select 1 from public.location_inspection_requirements n where n.supersedes_id=req.id)
  order by req.created_at,req.id loop
  configured:=true; state:='not_required'; inspection:=null; t:=null;
  scope_known:=scope_known or p_package is not null or r.work_package_id is null;
  if r.applicability='required' then
   select * into t from public.location_inspection_templates where id=r.template_id;
   if exists(select 1 from public.location_inspection_templates where supersedes_id=t.id) then
    state:='configuration_outdated';
   else
    -- A whole-location observation covers a requested package; a package-only
    -- observation covers that exact package and cannot clear the whole room.
    select * into inspection from public.location_inspections i where i.contract_id=p_contract and i.work_area_id=p_area and i.template_id=r.template_id
     and (i.work_package_id is not distinct from r.work_package_id
      or (r.work_package_id is null and p_package is not null and i.work_package_id=p_package))
     and i.created_at>=r.created_at order by i.created_at desc,i.id desc limit 1;
    if not found then state:='awaiting_inspection';
    elsif exists(select 1 from jsonb_array_elements(inspection.answers) a where
      (coalesce((a->>'mandatory')::boolean,false) or coalesce((a->>'hold_point')::boolean,false))
      and (a->>'status'<>'pass' or (coalesce((a->>'evidence_required')::boolean,false)
       and jsonb_array_length(coalesce(a->'document_ids','[]'::jsonb))+jsonb_array_length(coalesce(a->'photo_ids','[]'::jsonb))=0))) then
     state:='failed'; bad:=true;
    elsif not exists(select 1 from jsonb_array_elements(inspection.answers) a where coalesce((a->>'mandatory')::boolean,false) or coalesce((a->>'hold_point')::boolean,false)) then
     state:='awaiting_inspection';
    else state:='passed'; end if;
   end if;
  end if;
  if state not in ('passed','not_required') then passed:=false; blockers:=blockers||jsonb_build_array(jsonb_build_object('requirement_id',r.id,'template_id',r.template_id,'status',state)); end if;
  items:=items||jsonb_build_array(to_jsonb(r)||jsonb_build_object('status',state,'inspection_id',inspection.id,'inspection_at',inspection.created_at,'title',t.title));
 end loop;
 if configured and not scope_known then blockers:=blockers||jsonb_build_array('Only a specific work package has been assessed; applicability for the whole location remains unknown'); end if;
 -- A flagged current template cannot be neutralised by approving an unrelated
 -- not-required decision. Office must revise the template or configure its
 -- actual mandatory applicability; stale or missing approval stays unknown.
 for t in select template.* from public.location_inspection_templates template where template.contract_id=p_contract
  and template.organisation_id=private.current_org() and template.work_area_id=any(target.path_ids) and template.stage::text=p_stage
  and not exists(select 1 from public.location_inspection_templates next where next.supersedes_id=template.id)
  and exists(select 1 from jsonb_array_elements(template.checklist) check_item where
   (not (check_item->>'wet_only')::boolean or template.wet_area)
   and (coalesce((check_item->>'mandatory')::boolean,false) or coalesce((check_item->>'hold_point')::boolean,false)))
  and not exists(select 1 from public.location_inspection_requirements req where req.contract_id=p_contract
   and req.template_id=template.id and req.work_area_id=any(target.path_ids) and req.applicability='required'
   and (req.work_package_id is null or (p_package is not null and req.work_package_id=p_package))
   and not exists(select 1 from public.location_inspection_requirements next_req where next_req.supersedes_id=req.id)) loop
  missing:=true; passed:=false;
  blockers:=blockers||jsonb_build_array(jsonb_build_object('template_id',t.id,'status','applicability_not_configured'));
 end loop;
 if not configured then blockers:=jsonb_build_array('Office has not configured inspection applicability for this location and activity'); end if;
 return jsonb_build_object('configured',configured and scope_known and not missing,'unknown',not configured or not scope_known or missing,'passed',configured and scope_known and passed and not missing,'failed',bad,'requirements',items,'blockers',blockers);
end $$;

create function private.assert_hold_requirements(p_contract uuid,p_area uuid,p_stage text,p_package uuid,p_after timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare area uuid; stage text; result jsonb; scopes jsonb:='[]'; r jsonb; checked integer:=0;
begin
 for area in select w.id from public.work_areas w where w.contract_id=p_contract and w.organisation_id=private.current_org() and w.archived_at is null
  and (p_area is null or w.path_ids @> array[p_area])
  and not exists(select 1 from public.work_areas child where child.parent_id=w.id and child.archived_at is null)
  and (p_package is null or exists(select 1 from public.work_packages p where p.id=p_package and p.contract_id=p_contract and p.work_area_id=any(w.path_ids))) loop
  foreach stage in array (case when p_stage is null then private.installation_stages() else array[p_stage] end) loop
   result:=private.mandatory_work_requirements(p_contract,area,p_package,stage); checked:=checked+1;
   if not(result->>'passed')::boolean then raise exception 'Mandatory inspection applicability is unknown, outstanding or failed for an affected location and activity' using errcode='22023'; end if;
   for r in select value from jsonb_array_elements(result->'requirements') loop
    if r->>'status'='passed' and p_after is not null and (r->>'inspection_at')::timestamptz<p_after then
     raise exception 'Save an updated passing mandatory inspection after the corrective action' using errcode='22023'; end if;
   end loop;
   scopes:=scopes||jsonb_build_array(jsonb_build_object('work_area_id',area,'stage',stage,'requirements',result));
  end loop;
 end loop;
 if checked=0 then raise exception 'No active affected location has configured inspection applicability' using errcode='22023'; end if;
 return jsonb_build_object('passed',true,'scopes',scopes);
end $$;

create function public.inspection_requirements(p_contract uuid,p_area uuid,p_package uuid,p_stage text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_supervise_contract(p_contract) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
 return private.mandatory_work_requirements(p_contract,p_area,p_package,p_stage);
end $$;
revoke all on function private.mandatory_work_requirements(uuid,uuid,uuid,text),private.assert_hold_requirements(uuid,uuid,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.configure_inspection_requirement(uuid,jsonb),public.inspection_requirements(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.configure_inspection_requirement(uuid,jsonb),public.inspection_requirements(uuid,uuid,uuid,text) to authenticated;

create or replace function public.create_location_inspection_template(p_request_key uuid,p_data jsonb) returns uuid
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
  perform pg_advisory_xact_lock(hashtextextended('tilespec-work-release:'||c::text,0));
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
      or not(item ? 'label' and item ? 'wet_only')
      or exists(select 1 from jsonb_object_keys(item) k where k not in ('label','wet_only','mandatory','hold_point','evidence_required'))
      or exists(select 1 from unnest(array['mandatory','hold_point','evidence_required']) k where item ? k and jsonb_typeof(item->k)<>'boolean') then
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

create or replace function public.record_location_inspection(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); c uuid := (p_data->>'contract_id')::uuid;
  area uuid := (p_data->>'work_area_id')::uuid; result uuid; template public.location_inspection_templates;
  target public.work_areas; checks jsonb; answer jsonb; normalized jsonb := '[]'; item jsonb; n integer := 0; issues integer := 0;
  allocation uuid; allocation_ids uuid[]; a public.actual_allocations; snapshot jsonb;
  package uuid:=(p_data->>'work_package_id')::uuid; docs uuid[]; photos uuid[]; evidence uuid; extended boolean;
begin
  perform private.only_keys(p_data,array['contract_id','work_area_id','work_package_id','template_id','answers','allocation_ids']);
  if not private.can_supervise_contract(c) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tilespec-work-release:'||c::text,0));
  result := private.request_result(org,'record_location_inspection',p_request_key,p_data);
  if result is not null then return result; end if;
  select * into target from public.work_areas where id=area and contract_id=c and organisation_id=org for share;
  if not found or target.archived_at is not null then raise exception 'Choose an active location on this site' using errcode='22023'; end if;
  if package is not null and not exists(select 1 from public.work_packages p where p.id=package and p.contract_id=c and p.organisation_id=org and p.work_area_id=any(target.path_ids)) then
    raise exception 'Choose a work package covering this location' using errcode='22023'; end if;
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
    perform private.only_keys(answer,array['status','note','document_ids','photo_ids']);
    docs:=private.field_uuids(answer,'document_ids',12); photos:=private.field_uuids(answer,'photo_ids',12);
    foreach evidence in array docs loop
      if not exists(select 1 from public.document_revisions d where d.id=evidence and d.organisation_id=org and d.contract_id=c
        and d.classification='operational' and d.uploaded_at is not null and (d.work_area_id is null or d.work_area_id=any(target.path_ids))) then
        raise exception 'Use verified operational evidence covering this location' using errcode='22023'; end if;
    end loop;
    foreach evidence in array photos loop
      if not exists(select 1 from public.supervisor_issue_photos p join public.supervisor_issues i on i.id=p.issue_id
        where p.id=evidence and p.uploaded_at is not null and p.organisation_id=org and p.contract_id=c
        and p.event_id is not null and i.snag_status not in ('draft','cancelled')
        and (p.purpose='original' or p.repair_cycle=i.repair_cycle)
        and i.stage=template.stage and i.work_area_id=area and private.can_read_snag(i.id)) then
        raise exception 'Use verified snag photographs for this location and stage' using errcode='22023'; end if;
    end loop;
    if coalesce((item->>'evidence_required')::boolean,false) and answer->>'status'='pass' and cardinality(docs)+cardinality(photos)=0 then
      raise exception 'A passing evidence-required check needs a verified photograph or document' using errcode='22023'; end if;
    extended:=item ? 'mandatory' or item ? 'hold_point' or item ? 'evidence_required' or cardinality(docs)+cardinality(photos)>0;
    normalized := normalized || jsonb_build_array(jsonb_build_object('item',item->>'label','status',answer->>'status','note',trim(answer->>'note')) ||
      case when extended then jsonb_build_object('mandatory',coalesce((item->>'mandatory')::boolean,false),
        'hold_point',coalesce((item->>'hold_point')::boolean,false),'evidence_required',coalesce((item->>'evidence_required')::boolean,false),
        'document_ids',to_jsonb(docs),'photo_ids',to_jsonb(photos)) else '{}'::jsonb end);
    if answer->>'status'='issue' then issues := issues+1; end if;
  end loop;
  if jsonb_typeof(p_data->'allocation_ids') is distinct from 'array' then
    raise exception 'Supply the actual work periods, or an empty list' using errcode='22023'; end if;
  allocation_ids := private.field_uuids(p_data,'allocation_ids',100);
  insert into public.location_inspections(organisation_id,contract_id,work_area_id,template_id,location_path,answers,issues_count,actor_name,work_package_id,created_at)
  values(org,c,area,template.id,array(select w.name from unnest(target.path_ids) with ordinality p(id,ord)
    join public.work_areas w on w.id=p.id order by p.ord),normalized,issues,(select display_name from public.organisation_members where user_id=auth.uid() and organisation_id=org),package,
    case when exists(select 1 from jsonb_array_elements(normalized) saved(value) where saved.value ? 'mandatory') then clock_timestamp() else now() end) returning id into result;
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

commit;
