-- Subcontractor portal: one integrated process on top of the existing gang invoice workflow.
--
-- Nothing here is a second invoicing system. A subcontractor is the gang (team) the office already
-- puts on jobs; their invoices are the existing gang_invoices, checked by the existing supervisor
-- verification and approved by the existing office decision. This migration adds what was missing:
--
--   * Access without a login: an individually issued, revocable, time-limited link. Only the
--     link's SHA-256 is stored. Every portal function takes the link's secret and is limited to
--     that one subcontractor's own records. Anonymous visitors can call nothing else.
--   * Onboarding records the office keeps: invoicing and tax details (UTR, CIS status, VAT),
--     bank details in their own table, and a signed subcontractor agreement stored with the exact
--     text, version, signer, time and acceptance evidence. An unsigned agreement is never accepted.
--   * An invoice generated from agreed rates: the subcontractor enters quantities only. Day rates,
--     approved variations and (clearly separate) additional work not yet approved are extras on
--     the same invoice. Rates are read from the office's records and can never be supplied.
--   * CIS, retention and VAT worked out at approval and kept apart from the gross invoice value.
--     Nothing is deducted without a recorded basis: a verified CIS status, an agreed retention
--     percentage, or an office adjustment with a written reason.
--
-- Additive and transactional. Existing invoices, rates, terms and logins keep working unchanged.
begin;

do $$ begin
  if to_regclass('public.gang_invoices') is null or to_regclass('public.gang_invoice_commercials') is null
    or to_regprocedure('public.decide_gang_invoice(uuid,uuid,integer,text,jsonb)') is null
    or to_regprocedure('private.has_money_access()') is null or to_regclass('public.organisation_billing_profiles') is null
    or to_regprocedure('private.gang_rate_for(uuid,uuid,text,date)') is null then
    raise exception 'Preflight failed: the gang invoice workflow (20261110090000) and commercial accounts must be applied first';
  end if;
  if not exists (select 1 from storage.buckets b where b.id = 'gang-claims' and not b.public) then
    raise exception 'Preflight failed: the private gang-claims bucket is required';
  end if;
  if to_regclass('public.subcontractor_portal_links') is not null or to_regclass('public.subcontractor_agreements') is not null
    or to_regprocedure('public.portal_session(text)') is not null then
    raise exception 'Preflight failed: subcontractor portal objects already exist; review schema drift';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. Access links. The secret is shown once to the office user who issues it; only its hash is kept.
-- ---------------------------------------------------------------------------------------------
create table public.subcontractor_portal_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  team_id uuid not null,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  issued_to text not null check (length(trim(issued_to)) between 2 and 160),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  unique (organisation_id, id),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  check ((revoked_at is null) = (revoked_by is null)),
  check (expires_at > created_at and expires_at <= created_at + interval '91 days')
);
create index subcontractor_portal_links_team on public.subcontractor_portal_links(team_id, created_at desc);

-- Invoices, files and verification requests may now come from a link instead of a login.
alter table public.gang_invoices
  alter column submitted_by drop not null,
  add column portal_link_id uuid references public.subcontractor_portal_links(id),
  add column source text not null default 'upload' check (source in ('upload','generated')),
  add constraint gang_invoices_sender check (num_nonnulls(submitted_by, portal_link_id) = 1);
create unique index gang_invoices_portal_request on public.gang_invoices(portal_link_id, request_key) where portal_link_id is not null;
alter table public.gang_invoice_files
  alter column uploaded_by drop not null,
  add column portal_link_id uuid references public.subcontractor_portal_links(id),
  add constraint gang_invoice_files_sender check (num_nonnulls(uploaded_by, portal_link_id) = 1);
create unique index gang_invoice_files_portal_request on public.gang_invoice_files(portal_link_id, kind, request_key) where portal_link_id is not null;
alter table public.gang_verification_requests
  alter column created_by drop not null,
  drop constraint gang_verification_requests_check,
  add constraint gang_verification_requests_resolved check ((resolved_at is null) = (resolution is null));

-- ---------------------------------------------------------------------------------------------
-- 2. Onboarding records: invoicing and tax details, and bank details kept apart.
-- ---------------------------------------------------------------------------------------------
create table public.subcontractor_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  team_id uuid not null unique,
  business_type text not null default 'sole_trader' check (business_type in ('sole_trader','partnership','limited_company')),
  legal_name text not null check (length(trim(legal_name)) between 2 and 160),
  trading_name text check (trading_name is null or length(trim(trading_name)) between 2 and 160),
  address text not null check (length(trim(address)) between 5 and 500),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  phone text check (phone is null or length(trim(phone)) between 6 and 40),
  company_number text check (company_number is null or company_number ~ '^[A-Z0-9]{8}$'),
  utr text check (utr is null or utr ~ '^[0-9]{10}$'),
  -- CIS: unverified until the office has verified the subcontractor with HMRC.
  cis_status text not null default 'unverified' check (cis_status in ('unverified','gross','net','higher')),
  cis_verification_number text check (cis_verification_number is null or length(trim(cis_verification_number)) between 3 and 40),
  cis_verified_on date,
  vat_registered boolean not null default false,
  vat_number text check (vat_number is null or vat_number ~ '^(GB|XI)([0-9]{9}|[0-9]{12})$'),
  -- Construction services to a VAT-registered contractor are normally under the domestic reverse charge.
  vat_reverse_charge boolean not null default true,
  -- A VAT self-billing agreement in force between these dates (HMRC VAT Notice 700/62).
  self_billing_from date,
  self_billing_until date,
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id),
  updated_by_name text,
  updated_at timestamptz not null default now(),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  check (vat_registered = (vat_number is not null)),
  check ((cis_status = 'unverified') = (cis_verified_on is null)),
  check ((self_billing_from is null) = (self_billing_until is null)),
  check (self_billing_until is null or (self_billing_until >= self_billing_from and self_billing_until <= self_billing_from + 366))
);
create table public.subcontractor_bank_details (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  team_id uuid not null unique,
  account_name text not null check (length(trim(account_name)) between 2 and 120),
  sort_code text not null check (sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  account_number text not null check (account_number ~ '^[0-9]{8}$'),
  verified_note text check (verified_note is null or length(verified_note) <= 500),
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id),
  updated_by_name text,
  updated_at timestamptz not null default now(),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id)
);

-- ---------------------------------------------------------------------------------------------
-- 3. The subcontractor agreement: versions (exact text) and each issued and signed copy.
-- ---------------------------------------------------------------------------------------------
create table public.subcontractor_agreement_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  version_label text not null check (length(trim(version_label)) between 1 and 40),
  title text not null check (length(trim(title)) between 3 and 200),
  body text not null check (length(body) between 500 and 120000),
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status in ('draft','published','withdrawn')),
  -- The agreement is a legal document: a version cannot be issued until its legal review is recorded.
  legal_reviewed_by text check (legal_reviewed_by is null or length(trim(legal_reviewed_by)) between 2 and 200),
  legal_reviewed_on date,
  legal_review_note text check (legal_review_note is null or length(legal_review_note) <= 2000),
  published_at timestamptz,
  published_by uuid references auth.users(id),
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, version_label),
  unique (organisation_id, id),
  check (status = 'draft' or (legal_reviewed_by is not null and legal_reviewed_on is not null and published_at is not null and published_by is not null)),
  check ((status = 'withdrawn') = (withdrawn_at is not null))
);
create sequence private.subcontractor_agreement_reference_seq;
create table public.subcontractor_agreements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  team_id uuid not null,
  version_id uuid not null,
  reference text not null unique check (reference ~ '^SA-[0-9]{5,}$'),
  status text not null default 'issued' check (status in ('issued','signed','withdrawn')),
  -- The exact document put in front of the subcontractor, copied so later versions never alter it.
  version_label text not null,
  title text not null,
  body text not null,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  parties jsonb not null,
  issued_by uuid not null references auth.users(id),
  issued_by_name text not null,
  issued_at timestamptz not null default now(),
  -- Acceptance evidence. All empty until signed; never filled in by the office.
  signed_at timestamptz,
  signer_name text check (signer_name is null or length(trim(signer_name)) between 2 and 160),
  signer_position text check (signer_position is null or length(signer_position) <= 160),
  signature_text text check (signature_text is null or length(trim(signature_text)) between 2 and 160),
  signed_link_id uuid references public.subcontractor_portal_links(id),
  signer_ip text check (signer_ip is null or length(signer_ip) <= 64),
  signer_user_agent text check (signer_user_agent is null or length(signer_user_agent) <= 400),
  acceptance jsonb,
  evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id),
  withdraw_reason text check (withdraw_reason is null or length(trim(withdraw_reason)) between 3 and 1000),
  unique (organisation_id, id),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  foreign key (organisation_id, version_id) references public.subcontractor_agreement_versions(organisation_id, id),
  check ((signed_at is null) = (signer_name is null) and (signed_at is null) = (signature_text is null)
    and (signed_at is null) = (signed_link_id is null) and (signed_at is null) = (evidence_sha256 is null) and (signed_at is null) = (acceptance is null)),
  check (status <> 'signed' or signed_at is not null),
  check (status <> 'issued' or signed_at is null),
  check (num_nulls(withdrawn_at, withdrawn_by, withdraw_reason) in (0,3)),
  check ((status = 'withdrawn') = (withdrawn_at is not null))
);
-- One agreement waiting for signature per subcontractor at a time.
create unique index subcontractor_agreement_one_pending on public.subcontractor_agreements(team_id) where status = 'issued';
create index subcontractor_agreements_team on public.subcontractor_agreements(team_id, issued_at desc);

-- ---------------------------------------------------------------------------------------------
-- 4. What was missing from a gang on a job: retention, day rates and approved variations.
-- ---------------------------------------------------------------------------------------------
alter table public.gang_subcontracts
  add column retention_percent numeric(5,2) not null default 0 check (retention_percent between 0 and 10);
alter table public.gang_rates
  drop constraint gang_rates_unit_check,
  add constraint gang_rates_unit_check check (unit in ('m2','lm','item','day','hour')),
  add constraint gang_rates_time_everywhere check (unit not in ('day','hour') or work_area_id is null);

create sequence private.gang_variation_reference_seq;
create table public.gang_variations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  subcontract_id uuid not null,
  team_id uuid not null,
  reference text not null unique check (reference ~ '^SV-[0-9]{5,}$'),
  description text not null check (length(trim(description)) between 3 and 500),
  amount numeric(14,2) not null check (amount > 0 and amount <= 10000000),
  instructed_on date not null,
  created_by uuid not null references auth.users(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  request_key uuid not null,
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id),
  withdraw_reason text check (withdraw_reason is null or length(trim(withdraw_reason)) between 3 and 1000),
  unique (organisation_id, created_by, request_key),
  unique (organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, subcontract_id) references public.gang_subcontracts(organisation_id, contract_id, id),
  foreign key (organisation_id, team_id) references public.teams(organisation_id, id),
  check (num_nulls(withdrawn_at, withdrawn_by, withdraw_reason) in (0,3))
);
create index gang_variations_subcontract on public.gang_variations(subcontract_id) where withdrawn_at is null;

-- Extras on an invoice: day rate work, a claim against an approved variation, or additional work
-- the office has not approved. They carry money, so the table is office-only; the supervisor
-- confirms quantities through gang_invoice_extras_for_check, which returns no amounts.
create table public.gang_invoice_extras (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  invoice_id uuid not null,
  team_id uuid not null,
  line_no integer not null check (line_no between 1 and 20),
  kind text not null check (kind in ('day_rate','variation','additional')),
  unit text not null check (unit in ('day','hour','sum')),
  description text not null check (length(trim(description)) between 3 and 500),
  claimed_quantity numeric(12,2) not null check (claimed_quantity > 0 and claimed_quantity <= 1000),
  rate numeric(14,2) check (rate is null or rate > 0),
  claimed_amount numeric(14,2) check (claimed_amount is null or (claimed_amount > 0 and claimed_amount <= 10000000)),
  variation_id uuid,
  confirmed_quantity numeric(12,2) check (confirmed_quantity is null or confirmed_quantity >= 0),
  confirmation_note text check (confirmation_note is null or length(confirmation_note) <= 1000),
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount >= 0),
  unique (invoice_id, line_no),
  foreign key (organisation_id, contract_id, invoice_id) references public.gang_invoices(organisation_id, contract_id, id),
  foreign key (organisation_id, contract_id, variation_id) references public.gang_variations(organisation_id, contract_id, id),
  check ((kind = 'variation') = (variation_id is not null)),
  check ((kind = 'day_rate') = (unit in ('day','hour'))),
  check (kind = 'day_rate' or claimed_quantity = 1),
  check (confirmed_quantity is null or confirmed_quantity <= claimed_quantity),
  check (approved_amount is null or confirmed_quantity is not null)
);
create unique index gang_invoice_extras_variation on public.gang_invoice_extras(invoice_id, variation_id) where variation_id is not null;
create index gang_invoice_extras_variation_use on public.gang_invoice_extras(variation_id) where variation_id is not null;

