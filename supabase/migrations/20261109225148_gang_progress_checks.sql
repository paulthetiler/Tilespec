-- Reconciled from the hosted TileSpec project (applied there as version 20261109225148).
-- The first supervisor measurement foundation. 20261110090000_gang_invoice_workflow.sql
-- tightens its access to assigned jobs and makes measurements explicitly incremental.
begin;
do $$ begin
 if to_regclass('public.gang_progress_checks') is not null then
  raise exception 'Preflight failed: gang progress objects already exist (applied on the hosted project); review schema drift';
 end if;
end $$;
create table if not exists public.gang_progress_checks (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id),
 contract_id uuid not null references public.contracts(id),
 team_id uuid not null references public.teams(id),
 work_area_id uuid not null references public.work_areas(id),
 measured_on date not null default current_date,
 quantity_m2 numeric(12,2) not null check(quantity_m2 > 0 and quantity_m2 < 100000),
 quality_status text not null check(quality_status in ('passed','correction_required')),
 note text not null default '',
 checked_by uuid not null default auth.uid(),
 checked_at timestamptz not null default now(),
 constraint gang_progress_note_limit check(length(note)<=2000)
);
create index if not exists gang_progress_contract_team_idx on public.gang_progress_checks(contract_id,team_id,checked_at);
alter table public.gang_progress_checks enable row level security;
revoke all on public.gang_progress_checks from anon;
grant select,insert on public.gang_progress_checks to authenticated;
create policy "site staff read progress" on public.gang_progress_checks for select to authenticated using (
 exists (select 1 from public.organisation_members m where m.user_id=auth.uid() and m.organisation_id=gang_progress_checks.organisation_id and m.active and m.role::text in ('owner','contracts_manager','supervisor'))
);
create policy "site staff record progress" on public.gang_progress_checks for insert to authenticated with check (
 checked_by=auth.uid() and
 exists (select 1 from public.organisation_members m where m.user_id=auth.uid() and m.organisation_id=gang_progress_checks.organisation_id and m.active and m.role::text in ('owner','contracts_manager','supervisor')) and
 exists (select 1 from public.contracts c where c.id=contract_id and c.organisation_id=gang_progress_checks.organisation_id) and
 exists (select 1 from public.teams t where t.id=team_id and t.organisation_id=gang_progress_checks.organisation_id) and
 exists (select 1 from public.work_areas w where w.id=work_area_id and w.contract_id=gang_progress_checks.contract_id)
);
commit;
