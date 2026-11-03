-- Read-only review before applying payment applications (20261104120000).
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regclass('public.job_cost_entries') is not null as job_costs_applied,
  to_regclass('public.payment_applications') is not null as already_applied;
-- Retention percentages that a first application would use.
select count(*) as contracts_with_budgets, count(*) filter (where retention_percent>0) as with_retention from public.contract_commercials;
select count(*) as extras_ready_to_claim from public.dayworks where office_status='approved' and commercial_status='commercially_approved';
rollback;
