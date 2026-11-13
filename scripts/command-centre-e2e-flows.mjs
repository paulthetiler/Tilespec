// The office command centre's morning journey, end to end, against the real migrated database:
// a supervisor reports yesterday's work and asks for a decision; the owner reviews the day from
// the command centre, decides, orders materials, onboards a gang, issues a portal link, prices a
// quotation, checks the money, and switches on email notifications (delivered to a local stand-in
// for the email service, so nothing leaves this machine). Role boundaries are checked on the way.
import assert from 'node:assert/strict';
import { join } from 'node:path';

const londonDay = offset => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const londonClock = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

export async function runCommandCentre({ browser, origin, sql, signIn, screenshots, pass, contractId, emails, cronSecret, dispatchToken }) {
  const errors = [];
  const watch = page => page.on('console', message => { if (message.type() === 'error' && !/favicon|Download the React DevTools/.test(message.text())) errors.push(message.text()); });
  const dispatch = async () => {
    const response = await fetch(`${origin}/api/cron/notifications`, { headers: { authorization: `Bearer ${cronSecret}` } });
    assert.equal(response.status, 200, 'the scheduled dispatcher runs with the schedule secret');
    return response.json();
  };
  const yesterday = londonDay(-1);

  // ---- 1. Site: yesterday's progress, materials needed and a decision request ----------------
  const siteContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sid = await signIn(siteContext, origin, 'sid.supervisor@e2e.invalid'); watch(sid);
  await sid.goto(`${origin}/admin/supervisor/sites/${contractId}`);
  await sid.getByRole('link', { name: /Site diary/ }).first().click();
  await sid.getByRole('heading', { name: 'Site diary', exact: true }).waitFor();
  const progress = sid.locator('form').filter({ has: sid.getByRole('button', { name: 'Save progress', exact: true }) });
  await progress.getByLabel('What was done').fill('Corridor 1 floor tiled and grouted');
  await progress.getByLabel('Against the package (optional)').selectOption({ index: 1 });
  await progress.getByLabel('Quantity done').fill('40');
  await progress.getByLabel('Day', { exact: true }).fill(yesterday);
  await progress.getByRole('button', { name: 'Save progress', exact: true }).click();
  await sid.getByText('Progress saved.', { exact: false }).waitFor();
  const materials = sid.locator('form').filter({ has: sid.getByRole('button', { name: 'Ask the office for materials', exact: true }) });
  await materials.getByLabel('Item').fill('Grey grout 5 kg');
  await materials.getByLabel('Quantity').fill('10');
  await materials.getByRole('button', { name: 'Ask the office for materials', exact: true }).click();
  await sid.getByText('Materials requested.', { exact: false }).waitFor();
  await sid.goto(`${origin}/admin/supervisor/sites/${contractId}/messages`);
  const ask = sid.locator('form').filter({ has: sid.getByRole('button', { name: 'Send to the office', exact: true }) });
  await ask.getByLabel('What is it?').selectOption('decision');
  await ask.getByLabel('Your message').fill('Main contractor offers a grey grout instead of the specified charcoal. Can we accept?');
  await ask.getByRole('button', { name: 'Send to the office', exact: true }).click();
  await sid.getByText('Message sent to the office.', { exact: false }).waitFor();
  assert.equal(Number(sql(`select count(*) from public.site_progress_entries where contract_id='${contractId}' and work_date='${yesterday}' and quantity=40`)), 1);
  assert.equal(sql(`select category||':'||needs_answer from public.job_messages where contract_id='${contractId}' and thread_id=id and body like 'Main contractor offers%'`), 'decision:true');
  pass('Command centre 1: a supervisor records yesterday\'s quantity, asks for materials and requests a decision from the site diary and messages');

  // ---- 2. The owner's morning: everything on one page ------------------------------------------
  const officeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const cara = await signIn(officeContext, origin, 'cara.owner@e2e.invalid'); watch(cara);
  await cara.goto(`${origin}/admin`);
  await cara.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  const metrics = cara.getByRole('navigation', { name: 'Summary', exact: true });
  assert.equal(await metrics.getByRole('link').count(), 6, 'six summary figures');
  assert.ok(await cara.locator('[data-metric="in"]').count() === 1 && await cara.locator('[data-metric="out"]').count() === 1, 'the owner sees money in and out');
  await cara.getByRole('navigation', { name: 'Office menu', exact: true }).waitFor();
  for (const label of ['Inbox', 'Planner', 'Materials', 'Money overview', 'Customers', 'Quotations', 'Startup expenses', 'Company documents (RAMS, COSHH)', 'Business settings', 'Email notifications'])
    await cara.getByRole('navigation', { name: 'Office menu', exact: true }).getByRole('link', { name: label, exact: true }).waitFor();
  const job = cara.locator('[data-job="APT-B"]');
  await job.waitFor();
  const percent = Number((await job.innerText()).match(/(\d+)%\s*done/)?.[1] ?? 0);
  assert.ok(percent > 0, 'the live job shows progress measured against its packages');
  const day = cara.locator('[data-yesterday="APT-B"]');
  assert.match(await day.innerText(), /Corridor 1 floor tiled and grouted · 40 m2/);
  await cara.getByText(/1 supervisor question or decision waiting for an answer/).waitFor();
  await cara.getByRole('heading', { name: 'Financial control', exact: true }).waitFor();
  await cara.getByRole('heading', { name: 'Planning: next 14 days', exact: true }).waitFor();
  await cara.getByText('Grey grout 5 kg', { exact: false }).first().waitFor();
  assert.ok(!(await cara.getByTestId('today-action-count').innerText()).startsWith('Nothing needs you right now'), 'the header never claims all is clear while work waits');
  if (screenshots) await cara.screenshot({ path: join(screenshots, 'command-centre-owner-1440.png'), fullPage: true });
  pass('Command centre 2: the owner sees six figures, every section, the live job\'s progress, yesterday\'s report and the waiting decision on one page');

  // Confirm the job's stage; it is recorded in the job's history.
  await cara.goto(`${origin}/admin/contracts/${contractId}`);
  await cara.getByText('Change the stage', { exact: true }).click();
  const stage = cara.locator('form').filter({ has: cara.getByRole('button', { name: 'Save stage', exact: true }) });
  await stage.getByLabel('Stage').selectOption('live');
  await stage.getByRole('button', { name: 'Save stage', exact: true }).click();
  await cara.getByText('Job stage saved.', { exact: false }).waitFor();
  assert.equal(sql(`select lifecycle_stage from public.contracts where id='${contractId}'`), 'live');

  // ---- 3. Inbox: decide, and the supervisor sees the decision --------------------------------
  await cara.goto(`${origin}/admin/inbox`);
  const thread = cara.locator('[data-inbox-thread]').filter({ hasText: 'Main contractor offers a grey grout' });
  await thread.waitFor();
  const decide = thread.locator('form').filter({ has: cara.getByRole('button', { name: 'Record and tell site', exact: true }) });
  await decide.getByLabel('Outcome').selectOption('approved');
  await decide.getByLabel('Answer, condition or reason').fill('Accept grey on level 5 corridors only');
  await decide.getByRole('button', { name: 'Record and tell site', exact: true }).click();
  await cara.getByText('Approved. The supervisor sees your decision', { exact: false }).waitFor();
  await sid.goto(`${origin}/admin/supervisor/sites/${contractId}/messages`);
  await sid.getByText('Decision: approved: Accept grey on level 5 corridors only', { exact: true }).waitFor();
  pass('Command centre 3: the owner decides from the inbox and the supervisor sees the decision in the conversation');

  // ---- 4. Materials, search and the job's history ---------------------------------------------
  await cara.goto(`${origin}/admin/materials`);
  const request = cara.locator('[data-material-status="requested"]').filter({ hasText: 'Grey grout 5 kg' });
  await request.getByText('Record the order', { exact: true }).click();
  await request.getByLabel('Supplier').fill('E2E Tile Supplies');
  await request.getByRole('button', { name: 'Save', exact: true }).click();
  await cara.getByText('Materials record saved.', { exact: true }).waitFor();
  assert.equal(sql(`select status||':'||supplier from public.material_requests where item='Grey grout 5 kg'`), 'ordered:E2E Tile Supplies');
  await cara.goto(`${origin}/admin/search?q=Riverside`);
  await cara.locator('[data-search-hit="job"]').first().waitFor();
  await cara.goto(`${origin}/admin/contracts/${contractId}/activity?date=${londonDay(0)}`);
  await cara.getByRole('heading', { name: 'Job activity', exact: true }).waitFor();
  await cara.getByText(/recorded progress: Corridor 1 floor tiled and grouted/).waitFor();
  await cara.getByText(/approved a decision request/).waitFor();
  await cara.getByText(/confirmed the job is live/).waitFor();
  pass('Command centre 4: materials are ordered, search finds the job, and the job history shows progress, the decision and the stage');

  // ---- 5. Customers and quotations -------------------------------------------------------------
  await cara.goto(`${origin}/admin/customers`);
  const addCustomer = cara.locator('#new form');
  await addCustomer.getByLabel('Name', { exact: true }).fill('E2E Main Contractor Ltd');
  await addCustomer.getByRole('button', { name: 'Add customer', exact: true }).click();
  await cara.getByRole('heading', { name: 'E2E Main Contractor Ltd', exact: true }).waitFor();
  await cara.goto(`${origin}/admin/contracts/${contractId}`);
  await cara.getByText('Link a customer', { exact: true }).click();
  const link = cara.locator('form').filter({ has: cara.getByRole('button', { name: 'Save customer', exact: true }) });
  await link.getByLabel('Customer').selectOption({ label: 'E2E Main Contractor Ltd' });
  await link.getByRole('button', { name: 'Save customer', exact: true }).click();
  await cara.getByText('Customer linked to this job.', { exact: true }).waitFor();
  await cara.goto(`${origin}/admin/quotes`);
  const quote = cara.locator('#new form');
  await quote.getByLabel('Title').fill('Riverside Block C bathrooms');
  await quote.getByLabel('Customer').selectOption({ label: 'E2E Main Contractor Ltd' });
  await quote.getByLabel('Value, excluding VAT (£)').fill('12500');
  await quote.getByRole('button', { name: 'Create quotation', exact: true }).click();
  await cara.getByRole('heading', { name: /Q-\d{5} · Riverside Block C bathrooms/ }).waitFor();
  const status = cara.locator('form').filter({ has: cara.getByRole('button', { name: 'Record the status', exact: true }) });
  await status.getByLabel('New status').selectOption('sent');
  await status.getByRole('button', { name: 'Record the status', exact: true }).click();
  await cara.getByText('Recorded as sent.', { exact: false }).waitFor();
  assert.equal(sql(`select status from public.quotes where title='Riverside Block C bathrooms'`), 'sent');
  pass('Command centre 5: a customer is added and linked to the job; a quotation is priced and sent');

  // ---- 6. Subcontractor onboarding and a secure portal link -----------------------------------
  await cara.goto(`${origin}/admin/subcontractors/new`);
  const gang = cara.locator('form').filter({ has: cara.getByRole('button', { name: 'Add and start onboarding', exact: true }) });
  await gang.getByLabel('Gang name').fill('E2E Morning Gang');
  await gang.getByLabel('New company name').fill('E2E Morning Gang Ltd');
  await gang.getByRole('button', { name: 'Add and start onboarding', exact: true }).click();
  await cara.waitForURL(/\/admin\/subcontractors\/[0-9a-f-]{36}$/);
  await cara.getByRole('heading', { name: 'E2E Morning Gang', exact: true }).waitFor();
  const portal = cara.locator('form').filter({ has: cara.getByRole('button', { name: 'Create a new link', exact: true }) });
  await portal.getByLabel('Issued to (the person who will use it)').fill('Morgan Gang');
  await portal.getByRole('button', { name: 'Create a new link', exact: true }).click();
  await cara.getByText('Link created.', { exact: false }).waitFor();
  assert.match(await cara.getByLabel('Personal link for Morgan Gang').inputValue(), /\/subcontractors\/access\/[A-Za-z0-9_-]{20,}$/);
  assert.equal(Number(sql(`select count(*) from public.subcontractor_portal_links l join public.teams t on t.id=l.team_id where t.name='E2E Morning Gang' and l.revoked_at is null`)), 1);
  pass('Command centre 6: a gang and its company are created in one step and a secure portal link is issued from its onboarding page');

  // ---- 7. Money -----------------------------------------------------------------------------
  await cara.goto(`${origin}/admin/finance`);
  await cara.getByRole('heading', { name: 'Debtors, cash flow and profitability', exact: true }).waitFor();
  await cara.getByRole('heading', { name: /Customers owe/ }).waitFor();
  await cara.getByRole('heading', { name: 'Cash flow: next 12 weeks', exact: true }).waitFor();
  await cara.goto(`${origin}/admin/contracts/${contractId}/money`);
  await cara.getByRole('heading', { name: 'Job money', exact: true }).waitFor();
  await cara.goto(`${origin}/admin/gang-invoices`);
  await cara.getByRole('heading', { name: 'Gang invoices', exact: true }).first().waitFor();
  await cara.goto(`${origin}/admin/planner`);
  await cara.getByRole('heading', { name: 'Workforce and programme planner', exact: true }).waitFor();
  pass('Command centre 7: debtors, cash flow, job money, gang invoices and the planner open from the command centre');

  // ---- 8. Email notifications: verified before switching on, logged, never duplicated --------
  const unauthorised = await fetch(`${origin}/api/cron/notifications`);
  assert.equal(unauthorised.status, 401, 'the dispatcher refuses a request without the schedule secret');
  await cara.goto(`${origin}/admin/notifications`);
  const add = cara.locator('form').filter({ has: cara.getByRole('button', { name: 'Add recipient', exact: true }) });
  await add.getByLabel('Person').selectOption({ label: 'Cara Owner (owner)' });
  await add.getByRole('button', { name: 'Add recipient', exact: true }).click();
  await cara.getByText('Recipient added.', { exact: false }).waitFor();
  await cara.getByRole('button', { name: 'Create the key', exact: true }).click();
  const shown = (await cara.getByText(/New dispatcher key: [0-9a-f]{64}/).innerText()).match(/[0-9a-f]{64}/)[0];
  assert.equal(sql(`select dispatcher_token_hash=encode(sha256(convert_to('${shown}','UTF8')),'hex') from public.notification_settings where organisation_id='e2e00000-0000-4000-8000-0000000000a1'`), 't');
  // The test's dispatcher was started with a fixed key; store that key's fingerprint in its place.
  sql(`update public.notification_settings set dispatcher_token_hash=encode(sha256(convert_to('${dispatchToken}','UTF8')),'hex') where organisation_id='e2e00000-0000-4000-8000-0000000000a1'`);
  await cara.goto(`${origin}/admin/notifications`);
  await cara.getByRole('button', { name: 'Send a test message', exact: true }).click();
  await cara.getByText('Test message queued.', { exact: false }).waitFor();
  let run = await dispatch();
  const test = emails.filter(email => email.subject === 'TileSPEC test message');
  assert.equal(test.length, 1, 'the test message reached the email service once');
  assert.deepEqual(test[0].to, ['cara.owner@e2e.invalid']);
  assert.ok(test[0].idempotencyKey, 'each email carries its outbox id so a retry is never sent twice');
  await cara.goto(`${origin}/admin/notifications`);
  await cara.getByRole('button', { name: 'It arrived: confirm this mailbox', exact: true }).click();
  await cara.getByText(/^Confirmed /).first().waitFor();
  await cara.goto(`${origin}/admin/notifications`);
  const delivery = cara.locator('form').filter({ has: cara.getByRole('button', { name: 'Save delivery settings', exact: true }) });
  await delivery.getByLabel(/Send emails/).check();
  await delivery.getByRole('button', { name: 'Save delivery settings', exact: true }).click();
  await cara.getByText('Email delivery is on.', { exact: true }).waitFor();

  // An urgent problem from site is emailed at the next dispatch, once.
  await sid.goto(`${origin}/admin/supervisor/sites/${contractId}/messages`);
  const urgent = sid.locator('form').filter({ has: sid.getByRole('button', { name: 'Send to the office', exact: true }) });
  await urgent.getByLabel('What is it?').selectOption('problem');
  await urgent.getByLabel('Your message').fill('Water leak from the riser on level 5. Work stopped in Corridor 1.');
  await urgent.getByLabel(/Urgent: email the office now/).check();
  await urgent.getByRole('button', { name: 'Send to the office', exact: true }).click();
  await sid.getByText('Message sent to the office.', { exact: false }).waitFor();
  run = await dispatch();
  const alert = emails.filter(email => /^Problem on site: APT-B/.test(email.subject));
  assert.equal(alert.length, 1, 'the urgent problem is emailed');
  assert.match(alert[0].text, /Water leak from the riser/);
  assert.match(alert[0].text, /https:\/\/tilespec\.example\/admin\/inbox\?thread=/, 'the email opens the conversation directly');
  await dispatch();
  assert.equal(emails.filter(email => /^Problem on site: APT-B/.test(email.subject)).length, 1, 'never sent twice');
  if (londonClock() >= '07:00') {
    const summaries = emails.filter(email => /^TileSPEC morning summary/.test(email.subject));
    assert.equal(summaries.length, 1, 'one morning summary to the confirmed owner');
    assert.match(summaries[0].text, /Yesterday on site/);
    assert.match(summaries[0].text, /APT-B/);
  }
  await cara.goto(`${origin}/admin/notifications`);
  assert.ok(await cara.locator('[data-outbox-status="sent"]').count() >= 2, 'the delivery log shows what was sent');
  pass(`Command centre 8: notifications are verified with a test message, switched on deliberately, sent once with direct links and logged (${JSON.stringify(run)})`);

  assert.deepEqual(errors, [], 'no browser console errors during the morning journey');
  // ---- 9. Role boundaries on the new pages --------------------------------------------------
  // The pages refused below answer "not found" on purpose; the browser logs that response as an error.
  const managerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mia = await signIn(managerContext, origin, 'mia.manager@e2e.invalid'); watch(mia);
  await mia.goto(`${origin}/admin`);
  await mia.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  assert.equal(await mia.getByRole('heading', { name: 'Financial control', exact: true }).count(), 0, 'no money panel without money access');
  assert.equal(await mia.locator('[data-metric="in"]').count(), 0);
  assert.doesNotMatch(await mia.content(), /12,500|£12,500/, 'quotation values never reach a manager without money access');
  for (const path of ['/admin/finance', '/admin/quotes']) { await mia.goto(`${origin}${path}`); await mia.waitForURL(/\/admin\?error=permission/); }
  const notifications = await mia.goto(`${origin}/admin/notifications`); assert.equal(notifications.status(), 404, 'only the owner manages notifications');
  if (screenshots) await mia.screenshot({ path: join(screenshots, 'command-centre-manager-390.png'), fullPage: true });
  const inbox = await sid.goto(`${origin}/admin/inbox`); assert.equal(inbox.status(), 404, 'a supervisor has no office inbox');
  const finance = await sid.goto(`${origin}/admin/finance`); assert.notEqual(finance.url().includes('/admin/finance'), true, 'a supervisor cannot open finance');
  pass('Command centre 9: a manager without money access sees no money; only the owner manages notifications; a supervisor has no office pages');

  assert.deepEqual(errors.filter(error => !/status of 404/.test(error)), [], 'no browser console errors other than the deliberate refusals');
  await Promise.all([siteContext.close(), officeContext.close(), managerContext.close()]);
}
