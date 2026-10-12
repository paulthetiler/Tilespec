-- Issue register derived from submitted inspections; no automatic work release.
create table public.supervisor_issues (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 contract_id uuid not null,
 inspection_id uuid not null references public.supervisor_inspections(id),
 check_label text not null,
 description text not null,
 state text not null default 'open' check(state in ('open','rectification_reported','reinspection_required','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 rectification_note text,
 rectified_by uuid references auth.users(id),
 rectified_at timestamptz,
 closed_by uuid references auth.users(id),
 closed_at timestamptz,
 unique(inspection_id,check_label),
 foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id)
);
create index supervisor_issues_queue on public.supervisor_issues(organisation_id,state,created_at desc);
alter table public.supervisor_issues enable row level security;
create policy supervisor_issues_read on public.supervisor_issues for select to authenticated
 using (organisation_id=private.current_org() and private.can_access_contract(contract_id) and private.current_role() in ('owner','contracts_manager','supervisor'));
-- Issue state transitions occur through a controlled SECURITY DEFINER function, not direct client writes.
grant select on public.supervisor_issues to authenticated;
create function private.inspection_issues() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb;
begin
 for a in select value from jsonb_array_elements(new.answers) loop
  if a->>'status'='issue' then
   insert into public.supervisor_issues(organisation_id,contract_id,inspection_id,check_label,description)
   values(new.organisation_id,new.contract_id,new.id,a->>'item',a->>'note');
  end if;
 end loop;
 return new;
end $$;
create trigger create_inspection_issues after insert on public.supervisor_inspections
 for each row execute function private.inspection_issues();
create table public.supervisor_issue_events(
 id bigint generated always as identity primary key,
 issue_id uuid not null references public.supervisor_issues(id),
 organisation_id uuid not null references public.organisations(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 note text not null,
 created_at timestamptz not null default now()
);
alter table public.supervisor_issue_events enable row level security;
create policy issue_events_read on public.supervisor_issue_events for select to authenticated
 using(organisation_id=private.current_org() and exists(select 1 from public.supervisor_issues i where i.id=issue_id and private.can_access_contract(i.contract_id)));
grant select on public.supervisor_issue_events to authenticated;
create function public.transition_supervisor_issue(p_issue uuid,p_action text,p_note text)
returns public.supervisor_issues language plpgsql security definer set search_path='' as $$
declare i public.supervisor_issues; r public.operations_role;
begin
 select * into i from public.supervisor_issues where id=p_issue for update;
 if not found or i.organisation_id is distinct from private.current_org() or not private.can_access_contract(i.contract_id) then raise exception 'Issue unavailable' using errcode='42501'; end if;
 r:=private.current_role();
 if r not in ('owner','contracts_manager','supervisor') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_note is null or length(trim(p_note))<5 or length(p_note)>2000 then raise exception 'Provide a meaningful note' using errcode='22023'; end if;
 if p_action='report_rectification' and i.state in ('open','reinspection_required') then
  update public.supervisor_issues set state='rectification_reported',rectification_note=trim(p_note),rectified_by=auth.uid(),rectified_at=now(),updated_at=now() where id=p_issue;
 elsif p_action='request_reinspection' and i.state='rectification_reported' then
  update public.supervisor_issues set state='reinspection_required',updated_at=now() where id=p_issue;
 elsif p_action='close_after_reinspection' and i.state='reinspection_required' and r in ('owner','contracts_manager') and i.rectified_by is distinct from auth.uid() then
  update public.supervisor_issues set state='closed',closed_by=auth.uid(),closed_at=now(),updated_at=now() where id=p_issue;
 elsif p_action='reopen' and i.state='closed' and r in ('owner','contracts_manager') then
  update public.supervisor_issues set state='open',closed_by=null,closed_at=null,updated_at=now() where id=p_issue;
 else raise exception 'Invalid transition or insufficient authority' using errcode='22023'; end if;
 insert into public.supervisor_issue_events(issue_id,organisation_id,actor_id,action,note) values(p_issue,i.organisation_id,auth.uid(),p_action,trim(p_note));
 select * into i from public.supervisor_issues where id=p_issue;
 return i;
end $$;
revoke all on function public.transition_supervisor_issue(uuid,text,text) from public,anon;
grant execute on function public.transition_supervisor_issue(uuid,text,text) to authenticated;
-- Private evidence bucket; uploads are made by server-authenticated clients, with RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('supervisor-evidence','supervisor-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy supervisor_evidence_insert on storage.objects for insert to authenticated
 with check(bucket_id='supervisor-evidence' and exists(
 select 1 from public.supervisor_issues i
 where i.id::text=split_part(name,'/',2)
 and i.organisation_id::text=split_part(name,'/',1)
 and i.organisation_id=private.current_org()
 and private.can_access_contract(i.contract_id)
 and private.current_role() in ('owner','contracts_manager','supervisor')));
create policy supervisor_evidence_read on storage.objects for select to authenticated
 using(bucket_id='supervisor-evidence' and exists(
 select 1 from public.supervisor_issues i
 where i.id::text=split_part(name,'/',2)
 and i.organisation_id::text=split_part(name,'/',1)
 and i.organisation_id=private.current_org()
 and private.can_access_contract(i.contract_id)
 and private.current_role() in ('owner','contracts_manager','supervisor')));
create table public.supervisor_issue_photos(
 id uuid primary key default gen_random_uuid(),
 issue_id uuid not null references public.supervisor_issues(id),
 organisation_id uuid not null references public.organisations(id),
 actor_id uuid not null default auth.uid() references auth.users(id),
 object_path text not null unique,
 created_at timestamptz not null default now()
);
alter table public.supervisor_issue_photos enable row level security;
create policy supervisor_photos_read on public.supervisor_issue_photos for select to authenticated
 using(organisation_id=private.current_org() and exists(select 1 from public.supervisor_issues i where i.id=issue_id and private.can_access_contract(i.contract_id)));
create policy supervisor_photos_insert on public.supervisor_issue_photos for insert to authenticated
 with check(organisation_id=private.current_org() and actor_id=auth.uid() and object_path like organisation_id::text||'/'||issue_id::text||'/%' and exists(select 1 from public.supervisor_issues i where i.id=issue_id and i.organisation_id=organisation_id and private.can_access_contract(i.contract_id) and private.current_role() in ('owner','contracts_manager','supervisor')));
grant select,insert on public.supervisor_issue_photos to authenticated;
