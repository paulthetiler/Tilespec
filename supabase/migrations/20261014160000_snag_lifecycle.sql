-- Phase 3B: extend the existing issue/event/photo register. No historical rows
-- are rewritten and no hosted migration is authorised by this file's presence.
begin;
do $$ begin
 if to_regclass('public.location_inspections') is null or to_regprocedure('private.can_supervise_contract(uuid)') is null
   or to_regprocedure('private.guard_append_only()') is null or to_regprocedure('private.guard_issue_photo()') is null then
   raise exception 'Preflight failed: apply Phase 3A and supervisor hardening first'; end if;
 if exists(select 1 from pg_attribute where attrelid='public.supervisor_issues'::regclass and attname='snag_status' and not attisdropped)
   or to_regprocedure('private.can_read_snag(uuid)') is not null then
   raise exception 'Preflight failed: Phase 3B objects already exist'; end if;
 if not has_table_privilege(current_user,'storage.objects','SELECT')
   or not (exists(select 1 from pg_roles r where r.rolname=current_user and (r.rolsuper or r.rolbypassrls))
     or exists(select 1 from pg_class c where c.oid='storage.objects'::regclass
       and pg_has_role(current_user,c.relowner,'USAGE') and not c.relforcerowsecurity)) then
   raise exception 'Preflight failed: applying role cannot read storage.objects past row-level security. Apply as the project postgres role.';
 end if;
 if not exists(select 1 from storage.buckets b where b.id='supervisor-evidence' and not b.public
   and b.file_size_limit>=4194304 and b.allowed_mime_types @> array['image/jpeg','image/png']) then
   raise exception 'Preflight failed: supervisor-evidence must be private and support JPEG/PNG photographs up to 4 MB.';
 end if;
end $$;

-- NULL new fields identify legacy issues. Their original inspection ID,
-- description, states, timestamps, photos and transition history are preserved.
alter table public.supervisor_issues alter column inspection_id drop not null;
alter table public.supervisor_issues add column work_area_id uuid,
 add column work_package_id uuid, add column location_inspection_id uuid,
 add column stage public.installation_stage, add column category text,
 add column severity text check(severity in ('minor','major','critical')),
 add column required_rectification text check(length(required_rectification) between 1 and 2000),
 add column inspector_id uuid references auth.users(id), add column inspector_name text,
 add column location_path text[],
 add column snag_status text check(snag_status in ('draft','open','assigned','rectification_submitted','reinspection','closed','cancelled')),
 add column version integer check(version>0),
 add column responsibility_state text check(responsibility_state in ('not_assessed','proposed','accepted','disputed','under_review','confirmed','unable_to_determine')),
 add column responsibility_team_id uuid, add column responsibility_allocation_id uuid,
 add column assigned_team_id uuid, add column assigned_operative_id uuid,
 add column assigned_by uuid references auth.users(id), add column assigned_at timestamptz,
 add column assigned_action text, add column target_date date,
 add column repair_cycle integer check(repair_cycle>=0), add column repair_event_id bigint,
 add column escalated boolean, add column escalation_reason text,
 add constraint snag_area foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
 add constraint snag_package foreign key(organisation_id,contract_id,work_package_id) references public.work_packages(organisation_id,contract_id,id),
 add constraint snag_inspection foreign key(organisation_id,contract_id,location_inspection_id) references public.location_inspections(organisation_id,contract_id,id),
 add constraint snag_responsible_team foreign key(organisation_id,responsibility_team_id) references public.teams(organisation_id,id),
 add constraint snag_allocation foreign key(organisation_id,contract_id,responsibility_allocation_id) references public.actual_allocations(organisation_id,contract_id,id),
 add constraint snag_repair_team foreign key(organisation_id,assigned_team_id) references public.teams(organisation_id,id),
 add constraint snag_repair_person foreign key(organisation_id,assigned_operative_id) references public.operatives(organisation_id,id),
 add constraint snag_fields check(snag_status is null or (work_area_id is not null and stage is not null and category is not null
   and severity is not null and required_rectification is not null and inspector_id is not null and inspector_name is not null
   and location_path is not null and version is not null and responsibility_state is not null and repair_cycle is not null and escalated is not null));
create index snag_site_status on public.supervisor_issues(contract_id,snag_status,severity,target_date);
create index snag_location on public.supervisor_issues(work_area_id,created_at desc);
create index snag_search on public.supervisor_issues using gin(to_tsvector('simple',check_label||' '||description));

alter table public.supervisor_issue_events add column contract_id uuid,
 add column previous_status text, add column new_status text, add column actor_name text,
 add column snapshot jsonb;
alter table public.supervisor_issues add constraint snag_repair_event foreign key(repair_event_id) references public.supervisor_issue_events(id);
alter table public.supervisor_issue_photos add column contract_id uuid,
 add column purpose text check(purpose in ('original','rectification','reinspection')),
 add column repair_cycle integer, add column event_id bigint references public.supervisor_issue_events(id),
 add column sha256 text check(sha256 ~ '^[0-9a-f]{64}$'), add column bytes integer check(bytes between 1 and 4194304),
 add column mime_type text check(mime_type in ('image/jpeg','image/png')), add column uploaded_at timestamptz,
 add constraint verified_photo_fields check(purpose is null or (contract_id is not null and repair_cycle is not null
   and sha256 is not null and bytes is not null and mime_type is not null));
