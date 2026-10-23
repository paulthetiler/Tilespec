-- After every migration, with Supabase's default grants mirrored by platform.sql:
-- no application table or function is open to anon, and no table can be
-- truncated by signed-in users (TRUNCATE is not governed by row-level security).
begin;
select test.assert((select count(*) = 0 from information_schema.role_table_grants
  where grantee = 'anon' and table_schema in ('public', 'private')),
  'anonymous visitors hold no privilege on any application table');
select test.assert((select count(*) = 0 from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema in ('public', 'private') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')),
  'signed-in users cannot truncate, add triggers to or reference any application table');
select test.assert((select count(*) = 0 from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public' and privilege_type <> 'SELECT'
    and table_name in ('operatives', 'teams', 'team_memberships', 'planned_allocations', 'planned_allocation_operatives',
      'actual_allocations', 'actual_allocation_operatives', 'allocation_absences', 'supervisor_issues', 'supervisor_issue_events',
      'subcontractor_companies', 'company_insurances', 'company_accreditations', 'location_inspection_requirements',
      'work_holds', 'work_hold_events', 'hold_photos', 'hold_notifications', 'hold_notification_reads',
      'supervisor_office_items', 'supervisor_office_acknowledgements', 'supervisor_qa_submissions', 'site_handovers',
      'supervisor_office_item_withdrawals', 'office_reviews')),
  'Supervisor V2, company and issue-register tables are read-only to signed-in users; every write goes through a checked function');
select test.assert((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')),
  'anonymous visitors cannot execute any application function');
select test.assert((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
    and p.proname not in ('current_org', 'current_role', 'is_owner', 'can_manage_contract', 'can_access_contract',
      'can_allocate_contract_user', 'can_view_financials', 'can_access_package', 'can_access_area', 'can_upload_document',
      'can_read_document', 'can_upload_path', 'can_read_path', 'can_view_location_hierarchy', 'site_today', 'is_office',
      'is_site_staff', 'my_team_ids', 'is_current_teammate', 'can_supervise_contract', 'installation_stages', 'is_snag_party', 'can_read_snag', 'can_upload_snag_photo', 'can_insert_issue_object', 'can_read_issue_object',
      'can_read_work_hold', 'is_hold_corrector', 'can_upload_hold_photo', 'can_insert_hold_object', 'can_read_hold_object')),
  'signed-in users can execute only the read-only permission helpers that row-level security policies call');
select test.assert((select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'row-level security is enabled on every public table');
select test.assert((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'every security-definer function pins its search_path');
select test.assert(true, 'Supabase default-grant exposure PASSED');
rollback;
