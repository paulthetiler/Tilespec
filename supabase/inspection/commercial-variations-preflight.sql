-- Read-only review before applying variations (20261104100000).
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regprocedure('public.daywork_site_statuses(uuid[])') is not null as commercial_boundary_applied,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='dayworks' and column_name='kind') as already_applied;
-- Every existing record becomes a daywork, keeping its number.
select count(*) as dayworks_kept_as_dayworks, coalesce(max(number),0) as highest_daywork_number from public.dayworks;
select count(*) as existing_prices_kept_as_day_rate_prices from public.daywork_pricings;
select count(*) as contracts_that_will_require_client_authorisation_for_variations from public.contracts;
rollback;