create index snag_photo_event on public.supervisor_issue_photos(issue_id,event_id,purpose);
create trigger permanent_issue_events before update or delete on public.supervisor_issue_events
 for each row execute function private.guard_append_only();
create trigger permanent_issue_photos before update or delete on public.supervisor_issue_photos
 for each row execute function private.guard_append_only('uploaded_at','event_id');

-- An installer needs current membership, contract/package scope AND explicit
-- repair assignment or a proposal naming their team. No other contractor's
-- records or workforce directory become visible.
create function private.is_snag_party(p_issue uuid,p_repair_only boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.supervisor_issues i where i.id=p_issue and i.organisation_id=private.current_org()
  and i.snag_status not in ('draft','cancelled') and private.current_role() in ('lead_installer','subcontract_installer')
  and exists(select 1 from public.package_assignments pa join public.work_packages wp on wp.id=pa.work_package_id
    join public.work_areas assigned_area on assigned_area.id=wp.work_area_id join public.work_areas target on target.id=i.work_area_id
    where pa.user_id=auth.uid() and pa.contract_id=i.contract_id and target.path_ids @> array[assigned_area.id])
  and (exists(select 1 from public.teams t where t.id=i.assigned_team_id and t.active and t.id=any(private.my_team_ids()))
    or exists(select 1 from public.operatives o where o.id=i.assigned_operative_id and o.user_id=auth.uid() and o.status='active')
    or (not p_repair_only and exists(select 1 from public.teams t where t.id=i.responsibility_team_id and t.active and t.id=any(private.my_team_ids())))))
$$;
create function private.can_read_snag(p_issue uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.supervisor_issues i where i.id=p_issue and i.organisation_id=private.current_org()
  and ((private.can_supervise_contract(i.contract_id) and (i.snag_status is distinct from 'draft' or i.inspector_id=auth.uid() or private.can_manage_contract(i.contract_id)))
    or private.is_snag_party(i.id,false)))
$$;
create function private.can_upload_snag_photo(p_issue uuid,p_purpose text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.supervisor_issues i where i.id=p_issue and private.can_read_snag(i.id)
   and i.snag_status not in ('closed','cancelled') and
   case p_purpose when 'original' then private.can_supervise_contract(i.contract_id)
     when 'rectification' then i.snag_status in ('open','assigned') and (i.assigned_team_id is not null or i.assigned_operative_id is not null)
       and (private.can_supervise_contract(i.contract_id) or private.is_snag_party(i.id,true))
     when 'reinspection' then i.snag_status in ('rectification_submitted','reinspection') and private.can_supervise_contract(i.contract_id)
     else false end)
$$;
create function private.can_insert_issue_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.supervisor_issue_photos p where p.object_path=p_path and p.purpose is not null
    and p.uploaded_at is null and p.actor_id=auth.uid() and private.can_upload_snag_photo(p.issue_id,p.purpose))
  or exists(select 1 from public.supervisor_issues i where i.snag_status is null and i.organisation_id=private.current_org()
    and i.id::text=split_part(p_path,'/',2) and i.organisation_id::text=split_part(p_path,'/',1)
    and private.can_supervise_contract(i.contract_id))
$$;
create function private.can_read_issue_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.supervisor_issue_photos p where p.object_path=p_path
   and ((p.purpose is not null and p.uploaded_at is not null and private.can_read_snag(p.issue_id))
     or (p.purpose is null and private.can_read_snag(p.issue_id))))
$$;
revoke all on function private.is_snag_party(uuid,boolean),private.can_read_snag(uuid),private.can_upload_snag_photo(uuid,text),
 private.can_insert_issue_object(text),private.can_read_issue_object(text) from public,anon;
grant execute on function private.is_snag_party(uuid,boolean),private.can_read_snag(uuid),private.can_upload_snag_photo(uuid,text),
 private.can_insert_issue_object(text),private.can_read_issue_object(text) to authenticated;

-- Replace permissive legacy reads with exact per-issue permissions. Legacy
-- tables still have their former grants; new reservations use checked RPCs.
drop policy supervisor_issues_read on public.supervisor_issues;
create policy supervisor_issues_read on public.supervisor_issues for select to authenticated using(private.can_read_snag(id));
drop policy issue_events_read on public.supervisor_issue_events;
create policy issue_events_read on public.supervisor_issue_events for select to authenticated using(private.can_read_snag(issue_id));
drop policy supervisor_photos_read on public.supervisor_issue_photos;
create policy supervisor_photos_read on public.supervisor_issue_photos for select to authenticated using(
 private.can_read_snag(issue_id) and (purpose is null or uploaded_at is not null or actor_id=auth.uid() or private.can_manage_contract(contract_id)));
drop policy supervisor_photos_insert on public.supervisor_issue_photos;
create policy supervisor_photos_insert on public.supervisor_issue_photos for insert to authenticated with check(
 purpose is null and organisation_id=private.current_org() and actor_id=auth.uid()
 and object_path like organisation_id::text||'/'||issue_id::text||'/%'
 and exists(select 1 from public.supervisor_issues i where i.id=issue_id and i.snag_status is null and private.can_supervise_contract(i.contract_id)));
