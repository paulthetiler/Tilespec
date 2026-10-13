-- Operatives, teams and effective-dated membership.
-- Disposable local database only; permission assertions run as non-superusers.
begin;

insert into auth.users(id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'teams-owner@example.invalid'),
  ('d1000000-0000-0000-0000-000000000002', 'teams-manager@example.invalid'),
  ('d1000000-0000-0000-0000-000000000003', 'teams-supervisor@example.invalid'),
  ('d1000000-0000-0000-0000-000000000004', 'sam.smith@example.invalid'),
  ('d1000000-0000-0000-0000-000000000005', 'jo.jones@example.invalid'),
  ('d1000000-0000-0000-0000-000000000006', 'teams-other-owner@example.invalid'),
  ('d1000000-0000-0000-0000-000000000007', 'no-operative-installer@example.invalid');
insert into public.organisations(id, name) values
  ('d2000000-0000-0000-0000-000000000001', 'Teams fixture company'),
  ('d2000000-0000-0000-0000-000000000002', 'Unrelated company');
insert into public.organisation_members(organisation_id, user_id, display_name, role, financial_access) values
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Owner', 'owner', true),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'Manager', 'contracts_manager', false),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003', 'Supervisor', 'supervisor', false),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 'Sam Smith', 'lead_installer', false),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005', 'Jo Jones', 'lead_installer', false),
  ('d2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000006', 'Other Owner', 'owner', true),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000007', 'Unlinked Installer', 'subcontract_installer', false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000002"}', true);
select public.create_operative('d3000000-0000-0000-0000-000000000001', '{"display_name":"Sam Smith","engagement":"subcontractor","company_name":"Smith Tiling Ltd","user_id":"d1000000-0000-0000-0000-000000000004"}') as sam \gset
select public.create_operative('d3000000-0000-0000-0000-000000000002', '{"display_name":"Tom Baker","engagement":"subcontractor","company_name":"Smith Tiling Ltd"}') as tom \gset
select public.create_operative('d3000000-0000-0000-0000-000000000003', '{"display_name":"Lee Hart","engagement":"subcontractor","company_name":"Smith Tiling Ltd"}') as lee \gset
select public.create_operative('d3000000-0000-0000-0000-000000000004', '{"display_name":"Dan Price","engagement":"direct_employee"}') as dan \gset
select public.create_operative('d3000000-0000-0000-0000-000000000005', '{"display_name":"Jo Jones","engagement":"subcontractor","company_name":"Jones Installations","user_id":"d1000000-0000-0000-0000-000000000005"}') as jo \gset
select public.create_operative('d3000000-0000-0000-0000-000000000006', '{"display_name":"Ava Kerr","engagement":"agency","company_name":"Site Labour Agency"}') as ava \gset
select test.assert(public.create_operative('d3000000-0000-0000-0000-000000000002', '{"display_name":"Tom Baker","engagement":"subcontractor","company_name":"Smith Tiling Ltd"}') = :'tom'
  and (select count(*) = 1 from public.operatives where display_name = 'Tom Baker'), 'retrying operative registration creates one record');
select test.assert((select count(*) = 6 from public.operatives where status = 'active'), 'office-registered operatives are active');
select test.expect_error($q$select public.create_operative(gen_random_uuid(), '{"display_name":"Bad","engagement":"freelance"}')$q$,
  array['22023'], 'unknown engagement types are rejected');
select test.expect_error($q$select public.create_operative(gen_random_uuid(), '{"display_name":"Duplicate login","engagement":"subcontractor","user_id":"d1000000-0000-0000-0000-000000000004"}')$q$,
  array['23505'], 'one login links to at most one operative');

select public.create_team('d4000000-0000-0000-0000-000000000001', '{"name":"Smith Tiling","kind":"subcontract_gang","contractor_name":"Smith Tiling Ltd"}') as smith \gset
select public.create_team('d4000000-0000-0000-0000-000000000002', '{"name":"Jones Installations","kind":"subcontract_gang","contractor_name":"Jones Installations"}') as jones \gset
select public.create_team('d4000000-0000-0000-0000-000000000003', '{"name":"Direct Team A","kind":"direct_team"}') as direct \gset
select public.create_team('d4000000-0000-0000-0000-000000000004', '{"name":"Ward 4 Mixed Team","kind":"mixed"}') as mixed \gset
select test.expect_error($q$select public.create_team(gen_random_uuid(), '{"name":" smith tiling ","kind":"subcontract_gang"}')$q$,
  array['23505'], 'two active teams cannot share a name');
