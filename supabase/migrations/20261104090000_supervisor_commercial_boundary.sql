-- Supervisor commercial boundary (C1).
-- Supervisors keep everything they need to work: what the extra work is, the people, plant and
-- materials, photos, the client representative's signature, the office's decision, and one plain
-- answer to "may this work go ahead?". They no longer see commercial approvals: whether a daywork
-- has been priced or its charge approved internally, the client's commercial authorisation record
-- (who, reference, evidence), or audit rows about either. Amounts were already hidden.
--
-- Go-ahead needs the office's approval and, where the contract requires it, the client's
-- authorisation. TileSPEC's internal charge approval never gives permission to proceed.
--
-- Additive and transactional. Existing records keep every value; audit rows that describe a
-- commercial status change are reclassified as commercial (their content is unchanged).
-- Review before hosted use.
begin;
do $$ begin
  if to_regclass('public.dayworks') is null or to_regclass('public.daywork_client_authorisations') is null
    or to_regclass('public.daywork_events') is null
    or to_regprocedure('private.can_supervise_contract(uuid)') is null or to_regprocedure('private.can_view_financials(uuid)') is null
    or to_regprocedure('private.audit_financial_mutation()') is null or to_regprocedure('private.field_boolean(jsonb,text)') is null then
    raise exception 'Preflight failed: dayworks (20261028090000) and its prerequisites are required';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='contracts'
      and column_name='daywork_client_authorisation')
    or to_regprocedure('public.daywork_site_statuses(uuid[])') is not null
    or to_regprocedure('public.daywork_office_statuses(uuid[])') is not null
    or to_regprocedure('public.set_extra_work_authorisation(uuid,integer,jsonb)') is not null then
    raise exception 'Preflight failed: supervisor commercial boundary objects already exist; review schema drift';
  end if;
end $$;

-- Whether this contract requires the client's authorisation before a daywork goes ahead.
-- Defaults to required: the safe answer until the office says otherwise.
alter table public.contracts add column daywork_client_authorisation boolean not null default true;

create function private.client_authorisation_required(p_contract uuid,p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select c.daywork_client_authorisation from public.contracts c where c.id=p_contract),true)
$$;

-- One answer for site. Internal charge approval (commercial_status) is deliberately not an input.
create function private.daywork_go_ahead(d public.dayworks) returns text
language sql stable security definer set search_path='' as $$
  select case
    when d.office_status='rejected' then 'rejected'
    when d.client_status='declined' then 'client_declined'
    when d.office_status='more_detail' then 'more_detail'
    when d.office_status is null then 'not_sent'
    when d.office_status='awaiting_review' then 'awaiting_office'
    when private.client_authorisation_required(d.contract_id,'daywork') and d.client_status<>'authorised' then 'awaiting_client'
    else 'proceed' end
$$;

-- For anyone who can see the job's dayworks. Jobs the caller cannot see are left out, as with RLS.
create function public.daywork_site_statuses(p_contracts uuid[]) returns table(daywork_id uuid,go_ahead text)
language sql stable security definer set search_path='' as $$
  select d.id,private.daywork_go_ahead(d) from public.dayworks d
  where d.contract_id=any(p_contracts) and d.organisation_id=private.current_org() and private.can_supervise_contract(d.contract_id)
$$;

-- For the office on the job. The internal charge status is returned only with money access.
create function public.daywork_office_statuses(p_contracts uuid[])
returns table(daywork_id uuid,client_status text,commercial_status text,client_authorisation_required boolean)
language sql stable security definer set search_path='' as $$
  select d.id,d.client_status,case when private.can_view_financials(d.contract_id) then d.commercial_status end,
    private.client_authorisation_required(d.contract_id,'daywork')
  from public.dayworks d
  where d.contract_id=any(p_contracts) and d.organisation_id=private.current_org() and private.can_manage_contract(d.contract_id)
$$;

