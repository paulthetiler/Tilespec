-- Phase 3C formal restrictions. Additive records only; review before hosted use.
begin;
do $$ begin
 if to_regprocedure('private.assert_hold_requirements(uuid,uuid,text,uuid,timestamptz)') is null
   or to_regprocedure('public.snag_context(uuid)') is null then
  raise exception 'Preflight failed: Phase 3B and mandatory inspection requirements must be applied first'; end if;
 if to_regclass('public.work_holds') is not null then raise exception 'Preflight failed: Phase 3C hold objects already exist'; end if;
 if not has_table_privilege(current_user,'storage.objects','SELECT') or not (
   exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) or
   exists(select 1 from pg_class where oid='storage.objects'::regclass and pg_has_role(current_user,relowner,'USAGE') and not relforcerowsecurity)) then
  raise exception 'Preflight failed: applying role must read Storage beyond RLS'; end if;
 if not exists(select 1 from storage.buckets where id='supervisor-evidence' and not public and file_size_limit>=4194304
   and allowed_mime_types @> array['image/jpeg','image/png']) then raise exception 'Preflight failed: private JPEG/PNG evidence bucket required'; end if;
end $$;

create table public.work_holds (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
 work_area_id uuid, work_package_id uuid, stage public.installation_stage, activity text,
 location_path text[] not null, hold_type text not null check(hold_type in ('quality','safety')),
 category text not null check(length(trim(category)) between 1 and 100), severity text not null check(severity in ('major','critical')),
 reason text not null check(length(trim(reason)) between 5 and 2000), required_action text not null check(length(trim(required_action)) between 5 and 2000),
 raised_by uuid not null references auth.users(id), raised_by_name text not null, raised_at timestamptz not null default now(),
 source_inspection_id uuid, source_snag_id uuid, source_morning_inspection_id uuid,
 original_document_ids uuid[] not null default '{}', evidence_explanation text,
 status text not null default 'active' check(status in ('active','correction_submitted','awaiting_release','released','superseded','entered_in_error')),
 version integer not null default 1 check(version>0), correction_cycle integer not null default 1 check(correction_cycle>0),
 assigned_team_id uuid, assigned_operative_id uuid, assigned_by uuid references auth.users(id), assigned_at timestamptz,
 assignment_action text, target_date date, correction_event_id bigint, corrected_by uuid references auth.users(id), corrected_at timestamptz,
 release_requested_at timestamptz, released_by uuid references auth.users(id), released_at timestamptz,
 authority_acknowledgement jsonb, superseded_by uuid, escalated boolean not null default false, escalation_reason text,
 unique(organisation_id,contract_id,id),
 foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
 foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
 foreign key(organisation_id,contract_id,work_package_id) references public.work_packages(organisation_id,contract_id,id),
 foreign key(organisation_id,contract_id,source_inspection_id) references public.location_inspections(organisation_id,contract_id,id),
 foreign key(source_snag_id) references public.supervisor_issues(id),
 foreign key(source_morning_inspection_id) references public.supervisor_inspections(id),
 foreign key(organisation_id,assigned_team_id) references public.teams(organisation_id,id),
 foreign key(organisation_id,assigned_operative_id) references public.operatives(organisation_id,id),
 foreign key(organisation_id,contract_id,superseded_by) references public.work_holds(organisation_id,contract_id,id),
 check(assigned_team_id is null or assigned_operative_id is null), check(work_package_id is null or work_area_id is not null)
);
create table public.work_hold_events (
 id bigint generated always as identity primary key, hold_id uuid not null references public.work_holds(id),
 organisation_id uuid not null, contract_id uuid not null, actor_id uuid not null references auth.users(id), actor_name text not null,
 action text not null, note text not null, previous_status text, new_status text not null,
 snapshot jsonb not null, created_at timestamptz not null default now()
);
alter table public.work_holds add foreign key(correction_event_id) references public.work_hold_events(id);
create table public.hold_photos (
 id uuid primary key default gen_random_uuid(), hold_id uuid not null references public.work_holds(id),
 organisation_id uuid not null, contract_id uuid not null, actor_id uuid not null references auth.users(id),
 purpose text not null check(purpose in ('original','correction','release')), correction_cycle integer not null,
 object_path text not null unique, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 bytes integer not null check(bytes between 1 and 4194304), mime_type text not null check(mime_type in ('image/jpeg','image/png')),
 created_at timestamptz not null default now(), uploaded_at timestamptz, event_id bigint references public.work_hold_events(id),
 check(object_path=organisation_id::text||'/holds/'||hold_id::text||'/'||id::text||case mime_type when 'image/png' then '.png' else '.jpg' end)
);
create table public.hold_notifications (
 id bigint generated always as identity primary key, hold_id uuid not null references public.work_holds(id),
 event_id bigint not null references public.work_hold_events(id), organisation_id uuid not null, contract_id uuid not null,
 recipient_id uuid not null references auth.users(id), kind text not null, title text not null, created_at timestamptz not null default now(),
 unique(event_id,recipient_id)
);
create table public.hold_notification_reads (
 notification_id bigint not null references public.hold_notifications(id), user_id uuid not null references auth.users(id),
 read_at timestamptz not null default now(), primary key(notification_id,user_id)
);
create index work_holds_site on public.work_holds(contract_id,status,hold_type);
create index work_holds_area on public.work_holds(work_area_id,stage);
create index work_hold_history on public.work_hold_events(hold_id,id);
create index hold_photos_event on public.hold_photos(hold_id,event_id,purpose,correction_cycle);
create index hold_alerts_recipient on public.hold_notifications(recipient_id,created_at desc);

-- Branch intersections are explicit: NULL area is the whole contract; NULL
-- stage is every installation activity. A named activity describes that scope
-- and never narrows an entire-stage restriction behind the user's back.
create function private.hold_scopes_overlap(p_left uuid,p_right uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_left is null or p_right is null or exists(select 1 from public.work_areas l join public.work_areas r on r.id=p_right
 where l.id=p_left and l.contract_id=r.contract_id and (l.path_ids @> array[r.id] or r.path_ids @> array[l.id]))
$$;
-- Use the same date calendar as the established contract-assignment helpers.
-- Notification recipients and RLS must agree with lifecycle RPC permissions.
create function private.hold_member_can_read(p_hold uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_holds h join public.organisation_members m on m.organisation_id=h.organisation_id
 where h.id=p_hold and m.user_id=p_user and m.active and (
 m.role='owner' or (m.role in ('contracts_manager','supervisor') and exists(select 1 from public.contract_assignments ca
  where ca.contract_id=h.contract_id and ca.user_id=m.user_id and ca.valid_from<=current_date and (ca.valid_until is null or ca.valid_until>=current_date)))
 or (m.role in ('lead_installer','subcontract_installer') and exists(select 1 from public.package_assignments pa join public.work_packages wp on wp.id=pa.work_package_id
  where pa.user_id=m.user_id and pa.contract_id=h.contract_id and (h.work_package_id is null or h.work_package_id=wp.id)
  and private.hold_scopes_overlap(h.work_area_id,wp.work_area_id)))))
$$;
create function private.can_read_work_hold(p_hold uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_holds h where h.id=p_hold and h.organisation_id=private.current_org()
 and private.hold_member_can_read(h.id,auth.uid()))
$$;
create function private.is_hold_corrector(p_hold uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_holds h where h.id=p_hold and private.can_read_work_hold(h.id) and (
 private.can_supervise_contract(h.contract_id) or (
  exists(select 1 from public.teams t where t.id=h.assigned_team_id and t.active and t.id=any(private.my_team_ids()))
  or exists(select 1 from public.operatives o where o.id=h.assigned_operative_id and o.user_id=auth.uid() and o.status='active'))))
$$;
create function private.can_upload_hold_photo(p_hold uuid,p_purpose text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_holds h where h.id=p_hold and private.can_read_work_hold(h.id)
 and h.status not in ('released','superseded','entered_in_error') and case p_purpose
 when 'original' then private.can_supervise_contract(h.contract_id)
 when 'correction' then h.status='active' and (h.assigned_team_id is not null or h.assigned_operative_id is not null) and private.is_hold_corrector(h.id)
 when 'release' then h.status in ('correction_submitted','awaiting_release') and private.can_manage_contract(h.contract_id)
 else false end)
$$;
create function private.can_insert_hold_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hold_photos p where p.object_path=p_path and p.uploaded_at is null
 and p.actor_id=auth.uid() and private.can_upload_hold_photo(p.hold_id,p.purpose))
