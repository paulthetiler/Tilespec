// Phase 3: signed-in real Next pages/actions, real PostgREST and migrated RLS.
// The only stand-ins are the local Auth/Storage protocol transports supplied
// by test-site-e2e.mjs. Nothing here runs against a hosted database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const email = {
  office: 'mia.manager@e2e.invalid', owner: 'grace.owner@e2e.invalid',
  finance: 'faye.finance@e2e.invalid', supervisor: 'sid.supervisor@e2e.invalid',
  installer: 'sam.installer@e2e.invalid', other: 'otto.owner@e2e.invalid',
};
const id = {
  org: 'e2e00000-0000-4000-8000-0000000000a1',
  office: 'e2e00000-0000-4000-8000-000000000002',
  supervisor: 'e2e00000-0000-4000-8000-000000000001',
  finance: 'e2e00000-0000-4000-8000-000000000011',
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV2cAAAAASUVORK5CYII=', 'base64');

export async function checkLegacyAdmin({ browser, origin, signIn, pass }) {
  for (const [account, heading] of [[email.office, 'Your site overview'], [email.owner, 'Portfolio overview']]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await signIn(context, origin, account);
      await page.goto(`${origin}/admin`);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Today', exact: true }).count(), 0);
      assert.equal(await page.getByRole('navigation', { name: 'Main', exact: true }).count(), 0);
      for (const path of ['/admin/paperwork', '/admin/messages', '/admin/money']) {
        const response = await page.request.get(`${origin}${path}`);
        assert.equal(response.status(), 404, `flags OFF keeps ${path} unavailable`);
      }
    } finally { await context.close(); }
  }
  pass('Phase 3 flags OFF: original Office/Owner admin stays available and all new indexes/Money remain unavailable');
}

