-- A separate supervisor for the simplified daily-workflow acceptance journeys.
-- Loaded only by the disposable local test database, never a hosted project.
-- The site and all operational records are created through authenticated RPCs.
begin;
insert into auth.users(id,email) values
 ('e2e00000-0000-4000-8000-000000000010','dave.supervisor@e2e.invalid');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000010','Dave Supervisor','supervisor',false);
commit;