$$;
create function private.can_read_hold_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hold_photos p where p.object_path=p_path and p.uploaded_at is not null and private.can_read_work_hold(p.hold_id))
$$;
-- Preserve the Phase 3B policies and add only the checked holds namespace.
create policy hold_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='supervisor-evidence' and private.can_insert_hold_object(name));
create policy hold_evidence_read on storage.objects for select to authenticated using(bucket_id='supervisor-evidence' and private.can_read_hold_object(name));

do $$ declare t text; begin
 foreach t in array array['work_holds','work_hold_events','hold_photos','hold_notifications','hold_notification_reads'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy hold_read on public.work_holds for select to authenticated using(private.can_read_work_hold(id));
create policy hold_event_read on public.work_hold_events for select to authenticated using(private.can_read_work_hold(hold_id));
create policy hold_photo_read on public.hold_photos for select to authenticated using(private.can_read_work_hold(hold_id)
 and (uploaded_at is not null or actor_id=auth.uid() or private.can_manage_contract(contract_id)));
create policy hold_notification_read on public.hold_notifications for select to authenticated using(recipient_id=auth.uid() and private.can_read_work_hold(hold_id));
create policy hold_read_marker on public.hold_notification_reads for select to authenticated using(user_id=auth.uid()
 and exists(select 1 from public.hold_notifications n where n.id=notification_id and n.recipient_id=auth.uid() and private.can_read_work_hold(n.hold_id)));
create trigger permanent_hold_events before update or delete on public.work_hold_events for each row execute function private.guard_append_only();
create trigger permanent_hold_photos before update or delete on public.hold_photos for each row execute function private.guard_append_only('uploaded_at','event_id');
create trigger permanent_hold_notifications before update or delete on public.hold_notifications for each row execute function private.guard_append_only();
create trigger permanent_hold_reads before update or delete on public.hold_notification_reads for each row execute function private.guard_append_only();
create function private.guard_hold_findings() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(old)-array['status','version','correction_cycle','assigned_team_id','assigned_operative_id','assigned_by','assigned_at',
 'assignment_action','target_date','correction_event_id','corrected_by','corrected_at','release_requested_at','released_by','released_at',
 'authority_acknowledgement','superseded_by','escalated','escalation_reason']) is distinct from
 (to_jsonb(new)-array['status','version','correction_cycle','assigned_team_id','assigned_operative_id','assigned_by','assigned_at',
 'assignment_action','target_date','correction_event_id','corrected_by','corrected_at','release_requested_at','released_by','released_at',
 'authority_acknowledgement','superseded_by','escalated','escalation_reason']) then raise exception 'Original hold findings are permanent' using errcode='42501'; end if;
 return new;
end $$;
create trigger permanent_hold_findings before update or delete on public.work_holds for each row execute function private.guard_hold_findings();
create trigger audit_hold after insert or update on public.work_holds for each row execute function private.audit_mutation();
create trigger audit_hold_event after insert on public.work_hold_events for each row execute function private.audit_mutation();
create trigger audit_hold_photo after insert or update on public.hold_photos for each row execute function private.audit_mutation();

