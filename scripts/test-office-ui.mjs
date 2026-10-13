// Renders the real Phase 2A office components with fixture data in a temporary
// app outside the production route tree, at tablet and phone sizes. Stub actions
// run the real server-side parsers, so each flow proves the screen submits a
// request the server accepts. No backend, credentials or public route is used.
// Set SCREENSHOT_DIR to keep full-page screenshots for review.
import { copyFile, cp, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const repository = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'tilespec-office-ui-'));
const screenshots = process.env.SCREENSHOT_DIR;
const viewports = [
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
  { name: 'phone', width: 390, height: 844 },
];
let server, browser, log = '';
const consoleErrors = [];
const watch = (page, label) => {
  page.on('console', message => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) consoleErrors.push(`${label}: ${message.text().slice(0, 12000)}`);
  });
  page.on('pageerror', error => consoleErrors.push(`${label}: ${String(error).slice(0, 400)}`));
  return page;
};
const pass = message => console.log(`PASS: ${message}`);
// Wait until React has hydrated the page before interacting or measuring, so
// the harness never changes server-rendered HTML that React is still adopting.
const visit = async (page, url) => {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]', { state: 'attached' });
};
const submitted = async scope => JSON.parse((await scope.getByRole('status').filter({ hasText: 'Submitted' }).first().textContent()).replace(/^Submitted /, ''));

