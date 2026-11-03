-- Read-only review before applying the financial position (20261104130000).
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regprocedure('private.payment_application_figures(uuid)') is not null as payment_applications_applied,
  to_regprocedure('public.contract_financial_positions(uuid[])') is not null as already_applied;
select count(*) as contracts, count(c.contract_id) as with_budgets from public.contracts k left join public.contract_commercials c on c.contract_id=k.id;
rollback;
