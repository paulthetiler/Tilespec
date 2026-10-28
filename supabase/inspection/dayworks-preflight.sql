-- Read-only review before applying dayworks and day rates (M4) on staging.
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regclass('public.supervisor_office_items') is not null as daily_messages_present,
  to_regclass('public.document_revisions') is not null as job_documents_present,
  to_regprocedure('private.can_view_financials(uuid)') is not null as money_access_present,
  to_regclass('public.job_messages') is not null as job_messages_installed,
  exists(select 1 from storage.buckets where id='supervisor-evidence' and not public) as private_evidence_bucket_present,
  has_table_privilege(current_user,'storage.objects','SELECT') as applying_role_reads_storage;
select name,to_regclass(name) is not null as already_exists from unnest(array['public.dayworks','public.daywork_lines','public.daywork_events',
  'public.daywork_signoffs','public.daywork_client_authorisations','public.daywork_photos','public.contract_daywork_rates','public.daywork_pricings',
  'public.daywork_pricing_lines','public.daywork_commercial_approvals']) name;
select name,to_regprocedure(name) is not null as already_exists from unnest(array[
  'public.create_daywork(uuid,jsonb)','public.price_daywork(uuid,uuid,integer,jsonb)','public.approve_daywork_charge(uuid,uuid,integer,jsonb)',
  'private.can_read_daywork(uuid)']) name;
select count(*) as preserved_contract_commercials from public.contract_commercials;
select count(*) as preserved_documents from public.document_revisions;
select count(*) as preserved_office_messages from public.supervisor_office_items;
select count(*) as preserved_handovers from public.site_handovers;
rollback;
