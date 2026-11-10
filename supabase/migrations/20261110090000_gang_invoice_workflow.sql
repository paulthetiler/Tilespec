-- Gang invoices: gangs claim the work, supervisors verify the work, the office approves the money.
--
--  * A gang (a team whose members log in as installers) sends an invoice for a job it is set up
--    on: the document, the quantity per location and unit. Sending it never authorises payment.
--  * Sending creates exactly one open verification request for the job. Supervisors assigned to
--    the job see it counted on their site; with no supervisor assigned it goes to the office.
--  * The supervisor checks quantities and workmanship against the measurement ledger
--    (gang_progress_checks). Every measurement is INCREMENTAL: new work in its period, never a
--    running total. Verified quantity can never exceed passed work not already approved or
--    verified on another open invoice, so the same work cannot be paid twice.
--  * Supervisors never see rates, invoice amounts, the invoice document or payment totals: those
--    live in separate money tables that only money-access office users can read.
--  * Office users with money access approve, adjust, query, return, reject and record payment.
--  * Every decision is an append-only event; recorded claims and measurements are never rewritten.
-- Additive and transactional. Existing records are preserved.
begin;

do $$ begin
  if to_regclass('public.gang_progress_checks') is null or to_regclass('public.teams') is null
    or to_regclass('public.job_cost_entries') is null or to_regclass('public.contract_assignments') is null
    or to_regprocedure('private.my_team_ids()') is null or to_regprocedure('private.can_supervise_contract(uuid)') is null
    or to_regprocedure('private.can_view_financials(uuid)') is null or to_regprocedure('private.only_keys(jsonb,text[])') is null
    or to_regprocedure('private.field_decimal(jsonb,text,numeric,numeric)') is null or to_regprocedure('private.member_name()') is null
    or to_regprocedure('private.request_result(uuid,text,uuid,jsonb)') is null or to_regprocedure('private.audit_mutation()') is null
    or to_regprocedure('private.audit_financial_mutation()') is null or to_regprocedure('private.site_today()') is null
    or to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Preflight failed: gang_progress_checks (20261109225148), teams, job costs and storage are required';
  end if;
  if not exists (select 1 from storage.buckets b where b.id = 'gang-claims' and not b.public and b.file_size_limit >= 4194304
    and b.allowed_mime_types @> array['application/pdf','image/jpeg','image/png']) then
    raise exception 'Preflight failed: create the private gang-claims bucket (4 MB; PDF, JPEG, PNG) before applying, as described in supabase/README.md';
  end if;
  if to_regclass('public.gang_invoices') is not null or to_regclass('public.gang_subcontracts') is not null
    or exists(select 1 from pg_attribute where attrelid='public.gang_progress_checks'::regclass and attname='unit' and not attisdropped) then
    raise exception 'Preflight failed: gang invoice objects already exist; review schema drift';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. The measurement ledger: explicit, incremental, job-specific and never overwritten.
-- ---------------------------------------------------------------------------------------------
alter table public.gang_progress_checks
  alter column quantity_m2 drop not null,
  add column quantity numeric(12,2),
  add column unit text not null default 'm2' check (unit in ('m2','lm','item')),
  add column period_start date,
  add column measure_basis text not null default 'incremental' check (measure_basis = 'incremental'),
  add column source_invoice_id uuid,
  add column checked_by_name text check (checked_by_name is null or length(checked_by_name) <= 200),
  add column request_key uuid,
  add column correction_status text check (correction_status in ('open','cleared')),
  add column correction_cleared_at timestamptz,
  add column correction_cleared_by uuid references auth.users(id),
  add column correction_cleared_note text check (correction_cleared_note is null or length(trim(correction_cleared_note)) between 3 and 2000),
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users(id),
  add column void_reason text check (void_reason is null or length(trim(void_reason)) between 5 and 2000);
update public.gang_progress_checks set quantity = quantity_m2,
  correction_status = case when quality_status = 'correction_required' then 'open' end;
alter table public.gang_progress_checks
  alter column quantity set not null,
  add constraint gang_progress_quantity check (quantity > 0 and quantity < 100000),
  add constraint gang_progress_period check (period_start is null or period_start <= measured_on),
  add constraint gang_progress_correction check ((quality_status = 'correction_required') = (correction_status is not null)),
  add constraint gang_progress_cleared check ((correction_status = 'cleared') = (correction_cleared_at is not null)
    and (correction_cleared_at is null) = (correction_cleared_by is null)),
  add constraint gang_progress_void check (num_nulls(voided_at, voided_by, void_reason) in (0,3));
create unique index gang_progress_request on public.gang_progress_checks(checked_by, request_key) where request_key is not null;
create index gang_progress_ledger on public.gang_progress_checks(contract_id, team_id, work_area_id, unit) where voided_at is null;

-- Old and new writers both arrive here: quantity_m2 (legacy screen) or quantity + unit.
create function private.prepare_gang_progress() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.quantity is null then new.quantity := new.quantity_m2; new.unit := 'm2'; end if;
  new.quantity_m2 := case when new.unit = 'm2' then new.quantity end;
  new.measure_basis := 'incremental';
  new.correction_status := case when new.quality_status = 'correction_required' then 'open' end;
  new.correction_cleared_at := null; new.correction_cleared_by := null; new.correction_cleared_note := null;
  new.voided_at := null; new.voided_by := null; new.void_reason := null;
  new.checked_at := now();
  new.checked_by_name := coalesce(new.checked_by_name, private.member_name());
  if new.measured_on > private.site_today() then raise exception 'A measurement cannot be dated in the future' using errcode='22023'; end if;
  return new;
end $$;
create trigger gang_progress_prepare before insert on public.gang_progress_checks for each row execute function private.prepare_gang_progress();

-- A measurement is permanent. Only clearing a correction (once) or voiding with a reason (once).
create function private.guard_gang_progress() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Measurements are permanent; void one with a reason instead' using errcode='42501'; end if;
  if (to_jsonb(new) - array['correction_status','correction_cleared_at','correction_cleared_by','correction_cleared_note','voided_at','voided_by','void_reason'])
    is distinct from (to_jsonb(old) - array['correction_status','correction_cleared_at','correction_cleared_by','correction_cleared_note','voided_at','voided_by','void_reason']) then
    raise exception 'A recorded measurement cannot be rewritten' using errcode='42501'; end if;
  if old.voided_at is not null then raise exception 'This measurement was voided' using errcode='42501'; end if;
  if old.correction_status = 'cleared' and new.correction_status is distinct from 'cleared' then
    raise exception 'A cleared correction stays cleared' using errcode='42501'; end if;
  if old.correction_cleared_at is not null and (new.correction_cleared_at, new.correction_cleared_by, new.correction_cleared_note)
    is distinct from (old.correction_cleared_at, old.correction_cleared_by, old.correction_cleared_note) then
    raise exception 'A cleared correction cannot be rewritten' using errcode='42501'; end if;
  return new;
end $$;
create trigger gang_progress_guard before update or delete on public.gang_progress_checks for each row execute function private.guard_gang_progress();
create trigger gang_progress_audit after insert or update on public.gang_progress_checks for each row execute function private.audit_mutation();

-- Job-specific access replaces the organisation-wide foundation policies.
drop policy "site staff read progress" on public.gang_progress_checks;
drop policy "site staff record progress" on public.gang_progress_checks;
create policy gang_progress_read on public.gang_progress_checks for select to authenticated using (
  organisation_id = private.current_org() and private.can_supervise_contract(contract_id));
-- Kept for the original measurement screen; new screens use record_gang_measurement().
create policy gang_progress_record on public.gang_progress_checks for insert to authenticated with check (
  checked_by = auth.uid() and organisation_id = private.current_org() and private.can_supervise_contract(contract_id)
  and source_invoice_id is null
  and exists (select 1 from public.teams t where t.id = team_id and t.organisation_id = gang_progress_checks.organisation_id)
  and exists (select 1 from public.work_areas w where w.id = work_area_id and w.contract_id = gang_progress_checks.contract_id and w.archived_at is null));
revoke all on public.gang_progress_checks from public, anon, authenticated;
grant select, insert on public.gang_progress_checks to authenticated;
-- The hosted programme table (20261108132214) only revoked anon, leaving Supabase's default
-- TRUNCATE/UPDATE/DELETE grants to signed-in users. Keep exactly what the app uses.
revoke all on public.site_programme_revisions from public, anon, authenticated;
grant select, insert on public.site_programme_revisions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. A gang on a job, its payment terms and its agreed rates (money records).
-- ---------------------------------------------------------------------------------------------
create table public.gang_subcontracts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  team_id uuid not null,
  payment_cycle text not null default 'weekly' check (payment_cycle in ('weekly','fortnightly','custom')),
  -- ISO weekday the invoice week ends and payments are made: 1 Monday ... 5 Friday ... 7 Sunday.
  pay_weekday integer not null default 5 check (pay_weekday between 1 and 7),
  -- Days from the end of the invoice period (weekly/fortnightly) or from the invoice (custom) to payment.
  payment_days integer not null default 7 check (payment_days between 0 and 90),
  -- Fortnightly: one period-end date the cycle repeats from every fourteen days.
  cycle_anchor date,
  terms_note text not null default '' check (length(terms_note) <= 2000),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organisation_id, contract_id, team_id),
  unique (organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id) references public.contracts(organisation_id, id),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  check (payment_cycle <> 'fortnightly' or cycle_anchor is not null)
);
create table public.gang_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  subcontract_id uuid not null,
  team_id uuid not null,
  -- A rate for one location (and the locations within it), or every location when empty.
  work_area_id uuid,
  unit text not null check (unit in ('m2','lm','item')),
  rate numeric(10,2) not null check (rate > 0 and rate <= 100000),
  description text not null default '' check (length(description) <= 200),
  effective_from date not null,
  created_by uuid not null references auth.users(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  request_key uuid not null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text check (void_reason is null or length(trim(void_reason)) between 3 and 1000),
  unique (organisation_id, created_by, request_key),
  foreign key (organisation_id, contract_id, subcontract_id) references public.gang_subcontracts(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, work_area_id) references public.work_areas(organisation_id, contract_id, id),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  check (num_nulls(voided_at, voided_by, void_reason) in (0,3))
);
create index gang_rates_lookup on public.gang_rates(subcontract_id, unit, effective_from desc) where voided_at is null;

