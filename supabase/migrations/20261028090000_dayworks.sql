-- Dayworks and contract day rates (M4).
-- The supervisor records extra work paid by the hour: what, where, who asked for it, the
-- people and hours, plant and materials, optional photos, and the client representative's
-- sign-off (or that they refused or were not there). The office approves it, never their
-- own (the owner may override with a logged reason), and records the client's separate
-- authorisation of the cost. With money access only, the office prices it from the
-- contract's day rates, copying each rate used, and approves the charge internally.
-- Four statuses stay separate: site, office, the internal charge, and the client.
-- Every step is a saved record with who and when; money lives in separate tables that only
-- money access can read. Additive and transactional. The only existing object it changes is
-- job messages (M1), when installed: a conversation may also be about a daywork.
-- Review before hosted use.
begin;
do $$ begin
  if to_regclass('public.supervisor_office_items') is null or to_regclass('public.document_revisions') is null
    or to_regprocedure('private.can_supervise_contract(uuid)') is null or to_regprocedure('private.can_view_financials(uuid)') is null
    or to_regprocedure('private.can_read_document(uuid,uuid,text)') is null or to_regprocedure('private.guard_append_only()') is null
    or to_regprocedure('private.request_result(uuid,text,uuid,jsonb)') is null or to_regprocedure('private.site_today()') is null then
    raise exception 'Preflight failed: the daily supervisor workflow (20261015130000) and its prerequisites are required';
  end if;
  if to_regclass('public.dayworks') is not null or to_regclass('public.contract_daywork_rates') is not null
    or to_regprocedure('public.create_daywork(uuid,jsonb)') is not null or to_regprocedure('private.can_read_daywork(uuid)') is not null then
    raise exception 'Preflight failed: daywork objects already exist; review schema drift';
  end if;
  if not has_table_privilege(current_user,'storage.objects','SELECT') or not (
    exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) or
    exists(select 1 from pg_class where oid='storage.objects'::regclass and pg_has_role(current_user,relowner,'USAGE') and not relforcerowsecurity)) then
    raise exception 'Preflight failed: applying role must read Storage beyond RLS'; end if;
  if not exists(select 1 from storage.buckets where id='supervisor-evidence' and not public and file_size_limit>=4194304
    and allowed_mime_types @> array['image/jpeg','image/png']) then raise exception 'Preflight failed: private JPEG/PNG evidence bucket required'; end if;
end $$;

-- What the site recorded. Statuses change only through the functions below.
create table public.dayworks (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  number integer not null check(number>0),
  work_area_id uuid, location_path text[] not null default '{}',
  description text not null check(length(trim(description)) between 5 and 2000),
  instructed_by_name text not null check(length(trim(instructed_by_name)) between 1 and 120),
  instructed_by_company text check(instructed_by_company is null or length(trim(instructed_by_company)) between 1 and 120),
  instructed_on date not null,
  created_by uuid not null references auth.users(id), created_by_name text not null, created_at timestamptz not null default now(),
  request_key uuid not null,
  site_status text not null default 'recorded' check(site_status in ('recorded','sent')),
  office_status text check(office_status in ('awaiting_review','more_detail','approved','rejected')),
  signoff_status text not null default 'none' check(signoff_status in ('none','signed','refused','unavailable')),
  commercial_status text not null default 'awaiting_pricing' check(commercial_status in ('awaiting_pricing','priced','commercially_approved')),
  client_status text not null default 'not_authorised' check(client_status in ('not_authorised','authorised','declined')),
  lines_version integer not null default 1 check(lines_version>0),
  version integer not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  unique(organisation_id,contract_id,id), unique(contract_id,number), unique(organisation_id,created_by,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,contract_id,work_area_id) references public.work_areas(organisation_id,contract_id,id),
  -- Sent and waiting, approved or rejected; otherwise still on site (never sent, or sent back for more detail).
  check((site_status='sent') = coalesce(office_status in ('awaiting_review','approved','rejected'),false)),
  check(commercial_status<>'commercially_approved' or office_status='approved')
);
-- People and hours, plant and materials. A correction saves a new full set; earlier sets stay.
create table public.daywork_lines (
  id uuid primary key default gen_random_uuid(), daywork_id uuid not null, organisation_id uuid not null, contract_id uuid not null,
  lines_version integer not null check(lines_version>0), position integer not null check(position between 1 and 100),
  kind text not null check(kind in ('labour','plant','material')),
  label text not null check(length(trim(label)) between 1 and 120),
  role text check(role in ('operative','supervisor')),
  work_date date,
  quantity numeric(10,2) not null check(quantity>0 and quantity<=100000),
  unit text not null check(unit in ('hour','day','week','each','m2','m','kg','litre','bag','box','tub','tonne')),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(daywork_id,lines_version,position),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check((kind='labour') = (role is not null)),
  check(kind<>'labour' or (unit='hour' and work_date is not null and quantity<=24))
);
create table public.daywork_events (
  id bigint generated always as identity primary key, daywork_id uuid not null, organisation_id uuid not null, contract_id uuid not null,
  actor_id uuid not null references auth.users(id), actor_name text not null,
  action text not null check(action in ('record','update_lines','send','request_detail','approve','reject','sign_off',
    'client_authorisation','price','commercial_approval')),
  note text, owner_override boolean not null default false, snapshot jsonb not null, created_at timestamptz not null default now(),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id)
);
-- The client representative signs the record of the work, hours and materials only. It is not
-- authorisation to pay, which is recorded separately below.
create table public.daywork_signoffs (
  id uuid primary key default gen_random_uuid(), daywork_id uuid not null, organisation_id uuid not null, contract_id uuid not null,
  outcome text not null check(outcome in ('signed','refused','unavailable')),
  signer_name text check(signer_name is null or length(trim(signer_name)) between 1 and 120),
  signer_position text check(signer_position is null or length(trim(signer_position)) between 1 and 120),
  signer_company text check(signer_company is null or length(trim(signer_company)) between 1 and 120),
  signed_at timestamptz not null, reason text check(reason is null or length(trim(reason)) between 3 and 1000),
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(),
  request_key uuid not null, unique(organisation_id,recorded_by,request_key),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check(outcome<>'signed' or signer_name is not null), check(outcome='signed' or reason is not null)
);
-- The client's commercial authorisation of the cost, with its reference or evidence.
create table public.daywork_client_authorisations (
  id uuid primary key default gen_random_uuid(), daywork_id uuid not null, organisation_id uuid not null, contract_id uuid not null,
  outcome text not null check(outcome in ('authorised','declined')),
  client_name text not null check(length(trim(client_name)) between 1 and 120), decided_on date not null,
  reference text check(reference is null or length(trim(reference)) between 1 and 120),
  document_id uuid references public.document_revisions(id),
  note text check(note is null or length(trim(note)) between 3 and 1000),
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(),
  request_key uuid not null, unique(organisation_id,recorded_by,request_key),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check(outcome<>'authorised' or reference is not null or document_id is not null), check(outcome<>'declined' or note is not null)
);
-- Optional verified photographs. A daywork never waits for one.
create table public.daywork_photos (
  id uuid primary key default gen_random_uuid(), daywork_id uuid not null, organisation_id uuid not null, contract_id uuid not null,
  actor_id uuid not null references auth.users(id), purpose text not null check(purpose in ('work','signed_sheet')),
  object_path text not null unique, sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check(bytes between 1 and 4194304), mime_type text not null check(mime_type in ('image/jpeg','image/png')),
  created_at timestamptz not null default now(), uploaded_at timestamptz,
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check(object_path=organisation_id::text||'/dayworks/'||daywork_id::text||'/'||id::text||case mime_type when 'image/png' then '.png' else '.jpg' end)
);

