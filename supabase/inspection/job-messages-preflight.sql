-- Read-only review before applying job messages (M1) on staging.
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regclass('public.supervisor_office_items') is not null as daily_messages_present,
  to_regclass('public.site_handovers') is not null as daily_handovers_present,
  to_regclass('public.work_holds') is not null as work_holds_present,
  to_regprocedure('private.can_read_snag(uuid)') is not null as snag_visibility_present,
  to_regprocedure('private.can_read_work_hold(uuid)') is not null as hold_visibility_present;
select name,to_regclass(name) is not null as already_exists from unnest(array['public.job_messages','public.job_message_reads']) name;
select name,to_regprocedure(name) is not null as already_exists from unnest(array[
  'public.post_job_message(uuid,jsonb)','public.mark_job_message_read(uuid,uuid)']) name;
select count(*) as preserved_office_messages from public.supervisor_office_items;
select count(*) as preserved_handovers from public.site_handovers;
select count(*) as preserved_snags_and_legacy_issues from public.supervisor_issues;
select count(*) as preserved_work_holds from public.work_holds;
rollback;