-- ---------------------------------------------------------------------------------------------
-- 3. Invoices (operational), their claimed lines, files, events and verification requests.
-- ---------------------------------------------------------------------------------------------
create sequence private.gang_invoice_reference_seq;
create table public.gang_invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  team_id uuid not null,
  subcontract_id uuid not null,
  reference text not null check (reference ~ '^GI-[0-9]{5,}$'),
  status text not null check (status in ('uploading','awaiting_check','with_office','query_gang','returned',
    'approved','paid','rejected','cancelled','superseded')),
  routed_to text not null check (routed_to in ('supervisor','office')),
  assigned_supervisor_id uuid references auth.users(id),
  period_start date,
  period_end date not null,
  gang_note text not null default '' check (length(gang_note) <= 2000),
  submitted_by uuid not null references auth.users(id),
  submitted_by_name text not null,
  submitted_at timestamptz not null default now(),
  request_key uuid not null,
  replaces_invoice_id uuid,
  superseded_by uuid,
  workmanship text check (workmanship in ('satisfactory','correction_needed')),
  verified_by uuid references auth.users(id),
  verified_by_name text,
  verified_at timestamptz,
  supervisor_note text check (supervisor_note is null or length(supervisor_note) <= 2000),
  correction_note text check (correction_note is null or length(correction_note) <= 2000),
  office_decided_by uuid references auth.users(id),
  office_decided_at timestamptz,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  unique (organisation_id, submitted_by, request_key),
  unique (organisation_id, contract_id, id),
  unique (reference),
  foreign key (organisation_id, contract_id) references public.contracts(organisation_id, id),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  foreign key (organisation_id, contract_id, subcontract_id) references public.gang_subcontracts(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, replaces_invoice_id) references public.gang_invoices(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, superseded_by) references public.gang_invoices(organisation_id, contract_id, id),
  check (period_start is null or period_start <= period_end),
  check (status not in ('with_office','query_gang','approved','paid') or (verified_at is not null and workmanship is not null)),
  check (workmanship is distinct from 'correction_needed' or length(trim(coalesce(correction_note,''))) >= 3),
  check ((status = 'superseded') = (superseded_by is not null))
);
create unique index gang_invoice_one_replacement on public.gang_invoices(replaces_invoice_id)
  where replaces_invoice_id is not null and status not in ('cancelled');
create index gang_invoices_contract on public.gang_invoices(contract_id, status, submitted_at desc);
create index gang_invoices_team on public.gang_invoices(team_id, submitted_at desc);

create table public.gang_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  invoice_id uuid not null,
  team_id uuid not null,
  line_no integer not null check (line_no between 1 and 20),
  work_area_id uuid not null,
  unit text not null check (unit in ('m2','lm','item')),
  claimed_quantity numeric(12,2) not null check (claimed_quantity > 0 and claimed_quantity < 100000),
  description text not null default '' check (length(description) <= 200),
  verified_quantity numeric(12,2) check (verified_quantity >= 0 and verified_quantity < 100000),
  line_quality text check (line_quality in ('passed','correction_required')),
  verification_note text check (verification_note is null or length(verification_note) <= 1000),
  approved_quantity numeric(12,2) check (approved_quantity >= 0),
  unique (invoice_id, line_no),
  unique (invoice_id, work_area_id, unit),
  foreign key (organisation_id, contract_id, invoice_id) references public.gang_invoices(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, work_area_id) references public.work_areas(organisation_id, contract_id, id),
  check (verified_quantity is null or verified_quantity <= claimed_quantity),
  check ((verified_quantity is null) = (line_quality is null)),
  check (approved_quantity is null or (verified_quantity is not null and approved_quantity <= verified_quantity))
);
create index gang_invoice_lines_ledger on public.gang_invoice_lines(contract_id, team_id, work_area_id, unit);

create table public.gang_invoice_files (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  invoice_id uuid not null,
  team_id uuid not null,
  -- The invoice document is a money record. Photos are operational evidence.
  kind text not null check (kind in ('invoice','gang_photo','supervisor_photo')),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  bytes bigint not null check (bytes > 0 and bytes <= 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references auth.users(id),
  request_key uuid not null,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  unique (organisation_id, uploaded_by, kind, request_key),
  foreign key (organisation_id, contract_id, invoice_id) references public.gang_invoices(organisation_id, contract_id, id),
  check (kind = 'invoice' or mime_type in ('image/jpeg','image/png')),
  check (object_path = organisation_id::text || '/' || contract_id::text || '/' || invoice_id::text || '/' || kind || '/' || id::text
    || case mime_type when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end)
);
create unique index gang_invoice_one_document on public.gang_invoice_files(invoice_id) where kind = 'invoice';
create index gang_invoice_files_hash on public.gang_invoice_files(team_id, sha256) where kind = 'invoice';

-- The money side of an invoice, readable only by office users with money access.
create table public.gang_invoice_commercials (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique,
  organisation_id uuid not null,
  contract_id uuid not null,
  invoice_number text check (invoice_number is null or length(trim(invoice_number)) between 1 and 60),
  invoice_total numeric(14,2) check (invoice_total is null or (invoice_total >= 0 and invoice_total <= 10000000)),
  payment_due_on date not null,
  agreed_payment_on date,
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount between 0 and 10000000),
  adjustment_amount numeric(14,2) not null default 0 check (adjustment_amount between -10000000 and 10000000),
  adjustment_reason text check (adjustment_reason is null or length(trim(adjustment_reason)) between 3 and 1000),
  line_rates jsonb,
  approval_note text check (approval_note is null or length(approval_note) <= 2000),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  paid_on date,
  paid_amount numeric(14,2) check (paid_amount is null or paid_amount between 0 and 10000000),
  payment_reference text check (payment_reference is null or length(trim(payment_reference)) between 1 and 120),
  paid_recorded_by uuid references auth.users(id),
  paid_recorded_at timestamptz,
  job_cost_entry_id uuid references public.job_cost_entries(id),
  foreign key (organisation_id, contract_id, invoice_id) references public.gang_invoices(organisation_id, contract_id, id),
  check (adjustment_amount = 0 or adjustment_reason is not null),
  check ((approved_at is null) = (approved_by is null) and (approved_at is null) = (approved_amount is null)),
  check ((paid_recorded_at is null) = (paid_on is null) and (paid_on is null) = (paid_amount is null)),
  check (paid_on is null or approved_at is not null)
);

-- One open request per invoice: retries and repeated submissions cannot duplicate it.
create table public.gang_verification_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  invoice_id uuid not null,
  reason text not null check (reason in ('submitted','resubmitted','office_recheck')),
  routed_to text not null check (routed_to in ('supervisor','office')),
  assigned_supervisor_id uuid references auth.users(id),
  office_note text check (office_note is null or length(office_note) <= 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolution text check (resolution in ('verified','cancelled','withdrawn')),
  foreign key (organisation_id, contract_id, invoice_id) references public.gang_invoices(organisation_id, contract_id, id),
  check ((resolved_at is null) = (resolution is null) and (resolved_at is null) = (resolved_by is null))
);
create unique index gang_verification_one_open on public.gang_verification_requests(invoice_id) where resolved_at is null;
create index gang_verification_open on public.gang_verification_requests(contract_id) where resolved_at is null;

create table public.gang_invoice_events (
  id bigint generated always as identity primary key,
  organisation_id uuid not null,
  contract_id uuid not null,
  invoice_id uuid not null,
  actor_id uuid references auth.users(id),
  actor_name text not null,
  action text not null check (length(action) between 1 and 40),
  from_status text,
  to_status text,
  note text check (note is null or length(note) <= 2000),
  -- all: the gang, site and office. site: supervisors and office. office: money access only.
  visibility text not null default 'all' check (visibility in ('all','site','office')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organisation_id, contract_id, invoice_id) references public.gang_invoices(organisation_id, contract_id, id)
);
create index gang_invoice_events_invoice on public.gang_invoice_events(invoice_id, id);

-- ---------------------------------------------------------------------------------------------
-- 4. Who may see what. Hiding a button is never the control: these policies are.
-- ---------------------------------------------------------------------------------------------
create function private.is_gang_member(p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.current_role() in ('lead_installer','subcontract_installer'), false) and p_team = any(private.my_team_ids())
$$;
create function private.can_see_gang_invoice(p_contract uuid, p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.can_supervise_contract(p_contract) or private.is_gang_member(p_team)
$$;
create function private.can_read_gang_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.gang_invoice_files f where f.object_path = p_path and (
    f.uploaded_by = auth.uid()
    or (f.uploaded_at is not null and case when f.kind = 'invoice'
      then private.can_view_financials(f.contract_id) or private.is_gang_member(f.team_id)
      else private.can_see_gang_invoice(f.contract_id, f.team_id) end)))
$$;
create function private.can_upload_gang_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.gang_invoice_files f where f.object_path = p_path and f.uploaded_by = auth.uid() and f.uploaded_at is null)
$$;

alter table public.gang_subcontracts enable row level security;
alter table public.gang_rates enable row level security;
alter table public.gang_invoices enable row level security;
alter table public.gang_invoice_lines enable row level security;
alter table public.gang_invoice_files enable row level security;
alter table public.gang_invoice_commercials enable row level security;
alter table public.gang_verification_requests enable row level security;
alter table public.gang_invoice_events enable row level security;

create policy gang_subcontract_read on public.gang_subcontracts for select to authenticated using (
  organisation_id = private.current_org() and private.can_view_financials(contract_id));
create policy gang_rate_read on public.gang_rates for select to authenticated using (
  organisation_id = private.current_org() and private.can_view_financials(contract_id));
create policy gang_invoice_read on public.gang_invoices for select to authenticated using (
  organisation_id = private.current_org() and status <> 'uploading' and private.can_see_gang_invoice(contract_id, team_id)
  or (organisation_id = private.current_org() and private.is_gang_member(team_id)));
create policy gang_invoice_line_read on public.gang_invoice_lines for select to authenticated using (
  organisation_id = private.current_org() and private.can_see_gang_invoice(contract_id, team_id));
create policy gang_invoice_file_read on public.gang_invoice_files for select to authenticated using (
  organisation_id = private.current_org() and (uploaded_by = auth.uid() or (uploaded_at is not null and case when kind = 'invoice'
    then private.can_view_financials(contract_id) or private.is_gang_member(team_id)
    else private.can_see_gang_invoice(contract_id, team_id) end)));
create policy gang_invoice_commercial_read on public.gang_invoice_commercials for select to authenticated using (
  organisation_id = private.current_org() and private.can_view_financials(contract_id));
create policy gang_verification_read on public.gang_verification_requests for select to authenticated using (
  organisation_id = private.current_org() and private.can_supervise_contract(contract_id));
create policy gang_invoice_event_read on public.gang_invoice_events for select to authenticated using (
  organisation_id = private.current_org() and case visibility
    when 'office' then private.can_view_financials(contract_id)
    when 'site' then private.can_supervise_contract(contract_id)
    else exists (select 1 from public.gang_invoices i where i.id = invoice_id and private.can_see_gang_invoice(i.contract_id, i.team_id)) end);

