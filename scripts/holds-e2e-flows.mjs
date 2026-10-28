// Phase 3C A–P acceptance: real authenticated Next pages/actions, PostgREST,
// all migrations and PostgreSQL RLS. The local Auth and Storage transports
// never manufacture a lifecycle response or bypass business permissions.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2cAAAAASUVORK5CYII=', 'base64');
const image = (name = 'hold-evidence.png') => ({ name, mimeType: 'image/png', buffer: png });
const actionRequest = request => request.method() === 'POST' && !!request.headers()['next-action'];
const replayHeaders = headers => Object.fromEntries(Object.entries(headers).filter(([name]) => !['cookie', 'content-length', 'host'].includes(name)));
const emails = { supervisor: 'ada.supervisor@e2e.invalid', manager: 'mia.manager@e2e.invalid', reviewer: 'bea.manager@e2e.invalid',
  owner: 'grace.owner@e2e.invalid', installer: 'jo.installer@e2e.invalid', other: 'oscar.other@e2e.invalid', unassigned: 'fred.unassigned@e2e.invalid' };
const ids = { organisation: 'e2e00000-0000-4000-8000-0000000000a1', supervisor: 'e2e00000-0000-4000-8000-000000000008',
  manager: 'e2e00000-0000-4000-8000-000000000002', reviewer: 'e2e00000-0000-4000-8000-000000000007', installer: 'e2e00000-0000-4000-8000-000000000005' };