drop policy supervisor_evidence_insert on storage.objects;
create policy supervisor_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='supervisor-evidence' and private.can_insert_issue_object(name));
drop policy supervisor_evidence_read on storage.objects;
create policy supervisor_evidence_read on storage.objects for select to authenticated using(bucket_id='supervisor-evidence' and private.can_read_issue_object(name));

create or replace function private.guard_issue_photo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.actor_id is distinct from auth.uid() or auth.uid() is null then raise exception 'Photograph actor must be the signed-in user' using errcode='42501'; end if;
 if new.purpose is null then
  if not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=new.object_path) then
   raise exception 'Photograph has not been stored. Upload it before recording the evidence.' using errcode='23514'; end if;
 else
  if new.uploaded_at is not null or new.event_id is not null or not private.can_upload_snag_photo(new.issue_id,new.purpose) then
   raise exception 'Photo reservation permission required' using errcode='42501'; end if;
 end if;
 new.created_at:=now(); return new;
end $$;

create function private.record_snag_event(p_issue public.supervisor_issues,p_previous text,p_action text,p_note text,p_extra jsonb default '{}') returns bigint
language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 insert into public.supervisor_issue_events(issue_id,organisation_id,contract_id,actor_id,actor_name,action,note,previous_status,new_status,snapshot)
 values(p_issue.id,p_issue.organisation_id,p_issue.contract_id,auth.uid(),
  (select display_name from public.organisation_members where user_id=auth.uid() and organisation_id=p_issue.organisation_id),
  p_action,p_note,p_previous,p_issue.snag_status,to_jsonb(p_issue)||p_extra) returning id into result;
 return result;
end $$;
create function private.attach_snag_photos(p_issue public.supervisor_issues,p_ids uuid[],p_purpose text,p_event bigint) returns void
language plpgsql security definer set search_path='' as $$
declare photo uuid; p public.supervisor_issue_photos;
begin
 foreach photo in array p_ids loop
  select * into p from public.supervisor_issue_photos where id=photo for update;
  if not found or p.issue_id<>p_issue.id or p.purpose<>p_purpose or p.actor_id<>auth.uid()
    or p.uploaded_at is null or p.event_id is not null or p.repair_cycle<>p_issue.repair_cycle
    or not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path
      and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
    raise exception 'Attach verified photographs for this snag, purpose and repair cycle' using errcode='22023'; end if;
  update public.supervisor_issue_photos set event_id=p_event where id=photo;
 end loop;
end $$;

create function private.guard_snag_findings() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.snag_status is not null and (to_jsonb(old)-array['state','updated_at','rectification_note','rectified_by','rectified_at','closed_by','closed_at',
  'snag_status','version','responsibility_state','responsibility_team_id','responsibility_allocation_id','assigned_team_id','assigned_operative_id',
  'assigned_by','assigned_at','assigned_action','target_date','repair_cycle','repair_event_id','escalated','escalation_reason'])
  is distinct from (to_jsonb(new)-array['state','updated_at','rectification_note','rectified_by','rectified_at','closed_by','closed_at',
  'snag_status','version','responsibility_state','responsibility_team_id','responsibility_allocation_id','assigned_team_id','assigned_operative_id',
  'assigned_by','assigned_at','assigned_action','target_date','repair_cycle','repair_event_id','escalated','escalation_reason']) then
  raise exception 'Original snag findings are permanent' using errcode='42501'; end if;
 return new;
end $$;
create trigger original_snag_findings before update on public.supervisor_issues for each row execute function private.guard_snag_findings();
create trigger audit_snag after insert or update on public.supervisor_issues for each row when(new.snag_status is not null) execute function private.audit_mutation();
create trigger audit_snag_event after insert on public.supervisor_issue_events for each row when(new.snapshot is not null) execute function private.audit_mutation();
create trigger audit_snag_photo after insert or update on public.supervisor_issue_photos for each row when(new.purpose is not null) execute function private.audit_mutation();