do $$ declare t text; begin
  foreach t in array array['gang_subcontracts','gang_rates','gang_invoices','gang_invoice_lines','gang_invoice_files',
    'gang_invoice_commercials','gang_verification_requests','gang_invoice_events'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
revoke all on sequence private.gang_invoice_reference_seq from public, anon, authenticated;

-- Private storage (the gang-claims bucket, checked in the preflight): invoices and photos are
-- read and written only through these policies.
create policy gang_claims_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'gang-claims' and private.can_upload_gang_file(name));
create policy gang_claims_read on storage.objects for select to authenticated using (
  bucket_id = 'gang-claims' and private.can_read_gang_file(name));

-- ---------------------------------------------------------------------------------------------
-- 5. Integrity guards: recorded claims, events and decisions are never rewritten.
-- ---------------------------------------------------------------------------------------------
create function private.guard_gang_invoice() returns trigger language plpgsql security definer set search_path='' as $$
declare allowed text[];
begin
  if tg_op = 'DELETE' then raise exception 'Gang invoices are permanent' using errcode='42501'; end if;
  if (to_jsonb(new) - array['status','superseded_by','workmanship','verified_by','verified_by_name','verified_at','supervisor_note',
      'correction_note','office_decided_by','office_decided_at','version','updated_at'])
    is distinct from (to_jsonb(old) - array['status','superseded_by','workmanship','verified_by','verified_by_name','verified_at','supervisor_note',
      'correction_note','office_decided_by','office_decided_at','version','updated_at']) then
    raise exception 'The invoice the gang sent cannot be rewritten' using errcode='42501'; end if;
  if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
    raise exception 'A replaced invoice stays replaced' using errcode='42501'; end if;
  if new.status is distinct from old.status then
    allowed := case old.status
      when 'uploading' then array['awaiting_check','cancelled']
      when 'awaiting_check' then array['with_office','cancelled','returned','rejected']
      when 'with_office' then array['approved','awaiting_check','query_gang','returned','rejected']
      when 'query_gang' then array['with_office','awaiting_check','returned','rejected','cancelled']
      when 'returned' then array['superseded','cancelled','rejected']
      when 'approved' then array['paid']
      else array[]::text[] end;
    if not (new.status = any(allowed)) then
      raise exception 'An invoice cannot move from % to %', old.status, new.status using errcode='42501'; end if;
    if new.version <> old.version + 1 then raise exception 'Invoice changes must advance its version' using errcode='42501'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger gang_invoice_guard before update or delete on public.gang_invoices for each row execute function private.guard_gang_invoice();

create function private.guard_gang_invoice_line() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Claimed lines are permanent' using errcode='42501'; end if;
  if (to_jsonb(new) - array['verified_quantity','line_quality','verification_note','approved_quantity'])
    is distinct from (to_jsonb(old) - array['verified_quantity','line_quality','verification_note','approved_quantity']) then
    raise exception 'The quantity the gang claimed cannot be rewritten' using errcode='42501'; end if;
  if old.approved_quantity is not null and (new.approved_quantity, new.verified_quantity, new.line_quality)
    is distinct from (old.approved_quantity, old.verified_quantity, old.line_quality) then
    raise exception 'An approved quantity is final' using errcode='42501'; end if;
  return new;
end $$;
create trigger gang_invoice_line_guard before update or delete on public.gang_invoice_lines for each row execute function private.guard_gang_invoice_line();

create function private.guard_gang_invoice_file() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' or (to_jsonb(new) - 'uploaded_at') is distinct from (to_jsonb(old) - 'uploaded_at')
    or old.uploaded_at is not null or new.uploaded_at is null then
    raise exception 'Uploaded files are permanent' using errcode='42501'; end if;
  return new;
end $$;
create trigger gang_invoice_file_guard before update or delete on public.gang_invoice_files for each row execute function private.guard_gang_invoice_file();

create function private.guard_gang_commercial() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Invoice money records are permanent' using errcode='42501'; end if;
  if (new.id, new.invoice_id, new.organisation_id, new.contract_id, new.invoice_number, new.invoice_total, new.payment_due_on)
    is distinct from (old.id, old.invoice_id, old.organisation_id, old.contract_id, old.invoice_number, old.invoice_total, old.payment_due_on) then
    raise exception 'The invoice amount the gang sent cannot be rewritten' using errcode='42501'; end if;
  if old.approved_at is not null and (new.approved_amount, new.adjustment_amount, new.adjustment_reason, new.line_rates, new.approval_note,
      new.approved_by, new.approved_at, new.agreed_payment_on, new.job_cost_entry_id)
    is distinct from (old.approved_amount, old.adjustment_amount, old.adjustment_reason, old.line_rates, old.approval_note,
      old.approved_by, old.approved_at, old.agreed_payment_on, old.job_cost_entry_id) then
    raise exception 'An approval is final' using errcode='42501'; end if;
  if old.paid_recorded_at is not null and (new.paid_on, new.paid_amount, new.payment_reference, new.paid_recorded_by, new.paid_recorded_at)
    is distinct from (old.paid_on, old.paid_amount, old.payment_reference, old.paid_recorded_by, old.paid_recorded_at) then
    raise exception 'A recorded payment is final' using errcode='42501'; end if;
  return new;
end $$;
create trigger gang_commercial_guard before update or delete on public.gang_invoice_commercials for each row execute function private.guard_gang_commercial();

create function private.guard_gang_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' or old.resolved_at is not null
    or (to_jsonb(new) - array['resolved_at','resolved_by','resolution']) is distinct from (to_jsonb(old) - array['resolved_at','resolved_by','resolution']) then
    raise exception 'Verification requests are permanent' using errcode='42501'; end if;
  return new;
end $$;
create trigger gang_request_guard before update or delete on public.gang_verification_requests for each row execute function private.guard_gang_request();

create function private.guard_gang_event() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'Invoice history is permanent' using errcode='42501'; end $$;
create trigger gang_event_guard before update or delete on public.gang_invoice_events for each row execute function private.guard_gang_event();

create trigger gang_invoice_audit after insert or update on public.gang_invoices for each row execute function private.audit_mutation();
create trigger gang_invoice_line_audit after insert or update on public.gang_invoice_lines for each row execute function private.audit_mutation();
create trigger gang_invoice_file_audit after insert or update on public.gang_invoice_files for each row execute function private.audit_mutation();
create trigger gang_request_audit after insert or update on public.gang_verification_requests for each row execute function private.audit_mutation();
create trigger gang_subcontract_audit after insert or update on public.gang_subcontracts for each row execute function private.audit_financial_mutation();
create trigger gang_rate_audit after insert or update on public.gang_rates for each row execute function private.audit_financial_mutation();
create trigger gang_commercial_audit after insert or update on public.gang_invoice_commercials for each row execute function private.audit_financial_mutation();

-- ---------------------------------------------------------------------------------------------
-- 6. Helpers: quantities, payment dates, routing, the ledger and events.
-- ---------------------------------------------------------------------------------------------
create function private.gang_quantity(p_value jsonb, p_label text, p_min numeric, p_required boolean default true) returns numeric
language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
  if p_value is null or p_value = 'null'::jsonb then
    if p_required then raise exception 'Enter the quantity for %', p_label using errcode='22023'; end if;
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'number' then raise exception 'The quantity for % must be a number', p_label using errcode='22023'; end if;
  n := (p_value::text)::numeric;
  if n < p_min or n >= 100000 or n <> round(n, 2) then
    raise exception 'Check the quantity for % (more than zero, at most two decimal places)', p_label using errcode='22023'; end if;
  return n;
end $$;

create function private.unit_label(p_unit text) returns text language sql immutable set search_path='' as $$
  select case p_unit when 'm2' then 'm²' when 'lm' then 'linear m' else 'items' end
$$;

-- Weekly: the invoice week ends on the pay weekday; payment is payment_days later
-- (invoice Friday, paid the following Friday). Fortnightly: periods end every fourteen days
-- from the anchor. Custom: payment_days after the invoice date.
create function private.gang_payment_due(p_cycle text, p_weekday integer, p_days integer, p_anchor date, p_invoice_date date)
returns date language plpgsql immutable set search_path='' as $$
declare period_end date; r integer;
begin
  if p_cycle = 'weekly' then
    period_end := p_invoice_date + ((p_weekday - extract(isodow from p_invoice_date)::integer + 7) % 7);
    return period_end + p_days;
  elsif p_cycle = 'fortnightly' then
    r := (((p_invoice_date - p_anchor) % 14) + 14) % 14;
    period_end := p_invoice_date + ((14 - r) % 14);
    return period_end + p_days;
  end if;
  return p_invoice_date + p_days;
end $$;

create function private.gang_area_name(p_area uuid) returns text language sql stable security definer set search_path='' as $$
  select string_agg(w.name, ' › ' order by a.n) from public.work_areas t
    cross join lateral unnest(t.path_ids) with ordinality a(id, n) join public.work_areas w on w.id = a.id
  where t.id = p_area
$$;

create function private.gang_event(p_invoice public.gang_invoices, p_action text, p_from text, p_note text,
  p_visibility text default 'all', p_details jsonb default '{}') returns void
language sql security definer set search_path='' as $$
  insert into public.gang_invoice_events(organisation_id, contract_id, invoice_id, actor_id, actor_name, action, from_status, to_status, note, visibility, details)
  values (p_invoice.organisation_id, p_invoice.contract_id, p_invoice.id, auth.uid(), coalesce(private.member_name(), 'TileSpec'),
    p_action, p_from, p_invoice.status, nullif(trim(coalesce(p_note, '')), ''), p_visibility, coalesce(p_details, '{}'::jsonb))
$$;

-- Supervisors assigned to the job today (the same date rule as contract access).
create function private.job_supervisors(p_contract uuid) returns uuid[] language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(a.user_id order by a.valid_from, a.user_id), '{}') from public.contract_assignments a
    join public.organisation_members m on m.organisation_id = a.organisation_id and m.user_id = a.user_id
  where a.contract_id = p_contract and m.role = 'supervisor' and m.active
    and a.valid_from <= current_date and (a.valid_until is null or a.valid_until >= current_date)
$$;

