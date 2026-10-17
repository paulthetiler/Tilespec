// Exact application components in a disposable app. Synthetic read-only fixture
// sessions exist only here; authenticated DB/RLS journeys run separately.
import { copyFile, cp, mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const repository = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'tilespec-admin-today-ui-'));
const screenshots = process.env.SCREENSHOT_DIR;
const secret = randomBytes(32).toString('hex');
const viewports = [{ width: 320, height: 812 }, { width: 390, height: 844 }, { width: 820, height: 1180 }];
let server, browser, log = '';
const errors = [];
const pass = message => console.log(`PASS: ${message}`);
const write = async (path, contents) => {
  await mkdir(join(temporary, path, '..'), { recursive: true });
  await writeFile(join(temporary, path), contents);
};
const signedRole = key => `${key}.${createHmac('sha256', secret).update(key).digest('hex')}`;
const visit = async (page, url) => {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]', { state: 'attached' });
};
const measure = page => page.evaluate(() => {
  const problems = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(`page is ${document.documentElement.scrollWidth}px wide at ${innerWidth}px`);
  for (const element of document.querySelectorAll('button, summary, nav a, main a, [class*="moreLinks"] a')) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const label = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    if (rect.height < 43.5) problems.push(`${label}: ${rect.height}px high`);
    if (rect.width < 43.5) problems.push(`${label}: ${rect.width}px wide`);
    if (rect.right > innerWidth + 1 || rect.left < -1) problems.push(`${label}: extends outside viewport`);
  }
  for (const element of document.querySelectorAll('main h1, main h2, main h3, main p, main strong')) {
    if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).display !== 'inline') problems.push(`content overflows: ${(element.textContent || '').slice(0, 60)}`);
  }
  return problems;
});

async function pageRoutes(directory, parts = []) {
  const routes = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) routes.push(...await pageRoutes(join(directory, entry.name), [...parts, entry.name]));
    else if (entry.name === 'page.tsx') {
      const pattern = parts.filter(part => !part.startsWith('(')).map(part => part.startsWith('[') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
      routes.push(new RegExp(`^/${pattern}/?$`));
    }
  }
  return routes;
}