create function public.create_snag(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; area public.work_areas; linked public.location_inspections;
 result uuid; i public.supervisor_issues; pkg uuid; selected_stage text;
begin
 perform private.only_keys(p_data,array['contract_id','work_area_id','work_package_id','inspection_id','stage','category','severity','description','required_rectification']);
 c:=private.field_uuid(p_data,'contract_id',true);
 if not private.can_supervise_contract(c) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
 result:=private.request_result(org,'create_snag',p_request_key,p_data); if result is not null then return result; end if;
 select * into area from public.work_areas where id=private.field_uuid(p_data,'work_area_id',true) and contract_id=c and organisation_id=org for share;
 if not found or area.archived_at is not null then raise exception 'Choose an active location on this site' using errcode='22023'; end if;
 selected_stage:=private.field_text(p_data,'stage',30,true); perform private.assert_choice(selected_stage,'stage',private.installation_stages());
 perform private.assert_choice(private.field_text(p_data,'severity',20,true),'severity',array['minor','major','critical']);
 pkg:=private.field_uuid(p_data,'work_package_id');
 if pkg is not null and not exists(select 1 from public.work_packages p join public.work_areas w on w.id=p.work_area_id
  where p.id=pkg and p.organisation_id=org and p.contract_id=c and area.path_ids @> array[w.id]) then
  raise exception 'Choose a work package for this location' using errcode='22023'; end if;
 if private.field_uuid(p_data,'inspection_id') is not null then
  select * into linked from public.location_inspections where id=private.field_uuid(p_data,'inspection_id');
  if not found or linked.organisation_id<>org or linked.contract_id<>c or linked.work_area_id<>area.id or linked.issues_count=0
   or not exists(select 1 from public.location_inspection_templates t where t.id=linked.template_id and t.stage::text=selected_stage) then
   raise exception 'Link a failed inspection for this location and stage' using errcode='22023'; end if;
 end if;
 insert into public.supervisor_issues(organisation_id,contract_id,check_label,description,work_area_id,work_package_id,location_inspection_id,
  stage,category,severity,required_rectification,inspector_id,inspector_name,location_path,snag_status,version,responsibility_state,repair_cycle,escalated)
 values(org,c,private.field_text(p_data,'category',100,true),private.field_text(p_data,'description',2000,true),area.id,pkg,linked.id,
  selected_stage,private.field_text(p_data,'category',100,true),p_data->>'severity',private.field_text(p_data,'required_rectification',2000,true),auth.uid(),
  (select display_name from public.organisation_members where user_id=auth.uid() and organisation_id=org),
  array(select w.name from unnest(area.path_ids) with ordinality a(id,n) join public.work_areas w on w.id=a.id order by n),
  'draft',1,'not_assessed',0,false) returning * into i;
 perform private.record_snag_event(i,null,'create_draft','Original findings recorded; photographs and submission pending');
 perform private.record_request(org,'create_snag',p_request_key,p_data,i.id); return i.id;
end $$;

-- A single row lock and per-actor request key make every lifecycle mutation
-- transactional, stale-safe and safe to retry after a lost response.
create function public.transition_snag(p_issue uuid,p_request_key uuid,p_version integer,p_action text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.supervisor_issues; previous text; payload jsonb; result uuid; note text;
 ids uuid[]; event bigint; a public.actual_allocations; extra jsonb:='{}'; team uuid; person uuid; due date; r text;
begin
 perform private.only_keys(p_data,array['note','photo_ids','team_id','operative_id','target_date','required_action','completed_on','allocation_id','decision']);
 select * into i from public.supervisor_issues where id=p_issue for update;
 if not found or i.snag_status is null or not private.can_read_snag(i.id) then raise exception 'Snag unavailable' using errcode='42501'; end if;
 payload:=jsonb_build_object('issue',p_issue,'version',p_version,'action',p_action,'data',p_data);
 result:=private.request_result(i.organisation_id,'transition_snag',p_request_key,payload); if result is not null then return result; end if;
 if p_version is distinct from i.version then raise exception 'This snag changed. Refresh before continuing' using errcode='40001'; end if;
 note:=private.field_text(p_data,'note',2000,true);
 if length(note)<5 then raise exception 'Add a meaningful explanation (at least 5 characters)' using errcode='22023'; end if;
 previous:=i.snag_status; ids:=private.field_uuids(p_data,'photo_ids',12);
 if p_action not in ('submit_rectification','accept_responsibility','dispute_responsibility') and not private.can_supervise_contract(i.contract_id) then
   raise exception 'Site supervision permission required' using errcode='42501'; end if;
 if p_action not in ('reopen','cancel') and i.snag_status in ('closed','cancelled') then
   raise exception 'Reopen the snag before recording more work' using errcode='22023'; end if;
 case p_action
 when 'submit' then
  if i.snag_status<>'draft' or cardinality(ids)=0 then raise exception 'Submit a draft with verified original photographs' using errcode='22023'; end if;
  i.snag_status:='open'; i.escalated:=i.severity='critical'; if i.escalated then i.escalation_reason:='Critical defect requires immediate office review'; end if;
 when 'add_original_evidence' then
  if i.snag_status='draft' or cardinality(ids)=0 then raise exception 'Choose verified original evidence for a submitted snag' using errcode='22023'; end if;
 when 'propose_responsibility' then
  if i.snag_status='draft' then raise exception 'Submit the snag before proposing responsibility' using errcode='22023'; end if;
  if i.responsibility_state='confirmed' and not private.can_manage_contract(i.contract_id) then
    raise exception 'Office review is required to revise confirmed responsibility' using errcode='42501'; end if;
  select * into a from public.actual_allocations where id=private.field_uuid(p_data,'allocation_id',true) for share;
  if not found or a.organisation_id<>i.organisation_id or a.contract_id<>i.contract_id or a.team_id is null or a.voided_at is not null
   or a.stage<>i.stage or a.started_at>now() or not exists(select 1 from public.work_areas target join public.work_areas w on w.contract_id=target.contract_id
    where target.id=i.work_area_id and w.id=a.work_area_id and (w.id=any(target.path_ids) or w.path_ids @> array[target.id])) then
   raise exception 'Choose an actual gang that worked at this location and stage' using errcode='22023'; end if;
  i.responsibility_state:='proposed'; i.responsibility_team_id:=a.team_id; i.responsibility_allocation_id:=a.id;
  extra:=jsonb_build_object('work_presence',to_jsonb(a),'attendance',(select coalesce(jsonb_agg(to_jsonb(ao)||jsonb_build_object('display_name',o.display_name)),'[]')
    from public.actual_allocation_operatives ao join public.operatives o on o.id=ao.operative_id where ao.actual_allocation_id=a.id),
    'team_name',(select name from public.teams where id=a.team_id));
 when 'mark_unknown' then
  if i.snag_status='draft' then raise exception 'Submit the snag before recording responsibility' using errcode='22023'; end if;
  if i.responsibility_state='confirmed' and not private.can_manage_contract(i.contract_id) then
    raise exception 'Office review is required to revise confirmed responsibility' using errcode='42501'; end if;
  i.responsibility_state:='unable_to_determine'; i.responsibility_team_id:=null; i.responsibility_allocation_id:=null;
 when 'accept_responsibility', 'dispute_responsibility' then
  if i.responsibility_state not in ('proposed','accepted') or i.responsibility_team_id is null
   or not (i.responsibility_team_id=any(private.my_team_ids())) then raise exception 'Only the proposed team may respond' using errcode='42501'; end if;
  i.responsibility_state:=case when p_action='accept_responsibility' then 'accepted' else 'disputed' end;
  if p_action='dispute_responsibility' then i.escalated:=true; i.escalation_reason:=note; end if;
 when 'review_responsibility' then
  if not private.can_manage_contract(i.contract_id) then raise exception 'Office review permission required' using errcode='42501'; end if;
  r:=private.field_text(p_data,'decision',30,true);
  perform private.assert_choice(r,'decision',array['under_review','confirmed','unable_to_determine']);
  if r='confirmed' and i.responsibility_team_id is null then raise exception 'Review an explicit proposal before confirming it' using errcode='22023'; end if;
  i.responsibility_state:=r;
  if r='unable_to_determine' then i.responsibility_team_id:=null; i.responsibility_allocation_id:=null; end if;
 when 'assign' then
  if i.snag_status not in ('open','assigned') then raise exception 'Assign rectification to an open snag' using errcode='22023'; end if;
  team:=private.field_uuid(p_data,'team_id'); person:=private.field_uuid(p_data,'operative_id');
  if (team is null)=(person is null) then raise exception 'Assign one team or one operative' using errcode='22023'; end if;
  if team is not null and not exists(select 1 from public.teams where id=team and organisation_id=i.organisation_id and active) then
    raise exception 'Choose an active team' using errcode='22023'; end if;
  if person is not null and not exists(select 1 from public.operatives where id=person and organisation_id=i.organisation_id and status='active') then
    raise exception 'Choose an active operative' using errcode='22023'; end if;
  due:=private.field_date(p_data,'target_date',true);
  i.assigned_team_id:=team; i.assigned_operative_id:=person; i.assigned_by:=auth.uid(); i.assigned_at:=now();
  i.target_date:=due; i.assigned_action:=private.field_text(p_data,'required_action',2000,true);
  i.snag_status:='assigned'; i.repair_cycle:=i.repair_cycle+1; i.repair_event_id:=null;
  extra:=jsonb_build_object('assigned_party',coalesce((select name from public.teams where id=team),(select display_name from public.operatives where id=person)));
 when 'submit_rectification' then
  if i.snag_status not in ('open','assigned') or (i.assigned_team_id is null and i.assigned_operative_id is null)
   or not (private.can_supervise_contract(i.contract_id) or private.is_snag_party(i.id,true)) then
   raise exception 'The assigned party must submit completion notes and verified repair photographs' using errcode='42501'; end if;
  if cardinality(ids)=0 then raise exception 'Choose verified repair photographs before submitting completion' using errcode='22023'; end if;
  due:=private.field_date(p_data,'completed_on',true);
  if due>private.site_today() then raise exception 'Completion cannot be in the future' using errcode='22023'; end if;
  i.snag_status:='rectification_submitted'; i.rectified_by:=auth.uid(); i.rectified_at:=now(); i.rectification_note:=note;
  extra:=jsonb_build_object('completed_on',due);
 when 'start_reinspection' then
  if i.snag_status<>'rectification_submitted' then raise exception 'Repair must be submitted before reinspection' using errcode='22023'; end if;
  i.snag_status:='reinspection';
 when 'accept' then
  if i.snag_status<>'reinspection' or i.rectified_by=auth.uid() or i.repair_event_id is null then
    raise exception 'An independent authorised inspector must reinspect the submitted repair' using errcode='42501'; end if;
  if (i.severity='critical' or i.escalated) and not private.can_manage_contract(i.contract_id) then
    raise exception 'Critical or escalated repairs require office acceptance' using errcode='42501'; end if;
  i.snag_status:='closed'; i.closed_by:=auth.uid(); i.closed_at:=now(); i.escalated:=false;
 when 'reject' then
  if i.snag_status not in ('rectification_submitted','reinspection') then raise exception 'Reinspect a submitted repair before rejecting it' using errcode='22023'; end if;
  i.snag_status:='open'; i.repair_cycle:=i.repair_cycle+1; i.repair_event_id:=null;
 when 'escalate' then
  if i.snag_status='draft' then raise exception 'Submit the snag before escalation' using errcode='22023'; end if;
  i.escalated:=true; i.escalation_reason:=note;
 when 'resolve_escalation' then
  if not private.can_manage_contract(i.contract_id) then raise exception 'Office review permission required' using errcode='42501'; end if;
  i.escalated:=false;
 when 'reopen' then
  if i.snag_status<>'closed' then raise exception 'Only a closed snag can be reopened' using errcode='22023'; end if;
  i.snag_status:='open'; i.closed_by:=null; i.closed_at:=null; i.repair_event_id:=null; i.repair_cycle:=i.repair_cycle+1;
 when 'cancel' then
  if i.snag_status='cancelled' then raise exception 'This snag is already entered in error' using errcode='22023'; end if;
  i.snag_status:='cancelled';
 else raise exception 'Choose a valid snag action' using errcode='22023';
 end case;
 i.version:=i.version+1; i.updated_at:=now();
 i.state:=case i.snag_status when 'closed' then 'closed' when 'rectification_submitted' then 'rectification_reported' when 'reinspection' then 'reinspection_required' else 'open' end;
 -- Record the event before updating the current summary; every prior repair,
 -- assignment, rejected attempt and responsibility decision stays immutable.
 event:=private.record_snag_event(i,previous,p_action,note,extra||jsonb_build_object('evidence_ids',to_jsonb(ids)));
 if p_action in ('submit','add_original_evidence') then perform private.attach_snag_photos(i,ids,'original',event);
 elsif p_action='submit_rectification' then
   perform private.attach_snag_photos(i,ids,'rectification',event); i.repair_event_id:=event;
 elsif p_action in ('accept','reject','escalate','start_reinspection') and cardinality(ids)>0 then
   -- Rejection advances the cycle after evidence is attached to the old attempt.
   if p_action='reject' then i.repair_cycle:=i.repair_cycle-1; end if;
   perform private.attach_snag_photos(i,ids,'reinspection',event);
   if p_action='reject' then i.repair_cycle:=i.repair_cycle+1; end if;
 elsif cardinality(ids)>0 then raise exception 'Evidence is not applicable to this action' using errcode='22023'; end if;
 update public.supervisor_issues set snag_status=i.snag_status,version=i.version,updated_at=i.updated_at,
  state=i.state,
  responsibility_state=i.responsibility_state,responsibility_team_id=i.responsibility_team_id,responsibility_allocation_id=i.responsibility_allocation_id,
  assigned_team_id=i.assigned_team_id,assigned_operative_id=i.assigned_operative_id,assigned_by=i.assigned_by,assigned_at=i.assigned_at,assigned_action=i.assigned_action,
  target_date=i.target_date,repair_cycle=i.repair_cycle,repair_event_id=i.repair_event_id,rectified_by=i.rectified_by,rectified_at=i.rectified_at,rectification_note=i.rectification_note,
  closed_by=i.closed_by,closed_at=i.closed_at,escalated=i.escalated,escalation_reason=i.escalation_reason where id=i.id;
 perform private.record_request(i.organisation_id,'transition_snag',p_request_key,payload,i.id); return i.id;
end $$;

create function public.reserve_snag_photo(p_issue uuid,p_request_key uuid,p_purpose text,p_meta jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.supervisor_issues; result uuid; payload jsonb; mime text; hash text; size integer;
begin
 perform private.only_keys(p_meta,array['mime_type','sha256','bytes']);
 select * into i from public.supervisor_issues where id=p_issue for share;
 if not found or not private.can_upload_snag_photo(i.id,p_purpose) then raise exception 'Photograph upload permission required' using errcode='42501'; end if;
 payload:=jsonb_build_object('issue',p_issue,'purpose',p_purpose,'meta',p_meta,'cycle',i.repair_cycle);
 result:=private.request_result(i.organisation_id,'reserve_snag_photo',p_request_key,payload); if result is not null then return result; end if;
 mime:=private.field_text(p_meta,'mime_type',30,true); hash:=private.field_text(p_meta,'sha256',64,true);
 size:=(p_meta->>'bytes')::integer;
 if mime not in ('image/jpeg','image/png') or hash !~ '^[0-9a-f]{64}$' or size is null or size not between 1 and 4194304 then
  raise exception 'Choose a JPEG or PNG photograph no larger than 4 MB' using errcode='22023'; end if;
 result:=gen_random_uuid();
 insert into public.supervisor_issue_photos(id,issue_id,organisation_id,contract_id,purpose,repair_cycle,actor_id,object_path,sha256,bytes,mime_type)
 values(result,i.id,i.organisation_id,i.contract_id,p_purpose,i.repair_cycle,auth.uid(),
  i.organisation_id::text||'/'||i.id::text||'/'||result::text||case mime when 'image/png' then '.png' else '.jpg' end,hash,size,mime);
 perform private.record_request(i.organisation_id,'reserve_snag_photo',p_request_key,payload,result); return result;
end $$;
create function public.complete_snag_photo(p_photo uuid,p_actor uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.supervisor_issue_photos; claims text; sub text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted server verification required' using errcode='42501'; end if;
 select * into p from public.supervisor_issue_photos where id=p_photo for update;
 if not found or p.purpose is null or p.actor_id is distinct from p_actor or p.sha256 is distinct from p_sha256 then
  raise exception 'Verified actor and hash must match the reservation' using errcode='42501'; end if;
 claims:=current_setting('request.jwt.claims',true); sub:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_actor)::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if not private.can_upload_snag_photo(p.issue_id,p.purpose) or not exists(select 1 from public.supervisor_issues i where i.id=p.issue_id and i.repair_cycle=p.repair_cycle) then
   raise exception 'Uploader no longer has permission for this repair cycle' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path
   and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
   raise exception 'Photograph missing or stored metadata differs from reservation' using errcode='23514'; end if;
 if p.uploaded_at is null then update public.supervisor_issue_photos set uploaded_at=now() where id=p_photo; end if;
 perform set_config('request.jwt.claims',coalesce(claims,''),true); perform set_config('request.jwt.claim.sub',coalesce(sub,''),true);
end $$;

-- Keep the original legacy function privately, wrapping its public signature
-- so it cannot bypass the richer lifecycle's version/evidence checks.
alter function public.transition_supervisor_issue(uuid,text,text) set schema private;
alter function private.transition_supervisor_issue(uuid,text,text) rename to transition_legacy_issue;
revoke all on function private.transition_legacy_issue(uuid,text,text) from public,anon,authenticated;
create function public.transition_supervisor_issue(p_issue uuid,p_action text,p_note text) returns public.supervisor_issues
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.supervisor_issues where id=p_issue and snag_status is not null) then
  raise exception 'Use the snag lifecycle for this record' using errcode='22023'; end if;
 return private.transition_legacy_issue(p_issue,p_action,p_note);
end $$;
create or replace function private.enforce_issue_closure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='closed' and old.state is distinct from 'closed' then
  if new.closed_by=old.rectified_by then raise exception 'Independent reinspection required' using errcode='42501'; end if;
  if new.snag_status is null then
   if not exists(select 1 from public.supervisor_issue_photos p join storage.objects o on o.bucket_id='supervisor-evidence' and o.name=p.object_path where p.issue_id=new.id) then
    raise exception 'Photographic evidence required before closure' using errcode='23514'; end if;
  else
   if new.closed_by is null or new.closed_by<>auth.uid() or not private.can_supervise_contract(new.contract_id)
    or old.snag_status<>'reinspection' or new.snag_status<>'closed' or old.rectified_by is null or old.rectified_by=auth.uid()
    or not exists(select 1 from public.supervisor_issue_photos p join storage.objects o on o.bucket_id='supervisor-evidence' and o.name=p.object_path
      where p.issue_id=new.id and p.purpose='original' and p.uploaded_at is not null and p.event_id is not null)
    or not exists(select 1 from public.supervisor_issue_photos p join storage.objects o on o.bucket_id='supervisor-evidence' and o.name=p.object_path
      where p.issue_id=new.id and p.purpose='rectification' and p.uploaded_at is not null and p.event_id=old.repair_event_id) then
      raise exception 'Independent reinspection and verified original/repair evidence required' using errcode='42501'; end if;
  end if;
 end if;
 return new;
end $$;

-- Server-side filters and pagination. The definer RPC explicitly applies the
-- exact issue read boundary before joins and aggregates; no counts leak.
create function public.snag_register(p_filters jsonb default '{}',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.only_keys(p_filters,array['contract_id','location_id','stage','team_id','category','severity','status','assigned_team_id','assigned_operative_id','overdue','awaiting_reinspection','disputed','search']);
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Choose a valid page' using errcode='22023'; end if;
 with scope as (
  select i.*,c.reference as contract_reference,c.name as contract_name,
    t.name as responsible_team, rt.name as repair_team, o.display_name as repair_operative,
    coalesce(i.snag_status,i.state) as display_status,
    i.target_date<private.site_today() and coalesce(i.snag_status,i.state) not in ('closed','cancelled','draft') as overdue
  from public.supervisor_issues i join public.contracts c on c.id=i.contract_id
  left join public.teams t on t.id=i.responsibility_team_id left join public.teams rt on rt.id=i.assigned_team_id
  left join public.operatives o on o.id=i.assigned_operative_id
  where private.can_read_snag(i.id) and i.organisation_id=private.current_org()
    and (i.snag_status is distinct from 'draft' or i.inspector_id=auth.uid())
    and (private.field_uuid(p_filters,'contract_id') is null or i.contract_id=private.field_uuid(p_filters,'contract_id'))
 ), filtered as (
  select * from scope i where
   (private.field_uuid(p_filters,'location_id') is null or exists(select 1 from public.work_areas w where w.id=i.work_area_id and w.path_ids @> array[private.field_uuid(p_filters,'location_id')]))
   and (private.field_text(p_filters,'stage',30) is null or i.stage::text=p_filters->>'stage')
   and (private.field_uuid(p_filters,'team_id') is null or i.responsibility_team_id=private.field_uuid(p_filters,'team_id'))
   and (private.field_text(p_filters,'category',100) is null or i.category=p_filters->>'category')
   and (private.field_text(p_filters,'severity',20) is null or i.severity=p_filters->>'severity')
   and (private.field_text(p_filters,'status',40) is null or i.display_status=p_filters->>'status')
   and (private.field_uuid(p_filters,'assigned_team_id') is null or i.assigned_team_id=private.field_uuid(p_filters,'assigned_team_id'))
   and (private.field_uuid(p_filters,'assigned_operative_id') is null or i.assigned_operative_id=private.field_uuid(p_filters,'assigned_operative_id'))
   and (coalesce((p_filters->>'overdue')::boolean,false)=false or i.overdue)
   and (coalesce((p_filters->>'awaiting_reinspection')::boolean,false)=false or i.display_status in ('rectification_submitted','reinspection','rectification_reported','reinspection_required'))
   and (coalesce((p_filters->>'disputed')::boolean,false)=false or i.responsibility_state in ('disputed','under_review'))
   and (private.field_text(p_filters,'search',200) is null or to_tsvector('simple',i.check_label||' '||i.description) @@ plainto_tsquery('simple',p_filters->>'search'))
 ), page as (
  select * from filtered order by (severity='critical') desc nulls last,created_at desc,id limit 50 offset p_page*50
 ) select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from page p),'total',(select count(*) from filtered),
  'counts',jsonb_build_object('open',(select count(*) from scope where display_status not in ('closed','cancelled','draft')),
   'critical',(select count(*) from scope where severity='critical' and display_status not in ('closed','cancelled','draft')),
   'awaiting_rectification',(select count(*) from scope where display_status in ('open','assigned')),
   'awaiting_reinspection',(select count(*) from scope where display_status in ('rectification_submitted','reinspection','rectification_reported','reinspection_required')),
   'disputed',(select count(*) from scope where responsibility_state in ('disputed','under_review') and display_status not in ('closed','cancelled','draft')),
   'overdue',(select count(*) from scope where overdue),'closed',(select count(*) from scope where display_status='closed'))) into result;
 return result;
end $$;
-- Workforce attribution snapshots remain staff-only, including direct API
-- queries. Installers receive a sanitised event projection, never the protected
-- allocation/attendance directory through an otherwise readable JSON column.
revoke select on public.supervisor_issue_events from authenticated;
grant select(id,issue_id,organisation_id,actor_id,action,note,created_at,contract_id,previous_status,new_status,actor_name)
 on public.supervisor_issue_events to authenticated;
create function public.snag_events(p_issue uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare staff boolean; result jsonb;
begin
 if not private.can_read_snag(p_issue) then raise exception 'Snag unavailable' using errcode='42501'; end if;
 select private.can_supervise_contract(contract_id) into staff from public.supervisor_issues where id=p_issue;
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('snapshot',case when staff then e.snapshot else e.snapshot-'work_presence'-'attendance' end)
  order by e.created_at,e.id),'[]') into result from public.supervisor_issue_events e where e.issue_id=p_issue;
 return result;
