-- Reconciled from the hosted TileSpec project (applied there as version 20261108132214).
-- Kept byte-for-byte equivalent so local acceptance runs build the same schema as production.
begin;
do $$ begin
 if to_regclass('public.site_programme_revisions') is not null then
  raise exception 'Preflight failed: site programme objects already exist (applied on the hosted project); review schema drift';
 end if;
end $$;
create table if not exists public.site_programme_revisions (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id),
 contract_id uuid not null references public.contracts(id) on delete cascade,
 revision integer not null check(revision>0),
 title text not null check(length(title) between 1 and 200),
 start_date date,
 items jsonb not null check(jsonb_typeof(items)='array'),
 contingency_days integer not null default 0 check(contingency_days between 0 and 365),
 status text not null default 'draft' check(status in ('draft','issued')),
 notes text not null default '',
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(contract_id,revision)
);
create index if not exists site_programme_contract_idx on public.site_programme_revisions(contract_id,revision desc);
alter table public.site_programme_revisions enable row level security;
create policy "Programme readable by assigned staff and office" on public.site_programme_revisions for select to authenticated using (
 exists(select 1 from public.organisation_members m where m.organisation_id=site_programme_revisions.organisation_id and m.user_id=(select auth.uid()) and m.active and (m.role in ('owner','contracts_manager') or exists(select 1 from public.contract_assignments a where a.contract_id=site_programme_revisions.contract_id and a.user_id=m.user_id and a.valid_from<=current_date and (a.valid_until is null or a.valid_until>=current_date))))
);
create policy "Programme office creation" on public.site_programme_revisions for insert to authenticated with check (
 created_by=(select auth.uid()) and exists(select 1 from public.organisation_members m where m.organisation_id=site_programme_revisions.organisation_id and m.user_id=(select auth.uid()) and m.active and m.role in ('owner','contracts_manager')) and exists(select 1 from public.contracts c where c.id=contract_id and c.organisation_id=site_programme_revisions.organisation_id)
);
revoke all on public.site_programme_revisions from anon;
grant select,insert on public.site_programme_revisions to authenticated;
commit;