try {
  for (const directory of ['components', 'lib/operations']) await cp(join(repository, directory), join(temporary, directory), { recursive: true });
  await cp(join(repository, 'tests/office-ui'), join(temporary, 'office-ui'), { recursive: true });
  await mkdir(join(temporary, 'app/admin'), { recursive: true });
  await copyFile(join(repository, 'app/admin/admin.module.css'), join(temporary, 'app/admin/admin.module.css'));
  await copyFile(join(repository, 'app/globals.css'), join(temporary, 'app/globals.css'));
  await symlink(join(repository, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ private: true }));
  await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2017', lib: ['dom', 'esnext'], jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, paths: { '@/*': ['./*'] } }, include: ['**/*.ts', '**/*.tsx'] }));
  await writeFile(join(temporary, 'next.config.mjs'), 'export default {};');
  await writeFile(join(temporary, 'app/layout.tsx'), 'import "./globals.css";\nexport default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}');
  for (const [route, component] of [['workforce', 'WorkforcePage'], ['locations', 'LocationsPage'], ['plan', 'PlanPage']]) {
    await mkdir(join(temporary, 'app', route), { recursive: true });
    await writeFile(join(temporary, 'app', route, 'page.tsx'), `import { ${component} } from "@/office-ui/pages";\nexport default function Page(){return <${component} />}`);
  }
  const portServer = net.createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  server = spawn(process.execPath, [join(repository, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: temporary, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { log = (log + bytes.toString()).slice(-8000); });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90000;
  for (const route of ['/workforce', '/locations', '/plan']) {
    while (true) {
      let response;
      try { response = await fetch(origin + route, { signal: AbortSignal.timeout(30000) }); } catch {}
      if (response?.ok) break;
      if (response?.status >= 500) throw new Error(`Office UI harness failed to compile ${route}: ${log}`);
      if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Office UI server failed: ${log}`);
      await new Promise(wait => setTimeout(wait, 300));
    }
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true });

  // Layout: no sideways scrolling and finger-sized controls, with every
  // collapsible section opened so every form is measured.
  for (const viewport of viewports) {
    const page = watch(await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.name !== 'tablet-landscape', locale: 'en-GB' }), viewport.name);
    for (const route of ['/workforce', '/locations', '/plan']) {
      await visit(page, origin + route);
      if (screenshots) await page.screenshot({ path: join(screenshots, `${route.slice(1)}-${viewport.name}.png`), fullPage: true });
      await page.evaluate(() => document.querySelectorAll('details').forEach(details => { details.open = true; }));
      const problems = await page.evaluate(() => {
        const found = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) found.push(`page is ${document.documentElement.scrollWidth}px wide in a ${innerWidth}px viewport`);
        const selector = 'button, summary, select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), a[class*="utton"], a[class*="chip"], label:has(> input[type=checkbox]), label:has(> input[type=radio])';
        for (const element of document.querySelectorAll(selector)) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.height < 43.5) found.push(`${element.tagName.toLowerCase()} "${(element.textContent || element.getAttribute('name') || '').trim().slice(0, 50)}" is ${Math.round(box.height)}px tall`);
          if (box.right > innerWidth + 1) found.push(`${element.tagName.toLowerCase()} "${(element.textContent || '').trim().slice(0, 50)}" overflows to ${Math.round(box.right)}px`);
        }
        return found;
      });
      assert.deepEqual(problems, [], `${route} at ${viewport.name}`);
    }
    await page.close();
    pass(`all three office screens fit ${viewport.name} (${viewport.width}px) with no sideways scrolling and every control at least 44px tall`);
  }

  const page = watch(await browser.newPage({ viewport: { width: 768, height: 1024 }, hasTouch: true, locale: 'en-GB' }), 'flows');

  // Planning: find a room in a few keystrokes, pick a team, name people.
  await visit(page, origin + '/plan');
  const board = page.getByRole('region', { name: 'Planned this week' });
  assert.deepEqual(await board.getByRole('heading', { level: 3 }).evaluateAll(nodes => nodes.map(node => node.childNodes[0].textContent)), ['Direct Team A', 'Jones Installations', 'Smith Tiling']);
  assert.equal(await board.locator('article').count(), 4);
  await page.getByText('Changes and cancellations this week (2)').waitFor();
  pass('the week shows each team\'s current plans once; revised and cancelled versions are kept in a separate history');
  await page.getByText('+ Add work to the plan').click();
  const addForm = page.locator('details', { has: page.getByText('+ Add work to the plan') }).locator('form');
  await addForm.getByRole('searchbox', { name: 'Where *', exact: true }).fill('502 bath');
  const options = addForm.getByRole('list', { name: 'Where * choices' }).getByRole('button');
  assert.deepEqual(await options.allTextContents(), ['Block B › Level 5 › Flat 502 › Bathroom']);
  await options.first().click();
  await addForm.getByText('Block B › Level 5 › Flat 502 › Bathroom', { exact: true }).waitFor();
  pass('typing "502 bath" finds the one room among 248 locations and selects it in one tap');
  await addForm.getByLabel('Which team *').selectOption({ label: 'Smith Tiling (Smith Tiling Ltd)' });
  const people = addForm.getByRole('group', { name: 'Who is expected (optional)' });
  assert.deepEqual((await people.locator('label').allTextContents()).map(text => text.trim()), ['Sam Smith (lead)', 'Lee Hart']);
  pass('choosing a team lists its current members only: Tom, who moved gangs yesterday, is not offered');
  await people.getByLabel('Sam Smith (lead)').check();
  await addForm.getByLabel('Work package (optional)').selectOption({ label: 'Flat 502 wall and floor tiling' });
  await addForm.getByLabel('Stage *').selectOption({ label: 'Grouting' });
  await addForm.getByLabel('Last day').fill('2026-10-16');
  if (screenshots) await addForm.screenshot({ path: join(screenshots, 'plan-form-filled-tablet-portrait.png') });
  await addForm.getByRole('button', { name: 'Add to plan' }).click();
  const planned = await submitted(addForm);
  assert.equal(planned.data.team_id, 'b0000000-0000-4000-8000-000000000001');
  assert.deepEqual(planned.data.operative_ids, ['d0000000-0000-4000-8000-000000000001']);
  assert.equal(planned.data.stage, 'grouting');
  assert.deepEqual([planned.data.planned_start, planned.data.planned_end], ['2026-10-14', '2026-10-16']);
  assert.equal(planned.data.work_package_id, '90000000-0000-4000-8000-000000000001');
  pass('a plan submits location, team, named person, package, stage and dates in the exact form the server accepts');
  const flat502 = board.locator('article', { hasText: 'Block B › Level 5 › Flat 502' });
  await flat502.locator('summary', { hasText: /^Change$/ }).click();
  const changeForm = flat502.locator('details', { has: page.locator('summary', { hasText: /^Change$/ }) }).locator('form');
  await changeForm.getByText('Block B › Level 5 › Flat 502', { exact: true }).waitFor();
  assert.equal(await changeForm.getByLabel('Sam Smith (lead)').isChecked(), true);
  assert.equal(await changeForm.getByLabel('Lee Hart').isChecked(), true);
  await changeForm.getByRole('button', { name: 'Save change' }).click();
  const change = await submitted(changeForm);
  assert.equal(change.data.supersedes_id, '70000000-0000-4000-8000-000000000001');
  pass('changing a plan opens it pre-filled and submits a new version that supersedes the old one');

  // Locations: a block of flats with rooms in one step, with a live preview.
  await visit(page, origin + '/locations');
  const builder = page.locator('section', { has: page.getByRole('heading', { name: 'Add locations' }) }).locator('form');
  await builder.getByRole('button', { name: 'Change' }).click();
  await builder.getByRole('searchbox', { name: 'Add inside', exact: true }).fill('level 5');
  await builder.getByRole('button', { name: 'Block B › Level 5', exact: true }).click();
  await builder.getByLabel('What are they called?').fill('Flat');
  await builder.getByLabel('First number').fill('58');
  await builder.getByLabel('Last number').fill('51');
  await builder.getByRole('status').filter({ hasText: 'The last number must be the same as or after the first.' }).waitFor();
  await builder.getByLabel('First number').fill('51');
  await builder.getByLabel('Last number').fill('58');
  await builder.getByLabel('Inside each one, also create (optional)').fill('Bathroom\nKitchen');
  await builder.getByRole('status').filter({ hasText: 'Creates 8 locations (Flat 51 to Flat 58), each with Bathroom and Kitchen. 24 locations in total.' }).waitFor();
  if (screenshots) await builder.screenshot({ path: join(screenshots, 'location-builder-preview-tablet-portrait.png') });
  pass('the builder previews "8 flats, each with Bathroom and Kitchen: 24 locations" and explains mistakes before saving');
  await builder.getByRole('button', { name: 'Create locations' }).click();
  const created = await submitted(builder);
  // Fixture IDs are sequential: Block B is 1, then each level (41 IDs: itself and 10 flats of 4), so Level 5 is 166.
  assert.equal(created.data.parent, 'a0000000-0000-4000-8000-000000000166');
  assert.equal(created.data.total, 24);
  assert.deepEqual(created.data.items[0], { name: 'Flat 51', location_type: 'Flat', children: [{ name: 'Bathroom' }, { name: 'Kitchen' }] });
  pass('the builder submits one nested request inside the chosen level, validated by the server parser');
  const editor = page.locator('section', { has: page.getByRole('heading', { name: 'Block B › Level 5 › Flat 502' }) }).locator('form').first();
  assert.equal(await editor.getByLabel('Name *').inputValue(), 'Flat 502');
  await editor.getByRole('button', { name: 'Change' }).click();
  await editor.getByRole('searchbox', { name: 'Inside', exact: true }).fill('flat 502');
  assert.equal(await editor.getByRole('button', { name: /Flat 502/ }).count(), 0);
  await editor.getByRole('searchbox', { name: 'Inside', exact: true }).fill('level 4');
  await editor.getByRole('button', { name: 'Block B › Level 4', exact: true }).click();
  await editor.getByRole('button', { name: 'Save location' }).click();
  const moved = await submitted(editor);
  assert.equal(moved.data.name, 'Flat 502');
  assert.notEqual(moved.data.parent_id, null);
  pass('moving a location never offers the location itself or anything inside it as the destination');

  // Workforce: companies, gangs and people, with membership history kept.
  await visit(page, origin + '/workforce');
  assert.deepEqual((await page.getByRole('navigation', { name: 'Filter by company' }).getByRole('link').allTextContents()).map(text => text.replace(/\s*\d+$/, '').trim()),
    ['All', 'Jones Installations', 'Site Labour Agency', 'Smith Tiling Ltd', 'No company recorded']);
  await page.getByRole('status').filter({ hasText: 'Replacement Labourer' }).waitFor();
  await page.getByRole('button', { name: 'Confirm Replacement Labourer' }).waitFor();
  pass('people added on site are flagged at the top with a one-tap confirm');
  const smith = page.locator('article', { has: page.getByRole('heading', { name: 'Smith Tiling', exact: true }) });
  assert.deepEqual(await smith.getByRole('list', { name: 'Smith Tiling members' }).getByRole('listitem').allTextContents(), ['Sam Smith (lead)', 'Lee Hart']);
  const direct = page.locator('article', { has: page.getByRole('heading', { name: 'Direct Team A', exact: true }) });
  await direct.getByText('Lee Hart · starts 20 Oct 2026').waitFor();
  await smith.locator('summary', { hasText: 'Manage team' }).click();
  const choices = (await smith.getByLabel('Person *').locator('option').allTextContents()).slice(1);
  assert.equal(choices.some(name => name.startsWith('Sam Smith') || name.startsWith('Lee Hart') || name.startsWith('Ray Dunn')), false);
  assert.equal(choices.some(name => name.startsWith('Tom Baker')), true);
  await smith.getByText('Past members (2)').click();
  await smith.getByText('Transferred to Jones Installations').waitFor();
  await smith.getByText('Entered in error: Added to the wrong team').waitFor();
  pass('a team shows current members, future starters and kept history; it never offers current or inactive people');
  await page.getByRole('link', { name: /^Smith Tiling Ltd/ }).click();
  await page.waitForURL(/company=Smith/);
  assert.equal(await page.locator('article').count(), 1);
  await page.locator('summary', { hasText: '+ Add an operative' }).click();
  const addPerson = page.locator('details', { has: page.locator('summary', { hasText: '+ Add an operative' }) }).locator('form');
  assert.equal(await addPerson.getByLabel('Company').inputValue(), 'Smith Tiling Ltd');
  await addPerson.getByLabel('Full name *').fill('New Tiler');
  await addPerson.getByRole('button', { name: 'Add operative' }).click();
  const person = await submitted(addPerson);
  assert.deepEqual(person.data, { display_name: 'New Tiler', engagement: 'subcontractor', company_name: 'Smith Tiling Ltd' });
  pass('filtering by company narrows everything and pre-fills that company for new people');
  assert.deepEqual(consoleErrors, [], 'browser console errors');
  pass('no browser console errors or React warnings on any screen');
} finally {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    await new Promise(done => { if (server.exitCode !== null) done(); else { server.once('exit', done); setTimeout(done, 3000); } });
  }
  await rm(temporary, { recursive: true, force: true });
}