end $$;
revoke all on function public.snag_events(uuid) from public,anon;
grant execute on function public.snag_events(uuid) to authenticated;

create function public.snag_context(p_issue uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i public.supervisor_issues;
begin
 if not private.can_read_snag(p_issue) then raise exception 'Snag unavailable' using errcode='42501'; end if;
 select * into i from public.supervisor_issues where id=p_issue;
 return jsonb_build_object('snag',to_jsonb(i)||jsonb_build_object(
  'contract_name',(select name from public.contracts where id=i.contract_id),
  'contract_reference',(select reference from public.contracts where id=i.contract_id),
  'responsible_team',(select name from public.teams where id=i.responsibility_team_id),
  'repair_team',(select name from public.teams where id=i.assigned_team_id),
  'repair_operative',(select display_name from public.operatives where id=i.assigned_operative_id)),
  'permissions',jsonb_build_object('supervise',private.can_supervise_contract(i.contract_id),'office',private.can_manage_contract(i.contract_id),
   'repair',private.can_supervise_contract(i.contract_id) or private.is_snag_party(i.id,true),
   'proposed_party',private.is_snag_party(i.id,false) and i.responsibility_team_id=any(private.my_team_ids())),
  'events',public.snag_events(p_issue));
end $$;
revoke all on function public.snag_context(uuid) from public,anon;
grant execute on function public.snag_context(uuid) to authenticated;

revoke all on function private.record_snag_event(public.supervisor_issues,text,text,text,jsonb),private.attach_snag_photos(public.supervisor_issues,uuid[],text,bigint),private.guard_snag_findings() from public,anon,authenticated;
revoke all on function public.create_snag(uuid,jsonb),public.transition_snag(uuid,uuid,integer,text,jsonb),public.reserve_snag_photo(uuid,uuid,text,jsonb),
 public.transition_supervisor_issue(uuid,text,text),public.snag_register(jsonb,integer),public.complete_snag_photo(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_snag(uuid,jsonb),public.transition_snag(uuid,uuid,integer,text,jsonb),public.reserve_snag_photo(uuid,uuid,text,jsonb),
 public.transition_supervisor_issue(uuid,text,text),public.snag_register(jsonb,integer) to authenticated;
grant execute on function public.complete_snag_photo(uuid,uuid,text) to service_role;
commit;
