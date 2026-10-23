-- Office reviews of inspection results and handovers (M3), and office
-- instructions that can be changed, marked urgent or withdrawn (M2).
-- Additive and transactional. No existing row is rewritten: a change is a new
-- instruction that names the one it replaces, and a withdrawal is a new record.
-- Review before hosted use.
begin;
do $$ begin
  if to_regclass('public.supervisor_office_items') is null or to_regclass('public.site_handovers') is null
    or to_regprocedure('public.create_supervisor_office_item(uuid,jsonb)') is null
    or to_regprocedure('public.acknowledge_supervisor_office_item(uuid,uuid)') is null
    or to_regprocedure('public.submit_supervisor_qa_result(uuid,uuid,uuid)') is null then
    raise exception 'Preflight failed: the daily supervisor workflow (20261015130000) is required';
  end if;
  if to_regclass('public.office_reviews') is not null or to_regclass('public.supervisor_office_item_withdrawals') is not null
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='supervisor_office_items'
      and column_name in ('replaces_id','urgent'))
    or to_regprocedure('private.daily_acknowledge_supervisor_office_item(uuid,uuid)') is not null
    or to_regprocedure('private.daily_submit_supervisor_qa_result(uuid,uuid,uuid)') is not null then
    raise exception 'Preflight failed: office review or instruction change objects already exist; review schema drift';
  end if;
end $$;

-- M2. Existing instructions keep every value; they read as not urgent and replacing nothing.
alter table public.supervisor_office_items add column replaces_id uuid, add column urgent boolean not null default false;
alter table public.supervisor_office_items
  add constraint supervisor_office_items_replaces_fkey foreign key(organisation_id,contract_id,replaces_id)
    references public.supervisor_office_items(organisation_id,contract_id,id),
  add constraint supervisor_office_items_replaced_once unique(replaces_id),
  add constraint supervisor_office_items_change_check check(replaces_id is null or (kind='instruction' and replaces_id<>id)),
  add constraint supervisor_office_items_urgent_check check(not urgent or kind='instruction');

create table public.supervisor_office_item_withdrawals (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  item_id uuid not null unique, reason text not null check(length(trim(reason)) between 1 and 500),
  withdrawn_by uuid not null references auth.users(id), withdrawn_by_name text not null, request_key uuid not null,
  withdrawn_at timestamptz not null default now(),
  unique(organisation_id,withdrawn_by,request_key),
  foreign key(organisation_id,contract_id,item_id) references public.supervisor_office_items(organisation_id,contract_id,id)
);