-- Opens the single verification request for an invoice, routed to the job's supervisor(s) or,
-- with none assigned, to the office for allocation. Never lost, never duplicated.
create function private.open_gang_request(p_invoice public.gang_invoices, p_reason text, p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
declare sups uuid[] := private.job_supervisors(p_invoice.contract_id); result uuid;
begin
  select id into result from public.gang_verification_requests where invoice_id = p_invoice.id and resolved_at is null;
  if found then return result; end if;
  insert into public.gang_verification_requests(organisation_id, contract_id, invoice_id, reason, routed_to, assigned_supervisor_id, office_note, created_by)
  values (p_invoice.organisation_id, p_invoice.contract_id, p_invoice.id, p_reason,
    case when cardinality(sups) > 0 then 'supervisor' else 'office' end,
    case when cardinality(sups) = 1 then sups[1] end, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into result;
  return result;
end $$;

create function private.close_gang_request(p_invoice uuid, p_resolution text) returns void
language sql security definer set search_path='' as $$
  update public.gang_verification_requests set resolved_at = now(), resolved_by = auth.uid(), resolution = p_resolution
  where invoice_id = p_invoice and resolved_at is null
$$;

create function private.lock_gang_ledger(p_contract uuid, p_team uuid) returns void language sql security definer set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended('tilespec-gang-ledger:' || p_contract::text || ':' || p_team::text, 0))
$$;

-- One row per location and unit for a gang on a job. Incremental measurements add up; a cleared
-- correction counts as passed; voided measurements are ignored.
--   passed       measured and passed (or corrected and checked)
--   correction   measured but needing correction: never eligible for payment until cleared
--   approved     approved for payment on approved or paid invoices
--   verified     verified on invoices still with the office (reserved, not yet approved)
--   claimed      claimed on invoices still awaiting a check (information only)
--   available    passed - approved - verified: the most that can still be verified for payment
create function private.gang_ledger(p_contract uuid, p_team uuid, p_exclude_invoice uuid default null)
returns table(work_area_id uuid, unit text, passed numeric, correction numeric, approved numeric, verified numeric, claimed numeric, available numeric)
language sql stable security definer set search_path='' as $$
  with m as (
    select g.work_area_id, g.unit,
      sum(g.quantity) filter (where g.quality_status = 'passed' or g.correction_status = 'cleared') passed,
      sum(g.quantity) filter (where g.correction_status = 'open') correction
    from public.gang_progress_checks g
    where g.contract_id = p_contract and g.team_id = p_team and g.voided_at is null
    group by 1, 2
  ), c as (
    select l.work_area_id, l.unit,
      sum(l.approved_quantity) filter (where i.status in ('approved','paid')) approved,
      sum(l.verified_quantity) filter (where i.status in ('with_office','query_gang') and i.id is distinct from p_exclude_invoice) verified,
      sum(l.claimed_quantity) filter (where i.status = 'awaiting_check' and i.id is distinct from p_exclude_invoice) claimed
    from public.gang_invoice_lines l join public.gang_invoices i on i.id = l.invoice_id
    where i.contract_id = p_contract and i.team_id = p_team
    group by 1, 2
  )
  select coalesce(m.work_area_id, c.work_area_id), coalesce(m.unit, c.unit),
    coalesce(m.passed, 0), coalesce(m.correction, 0), coalesce(c.approved, 0), coalesce(c.verified, 0), coalesce(c.claimed, 0),
    coalesce(m.passed, 0) - coalesce(c.approved, 0) - coalesce(c.verified, 0)
  from m full join c on c.work_area_id = m.work_area_id and c.unit = m.unit
$$;

create function private.gang_available(p_contract uuid, p_team uuid, p_area uuid, p_unit text, p_exclude_invoice uuid default null)
returns numeric language sql stable security definer set search_path='' as $$
  select coalesce((select l.available from private.gang_ledger(p_contract, p_team, p_exclude_invoice) l
    where l.work_area_id = p_area and l.unit = p_unit), 0)
$$;

-- Approved quantities never exceed passed work (the double-payment guard after a void).
create function private.assert_gang_ledger(p_contract uuid, p_team uuid) returns void
language plpgsql stable security definer set search_path='' as $$
declare bad record;
begin
  select * into bad from private.gang_ledger(p_contract, p_team) l where l.available < 0 limit 1;
  if found then
    raise exception 'This would pay for % % more at % than has been measured and passed', bad.available * -1,
      private.unit_label(bad.unit), private.gang_area_name(bad.work_area_id) using errcode='23514';
  end if;
end $$;

create function private.insert_gang_measurement(p_contract uuid, p_team uuid, p_area uuid, p_unit text, p_quantity numeric,
  p_quality text, p_note text, p_period_start date, p_source uuid, p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  insert into public.gang_progress_checks(organisation_id, contract_id, team_id, work_area_id, measured_on, quantity, unit, quality_status,
    note, checked_by, period_start, source_invoice_id, request_key)
  values (private.current_org(), p_contract, p_team, p_area, private.site_today(), p_quantity, p_unit, p_quality,
    coalesce(p_note, ''), auth.uid(), p_period_start, p_source, p_request_key)
  returning id into result;
  return result;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 7. Office setup: a gang on a job with its payment terms, and agreed rates.
-- ---------------------------------------------------------------------------------------------
create function public.save_gang_subcontract(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); c uuid; t uuid; existing public.gang_subcontracts; result uuid; v_cycle text;
  v_weekday integer; v_days integer; v_anchor date; v_note text; v_active boolean; v_version integer; team public.teams;
begin
  perform private.only_keys(p_data, array['contract_id','team_id','payment_cycle','pay_weekday','payment_days','cycle_anchor','terms_note','active','version']);
  c := private.field_uuid(p_data, 'contract_id', true);
  if not private.can_view_financials(c) then raise exception 'Money access is required to set up a gang on a job' using errcode='42501'; end if;
  t := private.field_uuid(p_data, 'team_id', true);
  select * into team from public.teams where id = t and organisation_id = org;
  if not found then raise exception 'Choose a gang in your organisation' using errcode='22023'; end if;
  if team.kind = 'direct_team' then raise exception 'Directly employed teams do not send invoices' using errcode='22023'; end if;
  v_cycle := coalesce(private.field_text(p_data, 'payment_cycle', 20), 'weekly');
  perform private.assert_choice(v_cycle, 'payment_cycle', array['weekly','fortnightly','custom']);
  v_weekday := coalesce(private.field_integer(p_data, 'pay_weekday', 1, 7), 5);
  v_days := coalesce(private.field_integer(p_data, 'payment_days', 0, 90), 7);
  v_anchor := private.field_date(p_data, 'cycle_anchor');
  if v_cycle = 'fortnightly' and v_anchor is null then raise exception 'Give a date one fortnightly period ends' using errcode='22023'; end if;
  v_note := coalesce(private.field_text(p_data, 'terms_note', 2000), '');
  v_active := coalesce(private.field_boolean(p_data, 'active'), true);
  perform pg_advisory_xact_lock(hashtextextended('tilespec-gang-subcontract:' || c::text || ':' || t::text, 0));
  select * into existing from public.gang_subcontracts where organisation_id = org and contract_id = c and team_id = t for update;
  if not found then
    if not team.active then raise exception 'That gang is inactive' using errcode='22023'; end if;
    insert into public.gang_subcontracts(organisation_id, contract_id, team_id, payment_cycle, pay_weekday, payment_days, cycle_anchor,
      terms_note, active, created_by)
    values (org, c, t, v_cycle, v_weekday, v_days, v_anchor, v_note, v_active, auth.uid()) returning id into result;
    return result;
  end if;
  v_version := private.field_integer(p_data, 'version', 1, 1000000);
  if v_version is null then
    raise exception 'This gang is already set up on this job. Change its terms in the list instead.' using errcode='22023'; end if;
  if v_version is distinct from existing.version then
    raise exception 'These terms were changed by someone else. Refresh and try again.' using errcode='40001'; end if;
  update public.gang_subcontracts set payment_cycle = v_cycle, pay_weekday = v_weekday, payment_days = v_days, cycle_anchor = v_anchor,
    terms_note = v_note, active = v_active, version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = existing.id;
  return existing.id;
end $$;

create function public.save_gang_rate(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); s public.gang_subcontracts; result uuid; v_area uuid; v_unit text;
begin
  perform private.only_keys(p_data, array['subcontract_id','work_area_id','unit','rate','description','effective_from']);
  select * into s from public.gang_subcontracts where id = private.field_uuid(p_data, 'subcontract_id', true) and organisation_id = org;
  if not found or not private.can_view_financials(s.contract_id) then raise exception 'Money access is required to record a rate' using errcode='42501'; end if;
  result := private.request_result(org, 'save_gang_rate', p_request_key, p_data);
  if result is not null then return result; end if;
  v_area := private.field_uuid(p_data, 'work_area_id');
  if v_area is not null and not exists (select 1 from public.work_areas where id = v_area and contract_id = s.contract_id) then
    raise exception 'Choose a location on this job' using errcode='22023'; end if;
  v_unit := private.field_text(p_data, 'unit', 4, true);
  perform private.assert_choice(v_unit, 'unit', array['m2','lm','item']);
  insert into public.gang_rates(organisation_id, contract_id, subcontract_id, team_id, work_area_id, unit, rate, description,
    effective_from, created_by, created_by_name, request_key)
  values (org, s.contract_id, s.id, s.team_id, v_area, v_unit, private.field_decimal(p_data, 'rate', 0.01, 100000),
    coalesce(private.field_text(p_data, 'description', 200), ''), coalesce(private.field_date(p_data, 'effective_from'), private.site_today()),
    auth.uid(), coalesce(private.member_name(), 'Office'), p_request_key)
  returning id into result;
  perform private.record_request(org, 'save_gang_rate', p_request_key, p_data, result);
  return result;
end $$;

create function public.void_gang_rate(p_rate uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.gang_rates;
begin
  select * into r from public.gang_rates where id = p_rate and organisation_id = private.current_org() for update;
  if not found or not private.can_view_financials(r.contract_id) then raise exception 'Money access is required' using errcode='42501'; end if;
  if r.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason' using errcode='22023'; end if;
  update public.gang_rates set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = r.id;
end $$;

-- The agreed rate for a line: the latest effective, unvoided rate for the unit on or before the
-- date, preferring the most specific location (the line's location or the nearest one containing it).
create function private.gang_rate_for(p_subcontract uuid, p_area uuid, p_unit text, p_on date) returns numeric
language sql stable security definer set search_path='' as $$
  select r.rate from public.gang_rates r
    left join public.work_areas t on t.id = p_area
  where r.subcontract_id = p_subcontract and r.unit = p_unit and r.voided_at is null and r.effective_from <= p_on
    and (r.work_area_id is null or r.work_area_id = any(t.path_ids))
  order by case when r.work_area_id is null then 0 else coalesce(array_position(t.path_ids, r.work_area_id), 0) end desc,
    r.effective_from desc, r.created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. Gangs: their jobs, sending an invoice, finishing an upload, photos, answers and cancelling.
-- ---------------------------------------------------------------------------------------------
create function public.my_gang_jobs() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'contract_id', c.id, 'reference', c.reference, 'name', c.name, 'address', c.address,
    'team_id', t.id, 'team_name', t.name,
    'areas', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', private.gang_area_name(w.id)) order by w.sort_order, w.name), '[]')
      from public.work_areas w where w.contract_id = c.id and w.archived_at is null))
    order by c.name, t.name), '[]'::jsonb)
  from public.gang_subcontracts s join public.contracts c on c.id = s.contract_id join public.teams t on t.id = s.team_id
  where s.active and t.active and s.organisation_id = private.current_org()
    and coalesce(private.current_role() in ('lead_installer','subcontract_installer'), false)
    and s.team_id = any(private.my_team_ids())