-- Money access only from here. Rates are versioned: a change is a new row naming the one it
-- replaces, so a rate already used in a price is never altered.
create table public.contract_daywork_rates (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  category text not null check(category in ('operative','supervisor','plant','material')),
  item text not null check(length(trim(item)) between 1 and 120),
  unit text not null check(unit in ('hour','day','week','each','m2','m','kg','litre','bag','box','tub','tonne')),
  rate numeric(10,2) not null check(rate>=0 and rate<=100000), retired boolean not null default false,
  supersedes_id uuid unique references public.contract_daywork_rates(id),
  created_by uuid not null references auth.users(id), created_by_name text not null, created_at timestamptz not null default now(),
  request_key uuid not null, unique(organisation_id,created_by,request_key),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  check(category not in ('operative','supervisor') or unit='hour')
);
create table public.daywork_pricings (
  id uuid primary key default gen_random_uuid(), daywork_id uuid not null, organisation_id uuid not null, contract_id uuid not null,
  lines_version integer not null, total numeric(12,2) not null check(total>=0),
  priced_by uuid not null references auth.users(id), priced_by_name text not null, priced_at timestamptz not null default now(),
  request_key uuid not null, unique(organisation_id,priced_by,request_key),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id)
);
-- Each line keeps an exact copy of the rate it was priced at.
create table public.daywork_pricing_lines (
  id uuid primary key default gen_random_uuid(), pricing_id uuid not null references public.daywork_pricings(id),
  organisation_id uuid not null, contract_id uuid not null, line_id uuid not null references public.daywork_lines(id),
  rate_id uuid not null references public.contract_daywork_rates(id),
  category text not null, item text not null, unit text not null, rate numeric(10,2) not null, quantity numeric(10,2) not null,
  amount numeric(12,2) not null check(amount>=0), unique(pricing_id,line_id)
);
-- TileSPEC's internal approval of the charge. It is not the client's acceptance or agreement to pay.
create table public.daywork_commercial_approvals (
  id uuid primary key default gen_random_uuid(), daywork_id uuid not null, organisation_id uuid not null, contract_id uuid not null,
  pricing_id uuid not null references public.daywork_pricings(id), note text check(note is null or length(trim(note)) between 1 and 1000),
  owner_override boolean not null default false, override_reason text check(override_reason is null or length(trim(override_reason)) between 5 and 1000),
  approved_by uuid not null references auth.users(id), approved_by_name text not null, approved_at timestamptz not null default now(),
  request_key uuid not null, unique(organisation_id,approved_by,request_key), unique(daywork_id),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check(owner_override = (override_reason is not null))
);
create index dayworks_site on public.dayworks(contract_id,number);
create index daywork_lines_current on public.daywork_lines(daywork_id,lines_version,position);
create index daywork_history on public.daywork_events(daywork_id,id);
create index daywork_events_site on public.daywork_events(contract_id,created_at desc,id);
create index daywork_rates_site on public.contract_daywork_rates(contract_id,category,item);
create index daywork_pricings_daywork on public.daywork_pricings(daywork_id,priced_at desc);

-- Who may see dayworks: the office for the job (and the owner) and the supervisors on it.
-- Installers and other organisations see nothing.
create function private.can_read_daywork(p_daywork uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.dayworks d where d.id=p_daywork and d.organisation_id=private.current_org()
    and private.can_supervise_contract(d.contract_id))
$$;
create function private.can_upload_daywork_photo(p_daywork uuid,p_purpose text) returns boolean
language sql stable security definer set search_path='' as $$
  select p_purpose in ('work','signed_sheet') and exists(select 1 from public.dayworks d where d.id=p_daywork
    and d.organisation_id=private.current_org() and private.can_supervise_contract(d.contract_id) and d.office_status is distinct from 'rejected')
$$;
create function private.can_insert_daywork_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.daywork_photos p where p.object_path=p_path and p.uploaded_at is null
    and p.actor_id=auth.uid() and private.can_upload_daywork_photo(p.daywork_id,p.purpose))
$$;
create function private.can_read_daywork_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.daywork_photos p where p.object_path=p_path and p.uploaded_at is not null and private.can_read_daywork(p.daywork_id))
$$;
create policy daywork_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='supervisor-evidence' and private.can_insert_daywork_object(name));
create policy daywork_evidence_read on storage.objects for select to authenticated using(bucket_id='supervisor-evidence' and private.can_read_daywork_object(name));

