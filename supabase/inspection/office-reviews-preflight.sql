-- Read-only review before applying office reviews and instruction changes on staging.
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regclass('public.supervisor_office_items') is not null as daily_messages_present,
  to_regclass('public.site_handovers') is not null as daily_handovers_present,
  to_regprocedure('public.create_supervisor_office_item(uuid,jsonb)') is not null as existing_send_function_present,
  to_regprocedure('public.acknowledge_supervisor_office_item(uuid,uuid)') is not null as existing_acknowledge_function_present,
  to_regprocedure('public.submit_supervisor_qa_result(uuid,uuid,uuid)') is not null as existing_result_function_present;
select name,to_regclass(name) is not null as already_exists from unnest(array[
  'public.office_reviews','public.supervisor_office_item_withdrawals']) name;
select name,exists(select 1 from information_schema.columns where table_schema='public' and table_name='supervisor_office_items' and column_name=name) as already_exists
  from unnest(array['replaces_id','urgent']) name;
select name,to_regprocedure(name) is not null as already_exists from unnest(array[
  'public.withdraw_supervisor_office_item(uuid,uuid,text)','public.record_office_review(uuid,jsonb)',
  'private.daily_acknowledge_supervisor_office_item(uuid,uuid)','private.daily_submit_supervisor_qa_result(uuid,uuid,uuid)']) name;
select count(*) as preserved_office_messages from public.supervisor_office_items;
select count(*) as preserved_acknowledgements from public.supervisor_office_acknowledgements;
select count(*) as preserved_inspection_results from public.supervisor_qa_submissions;
select count(*) as preserved_handovers from public.site_handovers;
rollback;
