-- Variations (C2), on the existing daywork workflow.
-- A variation is a change to the agreed work. It uses exactly the same records as a daywork: the
-- site's description, location, who asked for it and photos; the office's decision; the client's
-- authorisation; pricing and the internal charge approval; and the history. It differs in three
-- ways only: it is numbered separately (VO-1, VO-2), it may be sent to the office before anyone
-- has worked on it, and it may be priced as a quoted sum instead of from the job's day rates.
-- Whether the contract requires the client's authorisation before a variation goes ahead is
-- recorded separately from dayworks, and defaults to required.
-- Additive and transactional. Every existing daywork stays a daywork with its number. Review
-- before hosted use.
begin;
do $$ begin
  if to_regprocedure('public.daywork_site_statuses(uuid[])') is null
    or to_regprocedure('private.client_authorisation_required(uuid,text)') is null
    or to_regprocedure('public.price_daywork(uuid,uuid,integer,jsonb)') is null then
    raise exception 'Preflight failed: the supervisor commercial boundary (20261104090000) is required';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='dayworks' and column_name='kind')
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='daywork_pricings' and column_name='method')
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='contracts' and column_name='variation_client_authorisation') then
    raise exception 'Preflight failed: variation objects already exist; review schema drift';
  end if;
end $$;

alter table public.dayworks add column kind text not null default 'daywork' check(kind in ('daywork','variation'));
alter table public.dayworks drop constraint dayworks_contract_id_number_key;
alter table public.dayworks add constraint dayworks_contract_kind_number_key unique(contract_id,kind,number);
grant select(kind) on public.dayworks to authenticated;
alter table public.daywork_pricings add column method text not null default 'day_rates' check(method in ('day_rates','quoted')),
  add column note text check(note is null or length(trim(note)) between 1 and 500);
alter table public.contracts add column variation_client_authorisation boolean not null default true;

create or replace function private.client_authorisation_required(p_contract uuid,p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select case when p_kind='variation' then c.variation_client_authorisation else c.daywork_client_authorisation end
    from public.contracts c where c.id=p_contract),true)
$$;
create or replace function private.daywork_go_ahead(d public.dayworks) returns text
language sql stable security definer set search_path='' as $$
  select case
    when d.office_status='rejected' then 'rejected'
    when d.client_status='declined' then 'client_declined'
    when d.office_status='more_detail' then 'more_detail'
    when d.office_status is null then 'not_sent'
    when d.office_status='awaiting_review' then 'awaiting_office'
    when private.client_authorisation_required(d.contract_id,d.kind) and d.client_status<>'authorised' then 'awaiting_client'
    else 'proceed' end
$$;
create or replace function public.daywork_office_statuses(p_contracts uuid[])
returns table(daywork_id uuid,client_status text,commercial_status text,client_authorisation_required boolean)
language sql stable security definer set search_path='' as $$
  select d.id,d.client_status,case when private.can_view_financials(d.contract_id) then d.commercial_status end,
    private.client_authorisation_required(d.contract_id,d.kind)
  from public.dayworks d
  where d.contract_id=any(p_contracts) and d.organisation_id=private.current_org() and private.can_manage_contract(d.contract_id)
