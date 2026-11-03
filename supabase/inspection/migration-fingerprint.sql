-- Read-only: which repository migrations are present in this database, judged by the
-- objects each one creates, alongside what the migration history table records.
-- Changes no data, permissions, history or hosted settings. Run before reconciling
-- history and before applying any outstanding migration.
begin read only;
select file, present from (values
  ('20261010090000_operations_foundation', to_regclass('public.contract_commercials') is not null),
  ('20261012030000_supervisor_inspections', to_regclass('public.supervisor_inspections') is not null),
  ('20261012040000_supervisor_issues_evidence', to_regclass('public.supervisor_issue_photos') is not null),
  ('20261013210000_tender_enquiries', to_regclass('public.tender_enquiries') is not null),
  ('20261014090000_supervisor_records_hardening', to_regprocedure('private.guard_supervisor_inspection()') is not null),
  ('20261014091000_site_locations', to_regprocedure('public.create_locations(uuid,uuid,uuid,jsonb)') is not null),
  ('20261014092000_teams_operatives', to_regclass('public.operatives') is not null),
  ('20261014093000_site_allocations', to_regclass('public.actual_allocations') is not null),
  ('20261014100000_subcontractor_companies', to_regclass('public.subcontractor_companies') is not null),
  ('20261014120000_supervisor_daily_workforce', exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='actual_allocations' and column_name='lead_operative_id')),
  ('20261014140000_location_inspections', to_regclass('public.location_inspections') is not null),
  ('20261014160000_snag_lifecycle', to_regprocedure('public.transition_snag(uuid,uuid,integer,text,jsonb)') is not null),
  ('20261015090000_mandatory_inspections', to_regclass('public.location_inspection_requirements') is not null),
  ('20261015091000_work_holds', to_regclass('public.work_holds') is not null),
  ('20261015130000_supervisor_daily_workflow', to_regclass('public.site_handovers') is not null),
  ('20261015131000_hollow_workmanship', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='record_location_inspection' and p.prosrc like '%hollow_found%')),
  ('20261023090000_office_reviews_instruction_changes', to_regclass('public.office_reviews') is not null),
  ('20261024090000_job_messages', to_regclass('public.job_messages') is not null),
  ('20261028090000_dayworks', to_regclass('public.dayworks') is not null),
  ('20261104090000_supervisor_commercial_boundary', to_regprocedure('public.daywork_site_statuses(uuid)') is not null),
  ('20261104100000_variations', exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='dayworks' and column_name='kind')),
  ('20261104110000_job_costs', to_regclass('public.job_cost_entries') is not null),
  ('20261104120000_payment_applications', to_regclass('public.payment_applications') is not null),
  ('20261104130000_financial_position', to_regprocedure('public.contract_financial_position(uuid)') is not null)
) m(file, present) order by file;
rollback;
-- On the hosted project, compare with the recorded history (read-only):
--   select version, name from supabase_migrations.schema_migrations order by version;
