// The new application against a database shaped like the hosted project before the command centre
// rollout: every migration except office reviews and the command centre itself. Proves the pull request
// can be deployed before the database update without breaking anything that works today: every page
// opens, the new ones say the update is not applied yet, and a supervisor can still message the office.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// A missing page is caught by its status: every page's payload carries the built-in not-found text.
const unhealthy = /Application error|NEXT_NOT_FOUND|Records are temporarily unavailable|Internal Server Error/;

export async function runPreMigration({ browser, origin, sql, signIn, pass, contractId }) {
  assert.equal(sql(`select (to_regclass('public.office_reviews') is null and to_regclass('public.customers') is null
    and to_regclass('public.notification_outbox') is null and to_regclass('public.tender_enquiries') is not null)::text`), 'true',
  'the database has the hosted project\'s shape before the rollout');
  const errors = [];
  const watch = page => page.on('console', message => { if (message.type() === 'error' && !/favicon|Download the React DevTools/.test(message.text())) errors.push(`${page.url()}: ${message.text()}`); });
  const healthy = async (page, path, { permission = false } = {}) => {
    const response = await page.request.get(`${origin}${path}`);
    assert.ok(response.status() < 400, `${path} answered ${response.status()}`);
    const body = await response.text();
    const found = body.match(unhealthy);
    assert.equal(found, null, `${path} opens without an error: …${found ? body.slice(Math.max(0, found.index - 160), found.index + 160) : ''}…`);
    if (!permission) assert.doesNotMatch(body, /Your account does not have permission/, `${path} is a page this person may open`);
    return body;
  };
  const linksOn = async page => [...new Set(await page.locator('main a[href^="/admin"], nav a[href^="/admin"], aside a[href^="/admin"]')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('href').split('#')[0])))].filter(href => !/logout|sign-out/.test(href));

  // ---- Owner: the command centre and every page it and the menu link to --------------------------
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const owner = await signIn(ownerContext, origin, 'grace.owner@e2e.invalid'); watch(owner);
    await owner.goto(`${origin}/admin`);
    await owner.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    assert.doesNotMatch(await owner.locator('body').innerText(), unhealthy);
    for (const panel of ['Immediate attention', 'Live jobs', 'Yesterday on site', 'Planning', 'Administration']) {
      assert.equal(await owner.getByRole('region', { name: panel, exact: false }).count() > 0, true, `${panel} shows before the update`);
    }
    const pages = new Set([...await linksOn(owner), '/admin/inbox', '/admin/search?q=E2E', '/admin/planner', '/admin/materials', '/admin/finance',
      '/admin/customers', '/admin/quotes', '/admin/tenders', '/admin/notifications', '/admin/contracts', `/admin/contracts/${contractId}`,
      `/admin/contracts/${contractId}/activity`, '/admin/subcontractors', '/admin/subcontractors/new', '/admin/gang-invoices', '/admin/workforce']);
    for (const path of pages) await healthy(owner, path);
    for (const [path, notice] of [['/admin/materials', /latest database update/], ['/admin/customers', /latest database update/],
      ['/admin/quotes', /latest database update/], ['/admin/notifications', /latest database update/]]) {
      await owner.goto(`${origin}${path}`);
      assert.match(await owner.locator('main').innerText(), notice, `${path} explains that the update is not applied`);
    }
    await owner.goto(`${origin}/admin/contracts/${contractId}`);
    assert.equal(await owner.getByRole('heading', { name: 'Stage and customer', exact: true }).count(), 0, 'the job page hides the stage panel until the update');
  } finally { await ownerContext.close(); }

  // ---- A contracts manager: every link they are shown opens ---------------------------------------
  const managerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const manager = await signIn(managerContext, origin, 'mia.manager@e2e.invalid'); watch(manager);
    await manager.goto(`${origin}/admin`);
    await manager.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    for (const path of new Set([...await linksOn(manager), '/admin/inbox', '/admin/search?q=E2E', '/admin/planner', '/admin/materials'])) await healthy(manager, path);
  } finally { await managerContext.close(); }

  // ---- Site: the diary opens and a question still reaches the office ------------------------------
  const siteContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const sid = await signIn(siteContext, origin, 'sid.supervisor@e2e.invalid'); watch(sid);
    await healthy(sid, `/admin/supervisor/sites/${contractId}`);
    await healthy(sid, `/admin/supervisor/sites/${contractId}/diary`);
    await sid.goto(`${origin}/admin/supervisor/sites/${contractId}/messages`);
    const body = `Pre-update question ${randomUUID().slice(0, 8)}`;
    const ask = sid.locator('form').filter({ has: sid.getByRole('button', { name: 'Send to the office', exact: true }) });
    await ask.getByLabel('What is it?').selectOption('decision');
    await ask.getByLabel('Your message').fill(body);
    await ask.getByLabel('Urgent: email the office now').check();
    await ask.getByRole('button', { name: 'Send to the office', exact: true }).click();
    await sid.getByText('Message sent to the office.', { exact: false }).waitFor();
    assert.equal(sql(`select count(*) from public.job_messages where body='${body}' and needs_answer and author_side='site'`), '1',
      'the question is saved once and waits for the office, as it did before the update');
  } finally { await siteContext.close(); }

  assert.deepEqual(errors, [], 'no browser console errors before the update');
  pass('Before the database update: the command centre, every linked page and the site diary open; new pages explain the update; a site question still reaches the office once');
}