-- Money on the invoice: what was claimed (a fixed snapshot) and how the payment was worked out.
alter table public.gang_invoice_commercials
  add column invoice_date date,
  add column claim_breakdown jsonb,
  add column extras_approved jsonb,
  add column vat_treatment text check (vat_treatment in ('none','standard','reverse_charge')),
  add column vat_rate numeric(5,2) check (vat_rate is null or vat_rate between 0 and 25),
  add column vat_amount numeric(14,2) check (vat_amount is null or vat_amount >= 0),
  add column retention_percent numeric(5,2) check (retention_percent is null or retention_percent between 0 and 10),
  add column retention_amount numeric(14,2) check (retention_amount is null or retention_amount >= 0),
  add column cis_status text check (cis_status in ('gross','net','higher')),
  add column cis_rate numeric(5,2) check (cis_rate is null or cis_rate in (0,20,30)),
  add column cis_materials numeric(14,2) check (cis_materials is null or cis_materials >= 0),
  add column cis_amount numeric(14,2) check (cis_amount is null or cis_amount >= 0),
  add column net_payable numeric(14,2) check (net_payable is null or net_payable >= 0),
  add constraint gang_commercial_tax_together check (num_nulls(vat_treatment, vat_amount, retention_amount, cis_rate, cis_amount, net_payable) in (0,6));

-- Retention held on approved invoices is paid later, less CIS at the rate then in force.
create table public.gang_retention_releases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  contract_id uuid not null,
  subcontract_id uuid not null,
  team_id uuid not null,
  amount numeric(14,2) not null check (amount > 0 and amount <= 10000000),
  cis_rate numeric(5,2) not null check (cis_rate in (0,20,30)),
  cis_amount numeric(14,2) not null check (cis_amount >= 0),
  net_paid numeric(14,2) not null check (net_paid >= 0),
  released_on date not null,
  payment_reference text check (payment_reference is null or length(trim(payment_reference)) between 1 and 120),
  note text check (note is null or length(note) <= 1000),
  recorded_by uuid not null references auth.users(id),
  recorded_by_name text not null,
  recorded_at timestamptz not null default now(),
  request_key uuid not null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text check (void_reason is null or length(trim(void_reason)) between 3 and 1000),
  unique (organisation_id, recorded_by, request_key),
  foreign key (organisation_id, contract_id, subcontract_id) references public.gang_subcontracts(organisation_id, contract_id, id),
  check (net_paid = amount - cis_amount),
  check (num_nulls(voided_at, voided_by, void_reason) in (0,3))
);
create index gang_retention_releases_subcontract on public.gang_retention_releases(subcontract_id) where voided_at is null;

-- ---------------------------------------------------------------------------------------------
-- 5. Who may see what. Office users with money access only; the portal reads through functions.
-- ---------------------------------------------------------------------------------------------
alter table public.subcontractor_portal_links enable row level security;
alter table public.subcontractor_tax_profiles enable row level security;
alter table public.subcontractor_bank_details enable row level security;
alter table public.subcontractor_agreement_versions enable row level security;
alter table public.subcontractor_agreements enable row level security;
alter table public.gang_variations enable row level security;
alter table public.gang_invoice_extras enable row level security;
alter table public.gang_retention_releases enable row level security;

create policy portal_link_read on public.subcontractor_portal_links for select to authenticated using (
  organisation_id = private.current_org() and private.has_money_access());
create policy tax_profile_read on public.subcontractor_tax_profiles for select to authenticated using (
  organisation_id = private.current_org() and private.has_money_access());
create policy bank_details_read on public.subcontractor_bank_details for select to authenticated using (
  organisation_id = private.current_org() and private.has_money_access());
create policy agreement_version_read on public.subcontractor_agreement_versions for select to authenticated using (
  organisation_id = private.current_org() and private.is_office());
-- Whether a subcontractor has signed is useful to the office and supervisors; the text is not secret.
create policy agreement_read on public.subcontractor_agreements for select to authenticated using (
  organisation_id = private.current_org() and private.is_office());
create policy gang_variation_read on public.gang_variations for select to authenticated using (
  organisation_id = private.current_org() and private.can_view_financials(contract_id));
create policy gang_invoice_extra_read on public.gang_invoice_extras for select to authenticated using (
  organisation_id = private.current_org() and private.can_view_financials(contract_id));
create policy gang_retention_release_read on public.gang_retention_releases for select to authenticated using (
  organisation_id = private.current_org() and private.can_view_financials(contract_id));