export async function runAdminToday({ browser, origin, sql, signIn, screenshots, pass, gatewayOrigin, tokenFor }) {
  const contexts = [], errors = [];
  const rest = (account, path, method = 'GET', body, headers = {}) => fetch(`${gatewayOrigin}/rest/v1/${path}`, {
    method, headers: { authorization: `Bearer ${tokenFor(account)}`, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const rpc = async (account, name, body) => {
    const response = await rest(account, `rpc/${name}`, 'POST', body);
    const value = await response.json();
    assert.equal(response.status, 200, `${name}: ${JSON.stringify(value)}`);
    return value;
  };
  const account = async (address, width = 390) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, locale: 'en-GB' });
    contexts.push(context);
    const page = await signIn(context, origin, address);
    context.setDefaultTimeout(45000);
    page.on('pageerror', error => errors.push(`${address}: ${String(error)}`));
    return page;
  };
  const snapshot = tables => new Map(tables.map(table => [table,
    JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.${table} r`))]));
  const preserve = before => {
    for (const [table, rows] of before) {
      if (!rows.length) continue;
      const keys = rows.map(row => `'${row.id}'`).join(',');
      const after = JSON.parse(sql(`select jsonb_agg(to_jsonb(r) order by id) from public.${table} r where id in (${keys})`));
      assert.deepEqual(after, rows, `${table}: earlier records are unchanged`);
    }
  };
  const prior = snapshot(['contracts', 'work_areas', 'work_packages', 'planned_allocations', 'actual_allocations',
    'supervisor_inspections', 'location_inspection_templates', 'location_inspection_requirements', 'location_inspections',
    'supervisor_issues', 'supervisor_issue_events', 'work_holds', 'work_hold_events', 'document_revisions', 'audit_events']);
  const today = sql('select private.site_today()');
  const office = await account(email.office), owner = await account(email.owner);

  try {
    // Start from the actual new landing and create an ordinary job using its
    // existing form. Setup tasks below are derived from this saved record.
    await office.goto(`${origin}/admin`);
    await office.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    const nav = office.getByRole('navigation', { name: 'Main', exact: true });
    assert.deepEqual(await nav.getByRole('link').allTextContents(), ['Today', 'Jobs', 'People', 'Paperwork']);
    await nav.getByRole('link', { name: 'Jobs', exact: true }).click();
    await office.getByRole('link', { name: 'New contract', exact: true }).click();
    const newJob = office.locator('form').filter({ has: office.getByRole('button', { name: 'Create draft contract', exact: true }) });
    for (const [name, value] of Object.entries({ reference: 'PHASE3-LIVE', name: 'Phase 3 saved office job', client: 'Acceptance client',
      address: '1 Disposable Test Way', scope: 'Phase 3 acceptance only', start_date: today, end_date: today })) {
      await newJob.locator(`[name=${name}]`).fill(value);
    }
    await newJob.getByRole('button', { name: 'Create draft contract', exact: true }).click();
    await office.waitForURL(url => /^\/admin\/contracts\/[0-9a-f-]{36}$/.test(url.pathname));
    const contract = new URL(office.url()).pathname.split('/').at(-1);
    assert.equal(sql(`select name from public.contracts where id='${contract}' and created_by='${id.office}'`), 'Phase 3 saved office job');
    const site = `/admin/supervisor/sites/${contract}`;
    pass('Phase 3 A: the real Office Today has four destinations and creates an audited draft job through the existing form');

    await office.goto(`${origin}/admin`);
    const locationAction = office.locator(`[data-action-id="setup:${contract}:locations"]`);
    await locationAction.getByRole('link').last().click();
    await office.waitForURL(`**/admin/contracts/${contract}/locations*`);
    const locations = office.locator('form').filter({ has: office.getByRole('button', { name: 'Create locations', exact: true }) });
    await locations.getByLabel('A list of names', { exact: true }).check();
    await locations.locator('textarea[name=names]').fill('Bathroom\nKitchen');
    await locations.getByRole('button', { name: 'Create locations', exact: true }).click();
    await locations.getByRole('status').filter({ hasText: /created/i }).waitFor();
    const bathroom = sql(`select id from public.work_areas where contract_id='${contract}' and name='Bathroom'`);
    const kitchen = sql(`select id from public.work_areas where contract_id='${contract}' and name='Kitchen'`);
    assert.match(bathroom, /^[0-9a-f-]{36}$/); assert.match(kitchen, /^[0-9a-f-]{36}$/);
    await office.goto(`${origin}/admin`);
    assert.equal(await office.locator(`[data-action-id="setup:${contract}:locations"]`).count(), 0, 'saved locations remove only their own next action');
    pass('Phase 3 B: a setup task opens the real location editor; saved locations immediately remove that exact reminder');

    // Give the site a named supervisor and a finance-enabled manager using the
    // existing assignment RLS. Ordinary office users cannot allocate managers.
    for (const user_id of [id.supervisor, id.finance]) {
      const response = await rest(email.owner, 'contract_assignments', 'POST', { organisation_id: id.org, contract_id: contract, user_id }, { prefer: 'return=minimal' });
      assert.equal(response.status, 201, await response.text());
    }
    await rpc(email.owner, 'save_contract_commercial', { p_contract: contract, p_version: 0, p_data: {
      contract_value: 731923.45, labour_budget: 500000, materials_budget: 200000, target_margin: 35, payment_terms: 'SECRET-PHASE3-PAYMENT-TERMS',
    } });

    const upload = async (target, classification, title, reference) => {
      await target.goto(`${origin}/admin/contracts/${contract}#documents`);
      const details = target.locator('details').filter({ has: target.locator('summary').getByText('Upload a document revision or photo', { exact: true }) });
      await details.locator('summary').click();
      const form = details.locator('form');
      await form.locator('[name=document_reference]').fill(reference);
      await form.locator('[name=title]').fill(title);
      await form.locator('[name=classification]').selectOption(classification);
      await form.locator('input[type=file]').setInputFiles({ name: `${reference}.png`, mimeType: 'image/png', buffer: png });
      await form.getByRole('button', { name: 'Upload private revision', exact: true }).click();
      await form.getByRole('status').filter({ hasText: 'Private document revision uploaded' }).waitFor();
      const row = JSON.parse(sql(`select to_jsonb(d) from public.document_revisions d where contract_id='${contract}' and document_reference='${reference}'`));
      assert.ok(row.uploaded_at); assert.equal(row.classification, classification); return row.id;
    };
    const drawing = await upload(office, 'operational', 'Phase 3 approved operational drawing', 'P3-OP');
    const commercialDoc = await upload(owner, 'commercial', 'SECRET-PHASE3-COMMERCIAL-DOCUMENT', 'P3-COMMERCIAL');
    pass('Phase 3 C: operational and restricted commercial paperwork are uploaded and byte-verified through existing private document actions');

    const send = async (kind, title) => {
      await office.goto(`${origin}${site}/messages`);
      await office.getByText('Send a message or request an inspection', { exact: true }).click();
      const form = office.locator('form').filter({ has: office.locator('select[name=kind]') });
      await form.locator('[name=kind]').selectOption(kind);
      await form.locator('[name=recipient_id]').selectOption(id.supervisor);
      await form.locator('[name=title]').fill(title);
      await form.locator('[name=body]').fill('Inspect the actual saved bathroom and send the office the result.');
      if (kind === 'qa_request') {
        await form.getByRole('searchbox', { name: 'Location to inspect', exact: true }).fill('Bathroom');
        await form.getByRole('list', { name: 'Location to inspect choices' }).getByRole('button', { name: 'Bathroom', exact: true }).click();
      }
      await form.getByRole('button', { name: kind === 'qa_request' ? 'Send inspection request' : 'Send message', exact: true }).click();
      await form.getByRole('status').waitFor();
      return sql(`select id from public.supervisor_office_items where contract_id='${contract}' and title='${title}'`);
    };
    const instruction = await send('instruction', 'Phase 3 real instruction');
    const qa = await send('qa_request', 'Phase 3 real QA request');
    await office.goto(`${origin}/admin`);
    const waiting = office.getByRole('region', { name: 'Waiting on others', exact: true });
    await waiting.locator(`[data-action-id="ack:${instruction}"]`).waitFor();
    await waiting.locator(`[data-action-id="qa:${qa}"]`).waitFor();
    const taskLink = waiting.locator(`[data-action-id="qa:${qa}"]`).getByRole('link').last();
    assert.match(await taskLink.getAttribute('href'), new RegExp(`/tasks/${qa}`));
    await taskLink.click();
    await office.waitForURL(`**/tasks/${qa}`);
    await office.getByText('Phase 3 real QA request', { exact: false }).first().waitFor();
    pass('Phase 3 D: real messages and named QA requests are saved through the office form, remain waiting, and open their exact saved task');

    await office.goto(`${origin}/admin`);
    await office.getByRole('link', { name: 'Report an issue', exact: true }).click();
    await office.locator('select[name=contract]').selectOption(contract);
    await office.getByRole('button', { name: 'Choose site', exact: true }).click();
    await office.waitForURL(url => url.pathname === '/admin/snags/new' && url.searchParams.get('contract') === contract);
    // This is an existing native GET form. Its first client-heavy response
    // needs its chunks hydrated before testing the location/file handlers.
    await office.waitForLoadState('networkidle');
    const snag = office.locator('form').filter({ has: office.getByRole('button', { name: 'Raise snag', exact: true }) });
    await snag.getByRole('searchbox', { name: 'Exact location', exact: true }).fill('Bathroom');
    await snag.getByRole('list', { name: 'Exact location choices' }).getByRole('button', { name: 'Kitchen', exact: true }).waitFor({ state: 'hidden' });
    await snag.getByRole('list', { name: 'Exact location choices' }).getByRole('button', { name: 'Bathroom', exact: true }).click();
    assert.equal(await snag.locator('input[name=work_area_id]').inputValue(), bathroom);
    await snag.locator('[name=description]').fill('Phase 3 real issue reported from Office Today: uneven tile edge.');
    await snag.locator('[name=required_rectification]').fill('Inspect the edge and agree the required correction with the supervisor.');
    await snag.getByLabel('Choose photographs', { exact: true }).setInputFiles({ name: 'phase3-issue.png', mimeType: 'image/png', buffer: png });
    await snag.getByRole('img', { name: 'Selected photograph: phase3-issue.png', exact: true }).waitFor();
    const invalid = await snag.evaluate(form => [...form.elements].filter(field => field.willValidate && !field.validity.valid).map(field => ({ name: field.name, message: field.validationMessage })));
    assert.deepEqual(invalid, [], 'the existing issue form has all required fields before saving');
    await snag.getByRole('button', { name: 'Raise snag', exact: true }).click();
    await office.waitForURL(url => /^\/admin\/snags\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 60000 });
    const snagId = new URL(office.url()).pathname.split('/').at(-1);
    assert.equal(sql(`select snag_status from public.supervisor_issues where id='${snagId}' and contract_id='${contract}'`), 'open');
    assert.equal(sql(`select count(*) from public.supervisor_issue_photos where issue_id='${snagId}' and uploaded_at is not null`), '1');
    pass('Phase 3 D2: Report an issue opens the real job/location form and persists an open snag with verified private photographic evidence');

    const morningSupervisor = await account(email.supervisor);
    await morningSupervisor.goto(`${origin}${site}/checks`);
    const morningGroups = morningSupervisor.locator('main fieldset').filter({ has: morningSupervisor.getByRole('button', { name: 'YES', exact: true }) });
    assert.equal(await morningGroups.count(), 11);
    for (let index = 0; index < 11; index++) await morningGroups.nth(index).getByRole('button', { name: index === 3 || index >= 9 ? 'NO' : 'YES', exact: true }).click();
    const blockerText = 'Phase 3 saved morning blocker: adhesive delivery has not arrived.';
    await morningSupervisor.getByRole('group', { name: 'Adhesive available?', exact: true }).getByLabel('Short note (optional)', { exact: true }).fill(blockerText);
    await morningSupervisor.getByRole('button', { name: 'COMPLETE MORNING CHECKS', exact: true }).click();
    await morningSupervisor.getByRole('heading', { name: 'Morning checks complete', exact: true }).waitFor();
    const morningIssue = sql(`select id from public.supervisor_issues where contract_id='${contract}' and snag_status is null and description='${blockerText}'`);
    assert.match(morningIssue, /^[0-9a-f-]{36}$/);
    await office.goto(`${origin}/admin`);
    const morningAction = office.locator(`[data-action-id="readiness:${morningIssue}"]`);
    assert.equal(await morningAction.count(), 1, 'an unresolved morning finding must stay visible to the office');
    await morningAction.getByRole('link').last().click();
    await office.getByText(blockerText, { exact: false }).first().waitFor();
    pass('Phase 3 D3: a real adverse morning check creates its existing legacy issue and appears in Office Today with a working saved-finding link');
    const handover = await rpc(email.supervisor, 'record_site_handover', { p_request_key: randomUUID(), p_data: {
      contract_id: contract, finished_at: new Date().toISOString(), finish_workforce: false,
      work_completed: 'Phase 3 saved handover: bathroom prepared and kitchen remains stopped.',
    } });
    assert.match(handover, /^[0-9a-f-]{36}$/);

    const person = await rpc(email.office, 'create_operative', { p_request_key: randomUUID(), p_data: { display_name: 'Phase 3 Hold Fixer', engagement: 'direct_employee' } });
    const hold = async (type, area, reason, actor = email.office) => rpc(actor, 'create_work_hold', { p_request_key: randomUUID(), p_data: {
      contract_id: contract, work_area_id: area, stage: 'installation', activity: `Phase 3 ${type} affected work`, hold_type: type,
      category: type === 'safety' ? 'Unsafe access or platform' : 'Failed waterproofing inspection', severity: type === 'safety' ? 'critical' : 'major',
      reason, required_action: 'Repair the affected work and obtain an independent authorised decision.',
      evidence_explanation: 'Concern documented immediately; approved drawing records the affected scope.',
    } });
    const qualityHold = await hold('quality', bathroom, 'Phase 3 saved quality hold awaiting an independent reviewer');
    const transition = (actor, action, data) => rpc(actor, 'transition_work_hold', { p_hold: qualityHold, p_request_key: randomUUID(),
      p_version: Number(sql(`select version from public.work_holds where id='${qualityHold}'`)), p_action: action, p_data: data });
    await transition(email.office, 'assign', { note: 'Named corrective operative allocated.', operative_id: person, target_date: today, required_action: 'Correct the bathroom work against the approved drawing.' });
    await transition(email.office, 'submit_correction', { note: 'Correction checked against the recorded drawing.', document_ids: [drawing], completed_at: new Date().toISOString() });
    await transition(email.office, 'request_release', { note: 'Independent office review requested.' });
    const safetyHold = await hold('safety', kitchen, 'Phase 3 saved safety stop: unsafe kitchen access', email.supervisor);
    await office.goto(`${origin}/admin`);
    const barred = office.getByRole('region', { name: 'Waiting on others', exact: true }).locator(`[data-action-id="hold-release:${qualityHold}"]`);
    await barred.waitFor(); assert.equal(await barred.getAttribute('data-action-state'), 'blocked');
    await barred.getByText(/someone else|independent|raised this stop/i).first().waitFor();
    await owner.goto(`${origin}/admin`);
    const decision = owner.locator(`[data-action-id="hold-release:${qualityHold}"]`);
    await decision.waitFor(); assert.equal(await decision.getAttribute('data-action-state'), 'ready');
    await owner.getByRole('region', { name: 'Outstanding problems', exact: true }).locator(`[data-action-id="hold-assign:${safetyHold}"]`).waitFor();
    for (const target of [office, owner]) {
      const stopped = target.getByRole('region', { name: 'Work that is stopped', exact: true });
      await stopped.locator(`[data-hold-id="${qualityHold}"]`).waitFor();
      await stopped.locator(`[data-hold-id="${safetyHold}"]`).waitFor();
      assert.doesNotMatch(await target.getByRole('main').innerText(), /all work is clear|all work cleared/i);
    }
    const refused = await rest(email.office, 'rpc/transition_work_hold', 'POST', { p_hold: qualityHold, p_request_key: randomUUID(),
      p_version: Number(sql(`select version from public.work_holds where id='${qualityHold}'`)), p_action: 'release', p_data: { note: 'Attempt self-authorisation from the office dashboard.' } });
    assert.equal(refused.status, 403); assert.match(await refused.text(), /independent/i);
    assert.equal(sql(`select status from public.work_holds where id='${qualityHold}'`), 'awaiting_release');
    pass('Phase 3 E: persisted safety/quality stops remain visible to office and owner; a raiser/corrector cannot independently release their own hold');

    // More tasks than a typical dashboard limit: every saved setup record must
    // still appear in the complete Then list, once, with an honest count.
    const extraJobs = [];
    for (let index = 1; index <= 12; index++) extraJobs.push(await rpc(email.office, 'create_contract', { p_organisation: id.org, p_request_key: randomUUID(), p_data: {
      reference: `P3-QUEUE-${index}`, name: `Phase 3 queue job ${index}`, client: 'Acceptance client', address: 'Test-only queue address',
      scope: 'No production work', start_date: today, end_date: today,
    } }));
    const draft = await rpc(email.office, 'create_contract', { p_organisation: id.org, p_request_key: randomUUID(), p_data: {
      reference: 'P3-NO-DATES', name: 'Phase 3 unprogrammed saved draft', client: 'Acceptance client', address: 'Test-only unprogrammed address', scope: 'Draft with no dates yet',
    } });
    await office.goto(`${origin}/admin`);
    await office.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    for (const job of extraJobs) for (const step of ['locations', 'supervisor', 'spec']) {
      assert.equal(await office.locator(`[data-action-id="setup:${job}:${step}"]`).count(), 1, 'each real remaining setup action is displayed exactly once');
    }
    const dates = office.locator(`[data-action-id="setup:${draft}:details"]`);
    await dates.getByText('Complete the job dates', { exact: true }).waitFor();
    assert.match(await dates.getByRole('link').last().getAttribute('href'), new RegExp(`/contracts/${draft}#contract-information`));
    const then = office.getByRole('region', { name: 'Then', exact: true });
    const thenCount = await then.locator('[data-action-id]').count();
    assert.ok(thenCount >= 36); await then.getByRole('heading', { name: `Then (${thenCount})`, exact: true }).waitFor();
    assert.equal(await office.getByTestId('today-action-count').innerText(), `${thenCount + 1} things need you.`);
    assert.equal(await office.getByRole('region', { name: 'Do this next', exact: true }).count(), 1);
    assert.ok(await office.getByRole('region', { name: 'Do this next', exact: true }).getAttribute('data-action-id'));
    const actionIds = await office.locator('main [data-action-id]').evaluateAll(nodes => nodes.map(node => node.dataset.actionId));
    assert.equal(new Set(actionIds).size, actionIds.length, 'no task is duplicated between next, then and waiting');
    pass('Phase 3 F: all 36 saved setup actions remain visible without truncation; Then counts and unique next/waiting assignment are exact');
    const readOnlyHistory = snapshot(['contracts', 'work_areas', 'planned_allocations', 'actual_allocations',
      'supervisor_inspections', 'location_inspections', 'supervisor_issues', 'supervisor_issue_events',
      'work_holds', 'work_hold_events', 'document_revisions', 'supervisor_office_items', 'audit_events']);

    // Collect links from the real UI, not a hard-coded list of destinations.
    const links = [...new Set(await office.locator('main a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))))];
    for (const href of links) {
      if (href?.startsWith('#')) {
        assert.equal(await office.locator(href).count(), 1, `useful in-page destination: ${href}`);
        continue;
      }
      assert.ok(href?.startsWith('/admin'), `useful internal destination: ${href}`);
      const response = await office.request.get(`${origin}${href}`);
      assert.equal(response.status(), 200, `Office Today destination ${href}`);
      assert.doesNotMatch(await response.text(), /Application error|NEXT_NOT_FOUND|Records are temporarily unavailable|Your account does not have permission/);
    }
    pass('Phase 3 G: every link rendered by real Office Today reaches an authorised, healthy existing page');

    const finance = await account(email.finance), other = await account(email.other), supervisor = await account(email.supervisor), installer = await account(email.installer);
    for (const target of [office, owner, finance]) {
      await target.goto(`${origin}/admin`);
      const html = await target.content();
      assert.doesNotMatch(html, /731,?923\.45|SECRET-PHASE3-PAYMENT-TERMS|SECRET-PHASE3-COMMERCIAL-DOCUMENT/,
        'Today never serialises commercial figures or restricted document metadata');
    }
    for (const target of [owner, finance]) {
      await target.goto(`${origin}/admin/money`);
      await target.getByRole('heading', { name: 'Money', exact: true }).waitFor();
      await target.getByText('£731,923.45', { exact: true }).waitFor();
    }
    for (const target of [office, supervisor, installer]) {
      const response = await target.request.get(`${origin}/admin/money`);
      assert.equal(response.status(), 404);
      assert.doesNotMatch(await response.text(), /731,?923\.45|SECRET-PHASE3|Original budgets/);
    }
    for (const [address, expected] of [[email.office, 0], [email.supervisor, 0], [email.installer, 0], [email.other, 0], [email.finance, 1], [email.owner, 1]]) {
      const response = await rest(address, `contract_commercials?select=*&contract_id=eq.${contract}`);
      assert.equal(response.status, 200); assert.equal((await response.json()).length, expected, `${address}: existing financial RLS`);
    }
    pass('Phase 3 H: Today excludes financial payloads; Money and raw commercial RLS allow only the owner or explicitly authorised assigned manager');

    await office.goto(`${origin}/admin/paperwork?contract_id=${contract}`);
    await office.getByRole('heading', { name: 'Paperwork', exact: true }).waitFor();
    await office.getByText('Phase 3 approved operational drawing', { exact: false }).first().waitFor();
    assert.doesNotMatch(await office.content(), /SECRET-PHASE3-COMMERCIAL-DOCUMENT|P3-COMMERCIAL/);
    const drawingResponse = await office.request.get(`${origin}/admin/documents/${drawing}`);
    assert.equal(drawingResponse.status(), 200); assert.deepEqual(await drawingResponse.body(), png);
    const hiddenDocument = await office.request.get(`${origin}/admin/documents/${commercialDoc}`);
    assert.equal(hiddenDocument.status(), 404); assert.doesNotMatch(await hiddenDocument.text(), /SECRET-PHASE3/);
    await owner.goto(`${origin}/admin/paperwork?contract_id=${contract}`);
    await owner.getByText('SECRET-PHASE3-COMMERCIAL-DOCUMENT', { exact: false }).first().waitFor();
    await office.goto(`${origin}/admin/messages?contract_id=${contract}`);
    await office.getByText('Phase 3 real instruction', { exact: false }).first().waitFor();
    await office.getByText('Phase 3 real QA request', { exact: false }).first().waitFor();
    const handovers = office.getByRole('region', { name: 'Recent handovers', exact: true });
    await handovers.locator('summary').filter({ hasText: 'Phase 3 saved office job' }).click();
    await handovers.getByText('Phase 3 saved handover: bathroom prepared and kitchen remains stopped.', { exact: true }).waitFor();
    pass('Phase 3 I: Paperwork opens verified operational bytes and hides commercial metadata/files; Messages shows actual saved instructions and QA requests');

    // Shared Job Activity: one story built from the records saved above, for the office and the site.
    await rpc(email.supervisor, 'acknowledge_supervisor_office_item', { p_item: instruction, p_request_key: randomUUID() });
    await office.goto(`${origin}/admin/messages?contract_id=${contract}`);
    await office.locator('article').filter({ hasText: 'Phase 3 real instruction' }).getByText(/^Acknowledged by Sid Supervisor at \d{2}:\d{2}, /).waitFor();
    await office.locator('article').filter({ hasText: 'Phase 3 real QA request' }).getByText('Waiting for Sid Supervisor to send the result', { exact: true }).waitFor();
    await office.goto(`${origin}${site}/activity`);
    await office.getByRole('heading', { name: 'Job activity', exact: true }).waitFor();
    const story = (await office.locator('main ol').allInnerTexts()).join('\n');
    for (const line of [/sent an instruction to Sid Supervisor: “Phase 3 real instruction”/, /Sid Supervisor\s+acknowledged “Phase 3 real instruction”/,
      /asked Sid Supervisor to inspect .*“Phase 3 real QA request”/, /Sid Supervisor\s+sent the end-of-day handover/, /stopped work \((safety stop|quality hold)\)/,
      /uploaded Phase 3 approved operational drawing/]) assert.match(story, line);
    assert.doesNotMatch(story, /SECRET-PHASE3|P3-COMMERCIAL/, 'commercial documents are not part of the shared story');
    const order = await office.locator('[data-activity]').evaluateAll(rows => rows.map(row => row.getAttribute('data-activity')));
    assert.ok(order.indexOf(`message:${instruction}`) > order.findIndex(entry => entry.startsWith('ack:')), 'newest first: the acknowledgement is above the instruction');
    for (const href of await office.locator('[data-activity] a[href]').evaluateAll(links => links.map(link => link.getAttribute('href')))) {
      if (href.startsWith('/admin/documents/')) continue;
      assert.equal((await office.request.get(`${origin}${href.split('#')[0]}`)).status(), 200, `activity link ${href} opens a healthy saved record`);
    }
    // The opt-in in this run covers office and owner only; the shared page follows the same boundary.
    assert.equal((await supervisor.request.get(`${origin}${site}/activity`)).status(), 404, 'a role that is not opted in does not get the new page');
    pass('Phase 3 I2: Job Activity tells the saved story newest first, names who acknowledged and when, and every line opens a healthy record');

    await other.goto(`${origin}/admin`);
    await other.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    assert.doesNotMatch(await other.content(), /PHASE3-LIVE|Phase 3 saved office job|Phase 3 real instruction|unsafe kitchen access|731,?923\.45/);
    for (const target of [other, supervisor, installer]) {
      for (const path of [`/admin/paperwork?contract_id=${contract}`, `/admin/messages?contract_id=${contract}`]) {
        const response = await target.request.get(`${origin}${path}`);
        assert.equal(response.status(), 404, `${path}: role and contract boundary`);
        assert.doesNotMatch(await response.text(), /Phase 3 saved office job|SECRET-PHASE3|Phase 3 real instruction/);
      }
    }
    const outOfScope = await other.request.get(`${origin}/admin/holds/${safetyHold}`);
    assert.equal(outOfScope.status(), 404);
    await supervisor.goto(`${origin}/admin`);
    assert.match(new URL(supervisor.url()).pathname, /^\/admin\/supervisor/);
    assert.equal(await supervisor.getByRole('navigation', { name: 'Main', exact: true }).count(), 0, 'office opt-in does not enable the supervisor shell');
    await installer.goto(`${origin}/admin`);
    assert.equal(await installer.getByRole('heading', { name: 'Today', exact: true }).count(), 0, 'office opt-in does not replace installer admin');
    pass('Phase 3 J: other organisations see no saved job/hold/message data; supervisors and installers cannot enter new office indexes or inherit its opt-in');

    for (const [target, role] of [[office, 'office'], [owner, 'owner']]) for (const width of [320, 390]) {
      await target.setViewportSize({ width, height: 844 });
      await target.goto(`${origin}/admin`);
      await target.getByRole('heading', { name: 'Today', exact: true }).waitFor();
      await target.evaluate(() => document.fonts.ready);
      assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${role} Today does not overflow at ${width}px`);
      if (screenshots) await target.screenshot({ path: join(screenshots, `phase3-${role}-today-${width}-viewport.png`),
        caret: 'initial', style: 'nextjs-portal { display: none !important; }' });
      const mainNav = target.getByRole('navigation', { name: 'Main', exact: true });
      assert.ok(await mainNav.getByRole('link').count() <= 4);
      await target.getByText('Everything else', { exact: true }).click();
      for (const label of ['Workforce', 'Site dashboards', 'Snag register', 'Holds and releases', 'Site alerts', 'Quality control', 'Tenders']) {
        await target.getByRole('link', { name: label, exact: true }).first().waitFor();
      }
      assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${role} expanded menu does not overflow at ${width}px`);
      if (screenshots) await target.screenshot({ path: join(screenshots, `phase3-${role}-today-${width}.png`), fullPage: true,
        caret: 'initial', style: 'nextjs-portal { display: none !important; }' });
      if (role === 'owner') assert.deepEqual(await mainNav.getByRole('link').allTextContents(), ['Today', 'Jobs', 'Money']);
      const ready = await target.locator('main [data-action-state="ready"]').count();
      assert.equal(await target.getByTestId('today-action-count').innerText(), ready === 1 ? '1 thing needs you.' : `${ready} things need you.`);
      for (const path of [`/admin/paperwork?contract_id=${contract}`, `/admin/messages?contract_id=${contract}`]) {
        await target.goto(`${origin}${path}`);
        await target.getByRole('main').waitFor();
        assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${role} ${path} does not overflow at ${width}px`);
        if (screenshots) await target.screenshot({ path: join(screenshots, `phase3-${role}-${path.includes('paperwork') ? 'paperwork' : 'messages'}-${width}.png`), fullPage: true,
          caret: 'initial', style: 'nextjs-portal { display: none !important; }' });
      }
    }
    pass('Phase 3 K: real Office/Owner Today and expanded Everything else work at 320px/390px with at most four main destinations and no horizontal overflow');

    preserve(prior);
    preserve(readOnlyHistory);
    for (const [table, rows] of readOnlyHistory) assert.equal(sql(`select count(*) from public.${table}`), String(rows.length), `${table}: read-only screens create no records`);
    assert.equal(sql(`select count(*) from public.work_hold_events where hold_id='${qualityHold}' and action='release'`), '0');
    assert.equal(sql(`select count(*) from public.work_hold_events where hold_id='${safetyHold}' and action='raise'`), '1');
    assert.ok(Number(sql(`select count(*) from public.audit_events where contract_id='${contract}' and actor_id='${id.office}'`)) > 0,
      'the real office writes retain their audit records');
    assert.deepEqual(errors, [], 'no unhandled authenticated browser errors');
    pass('Phase 3 L: all earlier jobs, allocations, inspections, issues, hold histories and audit rows remain unchanged; dashboards never create release decisions');
  } catch (error) {
    for (const context of contexts) for (const page of context.pages()) {
      console.error(`Phase 3 page: ${page.url()}\n${(await page.locator('body').innerText({ timeout: 5000 }).catch(() => '(unreadable)')).slice(0, 7000)}`);
    }
    throw error;
  } finally { for (const context of contexts) await context.close(); }
}