alter table public.dayworks enable row level security;
alter table public.daywork_lines enable row level security;
alter table public.daywork_events enable row level security;
alter table public.daywork_signoffs enable row level security;
alter table public.daywork_client_authorisations enable row level security;
alter table public.daywork_photos enable row level security;
alter table public.contract_daywork_rates enable row level security;
alter table public.daywork_pricings enable row level security;
alter table public.daywork_pricing_lines enable row level security;
alter table public.daywork_commercial_approvals enable row level security;
create policy daywork_read on public.dayworks for select to authenticated using(
  organisation_id=private.current_org() and private.can_supervise_contract(contract_id));
do $$ declare t text; begin
  foreach t in array array['daywork_lines','daywork_events','daywork_signoffs','daywork_client_authorisations'] loop
    execute format('create policy %I on public.%I for select to authenticated using(organisation_id=private.current_org() and private.can_supervise_contract(contract_id))',t||'_read',t);
  end loop;
  foreach t in array array['contract_daywork_rates','daywork_pricings','daywork_pricing_lines','daywork_commercial_approvals'] loop
    execute format('create policy %I on public.%I for select to authenticated using(organisation_id=private.current_org() and private.can_view_financials(contract_id))',t||'_read',t);
  end loop;
end $$;
create policy daywork_photos_read on public.daywork_photos for select to authenticated using(
  organisation_id=private.current_org() and private.can_supervise_contract(contract_id) and (uploaded_at is not null or actor_id=auth.uid()));

-- Money changes are audited as commercial, so only money access can read their audit rows.
create function private.audit_financial_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);
begin
  insert into public.audit_events(organisation_id,contract_id,actor_id,action,entity_type,entity_id,commercial,details)
    values((r->>'organisation_id')::uuid,(r->>'contract_id')::uuid,auth.uid(),lower(tg_op),tg_table_name,r->>'id',true,
      jsonb_build_object('changed_fields',(select coalesce(jsonb_agg(k),'[]'::jsonb) from jsonb_object_keys(r) k),
        'after',r-'organisation_id'-'contract_id'));
  return new;
end $$;
-- The recorded facts of a daywork never change; only its statuses move on.
create function private.guard_daywork() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'dayworks records are permanent' using errcode='42501'; end if;
  if (to_jsonb(new)-array['site_status','office_status','signoff_status','commercial_status','client_status','lines_version','version','updated_at'])
    is distinct from (to_jsonb(old)-array['site_status','office_status','signoff_status','commercial_status','client_status','lines_version','version','updated_at']) then
    raise exception 'A recorded daywork cannot be rewritten; correct its lines or add a note' using errcode='42501'; end if;
  return new;