$$;

create function public.submit_gang_invoice(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); c uuid; t uuid; s public.gang_subcontracts; result uuid; inv public.gang_invoices;
  line jsonb; n integer := 0; v_area public.work_areas; v_unit text; v_qty numeric; v_file jsonb; v_mime text; v_bytes bigint; v_sha text;
  replaced public.gang_invoices; v_period_end date; v_period_start date; v_number text; v_total numeric; dup text; v_file_id uuid;
begin
  perform private.only_keys(p_data, array['contract_id','team_id','period_start','period_end','note','invoice_number','invoice_total','lines','file','replaces_invoice_id']);
  if auth.uid() is null or org is null or coalesce(private.current_role() not in ('lead_installer','subcontract_installer'), true) then
    raise exception 'Only a gang member can send a gang invoice' using errcode='42501'; end if;
  c := private.field_uuid(p_data, 'contract_id', true);
  t := private.field_uuid(p_data, 'team_id', true);
  if not private.is_gang_member(t) then raise exception 'You can only send invoices for your own gang' using errcode='42501'; end if;
  select * into s from public.gang_subcontracts where organisation_id = org and contract_id = c and team_id = t and active;
  if not found then raise exception 'Your gang is not set up on this job yet. Ask the office.' using errcode='42501'; end if;
  result := private.request_result(org, 'submit_gang_invoice', p_request_key, p_data);
  if result is not null then return result; end if;
  perform pg_advisory_xact_lock(hashtextextended('tilespec-gang-invoice:' || t::text, 0));

  v_period_end := coalesce(private.field_date(p_data, 'period_end'), private.site_today());
  v_period_start := private.field_date(p_data, 'period_start');
  if v_period_end > private.site_today() then raise exception 'The invoice cannot be for work after today' using errcode='22023'; end if;
  if v_period_start is not null and v_period_start > v_period_end then raise exception 'The period must start before it ends' using errcode='22023'; end if;
  v_number := nullif(private.field_text(p_data, 'invoice_number', 60), '');
  v_total := case when p_data->'invoice_total' is null or p_data->'invoice_total' = 'null'::jsonb then null
    else private.field_decimal(p_data, 'invoice_total', 0, 10000000) end;

  if p_data ? 'replaces_invoice_id' and private.field_uuid(p_data, 'replaces_invoice_id') is not null then
    select * into replaced from public.gang_invoices where id = private.field_uuid(p_data, 'replaces_invoice_id') for update;
    if not found or replaced.team_id <> t or replaced.contract_id <> c or replaced.status <> 'returned' then
      raise exception 'Only an invoice returned to your gang for correction can be replaced' using errcode='22023'; end if;
  end if;

  v_file := p_data->'file';
  if v_file is null or jsonb_typeof(v_file) <> 'object' then raise exception 'Add your invoice (PDF or photo)' using errcode='22023'; end if;
  perform private.only_keys(v_file, array['mime_type','bytes','sha256']);
  v_mime := private.field_text(v_file, 'mime_type', 40, true);
  perform private.assert_choice(v_mime, 'file type', array['application/pdf','image/jpeg','image/png']);
  v_bytes := private.field_integer(v_file, 'bytes', 1, 4194304);
  v_sha := private.field_text(v_file, 'sha256', 64, true);
  if v_bytes is null or v_sha !~ '^[0-9a-f]{64}$' then raise exception 'The invoice file could not be read. Choose it again.' using errcode='22023'; end if;

  -- The same document or invoice number cannot be sent twice (a replacement may reuse its own).
  select i.reference into dup from public.gang_invoice_files f join public.gang_invoices i on i.id = f.invoice_id
  where f.kind = 'invoice' and f.team_id = t and f.sha256 = v_sha and i.status not in ('cancelled','superseded')
    and i.id is distinct from replaced.id limit 1;
  if found then raise exception 'This invoice has already been sent (%). It will not be sent twice.', dup using errcode='22023'; end if;
  if v_number is not null then
    select i.reference into dup from public.gang_invoice_commercials ci join public.gang_invoices i on i.id = ci.invoice_id
    where i.team_id = t and lower(ci.invoice_number) = lower(v_number) and i.status not in ('cancelled','superseded')
      and i.id is distinct from replaced.id limit 1;
    if found then raise exception 'Invoice number % has already been sent (%)', v_number, dup using errcode='22023'; end if;
  end if;

  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 20 then
    raise exception 'Add at least one location and quantity (up to twenty)' using errcode='22023'; end if;

  insert into public.gang_invoices(organisation_id, contract_id, team_id, subcontract_id, reference, status, routed_to, assigned_supervisor_id,
    period_start, period_end, gang_note, submitted_by, submitted_by_name, request_key, replaces_invoice_id)
  values (org, c, t, s.id, 'GI-' || lpad(nextval('private.gang_invoice_reference_seq')::text, 5, '0'), 'uploading',
    case when cardinality(private.job_supervisors(c)) > 0 then 'supervisor' else 'office' end,
    case when cardinality(private.job_supervisors(c)) = 1 then (private.job_supervisors(c))[1] end,
    v_period_start, v_period_end, coalesce(private.field_text(p_data, 'note', 2000), ''), auth.uid(), coalesce(private.member_name(), 'Gang'),
    p_request_key, replaced.id)
  returning * into inv;

  for line in select * from jsonb_array_elements(p_data->'lines') loop
    n := n + 1;
    if jsonb_typeof(line) <> 'object' then raise exception 'Each line needs a location and quantity' using errcode='22023'; end if;
    perform private.only_keys(line, array['work_area_id','unit','quantity','description']);
    select * into v_area from public.work_areas where id = private.field_uuid(line, 'work_area_id', true) and contract_id = c and organisation_id = org;
    if not found or v_area.archived_at is not null then raise exception 'Choose a location on this job for line %', n using errcode='22023'; end if;
    v_unit := coalesce(private.field_text(line, 'unit', 4), 'm2');
    perform private.assert_choice(v_unit, 'unit', array['m2','lm','item']);
    v_qty := private.gang_quantity(line->'quantity', v_area.name, 0.01);
    if exists (select 1 from public.gang_invoice_lines where invoice_id = inv.id and work_area_id = v_area.id and unit = v_unit) then
      raise exception '% is listed twice. Put the total for each location on one line.', v_area.name using errcode='22023'; end if;
    insert into public.gang_invoice_lines(organisation_id, contract_id, invoice_id, team_id, line_no, work_area_id, unit, claimed_quantity, description)
    values (org, c, inv.id, t, n, v_area.id, v_unit, v_qty, coalesce(private.field_text(line, 'description', 200), ''));
  end loop;

  insert into public.gang_invoice_commercials(invoice_id, organisation_id, contract_id, invoice_number, invoice_total, payment_due_on)
  values (inv.id, org, c, v_number, v_total,
    private.gang_payment_due(s.payment_cycle, s.pay_weekday, s.payment_days, s.cycle_anchor, private.site_today()));

  v_file_id := gen_random_uuid();
  insert into public.gang_invoice_files(id, organisation_id, contract_id, invoice_id, team_id, kind, object_path, mime_type, bytes, sha256, uploaded_by, request_key)
  values (v_file_id, org, c, inv.id, t, 'invoice',
    org::text || '/' || c::text || '/' || inv.id::text || '/invoice/' || v_file_id::text
      || case v_mime when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,
    v_mime, v_bytes, v_sha, auth.uid(), p_request_key);

  perform private.gang_event(inv, 'created', null, 'Invoice details saved; upload in progress', 'all',
    jsonb_build_object('lines', n, 'replaces', replaced.reference));
  perform private.record_request(org, 'submit_gang_invoice', p_request_key, p_data, inv.id);
  return inv.id;
end $$;