try {
  await build({ entryPoints: [join(repository, 'tests/admin-today-ui/fixtures.ts')], bundle: true, platform: 'node', format: 'esm', outfile: join(temporary, 'expected.mjs'), logLevel: 'silent' });
  const { expectedFor, scenarioKeys } = await import(pathToFileURL(join(temporary, 'expected.mjs')).href);
  const routes = await pageRoutes(join(repository, 'app'));
  for (const directory of ['components', 'lib/operations']) await cp(join(repository, directory), join(temporary, directory), { recursive: true });
  await cp(join(repository, 'tests/admin-today-ui'), join(temporary, 'tests/admin-today-ui'), { recursive: true });
  for (const file of ['app/globals.css', 'app/admin/admin.module.css', 'app/admin/layout.tsx', 'public/tilespec-logo-animated.svg']) {
    await mkdir(join(temporary, file, '..'), { recursive: true });
    await copyFile(join(repository, file), join(temporary, file));
  }
  await symlink(join(repository, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  await write('package.json', JSON.stringify({ private: true }));
  await write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2021', lib: ['dom', 'esnext'], allowJs: true, jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, paths: { '@/*': ['./*'] } }, include: ['**/*.ts', '**/*.tsx'] }));
  await write('next.config.mjs', 'export default { devIndicators: false };');
  await write('app/hydrated.tsx', '"use client";import {useEffect} from "react";export function Hydrated(){useEffect(()=>{document.body.dataset.hydrated="true"},[]);return null}');
  await write('app/layout.tsx', 'import "./globals.css";import {Hydrated} from "./hydrated";export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<Hydrated/></body></html>}');
  await write('lib/auth.ts', `import {cookies} from "next/headers";
    import {createHmac,timingSafeEqual} from "node:crypto";import {notFound} from "next/navigation";
    import {fixtureFor,scenarioKeys,type ScenarioKey} from "@/tests/admin-today-ui/fixtures";
    export type Member={organisation_id:string;user_id:string;display_name:string;role:"owner"|"contracts_manager"|"supervisor"|"lead_installer"|"subcontract_installer";financial_access:boolean;active:boolean};
    export {canReadFinancial} from "./operations/permissions";
    export async function requireActor(){const value=(await cookies()).get("admin-today-ui-role")?.value??"";const [key,signature]=value.split(".");
      const expected=createHmac("sha256",process.env.ADMIN_TODAY_UI_TEST_SECRET!).update(key??"").digest("hex");
      if(!scenarioKeys.includes(key as ScenarioKey)||!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))notFound();
      return {member:fixtureFor(key as ScenarioKey).member,fixtureKey:key as ScenarioKey};}`);
  await write('app/auth/actions.ts', '"use server";export async function signOut(){throw new Error("No mutations are supported by this UI fixture")}');
  await write('app/admin/page.tsx', 'import {AdminToday} from "@/components/admin/admin-today";import {requireActor} from "@/lib/auth";import {fixtureFor} from "@/tests/admin-today-ui/fixtures";export default async function Page({searchParams}:{searchParams:Promise<{ordinary?:string}>}){const {fixtureKey}=await requireActor();return <AdminToday {...fixtureFor(fixtureKey,(await searchParams).ordinary==="1")}/>;}');
  if (screenshots) await mkdir(screenshots, { recursive: true });
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  server = spawn(process.execPath, [join(repository, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: temporary, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_NEXT_ACTIONS: 'owner,contracts_manager', FEATURE_ROLE_SHELL: 'owner,contracts_manager', ADMIN_TODAY_UI_TEST_SECRET: secret, NEXT_TELEMETRY_DISABLED: '1' },
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { log = (log + bytes.toString()).slice(-16000); });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90000;
  while (true) {
    let response;
    try { response = await fetch(origin + '/admin', { headers: { cookie: `admin-today-ui-role=${signedRole('office')}` }, signal: AbortSignal.timeout(30000) }); } catch {}
    if (response?.ok) break;
    if (response?.status >= 500 || server.exitCode !== null || Date.now() > deadline) throw new Error(`Admin Today UI app failed: ${log}`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.equal((await fetch(origin + '/admin')).status, 404, 'temporary fixture rejects missing role session');
  assert.equal((await fetch(origin + '/admin', { headers: { cookie: 'admin-today-ui-role=owner.forged' } })).status, 404, 'temporary fixture rejects forged role session');
  pass('disposable fixture accepts only signed test-role sessions and exposes no production test route');
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true });
  for (const viewport of viewports) {
    for (const key of scenarioKeys) {
      const expected = expectedFor(key);
      assert.ok(expected.then.length > 20, `${key} fixture must catch truncated Then queues`);
      if (key === 'owner') assert.ok(expected.exceptions.length >= 2, 'owner fixture retains independent-review and overdue problems');
      else assert.ok(expected.waiting.length >= 2, 'office fixture retains work waiting on the supervisor and subcontractor');
      const context = await browser.newContext({ viewport, hasTouch: true, locale: 'en-GB' });
      await context.addCookies([{ name: 'admin-today-ui-role', value: signedRole(key), url: origin }]);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${key}/${viewport.width}: ${String(error)}`));
      page.on('console', message => { if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(`${key}/${viewport.width}: ${message.text()}`); });
      await visit(page, origin + '/admin');
      await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
      if (screenshots) await page.screenshot({ path: join(screenshots, `admin-today-${key}-${viewport.width}-first-screen.png`) });
      const nextHeading = await page.getByRole('region', { name: 'Do this next', exact: true }).getByRole('heading', { level: 2 }).boundingBox();
      const mainNavigation = await page.getByRole('navigation', { name: 'Main', exact: true }).boundingBox();
      assert.ok(nextHeading && mainNavigation && nextHeading.y >= 0 && nextHeading.y + nextHeading.height <= mainNavigation.y + 1, `${key} at ${viewport.width}px: the complete next-action title must be visible above the fixed main navigation on the first screen`);
      assert.equal(await page.locator('[data-today-role]').getAttribute('data-today-role'), key === 'owner' ? 'owner' : 'office');
      assert.equal(await page.getByRole('region', { name: 'Do this next', exact: true }).count(), 1);
      assert.equal(await page.getByRole('region', { name: 'Do this next', exact: true }).getAttribute('data-action-id'), expected.heroId);
      assert.equal(await page.getByRole('region', { name: 'Do this next', exact: true }).getAttribute('data-action-state'), 'ready');
      const renderedIds = await page.locator('[data-action-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-action-id')));
      assert.deepEqual([...renderedIds].sort(), [...expected.ids].sort(), `${key} renders each non-financial shared-engine action exactly once`);
      assert.equal(new Set(renderedIds).size, renderedIds.length);
      const then = page.getByRole('region', { name: 'Then', exact: true });
      assert.deepEqual(await then.locator('[data-action-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-action-id'))), expected.then);
      await then.getByRole('heading', { name: `Then (${expected.then.length})`, exact: true }).waitFor();
      assert.equal(await page.getByTestId('today-action-count').textContent(), `${expected.counts.actions} things need you.`);
      for (const [label, ids] of [['Waiting on others', expected.waiting], ['Outstanding problems', expected.exceptions]]) {
        const region = page.getByRole('region', { name: label, exact: true });
        assert.equal(await region.count(), ids.length ? 1 : 0, `${key} ${label} section`);
        if (ids.length) {
          assert.deepEqual(await region.locator('[data-action-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-action-id'))), ids);
          await region.getByRole('heading', { name: `${label} (${ids.length})`, exact: true }).waitFor();
          assert.equal(await region.locator('details:not([open]) [data-action-id]').count(), 0, `${label} is never hidden in disclosure`);
        }
      }
      pass(`${key} at ${viewport.width}px shows one next action, all ${expected.then.length} Then tasks, exact counts and every waiting/problem record once`);

      const stopped = page.getByRole('region', { name: 'Work that is stopped', exact: true });
      const attention = page.getByRole('complementary', { name: 'Active work restrictions', exact: true });
      const safetyCount = expected.holds.filter(hold => hold.hold_type === 'safety').length;
      assert.match(await attention.textContent(), new RegExp(`${safetyCount} safety stops? · ${expected.holds.length - safetyCount} quality holds?`));
      assert.ok(await page.evaluate(() => !!(document.querySelector('[aria-label="Do this next"]').compareDocumentPosition(document.getElementById('today-stopped')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'primary action precedes the complete expanded restriction register');
      assert.equal(await stopped.locator('[data-hold-id]').count(), expected.holds.length);
      for (const hold of expected.holds) {
        const row = stopped.locator(`[data-hold-id="${hold.id}"]`);
        const text = await row.textContent();
        for (const part of [...hold.location_path, hold.stage, hold.activity, hold.work_package_name, hold.reason]) assert.ok(text.includes(part), `${key} hold ${hold.id} retains ${part}`);
        assert.equal(await row.getByRole('link', { name: 'View restriction', exact: true }).getAttribute('href'), `/admin/holds/${hold.id}`);
      }
      assert.equal(await stopped.locator('details:not([open]) [data-hold-id]').count(), 0);
      assert.match(await stopped.textContent(), /Completing a task here does not release any hold/);
      pass(`${key} at ${viewport.width}px retains all ${expected.holds.length} active restrictions with exact location, activity, stage and package`);

      const nav = page.getByRole('navigation', { name: 'Main', exact: true });
      assert.deepEqual(await nav.getByRole('link').allTextContents(), key === 'owner' ? ['Today', 'Jobs', 'Money'] : ['Today', 'Jobs', 'People', 'Paperwork']);
      assert.ok(await nav.getByRole('link').count() <= 4);
      assert.equal(await nav.getByRole('link', { name: 'Today', exact: true }).getAttribute('aria-current'), 'page');
      await page.getByText('Everything else', { exact: true }).click();
      for (const label of ['Contracts', 'Workforce', 'Site dashboards', 'Snag register', 'Holds and releases', 'Site alerts', 'Paperwork', 'Messages and handovers', 'Quality control', 'Tenders']) await page.getByRole('link', { name: label, exact: true }).last().waitFor({ state: 'visible' });
      assert.equal(await page.getByRole('link', { name: 'User access', exact: true }).count(), key === 'owner' ? 1 : 0);
      const financialLinks = await page.locator('a[href="/admin/money"], a[href="/admin/estimator"]').count();
      assert.equal(financialLinks > 0, key !== 'office', `${key} financial menu permission`);
      const html = await page.content();
      // Next development traces contain fractional profiling timestamps such as
      // 15.613079999999172. Match complete monetary values, not a run of digits
      // inside an unrelated timestamp; include rendered currency formatting.
      for (const secretValue of ['11111111', '9999999', '111111', '222222', '333333', '11,111,111', '9,999,999', '111,111', '222,222', '333,333']) {
        const value = new RegExp(`(?<![0-9.,])${secretValue}(?![0-9,])`);
        assert.ok(!value.test(html), `${key} Today must not render complete financial value ${secretValue}`);
      }
      for (const financialText of ['Budget margin is', 'Budgeted profit after reserve']) assert.ok(!html.includes(financialText), `${key} Today must not render financial action text`);
      assert.equal(await page.locator('[data-action-id^="margin:"]').count(), 0);
      assert.deepEqual(await measure(page), [], `${key} at ${viewport.width}px: no horizontal overflow, clipped content or sub-44px controls`);
      for (const target of await page.locator('a[href]').evaluateAll(elements => elements.map(element => element.getAttribute('href')))) {
        if (target.startsWith('#')) {
          assert.ok(await page.evaluate(fragment => !!document.getElementById(fragment.slice(1)), target), `${key} jump ${target} has a real target`);
          continue;
        }
        if (!target.startsWith('/') || target.startsWith('//')) continue;
        const path = new URL(target, origin).pathname;
        assert.ok(routes.some(route => route.test(path)), `${key} link ${target} must name a real application page`);
      }
      if (screenshots) {
        await page.getByText('Everything else', { exact: true }).click();
        await page.screenshot({ path: join(screenshots, `admin-today-${key}-${viewport.width}.png`), fullPage: true });
        // Replace the early diagnostic capture after the complete journey, when
        // the existing finite brand animation has finished. Restore initial
        // scroll position without hiding controls or changing app geometry.
        await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
        await page.screenshot({ path: join(screenshots, `admin-today-${key}-${viewport.width}-first-screen.png`) });
      }
      pass(`${key} at ${viewport.width}px keeps four-or-fewer useful main links, preserves Everything else, hides financial figures and fits 44px touch controls`);
      if (viewport.width <= 390 && key !== 'office-finance') {
        await visit(page, origin + '/admin?ordinary=1');
        const cta = await page.getByRole('region', { name: 'Do this next', exact: true }).getByRole('link').boundingBox();
        const navigation = await page.getByRole('navigation', { name: 'Main', exact: true }).boundingBox();
        assert.ok(cta && navigation && cta.y >= 0 && cta.y + cta.height <= navigation.y + 1, `${key} at ${viewport.width}px: ordinary saved job and location must show the entire primary action above fixed navigation`);
        assert.deepEqual(await measure(page), [], `${key} ordinary job at ${viewport.width}px`);
        if (screenshots) {
          // The existing SVG brand has a finite 1.79-second entrance animation.
          // Let it finish for reviewable screenshots; this does not affect layout.
          await page.waitForTimeout(2000);
          await page.screenshot({ path: join(screenshots, `admin-today-${key}-${viewport.width}-ordinary-first-screen.png`) });
        }
        pass(`${key} at ${viewport.width}px puts the full primary button above fixed navigation with an ordinary saved job and location`);
      }
      await context.close();
    }
  }
  assert.deepEqual(errors, [], 'browser console errors and React warnings');
  pass('all real Office/Owner component mobile journeys completed without browser errors');
} finally {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 3000); } });
  }
  await rm(temporary, { recursive: true, force: true });
}
