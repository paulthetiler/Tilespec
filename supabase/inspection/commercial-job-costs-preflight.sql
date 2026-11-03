-- Read-only review before applying job costs (20261104110000).
-- This report changes no data, permissions or hosted services.
begin read only;
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='dayworks' and column_name='kind') as variations_applied,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='operatives' and column_name='company_id') as companies_linked,
  to_regclass('public.job_cost_entries') is not null as already_applied;
-- Attendance that will be costed once rates are entered (nothing is costed without a rate).
select count(*) as attendance_periods, count(*) filter (where o.left_at is null and a.ended_at is null) as still_open
  from public.actual_allocation_operatives o join public.actual_allocations a on a.id=o.actual_allocation_id where a.voided_at is null;
select count(*) as operatives, count(*) filter (where company_id is not null) as linked_to_a_subcontractor from public.operatives;
select count(*) as gangs from public.teams;
rollback;