$$;
create or replace function public.set_extra_work_authorisation(p_contract uuid,p_version integer,p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare c public.contracts;
begin
  if not private.can_manage_contract(p_contract) then
    raise exception 'Only the office for this job can change what the contract requires' using errcode='42501'; end if;
  perform private.only_keys(p_data,array['dayworks','variations']);
  if private.field_boolean(p_data,'dayworks') is null and private.field_boolean(p_data,'variations') is null then
    raise exception 'Say whether dayworks or variations need the client''s authorisation' using errcode='22023'; end if;
  select * into c from public.contracts where id=p_contract for update;
  if c.version is distinct from p_version then raise exception 'Contract changed; reload before saving' using errcode='40001'; end if;
  update public.contracts set daywork_client_authorisation=coalesce(private.field_boolean(p_data,'dayworks'),daywork_client_authorisation),
    variation_client_authorisation=coalesce(private.field_boolean(p_data,'variations'),variation_client_authorisation),version=version+1,updated_at=now()
    where id=p_contract returning version into p_version;
  return p_version;
end $$;

create or replace function public.create_daywork(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; area public.work_areas; d public.dayworks; result uuid; n integer; what text; asked date; k text;
begin
  perform private.only_keys(p_data,array['contract_id','kind','work_area_id','description','instructed_by_name','instructed_by_company','instructed_on','lines']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_supervise_contract(c) then
    raise exception 'Only a supervisor or the office on this job can record a daywork' using errcode='42501'; end if;
  result:=private.request_result(org,'create_daywork',p_request_key,p_data);
  if result is not null then return result; end if;
  if private.field_uuid(p_data,'work_area_id') is not null then
    select * into area from public.work_areas where id=private.field_uuid(p_data,'work_area_id') and contract_id=c and organisation_id=org;
    if not found then raise exception 'Choose a location on this job' using errcode='22023'; end if;
  end if;
  k:=coalesce(nullif(private.field_text(p_data,'kind',10),''),'daywork');
  perform private.assert_choice(k,'kind',array['daywork','variation']);
  what:=private.field_text(p_data,'description',2000,true);
  if length(what)<5 then raise exception '%',case k when 'variation' then 'Say what needs to change' else 'Say what extra work was done' end using errcode='22023'; end if;
  asked:=coalesce(private.field_date(p_data,'instructed_on'),private.site_today());
  if asked>private.site_today() then raise exception 'The date it was asked for cannot be in the future' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('daywork-number:'||c::text||':'||k,0));
  select coalesce(max(number),0)+1 into n from public.dayworks where contract_id=c and kind=k;
  insert into public.dayworks(organisation_id,contract_id,kind,number,work_area_id,location_path,description,instructed_by_name,instructed_by_company,
    instructed_on,created_by,created_by_name,request_key)
  values(org,c,k,n,area.id,case when area.id is null then '{}'::text[] else array(select w.name from unnest(area.path_ids) with ordinality x(id,k)
      join public.work_areas w on w.id=x.id order by x.k) end,
    what,private.field_text(p_data,'instructed_by_name',120,true),nullif(private.field_text(p_data,'instructed_by_company',120),''),
    asked,auth.uid(),private.member_name(),p_request_key)
  returning * into d;
  perform private.insert_daywork_lines(d,1,p_data->'lines');
  perform private.record_daywork_event(d,'record',null);
  perform private.record_request(org,'create_daywork',p_request_key,p_data,d.id);
  return d.id;
end $$;

create or replace function public.send_daywork(p_daywork uuid,p_request_key uuid,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb:=jsonb_build_object('daywork',p_daywork,'version',p_version);
begin
  result:=private.request_result(d.organisation_id,'send_daywork',p_request_key,payload);
  if result is not null then return result; end if;
  perform private.assert_daywork_version(d,p_version);
  if d.site_status<>'recorded' then raise exception 'This daywork has already been sent to the office' using errcode='22023'; end if;
  if d.kind='daywork' and not exists(select 1 from public.daywork_lines where daywork_id=d.id and lines_version=d.lines_version) then
    raise exception 'Add at least one line of labour, plant or materials before sending' using errcode='22023'; end if;
  update public.dayworks set site_status='sent',office_status='awaiting_review',version=version+1,updated_at=now() where id=d.id returning * into d;
  perform private.record_daywork_event(d,'send',null);
  perform private.record_request(d.organisation_id,'send_daywork',p_request_key,payload,d.id);
  return d.id;
end $$;

create or replace function public.price_daywork(p_daywork uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb; entry jsonb; v_line public.daywork_lines;
  v_rate public.contract_daywork_rates; v_total numeric:=0; v_count integer; v_priced jsonb:='[]'; v_method text;
begin
  perform private.only_keys(p_data,array['method','lines','total','note']);
  if not private.can_view_financials(d.contract_id) then raise exception 'Money access is required to price a daywork' using errcode='42501'; end if;
  payload:=jsonb_build_object('daywork',p_daywork,'version',p_version,'data',p_data);
  result:=private.request_result(d.organisation_id,'price_daywork',p_request_key,payload);
  if result is not null then return result; end if;
  perform private.assert_daywork_version(d,p_version);
  if d.site_status<>'sent' or d.office_status='rejected' then raise exception 'Only a daywork sent to the office, and not rejected, can be priced' using errcode='22023'; end if;
  if d.commercial_status='commercially_approved' then raise exception 'The charge has already been approved' using errcode='22023'; end if;
  -- Wait for any rate change on this job, so every line is priced at a rate that is still current.
  v_method:=coalesce(nullif(private.field_text(p_data,'method',10),''),'day_rates');
  perform private.assert_choice(v_method,'method',array['day_rates','quoted']);
  if v_method='quoted' then
    -- A variation can be valued as a quoted sum instead of from the job's day rates. A daywork cannot.
    if d.kind<>'variation' then raise exception 'A daywork is priced from the job''s day rates' using errcode='22023'; end if;
    if p_data ? 'lines' then raise exception 'A quoted price has no rate lines' using errcode='22023'; end if;
    insert into public.daywork_pricings(daywork_id,organisation_id,contract_id,lines_version,total,method,note,priced_by,priced_by_name,request_key)
      values(d.id,d.organisation_id,d.contract_id,d.lines_version,private.field_decimal(p_data,'total',0.01,10000000),'quoted',
        nullif(private.field_text(p_data,'note',500),''),auth.uid(),private.member_name(),p_request_key) returning id into result;
    update public.dayworks set commercial_status='priced',version=version+1,updated_at=now() where id=d.id returning * into d;
    perform private.record_daywork_event(d,'price',null);
    perform private.record_request(d.organisation_id,'price_daywork',p_request_key,payload,result);
    return result;
  end if;
  if p_data ? 'total' or p_data ? 'note' then raise exception 'A price from day rates is worked out from the lines' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('daywork-rates:'||d.contract_id::text,0));
  select count(*) into v_count from public.daywork_lines where daywork_id=d.id and lines_version=d.lines_version;
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines')<>v_count
    or (select count(distinct e->>'line_id') from jsonb_array_elements(p_data->'lines') e)<>v_count then
    raise exception 'Choose a rate for every line before pricing. Add any missing rate to the job first.' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(p_data->'lines') loop
    perform private.only_keys(entry,array['line_id','rate_id']);
    select * into v_line from public.daywork_lines where id=private.field_uuid(entry,'line_id',true) and daywork_id=d.id and lines_version=d.lines_version;
    if not found then raise exception 'A line has changed. Refresh before pricing.' using errcode='40001'; end if;
    select * into v_rate from public.contract_daywork_rates r where r.id=private.field_uuid(entry,'rate_id',true) and r.contract_id=d.contract_id
      and not r.retired and not exists(select 1 from public.contract_daywork_rates n where n.supersedes_id=r.id);
    if not found then raise exception 'A chosen rate has changed. Refresh to see the current rates.' using errcode='40001'; end if;
    if v_rate.category<>(case v_line.kind when 'labour' then v_line.role else v_line.kind end) or v_rate.unit<>v_line.unit then
      raise exception 'The rate for "%" must be a % rate per %',v_line.label,(case v_line.kind when 'labour' then v_line.role else v_line.kind end),v_line.unit
        using errcode='22023'; end if;
    v_priced:=v_priced||jsonb_build_object('line_id',v_line.id,'rate_id',v_rate.id,'category',v_rate.category,'item',v_rate.item,'unit',v_rate.unit,
      'rate',v_rate.rate,'quantity',v_line.quantity,'amount',round(v_line.quantity*v_rate.rate,2));
    v_total:=v_total+round(v_line.quantity*v_rate.rate,2);
  end loop;
  insert into public.daywork_pricings(daywork_id,organisation_id,contract_id,lines_version,total,priced_by,priced_by_name,request_key)
    values(d.id,d.organisation_id,d.contract_id,d.lines_version,v_total,auth.uid(),private.member_name(),p_request_key) returning id into result;
  insert into public.daywork_pricing_lines(pricing_id,organisation_id,contract_id,line_id,rate_id,category,item,unit,rate,quantity,amount)
    select result,d.organisation_id,d.contract_id,(e->>'line_id')::uuid,(e->>'rate_id')::uuid,e->>'category',e->>'item',e->>'unit',
      (e->>'rate')::numeric,(e->>'quantity')::numeric,(e->>'amount')::numeric from jsonb_array_elements(v_priced) e;
  update public.dayworks set commercial_status='priced',version=version+1,updated_at=now() where id=d.id returning * into d;
  perform private.record_daywork_event(d,'price',null);
  perform private.record_request(d.organisation_id,'price_daywork',p_request_key,payload,result);
  return result;
end $$;

revoke all on function private.client_authorisation_required(uuid,text),private.daywork_go_ahead(public.dayworks) from public,anon,authenticated;
revoke all on function public.create_daywork(uuid,jsonb),public.send_daywork(uuid,uuid,integer),public.price_daywork(uuid,uuid,integer,jsonb),
  public.daywork_office_statuses(uuid[]),public.set_extra_work_authorisation(uuid,integer,jsonb) from public,anon;
grant execute on function public.create_daywork(uuid,jsonb),public.send_daywork(uuid,uuid,integer),public.price_daywork(uuid,uuid,integer,jsonb),
  public.daywork_office_statuses(uuid[]),public.set_extra_work_authorisation(uuid,integer,jsonb) to authenticated;
commit;
