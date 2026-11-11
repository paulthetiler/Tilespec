-- Rollback for 20261114090000_office_command_centre. Removes only what that migration added and
-- restores the earlier message function. Every record created in the command centre's own tables
-- (customers, quotations, materials, progress, photographs, decisions, notifications) is deleted with
-- them, so take a backup first and use this only to undo a failed rollout. Existing job, message,
-- tender and site records are kept. Refuses to run if a tender has been moved to won or lost.
begin;
do $preflight$ begin
  if to_regclass('public.notification_outbox') is null then raise exception 'Rollback preflight: the office command centre is not installed'; end if;
  if exists(select 1 from public.tender_enquiries where status in ('won','lost')) then
    raise exception 'Rollback preflight: tenders recorded as won or lost would no longer be valid; set them back to submitted first';
  end if;
end $preflight$;
drop trigger if exists notify_safety_stop on public.work_holds;
drop trigger if exists notify_critical_snag on public.supervisor_issues;
drop trigger if exists notify_urgent_message on public.job_messages;
drop policy if exists site_photo_insert on storage.objects;
drop policy if exists site_photo_read on storage.objects;
drop function if exists public.dispatch_queue_summaries(text,date), public.dispatch_claim(text,integer), public.dispatch_report(text,uuid,text,text,text),
  public.retry_notification(uuid), public.rotate_notification_dispatcher_key(), public.set_notification_delivery(boolean,boolean,boolean),
  public.confirm_notification_recipient(uuid), public.queue_test_notification(uuid), public.update_notification_recipient(uuid,boolean,boolean,boolean),
  public.add_notification_recipient(uuid,boolean,boolean), public.preview_morning_summary(date), public.cash_flow_lines(integer), public.debtor_ledger(),
  public.office_search(text,integer), public.confirm_site_photo(uuid,text), public.reserve_site_photo(uuid,uuid,jsonb), public.void_site_progress(uuid,text),
  public.record_site_progress(uuid,jsonb), public.update_material_request(uuid,integer,jsonb), public.request_material(uuid,jsonb), public.set_tender_status(uuid,text,text),
  public.set_quote_status(uuid,uuid,integer,jsonb), public.save_quote(uuid,jsonb), public.set_contract_stage(uuid,uuid,text,text), public.set_contract_customer(uuid,uuid),
  public.save_customer(uuid,jsonb), public.record_thread_outcome(uuid,jsonb);
drop table if exists public.notification_attempts, public.notification_outbox, public.notification_recipients, public.notification_settings,
  public.job_thread_outcomes, public.site_photos, public.site_progress_entries, public.material_request_events, public.material_requests,
  public.quote_events, public.quotes, public.tender_status_events, public.contract_stage_events;
drop function if exists private.dispatch_org(text), private.morning_summary(uuid,uuid,date), private.notify_urgent_message(), private.notify_critical_snag(),
  private.notify_safety_stop(), private.job_label(uuid), private.queue_urgent(uuid,uuid,text,uuid,text,jsonb), private.move_tender(uuid,text,text),
  private.guard_site_photo(), private.guard_progress_entry(), private.can_read_site_photo_object(text), private.can_insert_site_photo_object(text),
  private.meaningful_text(text), private.optional_decimal(jsonb,text,numeric,numeric), private.member_has_money(uuid), private.member_sees_contract(uuid,uuid);
alter table public.contracts drop constraint if exists contracts_customer_fk, drop column if exists customer_id, drop column if exists lifecycle_stage;
drop function if exists private.job_stage(text,date,date);
drop table if exists public.customers;
alter table public.job_messages drop constraint if exists job_messages_category_root, drop column if exists category, drop column if exists urgent;
alter table public.tender_enquiries drop constraint if exists tender_enquiries_status_check;
alter table public.tender_enquiries add constraint tender_enquiries_status_check check(status in ('uploading','received','reviewing','pricing','declined','submitted'));
-- The message function as it was before the command centre (job messages with dayworks).
create or replace function public.post_job_message(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $fn$
declare org uuid:=private.current_org(); c uuid; t uuid; thread public.job_messages; side text; site uuid; result uuid;
  kind text; about uuid; message text; asks boolean;
begin
  perform private.only_keys(p_data,array['contract_id','thread_id','about_type','about_id','body','needs_answer']);
  c:=private.field_uuid(p_data,'contract_id',true);
  t:=private.field_uuid(p_data,'thread_id');
  if t is null then
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
    perform private.assert_choice(kind,'about_type',array['job','snag','hold','office_item','qa_result','handover','daywork']);
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
      when 'daywork' then exists(select 1 from public.dayworks where id=about and contract_id=c and organisation_id=org) and private.can_read_daywork(about)
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
end $fn$;
commit;
