-- Read-only Phase 3C deployment report. Does not create tables, migrate data,
-- alter permissions or contact hosted services. Review on staging first.
begin read only;
select current_user as applying_role,
 has_table_privilege(current_user,'storage.objects','SELECT') as storage_select,
 exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) or
 exists(select 1 from pg_class where oid='storage.objects'::regclass
  and pg_has_role(current_user,relowner,'USAGE') and not relforcerowsecurity) as can_read_storage_beyond_rls;

select to_regprocedure('public.snag_context(uuid)') is not null as phase3b_context_present,
 to_regprocedure('public.transition_snag(uuid,uuid,integer,text,jsonb)') is not null as phase3b_transition_present,
 to_regclass('public.location_inspection_templates') is not null as phase3a_templates_present,
 to_regclass('public.location_inspections') is not null as phase3a_records_present;

select id,public as bucket_is_public,file_size_limit,allowed_mime_types,
 not public and file_size_limit>=4194304 and allowed_mime_types @> array['image/jpeg','image/png'] as safe_hold_photo_bucket
from storage.buckets where id='supervisor-evidence';

select name,to_regclass(name) is not null as already_exists
from unnest(array['public.location_inspection_requirements','public.work_holds','public.work_hold_events',
 'public.hold_photos','public.hold_notifications','public.hold_notification_reads']) name;

select table_schema,table_name,column_name
from information_schema.columns
where table_schema='public' and table_name='location_inspections' and column_name='work_package_id';

select count(*) as preserved_location_templates from public.location_inspection_templates;
select count(*) as preserved_location_inspections from public.location_inspections;
select count(*) as preserved_issues_and_snags from public.supervisor_issues;
select count(*) as preserved_issue_photos from public.supervisor_issue_photos;
select count(*) as preserved_actual_allocations from public.actual_allocations;
select count(*) as verified_operational_document_revisions from public.document_revisions
where classification='operational' and uploaded_at is not null;
rollback;