end $$;
create trigger daywork_guard before update or delete on public.dayworks for each row execute function private.guard_daywork();
create trigger daywork_audit after insert or update on public.dayworks for each row execute function private.audit_mutation();
do $$ declare t text; begin
  foreach t in array array['dayworks','daywork_lines','daywork_events','daywork_signoffs','daywork_client_authorisations','daywork_photos',
    'contract_daywork_rates','daywork_pricings','daywork_pricing_lines','daywork_commercial_approvals'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  foreach t in array array['daywork_lines','daywork_events','daywork_signoffs','daywork_client_authorisations'] loop
    execute format('create trigger daily_append_only before update or delete on public.%I for each row execute function private.guard_append_only()',t);
    execute format('create trigger daily_audit after insert on public.%I for each row execute function private.audit_mutation()',t);
  end loop;
  foreach t in array array['contract_daywork_rates','daywork_pricings','daywork_pricing_lines','daywork_commercial_approvals'] loop
    execute format('create trigger daily_append_only before update or delete on public.%I for each row execute function private.guard_append_only()',t);
    execute format('create trigger financial_audit after insert on public.%I for each row execute function private.audit_financial_mutation()',t);
  end loop;
end $$;
create trigger daily_append_only before update or delete on public.daywork_photos for each row execute function private.guard_append_only('uploaded_at');
create trigger daily_audit after insert or update on public.daywork_photos for each row execute function private.audit_mutation();

-- A decimal with at most two places, for hours, quantities and rates.
create function private.field_decimal(p_data jsonb,p_key text,p_min numeric,p_max numeric) returns numeric
language plpgsql stable set search_path='' as $$
declare v jsonb:=p_data->p_key; n numeric;
begin
  if v is null or v='null'::jsonb then raise exception 'Missing required field: %',p_key using errcode='22023'; end if;
  if jsonb_typeof(v)<>'number' then raise exception 'Field % must be a number',p_key using errcode='22023'; end if;
  n:=(v::text)::numeric;
  if n<p_min or n>p_max or n<>round(n,2) then
    raise exception 'Field % must be from % to % with at most two decimal places',p_key,p_min,p_max using errcode='22023'; end if;
  return n;
end $$;
create function private.member_name() returns text language sql stable security definer set search_path='' as $$
  select display_name from public.organisation_members where organisation_id=private.current_org() and user_id=auth.uid()
$$;
create function private.record_daywork_event(p_daywork public.dayworks,p_action text,p_note text,p_override boolean default false) returns void
language sql security definer set search_path='' as $$
  insert into public.daywork_events(daywork_id,organisation_id,contract_id,actor_id,actor_name,action,note,owner_override,snapshot)
  values(p_daywork.id,p_daywork.organisation_id,p_daywork.contract_id,auth.uid(),private.member_name(),p_action,p_note,p_override,
    jsonb_build_object('site_status',p_daywork.site_status,'office_status',p_daywork.office_status,'signoff_status',p_daywork.signoff_status,
      'commercial_status',p_daywork.commercial_status,'client_status',p_daywork.client_status,'lines_version',p_daywork.lines_version,'version',p_daywork.version))
$$;
-- Someone who recorded, corrected or sent a daywork submitted it, so they cannot approve it.
create function private.submitted_daywork(p_daywork uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.daywork_events where daywork_id=p_daywork and actor_id=auth.uid() and action in ('record','update_lines','send'))
$$;
create function private.insert_daywork_lines(p_daywork public.dayworks,p_version integer,p_lines jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare line jsonb; n integer:=0; v_kind text; v_role text; v_unit text; v_quantity numeric; v_worked date;
begin
  if p_lines is null or p_lines='null'::jsonb then return 0; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>100 then
    raise exception 'Lines must be a list of at most 100 entries' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop
    perform private.only_keys(line,array['kind','label','role','work_date','quantity','unit']);
    n:=n+1;
    v_kind:=private.field_text(line,'kind',10,true);
    perform private.assert_choice(v_kind,'kind',array['labour','plant','material']);
    if v_kind='labour' then
      v_role:=private.field_text(line,'role',12,true);
      perform private.assert_choice(v_role,'role',array['operative','supervisor']);
      v_unit:=coalesce(nullif(private.field_text(line,'unit',10),''),'hour');
      if v_unit<>'hour' then raise exception 'Labour is recorded in hours' using errcode='22023'; end if;
      v_worked:=private.field_date(line,'work_date',true);
      v_quantity:=private.field_decimal(line,'quantity',0.25,24);
    else
      v_role:=null;
      v_unit:=private.field_text(line,'unit',10,true);
      perform private.assert_choice(v_unit,'unit',array['hour','day','week','each','m2','m','kg','litre','bag','box','tub','tonne']);
      v_worked:=private.field_date(line,'work_date');
      v_quantity:=private.field_decimal(line,'quantity',0.01,100000);
    end if;
    if v_worked>private.site_today() then raise exception 'Work dates cannot be in the future' using errcode='22023'; end if;
    insert into public.daywork_lines(daywork_id,organisation_id,contract_id,lines_version,position,kind,label,role,work_date,quantity,unit,created_by)
      values(p_daywork.id,p_daywork.organisation_id,p_daywork.contract_id,p_version,n,v_kind,private.field_text(line,'label',120,true),v_role,v_worked,v_quantity,v_unit,auth.uid());
  end loop;
  return n;
end $$;
-- Lock a daywork the person may work on; a retry is answered before the version check.
create function private.daywork_for_update(p_daywork uuid) returns public.dayworks
language plpgsql security definer set search_path='' as $$
declare d public.dayworks;
begin
  select * into d from public.dayworks where id=p_daywork and organisation_id=private.current_org() for update;
  if not found or not private.can_supervise_contract(d.contract_id) then raise exception 'This daywork is not available to you' using errcode='42501'; end if;
  return d;
end $$;
create function private.assert_daywork_version(p_daywork public.dayworks,p_version integer) returns void
language plpgsql stable set search_path='' as $$
begin
  if p_version is distinct from p_daywork.version then
    raise exception 'This daywork changed since you opened it. Refresh to see the latest.' using errcode='40001'; end if;
end $$;

create function public.create_daywork(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; area public.work_areas; d public.dayworks; result uuid; n integer; what text; asked date;
begin
  perform private.only_keys(p_data,array['contract_id','work_area_id','description','instructed_by_name','instructed_by_company','instructed_on','lines']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_supervise_contract(c) then
    raise exception 'Only a supervisor or the office on this job can record a daywork' using errcode='42501'; end if;
  result:=private.request_result(org,'create_daywork',p_request_key,p_data);
  if result is not null then return result; end if;
  if private.field_uuid(p_data,'work_area_id') is not null then
    select * into area from public.work_areas where id=private.field_uuid(p_data,'work_area_id') and contract_id=c and organisation_id=org;
    if not found then raise exception 'Choose a location on this job' using errcode='22023'; end if;
  end if;
  what:=private.field_text(p_data,'description',2000,true);
  if length(what)<5 then raise exception 'Say what extra work was done' using errcode='22023'; end if;
  asked:=coalesce(private.field_date(p_data,'instructed_on'),private.site_today());
  if asked>private.site_today() then raise exception 'The date it was asked for cannot be in the future' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('daywork-number:'||c::text,0));
  select coalesce(max(number),0)+1 into n from public.dayworks where contract_id=c;
  insert into public.dayworks(organisation_id,contract_id,number,work_area_id,location_path,description,instructed_by_name,instructed_by_company,
    instructed_on,created_by,created_by_name,request_key)
  values(org,c,n,area.id,case when area.id is null then '{}'::text[] else array(select w.name from unnest(area.path_ids) with ordinality x(id,k)
      join public.work_areas w on w.id=x.id order by x.k) end,
    what,private.field_text(p_data,'instructed_by_name',120,true),nullif(private.field_text(p_data,'instructed_by_company',120),''),
    asked,auth.uid(),private.member_name(),p_request_key)
  returning * into d;
  perform private.insert_daywork_lines(d,1,p_data->'lines');
  perform private.record_daywork_event(d,'record',null);
  perform private.record_request(org,'create_daywork',p_request_key,p_data,d.id);
  return d.id;
end $$;

-- A correction replaces the whole set of lines; earlier sets are kept. Lines are locked once
-- the office has decided, or while the office is reviewing them.
create function public.save_daywork_lines(p_daywork uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb;
begin
  perform private.only_keys(p_data,array['lines']);
  payload:=jsonb_build_object('daywork',p_daywork,'version',p_version,'data',p_data);
  result:=private.request_result(d.organisation_id,'save_daywork_lines',p_request_key,payload);
  if result is not null then return result; end if;
  perform private.assert_daywork_version(d,p_version);
  if d.site_status<>'recorded' then
    raise exception 'The lines can only be changed before it is sent, or when the office asks for more detail' using errcode='22023'; end if;
  update public.dayworks set lines_version=lines_version+1,version=version+1,updated_at=now(),
    commercial_status=case when commercial_status='priced' then 'awaiting_pricing' else commercial_status end
    where id=d.id returning * into d;
  if private.insert_daywork_lines(d,d.lines_version,p_data->'lines')=0 then
    raise exception 'Add at least one line of labour, plant or materials' using errcode='22023'; end if;
  perform private.record_daywork_event(d,'update_lines',null);
  perform private.record_request(d.organisation_id,'save_daywork_lines',p_request_key,payload,d.id);
  return d.id;
end $$;

create function public.send_daywork(p_daywork uuid,p_request_key uuid,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb:=jsonb_build_object('daywork',p_daywork,'version',p_version);
begin
  result:=private.request_result(d.organisation_id,'send_daywork',p_request_key,payload);
  if result is not null then return result; end if;
  perform private.assert_daywork_version(d,p_version);
  if d.site_status<>'recorded' then raise exception 'This daywork has already been sent to the office' using errcode='22023'; end if;
  if not exists(select 1 from public.daywork_lines where daywork_id=d.id and lines_version=d.lines_version) then
    raise exception 'Add at least one line of labour, plant or materials before sending' using errcode='22023'; end if;
  update public.dayworks set site_status='sent',office_status='awaiting_review',version=version+1,updated_at=now() where id=d.id returning * into d;
  perform private.record_daywork_event(d,'send',null);
  perform private.record_request(d.organisation_id,'send_daywork',p_request_key,payload,d.id);
  return d.id;
end $$;

-- The office's decision: approve, ask for more detail, or reject. Nobody approves a daywork
-- they submitted; the owner may, with a reason that is logged.
create function public.decide_daywork(p_daywork uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb; decision text; note text; reason text; override boolean:=false;
begin
  perform private.only_keys(p_data,array['decision','note','override_reason']);
  if not private.can_manage_contract(d.contract_id) then raise exception 'Only the office for this job can decide on a daywork' using errcode='42501'; end if;
  payload:=jsonb_build_object('daywork',p_daywork,'version',p_version,'data',p_data);
  result:=private.request_result(d.organisation_id,'decide_daywork',p_request_key,payload);
  if result is not null then return result; end if;
  perform private.assert_daywork_version(d,p_version);
  decision:=private.field_text(p_data,'decision',20,true);
  perform private.assert_choice(decision,'decision',array['approve','request_detail','reject']);
  note:=nullif(private.field_text(p_data,'note',1000),'');
  reason:=nullif(private.field_text(p_data,'override_reason',1000),'');
  if d.office_status is distinct from 'awaiting_review' then raise exception 'This daywork is not waiting for the office' using errcode='22023'; end if;
  if decision in ('request_detail','reject') and (note is null or length(note)<3) then
    raise exception 'Say what is needed or why it is rejected' using errcode='22023'; end if;
  if decision='approve' and private.submitted_daywork(d.id) then
    if not private.is_owner() then
      raise exception 'You recorded or sent this daywork, so another office user must approve it' using errcode='42501'; end if;
    if reason is null or length(reason)<5 then raise exception 'Give a reason for approving a daywork you submitted' using errcode='22023'; end if;
    override:=true;
  elsif reason is not null then raise exception 'An override reason is only for approving your own daywork' using errcode='22023'; end if;
  update public.dayworks set office_status=case decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'more_detail' end,
    site_status=case when decision='request_detail' then 'recorded' else site_status end,version=version+1,updated_at=now()
    where id=d.id returning * into d;
  perform private.record_daywork_event(d,decision,case when override then reason else note end,override);
  perform private.record_request(d.organisation_id,'decide_daywork',p_request_key,payload,d.id);
  return d.id;
end $$;

-- The client representative's sign-off of the record (or that they refused or were not there).
create function public.record_daywork_signoff(p_daywork uuid,p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb; outcome text;
begin
  perform private.only_keys(p_data,array['outcome','signer_name','signer_position','signer_company','signed_at','reason']);
  payload:=jsonb_build_object('daywork',p_daywork,'data',p_data);
  result:=private.request_result(d.organisation_id,'record_daywork_signoff',p_request_key,payload);
  if result is not null then return result; end if;
  if d.office_status='rejected' then raise exception 'This daywork was rejected by the office' using errcode='22023'; end if;
  outcome:=private.field_text(p_data,'outcome',12,true);
  perform private.assert_choice(outcome,'outcome',array['signed','refused','unavailable']);
  if outcome='signed' and nullif(private.field_text(p_data,'signer_name',120),'') is null then
    raise exception 'Enter the name of the person who signed' using errcode='22023'; end if;
  if outcome<>'signed' and length(coalesce(private.field_text(p_data,'reason',1000),''))<3 then
    raise exception 'Say why it was not signed' using errcode='22023'; end if;
  insert into public.daywork_signoffs(daywork_id,organisation_id,contract_id,outcome,signer_name,signer_position,signer_company,signed_at,reason,
    recorded_by,recorded_by_name,request_key)
  values(d.id,d.organisation_id,d.contract_id,outcome,nullif(private.field_text(p_data,'signer_name',120),''),
    nullif(private.field_text(p_data,'signer_position',120),''),nullif(private.field_text(p_data,'signer_company',120),''),
    coalesce(private.field_timestamp(p_data,'signed_at'),now()),nullif(private.field_text(p_data,'reason',1000),''),auth.uid(),private.member_name(),p_request_key)
  returning id into result;
  update public.dayworks set signoff_status=outcome,version=version+1,updated_at=now() where id=d.id returning * into d;
  perform private.record_daywork_event(d,'sign_off',outcome);
  perform private.record_request(d.organisation_id,'record_daywork_signoff',p_request_key,payload,result);
  return result;
end $$;

-- The client's commercial authorisation of the cost, separate from the signature and from
-- the office's approval. It needs an instruction reference or a document as evidence.
create function public.record_daywork_client_authorisation(p_daywork uuid,p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb; outcome text; doc uuid; ref text; note text; decided date;
begin
  perform private.only_keys(p_data,array['outcome','client_name','decided_on','reference','document_id','note']);
  if not private.can_manage_contract(d.contract_id) then raise exception 'Only the office for this job can record the client''s authorisation' using errcode='42501'; end if;
  payload:=jsonb_build_object('daywork',p_daywork,'data',p_data);
  result:=private.request_result(d.organisation_id,'record_daywork_client_authorisation',p_request_key,payload);
  if result is not null then return result; end if;
  if d.office_status='rejected' then raise exception 'This daywork was rejected by the office' using errcode='22023'; end if;
  outcome:=private.field_text(p_data,'outcome',12,true);
  perform private.assert_choice(outcome,'outcome',array['authorised','declined']);
  doc:=private.field_uuid(p_data,'document_id'); ref:=nullif(private.field_text(p_data,'reference',120),''); note:=nullif(private.field_text(p_data,'note',1000),'');
  decided:=coalesce(private.field_date(p_data,'decided_on'),private.site_today());
  if decided>private.site_today() then raise exception 'The decision date cannot be in the future' using errcode='22023'; end if;
  if doc is not null and not exists(select 1 from public.document_revisions r where r.id=doc and r.contract_id=d.contract_id
    and r.organisation_id=d.organisation_id and r.uploaded_at is not null and private.can_read_document(r.contract_id,r.work_area_id,r.classification)) then
    raise exception 'Choose a document saved on this job' using errcode='22023'; end if;
  if outcome='authorised' and ref is null and doc is null then
    raise exception 'Enter the client''s instruction reference or choose the document that authorises it' using errcode='22023'; end if;
  if outcome='declined' and (note is null or length(note)<3) then raise exception 'Say why the client declined' using errcode='22023'; end if;
  insert into public.daywork_client_authorisations(daywork_id,organisation_id,contract_id,outcome,client_name,decided_on,reference,document_id,note,
    recorded_by,recorded_by_name,request_key)
  values(d.id,d.organisation_id,d.contract_id,outcome,private.field_text(p_data,'client_name',120,true),decided,ref,doc,note,auth.uid(),private.member_name(),p_request_key)
  returning id into result;
  update public.dayworks set client_status=outcome,version=version+1,updated_at=now() where id=d.id returning * into d;
  perform private.record_daywork_event(d,'client_authorisation',outcome);
  perform private.record_request(d.organisation_id,'record_daywork_client_authorisation',p_request_key,payload,result);
  return result;
end $$;

-- A rate for the job (money access). Changing one adds a new version naming the old; retiring
-- one stops it being offered. Prices already worked out keep their own copy.
create function public.save_daywork_rate(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; previous public.contract_daywork_rates; result uuid; v_category text; v_item text; v_unit text; retire boolean;
begin
  perform private.only_keys(p_data,array['contract_id','supersedes_id','category','item','unit','rate','retired']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_view_financials(c) then raise exception 'Money access is required to set daywork rates' using errcode='42501'; end if;
  result:=private.request_result(org,'save_daywork_rate',p_request_key,p_data);
  if result is not null then return result; end if;
  perform pg_advisory_xact_lock(hashtextextended('daywork-rates:'||c::text,0));
  retire:=coalesce(private.field_boolean(p_data,'retired'),false);
  if private.field_uuid(p_data,'supersedes_id') is not null then
    select * into previous from public.contract_daywork_rates where id=private.field_uuid(p_data,'supersedes_id') and contract_id=c and organisation_id=org;
    if not found or previous.retired or exists(select 1 from public.contract_daywork_rates where supersedes_id=previous.id) then
      raise exception 'That rate has already been changed. Refresh to see the current rates.' using errcode='40001'; end if;
    v_category:=previous.category; v_item:=previous.item; v_unit:=previous.unit;
  else
    if retire then raise exception 'Only an existing rate can be retired' using errcode='22023'; end if;
    v_category:=private.field_text(p_data,'category',12,true);
    perform private.assert_choice(v_category,'category',array['operative','supervisor','plant','material']);
    v_item:=private.field_text(p_data,'item',120,true);
    v_unit:=case when v_category in ('operative','supervisor') then 'hour' else private.field_text(p_data,'unit',10,true) end;
    perform private.assert_choice(v_unit,'unit',array['hour','day','week','each','m2','m','kg','litre','bag','box','tub','tonne']);
    if exists(select 1 from public.contract_daywork_rates r where r.contract_id=c and r.category=v_category and lower(r.item)=lower(v_item) and r.unit=v_unit
      and not r.retired and not exists(select 1 from public.contract_daywork_rates n where n.supersedes_id=r.id)) then
      raise exception 'This job already has a rate for that item. Change it instead.' using errcode='22023'; end if;
  end if;
  insert into public.contract_daywork_rates(organisation_id,contract_id,category,item,unit,rate,retired,supersedes_id,created_by,created_by_name,request_key)
  values(org,c,v_category,v_item,v_unit,case when retire then coalesce(previous.rate,0) else private.field_decimal(p_data,'rate',0,100000) end,retire,previous.id,
    auth.uid(),private.member_name(),p_request_key)
  returning id into result;
  perform private.record_request(org,'save_daywork_rate',p_request_key,p_data,result);
  return result;
end $$;

-- What each line can be priced at, without any money: the items and units the job has rates for.
create function public.daywork_rate_items(p_contract uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_supervise_contract(p_contract) then raise exception 'This job is not available to you' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('category',r.category,'item',r.item,'unit',r.unit) order by r.category,lower(r.item),r.unit),'[]')
    from public.contract_daywork_rates r where r.contract_id=p_contract and not r.retired
      and not exists(select 1 from public.contract_daywork_rates n where n.supersedes_id=r.id));
end $$;

-- Price the current lines (money access). Every line needs a current rate of the same kind and
-- unit; the rate is copied onto the price so later rate changes never alter it.
create function public.price_daywork(p_daywork uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb; entry jsonb; v_line public.daywork_lines;
  v_rate public.contract_daywork_rates; v_total numeric:=0; v_count integer; v_priced jsonb:='[]';
begin
  perform private.only_keys(p_data,array['lines']);
  if not private.can_view_financials(d.contract_id) then raise exception 'Money access is required to price a daywork' using errcode='42501'; end if;
  payload:=jsonb_build_object('daywork',p_daywork,'version',p_version,'data',p_data);
  result:=private.request_result(d.organisation_id,'price_daywork',p_request_key,payload);
  if result is not null then return result; end if;
  perform private.assert_daywork_version(d,p_version);
  if d.site_status<>'sent' or d.office_status='rejected' then raise exception 'Only a daywork sent to the office, and not rejected, can be priced' using errcode='22023'; end if;
  if d.commercial_status='commercially_approved' then raise exception 'The charge has already been approved' using errcode='22023'; end if;
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

-- TileSPEC's internal approval of the priced charge (money access). It is not the client's
-- acceptance or agreement to pay. Nobody approves a charge for a daywork they submitted; the
-- owner may, with a reason that is logged. Pricing can never be skipped.
create function public.approve_daywork_charge(p_daywork uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb; pricing public.daywork_pricings; reason text; override boolean:=false;
begin
  perform private.only_keys(p_data,array['note','override_reason']);
  if not private.can_view_financials(d.contract_id) then raise exception 'Money access is required to approve a charge' using errcode='42501'; end if;
  payload:=jsonb_build_object('daywork',p_daywork,'version',p_version,'data',p_data);
  result:=private.request_result(d.organisation_id,'approve_daywork_charge',p_request_key,payload);
  if result is not null then return result; end if;
  perform private.assert_daywork_version(d,p_version);
  if d.office_status is distinct from 'approved' then raise exception 'The office must approve the daywork before its charge' using errcode='22023'; end if;
  if d.commercial_status<>'priced' then raise exception 'Price every line before approving the charge' using errcode='22023'; end if;
  select * into pricing from public.daywork_pricings where daywork_id=d.id order by priced_at desc,id desc limit 1;
  if not found or pricing.lines_version<>d.lines_version then raise exception 'Price every line before approving the charge' using errcode='22023'; end if;
  reason:=nullif(private.field_text(p_data,'override_reason',1000),'');
  if private.submitted_daywork(d.id) then
    if not private.is_owner() then raise exception 'You recorded or sent this daywork, so another office user must approve its charge' using errcode='42501'; end if;
    if reason is null or length(reason)<5 then raise exception 'Give a reason for approving the charge on a daywork you submitted' using errcode='22023'; end if;
    override:=true;
  elsif reason is not null then raise exception 'An override reason is only for your own daywork' using errcode='22023'; end if;
  insert into public.daywork_commercial_approvals(daywork_id,organisation_id,contract_id,pricing_id,note,owner_override,override_reason,approved_by,approved_by_name,request_key)
    values(d.id,d.organisation_id,d.contract_id,pricing.id,nullif(private.field_text(p_data,'note',1000),''),override,case when override then reason end,
      auth.uid(),private.member_name(),p_request_key)
    returning id into result;
  update public.dayworks set commercial_status='commercially_approved',version=version+1,updated_at=now() where id=d.id returning * into d;
  perform private.record_daywork_event(d,'commercial_approval',case when override then reason end,override);
  perform private.record_request(d.organisation_id,'approve_daywork_charge',p_request_key,payload,result);
  return result;
end $$;

create function public.reserve_daywork_photo(p_daywork uuid,p_request_key uuid,p_purpose text,p_meta jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks; result uuid; payload jsonb; mime text; hash text; size integer;
begin
  perform private.only_keys(p_meta,array['mime_type','sha256','bytes']);
  select * into d from public.dayworks where id=p_daywork for share;
  if not found or not private.can_upload_daywork_photo(d.id,p_purpose) then raise exception 'Daywork photograph permission required' using errcode='42501'; end if;
  payload:=jsonb_build_object('daywork',p_daywork,'purpose',p_purpose,'meta',p_meta);
  result:=private.request_result(d.organisation_id,'reserve_daywork_photo',p_request_key,payload); if result is not null then return result; end if;
  mime:=private.field_text(p_meta,'mime_type',30,true); hash:=private.field_text(p_meta,'sha256',64,true); size:=private.field_integer(p_meta,'bytes',1,4194304);
  if mime not in ('image/jpeg','image/png') or hash !~ '^[0-9a-f]{64}$' or size is null then raise exception 'Choose a JPEG or PNG up to 4 MB with its exact hash' using errcode='22023'; end if;
  result:=gen_random_uuid();
  insert into public.daywork_photos(id,daywork_id,organisation_id,contract_id,actor_id,purpose,object_path,sha256,bytes,mime_type)
  values(result,d.id,d.organisation_id,d.contract_id,auth.uid(),p_purpose,
    d.organisation_id::text||'/dayworks/'||d.id::text||'/'||result::text||case mime when 'image/png' then '.png' else '.jpg' end,hash,size,mime);
  perform private.record_request(d.organisation_id,'reserve_daywork_photo',p_request_key,payload,result); return result;
end $$;
create function public.complete_daywork_photo(p_photo uuid,p_actor uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.daywork_photos; claims text; sub text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Trusted server verification required' using errcode='42501'; end if;
  select * into p from public.daywork_photos where id=p_photo for update;
  if not found or p.actor_id is distinct from p_actor or p.sha256 is distinct from p_sha256 then raise exception 'Verified actor and bytes must match the reservation' using errcode='42501'; end if;
  claims:=current_setting('request.jwt.claims',true); sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',p_actor)::text,true); perform set_config('request.jwt.claim.sub',p_actor::text,true);
  if not private.can_upload_daywork_photo(p.daywork_id,p.purpose) then raise exception 'Uploader no longer has permission for this daywork' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
    raise exception 'Stored photograph does not match the reservation' using errcode='23514'; end if;
  if p.uploaded_at is null then update public.daywork_photos set uploaded_at=now() where id=p.id; end if;
  perform set_config('request.jwt.claims',coalesce(claims,''),true); perform set_config('request.jwt.claim.sub',coalesce(sub,''),true);
end $$;

-- Job messages (M1), when installed, may also be about a daywork. Nothing else about them changes.
do $outer$ begin
  if to_regclass('public.job_messages') is not null then
    alter table public.job_messages drop constraint job_messages_about_type_check;
    alter table public.job_messages add constraint job_messages_about_type_check
      check(about_type in ('job','snag','hold','office_item','qa_result','handover','daywork'));
    create or replace function public.post_job_message(p_request_key uuid,p_data jsonb) returns uuid
    language plpgsql security definer set search_path='' as $fn$
    declare org uuid:=private.current_org(); c uuid; t uuid; thread public.job_messages; side text; site uuid; result uuid;
      kind text; about uuid; message text; asks boolean;
    begin
      perform private.only_keys(p_data,array['contract_id','thread_id','about_type','about_id','body','needs_answer']);
      c:=private.field_uuid(p_data,'contract_id',true);
      t:=private.field_uuid(p_data,'thread_id');
      if t is null then
        if private.current_role() is distinct from 'supervisor' or not private.can_supervise_contract(c) then
          raise exception 'Only a supervisor on this site can start a conversation; the office sends an instruction' using errcode='42501'; end if;
        side:='site'; site:=auth.uid();
      else
        select * into thread from public.job_messages where id=t and organisation_id=org and contract_id=c and thread_id=id;
        if not found then raise exception 'This conversation is not available to you' using errcode='42501'; end if;
        if private.can_manage_contract(c) then side:='office';
        elsif thread.site_user_id=auth.uid() and private.current_role()='supervisor' and private.can_supervise_contract(c) then side:='site';
        else raise exception 'This conversation is not available to you' using errcode='42501'; end if;
        site:=thread.site_user_id;
      end if;
      result:=private.request_result(org,'post_job_message',p_request_key,p_data);
      if result is not null then return result; end if;
      message:=private.field_text(p_data,'body',2000,true);
      asks:=coalesce(private.field_boolean(p_data,'needs_answer'),false);
      if t is null then
        kind:=coalesce(nullif(private.field_text(p_data,'about_type',20),''),'job');
        perform private.assert_choice(kind,'about_type',array['job','snag','hold','office_item','qa_result','handover','daywork']);
        about:=private.field_uuid(p_data,'about_id');
        if kind='job' then
          if about is not null then raise exception 'A message about the whole job names no record' using errcode='22023'; end if;
        elsif about is null or not (case kind
          when 'snag' then exists(select 1 from public.supervisor_issues where id=about and contract_id=c and organisation_id=org and snag_status is not null)
            and private.can_read_snag(about)
          when 'hold' then exists(select 1 from public.work_holds where id=about and contract_id=c and organisation_id=org) and private.can_read_work_hold(about)
          when 'office_item' then exists(select 1 from public.supervisor_office_items where id=about and contract_id=c and organisation_id=org
            and (recipient_id is null or recipient_id=auth.uid()))
          when 'qa_result' then exists(select 1 from public.supervisor_qa_submissions s join public.supervisor_office_items i on i.id=s.item_id
            where s.id=about and s.contract_id=c and s.organisation_id=org and (i.recipient_id is null or i.recipient_id=auth.uid()))
          when 'handover' then exists(select 1 from public.site_handovers where id=about and contract_id=c and organisation_id=org)
          when 'daywork' then exists(select 1 from public.dayworks where id=about and contract_id=c and organisation_id=org) and private.can_read_daywork(about)
          else false end) then
          raise exception 'Choose a record on this job that you can see' using errcode='22023'; end if;
        result:=gen_random_uuid();
        insert into public.job_messages(id,organisation_id,contract_id,thread_id,site_user_id,author_id,author_name,author_side,body,needs_answer,about_type,about_id,request_key)
          values(result,org,c,result,site,auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),
            side,message,asks,kind,about,p_request_key);
      else
        insert into public.job_messages(organisation_id,contract_id,thread_id,site_user_id,author_id,author_name,author_side,body,needs_answer,request_key)
          values(org,c,t,site,auth.uid(),(select display_name from public.organisation_members where organisation_id=org and user_id=auth.uid()),
            side,message,asks,p_request_key) returning id into result;
      end if;
      perform private.record_request(org,'post_job_message',p_request_key,p_data,result);
      return result;
    end $fn$;
  end if;
end $outer$;

-- Only read-only predicates used by policies can be called by authenticated clients.
revoke all on function private.can_read_daywork(uuid),private.can_upload_daywork_photo(uuid,text),private.can_insert_daywork_object(text),
  private.can_read_daywork_object(text),private.audit_financial_mutation(),private.guard_daywork(),private.field_decimal(jsonb,text,numeric,numeric),
  private.member_name(),private.record_daywork_event(public.dayworks,text,text,boolean),private.submitted_daywork(uuid),
  private.insert_daywork_lines(public.dayworks,integer,jsonb),private.daywork_for_update(uuid),private.assert_daywork_version(public.dayworks,integer)
  from public,anon,authenticated;
grant execute on function private.can_read_daywork(uuid),private.can_upload_daywork_photo(uuid,text),private.can_insert_daywork_object(text),
  private.can_read_daywork_object(text) to authenticated;
revoke all on function public.create_daywork(uuid,jsonb),public.save_daywork_lines(uuid,uuid,integer,jsonb),public.send_daywork(uuid,uuid,integer),
  public.decide_daywork(uuid,uuid,integer,jsonb),public.record_daywork_signoff(uuid,uuid,jsonb),public.record_daywork_client_authorisation(uuid,uuid,jsonb),
  public.save_daywork_rate(uuid,jsonb),public.daywork_rate_items(uuid),public.price_daywork(uuid,uuid,integer,jsonb),
  public.approve_daywork_charge(uuid,uuid,integer,jsonb),public.reserve_daywork_photo(uuid,uuid,text,jsonb),public.complete_daywork_photo(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.create_daywork(uuid,jsonb),public.save_daywork_lines(uuid,uuid,integer,jsonb),public.send_daywork(uuid,uuid,integer),
  public.decide_daywork(uuid,uuid,integer,jsonb),public.record_daywork_signoff(uuid,uuid,jsonb),public.record_daywork_client_authorisation(uuid,uuid,jsonb),
  public.save_daywork_rate(uuid,jsonb),public.daywork_rate_items(uuid),public.price_daywork(uuid,uuid,integer,jsonb),
  public.approve_daywork_charge(uuid,uuid,integer,jsonb),public.reserve_daywork_photo(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.complete_daywork_photo(uuid,uuid,text) to service_role;
commit;