do $$ declare t text; begin
  foreach t in array array['subcontractor_portal_links','subcontractor_tax_profiles','subcontractor_bank_details','subcontractor_agreement_versions',
    'subcontractor_agreements','gang_variations','gang_invoice_extras','gang_retention_releases'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
-- The link's fingerprint is never sent to a browser, even to the office.
revoke select on public.subcontractor_portal_links from authenticated;
grant select (id, organisation_id, team_id, issued_to, expires_at, created_by, created_by_name, created_at, revoked_at, revoked_by, last_used_at, use_count)
  on public.subcontractor_portal_links to authenticated;
revoke all on sequence private.subcontractor_agreement_reference_seq, private.gang_variation_reference_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Integrity guards.
-- ---------------------------------------------------------------------------------------------
create function private.guard_portal_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Access links are permanent; revoke one instead' using errcode='42501'; end if;
  if (to_jsonb(new) - array['revoked_at','revoked_by','last_used_at','use_count']) is distinct from (to_jsonb(old) - array['revoked_at','revoked_by','last_used_at','use_count'])
    or (old.revoked_at is not null and (new.revoked_at, new.revoked_by) is distinct from (old.revoked_at, old.revoked_by)) then
    raise exception 'An access link cannot be rewritten' using errcode='42501'; end if;
  return new;
end $$;
create trigger portal_link_guard before update or delete on public.subcontractor_portal_links for each row execute function private.guard_portal_link();

create function private.guard_agreement_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Agreement versions are permanent; withdraw one instead' using errcode='42501'; end if;
  if (new.id, new.organisation_id, new.version_label, new.title, new.body, new.body_sha256, new.created_by, new.created_at)
    is distinct from (old.id, old.organisation_id, old.version_label, old.title, old.body, old.body_sha256, old.created_by, old.created_at) then
    raise exception 'The text of an agreement version cannot be changed. Create a new version.' using errcode='42501'; end if;
  if old.status = 'withdrawn' or (old.status = 'published' and new.status <> 'withdrawn' and to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception 'A published version can only be withdrawn' using errcode='42501'; end if;
  return new;
end $$;
create trigger agreement_version_guard before update or delete on public.subcontractor_agreement_versions for each row execute function private.guard_agreement_version();

create function private.guard_agreement() returns trigger language plpgsql security definer set search_path='' as $$
declare fixed text[] := array['status','signed_at','signer_name','signer_position','signature_text','signed_link_id','signer_ip','signer_user_agent','acceptance',
  'evidence_sha256','withdrawn_at','withdrawn_by','withdraw_reason'];
begin
  if tg_op = 'DELETE' then raise exception 'Agreements are permanent; withdraw one instead' using errcode='42501'; end if;
  if (to_jsonb(new) - fixed) is distinct from (to_jsonb(old) - fixed) then
    raise exception 'An issued agreement cannot be rewritten' using errcode='42501'; end if;
  if old.status = 'withdrawn' then raise exception 'A withdrawn agreement stays withdrawn' using errcode='42501'; end if;
  if old.signed_at is not null and (new.signed_at, new.signer_name, new.signer_position, new.signature_text, new.signed_link_id, new.signer_ip, new.signer_user_agent, new.acceptance, new.evidence_sha256)
    is distinct from (old.signed_at, old.signer_name, old.signer_position, old.signature_text, old.signed_link_id, old.signer_ip, old.signer_user_agent, old.acceptance, old.evidence_sha256) then
    raise exception 'A signature is permanent' using errcode='42501'; end if;
  if new.status = 'issued' and old.status <> 'issued' then raise exception 'A signed agreement cannot become unsigned' using errcode='42501'; end if;
  return new;
end $$;
create trigger agreement_guard before update or delete on public.subcontractor_agreements for each row execute function private.guard_agreement();

create function private.guard_gang_extra() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Claimed extras are permanent' using errcode='42501'; end if;
  if (to_jsonb(new) - array['confirmed_quantity','confirmation_note','approved_amount']) is distinct from (to_jsonb(old) - array['confirmed_quantity','confirmation_note','approved_amount']) then
    raise exception 'What was claimed cannot be rewritten' using errcode='42501'; end if;
  if old.approved_amount is not null and (new.approved_amount, new.confirmed_quantity) is distinct from (old.approved_amount, old.confirmed_quantity) then
    raise exception 'An approved amount is final' using errcode='42501'; end if;
  return new;
end $$;
create trigger gang_extra_guard before update or delete on public.gang_invoice_extras for each row execute function private.guard_gang_extra();
create trigger gang_variation_guard before update or delete on public.gang_variations for each row execute function private.guard_append_only('withdrawn_at','withdrawn_by','withdraw_reason');
create trigger gang_retention_release_guard before update or delete on public.gang_retention_releases for each row execute function private.guard_append_only('voided_at','voided_by','void_reason');

-- The claim as sent, and the approval with its tax working, are each final once recorded.
create or replace function private.guard_gang_commercial() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Invoice money records are permanent' using errcode='42501'; end if;
  if (new.id, new.invoice_id, new.organisation_id, new.contract_id, new.invoice_number, new.invoice_total, new.payment_due_on, new.invoice_date, new.claim_breakdown)
    is distinct from (old.id, old.invoice_id, old.organisation_id, old.contract_id, old.invoice_number, old.invoice_total, old.payment_due_on, old.invoice_date, old.claim_breakdown) then
    raise exception 'The invoice amount the gang sent cannot be rewritten' using errcode='42501'; end if;
  if old.approved_at is not null and (new.approved_amount, new.adjustment_amount, new.adjustment_reason, new.line_rates, new.approval_note,
      new.approved_by, new.approved_at, new.agreed_payment_on, new.job_cost_entry_id, new.extras_approved, new.vat_treatment, new.vat_rate, new.vat_amount,
      new.retention_percent, new.retention_amount, new.cis_status, new.cis_rate, new.cis_materials, new.cis_amount, new.net_payable)
    is distinct from (old.approved_amount, old.adjustment_amount, old.adjustment_reason, old.line_rates, old.approval_note,
      old.approved_by, old.approved_at, old.agreed_payment_on, old.job_cost_entry_id, old.extras_approved, old.vat_treatment, old.vat_rate, old.vat_amount,
      old.retention_percent, old.retention_amount, old.cis_status, old.cis_rate, old.cis_materials, old.cis_amount, old.net_payable) then
    raise exception 'An approval is final' using errcode='42501'; end if;
  if old.paid_recorded_at is not null and (new.paid_on, new.paid_amount, new.payment_reference, new.paid_recorded_by, new.paid_recorded_at)
    is distinct from (old.paid_on, old.paid_amount, old.payment_reference, old.paid_recorded_by, old.paid_recorded_at) then
    raise exception 'A recorded payment is final' using errcode='42501'; end if;
  return new;
end $$;

-- Audit. Bank details are audited by field name only: the numbers are never copied into the log.
create trigger portal_link_audit after insert or update on public.subcontractor_portal_links for each row execute function private.audit_mutation();
create trigger tax_profile_audit after insert or update on public.subcontractor_tax_profiles for each row execute function private.audit_financial_mutation();
create trigger bank_details_audit after insert or update on public.subcontractor_bank_details for each row execute function private.audit_mutation();
create trigger agreement_version_audit after insert or update on public.subcontractor_agreement_versions for each row execute function private.audit_mutation();
create trigger agreement_audit after insert or update on public.subcontractor_agreements for each row execute function private.audit_mutation();
create trigger gang_variation_audit after insert or update on public.gang_variations for each row execute function private.audit_financial_mutation();
create trigger gang_extra_audit after insert or update on public.gang_invoice_extras for each row execute function private.audit_financial_mutation();
create trigger gang_retention_release_audit after insert or update on public.gang_retention_releases for each row execute function private.audit_financial_mutation();

-- ---------------------------------------------------------------------------------------------
-- 7. Helpers.
-- ---------------------------------------------------------------------------------------------
create function private.cis_rate(p_status text) returns numeric language sql immutable set search_path='' as $$
  select case p_status when 'gross' then 0 when 'net' then 20 when 'higher' then 30 end::numeric
$$;
create function private.has_signed_agreement(p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.subcontractor_agreements a where a.team_id = p_team and a.status = 'signed')
$$;
create function private.self_billing_current(p public.subcontractor_tax_profiles) returns boolean language sql stable set search_path='' as $$
  select p.self_billing_from is not null and private.site_today() between p.self_billing_from and p.self_billing_until
$$;
-- What a variation has already been claimed for: approved amounts once decided, claimed amounts while open.
create function private.gang_variation_used(p_variation uuid, p_exclude_invoice uuid default null) returns numeric
language sql stable security definer set search_path='' as $$
  select coalesce(sum(case when i.status in ('approved','paid') then coalesce(e.approved_amount, 0)
    when i.status in ('uploading','awaiting_check','with_office','query_gang') then e.claimed_amount else 0 end), 0)
  from public.gang_invoice_extras e join public.gang_invoices i on i.id = e.invoice_id
  where e.variation_id = p_variation and i.id is distinct from p_exclude_invoice
$$;
create function private.gang_retention_held(p_subcontract uuid) returns numeric language sql stable security definer set search_path='' as $$
  select coalesce((select sum(ci.retention_amount) from public.gang_invoice_commercials ci join public.gang_invoices i on i.id = ci.invoice_id
      where i.subcontract_id = p_subcontract and i.status in ('approved','paid')), 0)
    - coalesce((select sum(r.amount) from public.gang_retention_releases r where r.subcontract_id = p_subcontract and r.voided_at is null), 0)
$$;

-- Events written through a link carry the name the link was issued to.
create or replace function private.gang_event(p_invoice public.gang_invoices, p_action text, p_from text, p_note text,
  p_visibility text default 'all', p_details jsonb default '{}') returns void
language sql security definer set search_path='' as $$
  insert into public.gang_invoice_events(organisation_id, contract_id, invoice_id, actor_id, actor_name, action, from_status, to_status, note, visibility, details)
  values (p_invoice.organisation_id, p_invoice.contract_id, p_invoice.id, auth.uid(),
    coalesce(private.member_name(), nullif(current_setting('tilespec.portal_actor', true), ''), 'TileSpec'),
    p_action, p_from, p_invoice.status, nullif(trim(coalesce(p_note, '')), ''), p_visibility, coalesce(p_details, '{}'::jsonb))
$$;

-- Checks a link's secret. Anything wrong gives the same answer, so a guess learns nothing.
create function private.portal_link(p_token text) returns public.subcontractor_portal_links
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links;
begin
  if p_token is not null and p_token ~ '^[0-9a-f]{64}$' then
    select k.* into l from public.subcontractor_portal_links k join public.teams t on t.id = k.team_id
    where k.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and k.revoked_at is null and k.expires_at > now() and t.active;
  end if;
  if l.id is null then raise exception 'This link has expired or been withdrawn. Ask TileSpec for a new link.' using errcode='42501'; end if;
  if l.last_used_at is null or l.last_used_at < now() - interval '5 minutes' then
    update public.subcontractor_portal_links set last_used_at = now(), use_count = use_count + 1 where id = l.id;
  end if;
  perform set_config('tilespec.portal_actor', l.issued_to, true);
  return l;
end $$;

-- The storing and confirming of a reserved file, shared by signed-in gangs and link holders.
-- Completing the invoice document is what sends the invoice and opens the verification request.
create function private.finish_gang_file(f public.gang_invoice_files) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.gang_invoices; old_status text; replaced public.gang_invoices;
begin
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
create or replace function public.complete_gang_file(p_file uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.gang_invoice_files;
begin
  select * into f from public.gang_invoice_files where id = p_file for update;
  if not found or f.uploaded_by is distinct from auth.uid() or auth.uid() is null or f.organisation_id is distinct from private.current_org() then
    raise exception 'File unavailable' using errcode='42501'; end if;
  perform private.finish_gang_file(f);
end $$;

-- A link holder may store a file only at a path reserved through their link, once, soon after.
create function private.can_upload_portal_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.gang_invoice_files f join public.subcontractor_portal_links k on k.id = f.portal_link_id
    where f.object_path = p_path and f.uploaded_at is null and f.created_at > now() - interval '2 hours'
      and k.revoked_at is null and k.expires_at > now())
$$;
create policy gang_claims_portal_insert on storage.objects for insert to anon with check (
  bucket_id = 'gang-claims' and private.can_upload_portal_file(name));
-- No SELECT, UPDATE or DELETE policy for anonymous visitors: a stored file is never read, replaced or removed through a link.

-- ---------------------------------------------------------------------------------------------
-- 8. Office: onboarding, links, agreement, retention, day rates and variations. Money access only.
-- ---------------------------------------------------------------------------------------------
create function private.require_subcontractor_admin(p_team uuid) returns public.teams
language plpgsql stable security definer set search_path='' as $$
declare t public.teams;
begin
  select * into t from public.teams where id = p_team and organisation_id = private.current_org();
  if not found or not private.has_money_access() then raise exception 'Money access is required to manage subcontractors' using errcode='42501'; end if;
  if t.kind = 'direct_team' then raise exception 'Directly employed teams are not subcontractors' using errcode='22023'; end if;
  return t;
end $$;

create function public.save_subcontractor_profile(p_team uuid, p_version integer, p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare t public.teams := private.require_subcontractor_admin(p_team); existing public.subcontractor_tax_profiles; v_cis text; v_vat boolean; v_vat_no text;
  v_verified date; v_from date; v_until date; v_company text; v_utr text; v_type text; v_email text; result integer;
begin
  perform private.only_keys(p_data, array['business_type','legal_name','trading_name','address','email','phone','company_number','utr','cis_status',
    'cis_verification_number','cis_verified_on','vat_registered','vat_number','vat_reverse_charge','self_billing_from','self_billing_until']);
  v_type := coalesce(nullif(private.field_text(p_data, 'business_type', 30), ''), 'sole_trader');
  perform private.assert_choice(v_type, 'business_type', array['sole_trader','partnership','limited_company']);
  v_cis := coalesce(nullif(private.field_text(p_data, 'cis_status', 20), ''), 'unverified');
  perform private.assert_choice(v_cis, 'cis_status', array['unverified','gross','net','higher']);
  v_verified := private.field_date(p_data, 'cis_verified_on');
  if v_cis = 'unverified' then v_verified := null;
  elsif v_verified is null then raise exception 'Enter the date the CIS status was verified with HMRC' using errcode='22023';
  elsif v_verified > private.site_today() then raise exception 'The verification date cannot be in the future' using errcode='22023'; end if;
  v_vat := coalesce(private.field_boolean(p_data, 'vat_registered'), false);
  v_vat_no := upper(regexp_replace(coalesce(private.field_text(p_data, 'vat_number', 20), ''), '\s', '', 'g'));
  if v_vat_no ~ '^[0-9]{9}([0-9]{3})?$' then v_vat_no := 'GB' || v_vat_no; end if;
  if v_vat and v_vat_no !~ '^(GB|XI)([0-9]{9}|[0-9]{12})$' then raise exception 'Enter the VAT registration number, for example GB123456789' using errcode='22023'; end if;
  if not v_vat then v_vat_no := null; end if;
  v_from := private.field_date(p_data, 'self_billing_from'); v_until := private.field_date(p_data, 'self_billing_until');
  if (v_from is null) <> (v_until is null) or v_until < v_from or v_until > v_from + 366 then
    raise exception 'A self-billing agreement needs a start and an end date no more than twelve months apart' using errcode='22023'; end if;
  if v_from is not null and not v_vat then raise exception 'A self-billing agreement is only recorded for a VAT-registered subcontractor' using errcode='22023'; end if;
  v_company := nullif(upper(regexp_replace(coalesce(private.field_text(p_data, 'company_number', 12), ''), '\s', '', 'g')), '');
  if v_company is not null and v_company !~ '^[A-Z0-9]{8}$' then raise exception 'A company number has eight characters' using errcode='22023'; end if;
  v_utr := nullif(regexp_replace(coalesce(private.field_text(p_data, 'utr', 20), ''), '\s', '', 'g'), '');
  if v_utr is not null and v_utr !~ '^[0-9]{10}$' then raise exception 'A UTR has ten digits' using errcode='22023'; end if;
  v_email := nullif(lower(coalesce(private.field_text(p_data, 'email', 254), '')), '');
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address, or leave it blank' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tilespec-subcontractor-profile:' || t.id::text, 0));
  select * into existing from public.subcontractor_tax_profiles where team_id = t.id for update;
  if found and p_version is distinct from existing.version then
    raise exception 'These details were changed by someone else. Refresh and try again.' using errcode='40001'; end if;
  insert into public.subcontractor_tax_profiles(organisation_id, team_id, business_type, legal_name, trading_name, address, email, phone, company_number, utr,
    cis_status, cis_verification_number, cis_verified_on, vat_registered, vat_number, vat_reverse_charge, self_billing_from, self_billing_until, updated_by, updated_by_name)
  values (t.organisation_id, t.id, v_type, private.field_text(p_data, 'legal_name', 160, true), nullif(private.field_text(p_data, 'trading_name', 160), ''),
    private.field_text(p_data, 'address', 500, true), v_email, nullif(private.field_text(p_data, 'phone', 40), ''), v_company, v_utr, v_cis,
    case when v_cis <> 'unverified' then nullif(private.field_text(p_data, 'cis_verification_number', 40), '') end, v_verified, v_vat, v_vat_no,
    coalesce(private.field_boolean(p_data, 'vat_reverse_charge'), true), v_from, v_until, auth.uid(), private.member_name())
  on conflict (team_id) do update set business_type = excluded.business_type, legal_name = excluded.legal_name, trading_name = excluded.trading_name,
    address = excluded.address, email = excluded.email, phone = excluded.phone, company_number = excluded.company_number, utr = excluded.utr,
    cis_status = excluded.cis_status, cis_verification_number = excluded.cis_verification_number, cis_verified_on = excluded.cis_verified_on,
    vat_registered = excluded.vat_registered, vat_number = excluded.vat_number, vat_reverse_charge = excluded.vat_reverse_charge,
    self_billing_from = excluded.self_billing_from, self_billing_until = excluded.self_billing_until,
    version = public.subcontractor_tax_profiles.version + 1, updated_by = excluded.updated_by, updated_by_name = excluded.updated_by_name, updated_at = now()
  returning version into result;
  return result;
end $$;

create function public.save_subcontractor_bank(p_team uuid, p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare t public.teams := private.require_subcontractor_admin(p_team); v_sort text; v_account text;
begin
  perform private.only_keys(p_data, array['account_name','sort_code','account_number','verified_note']);
  v_sort := regexp_replace(coalesce(private.field_text(p_data, 'sort_code', 12, true), ''), '[^0-9]', '', 'g');
  v_account := regexp_replace(coalesce(private.field_text(p_data, 'account_number', 12, true), ''), '\s', '', 'g');
  if v_sort !~ '^[0-9]{6}$' or v_account !~ '^[0-9]{8}$' then raise exception 'Enter a six-digit sort code and an eight-digit account number' using errcode='22023'; end if;
  v_sort := substr(v_sort, 1, 2) || '-' || substr(v_sort, 3, 2) || '-' || substr(v_sort, 5, 2);
  insert into public.subcontractor_bank_details(organisation_id, team_id, account_name, sort_code, account_number, verified_note, updated_by, updated_by_name)
  values (t.organisation_id, t.id, private.field_text(p_data, 'account_name', 120, true), v_sort, v_account,
    nullif(private.field_text(p_data, 'verified_note', 500), ''), auth.uid(), private.member_name())
  on conflict (team_id) do update set account_name = excluded.account_name, sort_code = excluded.sort_code, account_number = excluded.account_number,
    verified_note = excluded.verified_note, version = public.subcontractor_bank_details.version + 1, updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name, updated_at = now();
end $$;

-- A new link for one subcontractor. The 256-bit secret is returned once and never stored.
create function public.issue_portal_link(p_team uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.teams := private.require_subcontractor_admin(p_team); token text; days integer; result uuid;
begin
  perform private.only_keys(p_data, array['issued_to','days']);
  if not t.active then raise exception 'That subcontractor is inactive' using errcode='22023'; end if;
  if (select count(*) from public.subcontractor_portal_links where team_id = t.id and revoked_at is null and expires_at > now()) >= 5 then
    raise exception 'This subcontractor already has five live links. Revoke one first.' using errcode='22023'; end if;
  days := coalesce(private.field_integer(p_data, 'days', 1, 90), 30);
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.subcontractor_portal_links(organisation_id, team_id, token_sha256, issued_to, expires_at, created_by, created_by_name)
  values (t.organisation_id, t.id, encode(sha256(convert_to(token, 'UTF8')), 'hex'), private.field_text(p_data, 'issued_to', 160, true),
    now() + make_interval(days => days), auth.uid(), coalesce(private.member_name(), 'Office'))
  returning id into result;
  return jsonb_build_object('id', result, 'token', token);
end $$;
create function public.revoke_portal_link(p_link uuid) returns void
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links;
begin
  select * into l from public.subcontractor_portal_links where id = p_link and organisation_id = private.current_org() for update;
  if not found or not private.has_money_access() then raise exception 'Money access is required to manage subcontractors' using errcode='42501'; end if;
  if l.revoked_at is null then update public.subcontractor_portal_links set revoked_at = now(), revoked_by = auth.uid() where id = l.id; end if;
end $$;

create function public.create_agreement_version(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); result uuid; v_body text;
begin
  if org is null or not private.has_money_access() then raise exception 'Money access is required to manage subcontractors' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['version_label','title','body']);
  if jsonb_typeof(p_data->'body') is distinct from 'string' then raise exception 'The agreement text is missing' using errcode='22023'; end if;
  v_body := replace(p_data->>'body', E'\r\n', E'\n');
  if length(v_body) not between 500 and 120000 then raise exception 'The agreement text must be between 500 and 120,000 characters' using errcode='22023'; end if;
  if exists (select 1 from public.subcontractor_agreement_versions where organisation_id = org and version_label = private.field_text(p_data, 'version_label', 40, true)) then
    raise exception 'That version label is already used. Give this version a new label.' using errcode='23505'; end if;
  insert into public.subcontractor_agreement_versions(organisation_id, version_label, title, body, body_sha256, created_by, created_by_name)
  values (org, private.field_text(p_data, 'version_label', 40, true), private.field_text(p_data, 'title', 200, true), v_body,
    encode(sha256(convert_to(v_body, 'UTF8')), 'hex'), auth.uid(), coalesce(private.member_name(), 'Office'))
  returning id into result;
  return result;
end $$;
-- Publishing is the owner's decision and needs the legal review on record: who reviewed it and when.
create function public.publish_agreement_version(p_version uuid, p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v public.subcontractor_agreement_versions; v_on date;
begin
  select * into v from public.subcontractor_agreement_versions where id = p_version and organisation_id = private.current_org() for update;
  if not found or not private.is_owner() then raise exception 'Only the owner can publish a subcontractor agreement' using errcode='42501'; end if;
  perform private.only_keys(p_data, array['legal_reviewed_by','legal_reviewed_on','legal_review_note']);
  if v.status <> 'draft' then raise exception 'Only a draft can be published' using errcode='22023'; end if;
  v_on := private.field_date(p_data, 'legal_reviewed_on', true);
  if v_on > private.site_today() then raise exception 'The legal review date cannot be in the future' using errcode='22023'; end if;
  if length(coalesce(private.field_text(p_data, 'legal_reviewed_by', 200, true), '')) < 2 then raise exception 'Record who carried out the legal review' using errcode='22023'; end if;
  update public.subcontractor_agreement_versions set status = 'published', legal_reviewed_by = private.field_text(p_data, 'legal_reviewed_by', 200, true),
    legal_reviewed_on = v_on, legal_review_note = nullif(private.field_text(p_data, 'legal_review_note', 2000), ''), published_at = now(), published_by = auth.uid()
  where id = v.id;
end $$;
create function public.withdraw_agreement_version(p_version uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.subcontractor_agreement_versions;
begin
  select * into v from public.subcontractor_agreement_versions where id = p_version and organisation_id = private.current_org() for update;
  if not found or not private.is_owner() then raise exception 'Only the owner can withdraw a subcontractor agreement' using errcode='42501'; end if;
  if v.status = 'withdrawn' then return; end if;
  if v.status <> 'published' then raise exception 'Only a published version can be withdrawn' using errcode='22023'; end if;
  update public.subcontractor_agreement_versions set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid() where id = v.id;
end $$;

-- Issue the published agreement to a subcontractor for signature. An earlier unsigned copy is withdrawn.
create function public.issue_subcontractor_agreement(p_team uuid, p_version uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.teams := private.require_subcontractor_admin(p_team); v public.subcontractor_agreement_versions; p public.subcontractor_tax_profiles;
  b public.organisation_billing_profiles; result uuid; org_name text;
begin
  select * into v from public.subcontractor_agreement_versions where id = p_version and organisation_id = t.organisation_id;
  if not found or v.status <> 'published' then raise exception 'Choose a published agreement version. A draft must have its legal review recorded first.' using errcode='22023'; end if;
  select * into p from public.subcontractor_tax_profiles where team_id = t.id;
  if not found then raise exception 'Record the subcontractor''s business details before issuing the agreement' using errcode='22023'; end if;
  select * into b from public.organisation_billing_profiles where organisation_id = t.organisation_id;
  select name into org_name from public.organisations where id = t.organisation_id;
  perform pg_advisory_xact_lock(hashtextextended('tilespec-subcontractor-agreement:' || t.id::text, 0));
  update public.subcontractor_agreements set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid(), withdraw_reason = 'Replaced by a newly issued agreement'
    where team_id = t.id and status = 'issued';
  insert into public.subcontractor_agreements(organisation_id, team_id, version_id, reference, version_label, title, body, body_sha256, parties, issued_by, issued_by_name)
  values (t.organisation_id, t.id, v.id, 'SA-' || lpad(nextval('private.subcontractor_agreement_reference_seq')::text, 5, '0'), v.version_label, v.title, v.body, v.body_sha256,
    jsonb_build_object(
      'contractor', jsonb_build_object('name', coalesce(b.legal_name, b.trading_name, org_name), 'trading_name', b.trading_name, 'address', b.registered_address,
        'company_number', b.company_number),
      'subcontractor', jsonb_build_object('name', p.legal_name, 'trading_name', p.trading_name, 'address', p.address, 'company_number', p.company_number,
        'business_type', p.business_type, 'team', t.name)),
    auth.uid(), coalesce(private.member_name(), 'Office'))
  returning id into result;
  return result;
end $$;
create function public.withdraw_subcontractor_agreement(p_agreement uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.subcontractor_agreements;
begin
  select * into a from public.subcontractor_agreements where id = p_agreement and organisation_id = private.current_org() for update;
  if not found or not private.has_money_access() then raise exception 'Money access is required to manage subcontractors' using errcode='42501'; end if;
  if a.status = 'withdrawn' then return; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason' using errcode='22023'; end if;
  update public.subcontractor_agreements set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = auth.uid(), withdraw_reason = trim(p_reason) where id = a.id;
end $$;

-- A gang on a job, now with its agreed retention percentage. Otherwise exactly as before.
create or replace function public.save_gang_subcontract(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); c uuid; t uuid; existing public.gang_subcontracts; result uuid; v_cycle text;
  v_weekday integer; v_days integer; v_anchor date; v_note text; v_active boolean; v_version integer; team public.teams; v_retention numeric;
begin
  perform private.only_keys(p_data, array['contract_id','team_id','payment_cycle','pay_weekday','payment_days','cycle_anchor','terms_note','active','version','retention_percent']);
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
  v_retention := case when p_data ? 'retention_percent' and p_data->'retention_percent' <> 'null'::jsonb then private.field_decimal(p_data, 'retention_percent', 0, 10) end;
  perform pg_advisory_xact_lock(hashtextextended('tilespec-gang-subcontract:' || c::text || ':' || t::text, 0));
  select * into existing from public.gang_subcontracts where organisation_id = org and contract_id = c and team_id = t for update;
  if not found then
    if not team.active then raise exception 'That gang is inactive' using errcode='22023'; end if;
    insert into public.gang_subcontracts(organisation_id, contract_id, team_id, payment_cycle, pay_weekday, payment_days, cycle_anchor,
      terms_note, active, created_by, retention_percent)
    values (org, c, t, v_cycle, v_weekday, v_days, v_anchor, v_note, v_active, auth.uid(), coalesce(v_retention, 0)) returning id into result;
    return result;
  end if;
  v_version := private.field_integer(p_data, 'version', 1, 1000000);
  if v_version is null then
    raise exception 'This gang is already set up on this job. Change its terms in the list instead.' using errcode='22023'; end if;
  if v_version is distinct from existing.version then
    raise exception 'These terms were changed by someone else. Refresh and try again.' using errcode='40001'; end if;
  update public.gang_subcontracts set payment_cycle = v_cycle, pay_weekday = v_weekday, payment_days = v_days, cycle_anchor = v_anchor,
    terms_note = v_note, active = v_active, retention_percent = coalesce(v_retention, existing.retention_percent),
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = existing.id;
  return existing.id;
end $$;

-- Agreed rates, now including day and hourly rates (which apply across the job, not to one area).
create or replace function public.save_gang_rate(p_request_key uuid, p_data jsonb) returns uuid
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
  perform private.assert_choice(v_unit, 'unit', array['m2','lm','item','day','hour']);
  if v_unit in ('day','hour') and v_area is not null then raise exception 'A day or hourly rate applies across the job. Leave the area as every area.' using errcode='22023'; end if;
  insert into public.gang_rates(organisation_id, contract_id, subcontract_id, team_id, work_area_id, unit, rate, description,
    effective_from, created_by, created_by_name, request_key)
  values (org, s.contract_id, s.id, s.team_id, v_area, v_unit, private.field_decimal(p_data, 'rate', 0.01, 100000),
    coalesce(private.field_text(p_data, 'description', 200), ''), coalesce(private.field_date(p_data, 'effective_from'), private.site_today()),
    auth.uid(), coalesce(private.member_name(), 'Office'), p_request_key)
  returning id into result;
  perform private.record_request(org, 'save_gang_rate', p_request_key, p_data, result);
  return result;
end $$;

-- A variation the office has approved for a subcontractor on a job, at an agreed sum.
create function public.save_gang_variation(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); s public.gang_subcontracts; result uuid; v_on date;
begin
  perform private.only_keys(p_data, array['subcontract_id','description','amount','instructed_on']);
  select * into s from public.gang_subcontracts where id = private.field_uuid(p_data, 'subcontract_id', true) and organisation_id = org;
  if not found or not private.can_view_financials(s.contract_id) then raise exception 'Money access is required to approve a variation' using errcode='42501'; end if;
  result := private.request_result(org, 'save_gang_variation', p_request_key, p_data);
  if result is not null then return result; end if;
  v_on := coalesce(private.field_date(p_data, 'instructed_on'), private.site_today());
  if v_on > private.site_today() then raise exception 'The instruction date cannot be in the future' using errcode='22023'; end if;
  if length(coalesce(private.field_text(p_data, 'description', 500, true), '')) < 3 then raise exception 'Describe the variation' using errcode='22023'; end if;
  insert into public.gang_variations(organisation_id, contract_id, subcontract_id, team_id, reference, description, amount, instructed_on, created_by, created_by_name, request_key)
  values (org, s.contract_id, s.id, s.team_id, 'SV-' || lpad(nextval('private.gang_variation_reference_seq')::text, 5, '0'),
    private.field_text(p_data, 'description', 500, true), private.field_decimal(p_data, 'amount', 0.01, 10000000), v_on, auth.uid(),
    coalesce(private.member_name(), 'Office'), p_request_key)
  returning id into result;
  perform private.record_request(org, 'save_gang_variation', p_request_key, p_data, result);
  return result;
end $$;
create function public.withdraw_gang_variation(p_variation uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.gang_variations;
begin
  select * into v from public.gang_variations where id = p_variation and organisation_id = private.current_org() for update;
  if not found or not private.can_view_financials(v.contract_id) then raise exception 'Money access is required' using errcode='42501'; end if;
  if v.withdrawn_at is not null then return; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason' using errcode='22023'; end if;
  if private.gang_variation_used(v.id) > 0 then raise exception 'This variation has already been claimed on an invoice, so it cannot be withdrawn' using errcode='22023'; end if;
  update public.gang_variations set withdrawn_at = now(), withdrawn_by = auth.uid(), withdraw_reason = trim(p_reason) where id = v.id;
end $$;

-- Paying retention that was held. Never more than is held; CIS is taken at the rate now verified.
create function public.release_gang_retention(p_request_key uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid := private.current_org(); s public.gang_subcontracts; p public.subcontractor_tax_profiles; result uuid; v_amount numeric; v_rate numeric; v_on date; v_cis numeric;
begin
  perform private.only_keys(p_data, array['subcontract_id','amount','released_on','payment_reference','note']);
  select * into s from public.gang_subcontracts where id = private.field_uuid(p_data, 'subcontract_id', true) and organisation_id = org;
  if not found or not private.can_view_financials(s.contract_id) then raise exception 'Money access is required to release retention' using errcode='42501'; end if;
  result := private.request_result(org, 'release_gang_retention', p_request_key, p_data);
  if result is not null then return result; end if;
  perform private.lock_gang_ledger(s.contract_id, s.team_id);
  v_amount := private.field_decimal(p_data, 'amount', 0.01, 10000000);
  if v_amount > private.gang_retention_held(s.id) then
    raise exception 'Only % is held in retention for this subcontractor on this job', to_char(private.gang_retention_held(s.id), 'FM£999G999G990D00') using errcode='22023'; end if;
  select * into p from public.subcontractor_tax_profiles where team_id = s.team_id;
  v_rate := private.cis_rate(p.cis_status);
  if v_rate is null then raise exception 'Verify the subcontractor''s CIS status with HMRC and record it before paying retention' using errcode='22023'; end if;
  v_on := coalesce(private.field_date(p_data, 'released_on'), private.site_today());
  if v_on > private.site_today() then raise exception 'Record a release once it has been paid' using errcode='22023'; end if;
  v_cis := round(v_amount * v_rate / 100, 2);
  insert into public.gang_retention_releases(organisation_id, contract_id, subcontract_id, team_id, amount, cis_rate, cis_amount, net_paid, released_on,
    payment_reference, note, recorded_by, recorded_by_name, request_key)
  values (org, s.contract_id, s.id, s.team_id, v_amount, v_rate, v_cis, v_amount - v_cis, v_on, nullif(private.field_text(p_data, 'payment_reference', 120), ''),
    nullif(private.field_text(p_data, 'note', 1000), ''), auth.uid(), coalesce(private.member_name(), 'Office'), p_request_key)
  returning id into result;
  perform private.record_request(org, 'release_gang_retention', p_request_key, p_data, result);
  return result;
end $$;
create function public.void_gang_retention_release(p_release uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.gang_retention_releases;
begin
  select * into r from public.gang_retention_releases where id = p_release and organisation_id = private.current_org() for update;
  if not found or not private.can_view_financials(r.contract_id) then raise exception 'Money access is required' using errcode='42501'; end if;
  if r.voided_at is not null then return; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason' using errcode='22023'; end if;
  update public.gang_retention_releases set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = r.id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 9. The portal. Every function takes the link's secret and sees one subcontractor only.
-- ---------------------------------------------------------------------------------------------
-- Prices a claim from the office's records. The caller supplies quantities and descriptions; a
-- supplied rate is not a recognised field and is refused. Returns the fixed snapshot of the claim.
create function private.price_portal_claim(l public.subcontractor_portal_links, p_data jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid := l.organisation_id; t uuid := l.team_id; c uuid; s public.gang_subcontracts; p public.subcontractor_tax_profiles;
  b public.organisation_billing_profiles; k public.contracts; team public.teams; org_name text; v_mode text; v_end date; v_start date; v_date date; v_number text;
  item jsonb; v_area public.work_areas; v_unit text; v_qty numeric; v_rate numeric; v_amount numeric; v_text text;
  lines jsonb := '[]'; days jsonb := '[]'; vars jsonb := '[]'; adds jsonb := '[]'; seen text[] := '{}';
  t_measured numeric := 0; t_days numeric := 0; t_vars numeric := 0; t_adds numeric := 0; net numeric; stated numeric; base numeric;
  vat_treatment text := 'none'; vat numeric := 0; reverse numeric := 0; r public.gang_rates; gv public.gang_variations; used numeric; dup text;
  replaced public.gang_invoices; ret numeric; v_cis_rate numeric; cis numeric; today date := private.site_today(); bank_ending text; self_billed boolean := false;
begin
  perform private.only_keys(p_data, array['mode','contract_id','period_start','period_end','invoice_number','invoice_date','invoice_total','note',
    'lines','day_rates','variations','additional','replaces_invoice_id']);
  v_mode := coalesce(nullif(private.field_text(p_data, 'mode', 20), ''), 'generated');
  perform private.assert_choice(v_mode, 'mode', array['generated','upload']);
  c := private.field_uuid(p_data, 'contract_id', true);
  select * into s from public.gang_subcontracts where organisation_id = org and contract_id = c and team_id = t and active;
  if not found then raise exception 'You are not set up on this job. Ask TileSpec.' using errcode='42501'; end if;
  select * into k from public.contracts where id = c;
  select * into team from public.teams where id = t;
  select * into p from public.subcontractor_tax_profiles where team_id = t;
  select * into b from public.organisation_billing_profiles where organisation_id = org;
  select name into org_name from public.organisations where id = org;
  if not private.has_signed_agreement(t) then
    raise exception 'Sign your subcontractor agreement before sending an invoice' using errcode='42501'; end if;
  if v_mode = 'generated' then
    if p.id is null then raise exception 'TileSpec has not finished recording your business details. Ask the office, or upload your own invoice instead.' using errcode='22023'; end if;
    -- A VAT invoice prepared with the customer's system is treated as self-billing: it needs an agreement in force.
    if p.vat_registered and not private.self_billing_current(p) then
      raise exception 'You are VAT registered, so TileSpec needs a self-billing agreement with you before invoices can be created here. Upload your own invoice instead.' using errcode='22023'; end if;
    self_billed := p.vat_registered;
  end if;

  v_end := coalesce(private.field_date(p_data, 'period_end'), today);
  v_start := private.field_date(p_data, 'period_start');
  if v_end > today then raise exception 'The invoice cannot be for work after today' using errcode='22023'; end if;
  if v_start is not null and v_start > v_end then raise exception 'The period must start before it ends' using errcode='22023'; end if;
  v_date := coalesce(private.field_date(p_data, 'invoice_date'), today);
  if v_date > today or v_date < today - 366 then raise exception 'Check the invoice date' using errcode='22023'; end if;
  v_number := nullif(private.field_text(p_data, 'invoice_number', 60), '');
  if v_number is null then raise exception 'Enter the invoice number' using errcode='22023'; end if;
  if private.field_uuid(p_data, 'replaces_invoice_id') is not null then
    select * into replaced from public.gang_invoices where id = private.field_uuid(p_data, 'replaces_invoice_id');
    if not found or replaced.team_id <> t or replaced.contract_id <> c or replaced.status <> 'returned' then
      raise exception 'Only an invoice returned to you for correction can be replaced' using errcode='22023'; end if;
  end if;
  select i.reference into dup from public.gang_invoice_commercials ci join public.gang_invoices i on i.id = ci.invoice_id
  where i.team_id = t and lower(ci.invoice_number) = lower(v_number) and i.status not in ('cancelled','superseded') and i.id is distinct from replaced.id limit 1;
  if found then raise exception 'Invoice number % has already been sent (%)', v_number, dup using errcode='22023'; end if;

  -- Measured work at the agreed rate for each area.
  if p_data ? 'lines' and p_data->'lines' <> 'null'::jsonb then
    if jsonb_typeof(p_data->'lines') <> 'array' or jsonb_array_length(p_data->'lines') > 20 then
      raise exception 'Claim up to twenty work areas on one invoice' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(p_data->'lines') loop
      if jsonb_typeof(item) <> 'object' then raise exception 'Each line needs a work area and a quantity' using errcode='22023'; end if;
      perform private.only_keys(item, array['work_area_id','unit','quantity']);
      select * into v_area from public.work_areas where id = private.field_uuid(item, 'work_area_id', true) and contract_id = c and organisation_id = org;
      if not found or v_area.archived_at is not null then raise exception 'Choose a work area on this job' using errcode='22023'; end if;
      v_unit := coalesce(nullif(private.field_text(item, 'unit', 4), ''), 'm2');
      perform private.assert_choice(v_unit, 'unit', array['m2','lm','item']);
      v_qty := private.gang_quantity(item->'quantity', v_area.name, 0.01);
      if (v_area.id::text || v_unit) = any(seen) then
        raise exception '% is listed twice. Put the total for each area on one line.', v_area.name using errcode='22023'; end if;
      seen := seen || (v_area.id::text || v_unit);
      -- The same completed work cannot be claimed again while an earlier claim for it is open.
      select i.reference into dup from public.gang_invoice_lines x join public.gang_invoices i on i.id = x.invoice_id
      where i.team_id = t and i.contract_id = c and x.work_area_id = v_area.id and x.unit = v_unit
        and i.status in ('uploading','awaiting_check','with_office','query_gang') limit 1;
      if found then raise exception 'You have already claimed % on invoice %, which is still being checked. Wait for it, or withdraw it first.',
        private.gang_area_name(v_area.id), dup using errcode='22023'; end if;
      v_rate := private.gang_rate_for(s.id, v_area.id, v_unit, v_end);
      if v_rate is null and v_mode = 'generated' then
        raise exception 'TileSpec has not recorded an agreed rate for % (%). Ask the office to add it, or upload your own invoice.',
          private.gang_area_name(v_area.id), private.unit_label(v_unit) using errcode='22023'; end if;
      v_amount := round(v_qty * v_rate, 2);
      t_measured := t_measured + coalesce(v_amount, 0);
      lines := lines || jsonb_build_object('work_area_id', v_area.id, 'area', private.gang_area_name(v_area.id), 'unit', v_unit, 'quantity', v_qty,
        'rate', v_rate, 'amount', v_amount);
    end loop;
  end if;

  -- Day rate work at one of the agreed day or hourly rates.
  if p_data ? 'day_rates' and p_data->'day_rates' <> 'null'::jsonb then
    if jsonb_typeof(p_data->'day_rates') <> 'array' or jsonb_array_length(p_data->'day_rates') > 10 then
      raise exception 'Add up to ten day rate lines' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(p_data->'day_rates') loop
      perform private.only_keys(item, array['rate_id','quantity','description']);
      select * into r from public.gang_rates where id = private.field_uuid(item, 'rate_id', true) and subcontract_id = s.id and unit in ('day','hour')
        and voided_at is null and effective_from <= v_end;
      if not found then raise exception 'Choose one of your agreed day rates. If none is listed, ask TileSpec.' using errcode='22023'; end if;
      v_qty := private.gang_quantity(item->'quantity', 'day rate work', 0.01);
      if (r.unit = 'day' and v_qty > 62) or v_qty > 744 then raise exception 'Check the number of % claimed', case r.unit when 'day' then 'days' else 'hours' end using errcode='22023'; end if;
      v_text := coalesce(private.field_text(item, 'description', 300), '');
      if length(v_text) < 3 then raise exception 'Say what the day rate work was' using errcode='22023'; end if;
      v_amount := round(v_qty * r.rate, 2);
      t_days := t_days + v_amount;
      days := days || jsonb_build_object('rate_id', r.id, 'unit', r.unit, 'rate_description', nullif(r.description, ''), 'description', v_text,
        'quantity', v_qty, 'rate', r.rate, 'amount', v_amount);
    end loop;
  end if;

  -- Approved variations, never beyond what is left of the agreed sum.
  if p_data ? 'variations' and p_data->'variations' <> 'null'::jsonb then
    if jsonb_typeof(p_data->'variations') <> 'array' or jsonb_array_length(p_data->'variations') > 10 then
      raise exception 'Add up to ten variations' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(p_data->'variations') loop
      perform private.only_keys(item, array['variation_id','amount']);
      select * into gv from public.gang_variations where id = private.field_uuid(item, 'variation_id', true) and subcontract_id = s.id and withdrawn_at is null;
      if not found then raise exception 'Choose one of your approved variations' using errcode='22023'; end if;
      if gv.id::text = any(seen) then raise exception 'Variation % is listed twice', gv.reference using errcode='22023'; end if;
      seen := seen || gv.id::text;
      v_amount := private.field_decimal(item, 'amount', 0.01, 10000000);
      used := private.gang_variation_used(gv.id);
      if v_amount > gv.amount - used then
        raise exception 'Only % of variation % is left to claim', to_char(greatest(gv.amount - used, 0), 'FM£999G999G990D00'), gv.reference using errcode='22023'; end if;
      t_vars := t_vars + v_amount;
      vars := vars || jsonb_build_object('variation_id', gv.id, 'reference', gv.reference, 'description', gv.description, 'agreed', gv.amount,
        'previously_claimed', used, 'amount', v_amount);
    end loop;
  end if;

  -- Additional work the office has not approved. Kept apart from approved variations throughout.
  if p_data ? 'additional' and p_data->'additional' <> 'null'::jsonb then
    if jsonb_typeof(p_data->'additional') <> 'array' or jsonb_array_length(p_data->'additional') > 10 then
      raise exception 'Add up to ten additional items' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(p_data->'additional') loop
      perform private.only_keys(item, array['description','amount']);
      v_text := coalesce(private.field_text(item, 'description', 500), '');
      if length(v_text) < 5 then raise exception 'Describe the additional work and who asked for it' using errcode='22023'; end if;
      v_amount := private.field_decimal(item, 'amount', 0.01, 10000000);
      t_adds := t_adds + v_amount;
      adds := adds || jsonb_build_object('description', v_text, 'amount', v_amount);
    end loop;
  end if;

  if jsonb_array_length(lines) + jsonb_array_length(days) + jsonb_array_length(vars) + jsonb_array_length(adds) = 0 then
    raise exception 'Say what work this invoice is for: a work area and quantity, day rate work, a variation or additional work' using errcode='22023'; end if;
  if jsonb_array_length(days) + jsonb_array_length(vars) + jsonb_array_length(adds) > 20 then
    raise exception 'Too many extra items on one invoice' using errcode='22023'; end if;

  net := t_measured + t_days + t_vars + t_adds;
  if v_mode = 'upload' then
    stated := private.field_decimal(p_data, 'invoice_total', 0.01, 10000000);
    base := stated;
  else
    if p_data ? 'invoice_total' and p_data->'invoice_total' <> 'null'::jsonb then
      raise exception 'The invoice total is worked out from your agreed rates and cannot be entered' using errcode='22023'; end if;
    if net <= 0 then raise exception 'The invoice has no value' using errcode='22023'; end if;
    base := net;
  end if;
  if p.vat_registered then
    if p.vat_reverse_charge then vat_treatment := 'reverse_charge'; reverse := round(base * 20 / 100, 2);
    else vat_treatment := 'standard'; vat := round(base * 20 / 100, 2); end if;
  end if;
  -- An estimate of the payment, for information. Deductions are decided at approval, never here.
  ret := round(base * s.retention_percent / 100, 2);
  v_cis_rate := private.cis_rate(p.cis_status);
  cis := round((base - ret) * coalesce(v_cis_rate, 0) / 100, 2);
  select right(d.account_number, 4) into bank_ending from public.subcontractor_bank_details d where d.team_id = t;

  return jsonb_build_object(
    'mode', v_mode, 'self_billed', self_billed, 'reference', null,
    'issuer', jsonb_build_object('name', coalesce(p.legal_name, team.name), 'trading_name', p.trading_name, 'address', p.address, 'email', p.email, 'phone', p.phone,
      'company_number', p.company_number, 'vat_number', p.vat_number, 'bank_ending', bank_ending),
    'customer', jsonb_build_object('name', coalesce(b.legal_name, b.trading_name, org_name), 'address', b.registered_address,
      'vat_number', case when b.vat_registered then b.vat_number end),
    'contract', jsonb_build_object('id', k.id, 'reference', k.reference, 'name', k.name, 'address', nullif(k.address, '')),
    'invoice_number', v_number, 'invoice_date', v_date, 'period_start', v_start, 'period_end', v_end,
    'note', nullif(coalesce(private.field_text(p_data, 'note', 2000), ''), ''),
    'replaces_invoice_id', replaced.id,
    'lines', lines, 'day_rates', days, 'variations', vars, 'additional', adds,
    'totals', jsonb_build_object('measured', t_measured, 'day_rates', t_days, 'variations', t_vars, 'additional', t_adds, 'priced', net,
      'net', base, 'vat_treatment', vat_treatment, 'vat_rate', case when vat_treatment = 'none' then 0 else 20 end, 'vat', vat, 'vat_reverse_charge', reverse,
      'gross', base + vat),
    'estimate', jsonb_build_object('retention_percent', s.retention_percent, 'retention', ret, 'cis_status', coalesce(p.cis_status, 'unverified'),
      'cis_rate', v_cis_rate, 'cis', case when v_cis_rate is null then null else cis end,
      'payable', case when v_cis_rate is null then null else base - ret + vat - cis end),
    'payment', jsonb_build_object('due_on', private.gang_payment_due(s.payment_cycle, s.pay_weekday, s.payment_days, s.cycle_anchor, today),
      'cycle', s.payment_cycle, 'pay_weekday', s.pay_weekday, 'payment_days', s.payment_days));
end $$;

-- Everything the portal shows one subcontractor: who they are, their agreement, their jobs with
-- agreed rates and what has been claimed before, and their own invoices. Never bank numbers,
-- never another subcontractor, never job finances.
create function public.portal_session(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); team public.teams; p public.subcontractor_tax_profiles; a public.subcontractor_agreements;
  signed boolean; today date := private.site_today(); generator_reason text; org_name text;
begin
  select * into team from public.teams where id = l.team_id;
  select * into p from public.subcontractor_tax_profiles where team_id = l.team_id;
  select coalesce(b.trading_name, b.legal_name, o.name) into org_name from public.organisations o
    left join public.organisation_billing_profiles b on b.organisation_id = o.id where o.id = l.organisation_id;
  -- The agreement waiting for signature, otherwise the latest signed one.
  select * into a from public.subcontractor_agreements x where x.team_id = l.team_id and x.status in ('issued','signed')
    order by (x.status = 'issued') desc, x.signed_at desc nulls last limit 1;
  signed := private.has_signed_agreement(l.team_id);
  generator_reason := case
    when not signed then 'Sign your subcontractor agreement first.'
    when p.id is null then 'TileSpec has not finished recording your business details. You can upload your own invoice.'
    when p.vat_registered and not private.self_billing_current(p) then 'You are VAT registered, so a self-billing agreement is needed before invoices can be created here. You can upload your own invoice.'
  end;
  return jsonb_build_object(
    'organisation', org_name,
    'subcontractor', jsonb_build_object('team_id', team.id, 'name', coalesce(p.legal_name, team.name), 'issued_to', l.issued_to, 'address', p.address,
      'vat_registered', coalesce(p.vat_registered, false), 'cis_status', coalesce(p.cis_status, 'unverified'), 'details_recorded', p.id is not null,
      'bank_ending', (select right(d.account_number, 4) from public.subcontractor_bank_details d where d.team_id = l.team_id)),
    'link', jsonb_build_object('expires_at', l.expires_at),
    'agreement', case when a.id is null then null else jsonb_build_object('id', a.id, 'reference', a.reference, 'status', a.status, 'title', a.title,
      'version_label', a.version_label, 'issued_at', a.issued_at, 'signed_at', a.signed_at, 'signer_name', a.signer_name) end,
    'agreement_signed', signed,
    'can_invoice', signed,
    'generator', jsonb_build_object('allowed', generator_reason is null, 'reason', generator_reason),
    'next_invoice_number', lpad(((select count(*) from public.gang_invoices i where i.team_id = l.team_id and i.source = 'generated'
      and i.status not in ('cancelled')) + 1)::text, 4, '0'),
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object(
        'contract_id', c.id, 'subcontract_id', s.id, 'reference', c.reference, 'name', c.name, 'address', nullif(c.address, ''),
        'payment_cycle', s.payment_cycle, 'pay_weekday', s.pay_weekday, 'payment_days', s.payment_days, 'cycle_anchor', s.cycle_anchor,
        'retention_percent', s.retention_percent,
        'areas', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', private.gang_area_name(w.id),
            'rates', jsonb_build_object('m2', private.gang_rate_for(s.id, w.id, 'm2', today), 'lm', private.gang_rate_for(s.id, w.id, 'lm', today),
              'item', private.gang_rate_for(s.id, w.id, 'item', today)))
            order by private.gang_area_name(w.id)), '[]') from public.work_areas w where w.contract_id = c.id and w.archived_at is null),
        'claimed', (select coalesce(jsonb_agg(jsonb_build_object('work_area_id', g.work_area_id, 'unit', g.unit, 'approved', g.approved,
            'in_progress', g.verified + g.claimed, 'correction', g.correction)), '[]') from private.gang_ledger(c.id, s.team_id) g),
        'day_rates', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'unit', r.unit, 'rate', r.rate, 'description', nullif(r.description, ''))
            order by r.unit, r.description, r.effective_from desc), '[]') from public.gang_rates r
          where r.subcontract_id = s.id and r.unit in ('day','hour') and r.voided_at is null and r.effective_from <= today),
        'variations', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'reference', v.reference, 'description', v.description, 'amount', v.amount,
            'claimed', private.gang_variation_used(v.id), 'remaining', greatest(v.amount - private.gang_variation_used(v.id), 0)) order by v.reference), '[]')
          from public.gang_variations v where v.subcontract_id = s.id and v.withdrawn_at is null))
        order by c.name), '[]')
      from public.gang_subcontracts s join public.contracts c on c.id = s.contract_id
      where s.team_id = l.team_id and s.active),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'reference', i.reference, 'status', i.status, 'source', i.source, 'contract_id', i.contract_id, 'job', c.name,
        'submitted_at', i.submitted_at, 'submitted_by', i.submitted_by_name, 'period_start', i.period_start, 'period_end', i.period_end, 'note', i.gang_note,
        'workmanship', i.workmanship, 'correction_note', case when i.workmanship = 'correction_needed' then i.correction_note end,
        'invoice_number', ci.invoice_number, 'invoice_date', ci.invoice_date, 'invoice_total', ci.invoice_total,
        'payment_due_on', coalesce(ci.agreed_payment_on, ci.payment_due_on),
        'approved_amount', case when i.status in ('approved','paid') then ci.approved_amount end,
        'payment', case when i.status in ('approved','paid') and ci.net_payable is not null then jsonb_build_object('vat_treatment', ci.vat_treatment,
          'vat', ci.vat_amount, 'retention_percent', ci.retention_percent, 'retention', ci.retention_amount, 'cis_rate', ci.cis_rate,
          'cis_materials', ci.cis_materials, 'cis', ci.cis_amount, 'payable', ci.net_payable,
          'adjustment', ci.adjustment_amount, 'adjustment_reason', ci.adjustment_reason) end,
        'paid_on', ci.paid_on, 'paid_amount', ci.paid_amount,
        'replaces', (select x.reference from public.gang_invoices x where x.id = i.replaces_invoice_id),
        'has_document', exists (select 1 from public.gang_invoice_files f where f.invoice_id = i.id and f.kind = 'invoice' and f.uploaded_at is not null),
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('area', private.gang_area_name(x.work_area_id), 'work_area_id', x.work_area_id, 'unit', x.unit,
            'claimed', x.claimed_quantity,
            'verified', case when i.status in ('with_office','query_gang','approved','paid','returned','rejected') then x.verified_quantity end,
            'approved', x.approved_quantity) order by x.line_no), '[]') from public.gang_invoice_lines x where x.invoice_id = i.id),
        'extras', (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'unit', e.unit, 'description', e.description, 'quantity', e.claimed_quantity,
            'amount', e.claimed_amount, 'variation_id', e.variation_id,
            'confirmed', case when i.status in ('with_office','query_gang','approved','paid','returned','rejected') then e.confirmed_quantity end,
            'approved_amount', case when i.status in ('approved','paid') then e.approved_amount end) order by e.line_no), '[]')
          from public.gang_invoice_extras e where e.invoice_id = i.id),
        'events', (select coalesce(jsonb_agg(jsonb_build_object('at', ev.created_at, 'action', ev.action, 'by', ev.actor_name, 'note', ev.note,
            'to_status', ev.to_status) order by ev.id), '[]') from public.gang_invoice_events ev where ev.invoice_id = i.id and ev.visibility = 'all'))
        order by i.submitted_at desc), '[]')
      from public.gang_invoices i join public.contracts c on c.id = i.contract_id
        left join public.gang_invoice_commercials ci on ci.invoice_id = i.id
      where i.team_id = l.team_id and i.organisation_id = l.organisation_id));