-- Reserve a photo for an invoice: the gang's own evidence, or the supervisor's.
create function public.reserve_gang_photo(p_request_key uuid, p_invoice uuid, p_meta jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.gang_invoices; v_kind text; v_mime text; result uuid; v_id uuid; v_bytes bigint;
begin
  perform private.only_keys(p_meta, array['mime_type','bytes','sha256']);
  select * into inv from public.gang_invoices where id = p_invoice and organisation_id = private.current_org();
  if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  if private.is_gang_member(inv.team_id) then v_kind := 'gang_photo';
  elsif private.can_supervise_contract(inv.contract_id) then v_kind := 'supervisor_photo';
  else raise exception 'Invoice unavailable' using errcode='42501'; end if;
  if inv.status in ('paid','rejected','cancelled','superseded') then raise exception 'This invoice is closed' using errcode='22023'; end if;
  select id into result from public.gang_invoice_files where organisation_id = inv.organisation_id and uploaded_by = auth.uid()
    and kind = v_kind and request_key = p_request_key;
  if found then return result; end if;
  if (select count(*) from public.gang_invoice_files where invoice_id = inv.id and kind = v_kind) >= 12 then
    raise exception 'Up to twelve photos can be added' using errcode='22023'; end if;
  v_mime := private.field_text(p_meta, 'mime_type', 40, true);
  perform private.assert_choice(v_mime, 'photo type', array['image/jpeg','image/png']);
  v_bytes := private.field_integer(p_meta, 'bytes', 1, 4194304);
  if v_bytes is null or coalesce(private.field_text(p_meta, 'sha256', 64, true), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Choose the photo again' using errcode='22023'; end if;
  v_id := gen_random_uuid();
  insert into public.gang_invoice_files(id, organisation_id, contract_id, invoice_id, team_id, kind, object_path, mime_type, bytes, sha256, uploaded_by, request_key)
  values (v_id, inv.organisation_id, inv.contract_id, inv.id, inv.team_id, v_kind,
    inv.organisation_id::text || '/' || inv.contract_id::text || '/' || inv.id::text || '/' || v_kind || '/' || v_id::text
      || case v_mime when 'image/jpeg' then '.jpg' else '.png' end,
    v_mime, v_bytes, p_meta->>'sha256', auth.uid(), p_request_key);
  return v_id;
end $$;

-- After the bytes are stored (the uploader's own storage write, checked by policy), confirm them.
-- Completing the invoice document is what sends the invoice and opens the verification request.
create function public.complete_gang_file(p_file uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.gang_invoice_files; inv public.gang_invoices; old_status text; replaced public.gang_invoices;
begin
  select * into f from public.gang_invoice_files where id = p_file for update;
  if not found or f.uploaded_by <> auth.uid() or f.organisation_id <> private.current_org() then
    raise exception 'File unavailable' using errcode='42501'; end if;
  if f.uploaded_at is null then
    if not exists (select 1 from storage.objects o where o.bucket_id = 'gang-claims' and o.name = f.object_path
      and o.metadata->>'size' = f.bytes::text and o.metadata->>'mimetype' = f.mime_type) then
      raise exception 'The file has not finished uploading. Try again.' using errcode='22023'; end if;
    update public.gang_invoice_files set uploaded_at = now() where id = f.id;
  end if;
  select * into inv from public.gang_invoices where id = f.invoice_id for update;
  if f.kind = 'invoice' and inv.status = 'uploading' then
    old_status := inv.status;
    if inv.replaces_invoice_id is not null then
      select * into replaced from public.gang_invoices where id = inv.replaces_invoice_id for update;
      if replaced.status <> 'returned' then raise exception 'The invoice you are replacing is no longer waiting for correction' using errcode='22023'; end if;
    end if;
    update public.gang_invoices set status = 'awaiting_check', version = version + 1 where id = inv.id returning * into inv;
    if replaced.id is not null then
      update public.gang_invoices set status = 'superseded', superseded_by = inv.id, version = version + 1 where id = replaced.id returning * into replaced;
      perform private.gang_event(replaced, 'superseded', 'returned', 'Replaced by corrected invoice ' || inv.reference);
    end if;
    perform private.open_gang_request(inv, case when replaced.id is null then 'submitted' else 'resubmitted' end, null);
    perform private.gang_event(inv, 'submitted', old_status,
      case when inv.routed_to = 'office' then 'Sent. No supervisor is assigned to this job, so the office will arrange the check.'
        else 'Sent to the site supervisor to check' end);
  elsif f.kind <> 'invoice' and f.uploaded_at is null then
    perform private.gang_event(inv, 'photo_added', inv.status, null, 'all', jsonb_build_object('kind', f.kind));
  end if;
end $$;

create function public.cancel_gang_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.gang_invoices; old_status text;
begin
  select * into inv from public.gang_invoices where id = p_invoice and organisation_id = private.current_org() for update;
  if not found or not private.is_gang_member(inv.team_id) then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  if inv.status = 'cancelled' then return; end if;
  if inv.status not in ('uploading','awaiting_check','query_gang','returned') then
    raise exception 'This invoice is with the office and can no longer be withdrawn' using errcode='22023'; end if;
  old_status := inv.status;
  update public.gang_invoices set status = 'cancelled', version = version + 1 where id = inv.id returning * into inv;
  perform private.close_gang_request(inv.id, 'cancelled');
  perform private.gang_event(inv, 'cancelled', old_status, coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Withdrawn by the gang'));
end $$;

create function public.answer_gang_query(p_invoice uuid, p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.gang_invoices;
begin
  select * into inv from public.gang_invoices where id = p_invoice and organisation_id = private.current_org() for update;
  if not found or not private.is_gang_member(inv.team_id) then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  if inv.status <> 'query_gang' then raise exception 'There is no question waiting on this invoice' using errcode='22023'; end if;
  if length(trim(coalesce(p_note, ''))) not between 2 and 2000 then raise exception 'Write your answer' using errcode='22023'; end if;
  update public.gang_invoices set status = 'with_office', version = version + 1 where id = inv.id returning * into inv;
  perform private.gang_event(inv, 'gang_answered', 'query_gang', trim(p_note));
end $$;

-- What a gang member may see of their own gang's invoices: no rates, no other gangs, no job money.
create function public.my_gang_invoices() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'reference', i.reference, 'status', i.status, 'contract_id', i.contract_id, 'job', c.name, 'team_id', i.team_id, 'team', t.name,
    'submitted_at', i.submitted_at, 'period_start', i.period_start, 'period_end', i.period_end, 'note', i.gang_note,
    'workmanship', i.workmanship, 'correction_note', case when i.workmanship = 'correction_needed' then i.correction_note end,
    'invoice_number', ci.invoice_number, 'invoice_total', ci.invoice_total,
    'payment_due_on', coalesce(ci.agreed_payment_on, ci.payment_due_on),
    'approved_amount', case when i.status in ('approved','paid') then ci.approved_amount end,
    'paid_on', ci.paid_on, 'paid_amount', ci.paid_amount,
    'replaces', (select r.reference from public.gang_invoices r where r.id = i.replaces_invoice_id),
    'upload', (select jsonb_build_object('id', f.id, 'uploaded', f.uploaded_at is not null, 'sha256', f.sha256, 'mime_type', f.mime_type, 'bytes', f.bytes)
      from public.gang_invoice_files f where f.invoice_id = i.id and f.kind = 'invoice'),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('area', private.gang_area_name(l.work_area_id), 'work_area_id', l.work_area_id,
        'unit', l.unit, 'claimed', l.claimed_quantity, 'description', l.description,
        'verified', case when i.status in ('with_office','query_gang','approved','paid','returned','rejected') then l.verified_quantity end,
        'approved', l.approved_quantity) order by l.line_no), '[]') from public.gang_invoice_lines l where l.invoice_id = i.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.created_at, 'action', e.action, 'by', e.actor_name, 'note', e.note,
        'to_status', e.to_status) order by e.id), '[]') from public.gang_invoice_events e where e.invoice_id = i.id and e.visibility = 'all'))
    order by i.submitted_at desc), '[]'::jsonb)
  from public.gang_invoices i join public.contracts c on c.id = i.contract_id join public.teams t on t.id = i.team_id
    left join public.gang_invoice_commercials ci on ci.invoice_id = i.id
  where i.organisation_id = private.current_org() and private.is_gang_member(i.team_id)
$$;

-- ---------------------------------------------------------------------------------------------
-- 9. Supervisors: measurements, the ledger and verification. Quantities and quality only.
-- ---------------------------------------------------------------------------------------------
create function public.record_gang_measurement(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); c uuid; t uuid; v_area public.work_areas; v_unit text; v_quality text; result uuid;
begin
  perform private.only_keys(p_data, array['contract_id','team_id','work_area_id','unit','quantity','quality_status','note','period_start']);
  c := private.field_uuid(p_data, 'contract_id', true);
  if not private.can_supervise_contract(c) then raise exception 'Only the job''s supervisor or the office can record measurements' using errcode='42501'; end if;
  select id into result from public.gang_progress_checks where checked_by = auth.uid() and request_key = p_request_key;
  if found then return result; end if;
  t := private.field_uuid(p_data, 'team_id', true);
  if not exists (select 1 from public.teams where id = t and organisation_id = org) then raise exception 'Choose a gang' using errcode='22023'; end if;
  select * into v_area from public.work_areas where id = private.field_uuid(p_data, 'work_area_id', true) and contract_id = c;
  if not found or v_area.archived_at is not null then raise exception 'Choose a location on this job' using errcode='22023'; end if;
  v_unit := coalesce(private.field_text(p_data, 'unit', 4), 'm2');
  perform private.assert_choice(v_unit, 'unit', array['m2','lm','item']);
  v_quality := private.field_text(p_data, 'quality_status', 30, true);
  perform private.assert_choice(v_quality, 'quality', array['passed','correction_required']);
  perform private.lock_gang_ledger(c, t);
  return private.insert_gang_measurement(c, t, v_area.id, v_unit, private.gang_quantity(p_data->'quantity', v_area.name, 0.01), v_quality,
    private.field_text(p_data, 'note', 2000), private.field_date(p_data, 'period_start'), null, p_request_key);
end $$;

-- Correction completed and checked: the measured quantity now counts as passed. History is kept.
create function public.clear_gang_correction(p_check uuid, p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare g public.gang_progress_checks;
begin
  select * into g from public.gang_progress_checks where id = p_check and organisation_id = private.current_org() for update;
  if not found or not private.can_supervise_contract(g.contract_id) then raise exception 'Measurement unavailable' using errcode='42501'; end if;
  if g.voided_at is not null or g.correction_status is distinct from 'open' then raise exception 'There is no open correction on this measurement' using errcode='22023'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Say what was corrected and checked' using errcode='22023'; end if;
  update public.gang_progress_checks set correction_status = 'cleared', correction_cleared_at = now(), correction_cleared_by = auth.uid(),
    correction_cleared_note = trim(p_note) where id = g.id;
end $$;

create function public.void_gang_measurement(p_check uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare g public.gang_progress_checks;
begin
  select * into g from public.gang_progress_checks where id = p_check and organisation_id = private.current_org();
  if not found or not private.can_supervise_contract(g.contract_id) then raise exception 'Measurement unavailable' using errcode='42501'; end if;
  perform private.lock_gang_ledger(g.contract_id, g.team_id);
  select * into g from public.gang_progress_checks where id = p_check for update;
  if g.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a reason of at least five characters' using errcode='22023'; end if;
  update public.gang_progress_checks set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = g.id;
  if exists (select 1 from private.gang_ledger(g.contract_id, g.team_id) l where l.work_area_id = g.work_area_id and l.unit = g.unit and l.available < 0) then
    raise exception 'This measurement is already counted on a verified or approved invoice, so it cannot be voided. Ask the office.' using errcode='23514'; end if;
end $$;

create function public.gang_claim_ledger(p_contract uuid, p_team uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_supervise_contract(p_contract) then raise exception 'Only the job''s supervisor or the office can see measurements' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('work_area_id', l.work_area_id, 'area', private.gang_area_name(l.work_area_id), 'unit', l.unit,
    'passed', l.passed, 'correction', l.correction, 'approved', l.approved, 'verified', l.verified, 'claimed', l.claimed, 'available', l.available)
    order by private.gang_area_name(l.work_area_id), l.unit), '[]'::jsonb) from private.gang_ledger(p_contract, p_team) l);
end $$;

