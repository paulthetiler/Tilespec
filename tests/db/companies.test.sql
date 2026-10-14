-- Subcontractor companies, their gangs and operatives, insurance and accreditations.
-- Disposable local database only; permission assertions run as non-superusers.
begin;

insert into auth.users(id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'co-owner@example.invalid'),
  ('e1000000-0000-0000-0000-000000000002', 'co-manager@example.invalid'),
  ('e1000000-0000-0000-0000-000000000003', 'co-supervisor@example.invalid'),
  ('e1000000-0000-0000-0000-000000000004', 'co-installer@example.invalid'),
  ('e1000000-0000-0000-0000-000000000005', 'co-other-owner@example.invalid');
insert into public.organisations(id, name) values
  ('e2000000-0000-0000-0000-000000000001', 'Companies fixture contractor'),
  ('e2000000-0000-0000-0000-000000000002', 'Unrelated contractor');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Owner', 'owner', true),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'Manager', 'contracts_manager', false),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000003', 'Supervisor', 'supervisor', false),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004', 'Sam Smith', 'lead_installer', false),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000005', 'Other Owner', 'owner', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002"}', true);

-- One company record, with contact details, keyed by a stable ID.
select public.create_company('e3000000-0000-0000-0000-000000000001', '{"name":"  Smith   Tiling Ltd ","company_number":"01234567","contact_name":"Sam Smith",
  "contact_phone":"07700 900123","contact_email":"office@smith-tiling.example","address":"1 Yard Lane, Leeds","notes":"Prefers 7am starts"}') as smith_co \gset
select test.assert(public.create_company('e3000000-0000-0000-0000-000000000001', '{"name":"  Smith   Tiling Ltd ","company_number":"01234567","contact_name":"Sam Smith",
  "contact_phone":"07700 900123","contact_email":"office@smith-tiling.example","address":"1 Yard Lane, Leeds","notes":"Prefers 7am starts"}') = :'smith_co'
  and (select count(*) = 1 from public.subcontractor_companies), 'retrying company creation creates one record');
select test.assert((select name = 'Smith Tiling Ltd' and contact_email = 'office@smith-tiling.example' and active and version = 1 and created_by = auth.uid()
  from public.subcontractor_companies where id = :'smith_co'), 'the company name is stored once, without stray spacing, with its contact details');
select public.create_company(gen_random_uuid(), '{"name":"Site Labour Agency"}') as agency_co \gset
select public.create_company(gen_random_uuid(), '{"name":"Jones Installations"}') as jones_co \gset
select test.expect_error($q$select public.create_company(gen_random_uuid(), '{"name":"smith tiling LTD"}')$q$,
  array['23505'], 'a company cannot be entered twice under a different case or spacing');
select test.expect_error($q$select public.create_company(gen_random_uuid(), '{"name":"Bad Email Ltd","contact_email":"not-an-email"}')$q$,
  array['22023'], 'an invalid contact email is rejected');
select test.expect_error($q$select public.create_company(gen_random_uuid(), '{"name":"Extra Ltd","vat_rate":"20"}')$q$,
  array['22023'], 'unknown company fields are rejected');
select test.expect_error($q$select public.create_company(gen_random_uuid(), '{"company_number":"999"}')$q$,
  array['22023'], 'a company needs a name');

-- One company runs several gangs; individual operatives belong to those gangs.
select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Smith Gang A', 'kind', 'subcontract_gang', 'company_id', :'smith_co')) as gang_a \gset
select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Smith Gang B', 'kind', 'subcontract_gang', 'company_id', :'smith_co')) as gang_b \gset
select public.create_team(gen_random_uuid(), '{"name":"Direct Team","kind":"direct_team"}') as direct_team \gset
select public.create_operative(gen_random_uuid(), jsonb_build_object('display_name', 'Sam Smith', 'engagement', 'subcontractor', 'company_id', :'smith_co',
  'user_id', 'e1000000-0000-0000-0000-000000000004')) as sam \gset
