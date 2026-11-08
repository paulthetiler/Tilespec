-- Read-only review before applying commercial accounts (20261108090000).
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regprocedure('public.contract_financial_positions(uuid[])') is not null as financial_position_applied,
  to_regclass('public.commercial_documents') is not null as already_applied;
-- Contracts that can have payment terms (a contract value must be recorded first).
select count(*) as contracts, count(k.contract_id) as with_contract_value, count(*) filter (where k.retention_percent>0) as with_retention
from public.contracts c left join public.contract_commercials k on k.contract_id=c.id;
-- Priced daywork lines keep their amounts; each is given a markup of 0.
select count(*) as priced_daywork_lines from public.daywork_pricing_lines;
-- Business details are not entered by the migration; the owner records them in the app.
select count(*) as organisations from public.organisations;
rollback;