create function private.check_hold_documents(p_hold public.work_holds,p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare d uuid;
begin
 if cardinality(p_ids)>12 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'Choose up to 12 distinct documents' using errcode='22023'; end if;
 foreach d in array p_ids loop
  if not exists(select 1 from public.document_revisions r where r.id=d and r.organisation_id=p_hold.organisation_id and r.contract_id=p_hold.contract_id
  and r.uploaded_at is not null and r.classification='operational' and private.can_read_document(r.contract_id,r.work_area_id,r.classification)
  and (r.work_area_id is null or private.hold_scopes_overlap(p_hold.work_area_id,r.work_area_id))) then
   raise exception 'Choose verified operational documents for the affected site and work' using errcode='22023'; end if;
 end loop;
end $$;
create function private.record_hold_event(p_hold public.work_holds,p_previous text,p_action text,p_note text,p_extra jsonb default '{}') returns bigint
language plpgsql security definer set search_path='' as $$
declare result bigint; label text;
begin
 insert into public.work_hold_events(hold_id,organisation_id,contract_id,actor_id,actor_name,action,note,previous_status,new_status,snapshot)
 values(p_hold.id,p_hold.organisation_id,p_hold.contract_id,auth.uid(),
 (select display_name from public.organisation_members where organisation_id=p_hold.organisation_id and user_id=auth.uid()),
 p_action,p_note,p_previous,p_hold.status,private.hold_json(p_hold)||p_extra) returning id into result;
 label:=case p_action when 'raise' then case p_hold.hold_type when 'safety' then 'Safety stop raised' else 'Quality hold raised' end
 when 'submit_correction' then 'Correction submitted' when 'request_release' then 'Release requested' when 'reject_release' then 'Release rejected'
 when 'release' then 'Hold released for specified work' when 'assign' then 'Corrective action assigned' when 'escalate' then 'Hold escalated'
 when 'supersede' then 'Hold superseded' when 'entered_in_error' then 'Hold recorded as entered in error' else null end;
 if label is not null then
  insert into public.hold_notifications(hold_id,event_id,organisation_id,contract_id,recipient_id,kind,title)
  select p_hold.id,result,p_hold.organisation_id,p_hold.contract_id,m.user_id,p_action,label
  from public.organisation_members m where m.organisation_id=p_hold.organisation_id and m.active and private.hold_member_can_read(p_hold.id,m.user_id);
 end if;
 return result;
end $$;
create function private.attach_hold_photos(p_hold public.work_holds,p_ids uuid[],p_purpose text,p_event bigint) returns void
language plpgsql security definer set search_path='' as $$
declare photo uuid; p public.hold_photos;
begin
 if cardinality(p_ids)>12 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'Choose up to 12 distinct photographs' using errcode='22023'; end if;
 foreach photo in array p_ids loop
  select * into p from public.hold_photos where id=photo for update;
  if not found or p.hold_id<>p_hold.id or p.purpose<>p_purpose or p.actor_id<>auth.uid() or p.uploaded_at is null or p.event_id is not null
   or p.correction_cycle<>p_hold.correction_cycle or not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path
    and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
   raise exception 'Attach verified photographs for this hold, purpose and correction cycle' using errcode='22023'; end if;
  update public.hold_photos set event_id=p_event where id=photo;
 end loop;
end $$;

create function public.create_work_hold(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; h public.work_holds; area public.work_areas; result uuid; src public.location_inspections;
 snag public.supervisor_issues; morning public.supervisor_inspections; docs uuid[]; pkg uuid; selected_stage text;
begin
 perform private.only_keys(p_data,array['contract_id','work_area_id','work_package_id','stage','activity','hold_type','category','severity','reason','required_action',
  'source_inspection_id','source_snag_id','source_morning_inspection_id','document_ids','evidence_explanation']);
 c:=private.field_uuid(p_data,'contract_id',true);
 if not private.can_supervise_contract(c) then raise exception 'Site supervision permission required to stop work' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tilespec-work-release:'||c::text,0));
 result:=private.request_result(org,'create_work_hold',p_request_key,p_data); if result is not null then return result; end if;
 if private.field_uuid(p_data,'work_area_id') is not null then
  select * into area from public.work_areas where id=private.field_uuid(p_data,'work_area_id') and contract_id=c and organisation_id=org for share;
  if not found or area.archived_at is not null then raise exception 'Choose an active location on this site' using errcode='22023'; end if;
 end if;
 pkg:=private.field_uuid(p_data,'work_package_id'); selected_stage:=private.field_text(p_data,'stage',30);
 if selected_stage is not null then perform private.assert_choice(selected_stage,'stage',private.installation_stages()); end if;
 if pkg is not null and (area.id is null or not exists(select 1 from public.work_packages p join public.work_areas a on a.id=p.work_area_id
  where p.id=pkg and p.contract_id=c and p.organisation_id=org and area.path_ids @> array[a.id])) then
  raise exception 'Choose a work package within the affected location branch' using errcode='22023'; end if;
 if private.field_uuid(p_data,'source_inspection_id') is not null then
  select * into src from public.location_inspections where id=private.field_uuid(p_data,'source_inspection_id');
  if not found or src.organisation_id<>org or src.contract_id<>c
   or (src.issues_count=0 and not exists(select 1 from jsonb_array_elements(src.answers) a where
    (coalesce((a->>'mandatory')::boolean,false) or coalesce((a->>'hold_point')::boolean,false)) and a->>'status'<>'pass'))
   or not private.hold_scopes_overlap(area.id,src.work_area_id)
   or (selected_stage is not null and not exists(select 1 from public.location_inspection_templates where id=src.template_id and stage::text=selected_stage)) then
   raise exception 'Link a failed inspection inside the affected site, branch and stage' using errcode='22023'; end if;
 end if;
 if private.field_uuid(p_data,'source_snag_id') is not null then
  select * into snag from public.supervisor_issues where id=private.field_uuid(p_data,'source_snag_id');
  if not found or snag.organisation_id<>org or snag.contract_id<>c or snag.snag_status in ('draft','closed','cancelled') or snag.snag_status is null
   or not private.can_read_snag(snag.id) or not private.hold_scopes_overlap(area.id,snag.work_area_id) or (selected_stage is not null and snag.stage::text<>selected_stage) then
   raise exception 'Link an unresolved snag inside the affected site, branch and stage' using errcode='22023'; end if;
 end if;
 if private.field_uuid(p_data,'source_morning_inspection_id') is not null then
  select * into morning from public.supervisor_inspections where id=private.field_uuid(p_data,'source_morning_inspection_id');
  if not found or morning.organisation_id<>org or morning.contract_id<>c or morning.issues_count=0 then raise exception 'Link a morning check with findings on this site' using errcode='22023'; end if;
 end if;
 perform private.assert_choice(private.field_text(p_data,'hold_type',20,true),'hold type',array['quality','safety']);
 perform private.assert_choice(private.field_text(p_data,'severity',20,true),'severity',array['major','critical']);
 docs:=private.field_uuids(p_data,'document_ids',12);
 h.id:=gen_random_uuid(); h.organisation_id:=org; h.contract_id:=c; h.work_area_id:=area.id; h.work_package_id:=pkg;
 perform private.check_hold_documents(h,docs);
 insert into public.work_holds(id,organisation_id,contract_id,work_area_id,work_package_id,stage,activity,location_path,hold_type,category,severity,
 reason,required_action,raised_by,raised_by_name,source_inspection_id,source_snag_id,source_morning_inspection_id,original_document_ids,evidence_explanation)
 values(h.id,org,c,area.id,pkg,selected_stage::public.installation_stage,private.field_text(p_data,'activity',200),
 coalesce(array(select w.name from unnest(area.path_ids) with ordinality x(id,n) join public.work_areas w on w.id=x.id order by n),'{}'),
 p_data->>'hold_type',private.field_text(p_data,'category',100,true),p_data->>'severity',private.field_text(p_data,'reason',2000,true),
 private.field_text(p_data,'required_action',2000,true),auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),
 src.id,snag.id,morning.id,docs,private.field_text(p_data,'evidence_explanation',2000)) returning * into h;
 perform private.record_hold_event(h,null,'raise',h.reason,jsonb_build_object('document_ids',docs));
 perform private.record_request(org,'create_work_hold',p_request_key,p_data,h.id); return h.id;
end $$;

create function public.transition_work_hold(p_hold uuid,p_request_key uuid,p_version integer,p_action text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare h public.work_holds; original public.work_holds; successor public.work_holds; previous text; payload jsonb; result uuid;
 note text; ids uuid[]; docs uuid[]; event bigint; extra jsonb:='{}'; purpose text; explanation text; reviewed jsonb; completed timestamptz;
begin
 perform private.only_keys(p_data,array['note','photo_ids','document_ids','team_id','operative_id','target_date','required_action','completed_at','evidence_explanation',
 'successor_id','authority_name','authority_role','authority_reference','authority_acknowledged_at']);
 select * into h from public.work_holds where id=p_hold;
 if not found or not private.can_read_work_hold(h.id) then raise exception 'Hold unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tilespec-work-release:'||h.contract_id::text,0));
 select * into h from public.work_holds where id=p_hold for update;
 payload:=jsonb_build_object('hold',p_hold,'version',p_version,'action',p_action,'data',p_data);
 result:=private.request_result(h.organisation_id,'transition_work_hold',p_request_key,payload); if result is not null then return result; end if;
 if p_version is null or p_version<>h.version then raise exception 'Hold changed; refresh before deciding' using errcode='40001'; end if;
 if h.status in ('released','superseded','entered_in_error') then raise exception 'This hold has a permanent final decision; raise a new linked hold for new findings' using errcode='22023'; end if;
 note:=private.field_text(p_data,'note',2000,true); if length(note)<5 then raise exception 'Explain this decision in at least five characters' using errcode='22023'; end if;
 ids:=private.field_uuids(p_data,'photo_ids',12); docs:=private.field_uuids(p_data,'document_ids',12);
 perform private.check_hold_documents(h,docs); previous:=h.status; original:=h;
 extra:=jsonb_build_object('document_ids',docs,'photo_ids',ids);
 case p_action
 when 'add_original_evidence' then
  if not private.can_supervise_contract(h.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  explanation:=private.field_text(p_data,'evidence_explanation',2000);
  if cardinality(ids)+cardinality(docs)=0 and coalesce(length(explanation),0)<5 then raise exception 'Add original evidence or a documented explanation' using errcode='22023'; end if;
  purpose:='original'; extra:=extra||jsonb_build_object('evidence_explanation',explanation);
 when 'assign' then
  if not private.can_supervise_contract(h.contract_id) or h.status<>'active' then raise exception 'Active hold and site supervision permission required' using errcode='42501'; end if;
  h.assigned_team_id:=private.field_uuid(p_data,'team_id'); h.assigned_operative_id:=private.field_uuid(p_data,'operative_id');
  if (h.assigned_team_id is null)=(h.assigned_operative_id is null) then raise exception 'Assign one gang or one operative' using errcode='22023'; end if;
  if h.assigned_team_id is not null and not exists(select 1 from public.teams where id=h.assigned_team_id and organisation_id=h.organisation_id and active) then
   raise exception 'Choose an active gang in this organisation' using errcode='22023'; end if;
  if h.assigned_operative_id is not null and not exists(select 1 from public.operatives where id=h.assigned_operative_id and organisation_id=h.organisation_id and status='active') then
   raise exception 'Choose an active operative in this organisation' using errcode='22023'; end if;
  h.assignment_action:=private.field_text(p_data,'required_action',2000,true); h.target_date:=private.field_date(p_data,'target_date',true);
  h.assigned_by:=auth.uid(); h.assigned_at:=now();
 when 'submit_correction' then
  if h.status<>'active' or (h.assigned_team_id is null and h.assigned_operative_id is null) or not private.is_hold_corrector(h.id) then
   raise exception 'Assigned corrective party or site supervisor required for an active hold' using errcode='42501'; end if;
  if cardinality(ids)+cardinality(docs)=0 then raise exception 'Verified correction photographs or documents required' using errcode='22023'; end if;
  completed:=private.field_timestamp(p_data,'completed_at');
  if completed is null or completed>now() or completed<h.raised_at then raise exception 'Record a completion time after the hold was raised and no later than now' using errcode='22023'; end if;
  h.status:='correction_submitted'; h.corrected_by:=auth.uid(); h.corrected_at:=completed;
  extra:=extra||jsonb_build_object('completed_at',completed,'submitted_at',now(),'assigned_team_id',h.assigned_team_id,'assigned_operative_id',h.assigned_operative_id);
  purpose:='correction';
 when 'request_release' then
  if h.status<>'correction_submitted' or not private.is_hold_corrector(h.id) then raise exception 'Submitted corrective action and authorised party required' using errcode='42501'; end if;
  if not (cardinality(h.original_document_ids)>0 or coalesce(length(h.evidence_explanation),0)>=5
    or exists(select 1 from public.hold_photos p where p.hold_id=h.id and p.purpose='original' and p.uploaded_at is not null and p.event_id is not null)
    or exists(select 1 from public.work_hold_events e where e.hold_id=h.id and e.action='add_original_evidence'
     and (coalesce(length(e.snapshot->>'evidence_explanation'),0)>=5 or jsonb_array_length(coalesce(e.snapshot->'document_ids','[]'))>0))) then
   raise exception 'Record original evidence or a documented explanation before requesting release' using errcode='23514'; end if;
  h.status:='awaiting_release'; h.release_requested_at:=now();
 when 'reject_release' then
  if h.status<>'awaiting_release' or not private.can_manage_contract(h.contract_id) then raise exception 'Office review permission and a release request required' using errcode='42501'; end if;
  purpose:='release'; h.status:='active'; h.correction_cycle:=h.correction_cycle+1;
  h.correction_event_id:=null; h.corrected_by:=null; h.corrected_at:=null; h.release_requested_at:=null;
 when 'release' then
  if h.status<>'awaiting_release' or not private.can_manage_contract(h.contract_id) or h.raised_by=auth.uid()
    or exists(select 1 from public.work_hold_events e where e.hold_id=h.id and e.action='submit_correction' and e.actor_id=auth.uid()) then
   raise exception 'An independent office reviewer who did not raise or submit correction is required' using errcode='42501'; end if;
  reviewed:=private.assert_hold_requirements(h.contract_id,h.work_area_id,h.stage::text,h.work_package_id,h.corrected_at);
  if exists(select 1 from public.supervisor_issues i where i.contract_id=h.contract_id and i.organisation_id=h.organisation_id
   and i.snag_status not in ('draft','closed','cancelled') and (i.id=h.source_snag_id or (i.severity='critical'
   and private.hold_scopes_overlap(i.work_area_id,h.work_area_id) and (h.stage is null or i.stage=h.stage)
   and (h.work_package_id is null or i.work_package_id is null or i.work_package_id=h.work_package_id)))) then
   raise exception 'Resolve the linked snag and all critical snags affecting this work before release' using errcode='23514'; end if;
  if h.source_inspection_id is not null and not exists(
   select 1 from public.location_inspections source join public.location_inspections latest on latest.contract_id=source.contract_id and latest.work_area_id=source.work_area_id
   join public.location_inspection_templates lt on lt.id=latest.template_id join public.location_inspection_templates st on st.id=source.template_id
   where source.id=h.source_inspection_id and latest.created_at>=h.corrected_at and latest.issues_count=0 and lt.stage=st.stage
   and exists(with recursive chain as (select id,supersedes_id from public.location_inspection_templates where id=latest.template_id
    union all select t.id,t.supersedes_id from public.location_inspection_templates t join chain on chain.supersedes_id=t.id)
    select 1 from chain where id=source.template_id)
   and not exists(select 1 from public.location_inspections newer join public.location_inspection_templates nt on nt.id=newer.template_id
    where newer.work_area_id=source.work_area_id and newer.contract_id=source.contract_id and nt.stage=st.stage and newer.created_at>latest.created_at and newer.issues_count>0)) then
   raise exception 'The linked failed inspection needs a saved passing reinspection after corrective work' using errcode='23514'; end if;
  if h.source_morning_inspection_id is not null and exists(select 1 from public.supervisor_issues i where i.inspection_id=h.source_morning_inspection_id and i.state<>'closed') then
   raise exception 'Resolve outstanding issues linked to the morning finding before release' using errcode='23514'; end if;
  if h.hold_type='safety' then
   completed:=private.field_timestamp(p_data,'authority_acknowledged_at');
   if completed is null or completed>now() or completed<h.corrected_at then raise exception 'Record site-safety authority acknowledgement after corrective work' using errcode='23514'; end if;
   h.authority_acknowledgement:=jsonb_build_object('name',private.field_text(p_data,'authority_name',160,true),
    'role',private.field_text(p_data,'authority_role',160,true),'reference',private.field_text(p_data,'authority_reference',2000,true),
    'acknowledged_at',completed,'recorded_by',auth.uid(),'recorded_at',now());
   if length(h.authority_acknowledgement->>'reference')<5 then raise exception 'Describe the principal-contractor or designated authority authorisation' using errcode='22023'; end if;
  end if;
  h.status:='released'; h.released_by:=auth.uid(); h.released_at:=now(); purpose:='release';
  extra:=extra||jsonb_build_object('mandatory_review',reviewed,'authorisation','Independent office release for this scope only; principal-contractor controls continue to apply');
 when 'escalate' then
  if not private.can_supervise_contract(h.contract_id) then raise exception 'Site supervision permission required' using errcode='42501'; end if;
  h.escalated:=true; h.escalation_reason:=note;
 when 'supersede' then
  if not private.can_manage_contract(h.contract_id) or h.raised_by=auth.uid()
   or exists(select 1 from public.work_hold_events where hold_id=h.id and action='submit_correction' and actor_id=auth.uid()) then
   raise exception 'Independent office decision required' using errcode='42501'; end if;
  select * into successor from public.work_holds where id=private.field_uuid(p_data,'successor_id',true) for update;
  if not found or successor.id=h.id or successor.contract_id<>h.contract_id or successor.organisation_id<>h.organisation_id
    or successor.status in ('released','superseded','entered_in_error') or (h.hold_type='safety' and successor.hold_type<>'safety')
    or (successor.work_area_id is not null and (h.work_area_id is null or not exists(select 1 from public.work_areas where id=h.work_area_id and path_ids @> array[successor.work_area_id])))
    or (successor.stage is not null and (h.stage is null or successor.stage<>h.stage))
    or (successor.work_package_id is not null and (h.work_package_id is null or h.work_package_id<>successor.work_package_id)) then
   raise exception 'The successor must be an active hold covering this entire scope and safety restriction' using errcode='22023'; end if;
  h.status:='superseded'; h.superseded_by:=successor.id; extra:=extra||jsonb_build_object('successor',successor.id);
 when 'entered_in_error' then
  if not private.can_manage_contract(h.contract_id) or h.raised_by=auth.uid()
   or exists(select 1 from public.work_hold_events where hold_id=h.id and action='submit_correction' and actor_id=auth.uid()) then
   raise exception 'Independent office decision required to record an error' using errcode='42501'; end if;
  h.status:='entered_in_error'; extra:=extra||jsonb_build_object('authorisation','Independent recorded decision; mandatory requirements and other holds remain effective');
 else raise exception 'Unknown hold action' using errcode='22023';
 end case;
 -- Photos refer to the pre-decision cycle (rejection increments the next cycle).
 h.version:=h.version+1;
 event:=private.record_hold_event(h,previous,p_action,note,extra);
 if purpose is not null then perform private.attach_hold_photos(original,ids,purpose,event);
 elsif cardinality(ids)>0 then raise exception 'Photographs are not supported for this action' using errcode='22023'; end if;
 if p_action='submit_correction' then h.correction_event_id:=event; end if;
 update public.work_holds set status=h.status,version=h.version,correction_cycle=h.correction_cycle,
 assigned_team_id=h.assigned_team_id,assigned_operative_id=h.assigned_operative_id,assigned_by=h.assigned_by,assigned_at=h.assigned_at,
 assignment_action=h.assignment_action,target_date=h.target_date,correction_event_id=h.correction_event_id,corrected_by=h.corrected_by,corrected_at=h.corrected_at,
 release_requested_at=h.release_requested_at,released_by=h.released_by,released_at=h.released_at,authority_acknowledgement=h.authority_acknowledgement,
 superseded_by=h.superseded_by,escalated=h.escalated,escalation_reason=h.escalation_reason where id=h.id;
 perform private.record_request(h.organisation_id,'transition_work_hold',p_request_key,payload,h.id); return h.id;
end $$;

create function public.reserve_hold_photo(p_hold uuid,p_request_key uuid,p_purpose text,p_meta jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare h public.work_holds; result uuid; payload jsonb; mime text; hash text; size integer;
begin
 perform private.only_keys(p_meta,array['mime_type','sha256','bytes']);
 select * into h from public.work_holds where id=p_hold for share;
 if not found or not private.can_upload_hold_photo(h.id,p_purpose) then raise exception 'Hold photograph permission required' using errcode='42501'; end if;
 payload:=jsonb_build_object('hold',p_hold,'purpose',p_purpose,'meta',p_meta,'cycle',h.correction_cycle);
 result:=private.request_result(h.organisation_id,'reserve_hold_photo',p_request_key,payload); if result is not null then return result; end if;
 mime:=private.field_text(p_meta,'mime_type',30,true); hash:=private.field_text(p_meta,'sha256',64,true); size:=private.field_integer(p_meta,'bytes',1,4194304);
 if mime not in ('image/jpeg','image/png') or hash !~ '^[0-9a-f]{64}$' or size is null then raise exception 'Choose a JPEG or PNG up to 4 MB with its exact hash' using errcode='22023'; end if;
 result:=gen_random_uuid();
 insert into public.hold_photos(id,hold_id,organisation_id,contract_id,actor_id,purpose,correction_cycle,object_path,sha256,bytes,mime_type)
 values(result,h.id,h.organisation_id,h.contract_id,auth.uid(),p_purpose,h.correction_cycle,
 h.organisation_id::text||'/holds/'||h.id::text||'/'||result::text||case mime when 'image/png' then '.png' else '.jpg' end,hash,size,mime);
 perform private.record_request(h.organisation_id,'reserve_hold_photo',p_request_key,payload,result); return result;
end $$;
create function public.complete_hold_photo(p_photo uuid,p_actor uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.hold_photos; claims text; sub text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted server verification required' using errcode='42501'; end if;
 select * into p from public.hold_photos where id=p_photo for update;
 if not found or p.actor_id is distinct from p_actor or p.sha256 is distinct from p_sha256 then raise exception 'Verified actor and bytes must match the reservation' using errcode='42501'; end if;
 claims:=current_setting('request.jwt.claims',true); sub:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_actor)::text,true); perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if not private.can_upload_hold_photo(p.hold_id,p.purpose) or not exists(select 1 from public.work_holds h where h.id=p.hold_id and h.correction_cycle=p.correction_cycle) then
  raise exception 'Uploader no longer has permission for this correction cycle' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
  raise exception 'Stored photograph does not match the reservation' using errcode='23514'; end if;
 if p.uploaded_at is null then update public.hold_photos set uploaded_at=now() where id=p.id; end if;
 perform set_config('request.jwt.claims',coalesce(claims,''),true); perform set_config('request.jwt.claim.sub',coalesce(sub,''),true);
end $$;

-- All critical-snag changes share the contract release lock. The original 3B
-- implementation remains unchanged and cannot be called directly by clients.
alter function public.transition_snag(uuid,uuid,integer,text,jsonb) set schema private;
alter function private.transition_snag(uuid,uuid,integer,text,jsonb) rename to phase3b_transition_snag;
revoke all on function private.phase3b_transition_snag(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
create function public.transition_snag(p_issue uuid,p_request_key uuid,p_version integer,p_action text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 select contract_id into c from public.supervisor_issues where id=p_issue and private.can_read_snag(id);
 if c is null then raise exception 'Snag unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tilespec-work-release:'||c::text,0));
 return private.phase3b_transition_snag(p_issue,p_request_key,p_version,p_action,p_data);
end $$;

create function private.hold_json(p_hold public.work_holds) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(p_hold)||jsonb_build_object('created_at',p_hold.raised_at,'raised_name',p_hold.raised_by_name,'correction_submitted_by',p_hold.corrected_by,
 'contract_name',(select name from public.contracts where id=p_hold.contract_id),
 'contract_reference',(select reference from public.contracts where id=p_hold.contract_id),
 'work_package_name',(select name from public.work_packages where id=p_hold.work_package_id),
 'assigned_team_name',(select name from public.teams where id=p_hold.assigned_team_id),
 'assigned_operative_name',(select display_name from public.operatives where id=p_hold.assigned_operative_id),
 'overdue',p_hold.target_date<private.site_today() and p_hold.status not in ('released','superseded','entered_in_error'))
$$;
create function private.hold_scope_requirements(p_contract uuid,p_area uuid,p_stage text,p_package uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare area uuid; stage text; result jsonb; requirements jsonb:='[]'; scopes jsonb:='[]'; blockers jsonb:='[]';
 checked integer:=0; configured boolean:=true; passed boolean:=true; failed boolean:=false;
begin
 for area in select w.id from public.work_areas w where w.contract_id=p_contract and w.organisation_id=private.current_org() and w.archived_at is null
 and (p_area is null or w.path_ids @> array[p_area])
 and not exists(select 1 from public.work_areas child where child.parent_id=w.id and child.archived_at is null)
 and (p_package is null or exists(select 1 from public.work_packages p where p.id=p_package and p.contract_id=p_contract and p.work_area_id=any(w.path_ids))) loop
  foreach stage in array (case when p_stage is null then private.installation_stages() else array[p_stage] end) loop
   result:=private.mandatory_work_requirements(p_contract,area,p_package,stage); checked:=checked+1;
   configured:=configured and (result->>'configured')::boolean; passed:=passed and (result->>'passed')::boolean; failed:=failed or (result->>'failed')::boolean;
   requirements:=requirements||(result->'requirements'); blockers:=blockers||(result->'blockers');
   scopes:=scopes||jsonb_build_array(jsonb_build_object('work_area_id',area,'location_path',array(select w.name from public.work_areas target join unnest(target.path_ids) with ordinality x(id,n) on true join public.work_areas w on w.id=x.id where target.id=area order by n),'stage',stage,'requirements',result));
  end loop;
 end loop;
 return jsonb_build_object('configured',checked>0 and configured,'unknown',checked=0 or not configured,'passed',checked>0 and passed,
 'failed',failed,'requirements',requirements,'blockers',blockers,'scopes',scopes);
end $$;
create function private.derive_work_release(p_contract uuid,p_area uuid,p_stage text,p_package uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare requirements jsonb; holds jsonb; state text; decision jsonb; critical boolean;
begin
 requirements:=private.hold_scope_requirements(p_contract,p_area,p_stage,p_package);
 select coalesce(jsonb_agg(private.hold_json(h) order by (h.hold_type='safety') desc,h.raised_at,h.id),'[]') into holds
 from public.work_holds h where h.organisation_id=private.current_org() and h.contract_id=p_contract
 and h.status not in ('released','superseded','entered_in_error') and private.hold_scopes_overlap(h.work_area_id,p_area)
 and (p_stage is null or h.stage is null or h.stage::text=p_stage)
 and (p_package is null or h.work_package_id is null or h.work_package_id=p_package);
 select exists(select 1 from public.supervisor_issues i where i.organisation_id=private.current_org() and i.contract_id=p_contract
 and i.severity='critical' and i.snag_status not in ('draft','closed','cancelled') and private.hold_scopes_overlap(i.work_area_id,p_area)
 and (p_stage is null or i.stage::text=p_stage) and (p_package is null or i.work_package_id is null or i.work_package_id=p_package)) into critical;
 select jsonb_build_object('hold_id',h.id,'reviewer',h.released_by,'reviewer_name',e.actor_name,'at',h.released_at,'scope',private.hold_json(h),
 'note',e.note,'authority_acknowledgement',h.authority_acknowledgement) into decision
 from public.work_holds h join public.organisation_members m on m.organisation_id=h.organisation_id and m.user_id=h.released_by
 join public.work_hold_events e on e.hold_id=h.id and e.action='release'
 where h.organisation_id=private.current_org() and h.contract_id=p_contract and h.status='released'
 and (h.work_area_id is null or exists(select 1 from public.work_areas a where a.id=p_area and a.path_ids @> array[h.work_area_id]))
 and (h.stage is null or (p_stage is not null and h.stage::text=p_stage))
 and (h.work_package_id is null or h.work_package_id=p_package)
 and not exists(select 1 from jsonb_array_elements(requirements->'scopes') current_scope where not exists(
   select 1 from jsonb_array_elements(coalesce(e.snapshot->'mandatory_review'->'scopes','[]')) saved_scope
   where saved_scope->>'work_area_id'=current_scope->>'work_area_id' and saved_scope->>'stage'=current_scope->>'stage'
   and (select coalesce(jsonb_agg(r->>'id' order by r->>'id'),'[]') from jsonb_array_elements(current_scope->'requirements'->'requirements') r)
     = (select coalesce(jsonb_agg(r->>'id' order by r->>'id'),'[]') from jsonb_array_elements(saved_scope->'requirements'->'requirements') r)))
 order by h.released_at desc,h.id limit 1;
 if exists(select 1 from jsonb_array_elements(holds) h where h->>'hold_type'='safety') then state:='stopped_safety';
 elsif exists(select 1 from jsonb_array_elements(holds) h where h->>'status' in ('active','correction_submitted')) or critical or (requirements->>'failed')::boolean then state:='blocked_quality';
 elsif jsonb_array_length(holds)>0 then state:='awaiting_release';
 elsif (requirements->>'unknown')::boolean then state:='not_assessed';
 elsif not (requirements->>'passed')::boolean then state:='awaiting_inspection';
 elsif decision is null then state:='not_assessed';
 else state:='released'; end if;
 -- Applicability approval is not permission to proceed: a current independent
 -- office release decision covering the specified work is always required.
 return jsonb_build_object('status',state,'authorised',state='released','holds',holds,'requirements',requirements,
 'release',decision,'critical_snags_blocking',critical,
 'authorisation_basis',case when state='released' then 'Saved independent office hold release and current mandatory inspection requirements; principal-contractor controls continue to apply' else null end,
 'reason',case when state='not_assessed' and (requirements->>'passed')::boolean then 'No work-release authorisation recorded' when state='not_assessed' then 'Inspection applicability has not been assessed' else null end);
end $$;
create function public.work_release_status(p_contract uuid,p_area uuid,p_stage text,p_package uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; safe_holds jsonb;
begin
 if not private.can_access_contract(p_contract) or (p_stage is not null and p_stage<>all(private.installation_stages()))
 or (p_area is not null and not exists(select 1 from public.work_areas where id=p_area and contract_id=p_contract and organisation_id=private.current_org())) then
  raise exception 'Work scope unavailable' using errcode='42501'; end if;
 if not private.can_supervise_contract(p_contract) and (p_area is null or not exists(select 1 from public.package_assignments pa
  join public.work_packages p on p.id=pa.work_package_id join public.work_areas target on target.id=p_area
  where pa.user_id=auth.uid() and pa.contract_id=p_contract and target.path_ids @> array[p.work_area_id]
  and (p_package is null or p.id=p_package))) then raise exception 'Work location permission required' using errcode='42501'; end if;
 if p_package is not null and not exists(select 1 from public.work_packages p join public.work_areas target on target.id=p_area
  where p.id=p_package and p.contract_id=p_contract and p.organisation_id=private.current_org() and p.work_area_id=any(target.path_ids)) then
  raise exception 'Work package does not cover this location' using errcode='22023'; end if;
 result:=private.derive_work_release(p_contract,p_area,p_stage,p_package);
 if not private.can_supervise_contract(p_contract) then
  select coalesce(jsonb_agg(h),'[]') into safe_holds from jsonb_array_elements(result->'holds') h where private.can_read_work_hold((h->>'id')::uuid);
  result:=result||jsonb_build_object('holds',safe_holds,'requirements',(result->'requirements')-'requirements'-'scopes','release',case when result->'release'='null' then 'null'::jsonb else (result->'release')-'scope' end);
 end if;
 return result;
end $$;

-- Raw snapshots include scope-wide mandatory review records. Keep them behind
-- a checked staff projection; installers see their hold's lifecycle only.
revoke select on public.work_hold_events from authenticated;
grant select(id,hold_id,organisation_id,contract_id,actor_id,actor_name,action,note,previous_status,new_status,created_at) on public.work_hold_events to authenticated;
create function public.hold_context(p_hold uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare h public.work_holds; staff boolean; events jsonb; overlapping jsonb; snags jsonb; inspections jsonb; docs jsonb; requirements jsonb;
begin
 if not private.can_read_work_hold(p_hold) then raise exception 'Hold unavailable' using errcode='42501'; end if;
 select * into h from public.work_holds where id=p_hold; staff:=private.can_supervise_contract(h.contract_id);
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('snapshot',case when staff then e.snapshot else
  e.snapshot-array['mandatory_review','document_ids','original_document_ids'] end) order by e.id),'[]') into events from public.work_hold_events e where e.hold_id=h.id;
 select coalesce(jsonb_agg(private.hold_json(o) order by o.raised_at,o.id),'[]') into overlapping from public.work_holds o
 where o.contract_id=h.contract_id and o.id<>h.id and o.status not in ('released','superseded','entered_in_error')
 and private.can_read_work_hold(o.id) and private.hold_scopes_overlap(h.work_area_id,o.work_area_id)
 and (h.stage is null or o.stage is null or h.stage=o.stage) and (h.work_package_id is null or o.work_package_id is null or h.work_package_id=o.work_package_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'description',i.description,'severity',i.severity,'snag_status',i.snag_status,
 'stage',i.stage,'location_path',i.location_path) order by i.created_at desc),'[]') into snags from public.supervisor_issues i
 where i.contract_id=h.contract_id and i.snag_status not in ('draft','cancelled') and private.can_read_snag(i.id)
 and private.hold_scopes_overlap(h.work_area_id,i.work_area_id) and (h.stage is null or i.stage=h.stage)
 and (h.work_package_id is null or i.work_package_id is null or h.work_package_id=i.work_package_id);
 select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('title',t.title,'stage',t.stage,'specification_reference',t.specification_reference,'specification_revision',t.specification_revision) order by i.created_at desc),'[]') into inspections
 from public.location_inspections i join public.location_inspection_templates t on t.id=i.template_id
 where staff and i.contract_id=h.contract_id and private.hold_scopes_overlap(h.work_area_id,i.work_area_id) and (h.stage is null or t.stage=h.stage);
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'revision',d.revision,'document_reference',d.document_reference,'created_at',d.created_at) order by d.document_reference,d.revision desc),'[]') into docs
 from public.document_revisions d where d.contract_id=h.contract_id and d.uploaded_at is not null and d.classification='operational'
 and private.can_read_document(d.contract_id,d.work_area_id,d.classification) and private.hold_scopes_overlap(h.work_area_id,d.work_area_id);
 requirements:=private.hold_scope_requirements(h.contract_id,h.work_area_id,h.stage::text,h.work_package_id);
 if not staff then requirements:=requirements-'requirements'-'scopes'; end if;
 return jsonb_build_object('hold',private.hold_json(h),'permissions',jsonb_build_object('supervise',staff,'office',private.can_manage_contract(h.contract_id),
 'correct',private.is_hold_corrector(h.id),'release',private.can_manage_contract(h.contract_id) and h.raised_by<>auth.uid()
 and not exists(select 1 from public.work_hold_events e where e.hold_id=h.id and e.action='submit_correction' and e.actor_id=auth.uid())),
 'events',events,'overlapping_holds',overlapping,'related_snags',snags,'inspections',inspections,'documents',docs,'requirements',requirements,
 'release_status',case when staff then private.derive_work_release(h.contract_id,h.work_area_id,h.stage::text,h.work_package_id) else
 (private.derive_work_release(h.contract_id,h.work_area_id,h.stage::text,h.work_package_id)-'requirements'-'release'-'holds')||jsonb_build_object('requirements',requirements,'holds',overlapping) end);