select public.create_operative(gen_random_uuid(), jsonb_build_object('display_name', 'Tom Baker', 'engagement', 'subcontractor', 'company_id', :'smith_co')) as tom \gset
select public.create_operative(gen_random_uuid(), jsonb_build_object('display_name', 'Lee Hart', 'engagement', 'subcontractor', 'company_id', :'smith_co')) as lee \gset
select public.create_operative(gen_random_uuid(), jsonb_build_object('display_name', 'Ava Kerr', 'engagement', 'agency', 'company_id', :'agency_co')) as ava \gset
select public.create_operative(gen_random_uuid(), '{"display_name":"Dan Price","engagement":"direct_employee"}') as dan \gset
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'gang_a', 'operative_id', :'sam', 'is_lead', true));
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'gang_a', 'operative_id', :'tom'));
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'gang_b', 'operative_id', :'lee', 'is_lead', true));
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'gang_b', 'operative_id', :'ava'));
select test.assert((select array_agg(t.name || ':' || o.display_name order by t.name, o.display_name)
    = array['Smith Gang A:Sam Smith', 'Smith Gang A:Tom Baker', 'Smith Gang B:Ava Kerr', 'Smith Gang B:Lee Hart']
  from public.teams t join public.team_memberships m on m.team_id = t.id join public.operatives o on o.id = m.operative_id
  where t.company_id = :'smith_co'), 'one company has two gangs, each with its own operatives, found through the company ID');
select test.assert((select count(*) = 3 from public.operatives where company_id = :'smith_co'), 'the company''s own operatives are found by company ID');
select test.assert((select bool_and(contractor_name = 'Smith Tiling Ltd') from public.teams where company_id = :'smith_co')
  and (select company_name = 'Smith Tiling Ltd' from public.operatives where id = :'tom'),
  'the mirrored name on gangs and operatives is written from the company record');
select test.expect_error($q$select public.create_team(gen_random_uuid(), '{"name":"Typed","kind":"subcontract_gang","contractor_name":"Smith Tiling"}')$q$,
  array['22023'], 'a free-typed contractor name is no longer accepted for a gang');
select test.expect_error($q$select public.create_operative(gen_random_uuid(), '{"display_name":"Typed","engagement":"subcontractor","company_name":"Smith"}')$q$,
  array['22023'], 'a free-typed company name is no longer accepted for an operative');