-- M3. One review per inspection result or handover. The follow-up, when given, is
-- the snag, stop or instruction the office raised; it is checked, never created here.
create table public.office_reviews (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  qa_submission_id uuid unique references public.supervisor_qa_submissions(id),
  handover_id uuid unique references public.site_handovers(id),
  outcome text not null check(outcome in ('noted','snag_raised','stop_raised','instruction_sent')),
  note text not null default '' check(length(note)<=1000), follow_up_id uuid,
  reviewed_by uuid not null references auth.users(id), reviewed_by_name text not null, request_key uuid not null,
  reviewed_at timestamptz not null default now(),
  unique(organisation_id,reviewed_by,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  check(num_nonnulls(qa_submission_id,handover_id)=1),
  check(outcome<>'noted' or follow_up_id is null)
);
create index office_reviews_site on public.office_reviews(contract_id,reviewed_at desc,id);
create index supervisor_office_withdrawals_site on public.supervisor_office_item_withdrawals(contract_id,withdrawn_at desc,id);

alter table public.supervisor_office_item_withdrawals enable row level security;
alter table public.office_reviews enable row level security;
-- Whoever can read the message, result or handover can read what happened to it.
create policy daily_withdrawal_read on public.supervisor_office_item_withdrawals for select to authenticated using(
  organisation_id=private.current_org() and exists(select 1 from public.supervisor_office_items i where i.id=item_id));
create policy office_review_read on public.office_reviews for select to authenticated using(
  organisation_id=private.current_org() and (private.can_manage_contract(contract_id)
    or (qa_submission_id is not null and exists(select 1 from public.supervisor_qa_submissions s where s.id=qa_submission_id))
    or (handover_id is not null and exists(select 1 from public.site_handovers h where h.id=handover_id))));

do $$ declare t text; begin
  foreach t in array array['supervisor_office_item_withdrawals','office_reviews'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create trigger daily_append_only before update or delete on public.%I for each row execute function private.guard_append_only()',t);
    execute format('create trigger daily_audit after insert on public.%I for each row execute function private.audit_mutation()',t);
  end loop;
end $$;

-- The original checks are unchanged; replaces_id and urgent are new optional fields.
create or replace function public.create_supervisor_office_item(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; result uuid; target uuid; recipient text; k text; a uuid; s text; p uuid;
  path text[]:='{}'; requires_ack boolean; headline text; message text; due date; previous uuid; original public.supervisor_office_items; is_urgent boolean;
begin
  perform private.only_keys(p_data,array['contract_id','kind','title','body','recipient_id','acknowledgement_required','work_area_id','stage','work_package_id','due_on','replaces_id','urgent']);
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
  previous:=private.field_uuid(p_data,'replaces_id'); is_urgent:=coalesce(private.field_boolean(p_data,'urgent'),false);
  if is_urgent and k<>'instruction' then raise exception 'Only an instruction can be marked urgent' using errcode='22023'; end if;
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
  if previous is not null then
    if k<>'instruction' then
      raise exception 'Only an instruction can be changed. Withdraw an inspection request and send a new one' using errcode='22023'; end if;
    -- Changes, withdrawals and acknowledgements of one instruction take turns.
    perform pg_advisory_xact_lock(hashtextextended('office-item:'||previous::text,0));
    select * into original from public.supervisor_office_items where id=previous and organisation_id=org and contract_id=c;
    if not found or original.kind<>'instruction' then raise exception 'Choose an instruction on this site to change' using errcode='22023'; end if;
    if target is distinct from original.recipient_id then
      raise exception 'A changed instruction goes to the same person as the original' using errcode='22023'; end if;
    if exists(select 1 from public.supervisor_office_items where replaces_id=previous) then
      raise exception 'This instruction has already been changed. Refresh and change the latest version' using errcode='23514'; end if;
    if exists(select 1 from public.supervisor_office_item_withdrawals where item_id=previous) then
      raise exception 'This instruction was withdrawn. Send a new instruction instead' using errcode='23514'; end if;
  end if;
  insert into public.supervisor_office_items(organisation_id,contract_id,request_key,kind,title,body,recipient_id,recipient_name,
    acknowledgement_required,work_area_id,location_path,stage,work_package_id,due_on,created_by,created_by_name,replaces_id,urgent)
  values(org,c,p_request_key,k,headline,message,target,recipient,requires_ack,a,path,s::public.installation_stage,p,due,auth.uid(),
    (select display_name from public.organisation_members where user_id=auth.uid() and organisation_id=org),previous,is_urgent) returning id into result;
  perform private.record_request(org,'create_supervisor_office_item',p_request_key,p_data,result);
  return result;
end $$;

create function public.withdraw_supervisor_office_item(p_item uuid,p_request_key uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); item public.supervisor_office_items; result uuid; why text;
  payload jsonb:=jsonb_build_object('item_id',p_item,'reason',p_reason);
begin
  select * into item from public.supervisor_office_items where id=p_item;
  if not found or item.organisation_id is distinct from org or not private.can_manage_contract(item.contract_id) then
    raise exception 'Office permission required for this site' using errcode='42501'; end if;
  result:=private.request_result(org,'withdraw_supervisor_office_item',p_request_key,payload);
  if result is not null then return result; end if;
  why:=trim(coalesce(p_reason,''));
  if length(why) not between 1 and 500 then raise exception 'Give a short reason for withdrawing it' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('office-item:'||p_item::text,0));
  if exists(select 1 from public.supervisor_office_item_withdrawals where item_id=p_item) then
    raise exception 'This has already been withdrawn; refresh to see the saved record' using errcode='23514'; end if;
  if exists(select 1 from public.supervisor_office_items where replaces_id=p_item) then
    raise exception 'This instruction was changed. Withdraw the latest version instead' using errcode='23514'; end if;
  if item.kind='qa_request' and exists(select 1 from public.supervisor_qa_submissions where item_id=p_item) then
    raise exception 'The supervisor has already sent the result for this request' using errcode='23514'; end if;
  insert into public.supervisor_office_item_withdrawals(organisation_id,contract_id,item_id,reason,withdrawn_by,withdrawn_by_name,request_key)
    values(org,item.contract_id,p_item,why,auth.uid(),
      (select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),p_request_key) returning id into result;
  perform private.record_request(org,'withdraw_supervisor_office_item',p_request_key,payload,result);
  return result;
end $$;

-- The original acknowledgement and result functions keep every check. These wrappers
-- only refuse a NEW acknowledgement of a changed or withdrawn instruction, and a NEW
-- result for a withdrawn request. A saved receipt can still be retried safely.
alter function public.acknowledge_supervisor_office_item(uuid,uuid) set schema private;
alter function private.acknowledge_supervisor_office_item(uuid,uuid) rename to daily_acknowledge_supervisor_office_item;
alter function public.submit_supervisor_qa_result(uuid,uuid,uuid) set schema private;
alter function private.submit_supervisor_qa_result(uuid,uuid,uuid) rename to daily_submit_supervisor_qa_result;
revoke all on function private.daily_acknowledge_supervisor_office_item(uuid,uuid),
  private.daily_submit_supervisor_qa_result(uuid,uuid,uuid) from public,anon,authenticated;

create function public.acknowledge_supervisor_office_item(p_item uuid,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare item public.supervisor_office_items;
begin
  select * into item from public.supervisor_office_items where id=p_item;
  if not found or item.organisation_id is distinct from private.current_org() or private.current_role()<>'supervisor'
    or not private.can_supervise_contract(item.contract_id) or (item.recipient_id is not null and item.recipient_id<>auth.uid()) then
    raise exception 'This instruction is not available to your current site assignment' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('office-item:'||p_item::text,0));
  if not exists(select 1 from public.supervisor_office_acknowledgements where item_id=p_item and actor_id=auth.uid()) then
    if exists(select 1 from public.supervisor_office_items where replaces_id=p_item) then
      raise exception 'The office changed this instruction. Read and acknowledge the latest version' using errcode='23514'; end if;
    if exists(select 1 from public.supervisor_office_item_withdrawals where item_id=p_item) then
      raise exception 'The office withdrew this instruction. Nothing needs acknowledging' using errcode='23514'; end if;
  end if;
  return private.daily_acknowledge_supervisor_office_item(p_item,p_request_key);
end $$;

create function public.submit_supervisor_qa_result(p_item uuid,p_inspection uuid,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare item public.supervisor_office_items;
begin
  select * into item from public.supervisor_office_items where id=p_item;
  if not found or item.organisation_id is distinct from private.current_org() or private.current_role()<>'supervisor'
    or not private.can_supervise_contract(item.contract_id) or item.recipient_id is distinct from auth.uid() then
    raise exception 'This inspection request is not assigned to you at your current site' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('office-item:'||p_item::text,0));
  if not exists(select 1 from public.supervisor_qa_submissions where item_id=p_item)
    and exists(select 1 from public.supervisor_office_item_withdrawals where item_id=p_item) then
    raise exception 'The office withdrew this inspection request. Your saved inspection is kept' using errcode='23514'; end if;
  return private.daily_submit_supervisor_qa_result(p_item,p_inspection,p_request_key);
end $$;

create function public.record_office_review(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); subject_kind text; subject uuid; c uuid; result uuid; review_outcome text; review_note text; follow uuid;
begin
  perform private.only_keys(p_data,array['subject','subject_id','outcome','note','follow_up_id']);
  subject_kind:=private.field_text(p_data,'subject',20,true);
  perform private.assert_choice(subject_kind,'subject',array['qa_result','handover']);
  subject:=private.field_uuid(p_data,'subject_id',true);
  if subject_kind='qa_result' then
    select contract_id into c from public.supervisor_qa_submissions where id=subject and organisation_id=org;
  else
    select contract_id into c from public.site_handovers where id=subject and organisation_id=org;
  end if;
  if c is null or not private.can_manage_contract(c) then raise exception 'Office permission required for this site' using errcode='42501'; end if;
  result:=private.request_result(org,'record_office_review',p_request_key,p_data);
  if result is not null then return result; end if;
  review_outcome:=private.field_text(p_data,'outcome',20,true);
  perform private.assert_choice(review_outcome,'outcome',array['noted','snag_raised','stop_raised','instruction_sent']);
  review_note:=coalesce(private.field_text(p_data,'note',1000),'');
  follow:=private.field_uuid(p_data,'follow_up_id');
  if follow is not null and (review_outcome='noted'
    or (review_outcome='snag_raised' and not exists(select 1 from public.supervisor_issues where id=follow and organisation_id=org and contract_id=c and snag_status is not null))
    or (review_outcome='stop_raised' and not exists(select 1 from public.work_holds where id=follow and organisation_id=org and contract_id=c))
    or (review_outcome='instruction_sent' and not exists(select 1 from public.supervisor_office_items where id=follow and organisation_id=org and contract_id=c and kind='instruction'))) then
    raise exception 'Choose the snag, stop or instruction on this job that you raised' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('office-review:'||subject::text,0));
  if exists(select 1 from public.office_reviews where qa_submission_id=subject or handover_id=subject) then
    raise exception 'This has already been reviewed; refresh to see the saved review' using errcode='23514'; end if;
  insert into public.office_reviews(organisation_id,contract_id,qa_submission_id,handover_id,outcome,note,follow_up_id,reviewed_by,reviewed_by_name,request_key)
    values(org,c,case when subject_kind='qa_result' then subject end,case when subject_kind='handover' then subject end,review_outcome,review_note,follow,
      auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),p_request_key) returning id into result;
  perform private.record_request(org,'record_office_review',p_request_key,p_data,result);
  return result;
end $$;

revoke all on function public.withdraw_supervisor_office_item(uuid,uuid,text),public.acknowledge_supervisor_office_item(uuid,uuid),
  public.submit_supervisor_qa_result(uuid,uuid,uuid),public.record_office_review(uuid,jsonb) from public,anon;
grant execute on function public.withdraw_supervisor_office_item(uuid,uuid,text),public.acknowledge_supervisor_office_item(uuid,uuid),
  public.submit_supervisor_qa_result(uuid,uuid,uuid),public.record_office_review(uuid,jsonb) to authenticated;
commit;