end $$;

-- What the invoice would be, without saving anything.
create function public.portal_preview_invoice(p_token text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token);
begin
  return private.price_portal_claim(l, p_data);
end $$;

-- Saves the claim (not yet sent) and returns its fixed snapshot. The invoice is sent when its
-- document has been stored and confirmed, exactly as for a signed-in gang. A retry with the same
-- request key returns the same invoice.
create function public.portal_prepare_invoice(p_token text, p_request_key uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); inv public.gang_invoices; stale public.gang_invoices; snap jsonb; s public.gang_subcontracts;
  item jsonb; n integer; c uuid;
begin
  if p_request_key is null then raise exception 'A request key is required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tilespec-gang-invoice:' || l.team_id::text, 0));
  select * into inv from public.gang_invoices where portal_link_id = l.id and request_key = p_request_key;
  if found then
    return jsonb_build_object('invoice_id', inv.id, 'reference', inv.reference, 'status', inv.status,
      'snapshot', (select ci.claim_breakdown from public.gang_invoice_commercials ci where ci.invoice_id = inv.id));
  end if;
  -- An earlier attempt whose document never arrived is withdrawn so it cannot block this one.
  for stale in select * from public.gang_invoices where team_id = l.team_id and portal_link_id is not null and status = 'uploading'
    and submitted_at < now() - interval '30 minutes' for update loop
    update public.gang_invoices set status = 'cancelled', version = version + 1 where id = stale.id returning * into stale;
    perform private.gang_event(stale, 'cancelled', 'uploading', 'Not finished: the invoice document never arrived');
  end loop;
  if (select count(*) from public.gang_invoices where team_id = l.team_id and submitted_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many invoices have been started today. Ask TileSpec.' using errcode='53400'; end if;

  snap := private.price_portal_claim(l, p_data);
  c := (snap #>> '{contract,id}')::uuid;
  select * into s from public.gang_subcontracts where organisation_id = l.organisation_id and contract_id = c and team_id = l.team_id;
  insert into public.gang_invoices(organisation_id, contract_id, team_id, subcontract_id, reference, status, routed_to, assigned_supervisor_id,
    period_start, period_end, gang_note, submitted_by, submitted_by_name, request_key, replaces_invoice_id, portal_link_id, source)
  values (l.organisation_id, c, l.team_id, s.id, 'GI-' || lpad(nextval('private.gang_invoice_reference_seq')::text, 5, '0'), 'uploading',
    case when cardinality(private.job_supervisors(c)) > 0 then 'supervisor' else 'office' end,
    case when cardinality(private.job_supervisors(c)) = 1 then (private.job_supervisors(c))[1] end,
    (snap->>'period_start')::date, (snap->>'period_end')::date, coalesce(snap->>'note', ''), null, l.issued_to, p_request_key,
    (snap->>'replaces_invoice_id')::uuid, l.id, snap->>'mode')
  returning * into inv;
  snap := snap || jsonb_build_object('reference', inv.reference);

  n := 0;
  for item in select * from jsonb_array_elements(snap->'lines') loop
    n := n + 1;
    insert into public.gang_invoice_lines(organisation_id, contract_id, invoice_id, team_id, line_no, work_area_id, unit, claimed_quantity, description)
    values (l.organisation_id, c, inv.id, l.team_id, n, (item->>'work_area_id')::uuid, item->>'unit', (item->>'quantity')::numeric, '');
  end loop;
  n := 0;
  for item in select * from jsonb_array_elements(snap->'day_rates') loop
    n := n + 1;
    insert into public.gang_invoice_extras(organisation_id, contract_id, invoice_id, team_id, line_no, kind, unit, description, claimed_quantity, rate, claimed_amount)
    values (l.organisation_id, c, inv.id, l.team_id, n, 'day_rate', item->>'unit', item->>'description', (item->>'quantity')::numeric,
      (item->>'rate')::numeric, (item->>'amount')::numeric);
  end loop;
  for item in select * from jsonb_array_elements(snap->'variations') loop
    n := n + 1;
    insert into public.gang_invoice_extras(organisation_id, contract_id, invoice_id, team_id, line_no, kind, unit, description, claimed_quantity, claimed_amount, variation_id)
    values (l.organisation_id, c, inv.id, l.team_id, n, 'variation', 'sum', (item->>'reference') || ': ' || left(item->>'description', 480), 1,
      (item->>'amount')::numeric, (item->>'variation_id')::uuid);
  end loop;
  for item in select * from jsonb_array_elements(snap->'additional') loop
    n := n + 1;
    insert into public.gang_invoice_extras(organisation_id, contract_id, invoice_id, team_id, line_no, kind, unit, description, claimed_quantity, claimed_amount)
    values (l.organisation_id, c, inv.id, l.team_id, n, 'additional', 'sum', item->>'description', 1, (item->>'amount')::numeric);
  end loop;

  insert into public.gang_invoice_commercials(invoice_id, organisation_id, contract_id, invoice_number, invoice_total, payment_due_on, invoice_date, claim_breakdown)
  values (inv.id, l.organisation_id, c, snap->>'invoice_number', (snap #>> '{totals,net}')::numeric, (snap #>> '{payment,due_on}')::date,
    (snap->>'invoice_date')::date, snap);
  perform private.gang_event(inv, 'created', null, case when inv.source = 'generated' then 'Invoice created from agreed rates; document being prepared'
    else 'Invoice details saved; upload in progress' end, 'all', jsonb_build_object('source', inv.source, 'replaces', snap->>'replaces_invoice_id'));
  return jsonb_build_object('invoice_id', inv.id, 'reference', inv.reference, 'status', inv.status, 'snapshot', snap);
end $$;

-- Reserves the one path a file may be stored at: the invoice document, or a photograph of the work.
create function public.portal_reserve_file(p_token text, p_request_key uuid, p_invoice uuid, p_kind text, p_meta jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); inv public.gang_invoices; f public.gang_invoice_files; v_kind text; v_mime text;
  v_bytes bigint; v_sha text; v_id uuid; dup text;
begin
  perform private.only_keys(p_meta, array['mime_type','bytes','sha256']);
  perform private.assert_choice(p_kind, 'file kind', array['invoice','photo']);
  v_kind := case p_kind when 'invoice' then 'invoice' else 'gang_photo' end;
  select * into inv from public.gang_invoices where id = p_invoice and team_id = l.team_id and organisation_id = l.organisation_id;
  if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  select * into f from public.gang_invoice_files where portal_link_id = l.id and kind = v_kind and request_key = p_request_key;
  if found then
    if f.invoice_id <> inv.id then raise exception 'Invoice unavailable' using errcode='42501'; end if;
    return jsonb_build_object('file_id', f.id, 'object_path', f.object_path, 'mime_type', f.mime_type, 'uploaded', f.uploaded_at is not null);
  end if;
  v_mime := private.field_text(p_meta, 'mime_type', 40, true);
  v_bytes := private.field_integer(p_meta, 'bytes', 1, 4194304);
  v_sha := private.field_text(p_meta, 'sha256', 64, true);
  if v_bytes is null or v_sha !~ '^[0-9a-f]{64}$' then raise exception 'The file could not be read. Choose it again.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tilespec-gang-invoice:' || l.team_id::text, 0));
  if v_kind = 'invoice' then
    perform private.assert_choice(v_mime, 'file type', case when inv.source = 'generated' then array['application/pdf'] else array['application/pdf','image/jpeg','image/png'] end);
    if inv.status <> 'uploading' then raise exception 'This invoice has already been sent' using errcode='22023'; end if;
    select * into f from public.gang_invoice_files where invoice_id = inv.id and kind = 'invoice';
    if found then
      if f.sha256 <> v_sha then raise exception 'This invoice already has a different document. Withdraw it and start again.' using errcode='22023'; end if;
      return jsonb_build_object('file_id', f.id, 'object_path', f.object_path, 'mime_type', f.mime_type, 'uploaded', f.uploaded_at is not null);
    end if;
    -- The same document cannot be sent twice.
    select i.reference into dup from public.gang_invoice_files x join public.gang_invoices i on i.id = x.invoice_id
    where x.kind = 'invoice' and x.team_id = l.team_id and x.sha256 = v_sha and i.status not in ('cancelled','superseded')
      and i.id is distinct from inv.replaces_invoice_id limit 1;
    if found then raise exception 'This invoice has already been sent (%). It will not be sent twice.', dup using errcode='22023'; end if;
  else
    perform private.assert_choice(v_mime, 'photo type', array['image/jpeg','image/png']);
    if inv.status in ('paid','rejected','cancelled','superseded') then raise exception 'This invoice is closed' using errcode='22023'; end if;
    if (select count(*) from public.gang_invoice_files where invoice_id = inv.id and kind = 'gang_photo') >= 12 then
      raise exception 'Up to twelve photos can be added' using errcode='22023'; end if;
  end if;
  v_id := gen_random_uuid();
  insert into public.gang_invoice_files(id, organisation_id, contract_id, invoice_id, team_id, kind, object_path, mime_type, bytes, sha256, uploaded_by, request_key, portal_link_id)
  values (v_id, inv.organisation_id, inv.contract_id, inv.id, inv.team_id, v_kind,
    inv.organisation_id::text || '/' || inv.contract_id::text || '/' || inv.id::text || '/' || v_kind || '/' || v_id::text
      || case v_mime when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end,
    v_mime, v_bytes, v_sha, null, p_request_key, l.id)
  returning * into f;
  return jsonb_build_object('file_id', f.id, 'object_path', f.object_path, 'mime_type', f.mime_type, 'uploaded', false);
end $$;

create function public.portal_complete_file(p_token text, p_file uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); f public.gang_invoice_files; inv public.gang_invoices;
begin
  select * into f from public.gang_invoice_files where id = p_file for update;
  if not found or f.portal_link_id is null or f.team_id <> l.team_id or f.organisation_id <> l.organisation_id then
    raise exception 'File unavailable' using errcode='42501'; end if;
  perform private.finish_gang_file(f);
  select * into inv from public.gang_invoices where id = f.invoice_id;
  return jsonb_build_object('invoice_id', inv.id, 'reference', inv.reference, 'status', inv.status);
end $$;

-- One of the subcontractor's own invoices with its claim snapshot, for their copy.
create function public.portal_invoice(p_token text, p_invoice uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); inv public.gang_invoices; ci public.gang_invoice_commercials;
begin
  select * into inv from public.gang_invoices where id = p_invoice and team_id = l.team_id and organisation_id = l.organisation_id;
  if not found then return null; end if;
  select * into ci from public.gang_invoice_commercials where invoice_id = inv.id;
  return jsonb_build_object('id', inv.id, 'reference', inv.reference, 'status', inv.status, 'source', inv.source, 'submitted_at', inv.submitted_at,
    'invoice_number', ci.invoice_number, 'snapshot', ci.claim_breakdown);
end $$;

create function public.portal_cancel_invoice(p_token text, p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); inv public.gang_invoices; old_status text;
begin
  select * into inv from public.gang_invoices where id = p_invoice and team_id = l.team_id and organisation_id = l.organisation_id for update;
  if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  if inv.status = 'cancelled' then return; end if;
  if inv.status not in ('uploading','awaiting_check','query_gang','returned') then
    raise exception 'This invoice is with the office and can no longer be withdrawn' using errcode='22023'; end if;
  old_status := inv.status;
  update public.gang_invoices set status = 'cancelled', version = version + 1 where id = inv.id returning * into inv;
  perform private.close_gang_request(inv.id, 'cancelled');
  perform private.gang_event(inv, 'cancelled', old_status, coalesce(nullif(left(trim(coalesce(p_reason, '')), 500), ''), 'Withdrawn by the subcontractor'));
end $$;

create function public.portal_answer_query(p_token text, p_invoice uuid, p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); inv public.gang_invoices;
begin
  select * into inv from public.gang_invoices where id = p_invoice and team_id = l.team_id and organisation_id = l.organisation_id for update;
  if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  if inv.status <> 'query_gang' then raise exception 'There is no question waiting on this invoice' using errcode='22023'; end if;
  if length(trim(coalesce(p_note, ''))) not between 2 and 2000 then raise exception 'Write your answer' using errcode='22023'; end if;
  update public.gang_invoices set status = 'with_office', version = version + 1 where id = inv.id returning * into inv;
  perform private.gang_event(inv, 'gang_answered', 'query_gang', trim(p_note));
end $$;

-- The agreement to read: the one waiting for signature, otherwise the latest signed copy.
create function public.portal_agreement(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); a public.subcontractor_agreements;
begin
  select * into a from public.subcontractor_agreements x where x.team_id = l.team_id and x.status in ('issued','signed')
    order by (x.status = 'issued') desc, x.signed_at desc nulls last limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id', a.id, 'reference', a.reference, 'status', a.status, 'title', a.title, 'version_label', a.version_label, 'body', a.body,
    'body_sha256', a.body_sha256, 'parties', a.parties, 'issued_at', a.issued_at, 'issued_by', a.issued_by_name, 'signed_at', a.signed_at,
    'signer_name', a.signer_name, 'signer_position', a.signer_position, 'signature_text', a.signature_text, 'evidence_sha256', a.evidence_sha256);