select test.expect_error($q$select public.create_team(gen_random_uuid(), '{"name":"Crew","kind":"crew"}')$q$, array['22023'], 'unknown team kinds are rejected');

select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'smith', 'operative_id', :'sam', 'is_lead', true, 'valid_from', (private.site_today() - 30)::text)) as sam_membership \gset
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'smith', 'operative_id', :'tom', 'valid_from', (private.site_today() - 30)::text)) as tom_smith \gset
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'smith', 'operative_id', :'lee', 'valid_from', (private.site_today() - 30)::text));
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'jones', 'operative_id', :'jo', 'is_lead', true, 'valid_from', (private.site_today() - 30)::text));
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'direct', 'operative_id', :'dan', 'is_lead', true));
select test.expect_error(format($q$select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', %L, 'operative_id', %L, 'is_lead', true))$q$, :'smith', :'lee'),
  array['23P01'], 'a team cannot have two leads for overlapping dates');
select test.expect_error(format($q$select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', %L, 'operative_id', %L))$q$, :'smith', :'tom'),
  array['23P01'], 'an operative cannot hold two overlapping memberships of the same team');
-- Engagement never limits team structure or workflow: mixed teams are normal.
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'mixed', 'operative_id', :'dan', 'is_lead', true));
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'mixed', 'operative_id', :'ava'));
select test.assert((select count(distinct o.engagement) = 2 from public.team_memberships m join public.operatives o on o.id = m.operative_id where m.team_id = :'mixed'),
  'a mixed team can combine direct and agency operatives');
select test.assert((select count(*) = 2 from public.team_memberships where operative_id = :'dan' and voided_at is null),
  'an operative may belong to more than one team at once');

-- Tom moves from Smith Tiling to Jones Installations. History is kept, not overwritten.
select public.end_team_membership(:'tom_smith', private.site_today() - 1, 'Transferred to Jones Installations');
select public.end_team_membership(:'tom_smith', private.site_today() - 1, 'Retry of the same change');
select test.expect_error(format($q$select public.end_team_membership(%L, private.site_today(), 'Different date')$q$, :'tom_smith'),
  array['23514'], 'an ended membership cannot be silently re-dated');
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'jones', 'operative_id', :'tom'));
select test.assert((select valid_from = private.site_today() - 30 and valid_until = private.site_today() - 1 and ended_by = auth.uid()
  and end_reason = 'Transferred to Jones Installations' from public.team_memberships where id = :'tom_smith'),
  'the earlier Smith Tiling membership is preserved with its dates, actor and reason');
select test.assert((select count(*) = 2 from public.team_memberships where operative_id = :'tom'), 'both of Tom''s memberships remain on record');

-- A membership entered in error is voided, not deleted.
select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', :'smith', 'operative_id', :'jo')) as mistaken \gset
select test.expect_error(format($q$select public.void_team_membership(%L, 'no')$q$, :'mistaken'), array['22023'], 'voiding requires a meaningful reason');
select public.void_team_membership(:'mistaken', 'Jo was added to the wrong gang');
select test.assert((select voided_by = auth.uid() and void_reason = 'Jo was added to the wrong gang' from public.team_memberships where id = :'mistaken'),
  'a voided membership stays on record with who voided it and why');
-- Organisation-level audit (no contract) is owner-readable under the existing policy.
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001"}', true);
select test.assert((select count(*) = 4 from public.audit_events where (entity_id = :'tom_smith' or entity_id = :'mistaken')
  and actor_id = 'd1000000-0000-0000-0000-000000000002'),
  'membership creation, ending and voiding are each audited once with the manager as actor; the safe retry adds nothing');
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000002"}', true);
reset role;
select test.expect_error(format($q$update public.team_memberships set valid_from = valid_from - 100 where id = %L$q$, :'tom_smith'),
  array['42501'], 'membership start dates cannot be rewritten even by privileged SQL');
select test.expect_error(format($q$delete from public.team_memberships where id = %L$q$, :'mistaken'),
  array['42501'], 'membership history cannot be deleted even by privileged SQL');

