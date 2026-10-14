-- Read-only Phase 3B preflight. Run as the intended migration role before
-- 20261014160000_snag_lifecycle.sql; investigate MISSING/ALREADY EXISTS/UNSAFE.
-- No evidence, inspections, allocations or issue history is changed.
with prerequisites(kind,name) as (values
 ('table','public.supervisor_issues'),('table','public.supervisor_issue_events'),('table','public.supervisor_issue_photos'),
 ('table','public.location_inspections'),('table','public.location_inspection_templates'),('table','public.work_areas'),
 ('table','public.work_packages'),('table','public.package_assignments'),('table','public.organisation_members'),
 ('table','public.teams'),('table','public.operatives'),('table','public.actual_allocations'),('table','public.actual_allocation_operatives'),
 ('table','storage.objects'),('table','storage.buckets'),
 ('function','private.current_org()'),('function','private.current_role()'),('function','private.my_team_ids()'),
 ('function','private.can_supervise_contract(uuid)'),('function','private.can_manage_contract(uuid)'),('function','private.site_today()'),
 ('function','private.guard_append_only()'),('function','private.guard_issue_photo()'),('function','private.enforce_issue_closure()'),
 ('function','private.audit_mutation()'),('function','private.only_keys(jsonb,text[])'),('function','private.field_uuid(jsonb,text,boolean)'),
 ('function','private.field_text(jsonb,text,integer,boolean)'),('function','private.field_date(jsonb,text,boolean)'),
 ('function','private.field_uuids(jsonb,text,integer)'),('function','private.assert_choice(text,text,text[])'),('function','private.installation_stages()'),
 ('function','private.request_result(uuid,text,uuid,jsonb)'),('function','private.record_request(uuid,text,uuid,jsonb,uuid)'),
 ('function','public.transition_supervisor_issue(uuid,text,text)')
), extension_columns(relation,name) as (
 select 'public.supervisor_issues',unnest(array['work_area_id','work_package_id','location_inspection_id','stage','category','severity',
  'required_rectification','inspector_id','inspector_name','location_path','snag_status','version','responsibility_state',
  'responsibility_team_id','responsibility_allocation_id','assigned_team_id','assigned_operative_id','assigned_by','assigned_at',
  'assigned_action','target_date','repair_cycle','repair_event_id','escalated','escalation_reason'])
 union all select 'public.supervisor_issue_events',unnest(array['contract_id','previous_status','new_status','actor_name','snapshot'])
 union all select 'public.supervisor_issue_photos',unnest(array['contract_id','purpose','repair_cycle','event_id','sha256','bytes','mime_type','uploaded_at'])
), new_functions(name) as (values
 ('private.is_snag_party(uuid,boolean)'),('private.can_read_snag(uuid)'),('private.can_upload_snag_photo(uuid,text)'),
 ('private.can_insert_issue_object(text)'),('private.can_read_issue_object(text)'),
 ('private.record_snag_event(public.supervisor_issues,text,text,text,jsonb)'),
 ('private.attach_snag_photos(public.supervisor_issues,uuid[],text,bigint)'),('private.guard_snag_findings()'),
 ('private.transition_legacy_issue(uuid,text,text)'),('public.create_snag(uuid,jsonb)'),
 ('public.transition_snag(uuid,uuid,integer,text,jsonb)'),('public.reserve_snag_photo(uuid,uuid,text,jsonb)'),
 ('public.complete_snag_photo(uuid,uuid,text)'),('public.snag_register(jsonb,integer)'),('public.snag_events(uuid)'),('public.snag_context(uuid)')
), new_indexes(name) as (values
 ('public.snag_site_status'),('public.snag_location'),('public.snag_search'),('public.snag_photo_event')
), new_triggers(relation,name) as (values
 ('public.supervisor_issues','original_snag_findings'),('public.supervisor_issues','audit_snag'),
 ('public.supervisor_issue_events','permanent_issue_events'),('public.supervisor_issue_events','audit_snag_event'),
 ('public.supervisor_issue_photos','permanent_issue_photos'),('public.supervisor_issue_photos','audit_snag_photo')
), new_constraints(relation,name) as (values
 ('public.supervisor_issues','snag_area'),('public.supervisor_issues','snag_package'),('public.supervisor_issues','snag_inspection'),
 ('public.supervisor_issues','snag_responsible_team'),('public.supervisor_issues','snag_allocation'),('public.supervisor_issues','snag_repair_team'),
 ('public.supervisor_issues','snag_repair_person'),('public.supervisor_issues','snag_fields'),('public.supervisor_issues','snag_repair_event'),
 ('public.supervisor_issue_photos','verified_photo_fields')
), expected_policies(relation,name) as (values
 ('public.supervisor_issues','supervisor_issues_read'),('public.supervisor_issue_events','issue_events_read'),
 ('public.supervisor_issue_photos','supervisor_photos_read'),('public.supervisor_issue_photos','supervisor_photos_insert'),
 ('storage.objects','supervisor_evidence_read'),('storage.objects','supervisor_evidence_insert')
), preserved(name) as (values
 ('public.supervisor_inspections'),('public.supervisor_issues'),('public.supervisor_issue_events'),('public.supervisor_issue_photos'),
 ('public.location_inspection_templates'),('public.location_inspections'),('public.location_inspection_allocations'),
 ('public.work_areas'),('public.work_packages'),('public.teams'),('public.operatives'),('public.team_memberships'),
 ('public.planned_allocations'),('public.actual_allocations'),('public.actual_allocation_operatives'),('public.allocation_absences'),
 ('public.audit_events'),('private.idempotency_keys'),('storage.objects')
), report as (
 select 'prerequisite' as section,name as item,
  case when (kind='table' and to_regclass(name) is not null) or (kind='function' and to_regprocedure(name) is not null)
   then 'present' else 'MISSING - stop and review' end as status,null::text as detail from prerequisites
 union all
 select 'prerequisite policy',relation||'.'||name,
  case when exists(select 1 from pg_policy p where p.polrelid=to_regclass(relation) and p.polname=name)
   then 'present' else 'MISSING - stop and review' end,null from expected_policies
 union all
 select 'name collision',relation||'.'||name,
  case when exists(select 1 from pg_attribute a where a.attrelid=to_regclass(relation) and a.attname=name and not a.attisdropped)
   then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end,null from extension_columns
 union all
 select 'name collision',name,case when to_regprocedure(name) is not null then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end,null from new_functions
 union all
 select 'name collision',name,case when to_regclass(name) is not null then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end,null from new_indexes
 union all
 select 'name collision',relation||'.'||name,
  case when exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(relation) and t.tgname=name and not t.tgisinternal)
   then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end,null from new_triggers
 union all
 select 'name collision',relation||'.'||name,
  case when exists(select 1 from pg_constraint c where c.conrelid=to_regclass(relation) and c.conname=name)
   then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end,null from new_constraints
 union all
 select 'security','migration role can read storage.objects past RLS',
  case when to_regclass('storage.objects') is not null and has_table_privilege(current_user,'storage.objects','SELECT')
   and (exists(select 1 from pg_roles r where r.rolname=current_user and (r.rolsuper or r.rolbypassrls))
    or exists(select 1 from pg_class c where c.oid=to_regclass('storage.objects') and pg_has_role(current_user,c.relowner,'USAGE') and not c.relforcerowsecurity))
   then 'present' else 'UNSAFE - apply using the project postgres role' end,null
 union all
 select 'security','evidence bucket is private and supports photographs',
  case when to_regclass('storage.buckets') is null then 'MISSING - stop and review'
   when exists(select 1 from storage.buckets b where b.id='supervisor-evidence' and not b.public and b.file_size_limit>=4194304
    and b.allowed_mime_types @> array['image/jpeg','image/png']) then 'present' else 'UNSAFE - stop and review bucket settings' end,null
 union all
 select 'row count',name,case when to_regclass(name) is null then 'table missing' else 'rows' end,
  case when to_regclass(name) is null then null else
   (xpath('/row/n/text()',query_to_xml(format('select count(*) as n from %s',name),false,true,'')))[1]::text end from preserved
)
select section,item,status,detail from report order by section,item;
