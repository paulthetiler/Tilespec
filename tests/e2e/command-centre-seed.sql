-- The office command centre's morning journey: an owner with money access, programme dates on the
-- existing job and one measured work package. Created through the real database functions.
-- Fictional people on a disposable local database only; never apply to a hosted project.
begin;
insert into auth.users(id, email) values ('e2e00000-0000-4000-8000-000000000013', 'cara.owner@e2e.invalid');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('e2e00000-0000-4000-8000-0000000000a1', 'e2e00000-0000-4000-8000-000000000013', 'Cara Owner', 'owner', true);
insert into public.notification_settings(organisation_id) values ('e2e00000-0000-4000-8000-0000000000a1') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2e00000-0000-4000-8000-000000000013"}', true);
select public.update_contract('e2e00000-0000-4000-8000-0000000000c1',
  (select version from public.contracts where id = 'e2e00000-0000-4000-8000-0000000000c1'),
  jsonb_build_object('start_date', (current_date - 14)::text, 'end_date', (current_date + 30)::text));
select public.create_work_package((select id from public.work_areas where contract_id = 'e2e00000-0000-4000-8000-0000000000c1' and name = 'Corridor 1'),
  gen_random_uuid(), jsonb_build_object('name', 'Corridor floor tiling', 'quantity', 100, 'unit', 'm2'));
commit;
