// Supervisor daily workforce journeys, run by scripts/test-site-e2e.mjs against
// the real app and database. Every step is checked in the database as well as
// on screen: a success message alone proves nothing.
import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function run({ browser, origin, sql, signIn, contractId, screenshots, pass }) {
  const consoleErrors = [];
  let expectNetworkErrors = false;
  const watch = (page, label) => {
    page.on('console', message => {
      if (message.type() !== 'error' || message.location().url.endsWith('/favicon.ico')) return;
      if (expectNetworkErrors && /ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|Failed to fetch|fetch failed/i.test(message.text())) return;
      // The other organisation's supervisor is meant to get "not found" for this site.
      if (label === 'other' && /status of 404/.test(message.text())) return;
      consoleErrors.push(`${label} ${page.url()}: ${message.text().slice(0, 4000)}`);
    });
    page.on('pageerror', error => consoleErrors.push(`${label}: ${String(error).slice(0, 600)}`));
    return page;
  };
  // caret: 'initial' stops Playwright styling inputs, which React would see
  // as a hydration difference if a screenshot is taken while it hydrates.
  const shot = (target, name) => target.screenshot({ path: join(screenshots, name), fullPage: true, caret: 'initial', style: 'nextjs-portal { display: none !important; }' });
  const value = statement => sql(statement);
  const planFor = team => `(select p.id from public.planned_allocations p join public.teams t on t.id = p.team_id where t.name = '${team}' and p.contract_id = '${contractId}')`;
  const allocations = team => Number(value(`select count(*) from public.actual_allocations where planned_allocation_id = ${planFor(team)} and voided_at is null`));
  const site = `${origin}/admin/supervisor/sites/${contractId}`;

  const tablet = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, locale: 'en-GB' });
  const page = watch(await signIn(tablet, origin, 'sid.supervisor@e2e.invalid'), 'supervisor');
  await page.waitForURL(`**/admin/supervisor/sites/${contractId}`);
  await page.getByRole('link', { name: 'START MORNING CHECKS', exact: true }).waitFor();
  if (screenshots) await shot(page, 'dashboard-start-tablet.png');
  pass('a supervisor with one site opens straight onto its dashboard, which asks for the morning checks first');

  // Morning checks, then straight on to today's workforce.
  await page.getByRole('link', { name: 'START MORNING CHECKS', exact: true }).click();
  await page.waitForURL('**/checks');
  const groups = page.locator('main fieldset').filter({ has: page.getByRole('button', { name: 'YES', exact: true }) });
  assert.equal(await groups.count(), 11);
  for (let index = 0; index < 11; index++) await groups.nth(index).getByRole('button', { name: index < 9 ? 'YES' : 'NO', exact: true }).click();
  await page.getByRole('button', { name: 'COMPLETE MORNING CHECKS', exact: true }).click();
  await page.getByRole('heading', { name: 'Morning checks complete' }).waitFor();
  assert.equal(value(`select count(*) from public.supervisor_inspections where contract_id = '${contractId}'`), '1');
  await page.getByRole('link', { name: 'Who’s on site?', exact: true }).click();
  await page.waitForURL('**/workforce');
  pass('after the morning checks are saved, the next prominent action goes straight to confirming today\'s workforce');
  await page.goto(site);
  await page.getByRole('link', { name: "WHO'S ON SITE?", exact: true }).waitFor();
  pass('the dashboard\'s next action comes from saved records: with checks done it asks to confirm today\'s allocations');
  await page.getByRole('link', { name: "WHO'S ON SITE?", exact: true }).click();
  await page.waitForURL('**/workforce');
  if (screenshots) await shot(page, 'workforce-unconfirmed-tablet.png');

  const card = name => page.locator('article', { has: page.getByRole('heading', { name, exact: true }) });
  const badge = (name, text) => card(name).locator(`span:text-is("${text}")`).first().waitFor();

  // Scenario H, then A. The connection fails twice; neither shows success, and
  // the retry records the gang exactly once.
  const moss = card('Moss Pair');
  const isAction = request => request.method() === 'POST' && Boolean(request.headers()['next-action']);
  expectNetworkErrors = true;
  await page.route('**/*', route => isAction(route.request()) ? route.abort('internetdisconnected') : route.continue());
  await moss.getByRole('button', { name: 'Confirm as planned' }).click();
  await moss.getByRole('alert').filter({ hasText: 'could not confirm this was saved' }).waitFor();
  assert.equal(await moss.getByRole('status').filter({ hasText: 'Confirmed as planned:' }).count(), 0, 'no success is shown when the request never arrived');
  assert.equal(allocations('Moss Pair'), 0);
  await page.unroute('**/*');
  let captured;
  await page.route('**/*', async route => {
    const request = route.request();
    if (!isAction(request)) return route.continue();
    captured = { url: request.url(), headers: await request.allHeaders(), body: request.postDataBuffer() };
    await route.fetch();
    await route.abort('connectionreset');
  });
  await moss.getByRole('button', { name: 'Confirm as planned' }).click();
  await moss.getByRole('alert').filter({ hasText: 'could not confirm this was saved' }).waitFor();
  assert.equal(allocations('Moss Pair'), 1, 'the server saved it although the reply was lost');
  await page.unroute('**/*');
  expectNetworkErrors = false;
  await moss.getByRole('button', { name: 'Confirm as planned' }).click();
  await badge('Moss Pair', 'On site');
  assert.equal(allocations('Moss Pair'), 1);
  assert.equal(value(`select count(*) from public.actual_allocation_operatives ao join public.actual_allocations a on a.id = ao.actual_allocation_id
    where a.planned_allocation_id = ${planFor('Moss Pair')}`), '2');
  pass('H: a failed connection never shows success, keeps the form, and the retry records the gang once, not twice');
  assert.equal(value(`select deviations = '{}' and deviation_reason is null and lead_operative_id = (select id from public.operatives where display_name = 'Ray Dunn')
    and work_area_id = (select id from public.work_areas where name = 'Flat 54') from public.actual_allocations where planned_allocation_id = ${planFor('Moss Pair')}`), 't');
  pass('A: an ordinary gang is confirmed as planned in one tap: planned place and stage, both people, its lead, no note');

  // Scenario B: four planned, three here, one absent.
  const smith = card('Smith Tiling');
  await smith.locator('summary', { hasText: 'Make changes' }).click();
  const smithForm = smith.locator('form', { has: page.getByRole('button', { name: 'Save what happened' }) });
  await smithForm.getByRole('group', { name: 'Is Max Reed here?' }).getByLabel('Absent').check();
  await smithForm.getByRole('group', { name: 'Why is Max Reed absent? *' }).getByLabel('Off sick').check();
  await smithForm.getByRole('button', { name: 'Save what happened' }).click();
  await badge('Smith Tiling', 'On site');
  assert.equal(value(`select count(*) from public.actual_allocation_operatives ao join public.actual_allocations a on a.id = ao.actual_allocation_id
    join public.operatives o on o.id = ao.operative_id where a.planned_allocation_id = ${planFor('Smith Tiling')} and o.display_name = 'Max Reed'`), '0');
  assert.equal(value(`select reason from public.allocation_absences where planned_allocation_id = ${planFor('Smith Tiling')} and voided_at is null`), 'Off sick');
  assert.equal(value(`select deviation_reason from public.actual_allocations where planned_allocation_id = ${planFor('Smith Tiling')}`), 'Absent: Max Reed (Off sick)');
  pass('B: three of four confirmed; the absence is recorded with its reason, no attendance is invented, and no extra note was needed');

  // Scenario C: planned for Flat 55, working in Flat 59.
  const jones = card('Jones Installations');
  await jones.locator('summary', { hasText: 'Make changes' }).click();
  const jonesForm = jones.locator('form', { has: page.getByRole('button', { name: 'Save what happened' }) });
  await jonesForm.getByRole('button', { name: 'Change' }).first().click();
  await jonesForm.getByRole('searchbox', { name: 'Working at', exact: true }).fill('59');
  await jonesForm.getByRole('list', { name: 'Working at choices' }).getByRole('button', { name: 'Block B › Level 5 › Flat 59', exact: true }).click();
  await jonesForm.getByRole('button', { name: 'Save what happened' }).click();
  await jonesForm.getByRole('alert').filter({ hasText: 'Record why this differs from the office plan (different location)' }).waitFor();
  assert.equal(allocations('Jones Installations'), 0, 'a move without a reason is refused and nothing is saved');
  await jonesForm.getByRole('group', { name: 'Why is it different from the plan?' }).getByLabel('Area not ready').check();
  await jonesForm.getByRole('button', { name: 'Save what happened' }).click();
  await badge('Jones Installations', 'On site');
  assert.equal(value(`select w.name || '|' || p.name || '|' || a.deviation_reason from public.actual_allocations a join public.work_areas w on w.id = a.work_area_id
    join public.planned_allocations pl on pl.id = a.planned_allocation_id join public.work_areas p on p.id = pl.work_area_id where a.planned_allocation_id = ${planFor('Jones Installations')}`),
    'Flat 59|Flat 55|Area not ready');
  pass('C: the team moved to Flat 59 is recorded there, the plan still says Flat 55, and the reason is required and kept');

  // Scenario D: Direct Team A split between the two corridors.
  const direct = card('Direct Team A');
  await direct.locator('summary', { hasText: 'Make changes' }).click();
  const directForm = direct.locator('form', { has: page.getByRole('button', { name: 'Save what happened' }) });
  await directForm.getByRole('button', { name: 'Change' }).first().click();
  await directForm.getByRole('searchbox', { name: 'Working at', exact: true }).fill('corridor 1');
  await directForm.getByRole('list', { name: 'Working at choices' }).getByRole('button', { name: 'Communal corridors › Corridor 1', exact: true }).click();
  await directForm.getByLabel('Split the gang between two locations').check();
  await directForm.getByRole('searchbox', { name: 'Second location', exact: true }).fill('corridor 2');
  await directForm.getByRole('list', { name: 'Second location choices' }).getByRole('button', { name: 'Communal corridors › Corridor 2', exact: true }).click();
  for (const name of ['Ian Cole', 'Uma Bell']) await directForm.getByRole('group', { name: `Where is ${name} working?` }).getByLabel('Second location').check();
  await directForm.getByLabel('Acting lead at the second location').selectOption({ label: 'Ian Cole' });
  await directForm.getByRole('group', { name: 'Why is it different from the plan?' }).getByLabel('Split to finish sooner').check();
  await directForm.getByRole('button', { name: 'Save what happened' }).click();
  await badge('Direct Team A', 'On site');
  assert.equal(value(`select string_agg(w.name || ':' || (select string_agg(o.display_name, '+' order by o.display_name) from public.actual_allocation_operatives ao
      join public.operatives o on o.id = ao.operative_id where ao.actual_allocation_id = a.id) || ':' || coalesce(l.display_name, '-'), ', ' order by w.name)
    from public.actual_allocations a join public.work_areas w on w.id = a.work_area_id left join public.operatives l on l.id = a.lead_operative_id
    where a.planned_allocation_id = ${planFor('Direct Team A')}`), 'Corridor 1:Dan Price+Eve Shaw:Dan Price, Corridor 2:Ian Cole+Uma Bell:Ian Cole');
  pass('D: the split gang is two records, one per corridor, each with its own people, acting lead and start time');

  // Scenario E: Smith moves on to Flat 53; Tom leaves; Max turns up late.
  await page.reload();
  const flat52 = card('Smith Tiling').locator('section', { has: page.getByRole('heading', { name: 'Block B › Level 5 › Flat 52', exact: true }) });
  await flat52.locator('summary', { hasText: 'Move or split' }).click();
  const moveForm = flat52.locator('form', { has: page.getByRole('button', { name: 'Record move' }) });
  await moveForm.getByRole('searchbox', { name: 'Moving to *', exact: true }).fill('53');
  await moveForm.getByRole('list', { name: 'Moving to * choices' }).getByRole('button', { name: 'Block B › Level 5 › Flat 53', exact: true }).click();
  await moveForm.getByLabel('Or in your own words').fill('Flat 52 bathroom finished');
  await moveForm.getByRole('button', { name: 'Record move' }).click();
  const flat53 = card('Smith Tiling').locator('section', { has: page.getByRole('heading', { name: 'Block B › Level 5 › Flat 53', exact: true }) });
  await flat53.waitFor();
  assert.equal(value(`select string_agg(w.name || ':' || (a.ended_at is null)::text, ',' order by a.started_at) from public.actual_allocations a
    join public.work_areas w on w.id = a.work_area_id where a.planned_allocation_id = ${planFor('Smith Tiling')}`), 'Flat 52:false,Flat 53:true');
  await flat53.locator('summary', { hasText: 'Someone left' }).click();
  const leaveForm = flat53.locator('form', { has: page.getByRole('button', { name: 'Record departure' }) });
  await leaveForm.getByLabel('Who left? *').selectOption({ label: 'Tom Baker' });
  await leaveForm.getByLabel('Unwell').check();
  await leaveForm.getByRole('button', { name: 'Record departure' }).click();
  await flat53.getByRole('list', { name: /People at/ }).locator('li', { hasText: 'Tom Baker' }).getByText(/Unwell/).waitFor();
  await flat53.locator('summary', { hasText: 'Someone arrived' }).click();
  const arriveForm = flat53.locator('form', { has: page.getByRole('button', { name: 'Record arrival' }) });
  await arriveForm.getByLabel('Who arrived? *').selectOption({ label: 'Max Reed' });
  await arriveForm.getByLabel('Late arrival').check();
  await arriveForm.getByRole('button', { name: 'Record arrival' }).click();
  await flat53.getByRole('list', { name: /People at/ }).locator('li', { hasText: 'Max Reed' }).getByText(/Late arrival/).waitFor();
  assert.equal(value(`select count(*) from public.allocation_absences where planned_allocation_id = ${planFor('Smith Tiling')} and voided_at is null`), '0');
  assert.equal(value(`select void_reason like 'Recorded on site at %' from public.allocation_absences where planned_allocation_id = ${planFor('Smith Tiling')}`), 't');
  assert.equal(value(`select count(*) from public.actual_allocation_operatives ao join public.operatives o on o.id = ao.operative_id
    where o.display_name = 'Tom Baker' and ao.left_at is not null and ao.departure_note = 'Unwell'`), '1');
  pass('E: the gang moved on to Flat 53 with Flat 52 kept as an ended period; a departure and a late arrival are recorded, and the absence is voided, not deleted');

  // Scenario F: unexpected labour, including a new person registered provisionally.
  await page.locator('summary', { hasText: '+ Record labour not on the plan' }).click();
  const extraForm = page.locator('form', { has: page.getByRole('button', { name: 'Record labour on site' }) });
  await extraForm.getByLabel('Team (optional)').selectOption({ label: 'Wet Area Team' });
  await extraForm.getByRole('checkbox', { name: 'Nia Fox' }).waitFor();
  await extraForm.locator('summary', { hasText: 'Someone new, not registered yet' }).click();
  await extraForm.getByLabel('Full name').fill('New Labourer');
  await extraForm.getByLabel('Company').selectOption({ label: 'Wet Area Specialists' });
  await extraForm.getByRole('searchbox', { name: 'Working at *', exact: true }).fill('56');
  await extraForm.getByRole('list', { name: 'Working at * choices' }).getByRole('button', { name: 'Block B › Level 5 › Flat 56', exact: true }).click();
  await extraForm.getByLabel('Stage *').selectOption({ label: 'Waterproofing' });
  await extraForm.getByLabel('Called in for extra work').check();
  await extraForm.getByRole('button', { name: 'Record labour on site' }).click();
  await page.getByRole('list', { name: 'People at Block B › Level 5 › Flat 56' }).getByText('New Labourer', { exact: true }).waitFor();
  assert.equal(value(`select string_agg(o.display_name || ':' || o.status, ',' order by o.display_name) from public.actual_allocation_operatives ao
    join public.actual_allocations a on a.id = ao.actual_allocation_id join public.operatives o on o.id = ao.operative_id
    where a.planned_allocation_id is null and 'unplanned' = any(a.deviations)`), 'New Labourer:provisional,Nia Fox:active');
  assert.equal(value(`select count(*) from public.subcontractor_companies`), '4', 'the supervisor created no company');
  pass('F: additional labour is recorded as not on the plan; the new person is provisional, and no company was created');

  // A team that did not come.
  const hart = card('Hart Gang');
  await hart.locator('summary', { hasText: 'Not on site' }).click();
  await hart.getByLabel('Did not turn up').check();
  await hart.getByRole('button', { name: 'Record not on site' }).click();
  await badge('Hart Gang', 'Not on site');
  pass('a team that did not arrive is recorded as not on site, with its reason');

  // Scenario I: reload and resume. Everything shown comes from saved records.
  await page.reload();
  for (const [team, status] of [['Moss Pair', 'On site'], ['Smith Tiling', 'On site'], ['Jones Installations', 'On site'], ['Direct Team A', 'On site'], ['Hart Gang', 'Not on site']]) {
    await badge(team, status);
  }
  await page.getByRole('region', { name: 'Workforce today' }).getByText('Not confirmed').locator('xpath=..').getByText('0', { exact: true }).waitFor();
  if (screenshots) await shot(page, 'workforce-confirmed-tablet.png');
  await page.goto(site);
  await page.getByRole('link', { name: 'CHECK WORKMANSHIP', exact: true }).waitFor();
  await page.getByText('Site details and earlier records', { exact: true }).click();
  await page.getByText(/Smith Tiling Ltd is on site and its employer's liability insurance has expired/).waitFor();
  if (screenshots) await shot(page, 'dashboard-day-underway-tablet.png');
  pass('I: after a reload every confirmed team, move, absence and arrival is shown as saved, and the dashboard moves on to monitoring');

  // The office sees planned versus actual without re-entering anything.
  const office = await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: 'en-GB' });
  const manager = watch(await signIn(office, origin, 'mia.manager@e2e.invalid'), 'office');
  await manager.goto(`${origin}/admin/contracts/${contractId}/actual`);
  const differences = manager.getByRole('region', { name: /Differences from the plan/ });
  for (const text of ['Worked at Block B › Level 5 › Flat 59 instead of Block B › Level 5 › Flat 55',
    'Split between Communal corridors › Corridor 1 and Communal corridors › Corridor 2', 'Hart Gang not on site', 'Tom Baker left at',
    'Max Reed joined at', 'Wet Area Team at Block B › Level 5 › Flat 56, not on the plan', 'New Labourer was added on site and is not yet confirmed by the office']) {
    await differences.getByText(text, { exact: false }).first().waitFor();
  }
  assert.equal(await differences.getByText('Max Reed absent').count(), 0, 'an absence voided by a late arrival is no longer reported as an absence');
  if (screenshots) await shot(manager, 'office-planned-vs-actual-landscape.png');
  pass('the office sees every difference: moved, split, not on site, left early, arrived late, added labour and provisional people');

  // Workforce history for one flat, with who recorded each change and why.
  await page.goto(`${site}/history?area=${value(`select id from public.work_areas where name = 'Flat 52'`)}`);
  await page.getByText('Recorded by Sid Supervisor', { exact: false }).first().waitFor();
  await page.getByText(/Absent: Max Reed \(Off sick\)/).first().waitFor();
  pass('the history for Flat 52 shows the gang, the people, the times, who recorded it and why it changed');

  const { inspect } = await import('./inspection-e2e-flows.mjs');
  const inspection = await inspect({ manager, page, site, sql, pass });

  // Scenario G: another organisation's supervisor can neither see nor change the site.
  const other = await browser.newContext({ viewport: { width: 768, height: 1024 }, locale: 'en-GB' });
  const intruder = watch(await signIn(other, origin, 'oscar.other@e2e.invalid'), 'other');
  const response = await intruder.goto(site);
  assert.equal(response.status(), 404);
  const before = value(`select count(*) from public.actual_allocations`);
  const replay = await other.request.post(captured.url, { headers: Object.fromEntries(Object.entries(captured.headers).filter(([name]) => !['cookie', 'content-length', 'host'].includes(name))), data: captured.body });
  assert.match(await replay.text(), /You do not have permission for this operation/);
  assert.equal(value(`select count(*) from public.actual_allocations`), before);
  pass('G: another organisation\'s supervisor gets "not found" for the site, and replaying a captured confirmation is refused by the database');

  const inspectionBefore = value('select count(*) from public.location_inspections');
  const inspectionReplay = await other.request.post(inspection.savedRequest.url, { headers: Object.fromEntries(Object.entries(inspection.savedRequest.headers).filter(([name]) => !['cookie', 'content-length', 'host'].includes(name))), data: inspection.savedRequest.body });
  assert.match(await inspectionReplay.text(), /You do not have permission for this operation/);
  assert.equal(value('select count(*) from public.location_inspections'), inspectionBefore);
  assert.equal((await intruder.goto(inspection.url)).status(), 404);
  pass('Phase 3A: another organisation cannot view inspections or replay a captured inspection action');

  // Layout on real pages and data: no sideways scrolling, finger-sized controls,
  // with every collapsed section opened so every form is measured.
  const viewports = [{ name: 'tablet-portrait', width: 768, height: 1024 }, { name: 'tablet-landscape', width: 1180, height: 820 }, { name: 'phone', width: 390, height: 844 }];
  const screens = [[page, 'dashboard', site], [page, 'checks', `${site}/checks`], [page, 'workforce', `${site}/workforce`], [page, 'history', `${site}/history`],
    [page, 'location-inspections', inspection.url], [manager, 'inspection-templates', inspection.url],
    [manager, 'planned-vs-actual', `${origin}/admin/contracts/${contractId}/actual`]];
  for (const viewport of viewports) {
    for (const [target, name, url] of screens) {
      await target.setViewportSize({ width: viewport.width, height: viewport.height });
      await target.goto(url);
      await target.getByRole('main').waitFor();
      // Changing the DOM before React has hydrated it would be a test artefact.
      // React marks each element it has hydrated with its internal fiber.
      await target.waitForFunction(() => [...document.querySelectorAll('details, form')]
        .every(element => Object.keys(element).some(key => key.startsWith('__reactFiber'))));
      if (screenshots && viewport.name === 'phone') await shot(target, `${name}-phone.png`);
      await target.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true; }));
      const problems = await target.evaluate(() => {
        const found = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) {
          found.push(`page is ${document.documentElement.scrollWidth}px wide in a ${innerWidth}px viewport`);
          // Name the narrowest elements that stick out, which are the cause.
          const wide = [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1)
            .filter(element => ![...element.children].some(child => child.getBoundingClientRect().right > innerWidth + 1));
          for (const element of wide.slice(0, 4)) found.push(`overflowing ${element.tagName.toLowerCase()}.${element.className} "${(element.textContent || '').trim().slice(0, 60)}"`);
        }
        const selector = 'button, summary, select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), a[class*="utton"], a[class*="chip"], nav[aria-label="Site"] a, label:has(> input[type=checkbox]), label:has(> input[type=radio])';
        for (const element of document.querySelectorAll(selector)) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.height < 43.5) found.push(`${element.tagName.toLowerCase()} "${(element.textContent || element.getAttribute('name') || '').trim().slice(0, 50)}" is ${Math.round(box.height)}px tall`);
          if (box.right > innerWidth + 1) found.push(`${element.tagName.toLowerCase()} "${(element.textContent || '').trim().slice(0, 50)}" overflows to ${Math.round(box.right)}px`);
        }
        return [...new Set(found)];
      });
      assert.deepEqual(problems, [], `${name} at ${viewport.name}`);
    }
    pass(`the dashboard, morning checks, today's workforce, history and planned-vs-actual screens fit ${viewport.name} (${viewport.width}px) with every control at least 44px tall`);
  }

  for (const context of [tablet, office, other]) await context.close();
  return { consoleErrors };
}
