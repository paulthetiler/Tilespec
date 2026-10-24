-- Messages and replies between the office and a site supervisor (M1).
-- A conversation is started by the supervisor, about the job or about one record
-- they can see; the office starts with an instruction instead. Both sides reply.
-- Additive and transactional; nothing existing is changed. Review before hosted use.
begin;
do $$ begin
  if to_regclass('public.supervisor_office_items') is null or to_regclass('public.site_handovers') is null
    or to_regclass('public.work_holds') is null or to_regprocedure('private.can_read_snag(uuid)') is null
    or to_regprocedure('private.can_read_work_hold(uuid)') is null then
    raise exception 'Preflight failed: the daily supervisor workflow (20261015130000) and its prerequisites are required';
  end if;
  if to_regclass('public.job_messages') is not null or to_regclass('public.job_message_reads') is not null
    or to_regprocedure('public.post_job_message(uuid,jsonb)') is not null then
    raise exception 'Preflight failed: job message objects already exist; review schema drift';
  end if;
end $$;

create table public.job_messages (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  -- The first message of a conversation is its own thread.
  thread_id uuid not null, site_user_id uuid not null references auth.users(id),
  author_id uuid not null references auth.users(id), author_name text not null,
  author_side text not null check(author_side in ('office','site')),
  body text not null check(length(trim(body)) between 1 and 2000), needs_answer boolean not null default false,
  about_type text check(about_type in ('job','snag','hold','office_item','qa_result','handover')), about_id uuid,
  request_key uuid not null, created_at timestamptz not null default now(),
  unique(organisation_id,contract_id,id), unique(organisation_id,author_id,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,contract_id,thread_id) references public.job_messages(organisation_id,contract_id,id),
  check((thread_id=id) = (about_type is not null)),
  check(about_type is distinct from 'job' or about_id is null),
  check(about_type is null or about_type='job' or about_id is not null),
  check(thread_id<>id or author_side='site')
);
create table public.job_message_reads (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  message_id uuid not null, reader_id uuid not null references auth.users(id), request_key uuid not null,
  read_at timestamptz not null default now(),
  unique(message_id,reader_id), unique(organisation_id,reader_id,request_key),
  foreign key(organisation_id,contract_id,message_id) references public.job_messages(organisation_id,contract_id,id)
);
create index job_messages_thread on public.job_messages(thread_id,created_at,id);
create index job_messages_site on public.job_messages(contract_id,created_at desc,id);

alter table public.job_messages enable row level security;
alter table public.job_message_reads enable row level security;
-- The office for the job and the one supervisor in the conversation. Other supervisors,
-- installers and other organisations see nothing.
create policy job_message_read on public.job_messages for select to authenticated using(
  organisation_id=private.current_org() and (private.can_manage_contract(contract_id)
    or (site_user_id=auth.uid() and private.current_role()='supervisor' and private.can_supervise_contract(contract_id))));
create policy job_message_receipt_read on public.job_message_reads for select to authenticated using(
  organisation_id=private.current_org() and exists(select 1 from public.job_messages m where m.id=message_id));

