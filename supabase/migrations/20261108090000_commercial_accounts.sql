-- Commercial accounts (C6): payment terms, valuations, notices, invoices, credit notes and final
-- accounts. Money access only, at every layer.
--
-- Builds on the payment applications (C4) and the financial position (C5) without replacing them:
--   * Each contract gets its own payment terms: interim valuations, stage or milestone payments, a
--     bespoke schedule, or payment on completion; an advance payment and how it is recovered;
--     whether materials on site may be valued; a retention cap and release at practical completion
--     and making good; Construction Act timing (due date, final date, payment and pay less notice
--     periods); VAT treatment; CIS; and agreed daywork markups.
--   * TileSPEC's own business details are entered once by the owner. Nothing is assumed: with no
--     VAT registration recorded, no VAT is charged and no VAT number is printed.
--   * Applications are cumulative. Every figure is worked out by the database and fixed on
--     submission; "this period" is always the net to date less the sum notified on the previous
--     application, so nothing is counted twice.
--   * Only agreed extras are claimed: office approved, charge approved, client authorised where the
--     contract requires it, not disputed, and not already included in a variation.
--   * Issued documents are numbered, immutable snapshots with a content hash. A correction is a new
--     revision naming the one it replaces, or for an invoice a credit note. Nothing is overwritten.
-- Additive and transactional. Review before hosted use; see docs/operations/commercial-accounts.md.
begin;
do $$ begin
  if to_regprocedure('public.contract_financial_positions(uuid[])') is null or to_regprocedure('private.payment_application_figures(uuid)') is null
    or to_regprocedure('private.has_money_access()') is null or to_regclass('public.payment_receipts') is null then
    raise exception 'Preflight failed: the financial position (20261104130000) and payment applications (20261104120000) are required';
  end if;
  if to_regclass('public.contract_payment_terms') is not null or to_regclass('public.commercial_documents') is not null
    or to_regclass('public.organisation_billing_profiles') is not null
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='payment_applications' and column_name='kind') then
    raise exception 'Preflight failed: commercial account objects already exist; review schema drift';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. Records
-- ---------------------------------------------------------------------------------------------

