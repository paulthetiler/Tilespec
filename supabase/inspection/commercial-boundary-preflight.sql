-- Read-only review before applying the supervisor commercial boundary (20261104090000).
-- This report changes no data, permissions or hosted services.
begin read only;
select to_regclass('public.dayworks') is not null as dayworks_present,
  to_regclass('public.daywork_client_authorisations') is not null as client_authorisations_present,
  to_regprocedure('private.can_supervise_contract(uuid)') is not null as site_access_present,
  to_regprocedure('private.can_view_financials(uuid)') is not null as money_access_present,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='contracts'
    and column_name='daywork_client_authorisation') as already_applied;
-- Audit rows that will be reclassified as commercial (their content is unchanged).
select count(*) as audit_rows_to_reclassify from public.audit_events where not commercial and (entity_type='daywork_client_authorisations'
  or (entity_type='dayworks' and action='update' and details->'changed_fields' ?| array['commercial_status','client_status']));
select count(*) as preserved_dayworks from public.dayworks;
select count(*) as preserved_client_authorisations from public.daywork_client_authorisations;
select count(*) as contracts_that_will_require_client_authorisation from public.contracts;
rollback;
