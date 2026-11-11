-- Company setup costs separate from contract job costing. Deployed to TileSpec on 11 Nov 2026.
create table if not exists public.startup_expenses (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id),
 expense_date date not null,
 supplier text not null check(length(trim(supplier)) between 1 and 160),
 description text not null check(length(trim(description)) between 3 and 500),
 category text not null default 'other' check(category in ('formation','premises','equipment','software','insurance','marketing','training','travel','professional_fees','other')),
 amount_gbp numeric(12,2) not null check(amount_gbp>0),
 payment_source text not null check(payment_source in ('personal','company')),
 receipt_reference text,
 receipt_status text not null default 'awaiting' check(receipt_status in ('awaiting','held','not_available')),
 reimbursed_gbp numeric(12,2) not null default 0 check(reimbursed_gbp>=0 and reimbursed_gbp<=amount_gbp),
 reimbursement_date date,
 date_confirmed boolean not null default true,
 notes text,
 external_reference text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organisation_id,external_reference),
 check(payment_source='personal' or reimbursed_gbp=0),
 check((reimbursed_gbp=0 and reimbursement_date is null) or (reimbursed_gbp>0 and reimbursement_date is not null))
);
create index if not exists startup_expenses_org_date on public.startup_expenses(organisation_id,expense_date desc);
alter table public.startup_expenses enable row level security;
revoke all on public.startup_expenses from anon,authenticated;
grant select,insert,update on public.startup_expenses to authenticated;
drop policy if exists startup_expenses_select on public.startup_expenses;
drop policy if exists startup_expenses_insert on public.startup_expenses;
drop policy if exists startup_expenses_update on public.startup_expenses;
create policy startup_expenses_select on public.startup_expenses for select to authenticated using(organisation_id=private.current_org() and private.has_money_access());
create policy startup_expenses_insert on public.startup_expenses for insert to authenticated with check(organisation_id=private.current_org() and private.has_money_access());
create policy startup_expenses_update on public.startup_expenses for update to authenticated using(organisation_id=private.current_org() and private.has_money_access()) with check(organisation_id=private.current_org() and private.has_money_access());
