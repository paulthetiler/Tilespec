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
      'supervisor_office_item_withdrawals', 'office_reviews', 'job_messages', 'job_message_reads',
      'dayworks', 'daywork_lines', 'daywork_events', 'daywork_signoffs', 'daywork_client_authorisations', 'daywork_photos',
      'contract_daywork_rates', 'daywork_pricings', 'daywork_pricing_lines', 'daywork_commercial_approvals',
      'labour_cost_rates', 'job_cost_entries', 'site_material_records', 'material_cost_matches',
      'payment_applications', 'payment_application_lines', 'payment_receipts')),
  'Supervisor V2, company and issue-register tables are read-only to signed-in users; every write goes through a checked function');
select test.assert((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
    and p.oid::regprocedure::text not in ('submit_tender_enquiry(jsonb)', 'complete_tender_enquiry(uuid,text)',
      'shared_commercial_document(text)', 'private.can_upload_tender_file(text)',
      -- The subcontractor portal: each refuses without the secret of a live, unrevoked link.
      'portal_session(text)', 'portal_preview_invoice(text,jsonb)', 'portal_prepare_invoice(text,uuid,jsonb)',
      'portal_reserve_file(text,uuid,uuid,text,jsonb)', 'portal_complete_file(text,uuid)', 'portal_invoice(text,uuid)',
      'portal_cancel_invoice(text,uuid,text)', 'portal_answer_query(text,uuid,text)', 'portal_agreement(text)',
      'portal_sign_agreement(text,uuid,jsonb)', 'private.can_upload_portal_file(text)',
      -- The scheduled email dispatcher: each refuses without the owner's dispatcher key.
      'dispatch_queue_summaries(text,date)', 'dispatch_claim(text,integer)', 'dispatch_report(text,uuid,text,text,text)',
      -- Enquiry email alerts: the visitor's one-time token, the owner's retry key, or the random id of a claimed attempt.
      'claim_submitted_enquiry_notification(uuid,text)', 'claim_due_enquiry_notifications(text,integer)',
      'report_enquiry_notification(uuid,text,text,text,text)')),
  'anonymous visitors can call only the enquiry form, shared-link, subcontractor portal, key-guarded email dispatcher and enquiry alert functions, and no other application function');
select test.assert((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
    and p.proname not in ('current_org', 'current_role', 'is_owner', 'can_manage_contract', 'can_access_contract',
      'can_allocate_contract_user', 'can_view_financials', 'can_access_package', 'can_access_area', 'can_upload_document',
      'can_read_document', 'can_upload_path', 'can_read_path', 'can_view_location_hierarchy', 'site_today', 'is_office',
      'is_site_staff', 'my_team_ids', 'is_current_teammate', 'can_supervise_contract', 'installation_stages', 'is_snag_party', 'can_read_snag', 'can_upload_snag_photo', 'can_insert_issue_object', 'can_read_issue_object',
      'can_read_work_hold', 'is_hold_corrector', 'can_upload_hold_photo', 'can_insert_hold_object', 'can_read_hold_object',
      'can_read_daywork', 'can_upload_daywork_photo', 'can_insert_daywork_object', 'can_read_daywork_object', 'has_money_access',
      'is_gang_member', 'can_see_gang_invoice', 'can_read_gang_file', 'can_upload_gang_file',
      'can_insert_site_photo_object', 'can_read_site_photo_object', 'job_stage')),
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