end $$;

-- Signing. The signer must quote the fingerprint of the exact text they were shown, type their
-- name as their signature and confirm each statement. The link, time, address and browser are
-- recorded with it, and the whole record is fingerprinted.
create function public.portal_sign_agreement(p_token text, p_agreement uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.subcontractor_portal_links := private.portal_link(p_token); a public.subcontractor_agreements; v_name text; v_sig text; v_position text;
  v_ip text; v_agent text; v_at timestamptz := clock_timestamp(); v_accept jsonb; evidence text;
begin
  perform private.only_keys(p_data, array['body_sha256','signer_name','signer_position','signature_text','confirm_read','confirm_authority','confirm_electronic','ip','user_agent']);
  select * into a from public.subcontractor_agreements where id = p_agreement and team_id = l.team_id and organisation_id = l.organisation_id for update;
  if not found then raise exception 'Agreement unavailable' using errcode='42501'; end if;
  if a.status = 'signed' then raise exception 'This agreement has already been signed' using errcode='22023'; end if;
  if a.status <> 'issued' then raise exception 'This agreement has been withdrawn. Ask TileSpec for the current one.' using errcode='22023'; end if;
  if private.field_text(p_data, 'body_sha256', 64, true) is distinct from a.body_sha256 then
    raise exception 'The agreement changed while you were reading it. Open it again and read the current version.' using errcode='40001'; end if;
  if private.field_boolean(p_data, 'confirm_read') is not true or private.field_boolean(p_data, 'confirm_authority') is not true
    or private.field_boolean(p_data, 'confirm_electronic') is not true then
    raise exception 'Tick each statement to confirm you have read the agreement, have authority to sign it and agree to sign electronically' using errcode='22023'; end if;
  v_name := private.field_text(p_data, 'signer_name', 160, true);
  v_sig := private.field_text(p_data, 'signature_text', 160, true);
  if length(v_name) < 2 or lower(regexp_replace(v_sig, '\s+', ' ', 'g')) <> lower(regexp_replace(v_name, '\s+', ' ', 'g')) then
    raise exception 'Type your full name exactly as you entered it above to sign' using errcode='22023'; end if;
  v_position := nullif(private.field_text(p_data, 'signer_position', 160), '');
  v_ip := nullif(left(coalesce(private.field_text(p_data, 'ip', 64), ''), 64), '');
  v_agent := nullif(left(coalesce(p_data->>'user_agent', ''), 400), '');
  v_accept := jsonb_build_object('read_and_understood', true, 'authority_to_sign', true, 'electronic_signature', true);
  evidence := encode(sha256(convert_to(concat_ws('|', a.id, a.reference, a.body_sha256, v_name, coalesce(v_position, ''), v_sig, v_at::text, l.id,
    coalesce(v_ip, ''), coalesce(v_agent, '')), 'UTF8')), 'hex');
  update public.subcontractor_agreements set status = 'signed', signed_at = v_at, signer_name = v_name, signer_position = v_position, signature_text = v_sig,
    signed_link_id = l.id, signer_ip = v_ip, signer_user_agent = v_agent, acceptance = v_accept, evidence_sha256 = evidence
  where id = a.id;
  return jsonb_build_object('reference', a.reference, 'signed_at', v_at, 'evidence_sha256', evidence);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 10. Supervisors: the extras to confirm, with no amounts. Quantities and completion only.
-- ---------------------------------------------------------------------------------------------
create function public.gang_invoice_extras_for_check(p_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare inv public.gang_invoices;
begin
  select * into inv from public.gang_invoices where id = p_invoice and organisation_id = private.current_org();
  if not found or not private.can_supervise_contract(inv.contract_id) then
    raise exception 'Only the job''s supervisor or the office can see this invoice' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'line_no', e.line_no, 'kind', e.kind, 'unit', e.unit, 'description', e.description,
    'claimed_quantity', e.claimed_quantity, 'confirmed_quantity', e.confirmed_quantity, 'confirmation_note', e.confirmation_note) order by e.line_no), '[]'::jsonb)
    from public.gang_invoice_extras e where e.invoice_id = inv.id);
