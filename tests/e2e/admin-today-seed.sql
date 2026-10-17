-- Extra identities for Phase 3's isolated, disposable acceptance database only.
-- All jobs and operational records are created later through real public RPCs
-- and browser forms, with their ordinary permissions and audit triggers.
begin;
insert into auth.users(id,email) values
 ('e2e00000-0000-4000-8000-000000000011','faye.finance@e2e.invalid'),
 ('e2e00000-0000-4000-8000-000000000012','otto.owner@e2e.invalid');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000011','Faye Finance','contracts_manager',true),
 ('e2e00000-0000-4000-8000-0000000000a2','e2e00000-0000-4000-8000-000000000012','Otto Other Owner','owner',false);
commit;
