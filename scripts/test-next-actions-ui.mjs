// Real Phase 2 components in a disposable app with synthetic, read-only server
// dependencies. This checks UI wiring, not hosted Auth, RLS or database writes.
import { copyFile, cp, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const repository = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'tilespec-next-actions-ui-'));
const screenshots = process.env.SCREENSHOT_DIR;
const siteId = 'a0000000-0000-4000-8000-000000000001';
const base = `/admin/supervisor/sites/${siteId}`;
const viewports = [{ width: 320, height: 812 }, { width: 390, height: 844 }, { width: 820, height: 1180 }];
let server, browser, log = '';
const errors = [];
const pass = message => console.log(`PASS: ${message}`);
const write = async (path, contents) => {
  await mkdir(join(temporary, path, '..'), { recursive: true });
  await writeFile(join(temporary, path), contents);
};
const visit = async (page, url) => {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]', { state: 'attached' });
};
const href = async (page, name) => page.getByRole('link', { name, exact: true }).getAttribute('href');
const measure = async page => page.evaluate(() => {
  const problems = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(`page is ${document.documentElement.scrollWidth}px wide at ${innerWidth}px`);
  // Content links in prose remain text links. All navigation, form-choice and
  // action controls must be finger-sized, including each role-shell link.
  for (const element of document.querySelectorAll('button, summary, nav a, a[class*="report"], a[class*="cta"], a[class*="row"], a[class*="siteChoice"], a[class*="Button"], [class*="moreLinks"] a')) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const label = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70);
    if (rect.height < 43.5) problems.push(`${label}: ${rect.height}px high`);
    if (rect.right > innerWidth + 1 || rect.left < -1) problems.push(`${label}: extends outside viewport`);
  }
  return problems;
});

