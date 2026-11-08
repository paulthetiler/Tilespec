-- A job for the commercial accounts journey (C6). Disposable local test database only.
-- Only the contract and its value are seeded; business details, payment terms and every
-- application, notice, invoice and payment are entered through the app by the journey.
begin;
insert into public.contracts(id,organisation_id,reference,name,client,principal_contractor,address,created_by) values
 ('e2e00000-0000-4000-8000-0000000000c6','e2e00000-0000-4000-8000-0000000000a1','ACC-1','Accounts journey site','Example Client Ltd',
  'Example Contractor Ltd','2 Example Road, Leeds','e2e00000-0000-4000-8000-000000000009');
insert into public.contract_assignments(contract_id,organisation_id,user_id) values
 ('e2e00000-0000-4000-8000-0000000000c6','e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000001'),
 ('e2e00000-0000-4000-8000-0000000000c6','e2e00000-0000-4000-8000-0000000000a1','e2e00000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e2e00000-0000-4000-8000-000000000009"}',true);
select public.save_contract_commercial('e2e00000-0000-4000-8000-0000000000c6',0,'{"contract_value":120000,"retention_percent":5}');
commit;