select test.expect_error(format($q$select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Wrong', 'kind', 'direct_team', 'company_id', %L))$q$, :'smith_co'),
  array['22023'], 'a direct team cannot be linked to a subcontractor company');
select test.expect_error(format($q$select public.update_operative(%L, 1, jsonb_build_object('company_id', %L))$q$, :'dan', :'smith_co'),
  array['22023'], 'a directly employed person cannot be linked to a subcontractor company');
select test.expect_error(format($q$select public.update_operative(%L, 1, '{"engagement":"direct_employee"}')$q$, :'tom'),
  array['22023'], 'becoming directly employed requires clearing the company link');
select test.expect_error(format($q$select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Ghost', 'kind', 'mixed', 'company_id', %L))$q$, gen_random_uuid()),
  array['23514'], 'a gang cannot be linked to a company that does not exist');

-- Moving a gang to another company keeps both IDs stable and updates the mirror.
select public.update_team(:'gang_b', 1, jsonb_build_object('company_id', :'jones_co'));
select test.assert((select company_id = :'jones_co'::uuid and contractor_name = 'Jones Installations' and version = 2 from public.teams where id = :'gang_b'),
  'a gang can be moved to another company by ID');
select public.update_team(:'gang_b', 2, jsonb_build_object('company_id', :'smith_co', 'name', 'Smith Gang B'));
select test.assert((select company_id = :'smith_co'::uuid and contractor_name = 'Smith Tiling Ltd' from public.teams where id = :'gang_b'),
  'and moved back');

-- Renaming a company changes one record; every gang still points at it.
select public.update_company(:'smith_co', 1, '{"name":"Smith Tiling Group Ltd","contact_phone":"0113 496 0000"}');
select test.assert((select name = 'Smith Tiling Group Ltd' and contact_phone = '0113 496 0000' and contact_email = 'office@smith-tiling.example' and version = 2
  from public.subcontractor_companies where id = :'smith_co'), 'editing a company changes only the fields sent');
select test.assert((select count(*) = 2 from public.teams t join public.subcontractor_companies c on c.id = t.company_id where c.name = 'Smith Tiling Group Ltd'),
  'after a rename both gangs are still linked to the same company');
select test.expect_error(format($q$select public.update_company(%L, 1, '{"notes":"stale"}')$q$, :'smith_co'),
  array['40001'], 'a stale company edit is rejected');
select test.expect_error(format($q$select public.update_company(%L, 2, '{"name":"Site Labour Agency"}')$q$, :'smith_co'),
  array['23505'], 'a company cannot be renamed to another company''s name');

-- Active/inactive: never leave an active gang or operative under an inactive company.
select test.expect_error(format($q$select public.update_company(%L, 2, '{"active":false}')$q$, :'smith_co'),
  array['23514'], 'a company with active gangs or operatives cannot be deactivated');
select public.create_company(gen_random_uuid(), '{"name":"Moss Tiling"}') as moss_co \gset
select public.update_company(:'moss_co', 1, '{"active":false}');
select test.expect_error(format($q$select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Moss Pair', 'kind', 'subcontract_gang', 'company_id', %L))$q$, :'moss_co'),
  array['23514'], 'a new gang cannot be linked to an inactive company');
select test.expect_error(format($q$select public.update_operative(%L, 1, jsonb_build_object('company_id', %L))$q$, :'tom', :'moss_co'),
  array['23514'], 'an operative cannot be moved to an inactive company');
select test.expect_error($q$select public.create_company(gen_random_uuid(), '{"name":"MOSS TILING"}')$q$,
  array['23505'], 'an inactive company is reactivated rather than entered again');
select public.update_company(:'moss_co', 2, '{"active":true}');
select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Moss Pair', 'kind', 'subcontract_gang', 'company_id', :'moss_co')) as moss_pair \gset
select public.update_team(:'moss_pair', 1, '{"active":false}');
select public.update_company(:'moss_co', 3, '{"active":false}');
select test.expect_error(format($q$select public.update_team(%L, 2, '{"active":true}')$q$, :'moss_pair'),
  array['23514'], 'a gang cannot be reactivated while its company is inactive');
select test.assert((select not active from public.subcontractor_companies where id = :'moss_co'), 'a company with only inactive gangs can be deactivated');

-- Insurance: dated, permanent entries. A renewal is a new entry.
select public.record_company_insurance('e4000000-0000-0000-0000-000000000001', jsonb_build_object('company_id', :'smith_co', 'insurance_type', 'public_liability',
  'insurer', 'Example Mutual', 'policy_number', 'PL-1001', 'cover_amount', 5000000, 'starts_on', (private.site_today() - 340)::text,
  'expires_on', (private.site_today() + 25)::text)) as pl_old \gset
select test.assert(public.record_company_insurance('e4000000-0000-0000-0000-000000000001', jsonb_build_object('company_id', :'smith_co', 'insurance_type', 'public_liability',
  'insurer', 'Example Mutual', 'policy_number', 'PL-1001', 'cover_amount', 5000000, 'starts_on', (private.site_today() - 340)::text,
  'expires_on', (private.site_today() + 25)::text)) = :'pl_old' and (select count(*) = 1 from public.company_insurances), 'retrying an insurance entry records it once');
select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', :'smith_co', 'insurance_type', 'public_liability',
  'insurer', 'Example Mutual', 'policy_number', 'PL-1002', 'cover_amount', 10000000, 'starts_on', (private.site_today() + 26)::text,
  'expires_on', (private.site_today() + 390)::text)) as pl_new \gset
select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', :'smith_co', 'insurance_type', 'employers_liability',
  'expires_on', (private.site_today() - 3)::text)) as el_expired \gset