export async function runHolds({ browser, origin, sql, signIn, pass, screenshots, storage, rpcFaults, gatewayOrigin, tokenFor, log }) {
  const contexts = [], consoleErrors = [];
  let expectedNetwork = false;
  const rest = (email, path, method = 'GET', data, headers = {}) => fetch(`${gatewayOrigin}${path}`, {
    method, headers: { authorization: `Bearer ${tokenFor(email)}`, 'content-type': 'application/json', ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const rpc = async (email, name, data) => {
    const response = await rest(email, `/rest/v1/rpc/${name}`, 'POST', data);
    const result = await response.json();
    assert.equal(response.status, 200, `${name}: ${JSON.stringify(result)}`);
    return result;
  };
  const account = async (email, viewport = { width: 768, height: 1024 }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, locale: 'en-GB' }); contexts.push(context);
    const page = await signIn(context, origin, email);
    page.on('console', message => {
      if (message.type() !== 'error' || /favicon/.test(message.location().url)) return;
      if (expectedNetwork && /ERR_|Failed to fetch|status of (400|403|404|409|503)/i.test(message.text())) return;
      if (/(other|unassigned)@/.test(email) && /status of (403|404)/i.test(message.text())) return;
      consoleErrors.push(`${email}: ${message.text().slice(0, 1500)}`);
    });
    page.on('pageerror', error => consoleErrors.push(`${email}: ${String(error).slice(0, 1500)}`));
    context.setDefaultTimeout(60000);
    return page;
  };
  // Take snapshots before adding Phase 3C fixtures. Every pre-existing row is
  // compared byte-for-byte at the end; new rows do not conceal changed history.
  const historicalTables = ['supervisor_inspections', 'location_inspection_templates', 'location_inspections', 'location_inspection_allocations',
    'supervisor_issues', 'supervisor_issue_events', 'supervisor_issue_photos', 'planned_allocations', 'actual_allocations',
    'actual_allocation_operatives', 'allocation_absences', 'team_memberships', 'document_revisions'];
  const historical = new Map(historicalTables.map(table => [table,
    JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.${table} r`))]));
  const preserved = () => {
    for (const [table, before] of historical) {
      if (!before.length) continue;
      const selected = before.map(row => `'${row.id}'`).join(',');
      const after = JSON.parse(sql(`select jsonb_agg(to_jsonb(r) order by id) from public.${table} r where id in (${selected})`));
      assert.deepEqual(after, before, `${table}: every record existing before Phase 3C remains unchanged`);
    }
  };

  // A separate fictional site uses the real office APIs. This keeps Phase 3B's
  // intentionally unresolved critical snag intact instead of silently clearing
  // its blocking condition to make these release journeys pass.
  const contractId = await rpc(emails.manager, 'create_contract', { p_organisation: ids.organisation, p_request_key: randomUUID(),
    p_data: { reference: '3C-QA', name: 'Riverside Apartments QA acceptance', client: 'Acceptance client', address: '52 Test Riverside',
      scope: 'Disposable formal-hold acceptance site', principal_contractor: 'Acceptance Principal Contractor' } });
  for (const user_id of [ids.supervisor, ids.reviewer]) {
    const allocated = await rest(emails.owner, '/rest/v1/contract_assignments', 'POST', { organisation_id: ids.organisation, contract_id: contractId, user_id }, { prefer: 'return=minimal' });
    assert.equal(allocated.status, 201, await allocated.text());
  }
  await rpc(emails.manager, 'create_locations', { p_contract: contractId, p_request_key: randomUUID(), p_parent: null,
    p_items: [{ name: 'Block B', children: [{ name: 'Level 5', children: [{ name: 'Flat 52', children: [{ name: 'Bathroom' }, { name: 'Kitchen' }] },
      { name: 'Flat 53', children: [{ name: 'Bathroom' }, { name: 'Kitchen' }] }] }] }] });
  const areaId = (name, parent) => sql(`select id from public.work_areas where contract_id='${contractId}' and name='${name}'${parent ? ` and parent_id='${parent}'` : ''}`);
  const flat = areaId('Flat 52'), bathroom = areaId('Bathroom', flat), kitchen = areaId('Kitchen', flat), floor = areaId('Level 5');
  const repairTeam = sql("select id from public.teams where name='Jones Installations'");
  const packageId = await rpc(emails.manager, 'create_work_package', { p_area: flat, p_request_key: randomUUID(), p_data: { name: 'Flat 52 QA tiling', quantity: 20, unit: 'm2' } });
  const packageAllocation = await rest(emails.manager, '/rest/v1/package_assignments', 'POST', {
    organisation_id: ids.organisation, contract_id: contractId, work_package_id: packageId, user_id: ids.installer }, { prefer: 'return=minimal' });
  assert.equal(packageAllocation.status, 201, await packageAllocation.text());

  const page = await account(emails.supervisor), manager = await account(emails.manager, { width: 1180, height: 820 });
  const reviewer = await account(emails.reviewer), installer = await account(emails.installer);
  const other = await account(emails.other), unassigned = await account(emails.unassigned);
  const siteUrl = `${origin}/admin/supervisor/sites/${contractId}`, detailUrl = id => `${origin}/admin/holds/${id}`;
  const registerUrl = `${origin}/admin/holds?contract_id=${contractId}`;
  const state = id => sql(`select status from public.work_holds where id='${id}'`);
  const version = id => Number(sql(`select version from public.work_holds where id='${id}'`));
  const eventCount = (id, action) => Number(sql(`select count(*) from public.work_hold_events where hold_id='${id}'${action ? ` and action='${action}'` : ''}`));
  const releaseStatus = (area = bathroom, stage = 'installation') => rpc(emails.supervisor, 'work_release_status', { p_contract: contractId, p_area: area, p_stage: stage, p_package: null });
  const panel = async (target, label) => {
    const details = target.locator('details').filter({ has: target.locator('summary').getByText(label, { exact: true }) }).first();
    await details.waitFor(); if (!await details.evaluate(element => element.open)) await details.locator('summary').first().click();
    return details.locator('form').first();
  };
  const mutate = async (target, id, label, note, fill) => {
    await target.goto(detailUrl(id)); const form = await panel(target, label);
    await form.locator('textarea[name=note]').fill(note); if (fill) await fill(form);
    const before = eventCount(id); const saved = target.waitForResponse(response => actionRequest(response.request()));
    await form.getByRole('button', { name: label, exact: true }).click(); assert.equal((await saved).status(), 200);
    await target.getByRole('heading', { name: 'Permanent hold history', exact: true }).locator('..').getByText(note, { exact: true }).waitFor();
    assert.equal(eventCount(id), before + 1, `${label} creates one saved permanent event`);
    await target.reload();
  };
  const upload = async (target, id, purpose, name = `${purpose}.png`, fault = false) => {
    await target.goto(detailUrl(id)); const region = target.getByRole('region', { name: `${purpose} photograph uploads`, exact: true });
    await region.getByLabel('Choose photographs', { exact: true }).setInputFiles(image(name));
    if (fault) {
      expectedNetwork = true; storage.faults.failUploads = 1;
      await region.getByRole('button', { name: 'Upload photographs', exact: true }).click();
      await region.getByRole('alert').filter({ hasText: 'The photograph was not uploaded' }).first().waitFor();
      assert.equal(sql(`select count(*) from public.hold_photos where hold_id='${id}' and purpose='${purpose}' and uploaded_at is not null`), '0');
      assert.equal(await region.getByText('Verified in private storage', { exact: true }).count(), 0);
      storage.faults.corruptDownloads = 1;
      await region.getByRole('button', { name: 'Upload photographs', exact: true }).click();
      await region.getByRole('alert').filter({ hasText: 'stored file does not match' }).first().waitFor();
      assert.equal(sql(`select count(*) from public.hold_photos where hold_id='${id}' and purpose='${purpose}' and uploaded_at is not null`), '0');
    }
    const reservations = sql(`select count(*) from public.hold_photos where hold_id='${id}' and purpose='${purpose}'`);
    await region.getByRole('button', { name: 'Upload photographs', exact: true }).click();
    await region.getByText('Verified in private storage', { exact: true }).waitFor();
    if (fault) {
      expectedNetwork = false;
      // The retry found the object already stored by the failed verification, checked its bytes and reused the reservation.
      assert.equal(sql(`select count(*) from public.hold_photos where hold_id='${id}' and purpose='${purpose}'`), reservations, 'every retry reused its reservation');
    }
    const photo = JSON.parse(sql(`select to_jsonb(p) from public.hold_photos p where hold_id='${id}' and purpose='${purpose}'
      and uploaded_at is not null and event_id is null order by created_at desc limit 1`));
    assert.ok(photo.id); assert.equal(photo.sha256, createHash('sha256').update(png).digest('hex'));
    assert.deepEqual(storage.bytes(`supervisor-evidence/${photo.object_path}`), png);
    return photo;
  };
  const fillCreate = async (target, reason, { type = 'quality', area = 'Block B › Level 5 › Flat 52 › Bathroom', stage = 'installation', source } = {}) => {
    await target.goto(`${origin}/admin/holds/new?contract=${contractId}${source ? `&snag=${source}` : ''}`);
    const form = target.locator('main form').filter({ has: target.locator('input[name=contract_id]') });
    await form.locator('select[name=hold_type]').selectOption(type);
    if (!source) {
      const search = form.getByRole('searchbox', { name: 'Affected location or branch', exact: true });
      const flatNumber = area.includes('Flat 53') ? '53' : '52';
      await search.fill(area.includes('Bathroom') ? `${flatNumber} bath` : area.includes('Kitchen') ? `${flatNumber} kitchen` : 'level 5');
      await form.getByRole('list', { name: 'Affected location or branch choices' }).getByRole('button', { name: area, exact: true }).click();
    }
    await form.locator('select[name=stage]').selectOption(stage);
    await form.locator('select[name=category]').selectOption(type === 'safety' ? 'Unsafe access or platform' : 'Failed waterproofing inspection');
    await form.locator('select[name=severity]').selectOption(type === 'safety' ? 'critical' : 'major');
    await form.locator('textarea[name=reason]').fill(reason);
    await form.locator('textarea[name=required_action]').fill(type === 'safety' ? 'Make access safe under the principal contractor site-safety procedure.' : 'Repair the waterproofing and inspect it against the approved manufacturer specification.');
    await form.locator('textarea[name=evidence_explanation]').fill('Immediate stop recorded before photography; the concern requires evidence to follow.');
    return form;
  };
  const create = async (target, reason, options) => {
    const form = await fillCreate(target, reason, options);
    if (options?.lose) {
      expectedNetwork = true;
      await target.route('**/*', async route => { if (!actionRequest(route.request())) return route.continue(); await route.fetch(); await route.abort('connectionreset'); });
      await form.getByRole('button', { name: 'STOP AFFECTED WORK', exact: true }).click(); await form.getByRole('alert').waitFor();
      const savedId = sql(`select id from public.work_holds where reason='${reason}'`);
      assert.ok(savedId); assert.equal(eventCount(savedId, 'raise'), 1); assert.equal(state(savedId), 'active');
      assert.equal(await form.locator('textarea[name=reason]').isDisabled(), true); assert.equal(await form.getByRole('status').count(), 0);
      await target.unroute('**/*'); await form.getByRole('button', { name: 'Retry: STOP AFFECTED WORK', exact: true }).click();
    } else await form.getByRole('button', { name: 'STOP AFFECTED WORK', exact: true }).click();
    await target.waitForURL(url => /^\/admin\/holds\/[0-9a-f-]{36}$/.test(url.pathname));
    if (options?.lose) expectedNetwork = false;
    const id = target.url().split('/').at(-1); assert.equal(state(id), 'active'); assert.equal(eventCount(id, 'raise'), 1); return id;
  };

  try {
    await page.waitForURL(`**/admin/supervisor/sites/${contractId}`);
    const urgentActions = page.getByRole('region', { name: 'Site actions', exact: true });
    for (const label of ['STOP WORK', 'Raise a snag', 'Check workmanship', 'FINISH TODAY']) await page.getByRole('link', { name: label, exact: true }).waitFor();
    await urgentActions.getByRole('link', { name: 'START MORNING CHECKS', exact: true }).waitFor();
    assert.equal((await releaseStatus()).status, 'not_assessed');
    assert.equal((await releaseStatus()).authorised, false);
    pass('3C O: a one-site supervisor lands on the saved site dashboard; urgent stop, snag and location inspection actions remain available before morning checks or workforce confirmation');

    // The initial request never arrives, then the saved response is lost.
    // Neither case may claim success. A retry must retain the original payload.
    const reason = 'Waterproofing failed in Flat 52 Bathroom; stop tiling over this system.';
    const form = await fillCreate(page, reason);
    expectedNetwork = true;
    await page.route('**/*', route => actionRequest(route.request()) ? route.abort('internetdisconnected') : route.continue());
    await form.getByRole('button', { name: 'STOP AFFECTED WORK', exact: true }).click();
    await form.getByRole('alert').waitFor();
    assert.equal(sql(`select count(*) from public.work_holds where reason='${reason}'`), '0');
    assert.equal(await form.getByRole('status').count(), 0, 'unsaved local button press never claims confirmed work stop');
    await page.unroute('**/*');
    await page.route('**/*', async route => { if (!actionRequest(route.request())) return route.continue(); await route.fetch(); await route.abort('connectionreset'); });
    await form.getByRole('button', { name: /STOP AFFECTED WORK|Retry/i }).click();
    await form.getByRole('alert').waitFor();
    const normal = sql(`select id from public.work_holds where reason='${reason}'`);
    assert.ok(normal); assert.equal(eventCount(normal, 'raise'), 1); assert.equal(state(normal), 'active');
    assert.equal(await form.locator('textarea[name=reason]').isDisabled(), true);
    assert.equal(await form.getByRole('status').count(), 0, 'unknown response does not claim a confirmed site-wide stop');
    await page.unroute('**/*'); await form.getByRole('button', { name: /STOP AFFECTED WORK|Retry/i }).click();
    await page.waitForURL(`**/admin/holds/${normal}`); expectedNetwork = false;
    assert.equal(eventCount(normal, 'raise'), 1); assert.equal(sql(`select count(*) from public.work_holds where reason='${reason}'`), '1');
    assert.equal((await releaseStatus()).status, 'blocked_quality');
    assert.equal((await releaseStatus(kitchen)).status, 'not_assessed');
    assert.equal((await releaseStatus(kitchen)).holds.length, 0);
    await page.goto(siteUrl); await page.getByText(reason, { exact: true }).waitFor();
    pass('3C A/B/L: an immediate saved quality stop blocks only Flat 52 Bathroom; no photograph delays it, failed/lost replies show honest uncertainty, and the identical retry creates one hold and one raise event');

    // Upload the existing private operational-document workflow through Next,
    // then configure an explicit approved specification requirement.
    await manager.goto(`${origin}/admin/contracts/${contractId}`);
    const documents = manager.locator('details').filter({ has: manager.locator('summary').getByText('Upload a document revision or photo', { exact: true }) });
    await documents.locator('summary').click(); const documentForm = documents.locator('form');
    await documentForm.locator('input[name=document_reference]').fill('QA-MANUFACTURER-52');
    await documentForm.locator('input[name=title]').fill('Approved Flat 52 waterproofing manufacturer requirements');
    await documentForm.locator('input[name=file]').setInputFiles(image('approved-manufacturer-reference.png'));
    await documentForm.getByRole('button', { name: 'Upload private revision', exact: true }).click();
    await documentForm.getByRole('status').filter({ hasText: 'Private document revision uploaded' }).waitFor();
    const documentId = sql(`select id from public.document_revisions where contract_id='${contractId}' and document_reference='QA-MANUFACTURER-52' and uploaded_at is not null`);
    assert.ok(documentId);
    const templateId = await rpc(emails.manager, 'create_location_inspection_template', { p_request_key: randomUUID(), p_data: {
      contract_id: contractId, work_area_id: bathroom, stage: 'installation', title: 'Mandatory waterproofing hold point before tiling',
      specification_reference: 'QA-MANUFACTURER-52', specification_revision: '1', wet_area: true,
      checklist: [{ label: 'Waterproofing accepted against approved manufacturer requirements', wet_only: false, mandatory: true, hold_point: true, evidence_required: true }] } });
    const bathroomRequirement = await rpc(emails.manager, 'configure_inspection_requirement', { p_request_key: randomUUID(), p_data: { contract_id: contractId,
      work_area_id: bathroom, work_package_id: null, stage: 'installation', applicability: 'required', template_id: templateId,
      approved_document_ids: [documentId], basis: 'Office approved manufacturer reference for this exact bathroom and tiling activity.' } });
    const inspect = status => rpc(emails.supervisor, 'record_location_inspection', { p_request_key: randomUUID(), p_data: {
      contract_id: contractId, work_area_id: bathroom, template_id: templateId, answers: [{ status, note: status === 'pass' ? 'Updated inspection passed against the approved reference.' : 'Waterproofing remains defective at the shower junction.', document_ids: [documentId] }], allocation_ids: [] } });
    const failedInspection = await inspect('issue');
    assert.equal((await releaseStatus()).authorised, false);
    const kitchenTemplate = await rpc(emails.manager, 'create_location_inspection_template', { p_request_key: randomUUID(), p_data: {
      contract_id: contractId, work_area_id: kitchen, stage: 'installation', title: 'Kitchen mandatory preparation hold point',
      specification_reference: 'QA-MANUFACTURER-52', specification_revision: '1', wet_area: false,
      checklist: [{ label: 'Preparation accepted against the approved installation specification', wet_only: false, mandatory: true, hold_point: true, evidence_required: true }] } });
    await rpc(emails.manager, 'configure_inspection_requirement', { p_request_key: randomUUID(), p_data: { contract_id: contractId,
      work_area_id: kitchen, work_package_id: null, stage: 'installation', applicability: 'required', template_id: kitchenTemplate,
      approved_document_ids: [documentId], basis: 'Office approved installation reference requires this exact kitchen preparation hold point.' } });
    assert.equal((await releaseStatus(kitchen)).status, 'awaiting_inspection');
    assert.equal((await releaseStatus(kitchen)).authorised, false); assert.equal((await releaseStatus(kitchen)).holds.length, 0);
    const inspectKitchen = status => rpc(emails.supervisor, 'record_location_inspection', { p_request_key: randomUUID(), p_data: {
      contract_id: contractId, work_area_id: kitchen, template_id: kitchenTemplate, answers: [{ status,
        note: status === 'pass' ? 'Updated preparation passes the approved reference.' : 'Preparation remains incomplete against the approved reference.', document_ids: [documentId] }], allocation_ids: [] } });
    await inspectKitchen('issue'); assert.equal((await releaseStatus(kitchen)).requirements.failed, true); assert.equal((await releaseStatus(kitchen)).authorised, false);
    await page.goto(`${siteUrl}/inspections?location=${bathroom}`);
    await page.getByText('Mandatory waterproofing hold point before tiling', { exact: false }).first().waitFor();
    pass('3C I: an explicitly approved, versioned mandatory hold point preserves saved failure/evidence and cannot authorise work while outstanding or failed');

    const original = await upload(page, normal, 'original', 'failed-waterproofing.png', true);
    await mutate(page, normal, 'Attach original evidence', 'Original photograph added after the immediate stop.');
    assert.equal(sql(`select event_id is not null from public.hold_photos where id='${original.id}'`), 't');
    const privateImage = await page.context().request.get(`${origin}/admin/holds/photos/${original.id}`);
    assert.equal(privateImage.status(), 200); assert.deepEqual(await privateImage.body(), png);
    expectedNetwork = true;
    for (const target of [other, unassigned]) {
      assert.equal((await target.goto(detailUrl(normal))).status(), 404);
      assert.equal((await target.context().request.get(`${origin}/admin/holds/photos/${original.id}`)).status(), 404);
    }
    const crossContext = await rest(emails.other, '/rest/v1/rpc/hold_context', 'POST', { p_hold: normal });
    assert.equal(crossContext.status, 403);
    assert.equal((await rest(emails.other, `/storage/v1/object/supervisor-evidence/${original.object_path}`)).status, 403);
    assert.equal((await rest(emails.supervisor, `/storage/v1/object/public/supervisor-evidence/${original.object_path}`)).status, 403);
    assert.equal((await rest(emails.supervisor, '/rest/v1/rpc/complete_hold_photo', 'POST', { p_photo: original.id, p_actor: ids.supervisor, p_sha256: original.sha256 })).status, 403);
    expectedNetwork = false;
    pass('3C K: verified hold evidence survives upload/corrupt-byte failures; other tenants and unassigned installers cannot view it, and ordinary JWTs cannot certify stored bytes');

    await mutate(page, normal, 'Assign corrective action', 'Jones Installations assigned to repair the waterproofing.', async assignment => {
      await assignment.locator('select[name=team_id]').selectOption(repairTeam);
      await assignment.locator('input[name=target_date]').fill(sql('select (private.site_today()-1)::text'));
      await assignment.locator('textarea[name=required_action]').fill('Repair the defective waterproofing to the approved manufacturer instructions.');
    });
    assert.equal(await installer.goto(detailUrl(normal)).then(response => response.status()), 200);
    assert.equal(await installer.locator('summary').filter({ hasText: 'RELEASE AFFECTED WORK' }).count(), 0);
    expectedNetwork = true;
    const deniedOriginal = await installer.context().request.post(`${origin}/api/supervisor/holds/${normal}/photos`, { multipart: { request_key: randomUUID(), purpose: 'original', file: image('installer-original.png') } });
    assert.equal(deniedOriginal.status(), 403);
    assert.equal((await rest(emails.installer, '/storage/v1/object/supervisor-evidence', 'DELETE', { prefixes: [original.object_path] })).status, 403);
    const overwrite = await fetch(`${gatewayOrigin}/storage/v1/object/supervisor-evidence/${original.object_path}`, { method: 'POST', headers: {
      authorization: `Bearer ${tokenFor(emails.installer)}`, 'content-type': 'image/png', 'x-upsert': 'true' }, body: png });
    assert.equal(overwrite.status, 403); assert.deepEqual(storage.bytes(`supervisor-evidence/${original.object_path}`), png);
    expectedNetwork = false;
    const correction1 = await upload(installer, normal, 'correction', 'first-correction.png');
    await mutate(installer, normal, 'Submit corrective action', 'First waterproofing correction complete and ready for inspection.');
    await mutate(installer, normal, 'Request release review', 'Please review this first correction for release.');
    assert.equal(state(normal), 'awaiting_release');
    assert.equal(sql(`select event_id is not null from public.hold_photos where id='${correction1.id}'`), 't');
    const rejectedRelease = await rest(emails.manager, '/rest/v1/rpc/transition_work_hold', 'POST', { p_hold: normal, p_request_key: randomUUID(),
      p_version: version(normal), p_action: 'release', p_data: { note: 'Attempted release before the mandatory failed inspection has been passed.' } });
    assert.equal(rejectedRelease.status, 400); assert.equal(state(normal), 'awaiting_release');
    await mutate(manager, normal, 'REJECT RELEASE — MORE WORK REQUIRED', 'The junction remains incomplete; this correction and release request are rejected.');
    assert.equal(state(normal), 'active'); assert.equal(eventCount(normal, 'reject_release'), 1);
    const correction2 = await upload(installer, normal, 'correction', 'second-correction.png');
    await mutate(installer, normal, 'Submit corrective action', 'Second waterproofing repair complete with the junction remade.');
    await mutate(installer, normal, 'Request release review', 'Second correction is ready for an independent release decision.');
    await inspect('pass');
    pass('3C D/G/I: the authorised team uploads verified correction evidence and requests release; a failed mandatory inspection blocks approval, and rejection retains both correction cycles and permanent history');

    await upload(manager, normal, 'release', 'independent-release-inspection.png');
    await manager.goto(detailUrl(normal)); const releaseForm = await panel(manager, 'RELEASE AFFECTED WORK');
    const releaseNote = 'Independent manager approves the corrected waterproofing for the specified tiling activity.';
    await releaseForm.locator('textarea[name=note]').fill(releaseNote); await releaseForm.locator('input[name=confirm_decision]').check();
    let capturedRelease;
    expectedNetwork = true;
    await manager.route('**/*', async route => {
      if (!actionRequest(route.request())) return route.continue(); const request = route.request();
      capturedRelease = { url: request.url(), headers: await request.allHeaders(), body: request.postDataBuffer() };
      await route.abort('internetdisconnected');
    });
    await releaseForm.getByRole('button', { name: /^(Retry: )?RELEASE AFFECTED WORK$/ }).click();
    await releaseForm.getByRole('alert').waitFor(); assert.equal(state(normal), 'awaiting_release'); assert.equal(eventCount(normal, 'release'), 0);
    await manager.unroute('**/*');
    const installerReplay = await installer.context().request.post(capturedRelease.url, { headers: replayHeaders(capturedRelease.headers), data: capturedRelease.body });
    assert.match(await installerReplay.text(), /permission|authorised|installer|independent/i); assert.equal(eventCount(normal, 'release'), 0);
    for (const malformed of [null, randomUUID(), normal]) {
      rpcFaults.holdReleaseResults.push(malformed);
      const successfulHttp = manager.waitForResponse(response => actionRequest(response.request()));
      await releaseForm.getByRole('button', { name: /^(Retry: )?RELEASE AFFECTED WORK$/ }).click();
      assert.equal((await successfulHttp).status(), 200);
      await releaseForm.getByRole('alert').filter({ hasText: 'could not confirm this decision' }).waitFor();
      assert.equal(await releaseForm.getByRole('status').count(), 0, 'HTTP 200 without a confirmed saved release is not release confirmation, even when it contains this hold ID');
      assert.equal(state(normal), 'awaiting_release'); assert.equal(eventCount(normal, 'release'), 0);
      assert.equal((await releaseStatus()).authorised, false);
      assert.equal(rpcFaults.holdReleaseResults.length, 0, 'fault reached the server-side database response boundary');
    }
    pass('3C release confirmation: HTTP 200 with null, unrelated ID or matching hold ID without a saved decision never claims success, records no release event, and keeps the specified work stopped');
    await manager.route('**/*', async route => { if (!actionRequest(route.request())) return route.continue(); await route.fetch(); await route.abort('connectionreset'); });
    await releaseForm.getByRole('button', { name: /^(Retry: )?RELEASE AFFECTED WORK$/ }).click();
    await releaseForm.getByRole('alert').waitFor(); assert.equal(state(normal), 'released'); assert.equal(eventCount(normal, 'release'), 1);
    assert.equal(await releaseForm.locator('textarea[name=note]').isDisabled(), true);
    await manager.unroute('**/*'); await releaseForm.getByRole('button', { name: /^(Retry: )?RELEASE AFFECTED WORK$/ }).click();
    await manager.getByRole('heading', { name: 'Permanent hold history', exact: true }).locator('..').getByText(releaseNote, { exact: true }).waitFor();
    expectedNetwork = false; assert.equal(eventCount(normal, 'release'), 1);
    assert.equal((await releaseStatus()).status, 'released'); assert.equal((await releaseStatus()).authorised, true);
    assert.equal(sql(`select released_by<>raised_by and released_by<>corrected_by from public.work_holds where id='${normal}'`), 't');
    pass('3C E/L: an independent office decision releases only the saved specified activity; installers are refused, failed replies never claim success, and lost-response retry adds one release decision');

    await rpc(emails.manager, 'configure_inspection_requirement', { p_request_key: randomUUID(), p_data: { contract_id: contractId,
      work_area_id: bathroom, work_package_id: null, stage: 'installation', applicability: 'required', template_id: templateId,
      approved_document_ids: [documentId], supersedes_id: bathroomRequirement,
      basis: 'Newer approved manufacturer requirement needs a fresh independent review before the bathroom tiling activity proceeds.' } });
    assert.equal((await releaseStatus()).status, 'awaiting_inspection');
    await inspect('pass');
    const revised = await releaseStatus();
    assert.equal(revised.requirements.passed, true); assert.equal(revised.authorised, false);
    assert.equal(revised.status, 'not_assessed'); assert.equal(revised.release, null);
    assert.equal(state(normal), 'released', 'the original historical release decision remains immutable');
    await page.goto(siteUrl);
    await page.getByText('Site details and earlier records', { exact: true }).click();
    const bathroomActivity = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Block B › Level 5 › Flat 52 › Bathroom', exact: true }) }).filter({ has: page.getByText('Tile installation', { exact: true }) });
    await bathroomActivity.getByText('Not assessed', { exact: true }).waitFor();
    pass('3C release revision: a newer specification requirement invalidates earlier authority even after a fresh passing inspection; the old release and its evidence remain preserved');

    // Remaining acceptance cases are deliberately later: they introduce active
    // overlapping and safety restrictions after the normal independent release.
    const self = await create(page, 'Office correction submitter cannot approve their own waterproofing repair.');
    await mutate(page, self, 'Assign corrective action', 'Assigning Jones for a correction independence check.', async assignment => {
      await assignment.locator('select[name=team_id]').selectOption(repairTeam);
      await assignment.locator('input[name=target_date]').fill(sql('select private.site_today()::text'));
    });
    await upload(manager, self, 'correction', 'office-submitted-correction.png');
    await mutate(manager, self, 'Submit corrective action', 'Office manager records the correction and must not approve it.');
    await mutate(manager, self, 'Request release review', 'A separate manager must review this correction.');
    await inspect('pass');
    const ownRelease = await rest(emails.manager, '/rest/v1/rpc/transition_work_hold', 'POST', { p_hold: self, p_request_key: randomUUID(),
      p_version: version(self), p_action: 'release', p_data: { note: 'The correction submitter attempts to approve their own repair.' } });
    assert.equal(ownRelease.status, 403); assert.equal(eventCount(self, 'release'), 0);
    await mutate(reviewer, self, 'RELEASE AFFECTED WORK', 'Independent Bea Reviewer approves the manager-recorded correction.', async decision => decision.locator('input[name=confirm_decision]').check());
    assert.equal(state(self), 'released');
    pass('3C F: even a manager who submitted the correction is denied self-approval by the database; a different independently authorised office reviewer can release it');

    const overlapA = await create(page, 'First overlapping quality restriction on the bathroom tile activity.');
    const overlapB = await create(page, 'Second independent quality restriction still blocks the bathroom tile activity.');
    await mutate(page, overlapA, 'Assign corrective action', 'Assign the first overlapping restriction for correction.', async assignment => {
      await assignment.locator('select[name=team_id]').selectOption(repairTeam); await assignment.locator('input[name=target_date]').fill(sql('select private.site_today()::text'));
    });
    await upload(installer, overlapA, 'correction', 'overlap-a-correction.png');
    await mutate(installer, overlapA, 'Submit corrective action', 'The first restriction has been corrected; the second still needs work.');
    await mutate(installer, overlapA, 'Request release review', 'Review the first hold independently of the remaining hold.');
    await inspect('pass');
    await manager.goto(detailUrl(overlapA)); await manager.getByText('Second independent quality restriction still blocks the bathroom tile activity.', { exact: false }).waitFor();
    await mutate(manager, overlapA, 'RELEASE AFFECTED WORK', 'Only the first hold is released; the other saved restriction remains active.', async decision => decision.locator('input[name=confirm_decision]').check());
    assert.equal(state(overlapA), 'released'); assert.equal(state(overlapB), 'active');
    const stillBlocked = await releaseStatus(); assert.equal(stillBlocked.status, 'blocked_quality'); assert.equal(stillBlocked.authorised, false);
    assert.ok(stillBlocked.holds.some(hold => hold.id === overlapB));
    pass('3C H: overlapping holds are visible during review; releasing one preserves the other and the server-derived activity status stays blocked');

    const safety = await create(page, 'Unsafe floor access prevents affected work until the site-safety authority acknowledges safe access.', { type: 'safety', area: 'Block B › Level 5' });
    assert.equal((await releaseStatus()).status, 'stopped_safety'); assert.equal((await releaseStatus(kitchen)).status, 'stopped_safety');
    await page.goto(detailUrl(safety)); await page.getByText(/principal contractor/i).first().waitFor();
    await page.goto(siteUrl); await page.getByText('Unsafe floor access prevents affected work until the site-safety authority acknowledges safe access.', { exact: true }).waitFor();
    pass('3C C: a visibly distinct broad safety stop intersects the whole affected floor, overrides passed inspections, and preserves the principal contractor safety authority');

    // An explicit office applicability decision covers the remaining floor
    // rooms; it cannot waive the narrower bathroom's mandatory hold point.
    await rpc(emails.manager, 'configure_inspection_requirement', { p_request_key: randomUUID(), p_data: { contract_id: contractId,
      work_area_id: floor, work_package_id: null, stage: 'installation', applicability: 'not_required',
      approved_document_ids: [documentId], basis: 'Approved reference records no additional inspection requirement for the other floor installation activities; the bathroom hold point remains mandatory.' } });
    await mutate(page, safety, 'Assign corrective action', 'Jones assigned to make the affected floor access safe under site controls.', async assignment => {
      await assignment.locator('select[name=team_id]').selectOption(repairTeam); await assignment.locator('input[name=target_date]').fill(sql('select private.site_today()::text'));
    });
    await upload(installer, safety, 'correction', 'floor-access-corrected.png');
    await mutate(installer, safety, 'Submit corrective action', 'Floor access correction recorded for the designated site-safety authority.');
    await mutate(installer, safety, 'Request release review', 'Safe-access correction ready for office and site-safety authority review.');
    await inspect('pass'); await inspectKitchen('pass');
    const noAuthority = await rest(emails.manager, '/rest/v1/rpc/transition_work_hold', 'POST', { p_hold: safety, p_request_key: randomUUID(),
      p_version: version(safety), p_action: 'release', p_data: { note: 'An internal decision alone cannot override the principal contractor controls.' } });
    assert.equal(noAuthority.status, 400); assert.equal(state(safety), 'awaiting_release'); assert.equal(eventCount(safety, 'release'), 0);
    await mutate(manager, safety, 'RELEASE AFFECTED WORK', 'Independent office records the site-safety authority acknowledgement for the specified activity.', async decision => {
      await decision.locator('input[name=authority_name]').fill('Alex Principal Contractor');
      await decision.locator('input[name=authority_role]').fill('Designated site-safety authority');
      await decision.locator('textarea[name=authority_reference]').fill('LOCAL-ACCEPTANCE-52: access reviewed and acknowledged for the recorded activity; all external controls continue to apply.');
      await decision.locator('input[name=authority_acknowledged_at]').fill(new Date(Date.now() - 1000).toISOString());
      await decision.locator('input[name=confirm_decision]').check();
    });
    assert.equal(state(safety), 'released'); assert.equal((await releaseStatus()).authorised, false, 'the remaining bathroom quality restriction still applies');
    assert.equal((await releaseStatus(kitchen)).status, 'released');
    await manager.getByText(/Alex Principal Contractor.*Designated site-safety authority/).first().waitFor();
    pass('3C safety release: internal approval without the required authority acknowledgement is rejected; recorded independent authorisation clears only this stop and preserves other controls');

    const activeSafety = await create(page, 'Flat 53 Bathroom access remains unsafe and requires site-safety attention.', { type: 'safety', area: 'Block B › Level 5 › Flat 53 › Bathroom', lose: true });
    pass('3C L safety stop: a lost reply keeps the exact urgent safety scope and reason frozen; retry confirms one saved stop without duplicate events or a false local success');
    const pending = await create(page, 'Kitchen quality correction is awaiting an independent release authorisation.', { area: 'Block B › Level 5 › Flat 52 › Kitchen' });
    const rejected = await create(page, 'Kitchen preparation correction was rejected and is overdue for further work.', { area: 'Block B › Level 5 › Flat 52 › Kitchen' });
    for (const [id, suffix] of [[pending, 'pending'], [rejected, 'rejected']]) {
      await mutate(page, id, 'Assign corrective action', `Jones assigned for the ${suffix} kitchen correction.`, async assignment => {
        await assignment.locator('select[name=team_id]').selectOption(repairTeam); await assignment.locator('input[name=target_date]').fill(sql('select (private.site_today()-1)::text'));
      });
      await upload(installer, id, 'correction', `kitchen-${suffix}-correction.png`);
      await mutate(installer, id, 'Submit corrective action', `Kitchen ${suffix} correction submitted with saved evidence.`);
      await mutate(installer, id, 'Request release review', `Kitchen ${suffix} correction requested independent approval.`);
    }
    await mutate(manager, rejected, 'REJECT RELEASE — MORE WORK REQUIRED', 'Kitchen preparation still needs further work; office rejects this release request.');
    assert.equal(state(pending), 'awaiting_release'); assert.equal(state(rejected), 'active'); assert.equal(state(activeSafety), 'active');

    // Explicit linked critical snag. The ordinary snag itself never creates a
    // formal hold; the user must select and save the authorised linked action.
    const critical = await rpc(emails.supervisor, 'create_snag', { p_request_key: randomUUID(), p_data: { contract_id: contractId, work_area_id: bathroom,
      stage: 'installation', category: 'Waterproofing concerns', severity: 'critical', description: 'Critical shower junction defect for an explicit linked hold.',
      required_rectification: 'Repair the failed junction before any further tiling activity.' } });
    const snagUpload = await page.context().request.post(`${origin}/api/supervisor/snags/${critical}/photos`, { multipart: { request_key: randomUUID(), purpose: 'original', file: image('critical-source.png') } });
    assert.equal(snagUpload.status(), 201); const snagPhoto = await snagUpload.json();
    await rpc(emails.supervisor, 'transition_snag', { p_issue: critical, p_request_key: randomUUID(), p_version: 1, p_action: 'submit', p_data: { note: 'Critical source evidence submitted for a deliberate formal-hold decision.', photo_ids: [snagPhoto.id] } });
    assert.equal(sql(`select count(*) from public.work_holds where source_snag_id='${critical}'`), '0');
    await page.goto(`${origin}/admin/snags/${critical}`);
    const linkedHref = await page.getByRole('main').getByRole('link', { name: 'STOP WORK', exact: true }).getAttribute('href');
    assert.match(linkedHref, new RegExp(`snag=${critical}`));
    const linked = await create(page, 'A formally saved hold explicitly links the critical shower junction snag.', { source: critical });
    assert.equal(sql(`select source_snag_id from public.work_holds where id='${linked}'`), critical);
    assert.equal(sql(`select snag_status from public.supervisor_issues where id='${critical}'`), 'open');
    pass('3C J: a critical snag does not silently stop work; its explicit authorised hold action preserves the original defect link and immutable evidence');

    const history = sql(`select jsonb_agg(to_jsonb(e) order by id)::text from public.work_hold_events e where hold_id='${normal}'`);
    const photos = sql(`select jsonb_agg(to_jsonb(p) order by id)::text from public.hold_photos p where hold_id='${normal}'`);
    await page.goto(detailUrl(normal)); await page.reload();
    await page.getByRole('heading', { name: 'Permanent hold history', exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('figure img')].every(photo => photo.complete && photo.naturalWidth > 0));
    assert.equal(await page.locator('figure img').count(), 4);
    assert.equal(sql(`select jsonb_agg(to_jsonb(e) order by id)::text from public.work_hold_events e where hold_id='${normal}'`), history);
    assert.equal(sql(`select jsonb_agg(to_jsonb(p) order by id)::text from public.hold_photos p where hold_id='${normal}'`), photos);
    assert.equal(sql(`select event_id is not null from public.hold_photos where id='${correction2.id}'`), 't');
    preserved();
    pass('3C M/N: refresh preserves status, privately decoded photographs, rejected corrections and independent decisions; every earlier inspection, snag, workforce, photograph and document record is unchanged');

    await manager.goto(`${origin}/admin/quality?contract_id=${contractId}`); await manager.getByRole('heading', { name: 'Quality control', exact: true }).waitFor();
    for (const label of ['Safety stops', 'Quality holds', 'Awaiting release', 'Rejected release requests', 'Critical snags', 'Failed mandatory inspections']) await manager.getByText(label, { exact: true }).first().waitFor();
    const metric = (label, count) => manager.getByRole('region', { name: 'Office quality counts' }).getByText(label, { exact: true }).locator('..').locator('strong').filter({ hasText: new RegExp(`^${count}$`) }).waitFor();
    const activeClause = "status not in ('released','superseded','entered_in_error')";
    await metric('Safety stops', sql(`select count(*) from public.work_holds where contract_id='${contractId}' and hold_type='safety' and ${activeClause}`));
    await metric('Quality holds', sql(`select count(*) from public.work_holds where contract_id='${contractId}' and hold_type='quality' and ${activeClause}`));
    await metric('Awaiting release', sql(`select count(*) from public.work_holds where contract_id='${contractId}' and status='awaiting_release'`));
    await metric('Overdue corrective actions', sql(`select count(*) from public.work_holds where contract_id='${contractId}' and target_date<private.site_today() and ${activeClause}`));
    await metric('Rejected release requests', sql(`select count(*) from public.work_holds h where contract_id='${contractId}' and ${activeClause} and exists(select 1 from public.work_hold_events e where e.hold_id=h.id and action='reject_release')`));
    await metric('Critical snags', '1');
    const qualityFilters = manager.locator('form').filter({ has: manager.locator('select[name=location_id]') });
    await qualityFilters.locator('select[name=location_id]').selectOption(bathroom); await qualityFilters.locator('select[name=stage]').selectOption('installation');
    await qualityFilters.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await manager.waitForURL(url => url.searchParams.get('location_id') === bathroom);
    await manager.getByText('Second independent quality restriction still blocks the bathroom tile activity.', { exact: true }).waitFor();
    await manager.goto(`${origin}/admin/alerts?contract_id=${contractId}`); await manager.getByRole('heading', { name: 'Site alerts', exact: true }).waitFor();
    const firstAlert = manager.locator('main article').filter({ has: manager.getByRole('button', { name: 'Mark read', exact: true }) }).first();
    await firstAlert.waitFor(); const firstTitle = await firstAlert.locator('h2,h3,strong').first().innerText();
    const readBefore = sql(`select count(*) from public.hold_notification_reads where user_id='${ids.manager}'`);
    await firstAlert.getByRole('button', { name: 'Mark read', exact: true }).click();
    await manager.getByText('Read', { exact: true }).first().waitFor();
    assert.equal(Number(sql(`select count(*) from public.hold_notification_reads where user_id='${ids.manager}'`)), Number(readBefore) + 1);
    await manager.reload(); await manager.getByText(firstTitle, { exact: true }).first().waitFor();
    assert.ok(await manager.getByText('Read', { exact: true }).count() >= 1);
    assert.equal((await rest(emails.other, `/rest/v1/hold_notifications?contract_id=eq.${contractId}`)).status, 200);
    assert.deepEqual(await (await rest(emails.other, `/rest/v1/hold_notifications?contract_id=eq.${contractId}`)).json(), []);
    pass('3C P: the office sees saved safety/quality restrictions, rejected requests, scoped filters and recipient-authorised persisted alerts with read state');

    const screens = [[page, 'hold-site-dashboard', siteUrl], [page, 'raise-work-hold', `${origin}/admin/holds/new?contract=${contractId}`],
      [page, 'holds-register', registerUrl], [page, 'hold-history', detailUrl(normal)], [page, 'safety-stop', detailUrl(safety)],
      [manager, 'quality-control', `${origin}/admin/quality?contract_id=${contractId}`], [manager, 'hold-alerts', `${origin}/admin/alerts?contract_id=${contractId}`]];
    for (const viewport of [{ name: 'phone', width: 390, height: 844 }, { name: 'tablet-portrait', width: 768, height: 1024 }, { name: 'tablet-landscape', width: 1180, height: 820 }]) {
      for (const [target, name, url] of screens) {
        await target.setViewportSize({ width: viewport.width, height: viewport.height }); await target.goto(url); await target.getByRole('main').waitFor();
        await target.waitForFunction(() => [...document.querySelectorAll('details,form')].every(element => Object.keys(element).some(key => key.startsWith('__reactFiber'))));
        await target.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true; }));
        const problems = await target.evaluate(() => {
          const found = [];
          if (document.documentElement.scrollWidth > innerWidth + 1) found.push(`Page ${document.documentElement.scrollWidth}px exceeds viewport ${innerWidth}px`);
          for (const element of document.querySelectorAll('button,summary,select,textarea,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),a[class*="utton"],label:has(> input[type=checkbox])')) {
            const box = element.getBoundingClientRect(); if (!box.width || !box.height) continue;
            if (box.height < 43.5) found.push(`${element.tagName} ${(element.textContent || element.getAttribute('name') || '').trim().slice(0,45)} is ${box.height}px tall`);
            if (box.right > innerWidth + 1) found.push(`${element.tagName} overflows to ${box.right}px`);
          }
          return [...new Set(found)];
        });
        assert.deepEqual(problems, [], `${name} on ${viewport.name}`);
        if (screenshots) await target.screenshot({ path: join(screenshots, `${name}-${viewport.name}.png`), fullPage: true, caret: 'initial', style: 'nextjs-portal { display: none !important; }' });
      }
      pass(`3C stops, correction/release history, site and office dashboards and alerts fit ${viewport.name} with 44px touch controls`);
    }
    assert.deepEqual(consoleErrors, [], 'unexpected browser errors in Phase 3C journeys');
    pass('3C authenticated A–P journeys completed without unexpected browser errors');
  } catch (error) {
    console.error(`Hold journey failure: ${String(error.message).split('\nCall log:')[0]}`);
    console.error(`Next.js test log:\n${log?.() || '(not available)'}`);
    for (const context of contexts) for (const target of context.pages()) console.error(`Hold journey page: ${target.url()}\n${(await target.locator('body').innerText({ timeout: 3000 }).catch(() => '(unreadable)')).slice(0, 3500)}`);
    throw error;
  } finally {
    for (const context of contexts) { for (const target of context.pages()) await target.unrouteAll({ behavior: 'ignoreErrors' }); await context.close(); }
  }
}
