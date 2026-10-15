-- Practical supervisor workflow. Additive records only. Review before hosted use.
begin;
do $$ begin
  if to_regprocedure('public.end_open_allocations(uuid,timestamptz)') is null
    or to_regclass('public.work_holds') is null
    or to_regclass('public.location_inspections') is null then
    raise exception 'Preflight failed: Supervisor V2 through Phase 3C is required';
  end if;
  if to_regclass('public.supervisor_office_items') is not null or to_regclass('public.site_handovers') is not null then
    raise exception 'Preflight failed: daily workflow objects already exist; review schema drift';
  end if;
end $$;

-- Ten-answer historic morning checks remain valid and unchanged. The shorter
-- practical routine has eleven questions; neither format grants work release.
alter table public.supervisor_inspections drop constraint supervisor_inspections_answers_check;
alter table public.supervisor_inspections add constraint supervisor_inspections_answers_check
  check(jsonb_typeof(answers)='array' and jsonb_array_length(answers) in (10,11));

-- Hold notifications are specific immutable hold/event records. Office-authored
-- instructions and QA requests therefore use one bounded related daily inbox.
create table public.supervisor_office_items (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  request_key uuid not null, kind text not null check(kind in ('instruction','qa_request')),
  title text not null check(length(trim(title)) between 1 and 160),
  body text not null check(length(trim(body)) between 1 and 2000),
  recipient_id uuid references auth.users(id), recipient_name text,
  acknowledgement_required boolean not null default false,
  work_area_id uuid, location_path text[] not null default '{}', stage public.installation_stage,
  work_package_id uuid, due_on date,
  created_by uuid not null references auth.users(id), created_by_name text not null,
  created_at timestamptz not null default now(),
  unique(organisation_id,contract_id,id), unique(organisation_id,created_by,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,work_package_id) references public.work_packages(organisation_id,contract_id,id),
  check(kind<>'qa_request' or (recipient_id is not null and work_area_id is not null and stage is not null)),
  check(work_package_id is null or work_area_id is not null)
);
create table public.supervisor_office_acknowledgements (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  item_id uuid not null, actor_id uuid not null references auth.users(id), request_key uuid not null,
  acknowledged_at timestamptz not null default now(), unique(item_id,actor_id), unique(organisation_id,actor_id,request_key),
  foreign key(organisation_id,contract_id,item_id) references public.supervisor_office_items(organisation_id,contract_id,id)
);
create table public.supervisor_qa_submissions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  item_id uuid not null unique, inspection_id uuid not null,
  submitted_by uuid not null references auth.users(id), submitted_at timestamptz not null default now(), request_key uuid not null,
  has_issues boolean not null,
  unique(organisation_id,submitted_by,request_key),
  foreign key(organisation_id,contract_id,item_id) references public.supervisor_office_items(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,inspection_id) references public.location_inspections(organisation_id,contract_id,id)
);
create table public.site_handovers (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  actor_id uuid not null references auth.users(id), actor_name text not null, request_key uuid not null,
  work_date date not null, finished_at timestamptz not null,
  work_completed text not null check(length(work_completed)<=2000),
  outstanding_problems text not null check(length(outstanding_problems)<=2000),
  materials_needed text not null check(length(materials_needed)<=2000),
  areas_awaiting_attention text not null check(length(areas_awaiting_attention)<=2000),
  office_notes text not null check(length(office_notes)<=2000),
  finish_workforce boolean not null,
  -- References only: attendance remains in the existing Phase 2B tables.
  actual_allocation_ids uuid[] not null default '{}', ended_count integer not null check(ended_count>=0),
  created_at timestamptz not null default now(),
  unique(organisation_id,actor_id,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  check(work_date=(finished_at at time zone 'Europe/London')::date)
);
create index supervisor_office_site on public.supervisor_office_items(contract_id,created_at desc,id);
create index supervisor_office_recipient on public.supervisor_office_items(recipient_id,kind,created_at desc);
create index site_handovers_day on public.site_handovers(contract_id,work_date,created_at desc);

alter table public.supervisor_office_items enable row level security;
alter table public.supervisor_office_acknowledgements enable row level security;
alter table public.supervisor_qa_submissions enable row level security;
alter table public.site_handovers enable row level security;
create policy daily_office_read on public.supervisor_office_items for select to authenticated using(
  organisation_id=private.current_org() and (private.can_manage_contract(contract_id)
    or (private.current_role()='supervisor' and private.can_supervise_contract(contract_id)
      and (recipient_id is null or recipient_id=auth.uid()))));
create policy daily_ack_read on public.supervisor_office_acknowledgements for select to authenticated using(
  organisation_id=private.current_org() and (private.can_manage_contract(contract_id)
    or (actor_id=auth.uid() and exists(select 1 from public.supervisor_office_items i where i.id=item_id))));
create policy daily_qa_read on public.supervisor_qa_submissions for select to authenticated using(
  organisation_id=private.current_org() and exists(select 1 from public.supervisor_office_items i where i.id=item_id));
create policy daily_handover_read on public.site_handovers for select to authenticated using(
  organisation_id=private.current_org() and private.can_supervise_contract(contract_id));

do $$ declare t text; begin
  foreach t in array array['supervisor_office_items','supervisor_office_acknowledgements','supervisor_qa_submissions','site_handovers'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create trigger daily_append_only before update or delete on public.%I for each row execute function private.guard_append_only()',t);
    execute format('create trigger daily_audit after insert on public.%I for each row execute function private.audit_mutation()',t);
  end loop;
end $$;

-- A narrow recipient projection. Supervisors cannot enumerate the office/member
-- directory, nor can an unassigned contracts manager inspect another site's staff.
create function public.site_supervisor_recipients(p_contract uuid)
returns table(user_id uuid,display_name text) language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_manage_contract(p_contract) then raise exception 'Office permission required for this site' using errcode='42501'; end if;
  return query select distinct m.user_id,m.display_name from public.organisation_members m
    join public.contract_assignments a on a.organisation_id=m.organisation_id and a.user_id=m.user_id
    where m.organisation_id=private.current_org() and m.active and m.role='supervisor'
      and a.contract_id=p_contract and a.valid_from<=current_date and (a.valid_until is null or a.valid_until>=current_date)
    order by m.display_name,m.user_id;
end $$;

create function public.create_supervisor_office_item(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; result uuid; target uuid; recipient text; k text; a uuid; s text; p uuid;
  path text[]:='{}'; requires_ack boolean; headline text; message text; due date;
begin
  perform private.only_keys(p_data,array['contract_id','kind','title','body','recipient_id','acknowledgement_required','work_area_id','stage','work_package_id','due_on']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_manage_contract(c) then raise exception 'Office permission required for this site' using errcode='42501'; end if;
  result:=private.request_result(org,'create_supervisor_office_item',p_request_key,p_data);
  if result is not null then return result; end if;
  k:=private.field_text(p_data,'kind',20,true);
  perform private.assert_choice(k,'kind',array['instruction','qa_request']);
  headline:=private.field_text(p_data,'title',160,true); message:=private.field_text(p_data,'body',2000,true);
  target:=private.field_uuid(p_data,'recipient_id'); a:=private.field_uuid(p_data,'work_area_id');
  s:=nullif(private.field_text(p_data,'stage',30),''); p:=private.field_uuid(p_data,'work_package_id');
  requires_ack:=coalesce(private.field_boolean(p_data,'acknowledgement_required'),false);
  due:=private.field_date(p_data,'due_on');
  if target is not null then
    select display_name into recipient from public.site_supervisor_recipients(c) where user_id=target;
    if not found then raise exception 'Choose a currently assigned site supervisor' using errcode='22023'; end if;
  end if;
  if k='qa_request' and (target is null or a is null or s is null) then
    raise exception 'Inspection requests need a supervisor, location and work stage' using errcode='22023'; end if;
  if s is not null then perform private.assert_choice(s,'stage',private.installation_stages()); end if;
  if a is not null then
    select array(select w.name from unnest(x.path_ids) with ordinality path(id,n)
      join public.work_areas w on w.id=path.id order by path.n) into path
      from public.work_areas x where x.id=a and x.contract_id=c and x.organisation_id=org and x.archived_at is null for share;
    if not found then raise exception 'Choose an active location on this site' using errcode='22023'; end if;
  end if;
  if p is not null and not exists(select 1 from public.work_packages wp join public.work_areas target_area on target_area.id=a
    where wp.id=p and wp.organisation_id=org and wp.contract_id=c and wp.work_area_id=any(target_area.path_ids)) then
    raise exception 'Choose a work package covering this location' using errcode='22023'; end if;
  insert into public.supervisor_office_items(organisation_id,contract_id,request_key,kind,title,body,recipient_id,recipient_name,
    acknowledgement_required,work_area_id,location_path,stage,work_package_id,due_on,created_by,created_by_name)
  values(org,c,p_request_key,k,headline,message,target,recipient,requires_ack,a,path,s::public.installation_stage,p,due,auth.uid(),
    (select display_name from public.organisation_members where user_id=auth.uid() and organisation_id=org)) returning id into result;
  perform private.record_request(org,'create_supervisor_office_item',p_request_key,p_data,result);
  return result;
end $$;

create function public.acknowledge_supervisor_office_item(p_item uuid,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); item public.supervisor_office_items; result uuid; payload jsonb:=jsonb_build_object('item_id',p_item);
begin
  select * into item from public.supervisor_office_items where id=p_item for share;
  if not found or item.organisation_id is distinct from org or private.current_role()<>'supervisor'
    or not private.can_supervise_contract(item.contract_id) or (item.recipient_id is not null and item.recipient_id<>auth.uid()) then
    raise exception 'This instruction is not available to your current site assignment' using errcode='42501'; end if;
  result:=private.request_result(org,'acknowledge_supervisor_office_item',p_request_key,payload);
  if result is not null then return result; end if;
  if item.kind<>'instruction' or not item.acknowledgement_required then
    raise exception 'This item does not require acknowledgement' using errcode='22023'; end if;
  -- One acknowledgement per recipient even if a second device uses a new key.
  perform pg_advisory_xact_lock(hashtextextended('daily-ack:'||p_item::text||':'||auth.uid()::text,0));
  select id into result from public.supervisor_office_acknowledgements where item_id=p_item and actor_id=auth.uid();
  if result is not null then raise exception 'This instruction is already acknowledged; refresh to see the saved record' using errcode='23514'; end if;
  insert into public.supervisor_office_acknowledgements(organisation_id,contract_id,item_id,actor_id,request_key)
    values(org,item.contract_id,p_item,auth.uid(),p_request_key) returning id into result;
  perform private.record_request(org,'acknowledge_supervisor_office_item',p_request_key,payload,result);
  return result;
end $$;

create function public.submit_supervisor_qa_result(p_item uuid,p_inspection uuid,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); item public.supervisor_office_items; inspection public.location_inspections;
  result uuid; old_result public.supervisor_qa_submissions; actual_stage text; payload jsonb:=jsonb_build_object('item_id',p_item,'inspection_id',p_inspection);
begin
  select * into item from public.supervisor_office_items where id=p_item for share;
  if not found or item.organisation_id is distinct from org or private.current_role()<>'supervisor'
    or not private.can_supervise_contract(item.contract_id) or item.recipient_id is distinct from auth.uid() then
    raise exception 'This inspection request is not assigned to you at your current site' using errcode='42501'; end if;
  result:=private.request_result(org,'submit_supervisor_qa_result',p_request_key,payload);
  if result is not null then return result; end if;
  if item.kind<>'qa_request' then raise exception 'Choose an office inspection request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('daily-qa:'||p_item::text,0));
  select * into old_result from public.supervisor_qa_submissions where item_id=p_item;
  if found then
    raise exception 'This request already has a submitted result; refresh to see the saved record' using errcode='23514';
  end if;
  select * into inspection from public.location_inspections where id=p_inspection for share;
  select stage::text into actual_stage from public.location_inspection_templates where id=inspection.template_id;
  if inspection.id is null or inspection.organisation_id<>org or inspection.contract_id<>item.contract_id
    or inspection.work_area_id<>item.work_area_id or inspection.actor_id<>auth.uid() or inspection.created_at<item.created_at
    or actual_stage is distinct from item.stage::text or inspection.work_package_id is distinct from item.work_package_id then
    raise exception 'Choose your saved inspection made after this request for the exact location, stage and work package' using errcode='22023'; end if;
  -- Submitting an honest issue is a completed inspection task, never permission
  -- to release work. All hold and mandatory-inspection rules remain separate.
  insert into public.supervisor_qa_submissions(organisation_id,contract_id,item_id,inspection_id,submitted_by,request_key,has_issues)
    values(org,item.contract_id,p_item,p_inspection,auth.uid(),p_request_key,inspection.issues_count>0 or exists(
      select 1 from jsonb_array_elements(inspection.answers) answer where answer->>'status'<>'pass'
        and (coalesce((answer->>'mandatory')::boolean,false) or coalesce((answer->>'hold_point')::boolean,false)))) returning id into result;
  perform private.record_request(org,'submit_supervisor_qa_result',p_request_key,payload,result);
  return result;
end $$;

create function public.record_site_handover(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; result uuid; ending timestamptz; day date; finish boolean;
  completed text; problems text; materials text; attention text; message text; ended integer:=0; allocations uuid[];
begin
  perform private.only_keys(p_data,array['contract_id','finished_at','work_completed','outstanding_problems','materials_needed','areas_awaiting_attention','office_notes','finish_workforce']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_supervise_contract(c) then raise exception 'Site supervision permission required for this site' using errcode='42501'; end if;
  result:=private.request_result(org,'record_site_handover',p_request_key,p_data);
  if result is not null then return result; end if;
  ending:=coalesce(private.field_timestamp(p_data,'finished_at'),now()); day:=(ending at time zone 'Europe/London')::date;
  if day<>private.site_today() or ending>now()+interval '5 minutes' then
    raise exception 'Choose a finish time today that is not in the future' using errcode='22023'; end if;
  finish:=private.field_boolean(p_data,'finish_workforce');
  if finish is null then raise exception 'Confirm whether to finish today''s existing workforce records' using errcode='22023'; end if;
  completed:=coalesce(private.field_text(p_data,'work_completed',2000),''); problems:=coalesce(private.field_text(p_data,'outstanding_problems',2000),'');
  materials:=coalesce(private.field_text(p_data,'materials_needed',2000),''); attention:=coalesce(private.field_text(p_data,'areas_awaiting_attention',2000),'');
  message:=coalesce(private.field_text(p_data,'office_notes',2000),'');
  if completed||problems||materials||attention||message='' then raise exception 'Add a short handover for the office' using errcode='22023'; end if;
  if finish then ended:=public.end_open_allocations(c,ending); end if;
  select coalesce(array_agg(id order by started_at,id),'{}') into allocations from public.actual_allocations
    where contract_id=c and organisation_id=org and work_date=day and voided_at is null and started_at<ending;
  insert into public.site_handovers(organisation_id,contract_id,actor_id,actor_name,request_key,work_date,finished_at,work_completed,
    outstanding_problems,materials_needed,areas_awaiting_attention,office_notes,finish_workforce,actual_allocation_ids,ended_count)
  values(org,c,auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),p_request_key,
    day,ending,completed,problems,materials,attention,message,finish,allocations,ended) returning id into result;
  perform private.record_request(org,'record_site_handover',p_request_key,p_data,result);
  return result;
end $$;

revoke all on function public.site_supervisor_recipients(uuid),public.create_supervisor_office_item(uuid,jsonb),
  public.acknowledge_supervisor_office_item(uuid,uuid),public.submit_supervisor_qa_result(uuid,uuid,uuid),public.record_site_handover(uuid,jsonb) from public,anon;
grant execute on function public.site_supervisor_recipients(uuid),public.create_supervisor_office_item(uuid,jsonb),
  public.acknowledge_supervisor_office_item(uuid,uuid),public.submit_supervisor_qa_result(uuid,uuid,uuid),public.record_site_handover(uuid,jsonb) to authenticated;
commit;