-- Supervisors register unexpected operatives provisionally; the office confirms.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000003"}', true);
select public.create_operative(gen_random_uuid(), '{"display_name":"Replacement Labourer","engagement":"agency","company_name":"Site Labour Agency"}') as provisional \gset
select test.assert((select status = 'provisional' and created_by = auth.uid() from public.operatives where id = :'provisional'),
  'an operative registered by a supervisor is provisional and attributed');
select test.expect_error($q$select public.create_operative(gen_random_uuid(), '{"display_name":"Linked","engagement":"subcontractor","user_id":"d1000000-0000-0000-0000-000000000007"}')$q$,
  array['42501'], 'a supervisor cannot link an operative to a login');
select test.expect_error(format($q$select public.update_operative(%L, 1, '{"status":"active"}')$q$, :'provisional'),
  array['42501'], 'a supervisor cannot confirm their own provisional operative');
select test.expect_error($q$select public.create_team(gen_random_uuid(), '{"name":"Supervisor gang","kind":"temporary"}')$q$,
  array['42501'], 'a supervisor cannot create teams');
select test.expect_error(format($q$select public.end_team_membership(%L, private.site_today(), 'Supervisor change')$q$, :'sam_membership'),
  array['42501'], 'a supervisor cannot change team membership');
select test.assert((select count(*) = 7 from public.operatives) and (select count(*) = 4 from public.teams), 'supervisor sees the whole operative and team directory');
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000002"}', true);
select test.expect_error(format($q$select public.update_operative(%L, 1, '{"status":"provisional"}')$q$, :'provisional'),
  array['22023'], 'an operative cannot be returned to provisional');
select test.assert(public.update_operative(:'provisional', 1, '{"status":"active"}') = 2, 'the office confirms a provisional operative');
select test.expect_error(format($q$select public.update_operative(%L, 1, '{"display_name":"Stale"}')$q$, :'provisional'),
  array['40001'], 'a stale operative edit is rejected');

-- Installers see their own gang only, never another contractor's people.
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000004"}', true);
select test.assert((select array_agg(display_name order by display_name) = array['Lee Hart','Sam Smith'] from public.operatives),
  'Smith lead sees current gang members only, not the operative who has left or other contractors');
select test.assert((select array_agg(name) = array['Smith Tiling'] from public.teams), 'Smith lead sees only their own team');
select test.expect_error($q$select public.create_operative(gen_random_uuid(), '{"display_name":"Self registered","engagement":"subcontractor"}')$q$,
  array['42501'], 'an installer cannot register operatives');
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000005"}', true);
select test.assert((select array_agg(display_name order by display_name) = array['Jo Jones','Tom Baker'] from public.operatives),
  'Jones lead sees their gang including the operative who joined today');
select test.assert((select count(*) = 0 from public.teams where name = 'Smith Tiling'), 'Jones lead cannot see Smith Tiling');
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000007"}', true);
select test.assert((select count(*) = 0 from public.operatives) and (select count(*) = 0 from public.teams), 'an installer with no operative record sees no directory');
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000006"}', true);
select test.assert((select count(*) = 0 from public.operatives) and (select count(*) = 0 from public.team_memberships), 'another company sees none of these people');
select test.expect_error(format($q$select public.update_team(%L, 1, '{"name":"Hijacked"}')$q$, :'smith'), array['42501'], 'another company cannot edit a team');
reset role;
update public.organisation_members set active = false where user_id = 'd1000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000004"}', true);
select test.assert((select count(*) = 0 from public.operatives) and (select count(*) = 0 from public.teams), 'an inactive member loses directory access immediately');

-- Inactive teams accept no new members; their history remains.
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001"}', true);
select public.update_team(:'mixed', 1, '{"active":false}');
select test.expect_error(format($q$select public.add_team_member(gen_random_uuid(), jsonb_build_object('team_id', %L, 'operative_id', %L))$q$, :'mixed', :'lee'),
  array['23514'], 'an inactive team accepts no new members');
select test.assert((select count(*) = 2 from public.team_memberships where team_id = :'mixed'), 'an inactive team keeps its membership history');
reset role;
select test.assert(true, 'operatives, teams and effective-dated membership PASSED');
rollback;