-- The office records what the contract says. A change is versioned and audited like any contract change.
create function public.set_extra_work_authorisation(p_contract uuid,p_version integer,p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare c public.contracts;
begin
  if not private.can_manage_contract(p_contract) then
    raise exception 'Only the office for this job can change what the contract requires' using errcode='42501'; end if;
  perform private.only_keys(p_data,array['dayworks']);
  if private.field_boolean(p_data,'dayworks') is null then raise exception 'Say whether dayworks need the client''s authorisation' using errcode='22023'; end if;
  select * into c from public.contracts where id=p_contract for update;
  if c.version is distinct from p_version then raise exception 'Contract changed; reload before saving' using errcode='40001'; end if;
  update public.contracts set daywork_client_authorisation=private.field_boolean(p_data,'dayworks'),version=version+1,updated_at=now()
    where id=p_contract returning version into p_version;
  return p_version;
end $$;

-- Column-level reads: the commercial and client statuses of a daywork, and the status snapshot
-- kept with each history step, are read only through the functions above.
revoke select on public.dayworks from authenticated;
grant select(id,organisation_id,contract_id,number,work_area_id,location_path,description,instructed_by_name,instructed_by_company,
  instructed_on,created_by,created_by_name,created_at,request_key,site_status,office_status,signoff_status,lines_version,version,updated_at)
  on public.dayworks to authenticated;
revoke select on public.daywork_events from authenticated;
grant select(id,daywork_id,organisation_id,contract_id,actor_id,actor_name,action,note,owner_override,created_at)
  on public.daywork_events to authenticated;

-- Commercial steps of a daywork's history, and the client's authorisation record, are office only.
drop policy daywork_events_read on public.daywork_events;
create policy daywork_events_read on public.daywork_events for select to authenticated using(
  organisation_id=private.current_org() and (private.can_manage_contract(contract_id)
    or (private.can_supervise_contract(contract_id) and action not in ('price','commercial_approval','client_authorisation'))));
drop policy daywork_client_authorisations_read on public.daywork_client_authorisations;
create policy daywork_client_authorisations_read on public.daywork_client_authorisations for select to authenticated using(
  organisation_id=private.current_org() and private.can_manage_contract(contract_id));

-- Audit: a change to a daywork's commercial or client status is a commercial audit row, readable
-- only with money access, like the rest of the money audit.
create function private.audit_daywork() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new); previous jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end; changes jsonb;
begin
  select coalesce(jsonb_agg(k),'[]'::jsonb) into changes from jsonb_object_keys(r) k where r->k is distinct from previous->k;
  insert into public.audit_events(organisation_id,contract_id,actor_id,action,entity_type,entity_id,commercial,details)
    values(new.organisation_id,new.contract_id,auth.uid(),lower(tg_op),'dayworks',new.id::text,
      tg_op='UPDATE' and changes ?| array['commercial_status','client_status'],
      jsonb_build_object('changed_fields',changes));
  return new;
end $$;
drop trigger daywork_audit on public.dayworks;
create trigger daywork_audit after insert or update on public.dayworks for each row execute function private.audit_daywork();
drop trigger daily_audit on public.daywork_client_authorisations;
create trigger financial_audit after insert on public.daywork_client_authorisations for each row execute function private.audit_financial_mutation();
update public.audit_events set commercial=true where not commercial and (entity_type='daywork_client_authorisations'
  or (entity_type='dayworks' and action='update' and details->'changed_fields' ?| array['commercial_status','client_status']));

revoke all on function private.client_authorisation_required(uuid,text),private.daywork_go_ahead(public.dayworks),private.audit_daywork()
  from public,anon,authenticated;
revoke all on function public.daywork_site_statuses(uuid[]),public.daywork_office_statuses(uuid[]),
  public.set_extra_work_authorisation(uuid,integer,jsonb) from public,anon;
grant execute on function public.daywork_site_statuses(uuid[]),public.daywork_office_statuses(uuid[]),
  public.set_extra_work_authorisation(uuid,integer,jsonb) to authenticated;
commit;