do $$ declare t text; begin
  foreach t in array array['job_messages','job_message_reads'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create trigger daily_append_only before update or delete on public.%I for each row execute function private.guard_append_only()',t);
    execute format('create trigger daily_audit after insert on public.%I for each row execute function private.audit_mutation()',t);
  end loop;
end $$;

create function public.post_job_message(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; t uuid; thread public.job_messages; side text; site uuid; result uuid;
  kind text; about uuid; message text; asks boolean;
begin
  perform private.only_keys(p_data,array['contract_id','thread_id','about_type','about_id','body','needs_answer']);
  c:=private.field_uuid(p_data,'contract_id',true);
  t:=private.field_uuid(p_data,'thread_id');
  if t is null then
    -- The office starts with an instruction; a conversation starts on site.
    if private.current_role() is distinct from 'supervisor' or not private.can_supervise_contract(c) then
      raise exception 'Only a supervisor on this site can start a conversation; the office sends an instruction' using errcode='42501'; end if;
    side:='site'; site:=auth.uid();
  else
    select * into thread from public.job_messages where id=t and organisation_id=org and contract_id=c and thread_id=id;
    if not found then raise exception 'This conversation is not available to you' using errcode='42501'; end if;
    if private.can_manage_contract(c) then side:='office';
    elsif thread.site_user_id=auth.uid() and private.current_role()='supervisor' and private.can_supervise_contract(c) then side:='site';
    else raise exception 'This conversation is not available to you' using errcode='42501'; end if;
    site:=thread.site_user_id;
  end if;
  result:=private.request_result(org,'post_job_message',p_request_key,p_data);
  if result is not null then return result; end if;
  message:=private.field_text(p_data,'body',2000,true);
  asks:=coalesce(private.field_boolean(p_data,'needs_answer'),false);
  if t is null then
    kind:=coalesce(nullif(private.field_text(p_data,'about_type',20),''),'job');
    perform private.assert_choice(kind,'about_type',array['job','snag','hold','office_item','qa_result','handover']);
    about:=private.field_uuid(p_data,'about_id');
    if kind='job' then
      if about is not null then raise exception 'A message about the whole job names no record' using errcode='22023'; end if;
    elsif about is null or not (case kind
      when 'snag' then exists(select 1 from public.supervisor_issues where id=about and contract_id=c and organisation_id=org and snag_status is not null)
        and private.can_read_snag(about)
      when 'hold' then exists(select 1 from public.work_holds where id=about and contract_id=c and organisation_id=org) and private.can_read_work_hold(about)
      when 'office_item' then exists(select 1 from public.supervisor_office_items where id=about and contract_id=c and organisation_id=org
        and (recipient_id is null or recipient_id=auth.uid()))
      when 'qa_result' then exists(select 1 from public.supervisor_qa_submissions s join public.supervisor_office_items i on i.id=s.item_id
        where s.id=about and s.contract_id=c and s.organisation_id=org and (i.recipient_id is null or i.recipient_id=auth.uid()))
      when 'handover' then exists(select 1 from public.site_handovers where id=about and contract_id=c and organisation_id=org)
      else false end) then
      raise exception 'Choose a record on this job that you can see' using errcode='22023'; end if;
    result:=gen_random_uuid();
    insert into public.job_messages(id,organisation_id,contract_id,thread_id,site_user_id,author_id,author_name,author_side,body,needs_answer,about_type,about_id,request_key)
      values(result,org,c,result,site,auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),
        side,message,asks,kind,about,p_request_key);
  else
    insert into public.job_messages(organisation_id,contract_id,thread_id,site_user_id,author_id,author_name,author_side,body,needs_answer,request_key)
      values(org,c,t,site,auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),
        side,message,asks,p_request_key) returning id into result;
  end if;
  perform private.record_request(org,'post_job_message',p_request_key,p_data,result);
  return result;
end $$;

-- "Got it": the other side records that they have read a message.
create function public.mark_job_message_read(p_message uuid,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); m public.job_messages; result uuid; payload jsonb:=jsonb_build_object('message_id',p_message);
begin
  select * into m from public.job_messages where id=p_message;
  if not found or m.organisation_id is distinct from org
    or not (case m.author_side when 'site' then private.can_manage_contract(m.contract_id)
      else m.site_user_id=auth.uid() and private.current_role()='supervisor' and private.can_supervise_contract(m.contract_id) end) then
    raise exception 'Only the person this message was for can mark it as read' using errcode='42501'; end if;
  result:=private.request_result(org,'mark_job_message_read',p_request_key,payload);
  if result is not null then return result; end if;
  perform pg_advisory_xact_lock(hashtextextended('job-read:'||p_message::text||':'||auth.uid()::text,0));
  if exists(select 1 from public.job_message_reads where message_id=p_message and reader_id=auth.uid()) then
    raise exception 'Already marked as read; refresh to see the saved record' using errcode='23514'; end if;
  insert into public.job_message_reads(organisation_id,contract_id,message_id,reader_id,request_key)
    values(org,m.contract_id,p_message,auth.uid(),p_request_key) returning id into result;
  perform private.record_request(org,'mark_job_message_read',p_request_key,payload,result);
  return result;
end $$;

revoke all on function public.post_job_message(uuid,jsonb),public.mark_job_message_read(uuid,uuid) from public,anon;
grant execute on function public.post_job_message(uuid,jsonb),public.mark_job_message_read(uuid,uuid) to authenticated;
commit;