select test.assert((select count(*) = 3 from public.company_insurances where company_id = :'smith_co' and voided_at is null),
  'the renewal and an already-expired policy are kept alongside the current one');
select test.assert((select max(expires_on) = private.site_today() + 390 from public.company_insurances
  where company_id = :'smith_co' and insurance_type = 'public_liability' and voided_at is null), 'the latest public liability cover is found by expiry date');
select test.expect_error(format($q$select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', %L, 'insurance_type', 'public_liability'))$q$, :'smith_co'),
  array['22023'], 'an insurance entry needs an expiry date');
select test.expect_error(format($q$select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', %L, 'insurance_type', 'public_liability',
  'starts_on', '2026-06-01', 'expires_on', '2026-05-31'))$q$, :'smith_co'), array['22023'], 'an insurance cannot expire before it starts');
select test.expect_error(format($q$select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', %L, 'insurance_type', 'public_liability',
  'expires_on', '0207-05-31'))$q$, :'smith_co'), array['22023'], 'a mistyped expiry year is rejected');
select test.expect_error(format($q$select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', %L, 'insurance_type', 'van',
  'expires_on', '2027-05-31'))$q$, :'smith_co'), array['22023'], 'unknown insurance types are rejected');
select test.expect_error(format($q$select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', %L, 'insurance_type', 'other',
  'expires_on', '2027-05-31', 'cover_amount', -1))$q$, :'smith_co'), array['22023'], 'a negative cover amount is rejected');
select test.expect_error(format($q$select public.void_company_insurance(%L, 'no')$q$, :'el_expired'), array['22023'], 'voiding an insurance entry requires a reason');
select public.void_company_insurance(:'el_expired', 'Entered against the wrong company');
select public.void_company_insurance(:'el_expired', 'Retry of the same void');
select test.assert((select voided_by = auth.uid() and void_reason = 'Entered against the wrong company' from public.company_insurances where id = :'el_expired'),
  'a voided insurance entry stays on record with who voided it and why');

-- Accreditations: scheme and reference, expiry optional.
select public.record_company_accreditation(gen_random_uuid(), jsonb_build_object('company_id', :'smith_co', 'scheme', 'CHAS', 'reference', 'CH-778',
  'expires_on', (private.site_today() + 200)::text)) as chas \gset
select public.record_company_accreditation(gen_random_uuid(), jsonb_build_object('company_id', :'smith_co', 'scheme', 'The Tile Association member')) as tta \gset
select test.assert((select count(*) = 2 and count(expires_on) = 1 from public.company_accreditations where company_id = :'smith_co'),
  'accreditations are recorded with or without an expiry date');
select test.expect_error(format($q$select public.record_company_accreditation(gen_random_uuid(), jsonb_build_object('company_id', %L, 'reference', 'X'))$q$, :'smith_co'),
  array['22023'], 'an accreditation needs a scheme name');
select public.void_company_accreditation(:'tta', 'Membership lapsed before it was recorded');
select test.assert((select voided_at is not null from public.company_accreditations where id = :'tta'), 'an accreditation entered in error is voided, not deleted');

-- Audit: who created and changed company records.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001"}', true);
select test.assert((select count(*) = 2 from public.audit_events where entity_type = 'subcontractor_companies' and entity_id = :'smith_co'
  and actor_id = 'e1000000-0000-0000-0000-000000000002'), 'company creation and the edit are audited once each with the manager as actor');
select test.assert((select count(*) = 2 from public.audit_events where entity_type = 'company_insurances' and entity_id = :'el_expired'),
  'recording and voiding an insurance entry are both audited');

-- Supervisors read companies and their cover to check a gang on site, but change nothing.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000003"}', true);
select test.assert((select count(*) = 4 from public.subcontractor_companies) and (select count(*) = 3 from public.company_insurances)
  and (select count(*) = 2 from public.company_accreditations), 'a supervisor reads companies, insurance and accreditations');