end $$;

-- The supervisor's check, as before, now also confirming any extras: days or hours actually worked,
-- and whether variation or additional work was carried out. Never an amount.
create or replace function public.verify_gang_invoice(p_request_key uuid, p_invoice uuid, p_version integer, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.gang_invoices; payload jsonb; result uuid; item jsonb; l public.gang_invoice_lines; v_passed numeric; v_correction numeric;
  v_verified numeric; v_available numeric; v_quality text; v_workmanship text; snapshot jsonb := '[]'; any_correction boolean := false;
  area_name text; seen uuid[] := '{}'; old_status text; e public.gang_invoice_extras; v_confirmed numeric; extras_snapshot jsonb := '[]';
begin
  perform private.only_keys(p_data, array['lines','workmanship','note','correction_note','extras']);
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

  -- Extras: every one must be confirmed (zero means not carried out or not agreed on site).
  seen := '{}';
  if p_data ? 'extras' and p_data->'extras' <> 'null'::jsonb then
    if jsonb_typeof(p_data->'extras') <> 'array' then raise exception 'Confirm each extra item' using errcode='22023'; end if;
    for item in select * from jsonb_array_elements(p_data->'extras') loop
      perform private.only_keys(item, array['extra_id','confirmed_quantity','note']);
      select * into e from public.gang_invoice_extras where id = private.field_uuid(item, 'extra_id', true) and invoice_id = inv.id for update;
      if not found or e.id = any(seen) then raise exception 'Confirm each extra item once. Refresh and check again.' using errcode='22023'; end if;
      seen := seen || e.id;
      v_confirmed := private.gang_quantity(item->'confirmed_quantity', e.description, 0);
      if v_confirmed > e.claimed_quantity then
        raise exception 'You cannot confirm more than was claimed for "%"', left(e.description, 80) using errcode='22023'; end if;
      if e.kind <> 'day_rate' and v_confirmed not in (0, 1) then
        raise exception 'Confirm "%" as carried out or not carried out', left(e.description, 80) using errcode='22023'; end if;
      if v_confirmed < e.claimed_quantity and length(coalesce(private.field_text(item, 'note', 1000), '')) < 3 then
        raise exception 'Say why you are confirming less than was claimed for "%"', left(e.description, 80) using errcode='22023'; end if;
      update public.gang_invoice_extras set confirmed_quantity = v_confirmed, confirmation_note = nullif(private.field_text(item, 'note', 1000), '') where id = e.id;
      extras_snapshot := extras_snapshot || jsonb_build_object('extra_id', e.id, 'kind', e.kind, 'unit', e.unit, 'description', e.description,
        'claimed', e.claimed_quantity, 'confirmed', v_confirmed);
    end loop;
  end if;
  if exists (select 1 from public.gang_invoice_extras where invoice_id = inv.id and not (id = any(seen))) then
    raise exception 'Confirm each extra item on this invoice: day rate work, variations and additional work' using errcode='22023'; end if;

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
    jsonb_build_object('lines', snapshot, 'extras', extras_snapshot, 'workmanship', v_workmanship, 'correction_note', inv.correction_note));
  perform private.gang_event(inv, 'checked', old_status,
    case when v_workmanship = 'correction_needed' then 'Checked by the supervisor. Correction needed: ' || inv.correction_note
      else 'Checked by the supervisor and sent to the office' end, 'all',
    jsonb_build_object('verified', (select jsonb_agg(jsonb_build_object('area', x->>'area', 'unit', x->>'unit', 'claimed', x->'claimed', 'verified', x->'verified')) from jsonb_array_elements(snapshot) x)));
  perform private.record_request(inv.organisation_id, 'verify_gang_invoice', p_request_key, payload, inv.id);
  return inv.id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 11. The office decision, as before, now approving extras and working out the payment:
