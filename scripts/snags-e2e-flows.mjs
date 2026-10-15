// Phase 3B A–M journeys: real Next pages/actions, signed caller JWTs,
// PostgREST, migrated PostgreSQL and RLS. Only Auth and Storage HTTP/byte
// transport are local protocol fixtures; no lifecycle response is fabricated.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2cAAAAASUVORK5CYII=', 'base64');
const image = (name = 'bathroom.png') => ({ name, mimeType: 'image/png', buffer: png });
const actionRequest = request => request.method() === 'POST' && !!request.headers()['next-action'];
const replayHeaders = headers => Object.fromEntries(Object.entries(headers).filter(([name]) => !['cookie', 'content-length', 'host'].includes(name)));

export async function runSnags({ browser, origin, sql, signIn, contractId, pass, screenshots, storage, gatewayOrigin, tokenFor }) {
  const contexts = [], consoleErrors = [];
  let expectedNetwork = false;
  const account = async (email, viewport = { width: 768, height: 1024 }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, locale: 'en-GB' }); contexts.push(context);
    const page = await signIn(context, origin, email);
    page.on('console', message => {
      if (message.type() !== 'error' || /favicon/.test(message.location().url)) return;
      if (expectedNetwork && /ERR_|Failed to fetch|status of (400|403|409|503)/i.test(message.text())) return;
      if (/(other|unassigned)@/.test(email) && /status of (403|404)/i.test(message.text())) return;
      consoleErrors.push(`${email}: ${message.text().slice(0, 1200)}`);
    });
    page.on('pageerror', error => consoleErrors.push(`${email}: ${String(error).slice(0, 1200)}`));
    context.setDefaultTimeout(45000);
    return page;
  };
  const page = await account('sid.supervisor@e2e.invalid');
  const manager = await account('mia.manager@e2e.invalid', { width: 1180, height: 820 });
  const sam = await account('sam.installer@e2e.invalid');
  const jo = await account('jo.installer@e2e.invalid');
  const intruder = await account('oscar.other@e2e.invalid');
  const unassigned = await account('fred.unassigned@e2e.invalid');
  const flat = sql(`select id from public.work_areas where name='Flat 52' and contract_id='${contractId}'`);
  const bathroom = sql(`select id from public.work_areas where name='Bathroom' and parent_id='${flat}'`);
  const repairTeam = sql("select id from public.teams where name='Jones Installations'");
  const version = id => Number(sql(`select version from public.supervisor_issues where id='${id}'`));
  const state = id => sql(`select snag_status from public.supervisor_issues where id='${id}'`);
  const eventCount = (id, action) => Number(sql(`select count(*) from public.supervisor_issue_events where issue_id='${id}'${action ? ` and action='${action}'` : ''}`));
  const detailUrl = id => `${origin}/admin/snags/${id}`;
  const registerUrl = `${origin}/admin/snags?contract_id=${contractId}`;
  const siteUrl = `${origin}/admin/supervisor/sites/${contractId}`;
  const openAdvanced = async target => {
    const advanced = target.locator('details').filter({ has: target.locator('summary').getByText('Repair, responsibility and history', { exact: true }) }).first();
    if (await advanced.count() && !await advanced.evaluate(element => element.open)) await advanced.locator('summary').first().click();
  };
  const panel = async (target, label) => {
    await openAdvanced(target);
    const details = target.locator(`details:has(> summary:text-is("${label}"))`);
    await details.waitFor();
    if (!await details.evaluate(element => element.open)) await details.locator('summary').click();
    return details.locator('form');
  };
  const mutate = async (target, id, label, note, fill) => {
    await target.goto(detailUrl(id));
    const form = await panel(target, label);
    await form.locator('textarea[name=note]').fill(note);
    if (fill) await fill(form);
    const before = eventCount(id);
    const saved = target.waitForResponse(response => actionRequest(response.request()));
    await form.getByRole('button', { name: label, exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 200);
    await openAdvanced(target);
    // A successful transition can legitimately remove its own action panel
    // (e.g. dispute or submit repair), including its transient success status.
    assert.equal(eventCount(id), before + 1, `${label} added exactly one permanent event`);
    await target.locator('section').filter({ has: target.getByRole('heading', { name: 'Permanent snag history', exact: true }) })
      .getByText(note, { exact: true }).waitFor();
    await target.reload();
    await openAdvanced(target);
  };
  const upload = async (target, id, purpose, name) => {
    await target.goto(detailUrl(id));
    await openAdvanced(target);
    const region = target.getByRole('region', { name: `${purpose} photograph uploads`, exact: true });
    await region.getByLabel('Choose photographs', { exact: true }).setInputFiles(image(name));
    await region.getByRole('button', { name: 'Upload photographs', exact: true }).click();
    await region.getByText('Verified in private storage', { exact: true }).waitFor();
    const photo = sql(`select id from public.supervisor_issue_photos where issue_id='${id}' and purpose='${purpose}'
      and uploaded_at is not null and event_id is null order by created_at desc limit 1`);
    assert.ok(photo, `${purpose} bytes and record verified`);
    return photo;
  };
  const create = async (target, { description, severity = 'major', inspection, category = 'Excessive lippage', fault = false, lose }) => {
    await target.goto(`${origin}/admin/snags/new?contract=${contractId}${inspection ? `&inspection=${inspection}` : ''}`);
    const findingForm = target.locator('main form').filter({ has: target.locator('input[name=contract_id]') });
    if (!inspection) {
      await target.getByRole('searchbox', { name: 'Exact location', exact: true }).fill('52 bath');
      await target.getByRole('list', { name: 'Exact location choices' }).getByRole('button', { name: 'Block B › Level 5 › Flat 52 › Bathroom', exact: true }).click();
    }
    await target.getByText('More details', { exact: true }).click();
    await target.locator('select[name=category]').selectOption(category);
    await target.locator('select[name=severity]').selectOption(severity);
    await target.locator('textarea[name=description]').fill(description);
    await target.locator('textarea[name=required_rectification]').fill('Remove affected tiles and reset flush to the specification.');
    await target.getByLabel('Choose photographs', { exact: true }).setInputFiles([image('original-wide.png'), image('original-detail.png')]);
    assert.equal(await target.getByLabel('Take photograph', { exact: true }).getAttribute('capture'), 'environment');
    if (lose) {
      if (lose === 'proposal') {
        await target.locator('select[name=responsibility_allocation]').selectOption('unknown');
        await target.locator('textarea[name=responsibility_note]').fill('Actual attendance does not establish who caused this defect.');
      }
      let dispatches = 0;
      const loseDispatch = { create: 1, submit: 2, proposal: 3 }[lose];
      expectedNetwork = true;
      await target.route('**/*', async route => {
        if (!actionRequest(route.request())) return route.continue();
        dispatches++;
        if (dispatches !== loseDispatch) return route.continue();
        try { await route.fetch(); }
        catch (error) { throw new Error(`Lost-response fixture request failed: ${String(error.message).split('\n')[0]}`); }
        await route.abort('connectionreset');
      });
      await target.getByRole('button', { name: 'Submit snag', exact: true }).click();
      await findingForm.getByRole('alert').first().waitFor();
      const id = sql(`select id from public.supervisor_issues where description='${description}'`);
      assert.ok(id, `${lose} request actually reached PostgreSQL before response loss`);
      assert.equal(await target.locator('textarea[name=description]').isDisabled(), true);
      assert.equal(await target.locator('select[name=responsibility_allocation]').isDisabled(), true);
      assert.equal(eventCount(id, 'create_draft'), 1);
      if (lose !== 'create') {
        assert.equal(state(id), 'open');
        assert.equal(eventCount(id, 'submit'), 1);
        assert.equal(await target.getByLabel('Choose photographs', { exact: true }).isDisabled(), true);
        assert.equal(await target.getByLabel('Take photograph', { exact: true }).isDisabled(), true);
        assert.equal(await target.getByRole('button', { name: 'Remove unsaved selection', exact: true }).count(), 0);
      } else {
        assert.equal(state(id), 'draft');
        assert.equal(eventCount(id, 'submit'), 0);
      }
      if (lose === 'proposal') await target.getByRole('status').filter({ hasText: 'Snag submitted with verified photographs' }).waitFor();
      await target.unroute('**/*');
      await target.getByRole('button', { name: lose === 'create' ? 'Retry original findings' : lose === 'proposal' ? 'Retry responsibility proposal' : 'Retry verification and submission', exact: true }).click();
      await target.waitForURL(`**/admin/snags/${id}`);
      await openAdvanced(target);
      expectedNetwork = false;
      assert.equal(eventCount(id, 'create_draft'), 1);
      assert.equal(eventCount(id, 'submit'), 1);
      assert.equal(sql(`select count(*) from public.supervisor_issues where description='${description}'`), '1');
      assert.equal(sql(`select count(*) from public.supervisor_issue_photos where issue_id='${id}' and event_id is not null`), '2');
      if (lose === 'proposal') {
        assert.equal(eventCount(id, 'mark_unknown'), 1);
        assert.equal(sql(`select responsibility_state from public.supervisor_issues where id='${id}'`), 'unable_to_determine');
      }
      return id;
    }
    if (fault) {
      expectedNetwork = true;
      storage.faults.failUploads = 1;
      await target.getByRole('button', { name: 'Submit snag', exact: true }).click();
      await target.getByRole('alert').filter({ hasText: /not been confirmed saved|remains pending|could not confirm/i }).first().waitFor();
      const id = sql(`select id from public.supervisor_issues where description='${description}'`);
      assert.equal(state(id), 'draft');
      assert.equal(eventCount(id, 'submit'), 0);
      assert.equal(sql(`select count(*) from public.supervisor_issue_photos where issue_id='${id}' and uploaded_at is not null`), '0');
      assert.equal(await target.getByText('Verified in private storage', { exact: true }).count(), 0);
      // Successful object upload, corrupted verifier response: equal file size
      // and MIME are insufficient; the exact downloaded byte hash must match.
      storage.faults.corruptDownloads = 1;
      await target.getByRole('button', { name: 'Retry verification and submission', exact: true }).click();
      await target.getByRole('alert').filter({ hasText: 'stored file does not match' }).first().waitFor();
      assert.equal(state(id), 'draft');
      assert.equal(eventCount(id, 'submit'), 0);
      assert.equal(sql(`select count(*) from public.supervisor_issue_photos where issue_id='${id}' and uploaded_at is not null`), '0');
      await target.getByRole('button', { name: 'Retry verification and submission', exact: true }).click();
      await target.waitForURL(`**/admin/snags/${id}`);
      await openAdvanced(target);
      expectedNetwork = false;
      return id;
    }
    await target.getByRole('button', { name: 'Submit snag', exact: true }).click();
    await target.waitForURL(url => /^\/admin\/snags\/[0-9a-f-]{36}$/.test(url.pathname));
    await openAdvanced(target);
    return target.url().split('/').at(-1);
  };
  const rest = async (email, path, method = 'GET', data, headers = {}) => fetch(`${gatewayOrigin}${path}`, {
    method, headers: { authorization: `Bearer ${tokenFor(email)}`, 'content-type': 'application/json', ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });

  try {
    if (sql('select count(*) from public.location_inspections') === '0') {
      // Focused developer runs still create prerequisites using the real public
      // APIs, not invented lifecycle rows. Normal full-suite runs already have
      // the workforce and failed inspection from the preceding journeys.
      sql(`begin; set local role authenticated;
       select set_config('request.jwt.claims','{"sub":"e2e00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
       select public.record_actual_allocation(gen_random_uuid(),jsonb_build_object('contract_id','${contractId}','work_area_id','${flat}',
        'team_id',(select id from public.teams where name='Smith Tiling'),'stage','installation',
        'operative_ids',jsonb_build_array((select id from public.operatives where display_name='Sam Smith')),
        'started_at','${new Date(Date.now()-3*86400000).toISOString()}','ended_at','${new Date(Date.now()-3*86400000+2*3600000).toISOString()}',
        'reason','Previous completed bathroom installation'));
       select public.create_location_inspection_template(gen_random_uuid(),jsonb_build_object('contract_id','${contractId}',
        'work_area_id',(select id from public.work_areas where name='Flat 54'),'stage','grouting','title','Grout quality',
        'specification_reference','GROUT-54','specification_revision','A','wet_area',false,
        'checklist','[{"label":"Grout joints filled","wet_only":false}]'::jsonb));
       select public.record_location_inspection(gen_random_uuid(),jsonb_build_object('contract_id','${contractId}',
        'work_area_id',(select w.id from public.work_areas w join public.work_areas p on p.id=w.parent_id where p.name='Flat 54' and w.name='Bathroom'),
        'template_id',(select id from public.location_inspection_templates where title='Grout quality'),
        'answers','[{"status":"issue","note":"Joint beside doorway incomplete"}]'::jsonb,'allocation_ids','[]'::jsonb));
       commit;`);
    }
    // Another actual installation period, created by the ordinary workforce
    // RPC after existing regression journeys so their attendance counts stay
    // unchanged. No planned allocation is treated as proof of work.
    sql(`begin; set local role authenticated;
      select set_config('request.jwt.claims','{"sub":"e2e00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
      select public.record_actual_allocation(gen_random_uuid(),jsonb_build_object('contract_id','${contractId}','work_area_id','${bathroom}',
       'team_id','${repairTeam}','stage','installation','operative_ids',jsonb_build_array((select id from public.operatives where display_name='Jo Jones')),
       'started_at','${new Date(Date.now()-2*86400000).toISOString()}','ended_at','${new Date(Date.now()-2*86400000+2*3600000).toISOString()}',
       'reason','Earlier bathroom installation period'));
      commit;`);
    const membershipBefore = sql('select md5(string_agg(to_jsonb(m)::text,\'\' order by id)) from public.team_memberships m');
    await page.goto(`${origin}/admin/snags/new?contract=${contractId}`);
    await page.getByRole('searchbox', { name: 'Exact location', exact: true }).fill('52 bath');
    await page.getByRole('list', { name: 'Exact location choices' }).getByRole('button', { name: 'Block B › Level 5 › Flat 52 › Bathroom', exact: true }).click();
    await page.getByText('More details', { exact: true }).click();
    const candidates = page.getByRole('region', { name: 'Historical workforce candidates', exact: true });
    for (const name of ['Smith Tiling', 'Jones Installations', 'Sam Smith', 'Jo Jones']) await candidates.getByText(name, { exact: false }).first().waitFor();
    assert.equal(await candidates.locator('select[name=responsibility_allocation]').inputValue(), '');
    pass('3B C: actual gangs, named operatives and work times appear for Flat 52 Bathroom without automatically assigning fault');

    const id = await create(page, { description: 'Three bathroom tiles have excessive lippage beside the doorway', fault: true });
    assert.equal(state(id), 'open');
    assert.equal(eventCount(id, 'create_draft'), 1);
    assert.equal(eventCount(id, 'submit'), 1);
    assert.equal(sql(`select responsibility_state from public.supervisor_issues where id='${id}'`), 'not_assessed');
    assert.equal(sql(`select count(*) from public.supervisor_issue_photos where issue_id='${id}' and purpose='original' and uploaded_at is not null and event_id is not null`), '2');
    const originalPhotos = JSON.parse(sql(`select jsonb_agg(jsonb_build_object('id',id,'path',object_path,'sha256',sha256,'bytes',bytes)) from public.supervisor_issue_photos where issue_id='${id}'`));
    await page.waitForFunction(() => {
      const photographs = [...document.querySelectorAll('figure img')];
      return photographs.length === 2 && photographs.every(photo => photo.complete && photo.naturalWidth > 0);
    });
    for (const photo of originalPhotos) {
      assert.deepEqual(storage.bytes(`supervisor-evidence/${photo.path}`), png);
      assert.equal(photo.sha256, createHash('sha256').update(png).digest('hex'));
      const reviewed = await page.context().request.get(`${origin}/admin/snags/photos/${photo.id}`);
      assert.equal(reviewed.status(), 200);
      assert.match(reviewed.url(), /\/storage\/v1\/object\/sign\//);
      assert.deepEqual(await reviewed.body(), png);
      assert.match(reviewed.headers()['cache-control'], /private/);
    }
    pass('3B A/K: multiple camera photographs survive upload failure and corrupt verification; retry saves one snag only after exact bytes, private storage metadata and database records agree');

    await create(page, { description: 'Lost original findings response keeps this exact bathroom snag', lose: 'create' });
    await create(page, { description: 'Lost submitted snag response keeps the verified photograph set', lose: 'submit' });
    await create(page, { description: 'Lost responsibility response retries only the saved proposal', lose: 'proposal' });
    pass('3B L: lost creation, submission and proposal responses freeze the exact original fields and photographs; retries create one draft, submission and proposal only');

    // Tenant boundary at the page, server upload, database RPC and private byte
    // routes. Same-organisation installers without assignment are also refused.
    expectedNetwork = true;
    for (const denied of [intruder, unassigned]) {
      assert.equal((await denied.goto(detailUrl(id))).status(), 404);
      assert.equal((await denied.context().request.get(`${origin}/admin/snags/photos/${originalPhotos[0].id}`)).status(), 404);
    }
    const emailOther = 'oscar.other@e2e.invalid';
    const privatePath = `/storage/v1/object/supervisor-evidence/${originalPhotos[0].path}`;
    assert.equal((await rest(emailOther, privatePath)).status, 403);
    assert.equal((await rest(emailOther, privatePath.replace('/object/', '/object/sign/'), 'POST', { expiresIn: 60 })).status, 403);
    assert.equal((await rest('sid.supervisor@e2e.invalid', privatePath.replace('/object/', '/object/public/'))).status, 403);
    const crossContext = await rest(emailOther, '/rest/v1/rpc/snag_context', 'POST', { p_issue: id });
    assert.equal(crossContext.status, 403);
    const ordinaryVerify = await rest('sid.supervisor@e2e.invalid', '/rest/v1/rpc/complete_snag_photo', 'POST', {
      p_photo: originalPhotos[0].id, p_actor: 'e2e00000-0000-4000-8000-000000000001', p_sha256: originalPhotos[0].sha256 });
    assert.equal(ordinaryVerify.status, 403, 'ordinary signed-in users cannot certify stored bytes');
    expectedNetwork = false;
    pass('3B J: another tenant and an unassigned installer cannot read snags or private photos; ordinary callers cannot perform trusted storage verification');

    const smithAllocation = sql(`select a.id from public.actual_allocations a join public.teams t on t.id=a.team_id where t.name='Smith Tiling' and a.work_area_id='${flat}' and a.stage='installation' order by a.started_at limit 1`);
    await mutate(page, id, 'Propose responsible gang', 'Installation attendance suggests a review of the Smith gang; responsibility is a proposal.', async form => {
      await form.locator('select[name=allocation_id]').selectOption(smithAllocation);
    });
    assert.equal(sql(`select responsibility_state from public.supervisor_issues where id='${id}'`), 'proposed');
    await sam.goto(detailUrl(id));
    assert.equal(await sam.getByRole('region', { name: 'original photograph uploads', exact: true }).count(), 0);
    assert.equal(await sam.getByText('Actual workforce at this location and stage', { exact: true }).count(), 0);
    await mutate(sam, id, 'Dispute responsibility', 'Our original work was signed off before another contractor entered the bathroom.');
    assert.equal(sql(`select responsibility_state from public.supervisor_issues where id='${id}'`), 'disputed');
    await manager.goto(`${registerUrl}&disputed=on`);
    await manager.getByText('Three bathroom tiles have excessive lippage beside the doorway', { exact: true }).waitFor();
    await mutate(manager, id, 'Office responsibility decision', 'Office reviewed original attendance and photographs; Smith remains the confirmed proposed gang.', async form => {
      await form.locator('select[name=decision]').selectOption('confirmed');
    });
    assert.equal(sql(`select responsibility_state from public.supervisor_issues where id='${id}'`), 'confirmed');
    assert.equal(eventCount(id, 'dispute_responsibility'), 1);
    assert.equal(eventCount(id, 'review_responsibility'), 1);
    const sanitized = await rest('sam.installer@e2e.invalid', '/rest/v1/rpc/snag_events', 'POST', { p_issue: id });
    assert.equal(sanitized.status, 200);
    const proposalEvent = (await sanitized.json()).find(event => event.action === 'propose_responsibility');
    assert.equal(Object.hasOwn(proposalEvent.snapshot, 'attendance'), false);
    assert.equal(Object.hasOwn(proposalEvent.snapshot, 'work_presence'), false);
    await sam.goto(detailUrl(id));
    assert.equal(await sam.getByText('Recorded workforce evidence for this proposal', { exact: true }).count(), 0);
    await page.goto(detailUrl(id));
    await openAdvanced(page);
    await page.getByText('Recorded workforce evidence for this proposal', { exact: true }).waitFor();
    pass('3B D: the actual proposed gang disputes responsibility, the office records an immutable decision, and installers cannot read private workforce snapshots');

    // Lose an assignment reply after the real server/database saved it. Keep
    // the original form/key and replay it; no duplicate event or repair cycle.
    await page.goto(detailUrl(id));
    const assignment = await panel(page, 'Assign or reassign rectification');
    await assignment.locator('select[name=team_id]').selectOption(repairTeam);
    await assignment.locator('textarea[name=required_action]').fill('Jones team to reset three tiles flush, protecting surrounding finishes.');
    await assignment.getByLabel('Target date', { exact: true }).fill(sql('select (private.site_today()-1)::text'));
    await assignment.locator('textarea[name=note]').fill('A different gang will carry out the repair; original responsibility remains with the reviewed proposal.');
    let capturedAssignment;
    expectedNetwork = true;
    await page.route('**/*', async route => {
      if (!actionRequest(route.request())) return route.continue();
      const request = route.request();
      capturedAssignment = { url: request.url(), headers: await request.allHeaders(), body: request.postDataBuffer() };
      await route.fetch(); await route.abort('connectionreset');
    });
    await assignment.getByRole('button', { name: 'Assign or reassign rectification', exact: true }).click();
    await assignment.getByRole('alert').filter({ hasText: 'could not confirm this was saved' }).waitFor();
    assert.equal(state(id), 'assigned');
    assert.equal(eventCount(id, 'assign'), 1);
    await page.unroute('**/*');
    await assignment.getByRole('button', { name: 'Assign or reassign rectification', exact: true }).click();
    await assignment.getByRole('status').waitFor();
    expectedNetwork = false;
    assert.equal(eventCount(id, 'assign'), 1);
    const assignmentEvents = eventCount(id);
    for (const denied of [intruder, unassigned]) {
      const replay = await denied.context().request.post(capturedAssignment.url, {
        headers: replayHeaders(capturedAssignment.headers), data: capturedAssignment.body,
      });
      assert.match(await replay.text(), /You do not have permission for this operation/);
    }
    assert.equal(eventCount(id), assignmentEvents, 'unauthorised action replays add no lifecycle history');
    assert.equal(sql(`select (assigned_team_id<>responsibility_team_id)::text from public.supervisor_issues where id='${id}'`), 'true');
    await page.goto(`${registerUrl}&overdue=on&assigned_team_id=${repairTeam}`);
    await page.getByText('Three bathroom tiles have excessive lippage beside the doorway', { exact: true }).waitFor();
    pass('3B L: a lost assignment response retries safely without duplicate lifecycle events; the repair gang remains separate from original responsibility and overdue filters use saved targets');

    await jo.goto(detailUrl(id));
    assert.equal(await jo.getByText('Office responsibility decision', { exact: true }).count(), 0);
    assert.equal(await jo.getByText('Accept rectification and close', { exact: true }).count(), 0);
    expectedNetwork = true;
    const deniedOriginal = await jo.context().request.post(`${origin}/api/supervisor/snags/${id}/photos`, { multipart: {
      request_key: randomUUID(), purpose: 'original', file: image('installer-original.png'),
    } });
    assert.equal(deniedOriginal.status(), 403);
    assert.equal((await rest('jo.installer@e2e.invalid', '/storage/v1/object/supervisor-evidence', 'DELETE', { prefixes: [originalPhotos[0].path] })).status, 403);
    const overwrite = await fetch(`${gatewayOrigin}${privatePath}`, { method: 'POST', headers: {
      authorization: `Bearer ${tokenFor('jo.installer@e2e.invalid')}`, 'content-type': 'image/png', 'x-upsert': 'true' }, body: png });
    assert.equal(overwrite.status, 403);
    expectedNetwork = false;
    assert.deepEqual(storage.bytes(`supervisor-evidence/${originalPhotos[0].path}`), png);
    const deniedDecision = await rest('jo.installer@e2e.invalid', '/rest/v1/rpc/transition_snag', 'POST', {
      p_issue: id, p_request_key: randomUUID(), p_version: version(id), p_action: 'review_responsibility',
      p_data: { note: 'Attempt to change original liability from the assigned repair account', decision: 'unable_to_determine' },
    });
    assert.equal(deniedDecision.status, 403);
    assert.equal(sql(`select responsibility_state from public.supervisor_issues where id='${id}'`), 'confirmed');
    const repairPhoto1 = await upload(jo, id, 'rectification', 'repair-first-attempt.png');
    await mutate(jo, id, 'Submit repair for reinspection', 'Three tiles reset and ready for independent review.');
    assert.equal(state(id), 'rectification_submitted');
    assert.equal(sql(`select event_id is not null from public.supervisor_issue_photos where id='${repairPhoto1}'`), 't');
    await page.goto(`${registerUrl}&awaiting_reinspection=on`);
    await page.getByText('Three bathroom tiles have excessive lippage beside the doorway', { exact: true }).waitFor();
    pass('3B E: the different assigned repair gang submits verified completion evidence for reinspection; installers cannot replace original findings, delete photos or decide liability');

    await mutate(page, id, 'Start reinspection', 'Inspecting the first repair independently.');
    const rejectPhoto = await upload(page, id, 'reinspection', 'first-repair-rejected.png');
    await mutate(page, id, 'Reject — further work required', 'Lippage remains on one tile; the previous repair is rejected and more work is required.');
    assert.equal(state(id), 'open');
    assert.equal(eventCount(id, 'submit_rectification'), 1);
    assert.equal(eventCount(id, 'reject'), 1);
    assert.equal(sql(`select count(*) from public.supervisor_issue_photos where id in ('${repairPhoto1}','${rejectPhoto}') and event_id is not null`), '2');
    const repairPhoto2 = await upload(jo, id, 'rectification', 'repair-second-attempt.png');
    await mutate(jo, id, 'Submit repair for reinspection', 'Remaining tile reset; second repair is ready for independent review.');
    await mutate(page, id, 'Start reinspection', 'Starting independent inspection of the second repair.');
    pass('3B F: rejection reopens the snag while retaining the failed repair, its photographs, reinspection evidence and every earlier decision');
    await upload(manager, id, 'reinspection', 'second-repair-accepted.png');
    await mutate(manager, id, 'Accept rectification and close', 'Independent office inspection accepts the second repair after the earlier dispute escalation.');
    assert.equal(state(id), 'closed');
    assert.equal(eventCount(id, 'submit_rectification'), 2);
    assert.equal(eventCount(id, 'accept'), 1);
    assert.equal(sql(`select closed_by<>rectified_by from public.supervisor_issues where id='${id}'`), 't');
    assert.equal(sql(`select event_id is not null from public.supervisor_issue_photos where id='${repairPhoto2}'`), 't');
    pass('3B G: independent authorised inspection closes the accepted second repair; original findings and both repair cycles remain permanent');

    // Inspection-linked creation uses the actual Phase 3A history screen and
    // link. Store the complete original row before/after, including answers.
    const inspection = sql('select id from public.location_inspections where issues_count>0 order by created_at limit 1');
    const originalInspection = sql(`select to_jsonb(i)::text from public.location_inspections i where id='${inspection}'`);
    const inspectionArea = sql(`select work_area_id from public.location_inspections where id='${inspection}'`);
    await page.goto(`${siteUrl}/inspections?location=${inspectionArea}`);
    const history = page.locator('details').filter({ has: page.locator('summary').getByText('Saved inspection history', { exact: true }) }).first();
    if (!await history.evaluate(element => element.open)) await history.locator('summary').first().click();
    // The previous regression journey deliberately generated 50 later records.
    // Count the collapsed record's DOM link before deciding whether the failed
    // inspection is on a later page; role locators intentionally hide links in
    // closed <details>, which is unrelated to pagination.
    const linked = page.locator(`a[href*="inspection=${inspection}"]`);
    if (!await linked.count()) await page.getByRole('link', { name: 'Earlier inspections', exact: true }).click();
    const linkedRecord = page.locator(`#inspection-${inspection}`);
    if (!await linkedRecord.evaluate(element => element.open)) await linkedRecord.locator('summary').first().click();
    const linkedHref = await linkedRecord.getByRole('link', { name: 'Create linked snag', exact: true }).getAttribute('href');
    assert.match(linkedHref, new RegExp(`inspection=${inspection}`));
    const linkedId = await create(page, { description: 'Linked snag for the incomplete doorway grout joint', inspection, category: 'Grout defects' });
    assert.equal(sql(`select location_inspection_id from public.supervisor_issues where id='${linkedId}'`), inspection);
    assert.equal(sql(`select to_jsonb(i)::text from public.location_inspections i where id='${inspection}'`), originalInspection);
    pass('3B B: a confirmed snag links to the failed Phase 3A inspection without changing its checklist answers or historical row');

    // Repair submitted by Sid: use the office's actual accept action request
    // with Sid's cookie jar to prove the server/database reject self-approval.
    const selfId = await create(page, { description: 'Self-approval separation test for the bathroom edge tile' });
    await mutate(page, selfId, 'Assign or reassign rectification', 'Assigning this repair for a separation-of-duties check.', async form => {
      await form.locator('select[name=team_id]').selectOption(repairTeam);
      await form.getByLabel('Target date', { exact: true }).fill(sql('select private.site_today()::text'));
    });
    await upload(page, selfId, 'rectification', 'supervisor-submitted-repair.png');
    await mutate(page, selfId, 'Submit repair for reinspection', 'Supervisor recorded the repair completion for review by another inspector.');
    await mutate(page, selfId, 'Start reinspection', 'A separate acceptance decision is still required.');
    await page.getByText('You submitted this repair. A different authorised inspector must accept it.', { exact: true }).waitFor();
    assert.equal(await page.locator('summary').filter({ hasText: 'Accept rectification and close' }).count(), 0);
    await manager.goto(detailUrl(selfId));
    const accept = await panel(manager, 'Accept rectification and close');
    await accept.locator('textarea[name=note]').fill('Independent manager inspection accepts the repaired tile.');
    let capturedAccept;
    expectedNetwork = true;
    await manager.route('**/*', async route => {
      if (!actionRequest(route.request())) return route.continue();
      const request = route.request();
      capturedAccept = { url: request.url(), headers: await request.allHeaders(), body: request.postDataBuffer() };
      await route.abort('internetdisconnected');
    });
    await accept.getByRole('button', { name: 'Accept rectification and close', exact: true }).click();
    await accept.getByRole('alert').filter({ hasText: 'could not confirm this was saved' }).waitFor();
    await manager.unroute('**/*');
    const selfReplay = await page.context().request.post(capturedAccept.url, { headers: replayHeaders(capturedAccept.headers), data: capturedAccept.body });
    assert.match(await selfReplay.text(), /You do not have permission for this operation/i);
    assert.equal(state(selfId), 'reinspection');
    assert.equal(eventCount(selfId, 'accept'), 0);
    const independentAcceptance = manager.waitForResponse(response => actionRequest(response.request()));
    await accept.getByRole('button', { name: 'Accept rectification and close', exact: true }).click();
    assert.equal((await independentAcceptance).status(), 200);
    await manager.locator('section').filter({ has: manager.getByRole('heading', { name: 'Permanent snag history', exact: true }) })
      .getByText('Independent manager inspection accepts the repaired tile.', { exact: true }).waitFor();
    expectedNetwork = false;
    assert.equal(state(selfId), 'closed');
    pass('3B H: replaying a real acceptance action as the repair submitter is denied by the database; an independent manager can accept it');

    const criticalId = await create(page, { description: 'Potential waterproofing failure at the shower junction', severity: 'critical', category: 'Waterproofing concerns' });
    assert.equal(sql(`select escalated from public.supervisor_issues where id='${criticalId}'`), 't');
    await page.getByText('Critical defect — immediate office review', { exact: true }).waitFor();
    await page.getByText('This is an escalation, not a formal stop-work hold.', { exact: true }).waitFor();
    await page.goto(registerUrl);
    await page.getByText(/critical defect.*require immediate office review/).first().waitFor();
    await page.goto(siteUrl);
    assert.ok(await page.getByRole('link', { name: /critical|review/i }).count() > 0, 'dashboard next action highlights saved critical snag');
    pass('3B I: critical snags escalate prominently in detail, register and dashboard without claiming formal stop-work permission');

    const savedHistory = sql(`select jsonb_agg(to_jsonb(e) order by id)::text from public.supervisor_issue_events e where issue_id='${id}'`);
    const savedEvidence = sql(`select jsonb_agg(to_jsonb(p) order by id)::text from public.supervisor_issue_photos p where issue_id='${id}'`);
    await page.goto(detailUrl(id)); await page.reload();
    await openAdvanced(page);
    await page.getByText('Three bathroom tiles have excessive lippage beside the doorway', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Permanent snag history', exact: true }).waitFor();
    assert.equal(sql(`select jsonb_agg(to_jsonb(e) order by id)::text from public.supervisor_issue_events e where issue_id='${id}'`), savedHistory);
    assert.equal(sql(`select jsonb_agg(to_jsonb(p) order by id)::text from public.supervisor_issue_photos p where issue_id='${id}'`), savedEvidence);
    assert.equal(await page.locator('figure').count(), 6);
    assert.equal(sql('select md5(string_agg(to_jsonb(m)::text,\'\' order by id)) from public.team_memberships m'), membershipBefore);
    assert.ok(storage.stats.signedReviews >= 2);
    assert.ok(storage.stats.downloads >= 6);
    pass('3B M: a reload preserves closed status, private original/repair/reinspection photographs and complete history; defect attribution never changes permanent gang membership');

    await page.goto(registerUrl);
    const filters = page.locator('main form').filter({ has: page.locator('input[name=search]') });
    await filters.locator('input[name=search]').fill('bathroom lippage doorway');
    await filters.locator('select[name=location_id]').selectOption(bathroom);
    await filters.locator('select[name=stage]').selectOption('installation');
    await filters.locator('select[name=category]').selectOption('Excessive lippage');
    await filters.locator('select[name=severity]').selectOption('major');
    await filters.locator('select[name=status]').selectOption('closed');
    await filters.locator('select[name=assigned_team_id]').selectOption(repairTeam);
    await filters.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('search') === 'bathroom lippage doorway');
    assert.equal(await page.locator('main article').count(), 1);
    await page.getByText('Three bathroom tiles have excessive lippage beside the doorway', { exact: true }).waitFor();
    pass('3B register: browser search and combined location/stage/category/severity/status/repair-party filters return the saved matching snag');

    // Ordinary site devices, including expanded action panels and upload forms.
    const screens = [['snag-register', registerUrl], ['raise-snag', `${origin}/admin/snags/new?contract=${contractId}`],
      ['snag-history', detailUrl(id)], ['critical-snag', detailUrl(criticalId)], ['repair-snag', detailUrl(linkedId)]];
    for (const viewport of [{ name: 'phone', width: 390, height: 844 }, { name: 'tablet-portrait', width: 768, height: 1024 }, { name: 'tablet-landscape', width: 1180, height: 820 }]) {
      for (const [name, url] of screens) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(url); await page.getByRole('main').waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('details, form')].every(element => Object.keys(element).some(key => key.startsWith('__reactFiber'))));
        await page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true; }));
        const problems = await page.evaluate(() => {
          const found = [];
          if (document.documentElement.scrollWidth > innerWidth + 1) found.push(`Page ${document.documentElement.scrollWidth}px exceeds viewport ${innerWidth}px`);
          for (const element of document.querySelectorAll('button, summary, select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), a[class*="utton"], label:has(> input[type=checkbox])')) {
            const box = element.getBoundingClientRect(); if (!box.height || !box.width) continue;
            if (box.height < 43.5) found.push(`${element.tagName} ${(element.textContent || element.getAttribute('name') || '').trim().slice(0, 45)} is ${box.height}px tall`);
            if (box.right > innerWidth + 1) found.push(`${element.tagName} overflows to ${box.right}px`);
          }
          return [...new Set(found)];
        });
        assert.deepEqual(problems, [], `${name} on ${viewport.name}`);
        if (screenshots) await page.screenshot({ path: join(screenshots, `${name}-${viewport.name}.png`), fullPage: true, caret: 'initial', style: 'nextjs-portal { display: none !important; }' });
      }
      pass(`3B snag register, creation, repair and permanent history fit ${viewport.name} with 44px touch controls`);
    }
    // Disposable cancelled records exercise a genuinely paged register without
    // inventing saved photographic evidence or altering existing history.
    sql(`begin; set local role authenticated;
      select set_config('request.jwt.claims','{"sub":"e2e00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
      select public.transition_snag(created,gen_random_uuid(),1,'cancel','{"note":"Entered only for disposable register pagination coverage"}'::jsonb)
      from (select public.create_snag(gen_random_uuid(),jsonb_build_object('contract_id','${contractId}','work_area_id','${bathroom}',
       'stage','installation','category','Other','severity','minor','description','Pagination fixture '||n,
       'required_rectification','No repair; entered for a disposable pagination test')) created from generate_series(1,51) n) q;
      commit;`);
    await page.goto(`${registerUrl}&search=Pagination&status=cancelled`);
    assert.equal(await page.locator('main article').count(), 50);
    await page.getByRole('link', { name: 'Next page', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('page') === '1');
    assert.equal(await page.locator('main article').count(), 1);
    await page.getByRole('link', { name: 'Previous page', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('page') === '0');
    assert.equal(await page.locator('main article').count(), 50);
    assert.equal(sql(`select jsonb_agg(to_jsonb(e) order by id)::text from public.supervisor_issue_events e where issue_id='${id}'`), savedHistory);
    pass('3B register: search filters persist across next/previous pages beyond 50 records and original snag history remains accessible');
    assert.deepEqual(consoleErrors, [], 'unexpected browser errors in Phase 3B journeys');
    pass('3B authenticated A–M journeys completed without unexpected browser errors');
  } catch (error) {
    console.error(`Snag journey failure: ${String(error.message).split('\nCall log:')[0]}`);
    for (const context of contexts) for (const target of context.pages()) {
      console.error(`Snag journey page: ${target.url()}\n${(await target.locator('body').innerText({ timeout: 3000 }).catch(() => '(unreadable)')).slice(0, 3000)}`);
    }
    throw error;
  } finally {
    for (const context of contexts) {
      for (const target of context.pages()) await target.unrouteAll({ behavior: 'ignoreErrors' });
      await context.close();
    }
  }
}
