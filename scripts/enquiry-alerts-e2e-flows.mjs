// Email alerts for website enquiries, end to end: the real contact form, the real API routes (including the
// work Next.js runs after the response), PostgREST and the migrated database, with email delivered to a local
// stand-in for the email service so nothing leaves this machine. Covers a successful submission, a duplicate
// confirmation, an email failure that the visitor never sees, the scheduled retry and the office's resend.
import assert from 'node:assert/strict';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runEnquiryAlerts({ browser, origin, sql, signIn, pass, emails, emailFaults, cronSecret, enquiryKey }) {
  const alerts = () => emails.filter(email => Array.isArray(email.to) && email.to[0] === 'info@tilespec.uk');
  const until = async (description, check, ms = 20000) => {
    for (const deadline = Date.now() + ms; ;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
      await wait(250);
    }
  };
  const status = reference => sql(`select n.status||':'||n.attempts from public.enquiry_notifications n join public.tender_enquiries e on e.id=n.enquiry_id where e.reference='${reference}'`);
  const post = (path, body) => fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const enquire = async (fields) => {
    const reserved = await post('/api/enquiries', { kind: 'general', files: [], ...fields });
    assert.equal(reserved.status, 200, 'the enquiry is reserved');
    return reserved.json();
  };

  // ---- 1. A visitor sends a tender through the real form; the office is emailed once ----------------------
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await visitor.newPage();
  await page.goto(`${origin}/contact`);
  await page.getByLabel('Your name *').fill('Ada Buyer');
  await page.getByLabel('Company').fill('Example Build & Co');
  await page.getByLabel('Email address *').fill('ada.buyer@e2e.invalid');
  await page.getByLabel('Project name / location').fill('School refurbishment, Leeds');
  await page.getByLabel('Any details we should know?').fill('Please price <b>all</b> wet areas.');
  await page.getByRole('button', { name: /SUBMIT TENDER ENQUIRY/ }).click();
  await page.getByText('ENQUIRY RECEIVED.').waitFor();
  const reference = (await page.locator('.contact-success strong').innerText()).trim();
  assert.match(reference, /^TS-[0-9A-F]{8}$/);
  const [alert] = await until('the enquiry alert', () => alerts().length === 1 && alerts());
  assert.equal(alert.reply_to, 'ada.buyer@e2e.invalid', 'replying answers the customer');
  assert.ok(alert.subject.includes(reference) && alert.subject.includes('Example Build & Co') && alert.subject.includes('School refurbishment, Leeds'));
  for (const part of [alert.html, alert.text]) {
    assert.ok(part.includes(`https://tilespec.example/admin/tenders?ref=${reference}`), 'the email links to the signed-in tender inbox');
    assert.ok(part.includes('ada.buyer@e2e.invalid') && part.includes('School refurbishment, Leeds'));
    assert.doesNotMatch(part, /storage\/v1|token|tilespec-tenders\//, 'the email carries no private link, path or token');
  }
  assert.ok(alert.html.includes('Example Build &amp; Co') && alert.html.includes('&lt;b&gt;all&lt;/b&gt;'), 'what the visitor typed is escaped');
  await until('the alert to be recorded as sent', () => status(reference) === 'sent:1');
  assert.equal(alert.idempotencyKey, sql(`select n.id from public.enquiry_notifications n join public.tender_enquiries e on e.id=n.enquiry_id where e.reference='${reference}'`),
    'the alert id is the email service idempotency key');
  await visitor.close();
  pass(`Enquiry alerts 1: a tender from the contact form (${reference}) is emailed once to info@tilespec.uk with the customer, project, reference and a sign-in link`);

  // ---- 2. A duplicate confirmation sends nothing more ---------------------------------------------------
  const second = await enquire({ name: 'Ben Client', email: 'ben.client@e2e.invalid', company: '', project: 'Café floor' });
  const confirmations = await Promise.all([post('/api/enquiries/complete', { id: second.id, token: second.token }), post('/api/enquiries/complete', { id: second.id, token: second.token })]);
  assert.deepEqual(confirmations.map(r => r.status), [200, 200], 'both confirmations are answered as received');
  await until('the second alert', () => status(second.reference) === 'sent:1');
  await wait(1500);
  assert.equal(alerts().filter(email => email.subject.includes(second.reference)).length, 1, 'two confirmations of one enquiry send one email');
  const again = await post('/api/enquiries/complete', { id: second.id, token: second.token });
  assert.equal(again.status, 200);
  await wait(1500);
  assert.equal(alerts().filter(email => email.subject.includes(second.reference)).length, 1, 'a later retry of the confirmation sends nothing more');
  pass('Enquiry alerts 2: duplicate and repeated confirmations are answered as received and send exactly one email');

  // ---- 3. The email service fails: the visitor still sees success, and the failure is logged ------------
  emailFaults.push(503, 503);
  const third = await enquire({ name: 'Cal Client', email: 'cal.client@e2e.invalid', company: 'Cal Ltd', project: 'Gym changing rooms' });
  const confirmed = await post('/api/enquiries/complete', { id: third.id, token: third.token });
  assert.equal(confirmed.status, 200, 'an email failure never reaches the visitor');
  assert.deepEqual(await confirmed.json(), { ok: true });
  await until('the failure to be logged', () => status(third.reference) === 'pending:1');
  assert.match(sql(`select n.last_error from public.enquiry_notifications n join public.tender_enquiries e on e.id=n.enquiry_id where e.reference='${third.reference}'`), /503/);
  assert.equal(sql(`select status from public.tender_enquiries where reference='${third.reference}'`), 'received', 'the enquiry is kept');
  assert.equal(alerts().filter(email => email.subject.includes(third.reference)).length, 0);

  // ---- 4. The scheduled retry sends it once it is due ------------------------------------------------------
  // The owner creates the retry key in the tender inbox and adds it to the hosting settings; this server was
  // started with ENQUIRY_NOTIFICATIONS_KEY, so its fingerprint is registered here.
  sql(`update public.enquiry_notification_settings set retry_key_hash=encode(sha256(convert_to('${enquiryKey}','UTF8')),'hex'),retry_key_set_at=now() where singleton`);
  const refused = await fetch(`${origin}/api/cron/enquiry-notifications`);
  assert.equal(refused.status, 401, 'the schedule refuses a request without the schedule secret');
  const notDue = await (await fetch(`${origin}/api/cron/enquiry-notifications`, { headers: { authorization: `Bearer ${cronSecret}` } })).json();
  assert.deepEqual(notDue, { status: 'ok', sent: 0, failed: 0 }, 'the alert waits for its retry time');
  sql(`update public.enquiry_notifications set next_attempt_at=now()-interval '1 second' where enquiry_id='${third.id}'`);
  const retried = await (await fetch(`${origin}/api/cron/enquiry-notifications`, { headers: { authorization: `Bearer ${cronSecret}` } })).json();
  assert.deepEqual(retried, { status: 'ok', sent: 1, failed: 0 });
  assert.equal(status(third.reference), 'sent:2');
  assert.equal(alerts().filter(email => email.subject.includes(third.reference)).length, 1);
  pass('Enquiry alerts 3: an email failure is invisible to the visitor, logged, and sent once by the scheduled retry');

  // ---- 5. The office sees each alert and can send a waiting one itself --------------------------------------
  emailFaults.push(422);
  const fourth = await enquire({ name: 'Dee Client', email: 'dee.client@e2e.invalid', company: 'Dee Ltd', project: 'Lobby' });
  assert.equal((await post('/api/enquiries/complete', { id: fourth.id, token: fourth.token })).status, 200);
  await until('the refused alert to be logged', () => status(fourth.reference) === 'pending:1');
  const office = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cara = await signIn(office, origin, 'cara.owner@e2e.invalid');
  await cara.goto(`${origin}/admin/tenders?ref=${reference}`);
  await cara.getByText(`Email alert sent to info@tilespec.uk`).waitFor();
  await cara.locator('summary', { hasText: 'Email alerts for new enquiries' }).click();
  await cara.getByText('Email service configured', { exact: false }).first().waitFor();
  assert.equal(await cara.locator('[data-ready="yes"]').count(), 4, 'the owner sees the email service and the retry schedule ready');
  assert.doesNotMatch(await cara.content(), /e2e-email-key|e2e0enquiry0key/, 'no key is ever shown on the page');
  await cara.goto(`${origin}/admin/tenders?ref=${fourth.reference}`);
  await cara.getByText('Email alert not sent yet', { exact: false }).waitFor();
  await cara.getByText('Send the email alert now').click();
  await cara.getByRole('button', { name: 'Send to info@tilespec.uk' }).click();
  await cara.getByText('Alert sent.').waitFor();
  assert.equal(status(fourth.reference), 'sent:2');
  assert.equal(alerts().filter(email => email.subject.includes(fourth.reference)).length, 1);
  assert.equal(sql(`select string_agg(a.via||':'||a.result,',' order by a.id) from public.enquiry_notification_attempts a join public.enquiry_notifications n on n.id=a.notification_id
    join public.tender_enquiries e on e.id=n.enquiry_id where e.reference='${fourth.reference}'`), 'submission:failed,office:sent', 'every attempt is logged');
  await cara.reload();
  await cara.getByText('Email alert sent to info@tilespec.uk').waitFor();
  assert.equal(await cara.getByText('Send the email alert now').count(), 0, 'a sent alert cannot be sent again');
  await office.close();

  const site = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sid = await signIn(site, origin, 'sid.supervisor@e2e.invalid');
  await sid.goto(`${origin}/admin/tenders?ref=${reference}`);
  assert.equal(await sid.getByText('Email alert').count(), 0, 'a supervisor sees no enquiry or alert');
  await site.close();
  assert.equal(sql(`select count(*) from public.enquiry_notifications where status<>'sent'`), '0');
  pass('Enquiry alerts 4: the owner sees each alert in the tender inbox and sends a refused one once; a supervisor sees nothing');
}
