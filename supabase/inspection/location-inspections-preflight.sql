-- Read-only Phase 3A preflight. Execute as the intended migration role.
-- Prerequisites must be present and name collisions absent before applying.
with prerequisites(kind,name) as (values
 ('table','public.work_areas'),('table','public.actual_allocations'),('table','public.actual_allocation_operatives'),
 ('table','public.subcontractor_companies'),('function','private.can_supervise_contract(uuid)'),
 ('function','private.can_manage_contract(uuid)'),('function','private.guard_append_only()'),
 ('function','private.audit_mutation()'),('function','private.only_keys(jsonb,text[])'),
 ('function','private.request_result(uuid,text,uuid,jsonb)'),('function','private.record_request(uuid,text,uuid,jsonb,uuid)'),
 ('function','public.confirm_planned_allocation(uuid,jsonb)')
), new_objects(kind,name) as (values
 ('table','public.location_inspection_templates'),('table','public.location_inspections'),('table','public.location_inspection_allocations'),
 ('function','public.create_location_inspection_template(uuid,jsonb)'),('function','public.record_location_inspection(uuid,jsonb)')
), preserved(name) as (values
 ('public.supervisor_inspections'),('public.supervisor_issues'),('public.supervisor_issue_events'),('public.supervisor_issue_photos'),
 ('public.work_areas'),('public.document_revisions'),('public.planned_allocations'),('public.actual_allocations'),('public.actual_allocation_operatives'),('public.audit_events')
)
select 'prerequisite' as section, name as item,
 case when (kind='table' and to_regclass(name) is not null) or (kind='function' and to_regprocedure(name) is not null) then 'present' else 'MISSING - stop and review' end as status,
 null::text as detail from prerequisites
union all
select 'name collision',name,
 case when (kind='table' and to_regclass(name) is not null) or (kind='function' and to_regprocedure(name) is not null) then 'ALREADY EXISTS - stop and review' else 'absent (ready)' end,null from new_objects
union all
select 'row count',name,case when to_regclass(name) is null then 'table missing' else 'rows' end,
 case when to_regclass(name) is null then null else (xpath('/row/n/text()',query_to_xml(format('select count(*) as n from %s',name),false,true,'')))[1]::text end from preserved;
