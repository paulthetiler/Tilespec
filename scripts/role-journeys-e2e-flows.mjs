// Every role's real journey through the one role-aware navigation, against the migrated database with the
// default settings (no feature flags): what owners, office staff, supervisors and gangs actually get.
//
//   1. Navigation: each role lands on its own Today, has its own tabs, and every link on its tabs, its menu
//      and its Today opens a working page that is meant for that role, on a phone, without sideways scrolling.
//   2. The supervisor's day: Today → morning checks → next step → people → progress → handover, each step
//      leading to the next and marked done from what was saved.
//   3. A safety stop raised on site is the first thing the owner sees, and work with others is never shown
//      as the owner's own task.
//   4. Money stays with people who have money access.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const PHONE = { width: 390, height: 844 };
// Routes that download a file or need a specific record are checked by their own suites.
const SKIP = /\/pdf$|\/route$|\/documents\/[0-9a-f-]{36}$|\/files\/|\/photos\/|\/preview$|\/accounts\/documents\//;
const UNHEALTHY = /Application error|Records are temporarily unavailable|This page could not be found|Something went wrong|does not have permission|Site dashboards are for supervisors|Site screens are for supervisors|This page is for gangs|for authorised office owners/i;
const londonDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() + offset * 86400000));

export async function runRoleJourneys({ browser, origin, sql, signIn, screenshots, pass, contractId, gatewayOrigin, tokenFor }) {
  const contexts = [], errors = [];
  const rpc = async (account, name, body) => {
    const response = await fetch(`${gatewayOrigin}/rest/v1/rpc/${name}`, { method: 'POST',
      headers: { authorization: `Bearer ${tokenFor(account)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json();
    assert.equal(response.status, 200, `${name}: ${JSON.stringify(value)}`);
    return value;
  };
  const open = async (email, viewport = PHONE) => {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 900, locale: 'en-GB' });
    contexts.push(context);
    const page = await signIn(context, origin, email);
    page.on('pageerror', error => errors.push(`${email}: ${String(error).slice(0, 300)}`));
    // Console errors from the app itself (not from third-party fonts the test machine may not reach).
    page.on('console', message => {
      const url = message.location().url || '';
      if (message.type() === 'error' && (!url || url.startsWith(origin)) && !url.endsWith('/favicon.ico'))
        errors.push(`${email} console on ${new URL(page.url()).pathname}: ${message.text().slice(0, 300)}`);
    });
    return page;
  };
  const shot = async (page, name) => { if (screenshots) await page.screenshot({ path: join(screenshots, name), fullPage: true }); };
  const visit = async (page, path) => {
    const response = await page.goto(`${origin}${path}`);
    await page.getByRole('main').waitFor();
    return response;
  };
  const healthy = async (page, path, who) => {
    const response = await visit(page, path);
    assert.ok(response && response.status() < 400, `${who}: ${path} answered ${response?.status()}`);
    const text = await page.locator('main').innerText();
    assert.doesNotMatch(text, UNHEALTHY, `${who}: ${path} is a working page meant for this role`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(wide, false, `${who}: ${path} has no sideways scrolling on a phone`);
  };
  const hrefs = async (page, selector) => [...new Set(await page.locator(selector).evaluateAll(nodes => nodes
    .map(node => node.getAttribute('href')).filter(href => href && href.startsWith('/admin')).map(href => href.split('#')[0])))];

  try {
    // ---- 1. Navigation for every role --------------------------------------------------------------
    const roles = [
      { email: 'cara.owner@e2e.invalid', who: 'owner', landing: '/admin', tabs: ['Today', 'Inbox', 'Jobs', 'Money', 'Menu'], menu: true, money: true },
      { email: 'mia.manager@e2e.invalid', who: 'contracts manager', landing: '/admin', tabs: ['Today', 'Inbox', 'Jobs', 'People', 'Menu'], menu: true, money: false },
      { email: 'sid.supervisor@e2e.invalid', who: 'supervisor', landing: `/admin/supervisor/sites/${contractId}`, tabs: ['Today', 'People', 'Inspect', 'Drawings'], menu: false, money: false },
      { email: 'sam.installer@e2e.invalid', who: 'installer', landing: '/admin/gang', tabs: ['Today', 'Fixes', 'Jobs'], menu: false, money: false },
    ];
    let checked = 0;
    for (const role of roles) {
      const page = await open(role.email);
      await visit(page, '/admin');
      assert.equal(new URL(page.url()).pathname, role.landing, `${role.who} lands on their own Today`);
      const main = page.getByRole('navigation', { name: 'Main', exact: true });
      const labels = (await main.locator('a, button').allInnerTexts()).map(text => text.trim());
      assert.deepEqual(labels, role.tabs, `${role.who}: the bottom bar`);
      const box = await main.boundingBox();
      assert.ok(box && box.y + box.height >= PHONE.height - 2, `${role.who}: the tabs sit at the bottom of a phone screen`);
      await shot(page, `journey-${role.who.replace(/ /g, '-')}-today-phone.png`);
      const links = new Set([...await hrefs(page, 'nav[aria-label="Main"] a'), ...await hrefs(page, 'main a')]);
      if (role.menu) {
        await main.getByRole('button', { name: 'Menu', exact: true }).click();
        const sheet = page.getByRole('dialog', { name: 'Menu and search', exact: true });
        await sheet.getByRole('searchbox').waitFor();
        const menuLinks = await hrefs(page, '[role="dialog"] nav[aria-label="Office menu"] a');
        assert.ok(menuLinks.length >= 15, `${role.who}: the complete menu opens from the Menu tab`);
        assert.equal(menuLinks.some(href => ['/admin/finance', '/admin/money', '/admin/gang-invoices', '/admin/quotes'].includes(href)), role.money,
          `${role.who}: money pages appear in the menu only with money access`);
        await shot(page, `journey-${role.who.replace(/ /g, '-')}-menu-phone.png`);
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'detached' });
        menuLinks.forEach(href => links.add(href));
      }
      // One visit per page: the same page with different filters (each location's inspections, say) is the same page.
      const pages = new Map();
      for (const href of links) { const path = href.split('?')[0]; if (!SKIP.test(path) && !pages.has(path)) pages.set(path, href); }
      for (const href of pages.values()) { await healthy(page, href, role.who); checked++; }
      pass(`Journeys 1 (${role.who}): lands on Today, has tabs ${role.tabs.join(' · ')}, and all ${pages.size} pages linked from its tabs, menu and Today work on a phone`);
    }
    pass(`Journeys 1: ${checked} page openings across four roles, none broken, refused or wider than a phone`);

    // ---- 2. The supervisor's day, step by step -----------------------------------------------------
    const site = `/admin/supervisor/sites/${contractId}`;
    const sid = await open('sid.supervisor@e2e.invalid');
    await visit(sid, site);
    const steps = sid.getByRole('navigation', { name: 'Your day on this site', exact: true });
    assert.equal(await steps.getAttribute('data-site-steps'), '0/5', 'nothing is done yet today');
    await sid.getByRole('region', { name: 'Do this next' }).or(sid.getByText('Do this next')).first().waitFor();
    await steps.locator('[data-step="checks"]').click();
    await sid.waitForURL(`**${site}/checks`);
    const groups = sid.locator('main fieldset').filter({ has: sid.getByRole('button', { name: 'YES', exact: true }) });
    const stock = sid.locator('main fieldset').filter({ has: sid.getByRole('button', { name: 'Plenty in stock', exact: true }) });
    for (let index = 0, count = await groups.count(); index < count; index++) await groups.nth(index).getByRole('button', { name: index < 6 ? 'YES' : 'NO', exact: true }).click();
    for (let index = 0, count = await stock.count(); index < count; index++) await stock.nth(index).getByRole('button', { name: 'Plenty in stock', exact: true }).click();
    await sid.getByRole('button', { name: 'COMPLETE MORNING CHECKS', exact: true }).click();
    await sid.getByRole('heading', { name: 'Morning checks complete' }).first().waitFor();
    await sid.getByRole('link', { name: 'Next step →', exact: true }).click();
    await sid.waitForURL(url => /\/(workforce|diary|inspections|finish)$/.test(url.pathname));
    const after = sid.getByRole('navigation', { name: 'Your day on this site', exact: true });
    assert.equal(await after.locator('[data-step="checks"]').getAttribute('data-done'), 'yes', 'the saved checks are marked done');
    pass(`Journeys 2a: morning checks lead straight to the next step (${new URL(sid.url()).pathname.split('/').pop()}), with the checks marked done`);

    // People: every planned gang confirmed or recorded, from the people page.
    await visit(sid, `${site}/workforce`);
    for (let guard = 0; guard < 8; guard++) {
      const confirm = sid.getByRole('button', { name: 'CONFIRM AS PLANNED', exact: true }).first();
      if (!(await confirm.count())) break;
      await confirm.click();
      await sid.waitForLoadState('networkidle');
    }
    await visit(sid, `${site}/workforce`);
    assert.equal(await sid.getByRole('navigation', { name: 'Your day on this site', exact: true }).locator('[data-step="people"]').getAttribute('data-done'), 'yes',
      'with every planned gang confirmed, People is done');
    const nextFromPeople = sid.locator('[data-next-step]');
    assert.equal(await nextFromPeople.getAttribute('data-next-step'), 'progress', 'People leads to recording the work done');
    await nextFromPeople.click();
    await sid.waitForURL(`**${site}/diary`);
    const progress = sid.locator('form').filter({ has: sid.getByRole('button', { name: 'Save progress', exact: true }) });
    await progress.getByLabel('What was done').fill('Journey: corridor 2 floor tiled');
    await progress.getByLabel('Quantity done').fill('12');
    await progress.getByRole('button', { name: 'Save progress', exact: true }).click();
    await sid.getByText('Progress saved.', { exact: false }).waitFor();
    await visit(sid, `${site}/diary`);
    const diarySteps = sid.getByRole('navigation', { name: 'Your day on this site', exact: true });
    assert.equal(await diarySteps.locator('[data-step="progress"]').getAttribute('data-done'), 'yes');
    assert.equal(await sid.locator('[data-next-step]').getAttribute('data-next-step'), 'inspect', 'progress leads to checking the work');
    pass('Journeys 2b: people → progress → inspect, each step one tap from the last, each marked done from saved records');

    // Finish the day: the handover is saved and the strip shows what is still open (the inspection).
    await visit(sid, `${site}/finish`);
    const handover = sid.locator('form').filter({ has: sid.locator('textarea[name=work_completed]') });
    for (const [name, value] of [['problems_choice', 'yes'], ['materials_choice', 'yes'], ['attention_choice', 'no']]) {
      const choice = handover.locator(`input[name=${name}][value=${value}]`);
      if (await choice.count()) await choice.check();
    }
    await handover.locator('textarea[name=work_completed]').fill('Journey: corridor 2 floor tiled.');
    const problems = handover.locator('textarea[name=outstanding_problems]');
    if (await problems.count()) await problems.fill('Journey: grout delivery is late.');
    await handover.getByRole('button', { name: 'FINISH TODAY', exact: true }).click();
    await sid.getByRole('link', { name: 'See what is left today', exact: true }).waitFor();
    assert.equal(sql(`select count(*) from public.site_handovers where contract_id='${contractId}' and work_completed like 'Journey:%'`), '1', 'the handover is saved');
    await sid.getByRole('link', { name: 'See what is left today', exact: true }).click();
    await sid.waitForURL(`**${site}/inspections`);
    await visit(sid, `${site}/finish`);
    const finishSteps = sid.getByRole('navigation', { name: 'Your day on this site', exact: true });
    assert.equal(await finishSteps.locator('[data-step="finish"]').getAttribute('data-done'), 'yes');
    assert.equal(await sid.locator('[data-next-step]').getAttribute('data-next-step'), 'inspect', 'what is still open is offered, not hidden');
    await shot(sid, 'journey-supervisor-finish-phone.png');
    pass('Journeys 2c: the handover is saved, "See what is left today" goes to the unfinished inspection, and Finish is marked done');

    // Report an issue is on every site screen and leads to the existing snag and stop forms.
    await sid.getByRole('link', { name: 'Report an issue', exact: true }).first().click();
    await sid.waitForURL(`**${site}/report`);
    for (const href of [`/admin/snags/new?contract=${contractId}`, `/admin/holds/new?contract=${contractId}&type=quality`, `/admin/holds/new?contract=${contractId}&type=safety`])
      assert.equal(await sid.locator(`main a[href="${href}"]`).count(), 1, href);
    pass('Journeys 2d: Report an issue is one tap from any site screen and offers a snag, a quality hold or a safety stop');

    // ---- 3. A safety stop on site is the first thing the owner sees ------------------------------------
    const area = sql(`select id from public.work_areas where contract_id='${contractId}' and name='Corridor 2'`);
    const stop = await rpc('sid.supervisor@e2e.invalid', 'create_work_hold', { p_request_key: randomUUID(), p_data: {
      contract_id: contractId, work_area_id: area, stage: 'installation', activity: 'Journey floor tiling', hold_type: 'safety',
      category: 'Unsafe access or platform', severity: 'critical', reason: 'Journey: scaffold tower missing a guard rail',
      required_action: 'Make the tower safe and obtain an independent release.', evidence_explanation: 'Seen on the morning walk round.' } });
    for (const viewport of [PHONE, { width: 1366, height: 900 }]) {
      const cara = await open('cara.owner@e2e.invalid', viewport);
      await visit(cara, '/admin');
      const stopped = cara.getByRole('region', { name: 'Work that is stopped', exact: true });
      await stopped.locator(`[data-hold-id="${stop}"]`).waitFor();
      const [stopTop, needsTop] = await Promise.all([stopped.boundingBox(), cara.getByRole('region', { name: 'Needs you', exact: true }).boundingBox()]);
      assert.ok(stopTop && needsTop && stopTop.y < needsTop.y, `${viewport.width}px: stopped work comes before everything else`);
      assert.match(await stopped.innerText(), /1 safety stop/);
      assert.equal(await stopped.locator(`a[href="/admin/holds/${stop}"]`).count(), 1, 'the stop opens its record');
      assert.equal(await cara.getByRole('navigation', { name: 'Office menu', exact: true }).count(), viewport.width >= 1100 ? 1 : 0, 'the sidebar menu shows on a desk only');
      // Work that is with someone else is never offered as the owner's own button.
      for (const row of await cara.locator('[data-action-state="waiting"]').all()) assert.equal(await row.locator('a', { hasText: /^Review and decide|^Choose who fixes it/ }).count(), 0);
      await shot(cara, `journey-owner-stopped-${viewport.width}.png`);
      if (viewport.width < 900) {
        const height = await cara.evaluate(() => document.documentElement.scrollHeight);
        assert.ok(height < 12000, `the owner's phone homepage stays readable (${height}px)`);
      }
    }
    pass('Journeys 3: a safety stop raised on site is the first thing on the owner\'s Today on a phone and a desk, and opens its record');

    // ---- 4. Money stays with money access --------------------------------------------------------------
    for (const [email, who] of [['mia.manager@e2e.invalid', 'contracts manager without money access'], ['sid.supervisor@e2e.invalid', 'supervisor'], ['sam.installer@e2e.invalid', 'installer']]) {
      const page = await open(email);
      // Asked for directly (as if the address were typed), so a correct refusal is not logged as a page error.
      for (const path of ['/admin/finance', '/admin/money', '/admin/gang-invoices']) {
        const response = await page.request.get(`${origin}${path}`);
        assert.ok(response.status() >= 400 || !/£(\s|&nbsp;)?\d/.test(await response.text()), `${who}: ${path} shows no money figures`);
      }
      await visit(page, '/admin');
      assert.equal(await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Money', exact: true }).count(), 0, `${who}: no Money tab`);
    }
    pass('Journeys 4: people without money access get no Money tab and no money figures, even by typing the address');

    assert.deepEqual(errors, [], 'no browser or console errors on any journey');
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
}