--       approved value (net)  - retention  + VAT  - CIS on the labour element  = payable.
--     Each deduction needs its recorded basis. A subcontractor with no tax record is approved
--     exactly as before, with no deduction worked out.
-- ---------------------------------------------------------------------------------------------
create or replace function public.decide_gang_invoice(p_request_key uuid, p_invoice uuid, p_version integer, p_action text, p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare inv public.gang_invoices; ci public.gang_invoice_commercials; payload jsonb; result uuid; old_status text; v_note text;
  item jsonb; l public.gang_invoice_lines; v_qty numeric; v_rate numeric; v_amount numeric; v_total numeric := 0; rates jsonb := '[]';
  v_adjust numeric; v_reason text; seen uuid[] := '{}'; claimed_total numeric; approved_qty_total numeric; team public.teams; cost uuid;
  v_paid_on date; v_agreed date; area_name text; e public.gang_invoice_extras; extras jsonb := '[]'; v_limit numeric; extras_claimed numeric := 0; extras_approved numeric := 0;
  p public.subcontractor_tax_profiles; s public.gang_subcontracts; v_ret numeric; v_cis_rate numeric; v_materials numeric; v_cis numeric; v_vat numeric; v_vat_treatment text;
  gv public.gang_variations;
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
    perform private.only_keys(p_data, array['lines','extras','adjustment_amount','adjustment_reason','note','agreed_payment_on','cis_materials']);
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

    -- Extras: never more than the supervisor confirmed of what was claimed, and a variation never beyond its agreed sum.
    seen := '{}';
    if p_data ? 'extras' and p_data->'extras' <> 'null'::jsonb then
      if jsonb_typeof(p_data->'extras') <> 'array' then raise exception 'Give the approved amount for each extra item' using errcode='22023'; end if;
      for item in select * from jsonb_array_elements(p_data->'extras') loop
        perform private.only_keys(item, array['extra_id','approved_amount']);
        select * into e from public.gang_invoice_extras where id = private.field_uuid(item, 'extra_id', true) and invoice_id = inv.id for update;
        if not found or e.id = any(seen) then raise exception 'Give each extra item once' using errcode='22023'; end if;
        seen := seen || e.id;
        v_amount := private.field_decimal(item, 'approved_amount', 0, 10000000);
        v_limit := round(coalesce(e.claimed_amount, 0) * e.confirmed_quantity / e.claimed_quantity, 2);
        if v_amount > v_limit then
          raise exception 'The approved amount for "%" cannot be more than % (what was claimed, for what the supervisor confirmed)', left(e.description, 80),
            to_char(v_limit, 'FM£999G999G990D00') using errcode='22023'; end if;
        if e.kind = 'variation' then
          select * into gv from public.gang_variations where id = e.variation_id;
          if v_amount > gv.amount - private.gang_variation_used(gv.id, inv.id) then
            raise exception 'This would pay more than the agreed sum for variation %', gv.reference using errcode='22023'; end if;
        end if;
        update public.gang_invoice_extras set approved_amount = v_amount where id = e.id;
        v_total := v_total + v_amount;
        extras_claimed := extras_claimed + coalesce(e.claimed_amount, 0);
        extras_approved := extras_approved + v_amount;
        extras := extras || jsonb_build_object('extra_id', e.id, 'kind', e.kind, 'unit', e.unit, 'description', e.description, 'claimed_quantity', e.claimed_quantity,
          'confirmed_quantity', e.confirmed_quantity, 'rate', e.rate, 'claimed_amount', e.claimed_amount, 'approved_amount', v_amount);
      end loop;
    end if;
    if exists (select 1 from public.gang_invoice_extras where invoice_id = inv.id and not (id = any(seen))) then
      raise exception 'Give the approved amount for each extra item (enter 0 to approve nothing for it)' using errcode='22023'; end if;

    v_adjust := coalesce(case when p_data->'adjustment_amount' is null or p_data->'adjustment_amount' = 'null'::jsonb then 0
      else private.field_decimal(p_data, 'adjustment_amount', -10000000, 10000000) end, 0);
    v_reason := nullif(private.field_text(p_data, 'adjustment_reason', 1000), '');
    if v_adjust <> 0 and coalesce(length(v_reason), 0) < 3 then raise exception 'Give the reason for the agreed adjustment' using errcode='22023'; end if;
    v_total := v_total + v_adjust;
    if v_total < 0 then raise exception 'The approved amount cannot be below zero' using errcode='22023'; end if;
    select coalesce(sum(claimed_quantity), 0), coalesce(sum(approved_quantity), 0) into claimed_total, approved_qty_total from public.gang_invoice_lines where invoice_id = inv.id;
    -- Paying less than claimed is an office decision with a written reason, never automatic.
    if (approved_qty_total < claimed_total or extras_approved < extras_claimed or (ci.invoice_total is not null and v_total < ci.invoice_total))
      and coalesce(length(v_note), 0) < 3 then
      raise exception 'You are approving less than the gang claimed. Write the reason (it is kept with the invoice).' using errcode='22023'; end if;
    v_agreed := private.field_date(p_data, 'agreed_payment_on');
    perform private.assert_gang_ledger(inv.contract_id, inv.team_id);

    -- The payment. Deductions are made only on a recorded basis.
    select * into p from public.subcontractor_tax_profiles where team_id = inv.team_id;
    select * into s from public.gang_subcontracts where id = inv.subcontract_id;
    if p.id is not null then
      v_cis_rate := private.cis_rate(p.cis_status);
      if v_cis_rate is null then
        raise exception 'This subcontractor''s CIS status has not been verified with HMRC. Verify it and record the result before approving payment.' using errcode='22023'; end if;
      v_ret := round(v_total * s.retention_percent / 100, 2);
      v_materials := coalesce(case when p_data ? 'cis_materials' and p_data->'cis_materials' <> 'null'::jsonb then private.field_decimal(p_data, 'cis_materials', 0, 10000000) end, 0);
      if v_materials > v_total - v_ret then raise exception 'Materials cannot be more than the amount being paid' using errcode='22023'; end if;
      v_cis := round((v_total - v_ret - v_materials) * v_cis_rate / 100, 2);
      v_vat_treatment := case when not p.vat_registered then 'none' when p.vat_reverse_charge then 'reverse_charge' else 'standard' end;
      v_vat := case when v_vat_treatment = 'standard' then round(v_total * 20 / 100, 2) else 0 end;
    elsif p_data ? 'cis_materials' and p_data->'cis_materials' <> 'null'::jsonb then
      raise exception 'Record this subcontractor''s tax details before working out CIS' using errcode='22023';
    end if;

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
      line_rates = rates, approval_note = v_note, approved_by = auth.uid(), approved_at = now(), agreed_payment_on = v_agreed, job_cost_entry_id = cost,
      extras_approved = case when jsonb_array_length(extras) > 0 then extras end,
      vat_treatment = v_vat_treatment, vat_rate = case when p.id is null then null when v_vat_treatment = 'none' then 0 else 20 end, vat_amount = v_vat,
      retention_percent = case when p.id is not null then s.retention_percent end, retention_amount = v_ret,
      cis_status = case when p.id is not null then p.cis_status end, cis_rate = v_cis_rate, cis_materials = case when p.id is not null then v_materials end,
      cis_amount = v_cis, net_payable = case when p.id is not null then v_total - v_ret + v_vat - v_cis end
    where id = ci.id;
    perform private.gang_event(inv, 'approved_money', old_status, v_note, 'office', jsonb_build_object('lines', rates, 'extras', extras, 'adjustment_amount', v_adjust,
      'adjustment_reason', v_reason, 'approved_amount', v_total, 'invoice_total', ci.invoice_total, 'payment_due_on', coalesce(v_agreed, ci.payment_due_on),
      'vat_treatment', v_vat_treatment, 'vat_amount', v_vat, 'retention_amount', v_ret, 'cis_rate', v_cis_rate, 'cis_materials', v_materials, 'cis_amount', v_cis,
      'net_payable', case when p.id is not null then v_total - v_ret + v_vat - v_cis end));
    perform private.gang_event(inv, 'approved', old_status, 'Approved for payment', 'all',
      jsonb_build_object('approved', (select jsonb_agg(jsonb_build_object('area', x->>'area', 'unit', x->>'unit', 'approved', x->'approved')) from jsonb_array_elements(rates) x)));

  elsif p_action = 'recheck' then
    perform private.only_keys(p_data, array['note']);
    if inv.status not in ('with_office','query_gang') then raise exception 'Only an invoice with the office can go back for a re-check' using errcode='22023'; end if;
    if coalesce(length(v_note), 0) < 3 then raise exception 'Tell the supervisor what to check' using errcode='22023'; end if;
    update public.gang_invoice_lines set verified_quantity = null, line_quality = null, verification_note = null where invoice_id = inv.id;
    update public.gang_invoice_extras set confirmed_quantity = null, confirmation_note = null where invoice_id = inv.id;
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
      'payment_reference', ci.payment_reference, 'approved_amount', ci.approved_amount, 'net_payable', ci.net_payable));
    perform private.gang_event(inv, 'paid', old_status, 'Payment recorded', 'all');
  end if;

  perform private.record_request(inv.organisation_id, 'decide_gang_invoice', p_request_key, payload, inv.id);
  return inv.id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 12. Grants. The portal functions are the only new functions an anonymous visitor may call, and