select test.expect_error($q$select public.create_company(gen_random_uuid(), '{"name":"Supervisor Co"}')$q$, array['42501'], 'a supervisor cannot create companies');
select test.expect_error(format($q$select public.update_company(%L, 2, '{"notes":"x"}')$q$, :'smith_co'), array['42501'], 'a supervisor cannot edit companies');
select test.expect_error(format($q$select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', %L, 'insurance_type', 'other', 'expires_on', '2027-01-01'))$q$, :'smith_co'),
  array['42501'], 'a supervisor cannot record insurance');
select test.expect_error(format($q$select public.void_company_accreditation(%L, 'Supervisor void')$q$, :'chas'), array['42501'], 'a supervisor cannot void accreditations');
-- A supervisor registering someone who turned up may pick their company.
select public.create_operative(gen_random_uuid(), jsonb_build_object('display_name', 'Extra Labourer', 'engagement', 'agency', 'company_id', :'agency_co')) as extra \gset
select test.assert((select status = 'provisional' and company_id = :'agency_co'::uuid from public.operatives where id = :'extra'),
  'a supervisor can register a provisional operative under an existing company');

-- Installers see no company records; their own gang still shows its company name.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000004"}', true);
select test.assert((select count(*) = 0 from public.subcontractor_companies) and (select count(*) = 0 from public.company_insurances)
  and (select count(*) = 0 from public.company_accreditations), 'an installer reads no company, insurance or accreditation records');
select test.assert((select array_agg(contractor_name) = array['Smith Tiling Ltd'] from public.teams), 'an installer''s own gang still carries the company name it was linked under');
select test.expect_error($q$select public.create_company(gen_random_uuid(), '{"name":"Installer Co"}')$q$, array['42501'], 'an installer cannot create companies');

-- Another organisation sees and changes nothing.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000005"}', true);
select test.assert((select count(*) = 0 from public.subcontractor_companies) and (select count(*) = 0 from public.company_insurances),
  'another organisation sees none of these companies');
select test.expect_error(format($q$select public.update_company(%L, 2, '{"name":"Hijacked"}')$q$, :'smith_co'), array['42501'], 'another organisation cannot edit a company');
select test.expect_error(format($q$select public.create_team(gen_random_uuid(), jsonb_build_object('name', 'Borrowed', 'kind', 'mixed', 'company_id', %L))$q$, :'smith_co'),
  array['23514'], 'another organisation cannot link its gangs to this company');
select test.expect_error(format($q$select public.record_company_insurance(gen_random_uuid(), jsonb_build_object('company_id', %L, 'insurance_type', 'other', 'expires_on', '2027-01-01'))$q$, :'smith_co'),
  array['23503'], 'another organisation cannot add insurance to this company');

-- Signed-in users cannot bypass the functions, and history cannot be rewritten.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001"}', true);
select test.expect_error($q$insert into public.subcontractor_companies(organisation_id, name) values ('e2000000-0000-0000-0000-000000000001', 'Direct insert')$q$,
  array['42501'], 'the owner cannot insert a company directly');
select test.expect_error(format($q$update public.subcontractor_companies set active = false where id = %L$q$, :'smith_co'),
  array['42501'], 'the owner cannot update a company directly');
reset role;
select test.expect_error(format($q$update public.company_insurances set expires_on = expires_on + 365 where id = %L$q$, :'pl_old'),
  array['42501'], 'an insurance expiry date cannot be rewritten even by privileged SQL');
select test.expect_error(format($q$delete from public.company_accreditations where id = %L$q$, :'chas'),
  array['42501'], 'accreditation history cannot be deleted even by privileged SQL');
select test.expect_error(format($q$update public.operatives set engagement = 'direct_employee' where id = %L$q$, :'tom'),
  array['23514'], 'the table itself refuses a directly employed operative linked to a company');
select test.assert(true, 'subcontractor companies PASSED');
rollback;