end $$;

create function public.hold_notifications(p_contract uuid default null,p_unread_only boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 with scoped as (
 select n.id,n.hold_id,n.event_id,n.kind,n.title,n.created_at,n.contract_id,h.work_area_id,h.hold_type,h.status,r.read_at,
 h.location_path,c.name as contract_name,c.reference as contract_reference
 from public.hold_notifications n join public.work_holds h on h.id=n.hold_id join public.contracts c on c.id=n.contract_id
 left join public.hold_notification_reads r on r.notification_id=n.id and r.user_id=auth.uid()
 where n.recipient_id=auth.uid() and n.organisation_id=private.current_org() and private.can_read_work_hold(n.hold_id)
 and (p_contract is null or n.contract_id=p_contract)
 ), page as (select * from scoped where not p_unread_only or read_at is null order by created_at desc,id desc limit 100)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from page p),'unread',(select count(*) from scoped where read_at is null),
 'total',(select count(*) from scoped where not p_unread_only or read_at is null)) into result;
 return result;
end $$;
create function public.mark_hold_notification_read(p_notification bigint,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare n public.hold_notifications; result uuid; payload jsonb:=jsonb_build_object('notification',p_notification);
begin
 select * into n from public.hold_notifications where id=p_notification and recipient_id=auth.uid() and organisation_id=private.current_org();
 if not found or not private.can_read_work_hold(n.hold_id) then raise exception 'Notification unavailable' using errcode='42501'; end if;
 result:=private.request_result(n.organisation_id,'mark_hold_notification_read',p_request_key,payload); if result is not null then return result; end if;
 insert into public.hold_notification_reads(notification_id,user_id) values(n.id,auth.uid()) on conflict do nothing;
 perform private.record_request(n.organisation_id,'mark_hold_notification_read',p_request_key,payload,n.hold_id); return n.hold_id;
end $$;

create function public.hold_register(p_filters jsonb default '{}',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; c uuid; filter_location uuid; team uuid; selected_stage text; selected_status text; selected_type text; search text;
 overdue_only boolean; rejected_only boolean; work_state text;
begin
 perform private.only_keys(p_filters,array['contract_id','location_id','team_id','stage','status','hold_type','type','search','overdue','rejected','work_status']);
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Choose a valid page' using errcode='22023'; end if;
 c:=private.field_uuid(p_filters,'contract_id'); filter_location:=private.field_uuid(p_filters,'location_id'); team:=private.field_uuid(p_filters,'team_id');
 selected_stage:=private.field_text(p_filters,'stage',30); selected_status:=private.field_text(p_filters,'status',40);
 selected_type:=coalesce(private.field_text(p_filters,'hold_type',20),private.field_text(p_filters,'type',20)); search:=private.field_text(p_filters,'search',200);
 overdue_only:=coalesce(private.field_boolean(p_filters,'overdue'),false); rejected_only:=coalesce(private.field_boolean(p_filters,'rejected'),false);
 work_state:=private.field_text(p_filters,'work_status',40);
 with scope as materialized (
 select h.*,exists(select 1 from public.work_hold_events e where e.hold_id=h.id and e.action='reject_release') as has_rejection,
 h.target_date<private.site_today() and h.status not in ('released','superseded','entered_in_error') as overdue
 from public.work_holds h where h.organisation_id=private.current_org() and private.can_read_work_hold(h.id) and (c is null or h.contract_id=c)
 ), filtered as materialized (
 select * from scope h where (filter_location is null or private.hold_scopes_overlap(h.work_area_id,filter_location))
 and (team is null or h.assigned_team_id=team) and (selected_stage is null or h.stage is null or h.stage::text=selected_stage)
 and (selected_status is null or h.status=selected_status) and (selected_type is null or h.hold_type=selected_type)
 and (not overdue_only or h.overdue) and (not rejected_only or h.has_rejection and h.status not in ('released','superseded','entered_in_error'))
 and (search is null or to_tsvector('simple',h.reason||' '||h.category||' '||h.required_action) @@ plainto_tsquery('simple',search))
 ), page as (
 select h from public.work_holds h join filtered f on f.id=h.id order by (h.hold_type='safety') desc,h.raised_at desc,h.id limit 50 offset p_page*50
 ), work_scopes as materialized (
 select w.id as work_area_id,w.contract_id,w.path_ids,
 array(select a.name from unnest(w.path_ids) with ordinality x(id,n) join public.work_areas a on a.id=x.id order by n) as location_path,
 stages.stage from public.work_areas w cross join unnest(private.installation_stages()) stages(stage)
 where w.organisation_id=private.current_org() and w.archived_at is null and private.can_supervise_contract(w.contract_id)
 and (c is null or w.contract_id=c) and (filter_location is null or w.path_ids @> array[filter_location])
 and not exists(select 1 from public.work_areas child where child.parent_id=w.id and child.archived_at is null)
 and (selected_stage is null or stages.stage=selected_stage)
 and (team is null or exists(select 1 from public.actual_allocations a where a.contract_id=w.contract_id and a.team_id=team and a.voided_at is null
   and w.path_ids @> array[a.work_area_id] and a.stage::text=stages.stage)
   or exists(select 1 from filtered h where h.assigned_team_id=team and h.contract_id=w.contract_id and private.hold_scopes_overlap(h.work_area_id,w.id)
     and (h.stage is null or h.stage::text=stages.stage)))
 and ((selected_status is null and selected_type is null and not overdue_only and not rejected_only and search is null)
   or exists(select 1 from filtered h where h.contract_id=w.contract_id and private.hold_scopes_overlap(h.work_area_id,w.id) and (h.stage is null or h.stage::text=stages.stage)))
 ), derived as materialized (
 select s.*,private.derive_work_release(s.contract_id,s.work_area_id,s.stage,null) as release_status from work_scopes s
 ), work_filtered as materialized (
 select d.*,d.release_status->>'status' as status,(d.release_status->>'authorised')::boolean as authorised from derived d
 where work_state is null or d.release_status->>'status'=work_state
 ), work_page as (
 select * from work_filtered order by contract_id,location_path,stage limit 200
 ) select jsonb_build_object('rows',(select coalesce(jsonb_agg(private.hold_json((p.h)::public.work_holds)),'[]') from page p),
 'total',(select count(*) from filtered),
 'counts',jsonb_build_object('active_quality',(select count(*) from filtered where hold_type='quality' and status not in ('released','superseded','entered_in_error')),
 'active_safety',(select count(*) from filtered where hold_type='safety' and status not in ('released','superseded','entered_in_error')),
 'awaiting_release',(select count(*) from filtered where status='awaiting_release'),'overdue',(select count(*) from filtered where overdue),
 'rejected',(select count(*) from filtered where has_rejection and status not in ('released','superseded','entered_in_error')),
 'released',(select count(*) from filtered where status='released')),
 'quality_counts',jsonb_build_object('inspections_due',(select count(*) from work_filtered w where exists(select 1 from jsonb_array_elements(w.release_status->'requirements'->'requirements') r where r->>'status' in ('awaiting_inspection','configuration_outdated'))),
 'failed_inspections',(select count(*) from public.location_inspections i join public.location_inspection_templates t on t.id=i.template_id
 where i.organisation_id=private.current_org() and private.can_supervise_contract(i.contract_id)
 and (i.issues_count>0 or exists(select 1 from jsonb_array_elements(i.answers) a where
  (coalesce((a->>'mandatory')::boolean,false) or coalesce((a->>'hold_point')::boolean,false)) and a->>'status'<>'pass'))
 and exists(select 1 from work_filtered w where w.contract_id=i.contract_id and w.work_area_id=i.work_area_id and w.stage=t.stage::text)
 and not exists(select 1 from public.location_inspection_templates newer_template where newer_template.supersedes_id=t.id)
 and not exists(select 1 from public.location_inspections n where n.work_area_id=i.work_area_id and n.template_id=i.template_id
  and n.work_package_id is not distinct from i.work_package_id and (n.created_at,n.id)>(i.created_at,i.id))),
 'failed_mandatory',(select count(*) from work_filtered where (release_status->'requirements'->>'failed')::boolean),
 'blocked_locations',(select count(distinct work_area_id) from work_filtered where status in ('blocked_quality','stopped_safety','awaiting_release','awaiting_inspection')),
 'released_locations',(select count(distinct work_area_id) from work_filtered where status='released'),
 'critical_snags',(select count(*) from public.supervisor_issues i where i.organisation_id=private.current_org() and private.can_read_snag(i.id)
 and i.severity='critical' and i.snag_status not in ('draft','closed','cancelled') and (c is null or i.contract_id=c)
 and (filter_location is null or private.hold_scopes_overlap(i.work_area_id,filter_location)) and (selected_stage is null or i.stage::text=selected_stage)
 and (team is null or i.responsibility_team_id=team or i.assigned_team_id=team)
 and exists(select 1 from work_filtered w where w.contract_id=i.contract_id and private.hold_scopes_overlap(i.work_area_id,w.work_area_id) and i.stage::text=w.stage))),
 'work_statuses',(select coalesce(jsonb_agg(to_jsonb(w)-'path_ids'),'[]') from work_page w),
 'work_statuses_truncated',(select count(*)>200 from work_filtered),'work_statuses_total',(select count(*) from work_filtered)) into result;
 return result;
end $$;

-- Only read-only predicates used by policies can be called by authenticated
-- clients. Helpers with authorisation bypass powers remain private.
revoke all on function private.hold_scopes_overlap(uuid,uuid),private.hold_member_can_read(uuid,uuid),private.can_read_work_hold(uuid),private.is_hold_corrector(uuid),
 private.can_upload_hold_photo(uuid,text),private.can_insert_hold_object(text),private.can_read_hold_object(text),private.guard_hold_findings(),
 private.check_hold_documents(public.work_holds,uuid[]),private.record_hold_event(public.work_holds,text,text,text,jsonb),
 private.attach_hold_photos(public.work_holds,uuid[],text,bigint),private.hold_json(public.work_holds),
 private.hold_scope_requirements(uuid,uuid,text,uuid),private.derive_work_release(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.can_read_work_hold(uuid),private.is_hold_corrector(uuid),private.can_upload_hold_photo(uuid,text),
 private.can_insert_hold_object(text),private.can_read_hold_object(text) to authenticated;
revoke all on function public.create_work_hold(uuid,jsonb),public.transition_work_hold(uuid,uuid,integer,text,jsonb),
 public.reserve_hold_photo(uuid,uuid,text,jsonb),public.complete_hold_photo(uuid,uuid,text),public.work_release_status(uuid,uuid,text,uuid),
 public.hold_context(uuid),public.hold_notifications(uuid,boolean),public.mark_hold_notification_read(bigint,uuid),public.hold_register(jsonb,integer),
 public.transition_snag(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_work_hold(uuid,jsonb),public.transition_work_hold(uuid,uuid,integer,text,jsonb),public.reserve_hold_photo(uuid,uuid,text,jsonb),
 public.work_release_status(uuid,uuid,text,uuid),public.hold_context(uuid),public.hold_notifications(uuid,boolean),public.mark_hold_notification_read(bigint,uuid),
 public.hold_register(jsonb,integer),public.transition_snag(uuid,uuid,integer,text,jsonb) to authenticated;
grant execute on function public.complete_hold_photo(uuid,uuid,text) to service_role;
commit;