--     each one refuses without a live link's secret.
-- ---------------------------------------------------------------------------------------------
revoke all on function private.guard_portal_link(), private.guard_agreement_version(), private.guard_agreement(), private.guard_gang_extra(),
  private.cis_rate(text), private.has_signed_agreement(uuid), private.self_billing_current(public.subcontractor_tax_profiles),
  private.gang_variation_used(uuid,uuid), private.gang_retention_held(uuid), private.portal_link(text),
  private.finish_gang_file(public.gang_invoice_files), private.require_subcontractor_admin(uuid),
  private.price_portal_claim(public.subcontractor_portal_links,jsonb) from public, anon, authenticated;
revoke all on function private.can_upload_portal_file(text) from public, authenticated;
grant execute on function private.can_upload_portal_file(text) to anon;

revoke all on function public.save_subcontractor_profile(uuid,integer,jsonb), public.save_subcontractor_bank(uuid,jsonb), public.issue_portal_link(uuid,jsonb),
  public.revoke_portal_link(uuid), public.create_agreement_version(jsonb), public.publish_agreement_version(uuid,jsonb), public.withdraw_agreement_version(uuid),
  public.issue_subcontractor_agreement(uuid,uuid), public.withdraw_subcontractor_agreement(uuid,text), public.save_gang_variation(uuid,jsonb),
  public.withdraw_gang_variation(uuid,text), public.release_gang_retention(uuid,jsonb), public.void_gang_retention_release(uuid,text),
  public.gang_invoice_extras_for_check(uuid) from public, anon;
grant execute on function public.save_subcontractor_profile(uuid,integer,jsonb), public.save_subcontractor_bank(uuid,jsonb), public.issue_portal_link(uuid,jsonb),
  public.revoke_portal_link(uuid), public.create_agreement_version(jsonb), public.publish_agreement_version(uuid,jsonb), public.withdraw_agreement_version(uuid),
  public.issue_subcontractor_agreement(uuid,uuid), public.withdraw_subcontractor_agreement(uuid,text), public.save_gang_variation(uuid,jsonb),
  public.withdraw_gang_variation(uuid,text), public.release_gang_retention(uuid,jsonb), public.void_gang_retention_release(uuid,text),
  public.gang_invoice_extras_for_check(uuid) to authenticated;

-- The portal always runs signed out, on the server, with the link's secret from an http-only cookie.
revoke all on function public.portal_session(text), public.portal_preview_invoice(text,jsonb), public.portal_prepare_invoice(text,uuid,jsonb),
  public.portal_reserve_file(text,uuid,uuid,text,jsonb), public.portal_complete_file(text,uuid), public.portal_invoice(text,uuid),
  public.portal_cancel_invoice(text,uuid,text), public.portal_answer_query(text,uuid,text), public.portal_agreement(text),
  public.portal_sign_agreement(text,uuid,jsonb) from public, authenticated;
grant execute on function public.portal_session(text), public.portal_preview_invoice(text,jsonb), public.portal_prepare_invoice(text,uuid,jsonb),
  public.portal_reserve_file(text,uuid,uuid,text,jsonb), public.portal_complete_file(text,uuid), public.portal_invoice(text,uuid),
  public.portal_cancel_invoice(text,uuid,text), public.portal_answer_query(text,uuid,text), public.portal_agreement(text),
  public.portal_sign_agreement(text,uuid,jsonb) to anon;
grant usage on schema private to anon;
commit;