-- TileSPEC's own details for documents, entered by the owner. Every field is optional; documents
-- print only what is recorded. Charging VAT needs a registration number.
create table public.organisation_billing_profiles (
  organisation_id uuid primary key references public.organisations(id), id uuid not null unique default gen_random_uuid(),
  legal_name text check(legal_name is null or length(legal_name) between 2 and 160),
  trading_name text check(trading_name is null or length(trading_name) between 2 and 160),
  registered_address text check(registered_address is null or length(registered_address) between 5 and 500),
  company_number text check(company_number is null or company_number ~ '^[A-Z0-9]{8}$'),
  vat_registered boolean not null default false,
  vat_number text check(vat_number is null or vat_number ~ '^(GB|XI)([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$'),
  cis_status text not null default 'not_registered' check(cis_status in ('not_registered','gross','net','higher')),
  email text check(email is null or (length(email)<=254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  phone text check(phone is null or length(phone) between 6 and 40),
  website text check(website is null or length(website) between 4 and 200),
  bank_account_name text check(bank_account_name is null or length(bank_account_name) between 2 and 120),
  bank_sort_code text check(bank_sort_code is null or bank_sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  bank_account_number text check(bank_account_number is null or bank_account_number ~ '^[0-9]{8}$'),
  payment_instructions text check(payment_instructions is null or length(payment_instructions) between 1 and 500),
  document_footer text check(document_footer is null or length(document_footer) between 1 and 500),
  version integer not null default 1 check(version>0), updated_by uuid references auth.users(id), updated_by_name text, updated_at timestamptz not null default now(),
  check(vat_registered = (vat_number is not null)),
  check(num_nulls(bank_sort_code,bank_account_number) in (0,2))
);

-- Each contract's payment terms. One row per contract, changed only through save_payment_terms with
-- the version the office opened. Every change is audited as commercial; each application keeps a
-- copy of the terms in force when it was submitted. The retention percentage and the narrative
-- payment terms stay on contract_commercials, where C4 and C5 already read them.
create table public.contract_payment_terms (
  contract_id uuid primary key, organisation_id uuid not null, id uuid not null unique default gen_random_uuid(),
  basis text not null default 'interim' check(basis in ('interim','milestones','schedule','completion')),
  valuation_frequency text check(valuation_frequency in ('monthly','four_weekly','fortnightly','weekly')),
  valuation_day integer check(valuation_day between 1 and 31),
  advance_payment numeric(16,2) not null default 0 check(advance_payment between 0 and 1000000000),
  advance_recovery text not null default 'pro_rata' check(advance_recovery in ('pro_rata','first_interim','final_account')),
  materials_on_site boolean not null default false,
  retention_on_materials boolean not null default true,
  retention_cap_percent numeric(6,3) check(retention_cap_percent is null or retention_cap_percent between 0 and 100),
  retention_cap_amount numeric(16,2) check(retention_cap_amount is null or retention_cap_amount between 0 and 1000000000),
  retention_pc_release_percent numeric(6,3) not null default 50 check(retention_pc_release_percent between 0 and 100),
  defects_period_months integer not null default 12 check(defects_period_months between 0 and 120),
  construction_act boolean not null default true,
  due_days integer not null default 7 check(due_days between 0 and 120),
  final_payment_days integer not null default 17 check(final_payment_days between 0 and 120),
  payment_notice_days integer not null default 5 check(payment_notice_days between 0 and 60),
  pay_less_notice_days integer not null default 7 check(pay_less_notice_days between 0 and 60),
  vat_treatment text not null default 'standard' check(vat_treatment in ('standard','reduced','zero','reverse_charge','exempt','outside_scope')),
  vat_rate numeric(5,2) not null default 20 check(vat_rate between 0 and 100),
  cis_applies boolean not null default false,
  cis_rate numeric(5,2) not null default 20 check(cis_rate in (0,20,30)),
  daywork_labour_markup numeric(6,3) not null default 0 check(daywork_labour_markup between 0 and 100),
  daywork_plant_markup numeric(6,3) not null default 0 check(daywork_plant_markup between 0 and 100),
  daywork_materials_markup numeric(6,3) not null default 0 check(daywork_materials_markup between 0 and 100),
  order_reference text check(order_reference is null or length(order_reference) between 1 and 120),
  bill_to_name text check(bill_to_name is null or length(bill_to_name) between 1 and 160),
  bill_to_address text check(bill_to_address is null or length(bill_to_address) between 1 and 500),
  bill_to_email text check(bill_to_email is null or (length(bill_to_email)<=254 and bill_to_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  practical_completion_on date, making_good_on date,
  version integer not null default 1 check(version>0), updated_by uuid references auth.users(id), updated_by_name text, updated_at timestamptz not null default now(),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  check((basis='interim') = (valuation_frequency is not null)),
  check(valuation_day is null or valuation_frequency='monthly'),
  check(vat_treatment not in ('zero','exempt','outside_scope') or vat_rate=0),
  check(vat_treatment not in ('standard','reduced','reverse_charge') or vat_rate>0),
  check(making_good_on is null or (practical_completion_on is not null and making_good_on>=practical_completion_on))
);

-- Stage and milestone payments, or a bespoke schedule. A stage is claimed in an application and
-- stays in every later one, so it is never paid twice. Append-only; void with a reason.
create table public.contract_payment_stages (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  position integer not null check(position between 1 and 200),
  label text not null check(length(label) between 2 and 200),
  amount numeric(16,2) not null check(amount>0 and amount<=1000000000),
  planned_on date, note text check(note is null or length(note) between 1 and 500),
  created_by uuid not null references auth.users(id), created_by_name text not null, created_at timestamptz not null default now(), request_key uuid not null,
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(void_reason) between 3 and 1000),
  unique(organisation_id,created_by,request_key), unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
create unique index contract_payment_stages_live_position on public.contract_payment_stages(contract_id,position) where voided_at is null;

-- A daywork whose work is valued within a variation, so it is never charged twice.
create table public.variation_daywork_inclusions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  variation_id uuid not null, daywork_id uuid not null, note text check(note is null or length(note) between 1 and 500),
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(), request_key uuid not null,
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(void_reason) between 3 and 1000),
  unique(organisation_id,recorded_by,request_key),
  foreign key(organisation_id,contract_id,variation_id) references public.dayworks(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check(variation_id<>daywork_id), check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
create unique index variation_daywork_inclusions_once on public.variation_daywork_inclusions(daywork_id) where voided_at is null;

-- A dispute over an application or an extra. While open, the application shows as disputed and the
-- extra is neither in the revised contract value nor claimable.
create table public.commercial_disputes (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  application_id uuid, daywork_id uuid,
  raised_on date not null, raised_by_party text not null check(raised_by_party in ('client','tilespec')),
  summary text not null check(length(summary) between 5 and 1000),
  amount_disputed numeric(16,2) check(amount_disputed is null or amount_disputed between 0 and 1000000000),
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(), request_key uuid not null,
  resolved_on date, resolution text check(resolution is null or length(resolution) between 3 and 1000),
  resolved_by uuid references auth.users(id), resolved_by_name text,
  unique(organisation_id,recorded_by,request_key),
  foreign key(organisation_id,contract_id,daywork_id) references public.dayworks(organisation_id,contract_id,id),
  check(num_nonnulls(application_id,daywork_id)=1),
  check(num_nulls(resolved_on,resolution,resolved_by,resolved_by_name) in (0,4)),
  check(resolved_on is null or resolved_on>=raised_on)
);

-- Applications: their kind, the terms and every figure fixed on submission, the Construction Act
-- dates, the materials element for CIS and the client's certificate breakdown.
alter table public.payment_applications
  add column kind text not null default 'interim' check(kind in ('interim','advance','final')),
  add column cis_materials numeric(16,2) not null default 0 check(cis_materials between 0 and 1000000000),
  add column terms jsonb, add column valuation jsonb,
  add column applied_on date, add column due_on date, add column final_on date, add column payment_notice_by date, add column pay_less_by date,
  add column cert_retention numeric(16,2) check(cert_retention is null or cert_retention>=0),
  add column cert_deductions numeric(16,2) check(cert_deductions is null or cert_deductions>=0),
  add column cert_net numeric(16,2),
  add constraint payment_applications_submitted_figures check(status='draft' or (status='cancelled' and submitted_at is null)
    or num_nulls(terms,valuation,applied_on,due_on,final_on,payment_notice_by,pay_less_by)=0),
  add constraint payment_applications_certified_figures check((status='certified') = (cert_net is not null) or (status='cancelled'));

alter table public.payment_application_lines drop constraint payment_application_lines_kind_check;
alter table public.payment_application_lines add constraint payment_application_lines_kind_check
  check(kind in ('contract_works','stage','extra_work','materials_on_site','other','deduction'));
alter table public.payment_application_lines add column stage_id uuid,
  add constraint payment_application_lines_stage foreign key(organisation_id,contract_id,stage_id) references public.contract_payment_stages(organisation_id,contract_id,id),
  add constraint payment_application_lines_stage_named check((kind='stage') = (stage_id is not null));
create unique index payment_application_lines_stage_once on public.payment_application_lines(application_id,lines_version,stage_id) where stage_id is not null;
alter table public.commercial_disputes add constraint commercial_disputes_application
  foreign key(organisation_id,contract_id,application_id) references public.payment_applications(organisation_id,contract_id,id);

-- CIS the client deducted from a payment, evidenced by their deduction statement. A payment settles
-- the cash received plus the CIS deducted.
alter table public.payment_receipts add column cis_deducted numeric(16,2) not null default 0 check(cis_deducted between 0 and 100000000);

-- The client's pay less notice, or TileSPEC's default payment notice when no payment notice came in
-- time. Each states the sum due for that payment, excluding VAT, and its basis.
create table public.payment_notices (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null, application_id uuid not null,
  kind text not null check(kind in ('pay_less','default_payment')),
  given_on date not null, sum_stated numeric(16,2) not null check(sum_stated between -1000000000 and 1000000000),
  basis text not null check(length(basis) between 3 and 2000),
  reference text check(reference is null or length(reference) between 1 and 120),
  document_id uuid references public.document_revisions(id),
  in_time boolean not null,
  recorded_by uuid not null references auth.users(id), recorded_by_name text not null, recorded_at timestamptz not null default now(), request_key uuid not null,
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check(void_reason is null or length(void_reason) between 3 and 1000),
  unique(organisation_id,recorded_by,request_key), unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,application_id) references public.payment_applications(organisation_id,contract_id,id),
  check(num_nulls(voided_at,voided_by,void_reason) in (0,3))
);
create unique index payment_notices_live_kind on public.payment_notices(application_id,kind) where voided_at is null;

-- Daywork markups agreed in the contract are copied onto each priced line.
alter table public.daywork_pricing_lines add column markup_percent numeric(6,3) not null default 0 check(markup_percent between 0 and 100),
  add column markup numeric(14,2) not null default 0 check(markup>=0);

-- Every issued document: numbered, a snapshot of everything printed on it, and its hash. Invoices
-- and credit notes are numbered in one unbroken sequence per business; other documents per job.
create table public.commercial_documents (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null,
  kind text not null check(kind in ('payment_application','final_account','invoice','credit_note','default_payment_notice',
    'variation_schedule','daywork_summary','statement')),
  series text not null check(series in ('PA','FA','INV','CN','DPN','VS','DS','ST')),
  sequence integer not null check(sequence>0), revision integer not null default 0 check(revision between 0 and 25),
  reference text not null check(length(reference) between 3 and 140),
  title text not null check(length(title) between 3 and 200),
  application_id uuid, credits_document_id uuid references public.commercial_documents(id), notice_id uuid,
  supersedes_id uuid unique references public.commercial_documents(id),
  revision_reason text check(revision_reason is null or length(revision_reason) between 3 and 1000),
  issued_on date not null,
  net numeric(16,2), vat numeric(16,2), total numeric(16,2), cis numeric(16,2), due_on date, final_on date,
  snapshot jsonb not null, snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  issued_by uuid not null references auth.users(id), issued_by_name text not null, issued_at timestamptz not null default now(), request_key uuid not null,
  superseded_at timestamptz, superseded_by_id uuid references public.commercial_documents(id),
  unique(organisation_id,issued_by,request_key), unique(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
  foreign key(organisation_id,contract_id,application_id) references public.payment_applications(organisation_id,contract_id,id),
  foreign key(organisation_id,contract_id,notice_id) references public.payment_notices(organisation_id,contract_id,id),
  check((kind in ('payment_application','final_account','invoice','default_payment_notice')) = (application_id is not null)),
  check((kind='credit_note') = (credits_document_id is not null)),
  check((kind='default_payment_notice') = (notice_id is not null)),
  check((revision>0) = (supersedes_id is not null and revision_reason is not null)),
  check(revision=0 or kind not in ('invoice','credit_note','default_payment_notice')),
  check(num_nulls(superseded_at,superseded_by_id) in (0,2)),
  check(series = case kind when 'payment_application' then 'PA' when 'final_account' then 'FA' when 'invoice' then 'INV' when 'credit_note' then 'CN'
    when 'default_payment_notice' then 'DPN' when 'variation_schedule' then 'VS' when 'daywork_summary' then 'DS' else 'ST' end)
);
create unique index commercial_documents_business_sequence on public.commercial_documents(organisation_id,series,sequence,revision) where series in ('INV','CN');
create unique index commercial_documents_job_sequence on public.commercial_documents(contract_id,series,sequence,revision) where series not in ('INV','CN');
create index commercial_documents_contract on public.commercial_documents(contract_id,issued_at desc);

-- A revocable link to send one issued document to someone outside TileSPEC. Only a hash of the
-- link's secret is kept.
create table public.commercial_document_shares (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, contract_id uuid not null, document_id uuid not null,
  token_sha256 text not null unique check(token_sha256 ~ '^[0-9a-f]{64}$'),
  recipient text check(recipient is null or length(recipient) between 2 and 200),
  expires_at timestamptz not null, created_by uuid not null references auth.users(id), created_by_name text not null, created_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid references auth.users(id), view_count integer not null default 0 check(view_count>=0), last_viewed_at timestamptz,
  foreign key(organisation_id,contract_id,document_id) references public.commercial_documents(organisation_id,contract_id,id),
  check(num_nulls(revoked_at,revoked_by) in (0,2)), check(expires_at>created_at)
);
create index payment_notices_application on public.payment_notices(application_id);
create index commercial_disputes_contract on public.commercial_disputes(contract_id);
create index contract_payment_stages_contract on public.contract_payment_stages(contract_id,position);

-- ---------------------------------------------------------------------------------------------
-- 2. Read access, immutability and audit
-- ---------------------------------------------------------------------------------------------
alter table public.organisation_billing_profiles enable row level security;
create policy organisation_billing_profiles_read on public.organisation_billing_profiles for select to authenticated
  using(organisation_id=private.current_org() and private.has_money_access());
do $$ declare t text; begin
  foreach t in array array['contract_payment_terms','contract_payment_stages','variation_daywork_inclusions','commercial_disputes','payment_notices',
    'commercial_documents','commercial_document_shares'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using(organisation_id=private.current_org() and private.can_view_financials(contract_id))',t||'_read',t);
  end loop;
  foreach t in array array['organisation_billing_profiles','contract_payment_terms','contract_payment_stages','variation_daywork_inclusions','commercial_disputes',
    'payment_notices','commercial_documents','commercial_document_shares'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create trigger financial_audit after insert or update on public.%I for each row execute function private.audit_financial_mutation()',t);
  end loop;
end $$;
-- The share's secret hash is never read by the app; the office sees when a link was made and opened.
revoke select on public.commercial_document_shares from authenticated;
grant select(id,organisation_id,contract_id,document_id,recipient,expires_at,created_by_name,created_at,revoked_at,view_count,last_viewed_at)
  on public.commercial_document_shares to authenticated;

create trigger daily_append_only before update or delete on public.contract_payment_stages for each row execute function private.guard_append_only('voided_at','voided_by','void_reason');
create trigger daily_append_only before update or delete on public.variation_daywork_inclusions for each row execute function private.guard_append_only('voided_at','voided_by','void_reason');
create trigger daily_append_only before update or delete on public.payment_notices for each row execute function private.guard_append_only('voided_at','voided_by','void_reason');
create trigger daily_append_only before update or delete on public.commercial_disputes for each row
  execute function private.guard_append_only('resolved_on','resolution','resolved_by','resolved_by_name');
create trigger daily_append_only before update or delete on public.commercial_documents for each row
  execute function private.guard_append_only('superseded_at','superseded_by_id');

create function private.guard_commercial_document_share() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Shared links are kept on record; revoke one instead' using errcode='42501'; end if;
  if (to_jsonb(new)-array['revoked_at','revoked_by','view_count','last_viewed_at']) is distinct from (to_jsonb(old)-array['revoked_at','revoked_by','view_count','last_viewed_at'])
    or (old.revoked_at is not null and (new.revoked_at,new.revoked_by) is distinct from (old.revoked_at,old.revoked_by))
    or new.view_count<old.view_count then
    raise exception 'A shared link cannot be rewritten' using errcode='42501'; end if;
  return new;
end $$;
create trigger commercial_document_share_guard before update or delete on public.commercial_document_shares for each row execute function private.guard_commercial_document_share();
create function private.guard_payment_terms() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Payment terms are kept on record; change them instead' using errcode='42501'; end if;
  if (new.id,new.contract_id,new.organisation_id) is distinct from (old.id,old.contract_id,old.organisation_id) then
    raise exception 'Payment terms cannot move to another contract' using errcode='42501'; end if;
  return new;
end $$;
create trigger payment_terms_guard before update or delete on public.contract_payment_terms for each row execute function private.guard_payment_terms();
create trigger billing_profile_guard before delete on public.organisation_billing_profiles for each row execute function private.guard_payment_terms();

-- An application's identity never changes; once submitted its figures, terms and dates are fixed;
-- once certified or cancelled it is final.
create or replace function private.guard_payment_application() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Payment applications are permanent; cancel one with a reason' using errcode='42501'; end if;
  if (new.id,new.organisation_id,new.contract_id,new.number,new.kind,new.created_by,new.created_by_name,new.created_at,new.request_key)
    is distinct from (old.id,old.organisation_id,old.contract_id,old.number,old.kind,old.created_by,old.created_by_name,old.created_at,old.request_key) then
    raise exception 'A payment application cannot be rewritten' using errcode='42501'; end if;
  if old.status in ('certified','cancelled') then raise exception 'This payment application is final' using errcode='42501'; end if;
  if old.status='submitted' and (new.period_end,new.note,new.lines_version,new.gross_applied,new.retention_percent,new.submitted_at,new.submitted_by,
      new.cis_materials,new.terms,new.valuation,new.applied_on,new.due_on,new.final_on,new.payment_notice_by,new.pay_less_by)
    is distinct from (old.period_end,old.note,old.lines_version,old.gross_applied,old.retention_percent,old.submitted_at,old.submitted_by,
      old.cis_materials,old.terms,old.valuation,old.applied_on,old.due_on,old.final_on,old.payment_notice_by,old.pay_less_by) then
    raise exception 'A submitted payment application cannot be changed' using errcode='42501'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Working out the figures (never stored for drafts; fixed on submission)
-- ---------------------------------------------------------------------------------------------

-- The terms in force for a contract now. Without a payment terms row, C4's behaviour is kept:
-- materials on site may be valued, no cap, no advance. VAT follows TileSPEC's recorded registration.
create function private.valuation_terms(p_contract uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'has_terms',t.contract_id is not null,'basis',coalesce(t.basis,'interim'),'valuation_frequency',t.valuation_frequency,'valuation_day',t.valuation_day,
    'original_value',coalesce(k.contract_value,0),'retention_percent',coalesce(k.retention_percent,0),
    'retention_cap_percent',t.retention_cap_percent,'retention_cap_amount',t.retention_cap_amount,
    'retention_on_materials',coalesce(t.retention_on_materials,true),'retention_pc_release_percent',coalesce(t.retention_pc_release_percent,50),
    'defects_period_months',coalesce(t.defects_period_months,12),'practical_completion_on',t.practical_completion_on,'making_good_on',t.making_good_on,
    'advance_payment',coalesce(t.advance_payment,0),'advance_recovery',coalesce(t.advance_recovery,'pro_rata'),
    'materials_on_site',coalesce(t.materials_on_site,true),'construction_act',coalesce(t.construction_act,true),
    'due_days',coalesce(t.due_days,7),'final_payment_days',coalesce(t.final_payment_days,17),
    'payment_notice_days',coalesce(t.payment_notice_days,5),'pay_less_notice_days',coalesce(t.pay_less_notice_days,7),
    'vat_treatment',case when coalesce(b.vat_registered,false) then coalesce(t.vat_treatment,'standard') else 'not_registered' end,
    'vat_rate',case when coalesce(b.vat_registered,false) then coalesce(t.vat_rate,20) else 0 end,
    'cis_applies',coalesce(t.cis_applies,false),'cis_rate',case when coalesce(t.cis_applies,false) then t.cis_rate else 0 end,
    'order_reference',t.order_reference)
  from public.contracts c
  left join public.contract_commercials k on k.contract_id=c.id
  left join public.contract_payment_terms t on t.contract_id=c.id
  left join public.organisation_billing_profiles b on b.organisation_id=c.organisation_id
  where c.id=p_contract
$$;

-- Every daywork and variation with its commercial state:
--   draft      still on site or sent back for more detail
--   submitted  with the office or client, not yet agreed
--   approved   office approved, charge approved, client authorised where required
--   disputed   an open dispute
--   rejected   rejected by the office or declined by the client
-- Claimable: approved, not disputed, and not included in a variation.
create function private.extra_states(p_contract uuid)
returns table(daywork_id uuid,kind text,number integer,reference text,description text,instructed_on date,state text,claimable boolean,
  approved_total numeric,latest_total numeric,pricing_method text,included_in uuid,sent boolean,client_required boolean,client_status text)
language sql stable security definer set search_path='' as $$
  select d.id,d.kind,d.number,case d.kind when 'variation' then 'VO-' else 'DW-' end||d.number,d.description,d.instructed_on,
    case when d.office_status='rejected' or d.client_status='declined' then 'rejected'
      when dis.id is not null then 'disputed'
      when ag.agreed then 'approved'
      when d.site_status='recorded' then 'draft'
      else 'submitted' end,
    ag.agreed and dis.id is null and inc.variation_id is null,
    appr.total,latest.total,latest.method,inc.variation_id,d.office_status is not null,private.client_authorisation_required(d.contract_id,d.kind),d.client_status
  from public.dayworks d
  cross join lateral (select (d.office_status='approved' and d.commercial_status='commercially_approved'
      and (d.client_status='authorised' or not private.client_authorisation_required(d.contract_id,d.kind))) as agreed) ag
  left join lateral (select p.total from public.daywork_commercial_approvals a join public.daywork_pricings p on p.id=a.pricing_id where a.daywork_id=d.id) appr on true
  left join lateral (select p.total,p.method from public.daywork_pricings p where p.daywork_id=d.id and p.lines_version=d.lines_version
    order by p.priced_at desc,p.id desc limit 1) latest on true
  left join lateral (select i.variation_id from public.variation_daywork_inclusions i where i.daywork_id=d.id and i.voided_at is null) inc on true
  left join lateral (select x.id from public.commercial_disputes x where x.daywork_id=d.id and x.resolved_on is null limit 1) dis on true
  where d.contract_id=p_contract
$$;

-- One application's cumulative valuation under the given terms.
--   gross            = contract works + stages + variations + dayworks + materials on site + other
--   retention        = the percentage of the gross (less materials on site where retention is not
--                      taken on them), no more than the cap; half (or the agreed share) released
--                      from practical completion, the rest from making good
--   advance          = the advance payment, once an advance application has been made, recovered
--                      pro rata to contract works, in full at the first interim, or in the final account
--   net to date      = gross - retention held + advance - advance recovered - agreed deductions
create function private.compute_valuation(p_application uuid,p_terms jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.payment_applications; s record; v_gross numeric; v_base numeric; v_pct numeric; v_full numeric; v_cap numeric; v_ret numeric;
  v_pc numeric:=0; v_final numeric:=0; v_orig numeric; v_adv numeric:=0; v_rec numeric:=0; v_pc_on date; v_mg_on date; v_prior public.payment_applications;
begin
  select * into a from public.payment_applications where id=p_application;
  select coalesce(sum(l.amount) filter (where l.kind='contract_works'),0) as works,coalesce(sum(l.amount) filter (where l.kind='stage'),0) as stages,
    coalesce(sum(l.amount) filter (where l.kind='extra_work' and d.kind='variation'),0) as variations,
    coalesce(sum(l.amount) filter (where l.kind='extra_work' and d.kind='daywork'),0) as dayworks,
    coalesce(sum(l.amount) filter (where l.kind='materials_on_site'),0) as materials,coalesce(sum(l.amount) filter (where l.kind='other'),0) as other,
    coalesce(sum(l.amount) filter (where l.kind='deduction'),0) as deductions
  into s from public.payment_application_lines l left join public.dayworks d on d.id=l.daywork_id
  where l.application_id=a.id and l.lines_version=a.lines_version;
  v_gross:=s.works+s.stages+s.variations+s.dayworks+s.materials+s.other;
  v_pct:=coalesce((p_terms->>'retention_percent')::numeric,0);
  v_base:=greatest(v_gross-case when coalesce((p_terms->>'retention_on_materials')::boolean,true) then 0 else s.materials end,0);
  v_full:=round(v_base*v_pct/100,2);
  v_orig:=coalesce((p_terms->>'original_value')::numeric,0);
  v_cap:=least((p_terms->>'retention_cap_amount')::numeric,round(v_orig*(p_terms->>'retention_cap_percent')::numeric/100,2));
  v_ret:=case when v_cap is null then v_full else least(v_full,v_cap) end;
  v_pc_on:=(p_terms->>'practical_completion_on')::date; v_mg_on:=(p_terms->>'making_good_on')::date;
  if v_pc_on is not null and a.period_end>=v_pc_on then
    v_pc:=round(v_ret*coalesce((p_terms->>'retention_pc_release_percent')::numeric,50)/100,2); end if;
  if v_mg_on is not null and a.period_end>=v_mg_on then v_final:=v_ret-v_pc; end if;
  if a.kind='advance' then v_adv:=coalesce((p_terms->>'advance_payment')::numeric,0);
  else
    select * into v_prior from public.payment_applications p where p.contract_id=a.contract_id and p.kind='advance' and p.status<>'cancelled'
      and p.number<a.number order by p.number desc limit 1;
    if found then
      v_adv:=coalesce((v_prior.valuation->>'advance')::numeric,(p_terms->>'advance_payment')::numeric,0);
      v_rec:=case when a.kind='final' or p_terms->>'advance_recovery'='first_interim' then v_adv
        when p_terms->>'advance_recovery'='final_account' then 0
        when v_orig>0 then least(v_adv,round(v_adv*(s.works+s.stages)/v_orig,2)) else 0 end;
    end if;
  end if;
  return jsonb_build_object('works',s.works,'stages',s.stages,'variations',s.variations,'dayworks',s.dayworks,'materials_on_site',s.materials,'other',s.other,
    'gross',v_gross,'retention_base',v_base,'retention_percent',v_pct,'retention_full',v_full,'retention_cap',v_cap,
    'retention_capped',coalesce(v_cap<v_full,false),'retention',v_ret,'retention_released_pc',v_pc,'retention_released_final',v_final,
    'retention_held',v_ret-v_pc-v_final,'advance',v_adv,'advance_recovered',v_rec,'deductions',s.deductions,
    'net',v_gross-(v_ret-v_pc-v_final)+v_adv-v_rec-s.deductions,'practical_completion_on',v_pc_on,'making_good_on',v_mg_on);
end $$;

-- Retention on a gross the client certified, by the same rules as the application.
create function private.certified_retention(p_valuation jsonb,p_terms jsonb,p_gross numeric) returns numeric
language plpgsql immutable set search_path='' as $$
declare v_base numeric; v_full numeric; v_cap numeric:=(p_valuation->>'retention_cap')::numeric; v_ret numeric;
begin
  v_base:=greatest(p_gross-case when coalesce((p_terms->>'retention_on_materials')::boolean,true) then 0 else coalesce((p_valuation->>'materials_on_site')::numeric,0) end,0);
  v_full:=round(v_base*coalesce((p_valuation->>'retention_percent')::numeric,0)/100,2);
  v_ret:=case when v_cap is null then v_full else least(v_full,v_cap) end;
  if coalesce((p_valuation->>'retention_released_final')::numeric,0)>0 or (p_valuation->>'retention_held')::numeric=0 and (p_valuation->>'retention')::numeric>0 then return 0; end if;
  if coalesce((p_valuation->>'retention_released_pc')::numeric,0)>0 then
    return v_ret-round(v_ret*coalesce((p_terms->>'retention_pc_release_percent')::numeric,50)/100,2); end if;
  return v_ret;
end $$;

-- Every application on a contract, in order, with every figure the office, the documents and the
-- financial position use. The sum notified for an application is the client's effective pay less
-- notice, else its certificate (payment notice), else TileSPEC's default notice, else the
-- application itself. "Due this period" is the notified net to date less the previous one.
create function private.account_rows(p_contract uuid) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.payment_applications; t jsonb; v jsonb; live jsonb:=private.valuation_terms(p_contract); today date:=private.site_today();
  prev_notified numeric:=0; prev_net numeric; prev_cert numeric; cert_ret numeric; cert_net numeric; notified numeric; due numeric;
  vat numeric; vat_reverse numeric; cis numeric; cash numeric; cis_received numeric; invoiced numeric; open_dispute boolean; display text; final_eff date;
  pl public.payment_notices; dn public.payment_notices; pay_less_effective boolean; act boolean;
begin
  for a in select * from public.payment_applications p where p.contract_id=p_contract order by p.number loop
    t:=coalesce(a.terms,live); v:=coalesce(a.valuation,private.compute_valuation(a.id,t)); act:=coalesce((t->>'construction_act')::boolean,true);
    select coalesce(sum(r.amount),0),coalesce(sum(r.cis_deducted),0) into cash,cis_received from public.payment_receipts r where r.application_id=a.id and r.voided_at is null;
    if a.status='cancelled' then
      return next jsonb_build_object('application_id',a.id,'number',a.number,'kind',a.kind,'period_end',a.period_end,'status',a.status,'display_status','cancelled',
        'gross',(v->>'gross')::numeric,'retention_percent',(v->>'retention_percent')::numeric,'retention_held',(v->>'retention_held')::numeric,'net',(v->>'net')::numeric,
        'net_this_period',null,'certified_gross',a.certified_gross,'certified_retention',a.cert_retention,'certified_net',a.cert_net,'certified_this_period',null,
        'received',cash+cis_received,'received_cash',cash,'received_cis',cis_received,'valuation',v);
      continue;
    end if;
    if a.certified_gross is not null then
      cert_ret:=coalesce(a.cert_retention,private.certified_retention(v,t,a.certified_gross));
      cert_net:=coalesce(a.cert_net,a.certified_gross-cert_ret+(v->>'advance')::numeric-(v->>'advance_recovered')::numeric-coalesce(a.cert_deductions,(v->>'deductions')::numeric));
    else cert_ret:=null; cert_net:=null; end if;
    select * into pl from public.payment_notices n where n.application_id=a.id and n.kind='pay_less' and n.voided_at is null;
    select * into dn from public.payment_notices n where n.application_id=a.id and n.kind='default_payment' and n.voided_at is null;
    pay_less_effective:=pl.id is not null and (pl.in_time or not act);
    notified:=case when pay_less_effective then prev_notified+pl.sum_stated when cert_net is not null then cert_net
      when dn.id is not null then prev_notified+dn.sum_stated else (v->>'net')::numeric end;
    due:=notified-prev_notified;
    vat:=case when t->>'vat_treatment' in ('standard','reduced') then round(due*(t->>'vat_rate')::numeric/100,2) else 0 end;
    vat_reverse:=case when t->>'vat_treatment'='reverse_charge' then round(due*(t->>'vat_rate')::numeric/100,2) else 0 end;
    cis:=case when coalesce((t->>'cis_applies')::boolean,false) then round(greatest(due-a.cis_materials,0)*(t->>'cis_rate')::numeric/100,2) else 0 end;
    select coalesce(sum(i.total),0)-coalesce((select sum(c.total) from public.commercial_documents c join public.commercial_documents i2 on i2.id=c.credits_document_id
        where c.kind='credit_note' and i2.application_id=a.id),0)
      into invoiced from public.commercial_documents i where i.kind='invoice' and i.application_id=a.id;
    open_dispute:=exists(select 1 from public.commercial_disputes x where x.application_id=a.id and x.resolved_on is null);
    final_eff:=case when dn.id is not null then a.final_on+greatest(dn.given_on-a.payment_notice_by,0) else a.final_on end;
    display:=case when a.status='draft' then 'draft' when open_dispute then 'disputed'
      when due+vat>0 and cash+cis_received>=due+vat then 'paid'
      when final_eff is not null and today>final_eff and due+vat-cash-cis_received>0 then 'overdue'
      when cash+cis_received>0 then 'part_paid' when a.status='certified' then 'certified' else 'submitted' end;
    return next jsonb_build_object('application_id',a.id,'number',a.number,'kind',a.kind,'period_end',a.period_end,'status',a.status,'display_status',display,
      'applied_on',a.applied_on,'due_on',a.due_on,'final_on',a.final_on,'final_on_effective',final_eff,'payment_notice_by',a.payment_notice_by,'pay_less_by',a.pay_less_by,
      'construction_act',act,'gross',(v->>'gross')::numeric,'retention_percent',(v->>'retention_percent')::numeric,'retention_held',(v->>'retention_held')::numeric,
      'net',(v->>'net')::numeric,'net_this_period',(v->>'net')::numeric-coalesce(prev_net,0),'previous_notified',prev_notified,
      'applied_this_period',(v->>'net')::numeric-prev_notified,
      'certified_gross',a.certified_gross,'certified_retention',cert_ret,'certified_net',cert_net,'certified_on',a.certified_on,
      'certified_this_period',case when cert_net is null then null else cert_net-coalesce(prev_cert,0) end,
      'certificate_in_time',case when a.certified_on is null then null else a.certified_on<=a.payment_notice_by end,
      'pay_less_sum',pl.sum_stated,'pay_less_on',pl.given_on,'pay_less_in_time',pl.in_time,'pay_less_effective',pay_less_effective,
      'default_notice_on',dn.given_on,'default_notice_sum',dn.sum_stated,
      'notified_cumulative',notified,'due_this_period',due,'vat_treatment',t->>'vat_treatment','vat_rate',(t->>'vat_rate')::numeric,'vat',vat,'vat_reverse_charge',vat_reverse,
      'cis_rate',(t->>'cis_rate')::numeric,'cis_materials',a.cis_materials,'cis_expected',cis,'payable',due+vat-cis,'invoiced',invoiced,
      'received',cash+cis_received,'received_cash',cash,'received_cis',cis_received,'outstanding',due+vat-cash-cis_received,'disputed',open_dispute,
      'overdue_days',case when display='overdue' then today-final_eff else 0 end,'valuation',v);
    if a.status<>'draft' then prev_notified:=notified; end if;
    prev_net:=(v->>'net')::numeric;
    if cert_net is not null then prev_cert:=cert_net; end if;
  end loop;
end $$;

-- C4's figures, now from the full valuation. Without payment terms they are exactly C4's.
create or replace function private.payment_application_figures(p_contract uuid)
returns table(application_id uuid,number integer,period_end date,status text,gross numeric,retention_percent numeric,retention numeric,net numeric,
  net_this_period numeric,certified_gross numeric,certified_retention numeric,certified_net numeric,certified_this_period numeric,received numeric)
language sql stable security definer set search_path='' as $$
  select (r->>'application_id')::uuid,(r->>'number')::integer,(r->>'period_end')::date,r->>'status',(r->>'gross')::numeric,(r->>'retention_percent')::numeric,
    (r->>'retention_held')::numeric,(r->>'net')::numeric,(r->>'net_this_period')::numeric,(r->>'certified_gross')::numeric,(r->>'certified_retention')::numeric,
    (r->>'certified_net')::numeric,(r->>'certified_this_period')::numeric,(r->>'received')::numeric
  from private.account_rows(p_contract) r
$$;

-- The office's account of one job: every application and its status, money access only.
create function public.commercial_account(p_contract uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_view_financials(p_contract) then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  return jsonb_build_object('terms',private.valuation_terms(p_contract),
    'applications',coalesce((select jsonb_agg(r order by (r->>'number')::integer) from private.account_rows(p_contract) r),'[]'::jsonb),
    'extras',coalesce((select jsonb_agg(to_jsonb(e) order by e.kind,e.number) from private.extra_states(p_contract) e),'[]'::jsonb),
    'as_at',private.site_today());
end $$;

-- C5's position: an extra is agreed only when approved and not disputed; a daywork included in a
-- variation is valued within it; payments settle with the CIS the client deducted.
create or replace function private.contract_financial_position(p_contract uuid)
returns table(contract_id uuid,has_budget boolean,original_value numeric,budget_cost numeric,contingency numeric,target_margin numeric,retention_percent numeric,
  extras_agreed numeric,extras_agreed_count integer,extras_pending numeric,extras_pending_count integer,extras_unpriced_count integer,revised_value numeric,
  labour_cost numeric,labour_hours_without_rate numeric,labour_still_on_site integer,materials_cost numeric,subcontract_cost numeric,plant_cost numeric,other_cost numeric,
  actual_cost numeric,forecast_cost numeric,forecast_profit numeric,forecast_margin numeric,budget_profit numeric,budget_margin numeric,
  applied_gross numeric,certified_gross numeric,certified_net numeric,retention_held numeric,received numeric,outstanding numeric,subcontract_overlap integer)
language sql stable security definer set search_path='' as $$
  with k as (
    select c.contract_value,c.labour_budget+c.materials_budget+c.preliminaries_budget as budget_cost,c.contingency,c.target_margin,c.retention_percent
    from public.contract_commercials c where c.contract_id=p_contract
  ), extras as (
    select * from private.extra_states(p_contract) e where e.state<>'rejected' and e.included_in is null
  ), x as (
    select coalesce(sum(approved_total) filter (where claimable),0) as agreed,count(*) filter (where claimable)::integer as agreed_count,
      coalesce(sum(coalesce(approved_total,latest_total)) filter (where not claimable and coalesce(approved_total,latest_total) is not null and state<>'draft'),0) as pending,
      count(*) filter (where not claimable and coalesce(approved_total,latest_total) is not null and state<>'draft')::integer as pending_count,
      count(*) filter (where sent and latest_total is null and state in ('draft','submitted'))::integer as unpriced_count
    from extras
  ), lines as (
    select * from private.labour_cost_lines(p_contract)
  ), l as (
    select coalesce(sum(cost) filter (where status='costed'),0) as cost,coalesce(sum(hours) filter (where status='no_rate'),0) as no_rate_hours,
      count(*) filter (where status='open')::integer as open from lines
  ), j as (
    select coalesce(sum(net_amount) filter (where category='materials'),0) as materials,coalesce(sum(net_amount) filter (where category='subcontract'),0) as subcontract,
      coalesce(sum(net_amount) filter (where category='plant'),0) as plant,coalesce(sum(net_amount) filter (where category='other'),0) as other
    from public.job_cost_entries where contract_id=p_contract and voided_at is null
  ), apps as (
    select * from private.payment_application_figures(p_contract)
  ), p as (
    select (select a.gross from apps a where a.status in ('submitted','certified') order by a.number desc limit 1) as applied,
      (select a.certified_gross from apps a where a.status='certified' order by a.number desc limit 1) as certified_gross,
      (select a.certified_net from apps a where a.status='certified' order by a.number desc limit 1) as certified_net,
      (select a.certified_retention from apps a where a.status='certified' order by a.number desc limit 1) as retention,
      (select coalesce(sum(r.amount+r.cis_deducted),0) from public.payment_receipts r where r.contract_id=p_contract and r.voided_at is null) as received
  ), overlap as (
    select count(*)::integer as n from public.job_cost_entries e
    where e.contract_id=p_contract and e.voided_at is null and e.category='subcontract' and e.company_id is not null
      and exists(select 1 from lines ln left join public.operatives o on ln.subject='operative' and o.id=ln.subject_id
        left join public.teams t on ln.subject='team' and t.id=ln.subject_id
        where ln.status='costed' and coalesce(o.company_id,t.company_id)=e.company_id)
  ), totals as (
    select (select count(*)>0 from k) as has_budget,coalesce((select contract_value from k),0) as original_value,coalesce((select budget_cost from k),0) as budget_cost,
      coalesce((select contingency from k),0) as contingency,(select target_margin from k) as target_margin,coalesce((select retention_percent from k),0) as retention_percent,
      x.*,l.cost as labour,l.no_rate_hours,l.open,j.*,p.*,overlap.n as overlap_count,
      l.cost+j.materials+j.subcontract+j.plant+j.other as actual
    from x,l,j,p,overlap
  )
  select p_contract,t.has_budget,t.original_value,t.budget_cost,t.contingency,t.target_margin,t.retention_percent,
    t.agreed,t.agreed_count,t.pending,t.pending_count,t.unpriced_count,t.original_value+t.agreed,
    t.labour,t.no_rate_hours,t.open,t.materials,t.subcontract,t.plant,t.other,t.actual,
    t.actual+greatest(t.budget_cost-t.actual,0),
    t.original_value+t.agreed-(t.actual+greatest(t.budget_cost-t.actual,0))-t.contingency,
    case when t.original_value+t.agreed>0 then round((t.original_value+t.agreed-(t.actual+greatest(t.budget_cost-t.actual,0))-t.contingency)*100/(t.original_value+t.agreed),2) end,
    t.original_value-t.budget_cost-t.contingency,
    case when t.original_value>0 then round((t.original_value-t.budget_cost-t.contingency)*100/t.original_value,2) end,
    t.applied,t.certified_gross,t.certified_net,t.retention,t.received,
    case when t.certified_net is null then null else t.certified_net-t.received end,
    t.overlap_count
  from totals t
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Terms, business details, stages, inclusions and disputes
-- ---------------------------------------------------------------------------------------------
create function private.require_money(p_contract uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_view_financials(p_contract) then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
end $$;
create function private.field_percent(p_data jsonb,p_key text) returns numeric language plpgsql stable set search_path='' as $$
declare v jsonb:=p_data->p_key; n numeric;
begin
  if v is null or v='null'::jsonb then return null; end if;
  if jsonb_typeof(v)<>'number' then raise exception 'Field % must be a number',p_key using errcode='22023'; end if;
  n:=(v::text)::numeric;
  if n<0 or n>100 or n<>round(n,3) then raise exception 'Field % must be a percentage from 0 to 100',p_key using errcode='22023'; end if;
  return n;
end $$;

-- The owner records TileSPEC's business details. Nothing is invented: blank fields stay blank.
create function public.save_billing_profile(p_version integer,p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); previous public.organisation_billing_profiles; vat text; sort text; acct text; company text; v_registered boolean;
begin
  if not private.is_owner() then raise exception 'Only the owner can change TileSPEC''s business details' using errcode='42501'; end if;
  perform private.only_keys(p_data,array['legal_name','trading_name','registered_address','company_number','vat_registered','vat_number','cis_status','email','phone',
    'website','bank_account_name','bank_sort_code','bank_account_number','payment_instructions','document_footer']);
  perform pg_advisory_xact_lock(hashtextextended('billing-profile:'||org::text,0));
  select * into previous from public.organisation_billing_profiles where organisation_id=org for update;
  if coalesce(previous.version,0) is distinct from p_version then raise exception 'The business details changed; reload before saving' using errcode='40001'; end if;
  vat:=nullif(upper(regexp_replace(coalesce(private.field_text(p_data,'vat_number',20),''),'[[:space:]]','','g')),'');
  if vat ~ '^[0-9]' then vat:='GB'||vat; end if;
  company:=nullif(upper(regexp_replace(coalesce(private.field_text(p_data,'company_number',12),''),'[[:space:]]','','g')),'');
  sort:=nullif(regexp_replace(coalesce(private.field_text(p_data,'bank_sort_code',10),''),'[^0-9]','','g'),'');
  if sort is not null then
    if length(sort)<>6 then raise exception 'Enter the sort code as six digits' using errcode='22023'; end if;
    sort:=substr(sort,1,2)||'-'||substr(sort,3,2)||'-'||substr(sort,5,2); end if;
  acct:=nullif(regexp_replace(coalesce(private.field_text(p_data,'bank_account_number',12),''),'[[:space:]]','','g'),'');
  v_registered:=coalesce(private.field_boolean(p_data,'vat_registered'),false);
  if v_registered and vat is null then raise exception 'Enter the VAT registration number, or record that TileSPEC is not VAT registered' using errcode='22023'; end if;
  if not v_registered then vat:=null; end if;
  if vat is not null and vat !~ '^(GB|XI)([0-9]{9}|[0-9]{12}|GD[0-9]{3}|HA[0-9]{3})$' then raise exception 'Enter a UK VAT number, for example GB123456789' using errcode='22023'; end if;
  if company is not null and company !~ '^[A-Z0-9]{8}$' then raise exception 'Enter the eight-character Companies House number' using errcode='22023'; end if;
  if acct is not null and acct !~ '^[0-9]{8}$' then raise exception 'Enter the eight-digit account number' using errcode='22023'; end if;
  if (sort is null) <> (acct is null) then raise exception 'Enter both the sort code and the account number, or neither' using errcode='22023'; end if;
  perform private.assert_choice(coalesce(nullif(private.field_text(p_data,'cis_status',20),''),'not_registered'),'cis_status',array['not_registered','gross','net','higher']);
  insert into public.organisation_billing_profiles(organisation_id,legal_name,trading_name,registered_address,company_number,vat_registered,vat_number,cis_status,email,phone,
    website,bank_account_name,bank_sort_code,bank_account_number,payment_instructions,document_footer,version,updated_by,updated_by_name)
  values(org,nullif(private.field_text(p_data,'legal_name',160),''),nullif(private.field_text(p_data,'trading_name',160),''),nullif(private.field_text(p_data,'registered_address',500),''),
    company,v_registered,vat,coalesce(nullif(private.field_text(p_data,'cis_status',20),''),'not_registered'),nullif(lower(private.field_text(p_data,'email',254)),''),
    nullif(private.field_text(p_data,'phone',40),''),nullif(private.field_text(p_data,'website',200),''),nullif(private.field_text(p_data,'bank_account_name',120),''),sort,acct,
    nullif(private.field_text(p_data,'payment_instructions',500),''),nullif(private.field_text(p_data,'document_footer',500),''),coalesce(previous.version,0)+1,auth.uid(),private.member_name())
  on conflict(organisation_id) do update set legal_name=excluded.legal_name,trading_name=excluded.trading_name,registered_address=excluded.registered_address,
    company_number=excluded.company_number,vat_registered=excluded.vat_registered,vat_number=excluded.vat_number,cis_status=excluded.cis_status,email=excluded.email,
    phone=excluded.phone,website=excluded.website,bank_account_name=excluded.bank_account_name,bank_sort_code=excluded.bank_sort_code,
    bank_account_number=excluded.bank_account_number,payment_instructions=excluded.payment_instructions,document_footer=excluded.document_footer,
    version=excluded.version,updated_by=excluded.updated_by,updated_by_name=excluded.updated_by_name,updated_at=now();
  return coalesce(previous.version,0)+1;
end $$;

-- The office sets the contract's payment terms. The contract value must already be recorded. The
-- retention percentage and narrative terms are saved on contract_commercials in the same step.
create function public.save_payment_terms(p_contract uuid,p_version integer,p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare previous public.contract_payment_terms; k public.contract_commercials; v_basis text; v_freq text; v_vat text; v_rate numeric; v_cis numeric; v_day integer;
  n integer; v_cap_pct numeric; v_cap_amt numeric;
begin
  perform private.require_money(p_contract);
  perform private.only_keys(p_data,array['basis','valuation_frequency','valuation_day','advance_payment','advance_recovery','materials_on_site','retention_on_materials',
    'retention_percent','retention_cap_percent','retention_cap_amount','retention_pc_release_percent','defects_period_months','construction_act','due_days',
    'final_payment_days','payment_notice_days','pay_less_notice_days','vat_treatment','vat_rate','cis_applies','cis_rate','daywork_labour_markup',
    'daywork_plant_markup','daywork_materials_markup','order_reference','bill_to_name','bill_to_address','bill_to_email','payment_terms']);
  perform pg_advisory_xact_lock(hashtextextended('payment-terms:'||p_contract::text,0));
  select * into k from public.contract_commercials where contract_id=p_contract for update;
  if not found then raise exception 'Record the contract value first' using errcode='22023'; end if;
  select * into previous from public.contract_payment_terms where contract_id=p_contract for update;
  if coalesce(previous.version,0) is distinct from p_version then raise exception 'The payment terms changed; reload before saving' using errcode='40001'; end if;
  v_basis:=coalesce(nullif(private.field_text(p_data,'basis',20),''),'interim');
  perform private.assert_choice(v_basis,'basis',array['interim','milestones','schedule','completion']);
  v_freq:=case when v_basis='interim' then coalesce(nullif(private.field_text(p_data,'valuation_frequency',20),''),'monthly') end;
  perform private.assert_choice(v_freq,'valuation_frequency',array['monthly','four_weekly','fortnightly','weekly']);
  v_day:=case when v_freq='monthly' then private.field_integer(p_data,'valuation_day',1,31) end;
  v_vat:=coalesce(nullif(private.field_text(p_data,'vat_treatment',20),''),'standard');
  perform private.assert_choice(v_vat,'vat_treatment',array['standard','reduced','zero','reverse_charge','exempt','outside_scope']);
  v_rate:=case when v_vat in ('zero','exempt','outside_scope') then 0 else coalesce(private.field_percent(p_data,'vat_rate'),case v_vat when 'reduced' then 5 else 20 end) end;
  if v_vat in ('standard','reduced','reverse_charge') and v_rate<=0 then raise exception 'Enter the VAT rate' using errcode='22023'; end if;
  v_cis:=coalesce(private.field_percent(p_data,'cis_rate'),20);
  if v_cis not in (0,20,30) then raise exception 'The CIS deduction rate is 0, 20 or 30 percent' using errcode='22023'; end if;
  perform private.assert_choice(nullif(private.field_text(p_data,'advance_recovery',20),''),'advance_recovery',array['pro_rata','first_interim','final_account']);
  v_cap_pct:=private.field_percent(p_data,'retention_cap_percent');
  v_cap_amt:=case when p_data ? 'retention_cap_amount' and p_data->'retention_cap_amount'<>'null'::jsonb then private.field_decimal(p_data,'retention_cap_amount',0,1000000000) end;
  if previous.contract_id is not null and exists(select 1 from public.payment_applications a where a.contract_id=p_contract and a.kind='advance' and a.status<>'cancelled')
    and coalesce(case when p_data ? 'advance_payment' then private.field_decimal(p_data,'advance_payment',0,1000000000) end,previous.advance_payment)<>previous.advance_payment then
    raise exception 'The advance payment has been applied for; it cannot be changed now' using errcode='22023'; end if;
  insert into public.contract_payment_terms(contract_id,organisation_id,basis,valuation_frequency,valuation_day,advance_payment,advance_recovery,materials_on_site,
    retention_on_materials,retention_cap_percent,retention_cap_amount,retention_pc_release_percent,defects_period_months,construction_act,due_days,final_payment_days,
    payment_notice_days,pay_less_notice_days,vat_treatment,vat_rate,cis_applies,cis_rate,daywork_labour_markup,daywork_plant_markup,daywork_materials_markup,
    order_reference,bill_to_name,bill_to_address,bill_to_email,practical_completion_on,making_good_on,version,updated_by,updated_by_name)
  values(p_contract,k.organisation_id,v_basis,v_freq,v_day,
    coalesce(case when p_data ? 'advance_payment' then private.field_decimal(p_data,'advance_payment',0,1000000000) end,0),
    coalesce(nullif(private.field_text(p_data,'advance_recovery',20),''),'pro_rata'),
    coalesce(private.field_boolean(p_data,'materials_on_site'),false),coalesce(private.field_boolean(p_data,'retention_on_materials'),true),
    v_cap_pct,v_cap_amt,coalesce(private.field_percent(p_data,'retention_pc_release_percent'),50),
    coalesce(private.field_integer(p_data,'defects_period_months',0,120),12),coalesce(private.field_boolean(p_data,'construction_act'),true),
    coalesce(private.field_integer(p_data,'due_days',0,120),7),coalesce(private.field_integer(p_data,'final_payment_days',0,120),17),
    coalesce(private.field_integer(p_data,'payment_notice_days',0,60),5),coalesce(private.field_integer(p_data,'pay_less_notice_days',0,60),7),
    v_vat,v_rate,coalesce(private.field_boolean(p_data,'cis_applies'),false),v_cis,
    coalesce(private.field_percent(p_data,'daywork_labour_markup'),0),coalesce(private.field_percent(p_data,'daywork_plant_markup'),0),
    coalesce(private.field_percent(p_data,'daywork_materials_markup'),0),
    nullif(private.field_text(p_data,'order_reference',120),''),nullif(private.field_text(p_data,'bill_to_name',160),''),
    nullif(private.field_text(p_data,'bill_to_address',500),''),nullif(lower(private.field_text(p_data,'bill_to_email',254)),''),
    previous.practical_completion_on,previous.making_good_on,coalesce(previous.version,0)+1,auth.uid(),private.member_name())
  on conflict(contract_id) do update set basis=excluded.basis,valuation_frequency=excluded.valuation_frequency,valuation_day=excluded.valuation_day,
    advance_payment=excluded.advance_payment,advance_recovery=excluded.advance_recovery,materials_on_site=excluded.materials_on_site,
    retention_on_materials=excluded.retention_on_materials,retention_cap_percent=excluded.retention_cap_percent,retention_cap_amount=excluded.retention_cap_amount,
    retention_pc_release_percent=excluded.retention_pc_release_percent,defects_period_months=excluded.defects_period_months,construction_act=excluded.construction_act,
    due_days=excluded.due_days,final_payment_days=excluded.final_payment_days,payment_notice_days=excluded.payment_notice_days,
    pay_less_notice_days=excluded.pay_less_notice_days,vat_treatment=excluded.vat_treatment,vat_rate=excluded.vat_rate,cis_applies=excluded.cis_applies,
    cis_rate=excluded.cis_rate,daywork_labour_markup=excluded.daywork_labour_markup,daywork_plant_markup=excluded.daywork_plant_markup,
    daywork_materials_markup=excluded.daywork_materials_markup,order_reference=excluded.order_reference,bill_to_name=excluded.bill_to_name,
    bill_to_address=excluded.bill_to_address,bill_to_email=excluded.bill_to_email,version=excluded.version,updated_by=excluded.updated_by,
    updated_by_name=excluded.updated_by_name,updated_at=now()
  returning version into n;
  -- A draft is valued at the terms in force; submitted applications keep their own copy.
  if p_data ? 'retention_percent' or p_data ? 'payment_terms' then
    update public.contract_commercials set
      retention_percent=coalesce(private.field_percent(p_data,'retention_percent'),retention_percent),
      payment_terms=case when p_data ? 'payment_terms' then coalesce(private.field_text(p_data,'payment_terms',4000),'') else payment_terms end,
      version=version+1,updated_at=now()
    where contract_id=p_contract;
  end if;
  return n;
end $$;

-- Practical completion and the certificate of making good defects, which release retention.
create function public.record_contract_completion(p_contract uuid,p_version integer,p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare t public.contract_payment_terms; pc date; mg date;
begin
  perform private.require_money(p_contract);
  perform private.only_keys(p_data,array['practical_completion_on','making_good_on']);
  select * into t from public.contract_payment_terms where contract_id=p_contract for update;
  if not found then raise exception 'Set the payment terms first' using errcode='22023'; end if;
  if t.version is distinct from p_version then raise exception 'The payment terms changed; reload before saving' using errcode='40001'; end if;
  pc:=coalesce(private.field_date(p_data,'practical_completion_on'),t.practical_completion_on);
  mg:=coalesce(private.field_date(p_data,'making_good_on'),t.making_good_on);
  if pc is null then raise exception 'Enter the date of practical completion' using errcode='22023'; end if;
  if pc>private.site_today() or mg>private.site_today() then raise exception 'Completion dates cannot be in the future' using errcode='22023'; end if;
  if mg is not null and mg<pc then raise exception 'Making good cannot be before practical completion' using errcode='22023'; end if;
  if t.practical_completion_on is not null and pc<>t.practical_completion_on
    and exists(select 1 from public.payment_applications a where a.contract_id=p_contract and a.status in ('submitted','certified')
      and (a.valuation->>'retention_released_pc')::numeric>0) then
    raise exception 'Retention has already been released on the recorded completion date' using errcode='22023'; end if;
  update public.contract_payment_terms set practical_completion_on=pc,making_good_on=mg,version=version+1,updated_by=auth.uid(),updated_by_name=private.member_name(),
    updated_at=now() where contract_id=p_contract returning version into p_version;
  return p_version;
end $$;

create function public.add_payment_stage(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid; org uuid:=private.current_org(); result uuid; n integer;
begin
  perform private.only_keys(p_data,array['contract_id','label','amount','planned_on','note']);
  c:=private.field_uuid(p_data,'contract_id',true);
  perform private.require_money(c);
  result:=private.request_result(org,'add_payment_stage',p_request_key,p_data);
  if result is not null then return result; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-stages:'||c::text,0));
  select coalesce(max(position),0)+1 into n from public.contract_payment_stages where contract_id=c and voided_at is null;
  if n>200 then raise exception 'A contract can have up to 200 payment stages' using errcode='22023'; end if;
  insert into public.contract_payment_stages(organisation_id,contract_id,position,label,amount,planned_on,note,created_by,created_by_name,request_key)
    values(org,c,n,private.field_text(p_data,'label',200,true),private.field_decimal(p_data,'amount',0.01,1000000000),private.field_date(p_data,'planned_on'),
      nullif(private.field_text(p_data,'note',500),''),auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(org,'add_payment_stage',p_request_key,p_data,result);
  return result;
end $$;
create function public.void_payment_stage(p_stage uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.contract_payment_stages;
begin
  select * into s from public.contract_payment_stages where id=p_stage and organisation_id=private.current_org() for update;
  if not found then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  perform private.require_money(s.contract_id);
  if s.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Say why the stage is removed' using errcode='22023'; end if;
  if exists(select 1 from public.payment_application_lines l join public.payment_applications a on a.id=l.application_id and l.lines_version=a.lines_version
    where l.stage_id=s.id and a.status in ('submitted','certified')) then
    raise exception 'This stage has been applied for; it stays on record' using errcode='22023'; end if;
  update public.contract_payment_stages set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=s.id;
end $$;

-- A daywork valued within a variation. It must not already have been applied for, and the variation
-- must not have been applied for at a value that excludes it.
create function public.include_daywork_in_variation(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); dw public.dayworks; vo public.dayworks; result uuid;
begin
  perform private.only_keys(p_data,array['daywork_id','variation_id','note']);
  select * into dw from public.dayworks where id=private.field_uuid(p_data,'daywork_id',true) and organisation_id=org;
  select * into vo from public.dayworks where id=private.field_uuid(p_data,'variation_id',true) and organisation_id=org;
  if dw.id is null or vo.id is null then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  perform private.require_money(dw.contract_id);
  result:=private.request_result(org,'include_daywork_in_variation',p_request_key,p_data);
  if result is not null then return result; end if;
  if dw.kind<>'daywork' or vo.kind<>'variation' or dw.contract_id<>vo.contract_id then
    raise exception 'Choose a daywork and a variation on the same job' using errcode='22023'; end if;
  if exists(select 1 from public.payment_application_lines l join public.payment_applications a on a.id=l.application_id and l.lines_version=a.lines_version
    where l.daywork_id in (dw.id,vo.id) and a.status in ('submitted','certified')) then
    raise exception 'The daywork or the variation has already been applied for. Agree the adjustment as a deduction instead.' using errcode='22023'; end if;
  insert into public.variation_daywork_inclusions(organisation_id,contract_id,variation_id,daywork_id,note,recorded_by,recorded_by_name,request_key)
    values(org,dw.contract_id,vo.id,dw.id,nullif(private.field_text(p_data,'note',500),''),auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(org,'include_daywork_in_variation',p_request_key,p_data,result);
  return result;
end $$;
create function public.remove_daywork_inclusion(p_inclusion uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare i public.variation_daywork_inclusions;
begin
  select * into i from public.variation_daywork_inclusions where id=p_inclusion and organisation_id=private.current_org() for update;
  if not found then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  perform private.require_money(i.contract_id);
  if i.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Give a short reason' using errcode='22023'; end if;
  if exists(select 1 from public.payment_application_lines l join public.payment_applications a on a.id=l.application_id and l.lines_version=a.lines_version
    where l.daywork_id=i.variation_id and a.status in ('submitted','certified')) then
    raise exception 'The variation has been applied for including this daywork; it stays included' using errcode='22023'; end if;
  update public.variation_daywork_inclusions set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=i.id;
end $$;

create function public.raise_commercial_dispute(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; app uuid; dw uuid; result uuid; v_on date;
begin
  perform private.only_keys(p_data,array['application_id','daywork_id','raised_on','raised_by_party','summary','amount_disputed']);
  app:=private.field_uuid(p_data,'application_id'); dw:=private.field_uuid(p_data,'daywork_id');
  if (app is null) = (dw is null) then raise exception 'Choose the application or the daywork or variation in dispute' using errcode='22023'; end if;
  c:=coalesce((select contract_id from public.payment_applications where id=app and organisation_id=org),(select contract_id from public.dayworks where id=dw and organisation_id=org));
  if c is null then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  perform private.require_money(c);
  result:=private.request_result(org,'raise_commercial_dispute',p_request_key,p_data);
  if result is not null then return result; end if;
  if app is not null and (select status from public.payment_applications where id=app) not in ('submitted','certified') then
    raise exception 'Only a submitted or certified application can be in dispute' using errcode='22023'; end if;
  if exists(select 1 from public.commercial_disputes x where x.resolved_on is null and (x.application_id=app or x.daywork_id=dw)) then
    raise exception 'There is already an open dispute; resolve it or add to it' using errcode='22023'; end if;
  v_on:=coalesce(private.field_date(p_data,'raised_on'),private.site_today());
  if v_on>private.site_today() then raise exception 'The date cannot be in the future' using errcode='22023'; end if;
  perform private.assert_choice(private.field_text(p_data,'raised_by_party',10,true),'raised_by_party',array['client','tilespec']);
  insert into public.commercial_disputes(organisation_id,contract_id,application_id,daywork_id,raised_on,raised_by_party,summary,amount_disputed,recorded_by,recorded_by_name,request_key)
    values(org,c,app,dw,v_on,private.field_text(p_data,'raised_by_party',10,true),private.field_text(p_data,'summary',1000,true),
      case when p_data ? 'amount_disputed' and p_data->'amount_disputed'<>'null'::jsonb then private.field_decimal(p_data,'amount_disputed',0,1000000000) end,
      auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(org,'raise_commercial_dispute',p_request_key,p_data,result);
  return result;
end $$;
create function public.resolve_commercial_dispute(p_dispute uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare x public.commercial_disputes; v_on date;
begin
  perform private.only_keys(p_data,array['resolved_on','resolution']);
  select * into x from public.commercial_disputes where id=p_dispute and organisation_id=private.current_org() for update;
  if not found then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  perform private.require_money(x.contract_id);
  if x.resolved_on is not null then raise exception 'This dispute is already resolved' using errcode='22023'; end if;
  v_on:=coalesce(private.field_date(p_data,'resolved_on'),private.site_today());
  if v_on>private.site_today() or v_on<x.raised_on then raise exception 'Enter a resolution date between the dispute and today' using errcode='22023'; end if;
  update public.commercial_disputes set resolved_on=v_on,resolution=private.field_text(p_data,'resolution',1000,true),resolved_by=auth.uid(),resolved_by_name=private.member_name()
    where id=x.id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Applications
-- ---------------------------------------------------------------------------------------------

-- Lines: the office's valuation, cumulative to the period end. Only agreed extras, contractually
-- allowed materials on site and the contract's own stages are accepted. Returns the gross.
create or replace function private.insert_payment_lines(p_application public.payment_applications,p_lines jsonb) returns numeric
language plpgsql security definer set search_path='' as $$
declare line jsonb; n integer:=0; v_kind text; v_daywork uuid; v_stage uuid; v_amount numeric; total numeric:=0; t jsonb:=private.valuation_terms(p_application.contract_id);
  e record; s public.contract_payment_stages;
begin
  if p_application.kind='advance' then
    if p_lines is not null and p_lines<>'null'::jsonb and (jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>0) then
      raise exception 'An advance payment application has no valuation lines' using errcode='22023'; end if;
    return 0;
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 200 then
    raise exception 'Add the value of the work, from 1 to 200 lines' using errcode='22023'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop
    n:=n+1;
    perform private.only_keys(line,array['kind','daywork_id','stage_id','description','amount']);
    v_kind:=private.field_text(line,'kind',20,true);
    perform private.assert_choice(v_kind,'kind',array['contract_works','stage','extra_work','materials_on_site','other','deduction']);
    v_daywork:=private.field_uuid(line,'daywork_id'); v_stage:=private.field_uuid(line,'stage_id');
    if (v_kind='extra_work') <> (v_daywork is not null) then raise exception 'Only extra work names a daywork or variation' using errcode='22023'; end if;
    if (v_kind='stage') <> (v_stage is not null) then raise exception 'Only a stage payment names a stage' using errcode='22023'; end if;
    v_amount:=private.field_decimal(line,'amount',case when v_kind='other' then -100000000 else 0 end,100000000);
    if v_daywork is not null then
      select * into e from private.extra_states(p_application.contract_id) x where x.daywork_id=v_daywork;
      if not found or not e.claimable then
        raise exception 'Only an agreed daywork or variation on this job can be claimed: approved by the office, its charge approved, authorised by the client where the contract requires it, not in dispute and not included in a variation'
          using errcode='22023'; end if;
      if v_amount>e.approved_total then raise exception '% can be claimed up to its agreed value of %',e.reference,e.approved_total using errcode='22023'; end if;
    end if;
    if v_stage is not null then
      select * into s from public.contract_payment_stages where id=v_stage and contract_id=p_application.contract_id and voided_at is null;
      if not found then raise exception 'Choose a payment stage on this contract' using errcode='22023'; end if;
      if v_amount>s.amount then raise exception 'Stage "%" can be claimed up to %',s.label,s.amount using errcode='22023'; end if;
    end if;
    if v_kind='materials_on_site' and v_amount>0 and not (t->>'materials_on_site')::boolean then
      raise exception 'This contract does not allow materials on site to be valued' using errcode='22023'; end if;
    if v_kind='contract_works' and v_amount>0 and t->>'basis' in ('milestones','schedule') then
      raise exception 'This contract is paid by stages; claim the stages reached' using errcode='22023'; end if;
    insert into public.payment_application_lines(application_id,organisation_id,contract_id,lines_version,position,kind,daywork_id,stage_id,description,amount,created_by)
      values(p_application.id,p_application.organisation_id,p_application.contract_id,p_application.lines_version,n,v_kind,v_daywork,v_stage,
        private.field_text(line,'description',300,true),v_amount,auth.uid());
    if v_kind<>'deduction' then total:=total+v_amount; end if;
  end loop;
  if total<0 then raise exception 'The gross value cannot be less than nothing' using errcode='22023'; end if;
  return total;
end $$;

create or replace function public.create_payment_application(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; a public.payment_applications; result uuid; v_end date; v_kind text; t jsonb;
begin
  perform private.only_keys(p_data,array['contract_id','kind','period_end','note','lines','cis_materials']);
  c:=private.field_uuid(p_data,'contract_id',true);
  if not private.can_view_financials(c) then raise exception 'Money access is required for payment applications' using errcode='42501'; end if;
  result:=private.request_result(org,'create_payment_application',p_request_key,p_data);
  if result is not null then return result; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-application:'||c::text,0));
  if exists(select 1 from public.payment_applications where contract_id=c and status='draft') then
    raise exception 'This job already has a draft application. Finish or cancel it first.' using errcode='22023'; end if;
  v_end:=private.field_date(p_data,'period_end');
  if v_end is null then raise exception 'Enter the date the valuation runs to' using errcode='22023'; end if;
  if exists(select 1 from public.payment_applications where contract_id=c and status<>'cancelled' and period_end>=v_end) then
    raise exception 'Each application must run to a later date than the one before' using errcode='22023'; end if;
  v_kind:=coalesce(nullif(private.field_text(p_data,'kind',10),''),'interim');
  perform private.assert_choice(v_kind,'kind',array['interim','advance','final']);
  t:=private.valuation_terms(c);
  if v_kind='advance' then
    if (t->>'advance_payment')::numeric<=0 then raise exception 'The payment terms have no advance payment' using errcode='22023'; end if;
    if exists(select 1 from public.payment_applications where contract_id=c and status<>'cancelled') then
      raise exception 'The advance payment is applied for before any other application' using errcode='22023'; end if;
  elsif v_kind='final' then
    if t->>'practical_completion_on' is null then raise exception 'Record practical completion before the final account' using errcode='22023'; end if;
  else
    if t->>'basis'='completion' then raise exception 'This contract is paid on completion; raise the final account' using errcode='22023'; end if;
    if exists(select 1 from public.payment_applications where contract_id=c and status in ('submitted','certified') and kind='final') then
      raise exception 'The final account has been submitted; any later application is a revised final account' using errcode='22023'; end if;
  end if;
  insert into public.payment_applications(organisation_id,contract_id,number,kind,period_end,note,cis_materials,created_by,created_by_name,request_key)
    values(org,c,(select coalesce(max(number),0)+1 from public.payment_applications where contract_id=c),v_kind,v_end,
      nullif(private.field_text(p_data,'note',1000),''),
      coalesce(case when p_data ? 'cis_materials' and p_data->'cis_materials'<>'null'::jsonb then private.field_decimal(p_data,'cis_materials',0,1000000000) end,0),
      auth.uid(),private.member_name(),p_request_key) returning * into a;
  perform private.insert_payment_lines(a,p_data->'lines');
  perform private.record_request(org,'create_payment_application',p_request_key,p_data,a.id);
  return a.id;
end $$;

create or replace function public.update_payment_application(p_application uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications:=private.payment_application_for_update(p_application,null); result uuid; payload jsonb; v_end date;
begin
  perform private.only_keys(p_data,array['period_end','note','lines','cis_materials']);
  payload:=jsonb_build_object('application',p_application,'version',p_version,'data',p_data);
  result:=private.request_result(a.organisation_id,'update_payment_application',p_request_key,payload);
  if result is not null then return result; end if;
  a:=private.payment_application_for_update(p_application,p_version);
  if a.status<>'draft' then raise exception 'Only a draft can be changed' using errcode='22023'; end if;
  v_end:=coalesce(private.field_date(p_data,'period_end'),a.period_end);
  if exists(select 1 from public.payment_applications where contract_id=a.contract_id and id<>a.id and status<>'cancelled' and period_end>=v_end) then
    raise exception 'Each application must run to a later date than the one before' using errcode='22023'; end if;
  update public.payment_applications set period_end=v_end,note=case when p_data?'note' then nullif(private.field_text(p_data,'note',1000),'') else note end,
    cis_materials=case when p_data ? 'cis_materials' then coalesce(case when p_data->'cis_materials'<>'null'::jsonb then private.field_decimal(p_data,'cis_materials',0,1000000000) end,0)
      else cis_materials end,
    lines_version=lines_version+1,version=version+1,updated_at=now() where id=a.id returning * into a;
  perform private.insert_payment_lines(a,p_data->'lines');
  perform private.record_request(a.organisation_id,'update_payment_application',p_request_key,payload,a.id);
  return a.id;
end $$;

-- Submitting fixes the terms, every figure and the Construction Act dates. The due date follows the
-- later of the valuation date and the date of the application.
create function private.submit_application(a public.payment_applications) returns public.payment_applications
language plpgsql security definer set search_path='' as $$
declare t jsonb:=private.valuation_terms(a.contract_id); v jsonb; v_applied date:=private.site_today(); v_due date; v_final date;
begin
  if a.status<>'draft' then raise exception 'Only a draft can be submitted' using errcode='22023'; end if;
  -- Extras and stages are checked again: something agreed when the draft was saved may since be disputed.
  if exists(select 1 from public.payment_application_lines l join private.extra_states(a.contract_id) e on e.daywork_id=l.daywork_id
    where l.application_id=a.id and l.lines_version=a.lines_version and (not e.claimable or l.amount>e.approved_total)) then
    raise exception 'A daywork or variation in this draft is no longer agreed. Correct the draft first.' using errcode='22023'; end if;
  if exists(select 1 from public.payment_application_lines l join public.contract_payment_stages s on s.id=l.stage_id
    where l.application_id=a.id and l.lines_version=a.lines_version and s.voided_at is not null) then
    raise exception 'A stage in this draft has been removed. Correct the draft first.' using errcode='22023'; end if;
  if a.kind='final' and t->>'practical_completion_on' is null then raise exception 'Record practical completion before the final account' using errcode='22023'; end if;
  v:=private.compute_valuation(a.id,t);
  v_due:=greatest(a.period_end,v_applied)+(t->>'due_days')::integer; v_final:=v_due+(t->>'final_payment_days')::integer;
  update public.payment_applications set status='submitted',submitted_at=now(),submitted_by=auth.uid(),submitted_by_name=private.member_name(),
    gross_applied=(v->>'gross')::numeric,retention_percent=(t->>'retention_percent')::numeric,terms=t,valuation=v,applied_on=v_applied,due_on=v_due,final_on=v_final,
    payment_notice_by=v_due+(t->>'payment_notice_days')::integer,pay_less_by=v_final-(t->>'pay_less_notice_days')::integer,version=version+1,updated_at=now()
  where id=a.id returning * into a;
  return a;
end $$;
create or replace function public.submit_payment_application(p_application uuid,p_request_key uuid,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications:=private.payment_application_for_update(p_application,null); result uuid; payload jsonb;
begin
  payload:=jsonb_build_object('application',p_application,'version',p_version);
  result:=private.request_result(a.organisation_id,'submit_payment_application',p_request_key,payload);
  if result is not null then return result; end if;
  a:=private.payment_application_for_update(p_application,p_version);
  perform private.submit_application(a);
  perform private.record_request(a.organisation_id,'submit_payment_application',p_request_key,payload,a.id);
  return a.id;
end $$;

-- The client's certificate (their payment notice): the gross they certified, and optionally the
-- retention and deductions they took. Otherwise both follow the contract's rules.
create or replace function public.certify_payment_application(p_application uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications:=private.payment_application_for_update(p_application,null); result uuid; payload jsonb; v_on date; g numeric; r numeric; d numeric;
begin
  perform private.only_keys(p_data,array['certified_gross','certified_on','certificate_reference','certified_retention','certified_deductions']);
  payload:=jsonb_build_object('application',p_application,'version',p_version,'data',p_data);
  result:=private.request_result(a.organisation_id,'certify_payment_application',p_request_key,payload);
  if result is not null then return result; end if;
  a:=private.payment_application_for_update(p_application,p_version);
  if a.status<>'submitted' then raise exception 'Only a submitted application can be certified' using errcode='22023'; end if;
  v_on:=coalesce(private.field_date(p_data,'certified_on'),private.site_today());
  if v_on>private.site_today() then raise exception 'The certificate date cannot be in the future' using errcode='22023'; end if;
  g:=private.field_decimal(p_data,'certified_gross',0,100000000);
  r:=coalesce(case when p_data ? 'certified_retention' and p_data->'certified_retention'<>'null'::jsonb then private.field_decimal(p_data,'certified_retention',0,100000000) end,
    private.certified_retention(a.valuation,a.terms,g));
  d:=coalesce(case when p_data ? 'certified_deductions' and p_data->'certified_deductions'<>'null'::jsonb then private.field_decimal(p_data,'certified_deductions',0,100000000) end,
    (a.valuation->>'deductions')::numeric);
  update public.payment_applications set status='certified',certified_gross=g,certified_on=v_on,
    certificate_reference=nullif(private.field_text(p_data,'certificate_reference',120),''),certified_by=auth.uid(),certified_by_name=private.member_name(),
    certified_at=now(),cert_retention=r,cert_deductions=d,cert_net=g-r+(a.valuation->>'advance')::numeric-(a.valuation->>'advance_recovered')::numeric-d,
    version=version+1,updated_at=now() where id=a.id;
  perform private.record_request(a.organisation_id,'certify_payment_application',p_request_key,payload,a.id);
  return a.id;
end $$;

create or replace function public.cancel_payment_application(p_application uuid,p_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications:=private.payment_application_for_update(p_application,p_version);
begin
  if a.status not in ('draft','submitted') then raise exception 'Only a draft or submitted application can be cancelled' using errcode='22023'; end if;
  if exists(select 1 from public.payment_receipts where application_id=a.id and voided_at is null) then
    raise exception 'Void the payments recorded against it first' using errcode='22023'; end if;
  if coalesce((select sum(i.total) from public.commercial_documents i where i.kind='invoice' and i.application_id=a.id),0)
    <> coalesce((select sum(c.total) from public.commercial_documents c join public.commercial_documents i on i.id=c.credits_document_id
      where c.kind='credit_note' and i.application_id=a.id),0) then
    raise exception 'An invoice has been issued for it. Issue a credit note first.' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Say why it is cancelled' using errcode='22023'; end if;
  update public.payment_applications set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=trim(p_reason),version=version+1,updated_at=now()
    where id=a.id;
end $$;

-- A pay less notice the client gave: its date, the sum it says is due for this payment, and its
-- basis. Under the Construction Act it is effective only if given by the pay less date.
create function public.record_pay_less_notice(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications; result uuid; v_on date; doc uuid;
begin
  perform private.only_keys(p_data,array['application_id','given_on','sum_stated','basis','reference','document_id']);
  a:=private.payment_application_for_update(private.field_uuid(p_data,'application_id',true),null);
  result:=private.request_result(a.organisation_id,'record_pay_less_notice',p_request_key,p_data);
  if result is not null then return result; end if;
  if a.status not in ('submitted','certified') then raise exception 'A pay less notice is recorded against a submitted or certified application' using errcode='22023'; end if;
  v_on:=coalesce(private.field_date(p_data,'given_on'),private.site_today());
  if v_on>private.site_today() then raise exception 'The notice date cannot be in the future' using errcode='22023'; end if;
  doc:=private.field_uuid(p_data,'document_id');
  if doc is not null and not exists(select 1 from public.document_revisions r where r.id=doc and r.contract_id=a.contract_id and r.uploaded_at is not null) then
    raise exception 'Choose a document saved on this job' using errcode='22023'; end if;
  insert into public.payment_notices(organisation_id,contract_id,application_id,kind,given_on,sum_stated,basis,reference,document_id,in_time,recorded_by,recorded_by_name,request_key)
    values(a.organisation_id,a.contract_id,a.id,'pay_less',v_on,private.field_decimal(p_data,'sum_stated',-1000000000,1000000000),
      private.field_text(p_data,'basis',2000,true),nullif(private.field_text(p_data,'reference',120),''),doc,v_on<=a.pay_less_by,auth.uid(),private.member_name(),p_request_key)
    returning id into result;
  perform private.record_request(a.organisation_id,'record_pay_less_notice',p_request_key,p_data,result);
  return result;
end $$;
create function public.void_payment_notice(p_notice uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare n public.payment_notices;
begin
  select * into n from public.payment_notices where id=p_notice and organisation_id=private.current_org() for update;
  if not found then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  perform private.require_money(n.contract_id);
  if n.voided_at is not null then return; end if;
  if n.kind='default_payment' then raise exception 'An issued default payment notice stays on record' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Give a short reason' using errcode='22023'; end if;
  update public.payment_notices set voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) where id=n.id;
end $$;

create or replace function public.record_payment_receipt(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.payment_applications; result uuid; v_on date; v_cis numeric;
begin
  perform private.only_keys(p_data,array['application_id','received_on','amount','cis_deducted','reference','note']);
  a:=private.payment_application_for_update(private.field_uuid(p_data,'application_id',true),null);
  result:=private.request_result(a.organisation_id,'record_payment_receipt',p_request_key,p_data);
  if result is not null then return result; end if;
  if a.status not in ('submitted','certified') then raise exception 'Payments are recorded against a submitted or certified application' using errcode='22023'; end if;
  v_on:=coalesce(private.field_date(p_data,'received_on'),private.site_today());
  if v_on>private.site_today() then raise exception 'The date received cannot be in the future' using errcode='22023'; end if;
  v_cis:=coalesce(case when p_data ? 'cis_deducted' and p_data->'cis_deducted'<>'null'::jsonb then private.field_decimal(p_data,'cis_deducted',0,100000000) end,0);
  if v_cis>0 and not coalesce((a.terms->>'cis_applies')::boolean,false) then
    raise exception 'The payment terms say CIS does not apply to this contract' using errcode='22023'; end if;
  insert into public.payment_receipts(organisation_id,contract_id,application_id,received_on,amount,cis_deducted,reference,note,recorded_by,recorded_by_name,request_key)
    values(a.organisation_id,a.contract_id,a.id,v_on,private.field_decimal(p_data,'amount',0.01,100000000),v_cis,nullif(private.field_text(p_data,'reference',120),''),
      nullif(private.field_text(p_data,'note',500),''),auth.uid(),private.member_name(),p_request_key) returning id into result;
  perform private.record_request(a.organisation_id,'record_payment_receipt',p_request_key,p_data,result);
  return result;
end $$;

-- Agreed daywork markups are applied to each priced line and kept with it.
create or replace function public.price_daywork(p_daywork uuid,p_request_key uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.dayworks:=private.daywork_for_update(p_daywork); result uuid; payload jsonb; entry jsonb; v_line public.daywork_lines;
  v_rate public.contract_daywork_rates; v_total numeric:=0; v_count integer; v_priced jsonb:='[]'; v_method text; v_terms public.contract_payment_terms;
  v_amount numeric; v_pct numeric; v_markup numeric;
begin
  perform private.only_keys(p_data,array['method','lines','total','note']);
  if not private.can_view_financials(d.contract_id) then raise exception 'Money access is required to price a daywork' using errcode='42501'; end if;
  payload:=jsonb_build_object('daywork',p_daywork,'version',p_version,'data',p_data);
  result:=private.request_result(d.organisation_id,'price_daywork',p_request_key,payload);
  if result is not null then return result; end if;
  perform private.assert_daywork_version(d,p_version);
  if d.site_status<>'sent' or d.office_status='rejected' then raise exception 'Only a daywork sent to the office, and not rejected, can be priced' using errcode='22023'; end if;
  if d.commercial_status='commercially_approved' then raise exception 'The charge has already been approved' using errcode='22023'; end if;
  v_method:=coalesce(nullif(private.field_text(p_data,'method',10),''),'day_rates');
  perform private.assert_choice(v_method,'method',array['day_rates','quoted']);
  if v_method='quoted' then
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
  select * into v_terms from public.contract_payment_terms where contract_id=d.contract_id;
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
    v_amount:=round(v_line.quantity*v_rate.rate,2);
    v_pct:=coalesce(case v_line.kind when 'labour' then v_terms.daywork_labour_markup when 'plant' then v_terms.daywork_plant_markup else v_terms.daywork_materials_markup end,0);
    v_markup:=round(v_amount*v_pct/100,2);
    v_priced:=v_priced||jsonb_build_object('line_id',v_line.id,'rate_id',v_rate.id,'category',v_rate.category,'item',v_rate.item,'unit',v_rate.unit,
      'rate',v_rate.rate,'quantity',v_line.quantity,'amount',v_amount,'markup_percent',v_pct,'markup',v_markup);
    v_total:=v_total+v_amount+v_markup;
  end loop;
  insert into public.daywork_pricings(daywork_id,organisation_id,contract_id,lines_version,total,priced_by,priced_by_name,request_key)
    values(d.id,d.organisation_id,d.contract_id,d.lines_version,v_total,auth.uid(),private.member_name(),p_request_key) returning id into result;
  insert into public.daywork_pricing_lines(pricing_id,organisation_id,contract_id,line_id,rate_id,category,item,unit,rate,quantity,amount,markup_percent,markup)
    select result,d.organisation_id,d.contract_id,(e->>'line_id')::uuid,(e->>'rate_id')::uuid,e->>'category',e->>'item',e->>'unit',
      (e->>'rate')::numeric,(e->>'quantity')::numeric,(e->>'amount')::numeric,(e->>'markup_percent')::numeric,(e->>'markup')::numeric from jsonb_array_elements(v_priced) e;
  update public.dayworks set commercial_status='priced',version=version+1,updated_at=now() where id=d.id returning * into d;
  perform private.record_daywork_event(d,'price',null);
  perform private.record_request(d.organisation_id,'price_daywork',p_request_key,payload,result);
  return result;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6. Documents
-- ---------------------------------------------------------------------------------------------

-- What every document prints at the top: TileSPEC's recorded details, the contract and who it is
-- addressed to, and the contract sum (original plus agreed extras only).
create function private.document_header(p_contract uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'issuer',jsonb_build_object('legal_name',b.legal_name,'trading_name',b.trading_name,'registered_address',b.registered_address,'company_number',b.company_number,
      'vat_registered',coalesce(b.vat_registered,false),'vat_number',b.vat_number,'cis_status',coalesce(b.cis_status,'not_registered'),'email',b.email,'phone',b.phone,
      'website',b.website,'bank_account_name',b.bank_account_name,'bank_sort_code',b.bank_sort_code,'bank_account_number',b.bank_account_number,
      'payment_instructions',b.payment_instructions,'footer',b.document_footer),
    'contract',jsonb_build_object('id',c.id,'reference',c.reference,'name',c.name,'client',nullif(c.client,''),'principal_contractor',nullif(c.principal_contractor,''),
      'address',nullif(c.address,''),'start_date',c.start_date,'end_date',c.end_date,'order_reference',t.order_reference,'payment_terms',nullif(k.payment_terms,'')),
    'bill_to',jsonb_build_object('name',coalesce(t.bill_to_name,nullif(c.principal_contractor,''),nullif(c.client,'')),'address',t.bill_to_address,'email',t.bill_to_email),
    'contract_sum',(select jsonb_build_object('original',coalesce(k.contract_value,0),
        'variations_agreed',coalesce(sum(e.approved_total) filter (where e.claimable and e.kind='variation'),0),
        'dayworks_agreed',coalesce(sum(e.approved_total) filter (where e.claimable and e.kind='daywork'),0),
        'revised',coalesce(k.contract_value,0)+coalesce(sum(e.approved_total) filter (where e.claimable),0),
        'pending',coalesce(sum(coalesce(e.approved_total,e.latest_total)) filter (where not e.claimable and e.state in ('submitted','disputed') and e.included_in is null),0))
      from private.extra_states(c.id) e),
    'terms',private.valuation_terms(c.id),'as_at',private.site_today())
  from public.contracts c
  left join public.contract_commercials k on k.contract_id=c.id
  left join public.contract_payment_terms t on t.contract_id=c.id
  left join public.organisation_billing_profiles b on b.organisation_id=c.organisation_id
  where c.id=p_contract
$$;

create function private.extras_schedule(p_contract uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',e.daywork_id,'kind',e.kind,'reference',e.reference,'description',e.description,'instructed_on',e.instructed_on,
    'state',e.state,'claimable',e.claimable,'value',coalesce(e.approved_total,e.latest_total),'approved_total',e.approved_total,'pricing_method',e.pricing_method,
    'included_in',(select x.reference from private.extra_states(p_contract) x where x.daywork_id=e.included_in),
    'includes',(select coalesce(jsonb_agg(x.reference order by x.number),'[]'::jsonb) from private.extra_states(p_contract) x where x.included_in=e.daywork_id),
    'client_authorisation',(select jsonb_build_object('outcome',ca.outcome,'client_name',ca.client_name,'decided_on',ca.decided_on,'reference',ca.reference,
        'has_document',ca.document_id is not null) from public.daywork_client_authorisations ca where ca.daywork_id=e.daywork_id order by ca.recorded_at desc limit 1),
    'client_required',e.client_required,
    'photos',(select count(*) from public.daywork_photos ph where ph.daywork_id=e.daywork_id and ph.uploaded_at is not null and ph.purpose='work'),
    'signed_sheets',(select count(*) from public.daywork_photos ph where ph.daywork_id=e.daywork_id and ph.uploaded_at is not null and ph.purpose='signed_sheet'),
    'dispute',(select jsonb_build_object('raised_on',x.raised_on,'summary',x.summary) from public.commercial_disputes x where x.daywork_id=e.daywork_id and x.resolved_on is null limit 1),
    'claimed_in',(select max(a.number) from public.payment_application_lines l join public.payment_applications a on a.id=l.application_id and l.lines_version=a.lines_version
      where l.daywork_id=e.daywork_id and a.status in ('submitted','certified')))
    order by e.kind desc,e.number),'[]'::jsonb)
  from private.extra_states(p_contract) e where e.state<>'draft'
$$;

create function private.application_snapshot(p_application uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.payment_applications; r jsonb; h jsonb;
begin
  select * into a from public.payment_applications where id=p_application;
  select x into r from private.account_rows(a.contract_id) x where (x->>'application_id')::uuid=a.id;
  h:=private.document_header(a.contract_id);
  if a.terms is not null then h:=jsonb_set(h,'{terms}',a.terms); end if;
  return h||jsonb_build_object(
    'application',jsonb_build_object('id',a.id,'number',a.number,'kind',a.kind,'period_end',a.period_end,'status',a.status,'note',a.note,
      'applied_on',coalesce(a.applied_on,private.site_today()),'due_on',a.due_on,'final_on',a.final_on,'payment_notice_by',a.payment_notice_by,'pay_less_by',a.pay_less_by,
      'certified_on',a.certified_on,'certificate_reference',a.certificate_reference),
    'figures',r,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('kind',l.kind,'description',l.description,'amount',l.amount,
        'reference',case when d.id is null then null else case d.kind when 'variation' then 'VO-' else 'DW-' end||d.number end,
        'stage',s.label,'stage_value',s.amount) order by l.position),'[]'::jsonb)
      from public.payment_application_lines l left join public.dayworks d on d.id=l.daywork_id left join public.contract_payment_stages s on s.id=l.stage_id
      where l.application_id=a.id and l.lines_version=a.lines_version),
    'not_claimed',(select coalesce(jsonb_agg(jsonb_build_object('reference',e.reference,'description',e.description,'state',e.state,'value',coalesce(e.approved_total,e.latest_total))
        order by e.kind desc,e.number),'[]'::jsonb)
      from private.extra_states(a.contract_id) e where e.state in ('submitted','disputed') and e.included_in is null),
    'history',(select coalesce(jsonb_agg(jsonb_build_object('number',x->>'number','period_end',x->>'period_end','kind',x->>'kind','net',(x->>'net')::numeric,
        'certified_net',(x->>'certified_net')::numeric,'due_this_period',(x->>'due_this_period')::numeric,'received',(x->>'received')::numeric,'status',x->>'display_status')
        order by (x->>'number')::integer),'[]'::jsonb)
      from private.account_rows(a.contract_id) x where (x->>'number')::integer<a.number and x->>'status'<>'cancelled'),
    'received_to_date',(select coalesce(sum(p.amount+p.cis_deducted),0) from public.payment_receipts p join public.payment_applications q on q.id=p.application_id
      where p.contract_id=a.contract_id and p.voided_at is null and q.number<a.number),
    'credits_to_date',(select coalesce(sum(c.total),0) from public.commercial_documents c where c.contract_id=a.contract_id and c.kind='credit_note'));
end $$;

create function private.daywork_schedule(p_contract uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('reference',e.reference,'description',e.description,'instructed_on',e.instructed_on,'state',e.state,
    'instructed_by',d.instructed_by_name,'instructed_by_company',d.instructed_by_company,'location',array_to_string(d.location_path,' › '),
    'site_acknowledgement',(select jsonb_build_object('outcome',s.outcome,'signer_name',s.signer_name,'signer_position',s.signer_position,'signed_at',s.signed_at,'reason',s.reason)
      from public.daywork_signoffs s where s.daywork_id=d.id order by s.recorded_at desc limit 1),
    'office_status',d.office_status,'commercial_status',d.commercial_status,'client_status',d.client_status,'client_required',e.client_required,
    'client_authorisation',(select jsonb_build_object('client_name',ca.client_name,'decided_on',ca.decided_on,'reference',ca.reference)
      from public.daywork_client_authorisations ca where ca.daywork_id=d.id and ca.outcome='authorised' order by ca.recorded_at desc limit 1),
    'lines',(select coalesce(jsonb_agg(jsonb_build_object('kind',l.kind,'label',l.label,'role',l.role,'work_date',l.work_date,'quantity',l.quantity,'unit',l.unit,
        'rate',pl.rate,'amount',pl.amount,'markup_percent',pl.markup_percent,'markup',pl.markup) order by l.position),'[]'::jsonb)
      from public.daywork_lines l
      left join lateral (select p.id from public.daywork_pricings p where p.daywork_id=d.id and p.lines_version=d.lines_version order by p.priced_at desc,p.id desc limit 1) pr on true
      left join public.daywork_pricing_lines pl on pl.pricing_id=pr.id and pl.line_id=l.id
      where l.daywork_id=d.id and l.lines_version=d.lines_version),
    'value',coalesce(e.approved_total,e.latest_total),'claimable',e.claimable,
    'included_in',(select x.reference from private.extra_states(p_contract) x where x.daywork_id=e.included_in),
    'photos',(select count(*) from public.daywork_photos ph where ph.daywork_id=d.id and ph.uploaded_at is not null and ph.purpose='work'),
    'signed_sheets',(select count(*) from public.daywork_photos ph where ph.daywork_id=d.id and ph.uploaded_at is not null and ph.purpose='signed_sheet'),
    'claimed_in',(select max(a.number) from public.payment_application_lines l join public.payment_applications a on a.id=l.application_id and l.lines_version=a.lines_version
      where l.daywork_id=d.id and a.status in ('submitted','certified'))) order by e.number),'[]'::jsonb)
  from private.extra_states(p_contract) e join public.dayworks d on d.id=e.daywork_id where e.kind='daywork' and e.state<>'draft'
$$;

-- The statement of account: what is due on each application (its invoices and credit notes where
-- invoiced), every payment received, the running balance and what is overdue.
create function private.statement_snapshot(p_contract uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with apps as (select r from private.account_rows(p_contract) r where r->>'status' in ('submitted','certified')),
  entries as (
    select coalesce((r->>'applied_on')::date,(r->>'period_end')::date) as on_date,1 as ord,'application' as type,
      'Application '||(r->>'number')||' — sum due' as description,((r->>'due_this_period')::numeric+(r->>'vat')::numeric) as debit,0::numeric as credit,
      (r->>'number')::integer as app_number
    from apps where not exists(select 1 from public.commercial_documents i where i.kind='invoice' and i.application_id=(r->>'application_id')::uuid)
    union all
    select i.issued_on,2,'invoice','Invoice '||i.reference||' (application '||a.number||')',i.total,0,a.number
    from public.commercial_documents i join public.payment_applications a on a.id=i.application_id where i.contract_id=p_contract and i.kind='invoice'
    union all
    select c.issued_on,3,'credit_note','Credit note '||c.reference||' against '||i.reference,0,c.total,a.number
    from public.commercial_documents c join public.commercial_documents i on i.id=c.credits_document_id join public.payment_applications a on a.id=i.application_id
    where c.contract_id=p_contract and c.kind='credit_note'
    union all
    select p.received_on,4,'receipt','Payment received'||coalesce(' ('||p.reference||')','')||case when p.cis_deducted>0 then ', with CIS deducted' else '' end,
      0,p.amount+p.cis_deducted,a.number
    from public.payment_receipts p join public.payment_applications a on a.id=p.application_id where p.contract_id=p_contract and p.voided_at is null
  ), running as (
    select e.*,sum(e.debit-e.credit) over (order by e.on_date,e.ord,e.app_number,e.description rows unbounded preceding) as balance from entries e
  )
  select private.document_header(p_contract)||jsonb_build_object(
    'entries',coalesce((select jsonb_agg(jsonb_build_object('on',e.on_date,'type',e.type,'description',e.description,'debit',e.debit,'credit',e.credit,
        'balance',e.balance) order by e.on_date,e.ord,e.app_number,e.description) from running e),'[]'::jsonb),
    'balance',coalesce((select sum(debit-credit) from entries),0),
    'ageing',(select jsonb_build_object(
        'current',coalesce(sum(o) filter (where d<=0),0),'days_1_30',coalesce(sum(o) filter (where d between 1 and 30),0),
        'days_31_60',coalesce(sum(o) filter (where d between 31 and 60),0),'days_61_90',coalesce(sum(o) filter (where d between 61 and 90),0),
        'days_over_90',coalesce(sum(o) filter (where d>90),0))
      from (select (r->>'outstanding')::numeric as o,private.site_today()-coalesce((r->>'final_on_effective')::date,private.site_today()) as d from apps) x where o>0),
    'retention_held',coalesce((select (r->>'retention_held')::numeric from apps order by (r->>'number')::integer desc limit 1),0),
    'applications',coalesce((select jsonb_agg(jsonb_build_object('number',(r->>'number')::integer,'period_end',r->>'period_end','status',r->>'display_status',
        'due',(r->>'due_this_period')::numeric+(r->>'vat')::numeric,'received',(r->>'received')::numeric,'outstanding',(r->>'outstanding')::numeric,
        'final_on',r->>'final_on_effective') order by (r->>'number')::integer) from apps),'[]'::jsonb))
$$;

-- Builds the content of a document. Nothing is written. p_options: application_id, invoice_id
-- (credit note), amount and reason (credit note), notice basis (default payment notice).
create function private.build_document(p_kind text,p_contract uuid,p_options jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.payment_applications; app uuid:=private.field_uuid(p_options,'application_id'); s jsonb; r jsonb; inv public.commercial_documents;
  v_net numeric; v_vat numeric; credited numeric; ratio numeric;
begin
  if app is not null then
    select * into a from public.payment_applications where id=app and contract_id=p_contract;
    if not found then raise exception 'Choose an application on this job' using errcode='22023'; end if;
  end if;
  if p_kind in ('payment_application','final_account') then
    if a.id is null then raise exception 'Choose the application' using errcode='22023'; end if;
    if (p_kind='final_account') <> (a.kind='final') then
      raise exception '%',case when a.kind='final' then 'This is the final account' else 'Only a final account application is issued as the final account' end using errcode='22023'; end if;
    s:=private.application_snapshot(a.id);
    if p_kind='final_account' then
      s:=s||jsonb_build_object('extras',private.extras_schedule(p_contract),
        'receipts',(select coalesce(jsonb_agg(jsonb_build_object('on',p.received_on,'reference',p.reference,'amount',p.amount,'cis_deducted',p.cis_deducted,'application',q.number)
          order by p.received_on),'[]'::jsonb) from public.payment_receipts p join public.payment_applications q on q.id=p.application_id
          where p.contract_id=p_contract and p.voided_at is null),
        'credit_notes',(select coalesce(jsonb_agg(jsonb_build_object('reference',c.reference,'on',c.issued_on,'net',c.net,'total',c.total) order by c.issued_on),'[]'::jsonb)
          from public.commercial_documents c where c.contract_id=p_contract and c.kind='credit_note'));
    end if;
    return s;
  elsif p_kind='invoice' then
    if a.id is null then raise exception 'Choose the application to invoice' using errcode='22023'; end if;
    if a.status not in ('submitted','certified') then raise exception 'Submit the application before invoicing it' using errcode='22023'; end if;
    s:=private.application_snapshot(a.id); r:=s->'figures';
    return s||jsonb_build_object('invoice',jsonb_build_object('net',(r->>'due_this_period')::numeric,'vat',(r->>'vat')::numeric,
      'vat_reverse_charge',(r->>'vat_reverse_charge')::numeric,'total',(r->>'due_this_period')::numeric+(r->>'vat')::numeric,
      'vat_treatment',r->>'vat_treatment','vat_rate',(r->>'vat_rate')::numeric,'cis_expected',(r->>'cis_expected')::numeric,
      'due_on',r->>'due_on','final_on',r->>'final_on_effective','basis',case when (r->>'pay_less_effective')::boolean then 'pay_less' when a.certified_gross is not null then 'certificate'
        when r->>'default_notice_on' is not null then 'default_notice' else 'application' end));
  elsif p_kind='credit_note' then
    select * into inv from public.commercial_documents where id=private.field_uuid(p_options,'invoice_id',true) and contract_id=p_contract and kind='invoice';
    if not found then raise exception 'Choose an invoice on this job' using errcode='22023'; end if;
    credited:=coalesce((select sum(c.net) from public.commercial_documents c where c.credits_document_id=inv.id),0);
    v_net:=coalesce(case when p_options ? 'amount' and p_options->'amount'<>'null'::jsonb then private.field_decimal(p_options,'amount',0.01,1000000000) end,inv.net-credited);
    if v_net<=0 or v_net>inv.net-credited then raise exception 'A credit note can be for up to the uncredited amount of the invoice, %',inv.net-credited using errcode='22023'; end if;
    ratio:=case when inv.net=0 then 0 else v_net/inv.net end;
    v_vat:=case when v_net=inv.net-credited then inv.vat-coalesce((select sum(c.vat) from public.commercial_documents c where c.credits_document_id=inv.id),0)
      else round(inv.vat*ratio,2) end;
    return private.document_header(p_contract)||jsonb_build_object('credit_note',jsonb_build_object('invoice_reference',inv.reference,'invoice_issued_on',inv.issued_on,
      'invoice_id',inv.id,'reason',private.field_text(p_options,'reason',1000,true),'net',v_net,'vat',v_vat,'total',v_net+v_vat,
      'vat_treatment',inv.snapshot->'invoice'->>'vat_treatment','vat_rate',(inv.snapshot->'invoice'->>'vat_rate')::numeric,
      'vat_reverse_charge',round(coalesce((inv.snapshot->'invoice'->>'vat_reverse_charge')::numeric,0)*ratio,2),'full',v_net=inv.net-credited,
      'application_number',(inv.snapshot->'application'->>'number')::integer));
  elsif p_kind='default_payment_notice' then
    if a.id is null then raise exception 'Choose the application' using errcode='22023'; end if;
    s:=private.application_snapshot(a.id); r:=s->'figures';
    return s||jsonb_build_object('notice',jsonb_build_object('sum_stated',(r->>'applied_this_period')::numeric,
      'basis',coalesce(nullif(private.field_text(p_options,'basis',2000),''),'The sum applied for in application '||a.number||', calculated as set out in that application.'),
      'payment_notice_by',a.payment_notice_by,'final_on',a.final_on,
      'final_on_postponed',a.final_on+greatest(private.site_today()-a.payment_notice_by,0)));
  elsif p_kind='variation_schedule' then
    return private.document_header(p_contract)||jsonb_build_object('extras',coalesce((select jsonb_agg(x) from jsonb_array_elements(private.extras_schedule(p_contract)) x
      where x->>'kind'='variation'),'[]'::jsonb));
  elsif p_kind='daywork_summary' then
    return private.document_header(p_contract)||jsonb_build_object('dayworks',private.daywork_schedule(p_contract));
  elsif p_kind='statement' then
    return private.statement_snapshot(p_contract);
  end if;
  raise exception 'Unknown document' using errcode='22023';
end $$;

create function private.document_reference(p_kind text,p_contract uuid,p_sequence integer,p_revision integer) returns text
language sql stable security definer set search_path='' as $$
  select case when p_kind in ('invoice','credit_note') then case p_kind when 'invoice' then 'INV-' else 'CN-' end||lpad(p_sequence::text,5,'0')
    else (select c.reference from public.contracts c where c.id=p_contract)||'/'||case p_kind when 'payment_application' then 'PA' when 'final_account' then 'FA'
      when 'default_payment_notice' then 'DPN' when 'variation_schedule' then 'VS' when 'daywork_summary' then 'DS' else 'ST' end||'-'||lpad(p_sequence::text,2,'0')
      ||case when p_revision>0 then ' Rev '||chr(64+p_revision) else '' end end
$$;
create function private.document_title(p_kind text,p_snapshot jsonb) returns text language sql immutable set search_path='' as $$
  select case p_kind when 'payment_application' then case p_snapshot->'application'->>'kind' when 'advance' then 'Application for advance payment'
      else 'Interim payment application No. '||(p_snapshot->'application'->>'number') end
    when 'final_account' then 'Final account' when 'invoice' then 'Invoice' when 'credit_note' then 'Credit note'
    when 'default_payment_notice' then 'Payment notice (in default of the payer''s notice)' when 'variation_schedule' then 'Schedule of variations'
    when 'daywork_summary' then 'Daywork summary' else 'Statement of account' end
$$;

-- What a document would look like if issued now. Money access only; nothing is written.
create function public.preview_commercial_document(p_data jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c uuid; k text; s jsonb;
begin
  perform private.only_keys(p_data,array['kind','contract_id','application_id','invoice_id','amount','reason','basis']);
  c:=private.field_uuid(p_data,'contract_id',true); perform private.require_money(c);
  k:=private.field_text(p_data,'kind',30,true);
  perform private.assert_choice(k,'kind',array['payment_application','final_account','invoice','credit_note','default_payment_notice','variation_schedule','daywork_summary','statement']);
  if k='credit_note' and not p_data ? 'reason' then p_data:=p_data||'{"reason":"Preview"}'; end if;
  s:=private.build_document(k,c,p_data);
  return jsonb_build_object('kind',k,'reference',null,'title',private.document_title(k,s),'issued_on',null,'preview',true,'snapshot',s);
end $$;

-- Approve and issue. A draft application is submitted first, in the same step. Revisions name the
-- document they replace and why; invoices are corrected only by credit note.
create function public.issue_commercial_document(p_request_key uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.current_org(); c uuid; k text; result uuid; a public.payment_applications; s jsonb; previous public.commercial_documents; seq integer; rev integer:=0;
  v_series text; v_net numeric; v_vat numeric; v_total numeric; v_cis numeric; v_due date; v_final date; notice uuid; b public.organisation_billing_profiles; f jsonb;
  inv public.commercial_documents;
begin
  perform private.only_keys(p_data,array['kind','contract_id','application_id','invoice_id','amount','reason','basis','supersedes_id','revision_reason','application_version']);
  c:=private.field_uuid(p_data,'contract_id',true); perform private.require_money(c);
  result:=private.request_result(org,'issue_commercial_document',p_request_key,p_data);
  if result is not null then return result; end if;
  k:=private.field_text(p_data,'kind',30,true);
  perform private.assert_choice(k,'kind',array['payment_application','final_account','invoice','credit_note','default_payment_notice','variation_schedule','daywork_summary','statement']);
  v_series:=case k when 'payment_application' then 'PA' when 'final_account' then 'FA' when 'invoice' then 'INV' when 'credit_note' then 'CN'
    when 'default_payment_notice' then 'DPN' when 'variation_schedule' then 'VS' when 'daywork_summary' then 'DS' else 'ST' end;
  select * into b from public.organisation_billing_profiles where organisation_id=org;
  if coalesce(b.legal_name,b.trading_name) is null then
    raise exception 'Record TileSPEC''s business name in the business details before issuing documents' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commercial-document:'||case when v_series in ('INV','CN') then org::text else c::text end||':'||v_series,0));
  if private.field_uuid(p_data,'application_id') is not null then
    a:=private.payment_application_for_update(private.field_uuid(p_data,'application_id'),null);
    if a.contract_id<>c then raise exception 'Choose an application on this job' using errcode='22023'; end if;
  end if;
  if private.field_uuid(p_data,'supersedes_id') is not null then
    select * into previous from public.commercial_documents where id=private.field_uuid(p_data,'supersedes_id') and contract_id=c for update;
    if not found or previous.kind<>k then raise exception 'Choose the issued document this revises' using errcode='22023'; end if;
    if previous.superseded_at is not null then raise exception 'That document has already been revised' using errcode='22023'; end if;
    if k in ('invoice','credit_note','default_payment_notice') then raise exception 'An invoice is corrected by a credit note, not a revision' using errcode='22023'; end if;
    if length(coalesce(private.field_text(p_data,'revision_reason',1000),''))<3 then raise exception 'Say why the document is revised' using errcode='22023'; end if;
    rev:=previous.revision+1;
    if rev>25 then raise exception 'Too many revisions' using errcode='22023'; end if;
    seq:=previous.sequence;
  end if;
  if k in ('payment_application','final_account') then
    if a.id is null then raise exception 'Choose the application' using errcode='22023'; end if;
    if a.status='draft' then
      if private.field_integer(p_data,'application_version',1,1000000) is distinct from a.version then
        raise exception 'This application changed since you opened it. Refresh to see the latest.' using errcode='40001'; end if;
      a:=private.submit_application(a);
    elsif a.status='cancelled' then raise exception 'This application was cancelled' using errcode='22023'; end if;
    if previous.id is null then
      if exists(select 1 from public.commercial_documents d where d.application_id=a.id and d.kind=k) then
        raise exception 'This application has been issued. Issue a revision naming the reason.' using errcode='22023'; end if;
      seq:=a.number;
    elsif previous.application_id<>a.id then raise exception 'A revision is of the same application' using errcode='22023'; end if;
  elsif k='invoice' then
    if a.id is null then raise exception 'Choose the application to invoice' using errcode='22023'; end if;
    if coalesce((select sum(i.total) from public.commercial_documents i where i.kind='invoice' and i.application_id=a.id),0)
      <> coalesce((select sum(cn.total) from public.commercial_documents cn join public.commercial_documents i on i.id=cn.credits_document_id
        where cn.kind='credit_note' and i.application_id=a.id),0) then
      raise exception 'This application already has an invoice. To change it, credit it in full first.' using errcode='22023'; end if;
  elsif k='credit_note' then
    select * into inv from public.commercial_documents where id=private.field_uuid(p_data,'invoice_id',true) and contract_id=c and kind='invoice' for update;
    if not found then raise exception 'Choose an invoice on this job' using errcode='22023'; end if;
    if length(coalesce(private.field_text(p_data,'reason',1000),''))<3 then raise exception 'Say why the credit note is issued' using errcode='22023'; end if;
  elsif k='default_payment_notice' then
    if a.id is null then raise exception 'Choose the application' using errcode='22023'; end if;
    if not coalesce((a.terms->>'construction_act')::boolean,true) then raise exception 'The Construction Act does not apply to this contract' using errcode='22023'; end if;
    if a.status<>'submitted' then raise exception 'A default notice is given only when the application has no payment notice' using errcode='22023'; end if;
    if private.site_today()<=a.payment_notice_by then raise exception 'The client still has until % to give their payment notice',a.payment_notice_by using errcode='22023'; end if;
    if exists(select 1 from public.payment_notices n where n.application_id=a.id and n.kind='default_payment' and n.voided_at is null) then
      raise exception 'A default payment notice has already been given' using errcode='22023'; end if;
  end if;
  s:=private.build_document(k,c,p_data||case when a.id is not null then jsonb_build_object('application_id',a.id) else '{}'::jsonb end);
  if k='invoice' then
    v_net:=(s->'invoice'->>'net')::numeric; v_vat:=(s->'invoice'->>'vat')::numeric; v_total:=(s->'invoice'->>'total')::numeric;
    v_cis:=(s->'invoice'->>'cis_expected')::numeric; v_due:=(s->'invoice'->>'due_on')::date; v_final:=(s->'invoice'->>'final_on')::date;
    if v_net<=0 then raise exception 'Nothing is due on this application to invoice' using errcode='22023'; end if;
    if s->'invoice'->>'vat_treatment' not in ('not_registered','exempt','outside_scope') and b.vat_number is null then
      raise exception 'A VAT invoice needs TileSPEC''s VAT registration number' using errcode='22023'; end if;
  elsif k='credit_note' then
    -- Stored as positive figures; a credit note's sign is its kind.
    v_net:=(s->'credit_note'->>'net')::numeric; v_vat:=(s->'credit_note'->>'vat')::numeric; v_total:=(s->'credit_note'->>'total')::numeric;
  elsif k in ('payment_application','final_account') then
    f:=s->'figures';
    v_net:=(f->>'applied_this_period')::numeric; v_vat:=(f->>'vat')::numeric; v_total:=v_net+v_vat; v_cis:=(f->>'cis_expected')::numeric;
    v_due:=(f->>'due_on')::date; v_final:=(f->>'final_on_effective')::date;
  elsif k='default_payment_notice' then
    insert into public.payment_notices(organisation_id,contract_id,application_id,kind,given_on,sum_stated,basis,in_time,recorded_by,recorded_by_name,request_key)
      values(org,c,a.id,'default_payment',private.site_today(),(s->'notice'->>'sum_stated')::numeric,s->'notice'->>'basis',true,auth.uid(),private.member_name(),p_request_key)
      returning id into notice;
    v_net:=(s->'notice'->>'sum_stated')::numeric; v_final:=(s->'notice'->>'final_on_postponed')::date; seq:=a.number;
  end if;
  if seq is null then
    select coalesce(max(d.sequence),0)+1 into seq from public.commercial_documents d where d.series=v_series
      and (case when v_series in ('INV','CN') then d.organisation_id=org else d.contract_id=c end);
  end if;
  s:=s||jsonb_build_object('reference',private.document_reference(k,c,seq,rev),'issued_on',private.site_today(),'issued_by',private.member_name(),
    'revision',rev,'revision_reason',nullif(private.field_text(p_data,'revision_reason',1000),''),'supersedes',previous.reference);
  insert into public.commercial_documents(organisation_id,contract_id,kind,series,sequence,revision,reference,title,application_id,credits_document_id,notice_id,
    supersedes_id,revision_reason,issued_on,net,vat,total,cis,due_on,final_on,snapshot,snapshot_sha256,issued_by,issued_by_name,request_key)
  values(org,c,k,v_series,seq,rev,private.document_reference(k,c,seq,rev),private.document_title(k,s),
    case when k in ('payment_application','final_account','invoice','default_payment_notice') then a.id end,inv.id,notice,previous.id,
    case when rev>0 then private.field_text(p_data,'revision_reason',1000) end,private.site_today(),v_net,v_vat,v_total,v_cis,v_due,v_final,
    s,encode(sha256(convert_to(s::text,'UTF8')),'hex'),auth.uid(),private.member_name(),p_request_key)
  returning id into result;
  if previous.id is not null then update public.commercial_documents set superseded_at=now(),superseded_by_id=result where id=previous.id; end if;
  perform private.record_request(org,'issue_commercial_document',p_request_key,p_data,result);
  return result;
end $$;

-- A link that opens one issued document without signing in, for up to 90 days. The secret is shown
-- once; only its hash is kept.
create function public.share_commercial_document(p_document uuid,p_data jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare d public.commercial_documents; token text; days integer;
begin
  perform private.only_keys(p_data,array['days','recipient']);
  select * into d from public.commercial_documents where id=p_document and organisation_id=private.current_org();
  if not found then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  perform private.require_money(d.contract_id);
  days:=coalesce(private.field_integer(p_data,'days',1,90),30);
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.commercial_document_shares(organisation_id,contract_id,document_id,token_sha256,recipient,expires_at,created_by,created_by_name)
    values(d.organisation_id,d.contract_id,d.id,encode(sha256(convert_to(token,'UTF8')),'hex'),nullif(private.field_text(p_data,'recipient',200),''),
      now()+make_interval(days=>days),auth.uid(),private.member_name());
  return token;
end $$;
create function public.revoke_commercial_document_share(p_share uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.commercial_document_shares;
begin
  select * into s from public.commercial_document_shares where id=p_share and organisation_id=private.current_org() for update;
  if not found then raise exception 'Money access is required for the accounts' using errcode='42501'; end if;
  perform private.require_money(s.contract_id);
  if s.revoked_at is null then update public.commercial_document_shares set revoked_at=now(),revoked_by=auth.uid() where id=s.id; end if;
end $$;
-- Whoever holds a live link may open that one document, and nothing else. Only the server's
-- shared-link route calls this, with the service role; no browser role may execute it.
create function public.shared_commercial_document(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.commercial_document_shares; d public.commercial_documents;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into s from public.commercial_document_shares where token_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found or s.revoked_at is not null or s.expires_at<=now() then return null; end if;
  select * into d from public.commercial_documents where id=s.document_id;
  update public.commercial_document_shares set view_count=view_count+1,last_viewed_at=now() where id=s.id;
  return jsonb_build_object('kind',d.kind,'reference',d.reference,'title',d.title,'issued_on',d.issued_on,'snapshot',d.snapshot,'snapshot_sha256',d.snapshot_sha256,
    'superseded',d.superseded_at is not null);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------------------------
revoke all on function private.valuation_terms(uuid),private.extra_states(uuid),private.compute_valuation(uuid,jsonb),private.certified_retention(jsonb,jsonb,numeric),
  private.account_rows(uuid),private.require_money(uuid),private.field_percent(jsonb,text),private.submit_application(public.payment_applications),
  private.document_header(uuid),private.extras_schedule(uuid),private.application_snapshot(uuid),private.daywork_schedule(uuid),private.statement_snapshot(uuid),
  private.build_document(text,uuid,jsonb),private.document_reference(text,uuid,integer,integer),private.document_title(text,jsonb),
  private.guard_commercial_document_share(),private.guard_payment_terms() from public,anon,authenticated;
revoke all on function public.commercial_account(uuid),public.save_billing_profile(integer,jsonb),public.save_payment_terms(uuid,integer,jsonb),
  public.record_contract_completion(uuid,integer,jsonb),public.add_payment_stage(uuid,jsonb),public.void_payment_stage(uuid,text),
  public.include_daywork_in_variation(uuid,jsonb),public.remove_daywork_inclusion(uuid,text),public.raise_commercial_dispute(uuid,jsonb),
  public.resolve_commercial_dispute(uuid,jsonb),public.record_pay_less_notice(uuid,jsonb),public.void_payment_notice(uuid,text),
  public.preview_commercial_document(jsonb),public.issue_commercial_document(uuid,jsonb),public.share_commercial_document(uuid,jsonb),
  public.revoke_commercial_document_share(uuid),public.shared_commercial_document(text) from public,anon;
revoke all on function public.shared_commercial_document(text) from authenticated;
grant execute on function public.commercial_account(uuid),public.save_billing_profile(integer,jsonb),public.save_payment_terms(uuid,integer,jsonb),
  public.record_contract_completion(uuid,integer,jsonb),public.add_payment_stage(uuid,jsonb),public.void_payment_stage(uuid,text),
  public.include_daywork_in_variation(uuid,jsonb),public.remove_daywork_inclusion(uuid,text),public.raise_commercial_dispute(uuid,jsonb),
  public.resolve_commercial_dispute(uuid,jsonb),public.record_pay_less_notice(uuid,jsonb),public.void_payment_notice(uuid,text),
  public.preview_commercial_document(jsonb),public.issue_commercial_document(uuid,jsonb),public.share_commercial_document(uuid,jsonb),
  public.revoke_commercial_document_share(uuid) to authenticated;
-- Opened only by the server's shared-link route, never directly by a browser.
grant execute on function public.shared_commercial_document(text) to service_role;
commit;