-- The supervisor's check. For each claimed line they may add new measured work to the ledger
-- (passed and/or needing correction), then confirm the verified quantity for this invoice. The
-- verified quantity can never exceed passed work not already approved or verified elsewhere.
create function public.verify_gang_invoice(p_request_key uuid, p_invoice uuid, p_version integer, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.gang_invoices; payload jsonb; result uuid; item jsonb; l public.gang_invoice_lines; v_passed numeric; v_correction numeric;
  v_verified numeric; v_available numeric; v_quality text; v_workmanship text; snapshot jsonb := '[]'; any_correction boolean := false;
  area_name text; seen uuid[] := '{}'; old_status text;
begin
  perform private.only_keys(p_data, array['lines','workmanship','note','correction_note']);
  select * into inv from public.gang_invoices where id = p_invoice and organisation_id = private.current_org();
  if not found or not private.can_supervise_contract(inv.contract_id) then raise exception 'Only the job''s supervisor or the office can verify this invoice' using errcode='42501'; end if;
  payload := jsonb_build_object('invoice', p_invoice, 'version', p_version, 'data', p_data);
  result := private.request_result(inv.organisation_id, 'verify_gang_invoice', p_request_key, payload);
  if result is not null then return result; end if;
  perform private.lock_gang_ledger(inv.contract_id, inv.team_id);
  select * into inv from public.gang_invoices where id = p_invoice for update;
  if inv.status <> 'awaiting_check' then raise exception 'This invoice is no longer waiting for a check. Refresh to see where it is.' using errcode='40001'; end if;
  if inv.version <> p_version then raise exception 'This invoice changed while you were checking it. Refresh and check again.' using errcode='40001'; end if;
  if jsonb_typeof(p_data->'lines') is distinct from 'array' then raise exception 'Confirm a quantity for every location claimed' using errcode='22023'; end if;

  for item in select * from jsonb_array_elements(p_data->'lines') loop
    perform private.only_keys(item, array['line_id','measured_passed','measured_correction','verified_quantity','note']);
    select * into l from public.gang_invoice_lines where id = private.field_uuid(item, 'line_id', true) and invoice_id = inv.id for update;
    if not found then raise exception 'A claimed line is missing. Refresh and check again.' using errcode='22023'; end if;
    if l.id = any(seen) then raise exception 'Each claimed line can be confirmed once' using errcode='22023'; end if;
    seen := seen || l.id;
    area_name := private.gang_area_name(l.work_area_id);
    v_passed := private.gang_quantity(item->'measured_passed', area_name, 0.01, false);
    v_correction := private.gang_quantity(item->'measured_correction', area_name, 0.01, false);
    if v_passed is not null then
      perform private.insert_gang_measurement(inv.contract_id, inv.team_id, l.work_area_id, l.unit, v_passed, 'passed',
        coalesce(private.field_text(item, 'note', 1000), ''), inv.period_start, inv.id, null);
    end if;
    if v_correction is not null then
      perform private.insert_gang_measurement(inv.contract_id, inv.team_id, l.work_area_id, l.unit, v_correction, 'correction_required',
        coalesce(nullif(private.field_text(item, 'note', 1000), ''), nullif(private.field_text(p_data, 'correction_note', 2000), ''), 'Correction needed'),
        inv.period_start, inv.id, null);
    end if;
    v_verified := private.gang_quantity(item->'verified_quantity', area_name, 0);
    if v_verified > l.claimed_quantity then
      raise exception 'The verified quantity for % cannot be more than the gang claimed (% %)', area_name, l.claimed_quantity, private.unit_label(l.unit) using errcode='22023'; end if;
    v_available := private.gang_available(inv.contract_id, inv.team_id, l.work_area_id, l.unit, inv.id);
    if v_verified > v_available then
      raise exception 'Only % % at % is measured, passed and not already paid or verified. Record the new measured work first, or verify less.',
        greatest(v_available, 0), private.unit_label(l.unit), area_name using errcode='22023'; end if;
    v_quality := case when v_correction is not null or exists (select 1 from public.gang_progress_checks g where g.contract_id = inv.contract_id
      and g.team_id = inv.team_id and g.work_area_id = l.work_area_id and g.unit = l.unit and g.voided_at is null and g.correction_status = 'open')
      then 'correction_required' else 'passed' end;
    any_correction := any_correction or v_quality = 'correction_required';
    update public.gang_invoice_lines set verified_quantity = v_verified, line_quality = v_quality,
      verification_note = nullif(private.field_text(item, 'note', 1000), '') where id = l.id;
    snapshot := snapshot || jsonb_build_object('line_id', l.id, 'area', area_name, 'unit', l.unit, 'claimed', l.claimed_quantity,
      'verified', v_verified, 'difference', l.claimed_quantity - v_verified, 'measured_passed', v_passed, 'measured_correction', v_correction,
      'quality', v_quality);
  end loop;
  if exists (select 1 from public.gang_invoice_lines where invoice_id = inv.id and not (id = any(seen))) then
    raise exception 'Confirm a quantity for every location claimed' using errcode='22023'; end if;

  v_workmanship := coalesce(private.field_text(p_data, 'workmanship', 30), case when any_correction then 'correction_needed' else 'satisfactory' end);
  perform private.assert_choice(v_workmanship, 'workmanship', array['satisfactory','correction_needed']);
  if any_correction then v_workmanship := 'correction_needed'; end if;
  if v_workmanship = 'correction_needed' and length(coalesce(private.field_text(p_data, 'correction_note', 2000), '')) < 3 then
    raise exception 'Describe the correction needed' using errcode='22023'; end if;

  old_status := inv.status;
  update public.gang_invoices set status = 'with_office', workmanship = v_workmanship, verified_by = auth.uid(),
    verified_by_name = coalesce(private.member_name(), 'Supervisor'), verified_at = now(),
    supervisor_note = nullif(private.field_text(p_data, 'note', 2000), ''),
    correction_note = case when v_workmanship = 'correction_needed' then private.field_text(p_data, 'correction_note', 2000) end,
    version = version + 1
  where id = inv.id returning * into inv;
  perform private.close_gang_request(inv.id, 'verified');
  perform private.assert_gang_ledger(inv.contract_id, inv.team_id);
  perform private.gang_event(inv, 'verified', old_status, inv.supervisor_note, 'site',
    jsonb_build_object('lines', snapshot, 'workmanship', v_workmanship, 'correction_note', inv.correction_note));
  perform private.gang_event(inv, 'checked', old_status,
    case when v_workmanship = 'correction_needed' then 'Checked by the supervisor. Correction needed: ' || inv.correction_note
      else 'Checked by the supervisor and sent to the office' end, 'all',
    jsonb_build_object('verified', (select jsonb_agg(jsonb_build_object('area', x->>'area', 'unit', x->>'unit', 'claimed', x->'claimed', 'verified', x->'verified')) from jsonb_array_elements(snapshot) x)));
  perform private.record_request(inv.organisation_id, 'verify_gang_invoice', p_request_key, payload, inv.id);
  return inv.id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 10. The office: decisions on money. Money access only; the supervisor verifies work, not money.
-- ---------------------------------------------------------------------------------------------
create function public.decide_gang_invoice(p_request_key uuid, p_invoice uuid, p_version integer, p_action text, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.gang_invoices; ci public.gang_invoice_commercials; payload jsonb; result uuid; old_status text; v_note text;
  item jsonb; l public.gang_invoice_lines; v_qty numeric; v_rate numeric; v_amount numeric; v_total numeric := 0; rates jsonb := '[]';
  v_adjust numeric; v_reason text; seen uuid[] := '{}'; claimed_total numeric; approved_qty_total numeric; team public.teams; cost uuid;
  v_paid_on date; v_agreed date; area_name text;
begin
  select * into inv from public.gang_invoices where id = p_invoice and organisation_id = private.current_org();
  if not found or not private.can_view_financials(inv.contract_id) then
    raise exception 'Only office users with money access can decide on gang invoices' using errcode='42501'; end if;
  perform private.assert_choice(p_action, 'decision', array['approve','recheck','query_gang','return','reject','mark_paid']);
  payload := jsonb_build_object('invoice', p_invoice, 'version', p_version, 'action', p_action, 'data', p_data);
  result := private.request_result(inv.organisation_id, 'decide_gang_invoice', p_request_key, payload);
  if result is not null then return result; end if;
  perform private.lock_gang_ledger(inv.contract_id, inv.team_id);
  select * into inv from public.gang_invoices where id = p_invoice for update;
  select * into ci from public.gang_invoice_commercials where invoice_id = inv.id for update;
  if inv.version <> p_version then raise exception 'This invoice changed while you were looking at it. Refresh and try again.' using errcode='40001'; end if;
  old_status := inv.status;
  v_note := nullif(trim(coalesce(p_data->>'note', '')), '');
  if length(coalesce(v_note, '')) > 2000 then raise exception 'Keep the note under 2000 characters' using errcode='22023'; end if;

  if p_action = 'approve' then
    perform private.only_keys(p_data, array['lines','adjustment_amount','adjustment_reason','note','agreed_payment_on']);
    if inv.status <> 'with_office' then raise exception 'Only a checked invoice with the office can be approved' using errcode='22023'; end if;
    if jsonb_typeof(p_data->'lines') is distinct from 'array' then raise exception 'Give the approved quantity for each line' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(p_data->'lines') loop
      perform private.only_keys(item, array['line_id','approved_quantity','rate']);
      select * into l from public.gang_invoice_lines where id = private.field_uuid(item, 'line_id', true) and invoice_id = inv.id for update;
      if not found or l.id = any(seen) then raise exception 'Give each claimed line once' using errcode='22023'; end if;
      seen := seen || l.id;
      area_name := private.gang_area_name(l.work_area_id);
      v_qty := private.gang_quantity(item->'approved_quantity', area_name, 0);
      if v_qty > l.verified_quantity then
        raise exception 'The approved quantity for % cannot be more than the supervisor verified (% %)', area_name, l.verified_quantity,
          private.unit_label(l.unit) using errcode='22023'; end if;
      v_rate := case when item->'rate' is null or item->'rate' = 'null'::jsonb then null else private.field_decimal(item, 'rate', 0, 100000) end;
      if v_qty > 0 and coalesce(v_rate, 0) <= 0 then raise exception 'Give the agreed rate for %', area_name using errcode='22023'; end if;
      v_amount := round(v_qty * coalesce(v_rate, 0), 2);
      v_total := v_total + v_amount;
      update public.gang_invoice_lines set approved_quantity = v_qty where id = l.id;
      rates := rates || jsonb_build_object('line_id', l.id, 'area', area_name, 'unit', l.unit, 'claimed', l.claimed_quantity,
        'verified', l.verified_quantity, 'approved', v_qty, 'rate', v_rate, 'amount', v_amount,
        'agreed_rate', private.gang_rate_for(inv.subcontract_id, l.work_area_id, l.unit, inv.period_end));
    end loop;
    if exists (select 1 from public.gang_invoice_lines where invoice_id = inv.id and not (id = any(seen))) then
      raise exception 'Give the approved quantity for each line' using errcode='22023'; end if;
    v_adjust := coalesce(case when p_data->'adjustment_amount' is null or p_data->'adjustment_amount' = 'null'::jsonb then 0
      else private.field_decimal(p_data, 'adjustment_amount', -10000000, 10000000) end, 0);
    v_reason := nullif(private.field_text(p_data, 'adjustment_reason', 1000), '');
    if v_adjust <> 0 and coalesce(length(v_reason), 0) < 3 then raise exception 'Give the reason for the agreed adjustment' using errcode='22023'; end if;
    v_total := v_total + v_adjust;
    if v_total < 0 then raise exception 'The approved amount cannot be below zero' using errcode='22023'; end if;
    select sum(claimed_quantity), sum(approved_quantity) into claimed_total, approved_qty_total from public.gang_invoice_lines where invoice_id = inv.id;
    -- Paying less than claimed is an office decision with a written reason, never automatic.
    if (approved_qty_total < claimed_total or (ci.invoice_total is not null and v_total < ci.invoice_total)) and coalesce(length(v_note), 0) < 3 then
      raise exception 'You are approving less than the gang claimed. Write the reason (it is kept with the invoice).' using errcode='22023'; end if;
    v_agreed := private.field_date(p_data, 'agreed_payment_on');
    perform private.assert_gang_ledger(inv.contract_id, inv.team_id);
    update public.gang_invoices set status = 'approved', office_decided_by = auth.uid(), office_decided_at = now(), version = version + 1
      where id = inv.id returning * into inv;
    if v_total > 0 then
      select * into team from public.teams where id = inv.team_id;
      insert into public.job_cost_entries(organisation_id, contract_id, category, company_id, supplier, reference, description, cost_date,
        net_amount, recorded_by, recorded_by_name, request_key)
      values (inv.organisation_id, inv.contract_id, 'subcontract', team.company_id, case when team.company_id is null then left(team.name, 160) end,
        left(coalesce(ci.invoice_number, inv.reference), 120), 'Gang invoice ' || inv.reference || ' approved for payment (' || left(team.name, 120) || ')',
        private.site_today(), v_total, auth.uid(), coalesce(private.member_name(), 'Office'), inv.id)
      returning id into cost;
    end if;
    update public.gang_invoice_commercials set approved_amount = v_total, adjustment_amount = v_adjust, adjustment_reason = v_reason,
      line_rates = rates, approval_note = v_note, approved_by = auth.uid(), approved_at = now(), agreed_payment_on = v_agreed, job_cost_entry_id = cost
    where id = ci.id;
    perform private.gang_event(inv, 'approved_money', old_status, v_note, 'office', jsonb_build_object('lines', rates, 'adjustment_amount', v_adjust,
      'adjustment_reason', v_reason, 'approved_amount', v_total, 'invoice_total', ci.invoice_total, 'payment_due_on', coalesce(v_agreed, ci.payment_due_on)));
    perform private.gang_event(inv, 'approved', old_status, 'Approved for payment', 'all',
      jsonb_build_object('approved', (select jsonb_agg(jsonb_build_object('area', x->>'area', 'unit', x->>'unit', 'approved', x->'approved')) from jsonb_array_elements(rates) x)));

  elsif p_action = 'recheck' then
    perform private.only_keys(p_data, array['note']);
    if inv.status not in ('with_office','query_gang') then raise exception 'Only an invoice with the office can go back for a re-check' using errcode='22023'; end if;
    if coalesce(length(v_note), 0) < 3 then raise exception 'Tell the supervisor what to check' using errcode='22023'; end if;
    update public.gang_invoice_lines set verified_quantity = null, line_quality = null, verification_note = null where invoice_id = inv.id;
    update public.gang_invoices set status = 'awaiting_check', office_decided_by = auth.uid(), office_decided_at = now(), version = version + 1
      where id = inv.id returning * into inv;
    perform private.open_gang_request(inv, 'office_recheck', v_note);
    perform private.gang_event(inv, 'recheck_requested', old_status, v_note, 'site');
    perform private.gang_event(inv, 'recheck', old_status, 'The office asked the supervisor to check again', 'all');

  elsif p_action = 'query_gang' then
    perform private.only_keys(p_data, array['note']);
    if inv.status <> 'with_office' then raise exception 'Only an invoice with the office can be queried' using errcode='22023'; end if;
    if coalesce(length(v_note), 0) < 3 then raise exception 'Write the question for the gang' using errcode='22023'; end if;
    update public.gang_invoices set status = 'query_gang', office_decided_by = auth.uid(), office_decided_at = now(), version = version + 1
      where id = inv.id returning * into inv;
    perform private.gang_event(inv, 'query_gang', old_status, v_note);

  elsif p_action = 'return' then
    perform private.only_keys(p_data, array['note']);
    if inv.status not in ('awaiting_check','with_office','query_gang') then raise exception 'This invoice cannot be returned now' using errcode='22023'; end if;
    if coalesce(length(v_note), 0) < 3 then raise exception 'Tell the gang what to correct' using errcode='22023'; end if;
    update public.gang_invoices set status = 'returned', office_decided_by = auth.uid(), office_decided_at = now(), version = version + 1
      where id = inv.id returning * into inv;
    perform private.close_gang_request(inv.id, 'withdrawn');
    perform private.gang_event(inv, 'returned', old_status, v_note);

  elsif p_action = 'reject' then
    perform private.only_keys(p_data, array['note']);
    if inv.status not in ('awaiting_check','with_office','query_gang','returned') then raise exception 'This invoice cannot be rejected now' using errcode='22023'; end if;
    if coalesce(length(v_note), 0) < 5 then raise exception 'Give the reason for rejecting this invoice' using errcode='22023'; end if;
    update public.gang_invoices set status = 'rejected', office_decided_by = auth.uid(), office_decided_at = now(), version = version + 1
      where id = inv.id returning * into inv;
    perform private.close_gang_request(inv.id, 'withdrawn');
    perform private.gang_event(inv, 'rejected', old_status, v_note);

  elsif p_action = 'mark_paid' then
    perform private.only_keys(p_data, array['paid_on','paid_amount','payment_reference','note']);
    if inv.status <> 'approved' then raise exception 'Only an approved invoice can be recorded as paid' using errcode='22023'; end if;
    v_paid_on := coalesce(private.field_date(p_data, 'paid_on'), private.site_today());
    if v_paid_on > private.site_today() then raise exception 'Record a payment once it has been made' using errcode='22023'; end if;
    update public.gang_invoices set status = 'paid', office_decided_by = auth.uid(), office_decided_at = now(), version = version + 1
      where id = inv.id returning * into inv;
    update public.gang_invoice_commercials set paid_on = v_paid_on, paid_amount = private.field_decimal(p_data, 'paid_amount', 0, 10000000),
      payment_reference = nullif(private.field_text(p_data, 'payment_reference', 120), ''), paid_recorded_by = auth.uid(), paid_recorded_at = now()
    where id = ci.id returning * into ci;
    perform private.gang_event(inv, 'paid_money', old_status, v_note, 'office', jsonb_build_object('paid_on', ci.paid_on, 'paid_amount', ci.paid_amount,
      'payment_reference', ci.payment_reference, 'approved_amount', ci.approved_amount));
    perform private.gang_event(inv, 'paid', old_status, 'Payment recorded', 'all');
  end if;

  perform private.record_request(inv.organisation_id, 'decide_gang_invoice', p_request_key, payload, inv.id);
  return inv.id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 11. Grants.
-- ---------------------------------------------------------------------------------------------
revoke all on function private.prepare_gang_progress(), private.guard_gang_progress(), private.guard_gang_invoice(),
  private.guard_gang_invoice_line(), private.guard_gang_invoice_file(), private.guard_gang_commercial(), private.guard_gang_request(),
  private.guard_gang_event(), private.gang_quantity(jsonb,text,numeric,boolean), private.unit_label(text),
  private.gang_payment_due(text,integer,integer,date,date), private.gang_area_name(uuid),
  private.gang_event(public.gang_invoices,text,text,text,text,jsonb), private.job_supervisors(uuid),
  private.open_gang_request(public.gang_invoices,text,text), private.close_gang_request(uuid,text), private.lock_gang_ledger(uuid,uuid),
  private.gang_ledger(uuid,uuid,uuid), private.gang_available(uuid,uuid,uuid,text,uuid), private.assert_gang_ledger(uuid,uuid),
  private.insert_gang_measurement(uuid,uuid,uuid,text,numeric,text,text,date,uuid,uuid), private.gang_rate_for(uuid,uuid,text,date)
  from public, anon, authenticated;
-- Used by row-level security policies, so the signed-in role must be able to call them.
revoke all on function private.is_gang_member(uuid), private.can_see_gang_invoice(uuid,uuid), private.can_read_gang_file(text),
  private.can_upload_gang_file(text) from public, anon;
grant execute on function private.is_gang_member(uuid), private.can_see_gang_invoice(uuid,uuid), private.can_read_gang_file(text),
  private.can_upload_gang_file(text) to authenticated;
revoke all on function public.save_gang_subcontract(jsonb), public.save_gang_rate(uuid,jsonb), public.void_gang_rate(uuid,text),
  public.my_gang_jobs(), public.submit_gang_invoice(uuid,jsonb), public.reserve_gang_photo(uuid,uuid,jsonb), public.complete_gang_file(uuid),
  public.cancel_gang_invoice(uuid,text), public.answer_gang_query(uuid,text), public.my_gang_invoices(),
  public.record_gang_measurement(uuid,jsonb), public.clear_gang_correction(uuid,text), public.void_gang_measurement(uuid,text),
  public.gang_claim_ledger(uuid,uuid), public.verify_gang_invoice(uuid,uuid,integer,jsonb),
  public.decide_gang_invoice(uuid,uuid,integer,text,jsonb) from public, anon;
grant execute on function public.save_gang_subcontract(jsonb), public.save_gang_rate(uuid,jsonb), public.void_gang_rate(uuid,text),
  public.my_gang_jobs(), public.submit_gang_invoice(uuid,jsonb), public.reserve_gang_photo(uuid,uuid,jsonb), public.complete_gang_file(uuid),
  public.cancel_gang_invoice(uuid,text), public.answer_gang_query(uuid,text), public.my_gang_invoices(),
  public.record_gang_measurement(uuid,jsonb), public.clear_gang_correction(uuid,text), public.void_gang_measurement(uuid,text),
  public.gang_claim_ledger(uuid,uuid), public.verify_gang_invoice(uuid,uuid,integer,jsonb),
  public.decide_gang_invoice(uuid,uuid,integer,text,jsonb) to authenticated;
commit;
