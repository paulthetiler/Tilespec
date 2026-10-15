-- Read-only review before applying the practical supervisor workflow on staging.
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regclass('public.work_holds') is not null as phase3c_holds_present,
  to_regclass('public.location_inspections') is not null as saved_inspections_present,
  to_regprocedure('public.end_open_allocations(uuid,timestamptz)') is not null as existing_finish_workforce_present;
select name,to_regclass(name) is not null as already_exists from unnest(array[
  'public.supervisor_office_items','public.supervisor_office_acknowledgements',
  'public.supervisor_qa_submissions','public.site_handovers']) name;
select name,to_regprocedure(name) is not null as already_exists from unnest(array[
  'public.site_supervisor_recipients(uuid)','public.create_supervisor_office_item(uuid,jsonb)',
  'public.acknowledge_supervisor_office_item(uuid,uuid)','public.submit_supervisor_qa_result(uuid,uuid,uuid)',
  'public.record_site_handover(uuid,jsonb)']) name;
select conname,pg_get_constraintdef(oid) as morning_answer_constraint
  from pg_constraint where conrelid='public.supervisor_inspections'::regclass and conname='supervisor_inspections_answers_check';
select count(*) as preserved_morning_records from public.supervisor_inspections;
select count(*) as preserved_location_inspections from public.location_inspections;
select count(*) as preserved_snags_and_legacy_issues from public.supervisor_issues;
select count(*) as preserved_actual_workforce_periods from public.actual_allocations;
select count(*) as preserved_work_holds from public.work_holds;
select count(*) as preserved_hold_decisions from public.work_hold_events;
rollback;