try {
  for (const directory of ['components', 'lib/operations']) await cp(join(repository, directory), join(temporary, directory), { recursive: true });
  await cp(join(repository, 'tests/next-actions-ui'), join(temporary, 'tests/next-actions-ui'), { recursive: true });
  for (const file of ['app/globals.css', 'app/admin/admin.module.css', 'app/admin/layout.tsx', `app/admin/supervisor/sites/[id]/layout.tsx`, `app/admin/supervisor/sites/[id]/report/page.tsx`, 'docs/redesign/prototype/data.js', 'public/tilespec-logo-animated.svg']) {
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
    import {member as fixtureMember, fixtureClient} from "@/tests/next-actions-ui/fixtures";
    export type Member = {organisation_id:string;user_id:string;display_name:string;role:"owner"|"contracts_manager"|"supervisor"|"lead_installer"|"subcontract_installer";financial_access:boolean;active:boolean};
    export {canReadFinancial} from "./operations/permissions";
    export async function requireActor(){const role=(await cookies()).get("fixture-role")?.value;const allowed=["owner","contracts_manager","supervisor","lead_installer","subcontract_installer"];const member={...fixtureMember,role:allowed.includes(role??"")?role as Member["role"]:"supervisor",financial_access:role==="owner"};return {member,supabase:fixtureClient()}}`);
  await write('app/auth/actions.ts', '"use server";export async function signOut(){throw new Error("No mutations are supported by this UI fixture")}');
  await write('app/admin/supervisor/site-access.ts', `import {requireActor} from "@/lib/auth";import {contract} from "@/tests/next-actions-ui/fixtures";export async function requireSite(id:string){return {...await requireActor(),contract:id===contract.id?contract:null}}`);
  await write('lib/operations/next-actions/snapshot-data.ts', 'import {snapshotFor,member} from "@/tests/next-actions-ui/fixtures";export async function loadSiteSnapshot(client:{fixtureHeld?:boolean}){return {snapshot:snapshotFor(client.fixtureHeld),viewer:member}}');
  await write('lib/operations/quality-data.ts', 'export async function qualityOverviewFor(){return {work_statuses:[],work_statuses_truncated:false}}');
  await write('lib/operations/data.ts', 'export function checkDatabase(error:unknown){if(error)throw error}');
  await write('app/admin/supervisor/sites/[id]/page.tsx', `import {NextActionsToday} from "@/components/site/next-actions-today";import {fixtureClient,member,contract} from "@/tests/next-actions-ui/fixtures";export default async function Page({searchParams}:{searchParams:Promise<{held?:string}>}){return <NextActionsToday supabase={fixtureClient((await searchParams).held==="1")} member={member} contract={contract} changeSite/>} `);
  await write('app/admin/fixture-navigation/page.tsx', 'export default function Page(){return <h1>Read-only role navigation fixture</h1>}');
  if (screenshots) await mkdir(screenshots, { recursive: true });

  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  // Explicit test-only opt-in; neither the parent process nor app defaults change.
  server = spawn(process.execPath, [join(repository, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: temporary, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEATURE_NEXT_ACTIONS: 'supervisor', FEATURE_ROLE_SHELL: 'on', NEXT_TELEMETRY_DISABLED: '1' },
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { log = (log + bytes.toString()).slice(-16000); });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90000;
  while (true) {
    let response;
    try { response = await fetch(origin + base, { signal: AbortSignal.timeout(30000) }); } catch {}
    if (response?.ok) break;
    if (response?.status >= 500 || server.exitCode !== null || Date.now() > deadline) throw new Error(`Next Action UI app failed: ${log}`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true });
  const denied = await fetch(origin + base + '/report', { headers: { cookie: 'fixture-role=owner' } });
  assert.equal(denied.status, 404, 'real Report Issue route rejects a role outside its explicit feature opt-in');
  pass('real Report Issue feature guard returns 404 for a role that is not opted in');
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, hasTouch: true, locale: 'en-GB' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text()); });
    await visit(page, origin + base);
    assert.equal(await href(page, 'Start morning checks'), `${base}/checks`);
    assert.equal(await href(page, 'Report an issue'), `${base}/report`);
    assert.deepEqual(await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link').allTextContents(), ['Today', 'People', 'Inspect', 'Issues']);
    assert.equal(await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Today', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await page.getByText('Everything else', { exact: true }).count(), 0, 'a supervisor has no second menu');
    assert.equal(await page.getByRole('link', { name: /Money|Estimator/ }).count(), 0);
    assert.equal(await href(page, 'Change site'), '/admin/supervisor');
    const more = page.getByRole('region', { name: 'More', exact: true });
    assert.deepEqual(await more.locator('strong').allTextContents(), ['Office messages', 'Finish today', 'Variations', 'Dayworks'], 'More does not repeat the tab bar');
    for (const kind of ['Variations', 'Dayworks']) {
      const link = more.getByRole('link', { name: new RegExp(`^${kind}`) });
      assert.equal(await link.getAttribute('href'), `${base}/commercial?kind=${kind.toLowerCase()}`);
      assert.match(await link.textContent(), /Not built yet/, `${kind} is clearly marked as not built`);
    }
    const drawing = page.getByRole('region', { name: 'Drawings and documents', exact: true }).getByRole('link', { name: /Bathroom tile layout/ });
    assert.equal(await drawing.getAttribute('href'), '/admin/documents/a0000000-0000-4000-8000-000000000003', 'each drawing opens through the authorised download route');
    assert.equal(await drawing.getAttribute('target'), '_blank');
    assert.deepEqual(await measure(page), [], `Today at ${viewport.width}px`);
    if (screenshots) await page.screenshot({ path: join(screenshots, `next-actions-today-${viewport.width}.png`), fullPage: true });
    pass(`real Supervisor Today and role shell fit ${viewport.width}px, with real CTA targets and controls at least 44px high`);

    await visit(page, origin + base + '?held=1');
    const stopped = page.getByRole('region', { name: 'Work that is stopped', exact: true });
    await stopped.getByText('Unsafe access to the waterproofing area', { exact: true }).waitFor();
    assert.match(await stopped.textContent(), /Block B › Level 3 › Flat 31 › Bathroom/);
    assert.match(await stopped.textContent(), /waterproofing/);
    assert.match(await stopped.textContent(), /Bathroom floor membrane/);
    assert.match(await stopped.textContent(), /Work package: Flat 31 bathroom: floor and walls/);
    assert.equal(await stopped.getByRole('link', { name: 'View restriction', exact: true }).getAttribute('href'), '/admin/holds/held-bathroom');
    assert.deepEqual(await measure(page), [], `held Today at ${viewport.width}px`);
    if (screenshots) await page.screenshot({ path: join(screenshots, `next-actions-stopped-${viewport.width}.png`), fullPage: true });
    pass(`stopped work retains its exact location, stage, activity and package at ${viewport.width}px`);

    await page.getByRole('link', { name: 'Report an issue', exact: true }).click();
    await page.getByRole('heading', { name: 'Report an issue', exact: true }).waitFor();
    assert.equal(await href(page, /No, just record it/), `/admin/snags/new?contract=${siteId}`);
    assert.equal(await href(page, /Yes, put a quality hold on it/), `/admin/holds/new?contract=${siteId}&type=quality`);
    assert.equal(await href(page, /Yes, it is a safety stop/), `/admin/holds/new?contract=${siteId}&type=safety`);
    await page.getByText('Existing work restrictions still apply.', { exact: false }).waitFor();
    await page.getByText("Make the area safe first", { exact: false }).waitFor();
    assert.equal(await href(page, 'Back to today'), base);
    const siteBar = page.getByRole('navigation', { name: 'Site', exact: true });
    assert.deepEqual(await siteBar.getByRole('link').allTextContents(), ['← Today', 'Report an issue'], 'the site bar is a way back and the one everyday action');
    assert.equal(await siteBar.locator('details').count(), 0, 'no More menu on site screens');
    assert.deepEqual(await measure(page), [], `Report Issue at ${viewport.width}px`);
    if (screenshots) await page.screenshot({ path: join(screenshots, `report-issue-${viewport.width}.png`), fullPage: true });
    pass(`Report Issue retains all three existing form destinations and safety wording at ${viewport.width}px`);

    for (const role of ['owner', 'contracts_manager', 'lead_installer', 'subcontract_installer']) {
      await context.addCookies([{ name: 'fixture-role', value: role, url: origin }]);
      await visit(page, origin + '/admin/fixture-navigation');
      const nav = page.getByRole('navigation', { name: 'Main', exact: true });
      assert.ok(await nav.getByRole('link').count() <= 4);
      await page.getByText('Everything else', { exact: true }).click();
      const money = await page.getByRole('link', { name: /^(Money|Estimator)$/ }).count();
      assert.equal(money > 0, role === 'owner', `${role} financial navigation`);
      assert.deepEqual(await measure(page), [], `${role} navigation at ${viewport.width}px`);
    }
    pass(`all role menus fit ${viewport.width}px; non-financial office staff and installers have no money links`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'browser console errors and React warnings');
  pass('all real component journeys completed without browser errors');
} finally {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 3000); } });
  }
  await rm(temporary, { recursive: true, force: true });
}
