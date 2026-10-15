-- A second independent office reviewer for the Phase 3C browser journeys.
-- This file is loaded only into the disposable local acceptance database.
-- Holds, inspections and lifecycle events are created through the ordinary
-- authenticated public RPCs by the journeys, never inserted as invented state.
begin;
insert into auth.users(id,email) values
 ('e2e00000-0000-4000-8000-000000000007','bea.manager@e2e.invalid'),
 ('e2e00000-0000-4000-8000-000000000008','ada.supervisor@e2e.invalid'),
 ('e2e00000-0000-4000-8000-000000000009','grace.owner@e2e.invalid');
insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
 ('e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000007','Bea Reviewer','contracts_manager',false),
 ('e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000008','Ada Supervisor','supervisor',false),
 ('e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000009','Grace Owner','owner',false);
insert into public.contract_assignments(contract_id,organisation_id,user_id) values
 ('e2e00000-0000-4000-8000-0000000000c1','e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000007');
commit;
