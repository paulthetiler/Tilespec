// Simplification A–M: authenticated pages, real server actions, migrated local
// PostgreSQL and RLS. Auth and Storage are protocol fixtures only. Each saved
// success is checked against persisted rows, with no invented business data.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2cAAAAASUVORK5CYII=', 'base64');
const image = { name: 'floor-edge.png', mimeType: 'image/png', buffer: png };
const emails = { supervisor: 'dave.supervisor@e2e.invalid', manager: 'mia.manager@e2e.invalid', owner: 'grace.owner@e2e.invalid', other: 'oscar.other@e2e.invalid' };
const ids = { organisation: 'e2e00000-0000-4000-8000-0000000000a1', supervisor: 'e2e00000-0000-4000-8000-000000000010' };
const isAction = request => request.method() === 'POST' && Boolean(request.headers()['next-action']);

export async function runSimple({ browser, origin, sql, signIn, pass, screenshots, storage, rpcFaults, gatewayOrigin, tokenFor }) {
  const contexts = [], errors = [];
  let expectedNetwork = false;
  const rest = (email, path, method = 'GET', data, headers = {}) => fetch(`${gatewayOrigin}/rest/v1/${path}`, {
    method, headers: { authorization: `Bearer ${tokenFor(email)}`, 'content-type': 'application/json', ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const rpc = async (email, name, data) => {
    const response = await rest(email, `rpc/${name}`, 'POST', data);
    const result = await response.json();
    assert.equal(response.status, 200, `${name}: ${JSON.stringify(result)}`);
    return result;
  };
  const account = async (email, viewport = { width: 390, height: 844 }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, locale: 'en-GB' }); contexts.push(context);
    const page = await signIn(context, origin, email);
    context.setDefaultTimeout(30000);
    page.on('console', message => {
      if (message.type() !== 'error' || /favicon/.test(message.location().url)) return;
      if (expectedNetwork && /ERR_|Failed to fetch|status of (400|403|404|409|503)/i.test(message.text())) return;
      if (email === emails.other && /status of (403|404)/i.test(message.text())) return;
      errors.push(`${email}: ${message.text().slice(0, 2000)}`);
    });
    page.on('pageerror', error => errors.push(`${email}: ${String(error).slice(0, 2000)}`));
    return page;
  };

  // Preserve every pre-existing operational row, including the two original
  // contracts. New fixtures use their own site and people throughout.
  const tables = ['contracts', 'work_areas', 'work_packages', 'operatives', 'teams', 'subcontractor_companies', 'supervisor_inspections', 'location_inspection_templates', 'location_inspections',
    'location_inspection_allocations', 'location_inspection_requirements', 'supervisor_issues', 'supervisor_issue_events', 'supervisor_issue_photos',
    'work_holds', 'work_hold_events', 'hold_photos', 'planned_allocations', 'actual_allocations', 'actual_allocation_operatives',
    'allocation_absences', 'team_memberships', 'document_revisions', 'supervisor_office_items', 'supervisor_office_acknowledgements', 'supervisor_qa_submissions', 'site_handovers'];
  const history = new Map(tables.map(table => [table, JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.${table} r`))]));

  const contractId = await rpc(emails.manager, 'create_contract', { p_organisation: ids.organisation, p_request_key: randomUUID(), p_data: {
    reference: 'SIMPLE-E2E', name: 'Riverside practical supervisor acceptance', client: 'Fictional acceptance client', address: '52 Test Riverside',
    scope: 'Disposable simplified supervisor acceptance site', principal_contractor: 'Fictional Principal Contractor' } });
  const assignment = await rest(emails.owner, 'contract_assignments', 'POST', { organisation_id: ids.organisation, contract_id: contractId, user_id: ids.supervisor }, { prefer: 'return=minimal' });
  assert.equal(assignment.status, 201, await assignment.text());
  await rpc(emails.manager, 'create_locations', { p_contract: contractId, p_request_key: randomUUID(), p_parent: null, p_items: [
    { name: 'Block B', children: [{ name: 'Flat 52', children: [{ name: 'Bathroom' }, { name: 'Commercial floor' }] }] },
  ] });
  const area = name => sql(`select id from public.work_areas where contract_id='${contractId}' and name='${name}'`);
  const floor = area('Commercial floor'), bathroom = area('Bathroom');
  const day = sql('select private.site_today()');
  const person = await rpc(emails.manager, 'create_operative', { p_request_key: randomUUID(), p_data: { display_name: 'Dave Acceptance Tiler', engagement: 'direct_employee' } });
  const team = await rpc(emails.manager, 'create_team', { p_request_key: randomUUID(), p_data: { name: 'Practical Acceptance Pair', kind: 'direct_team' } });
  await rpc(emails.manager, 'add_team_member', { p_request_key: randomUUID(), p_data: { team_id: team, operative_id: person, is_lead: true, valid_from: day } });
  const plan = await rpc(emails.manager, 'plan_allocation', { p_request_key: randomUUID(), p_data: { contract_id: contractId, work_area_id: floor, team_id: team,
    stage: 'installation', operative_ids: [person], planned_start: day, planned_end: day, instructions: 'Inspect the commercial floor before following areas.' } });
  const checks = ['Setting out and alignment', 'Lippage', 'Quality of cuts', 'Tile bedding and adhesion', 'Hollow-sounding floor tiles',
    'Grout joints and adhesive contamination', 'Movement joints', 'Trims and edges', 'General workmanship'];
  const template = await rpc(emails.manager, 'create_location_inspection_template', { p_request_key: randomUUID(), p_data: { contract_id: contractId,
    work_area_id: floor, stage: 'installation', title: 'Commercial floor workmanship', specification_reference: 'ACCEPTANCE-FLOOR-SYSTEM',
    specification_revision: 'A', wet_area: false, checklist: checks.map(label => ({ label, wet_only: false })) } });
  const site = `${origin}/admin/supervisor/sites/${contractId}`;
  const page = await account(emails.supervisor), manager = await account(emails.manager, { width: 1180, height: 820 });
  try {
    await page.waitForURL(`**/admin/supervisor/sites/${contractId}`);
    await page.getByRole('heading', { name: 'Riverside practical supervisor acceptance', exact: true }).waitFor();
    await page.getByText(/^(Morning|Afternoon|Evening), Dave$/).waitFor();
    await page.getByRole('link', { name: 'START MORNING CHECKS', exact: true }).waitFor();
    for (const name of ["Who's on site?", 'Check workmanship', 'Raise a snag', 'Office messages', 'Variations', 'Dayworks']) await page.getByRole('link', { name, exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'INSPECT WORK', exact: true }).count(), 0, 'no office inspection task is invented');
    pass('Simple A: Dave signs in through the real password form, reaches his assigned site, and sees a personal daily dashboard with one clear next task');

    await page.getByRole('link', { name: 'START MORNING CHECKS', exact: true }).click();
    await page.waitForURL('**/checks');
    await page.getByRole('button', { name: 'YES', exact: true }).first().waitFor();
    const started = Date.now();
    const groups = page.locator('main fieldset').filter({ has: page.getByRole('button', { name: 'YES', exact: true }) });
    assert.equal(await groups.count(), 11);
    for (let index = 0; index < 11; index++) await groups.nth(index).getByRole('button', { name: index >= 9 || index === 3 ? 'NO' : 'YES', exact: true }).click();
    const adhesive = page.getByRole('group', { name: 'Adhesive available?', exact: true });
    const adhesiveNote = 'Adhesive delivery missing. Bathroom fixing cannot start until the office arranges delivery.';
    await adhesive.getByLabel('Short note (optional)', { exact: true }).fill(adhesiveNote);
    assert.ok(Date.now() - started < 120000, 'the ordinary eleven answers and blocker note take under two minutes');
    const morningRequest = request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/supervisor/inspections';
    expectedNetwork = true;
    await page.route('**/api/supervisor/inspections', route => morningRequest(route.request()) ? route.abort('internetdisconnected') : route.continue());
    await page.getByRole('button', { name: 'COMPLETE MORNING CHECKS', exact: true }).click();
    await page.getByRole('alert').first().waitFor();
    assert.equal(sql(`select count(*) from public.supervisor_inspections where contract_id='${contractId}'`), '0');
    const frozenAdhesive = page.locator('fieldset').filter({ has: page.locator('legend').getByText('Adhesive available?', { exact: true }) });
    assert.equal(await frozenAdhesive.locator('textarea').inputValue({ timeout: 10000 }), adhesiveNote);
    assert.equal(await page.getByRole('heading', { name: 'Morning checks complete' }).count(), 0);
    await page.unroute('**/api/supervisor/inspections');
    let finishMorningDelivery, morningDeliveryError;
    const morningDelivered = new Promise(resolve => { finishMorningDelivery = resolve; });
    await page.route('**/api/supervisor/inspections', async route => {
      try { await route.fetch(); }
      catch (error) { morningDeliveryError = String(error.message).split('\n')[0]; }
      await route.abort('connectionreset'); finishMorningDelivery();
    });
    await page.getByRole('button', { name: 'Retry saving morning checks', exact: true }).click();
    await morningDelivered;
    assert.equal(morningDeliveryError, undefined, 'the lost-reply request reached the real morning API');
    await page.getByRole('alert').first().waitFor();
    assert.equal(sql(`select count(*) from public.supervisor_inspections where contract_id='${contractId}'`), '1', 'lost reply did reach the database');
    await page.unroute('**/api/supervisor/inspections');
    await page.getByRole('button', { name: 'Retry saving morning checks', exact: true }).click();
    await page.getByRole('heading', { name: 'Morning checks complete', exact: true }).waitFor();
    expectedNetwork = false;
    const morningId = sql(`select id from public.supervisor_inspections where contract_id='${contractId}'`);
    assert.equal(sql(`select issues_count from public.supervisor_inspections where id='${morningId}'`), '1', 'clear obstruction questions are not inverted into false blockers');
    assert.equal(sql(`select count(*) from public.actual_allocations where contract_id='${contractId}'`), '0', 'readiness never invents attendance');
    await manager.goto(`${site}/checks?inspection=${morningId}#morning-${morningId}`);
    await manager.getByText(adhesiveNote, { exact: false }).first().waitFor();
    pass('Simple B/C/M: eleven plain answers take under two minutes; missing adhesive reaches the office; failed and lost replies preserve entries and retry the single permanent morning record');

    await page.getByRole('link', { name: 'Who’s on site?', exact: true }).click();
    await page.waitForURL('**/workforce');
    const teamCard = page.locator('article', { has: page.getByRole('heading', { name: 'Practical Acceptance Pair', exact: true }) });
    // Use a real earlier start so finishing at the current minute is after the
    // recorded attendance, including on fast acceptance machines.
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const [hour, minute] = clock.split(':').map(Number), earlier = Math.max(0, hour * 60 + minute - 2);
    const plannedConfirmation = teamCard.locator('form').filter({ has: page.getByRole('button', { name: 'Confirm as planned', exact: true }) });
    await plannedConfirmation.getByText('Started before now?', { exact: true }).click();
    await plannedConfirmation.locator('input[name=started_time]').fill(`${String(Math.floor(earlier / 60)).padStart(2, '0')}:${String(earlier % 60).padStart(2, '0')}`);
    for (const result of [null, [plan]]) {
      rpcFaults.dailyResults.set('confirm_planned_allocation', [result]);
      await teamCard.getByRole('button', { name: 'Confirm as planned', exact: true }).click();
      await teamCard.getByRole('alert').waitFor();
      assert.equal(sql(`select count(*) from public.actual_allocations where planned_allocation_id='${plan}' and voided_at is null`), '0');
      assert.equal(await teamCard.getByRole('status').filter({ hasText: 'Confirmed as planned:' }).count(), 0, 'HTTP success with no matching attendance is unconfirmed');
    }
    await teamCard.getByRole('button', { name: 'Confirm as planned', exact: true }).click();
    await teamCard.getByText('On site', { exact: true }).first().waitFor();
    assert.equal(sql(`select count(*) from public.actual_allocations where planned_allocation_id='${plan}' and voided_at is null`), '1');
    assert.equal(sql(`select count(*) from public.actual_allocation_operatives p join public.actual_allocations a on a.id=p.actual_allocation_id where a.contract_id='${contractId}' and p.operative_id='${person}'`), '1');
    await page.reload();
    await teamCard.getByText('On site', { exact: true }).first().waitFor();
    pass('Simple D/M: null and UUID-shaped HTTP 200 results cannot invent attendance; the real workforce form confirms the lads once and morning checks/reloads never duplicate it');

    // Both an office instruction and QA request are authored through the actual
    // office form. They are distinct durable records with recipient checks.
    const sendOffice = async (kind, title, body) => {
      await manager.goto(`${site}/messages`);
      await manager.getByText('Send a message or request an inspection', { exact: true }).click();
      const form = manager.locator('form').filter({ has: manager.locator('select[name=kind]') });
      await form.locator('select[name=kind]').selectOption(kind);
      await form.locator('select[name=recipient_id]').selectOption(ids.supervisor);
      await form.locator('input[name=title]').fill(title);
      await form.locator('textarea[name=body]').fill(body);
      if (kind === 'qa_request') {
        await form.getByRole('searchbox', { name: 'Location to inspect', exact: true }).fill('commercial floor');
        await form.getByRole('list', { name: 'Location to inspect choices' }).getByRole('button', { name: 'Block B › Flat 52 › Commercial floor', exact: true }).click();
        await form.locator('select[name=stage]').selectOption('installation');
      }
      await form.getByRole('button', { name: kind === 'qa_request' ? 'Send inspection request' : 'Send message', exact: true }).click();
      await form.getByRole('status').waitFor();
      const row = JSON.parse(sql(`select to_jsonb(i) from public.supervisor_office_items i where contract_id='${contractId}' and title='${title}'`));
      assert.equal(row.kind, kind); assert.equal(row.recipient_id, ids.supervisor); return row.id;
    };
    const instructionId = await sendOffice('instruction', 'Materials arriving at 10 am', 'Adhesive replacement delivery is arranged. Check the commercial floor before lunch.');
    await page.goto(`${site}/messages`);
    const instruction = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Materials arriving at 10 am', exact: true }) });
    await instruction.getByText('Adhesive replacement delivery is arranged.', { exact: false }).waitFor();
    rpcFaults.dailyResults.set('acknowledge_supervisor_office_item', [null]);
    await instruction.getByRole('button', { name: 'Acknowledge message', exact: true }).click();
    await instruction.getByRole('alert').waitFor();
    assert.equal(sql(`select count(*) from public.supervisor_office_acknowledgements where item_id='${instructionId}'`), '0');
    await instruction.getByRole('button', { name: 'Retry the same details', exact: true }).click();
    await instruction.getByText(/acknowledged/i).first().waitFor();
    assert.equal(sql(`select count(*) from public.supervisor_office_acknowledgements where item_id='${instructionId}' and actor_id='${ids.supervisor}'`), '1');
    pass('Simple H/M: Dave reads a real recipient-scoped office instruction; HTTP 200 without a saved acknowledgement stays unconfirmed, and retry creates one acknowledgement');

    const taskId = await sendOffice('qa_request', 'Flat 52 commercial floor', 'Check the finished floor against the approved system and report any hollow-sounding tiles for investigation.');
    await page.goto(site);
    const task = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Flat 52 commercial floor — Inspection requested', exact: true }) });
    await task.getByRole('link', { name: 'INSPECT WORK', exact: true }).waitFor();
    await task.getByRole('link', { name: 'VIEW OUTSTANDING SNAGS', exact: true }).waitFor();
    await task.getByRole('link', { name: 'INSPECT WORK', exact: true }).click();
    await page.waitForURL(`**/tasks/${taskId}`);
    await page.getByRole('link', { name: 'INSPECT WORK', exact: true }).click();
    await page.waitForURL(url => url.pathname.endsWith('/inspections') && url.searchParams.get('location') === floor && url.searchParams.get('stage') === 'installation');
    const inspectionForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'SUBMIT RESULT', exact: true }) });
    for (let index = 0; index < checks.length; index++) await inspectionForm.locator(`select[name=status_${index}]`).selectOption(index === 4 ? 'issue' : 'pass');
    assert.match(await inspectionForm.locator('textarea[name=note_4]').inputValue(), /investigat/i);
    await inspectionForm.getByRole('button', { name: 'SUBMIT RESULT', exact: true }).click();
    await inspectionForm.getByRole('status').filter({ hasText: 'Inspection saved' }).waitFor();
    const inspectionId = sql(`select id from public.location_inspections where contract_id='${contractId}' and template_id='${template}'`);
    assert.equal(sql(`select issues_count from public.location_inspections where id='${inspectionId}'`), '1');
    assert.equal(sql(`select answers->4->>'status' from public.location_inspections where id='${inspectionId}'`), 'issue');
    assert.match(sql(`select answers->4->>'note' from public.location_inspections where id='${inspectionId}'`), /investigat/i);
    await page.goto(`${site}/tasks/${taskId}`);
    const submit = page.locator('form').filter({ has: page.getByRole('button', { name: 'SUBMIT RESULT', exact: true }) });
    await submit.locator('select[name=inspection_id]').selectOption(inspectionId);
    await submit.getByRole('button', { name: 'SUBMIT RESULT', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /Result sent to the office|Inspection result sent/i }).first().waitFor();
    assert.equal(sql(`select inspection_id from public.supervisor_qa_submissions where item_id='${taskId}'`), inspectionId);
    assert.equal(sql(`select has_issues from public.supervisor_qa_submissions where item_id='${taskId}'`), 't');
    pass('Simple E/I: an actual office-assigned floor inspection opens the applicable short checklist; hollow tiles persist as an investigation issue and the submitted QA result points to that exact saved inspection');

    await page.goto(site);
    await page.getByRole('link', { name: 'Raise a snag', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Exact location', exact: true }).fill('bathroom');
    await page.getByRole('list', { name: 'Exact location choices' }).getByRole('button', { name: 'Block B › Flat 52 › Bathroom', exact: true }).click();
    await page.locator('select[name=category]').selectOption('Excessive lippage');
    await page.locator('textarea[name=description]').fill('Raised bathroom threshold edge needs investigation against the agreed detail.');
    await page.getByLabel('Choose photographs', { exact: true }).setInputFiles(image);
    await page.getByRole('button', { name: 'Submit snag', exact: true }).click();
    await page.waitForURL(url => /^\/admin\/snags\/[0-9a-f-]{36}$/.test(url.pathname));
    const snagId = page.url().split('/').at(-1);
    assert.equal(sql(`select work_area_id from public.supervisor_issues where id='${snagId}'`), bathroom);
    assert.equal(sql(`select snag_status from public.supervisor_issues where id='${snagId}'`), 'open');
    const photo = JSON.parse(sql(`select to_jsonb(p) from public.supervisor_issue_photos p where issue_id='${snagId}' and uploaded_at is not null and event_id is not null`));
    assert.equal(photo.sha256, createHash('sha256').update(png).digest('hex'));
    assert.deepEqual(storage.bytes(`supervisor-evidence/${photo.object_path}`), png);
    await manager.goto(`${origin}/admin/quality?contract_id=${contractId}`);
    await manager.getByText(adhesiveNote, { exact: false }).first().waitFor();
    await manager.getByRole('link', { name: 'View site snags', exact: true }).click();
    await manager.getByText('Raised bathroom threshold edge needs investigation against the agreed detail.', { exact: false }).first().waitFor();
    await manager.goto(`${site}/snags`);
    await manager.getByText(adhesiveNote, { exact: false }).first().waitFor();
    await manager.getByText('Raised bathroom threshold edge needs investigation against the agreed detail.', { exact: true }).waitFor();
    await manager.goto(`${site}/snags?location_id=${area('Flat 52')}`);
    await manager.getByText('Raised bathroom threshold edge needs investigation against the agreed detail.', { exact: true }).waitFor();
    assert.equal(await manager.getByText(adhesiveNote, { exact: false }).count(), 0, 'location-filtered snags include descendants without inventing a location for the legacy morning blocker');
    pass('Simple F: location, defect, photo and short description create the existing permanent snag/evidence lifecycle, visible in office quality control');

    await page.goto(site);
    await page.getByRole('link', { name: 'STOP WORK', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/admin/holds/new' && url.searchParams.get('contract') === contractId);
    await page.getByRole('button', { name: 'STOP AFFECTED WORK', exact: true }).waitFor();
    pass('Simple G: immediate STOP WORK remains one tap from the dashboard before or after the routine checks');

    await page.goto(`${site}/finish`);
    const handover = page.locator('form').filter({ has: page.locator('textarea[name=work_completed]') });
    const notes = { work_completed: 'Commercial floor inspected and bathroom threshold snag recorded.', outstanding_problems: 'Hollow floor tile needs investigation; bathroom threshold requires review.',
      materials_needed: 'Confirm adhesive stock for tomorrow.', areas_awaiting_attention: 'Flat 52 commercial floor and bathroom threshold.', office_notes: 'Office delivery instruction acknowledged and QA finding submitted.' };
    for (const [name, value] of Object.entries(notes)) await handover.locator(`textarea[name=${name}]`).fill(value);
    await handover.locator('input[name=finish_workforce]').check();
    rpcFaults.dailyResults.set('record_site_handover', [null]);
    await handover.getByRole('button', { name: 'FINISH TODAY', exact: true }).click();
    await handover.getByRole('alert').waitFor();
    assert.equal(sql(`select count(*) from public.site_handovers where contract_id='${contractId}'`), '0');
    assert.equal(sql(`select count(*) from public.actual_allocations where contract_id='${contractId}' and ended_at is null and voided_at is null`), '1', 'a fabricated HTTP response does not finish attendance');
    assert.equal(await handover.locator('textarea[name=work_completed]').inputValue(), notes.work_completed);
    expectedNetwork = true;
    let finishHandoverDelivery, handoverDeliveryError;
    const handoverDelivered = new Promise(resolve => { finishHandoverDelivery = resolve; });
    await page.route('**/*', async route => {
      if (!isAction(route.request())) return route.continue();
      try { await route.fetch(); }
      catch (error) { handoverDeliveryError = String(error.message).split('\n')[0]; }
      await route.abort('connectionreset'); finishHandoverDelivery();
    });
    await handover.getByRole('button', { name: 'Retry the same details', exact: true }).click();
    await handoverDelivered;
    assert.equal(handoverDeliveryError, undefined, 'the lost-reply request reached the real handover action');
    await handover.getByRole('alert').waitFor();
    assert.equal(sql(`select count(*) from public.site_handovers where contract_id='${contractId}'`), '1', 'handover persisted before the lost reply');
    assert.equal(await handover.locator('textarea[name=work_completed]').inputValue(), notes.work_completed);
    await page.unroute('**/*');
    await handover.getByRole('button', { name: 'Retry the same details', exact: true }).click();
    await handover.getByRole('status').waitFor(); expectedNetwork = false;
    assert.equal(sql(`select count(*) from public.site_handovers where contract_id='${contractId}'`), '1');
    assert.equal(sql(`select work_completed from public.site_handovers where contract_id='${contractId}'`), notes.work_completed);
    assert.equal(sql(`select count(*) from public.actual_allocations where contract_id='${contractId}' and ended_at is null and voided_at is null`), '0');
    assert.equal(sql(`select count(*) from public.actual_allocations where planned_allocation_id='${plan}'`), '1', 'finish updates the existing attendance period rather than creating another');
    await manager.goto(`${site}/messages`);
    const officeHandover = manager.getByRole('region', { name: 'Daily handovers', exact: true }).locator('details').first();
    await officeHandover.locator('summary').click();
    await officeHandover.getByText(notes.work_completed, { exact: true }).waitFor();
    pass('Simple J/M: five short handover notes persist for the office and finish existing workforce periods; null HTTP 200 and lost replies cannot show false success or duplicate the handover');

    // Explicitly honest deferred destinations, not fake commercial entry forms.
    for (const kind of ['variations', 'dayworks']) {
      await page.goto(`${site}/commercial?kind=${kind}`);
      assert.equal(await page.locator('main form').count(), 0, `${kind} does not present a fake recording form`);
      assert.match(await page.locator('main').innerText(), /next|future|separate|planned/i);
    }
    const other = await account(emails.other);
    for (const path of ['/messages', `/tasks/${taskId}`, '/finish']) assert.equal((await other.goto(`${site}${path}`)).status(), 404);
    const hidden = await rest(emails.other, `supervisor_office_items?id=eq.${taskId}`);
    assert.deepEqual(await hidden.json(), []);
    const denied = await rest(emails.other, 'rpc/acknowledge_supervisor_office_item', 'POST', { p_item: instructionId, p_request_key: randomUUID() });
    assert.ok(denied.status >= 400);
    const forgedOffice = await rest(emails.supervisor, 'rpc/create_supervisor_office_item', 'POST', { p_request_key: randomUUID(), p_data: {
      contract_id: contractId, kind: 'qa_request', title: 'Supervisor cannot invent an office task', body: 'This request must be refused.',
      recipient_id: ids.supervisor, work_area_id: floor, stage: 'installation' } });
    assert.equal(forgedOffice.status, 403, 'a supervisor cannot invent their own office-assigned inspection task');
    const secondSite = await rpc(emails.manager, 'create_contract', { p_organisation: ids.organisation, p_request_key: randomUUID(), p_data: {
      reference: 'SIMPLE-SECOND', name: 'Second practical acceptance site', address: '1 Test Street', scope: 'Disposable site-selector acceptance' } });
    const secondAssignment = await rest(emails.owner, 'contract_assignments', 'POST', { organisation_id: ids.organisation, contract_id: secondSite, user_id: ids.supervisor }, { prefer: 'return=minimal' });
    assert.equal(secondAssignment.status, 201, await secondAssignment.text());
    const chooser = await account(emails.supervisor);
    await chooser.waitForURL(url => url.pathname === '/admin/supervisor');
    await chooser.getByRole('heading', { name: 'Choose your site', exact: true }).waitFor();
    const selectedSite = chooser.locator(`a[href="/admin/supervisor/sites/${contractId}"]`);
    await selectedSite.waitFor();
    await chooser.locator(`a[href="/admin/supervisor/sites/${secondSite}"]`).waitFor();
    await selectedSite.click();
    await chooser.waitForURL(`**/admin/supervisor/sites/${contractId}`);
    for (const [table, before] of history) {
      if (!before.length) continue;
      const after = JSON.parse(sql(`select jsonb_agg(to_jsonb(r) order by id) from public.${table} r where id in (${before.map(row => `'${row.id}'`).join(',')})`));
      assert.deepEqual(after, before, `${table}: all records before the simplified journeys remain unchanged`);
    }
    pass('Simple A/K: multiple assigned sites offer a simple selector; other organisations cannot access daily records, and all pre-existing operational history and both original contracts remain unchanged');

    const screens = [['daily-dashboard', site], ['morning-checks', `${site}/checks`], ['workmanship', `${site}/inspections?location=${floor}&stage=installation&template=${template}`],
      ['raise-snag', `${origin}/admin/snags/new?contract=${contractId}&location=${bathroom}`], ['office-messages', `${site}/messages`],
      ['outstanding-snags', `${site}/snags`], ['inspection-request', `${site}/tasks/${taskId}`], ['finish-today', `${site}/finish`]];
    for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'tablet', width: 820, height: 1180 }]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const [name, url] of screens) {
        await page.goto(url); await page.getByRole('main').waitFor();
        if (name === 'morning-checks') {
          const repeat = page.getByText('Record another morning check', { exact: true });
          if (await repeat.count()) await repeat.click();
        }
        const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(overflow.document <= overflow.viewport + 1, `${name} ${viewport.name} horizontal overflow ${JSON.stringify(overflow)}`);
        const smallControls = await page.locator('main').evaluate(main => [...main.querySelectorAll('button, select, textarea, summary, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])')]
          .filter(control => { const box = control.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43.5; })
          .map(control => `${control.tagName.toLowerCase()} ${(control.getAttribute('name') || control.textContent || '').trim().slice(0, 60)}`));
        assert.deepEqual(smallControls, [], `${name} ${viewport.name} controls are at least 44px tall`);
        // Remove only Next's development indicator from review images.
        if (screenshots) await page.screenshot({ path: join(screenshots, `simple-${name}-${viewport.name}.png`), fullPage: true, caret: 'initial', style: 'nextjs-portal { display: none !important; }' });
      }
      pass(`Simple L: the dashboard, morning checks, workmanship, snag, messages, QA task and handover fit ${viewport.width}px ${viewport.name} without sideways scrolling`);
    }
    assert.deepEqual(errors, [], 'simplified authenticated journeys have no unexpected browser console or runtime errors');
    pass('Simple regression: no unexpected browser errors across the real authenticated daily journeys');
  } catch (error) {
    console.error(`Simplified journey page ${page.url()}:\n${(await page.locator('body').innerText().catch(() => '(unreadable)')).slice(0, 10000)}`);
    if (screenshots) await page.screenshot({ path: join(screenshots, 'simple-failure.png'), fullPage: true, caret: 'initial' }).catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) await context.close();
  }
}
