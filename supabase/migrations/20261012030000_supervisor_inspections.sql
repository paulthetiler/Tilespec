-- Persist immutable daily supervisor inspections. No inspection grants work release.
create table public.supervisor_inspections (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 contract_id uuid not null,
 actor_id uuid not null default auth.uid() references auth.users(id),
 request_key uuid not null,
 answers jsonb not null,
 issues_count integer not null check (issues_count between 0 and 50),
 created_at timestamptz not null default now(),
 unique(organisation_id,actor_id,request_key),
 foreign key(organisation_id,contract_id) references public.contracts(organisation_id,id),
 check (jsonb_typeof(answers)='array' and jsonb_array_length(answers)=10)
);
create index supervisor_inspections_contract on public.supervisor_inspections(contract_id,created_at desc);
alter table public.supervisor_inspections enable row level security;
create policy supervisor_inspections_read on public.supervisor_inspections for select to authenticated
 using (organisation_id=private.current_org() and private.can_access_contract(contract_id)
 and private.current_role() in ('owner','contracts_manager','supervisor'));
create policy supervisor_inspections_insert on public.supervisor_inspections for insert to authenticated
 with check (organisation_id=private.current_org() and actor_id=auth.uid()
 and private.can_access_contract(contract_id)
 and private.current_role() in ('owner','contracts_manager','supervisor'));
revoke update,delete on public.supervisor_inspections from authenticated;
grant select,insert on public.supervisor_inspections to authenticated;
