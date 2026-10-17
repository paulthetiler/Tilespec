// End-to-end workforce, inspection, snag, formal hold and simple daily journeys: real Next.js pages and
// actions talk through PostgREST to disposable PostgreSQL with every migration
// and RLS policy applied. Local stand-ins supply Auth and the Storage HTTP/byte
// transport; Storage metadata and permissions still use the real migrated
// database under caller JWTs. No business mutation or lifecycle is mocked.
// Needs PostgreSQL server binaries and a PostgREST binary (POSTGREST_BIN).
// Set SCREENSHOT_DIR to keep tablet and phone screenshots.
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { storageFixture } from './snags-storage-fixture.mjs';

const repository = fileURLToPath(new URL('..', import.meta.url));
const screenshots = process.env.SCREENSHOT_DIR;
const postgrestBinary = process.env.POSTGREST_BIN || 'postgrest';
const adminTodayOnly = process.env.E2E_ADMIN_TODAY_ONLY === '1';
const password = 'e2e-password-1';
const users = {
  'sid.supervisor@e2e.invalid': 'e2e00000-0000-4000-8000-000000000001',
  'mia.manager@e2e.invalid': 'e2e00000-0000-4000-8000-000000000002',
  'oscar.other@e2e.invalid': 'e2e00000-0000-4000-8000-000000000003',
  'sam.installer@e2e.invalid': 'e2e00000-0000-4000-8000-000000000004',
  'jo.installer@e2e.invalid': 'e2e00000-0000-4000-8000-000000000005',
  'fred.unassigned@e2e.invalid': 'e2e00000-0000-4000-8000-000000000006',
  'bea.manager@e2e.invalid': 'e2e00000-0000-4000-8000-000000000007',
  'ada.supervisor@e2e.invalid': 'e2e00000-0000-4000-8000-000000000008',
  'grace.owner@e2e.invalid': 'e2e00000-0000-4000-8000-000000000009',
  'dave.supervisor@e2e.invalid': 'e2e00000-0000-4000-8000-000000000010',
  'faye.finance@e2e.invalid': 'e2e00000-0000-4000-8000-000000000011',
  'otto.owner@e2e.invalid': 'e2e00000-0000-4000-8000-000000000012',
};
const contractId = 'e2e00000-0000-4000-8000-0000000000c1';
const children = [];
let browser, work, pgBin, pgPort, asPostgres = [];
let generatedConfiguration;
let nextDiagnosticLog = () => '(Next.js not started)';
const pass = message => console.log(`PASS: ${message}`);
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- PostgreSQL --------------------------------------------------------------
function findPostgres() {
  try { return execFileSync('pg_config', ['--bindir']).toString().trim(); } catch {}
  for (const version of existsSync('/usr/lib/postgresql') ? readdirSync('/usr/lib/postgresql').sort().reverse() : []) {
    if (existsSync(`/usr/lib/postgresql/${version}/bin/initdb`)) return `/usr/lib/postgresql/${version}/bin`;
  }
  throw new Error('PostgreSQL server binaries are required (initdb, pg_ctl).');
}
function sql(statement) {
  return execFileSync(join(pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-w', '-h', work, '-p', String(pgPort), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: statement, encoding: 'utf8' }).trim();
}
async function startDatabase() {
  pgBin = findPostgres();
  work = await mkdtemp(join(tmpdir(), 'tilespec-e2e-'));
  if (process.getuid?.() === 0) { execFileSync('chown', ['postgres', work]); asPostgres = ['runuser', '-u', 'postgres', '--']; }
  await chmod(work, 0o755);
  const run = (binary, args) => asPostgres.length ? execFileSync(asPostgres[0], [...asPostgres.slice(1), join(pgBin, binary), ...args]) : execFileSync(join(pgBin, binary), args);
  pgPort = await freePort();
  run('initdb', ['-D', join(work, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale']);
  // A private socket and no TCP listener: nothing outside this test can connect.
  run('pg_ctl', ['-D', join(work, 'data'), '-o', `-p ${pgPort} -k ${work} -c listen_addresses=''`, '-l', join(work, 'postgres.log'), '-w', 'start']);
  sql(await readFile(join(repository, 'tests/db/platform.sql'), 'utf8'));
  for (const migration of readdirSync(join(repository, 'supabase/migrations')).sort()) sql(await readFile(join(repository, 'supabase/migrations', migration), 'utf8'));
  sql(await readFile(join(repository, 'tests/e2e/seed.sql'), 'utf8'));
  sql(await readFile(join(repository, 'tests/e2e/snags-seed.sql'), 'utf8'));
  sql(await readFile(join(repository, 'tests/e2e/holds-seed.sql'), 'utf8'));
  sql(await readFile(join(repository, 'tests/e2e/simple-seed.sql'), 'utf8'));
  if (adminTodayOnly) sql(await readFile(join(repository, 'tests/e2e/admin-today-seed.sql'), 'utf8'));
}

// --- Tokens and the Supabase stand-in ------------------------------------------
const secret = randomBytes(32).toString('hex');
const base64url = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
function sign(payload) {
  const body = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
function verify(token) {
  const [header, payload, signature] = (token || '').split('.');
  if (!signature || createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url') !== signature) return null;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return claims.exp > Date.now() / 1000 ? claims : null;
}
const anonKey = sign({ role: 'anon', iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 86400 });
// Synthetic key is valid only for this disposable PostgreSQL fixture. Never
// inherit the developer's real service key or pass this key to the browser.
const serviceKey = sign({ role: 'service_role', iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 86400 });
const userFor = (id, email) => ({ id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
function session(id, email) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: sign({ sub: id, role: 'authenticated', aud: 'authenticated', email, exp: expires }), token_type: 'bearer', expires_in: 3600,
    expires_at: expires, refresh_token: `refresh-${id}`, user: userFor(id, email) };
}
async function startGateway(restPort) {
  const port = await freePort();
  const storage = storageFixture({ restPort, verify });
  // Transport fault injection only. A malformed HTTP 200 must never become a
  // confirmed release; these responses deliberately perform no SQL mutation.
  const rpcFaults = { holdReleaseResults: [], dailyResults: new Map() };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const body = await new Promise(resolve => { const chunks = []; request.on('data', chunk => chunks.push(chunk)); request.on('end', () => resolve(Buffer.concat(chunks))); });
    const json = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (url.pathname === '/auth/v1/token') {
      const input = body.length ? JSON.parse(body.toString()) : {};
      if (url.searchParams.get('grant_type') === 'password') {
        const id = users[input.email];
        return id && input.password === password ? json(200, session(id, input.email)) : json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      }
      const id = (input.refresh_token || '').replace(/^refresh-/, '');
      const email = Object.keys(users).find(key => users[key] === id);
      return email ? json(200, session(id, email)) : json(400, { error: 'invalid_grant' });
    }
    if (url.pathname === '/auth/v1/user') {
      const claims = verify((request.headers.authorization || '').replace(/^Bearer /, ''));
      return claims?.sub ? json(200, userFor(claims.sub, claims.email)) : json(401, { message: 'invalid JWT' });
    }
    if (url.pathname === '/auth/v1/logout') { response.writeHead(204); return response.end(); }
    if (await storage.handle(request, response, url, body)) return;
    if (url.pathname.startsWith('/rest/v1/')) {
      if (url.pathname === '/rest/v1/rpc/transition_work_hold' && body.length &&
          JSON.parse(body.toString()).p_action === 'release' && rpcFaults.holdReleaseResults.length) {
        return json(200, rpcFaults.holdReleaseResults.shift());
      }
      const dailyFaults = rpcFaults.dailyResults.get(url.pathname.slice('/rest/v1/rpc/'.length));
      if (url.pathname.startsWith('/rest/v1/rpc/') && dailyFaults?.length) return json(200, dailyFaults.shift());
      const headers = { ...request.headers, host: `127.0.0.1:${restPort}` };
      delete headers['content-length'];
      const upstream = http.request({ host: '127.0.0.1', port: restPort, method: request.method, path: url.pathname.slice('/rest/v1'.length) + url.search,
        headers: { ...headers, ...(body.length ? { 'content-length': body.length } : {}) } }, reply => {
        response.writeHead(reply.statusCode, reply.headers);
        reply.pipe(response);
      });
      upstream.on('error', () => json(502, { message: 'PostgREST unavailable' }));
      return upstream.end(body);
    }
    json(404, { message: 'not found' });
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  children.push({ kill: () => server.close() });
  return { port, storage, rpcFaults };
}
async function startPostgrest() {
  const port = await freePort();
  const child = spawn(postgrestBinary, [], { env: { ...process.env,
    PGRST_DB_URI: `postgresql:///postgres?host=${encodeURIComponent(work)}&port=${pgPort}&user=postgres`, PGRST_DB_SCHEMAS: 'public,storage',
    PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: secret, PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(port), PGRST_LOG_LEVEL: 'error' } });
  let log = '';
  child.stderr.on('data', bytes => { log = (log + bytes).slice(-4000); });
  children.push(child);
  for (const deadline = Date.now() + 30000; ;) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return port; } catch {}
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`PostgREST did not start: ${log}`);
    await wait(200);
  }
}
async function startNext(gatewayPort) {
  const port = await freePort();
  generatedConfiguration = await Promise.all(['tsconfig.json', 'next-env.d.ts'].map(async name => [name, await readFile(join(repository, name), 'utf8')]));
  await rm(join(repository, '.next/e2e'), { recursive: true, force: true });
  let log = '';
  const child = spawn(process.execPath, [join(repository, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: repository, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TILESPEC_E2E_OUTPUT: '1', NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${gatewayPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
      NEXT_TELEMETRY_DISABLED: '1', SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      // The existing regression always proves the default admin. Phase 3 is a
      // separate invocation with an explicit office/owner-only opt-in.
      FEATURE_NEXT_ACTIONS: adminTodayOnly ? 'owner,contracts_manager' : '',
      FEATURE_ROLE_SHELL: adminTodayOnly ? 'owner,contracts_manager' : '' } });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log = (log + bytes).slice(-8000); });
  children.push({ kill: async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
    await Promise.race([exited, wait(5000)]);
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      await exited;
    }
  } });
  const origin = `http://127.0.0.1:${port}`;
  for (const deadline = Date.now() + 120000; ;) {
    try { const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(60000) }); if (response.ok) return { origin, log: () => log }; } catch {}
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Next.js did not start: ${log}`);
    await wait(500);
  }
}

async function restoreGeneratedConfiguration() {
  for (const [name, original] of generatedConfiguration || []) {
    const path = join(repository, name);
    let current;
    try { current = await readFile(path, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; console.warn(`Kept ${name} absent: it was removed during this test.`); continue; }
    if (current === original) continue;
    let onlyGenerated = false;
    if (name === 'tsconfig.json') {
      try {
        const before = JSON.parse(original), after = JSON.parse(current);
        const expected = [...(before.include || []), '.next/e2e/types/**/*.ts'];
        onlyGenerated = isDeepStrictEqual([...new Set(after.include || [])].sort(), [...new Set(expected)].sort()) &&
          isDeepStrictEqual({ ...before, include: undefined }, { ...after, include: undefined });
      } catch { /* Preserve external edits, including JSON-with-comments. */ }
    } else {
      onlyGenerated = current === '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n/// <reference path="./.next/e2e/types/routes.d.ts" />\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n';
    }
    if (onlyGenerated) await writeFile(path, original);
    else console.warn(`Kept ${name}: changes beyond this test's generated output references need review.`);
  }
}

async function signIn(context, origin, email) {
  // The dev server compiles each route on first use, which can take a while.
  context.setDefaultNavigationTimeout(180000);
  context.setDefaultTimeout(90000);
  const page = await context.newPage();
  page.on('pageerror', error => console.error(`Page error (${email}): ${String(error.stack || error).slice(0, 1500)}`));
  await page.goto(`${origin}/login?next=/admin/supervisor`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60000 });
  await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  await page.getByRole('main').waitFor();
  return page;
}

async function compileAuthenticatedRoutes(origin, gatewayPort) {
  // Next's dev server compiles client runtime helpers on the first protected
  // route. Compile them before any browser downloads the login-page runtime,
  // using the official cookie encoder and this disposable Auth transport only.
  // The actual journeys still sign in through the real password form.
  let cookies = [];
  const supabase = createServerClient(`http://127.0.0.1:${gatewayPort}`, anonKey, {
    cookies: { getAll: () => cookies, setAll: values => { cookies = values.map(({ name, value }) => ({ name, value })); } },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: 'mia.manager@e2e.invalid', password });
  assert.equal(error, null, 'authenticated compile warm-up signs in to the disposable Auth transport');
  const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
  assert.ok(cookie, 'official Auth encoder supplied the warm-up session cookies');
  for (const path of ['/admin/supervisor', `/admin/supervisor/sites/${contractId}`, `/admin/supervisor/sites/${contractId}/checks`,
    `/admin/supervisor/sites/${contractId}/workforce`, `/admin/supervisor/sites/${contractId}/history`, `/admin/contracts/${contractId}/actual`]) {
    const response = await fetch(`${origin}${path}`, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(120000) });
    assert.equal(response.status, 200, `authenticated compile warm-up ${path}`);
    const html = await response.text();
    assert.doesNotMatch(html, /Records are temporarily unavailable|Application error/, `authenticated compile warm-up ${path} renders healthy saved records`);
  }
}

// The dev server compiles each route the first time it is requested. Visit
// every route once, in a throwaway session, so the journeys below run against
// compiled pages. Anything that goes wrong here is reported, not hidden: the
// journeys then check every page strictly.
async function warm(origin) {
  const context = await browser.newContext();
  const page = await signIn(context, origin, 'mia.manager@e2e.invalid');
  for (const path of ['/admin/supervisor', `/admin/supervisor/sites/${contractId}`, `/admin/supervisor/sites/${contractId}/checks`,
    `/admin/supervisor/sites/${contractId}/workforce`, `/admin/supervisor/sites/${contractId}/history`, `/admin/contracts/${contractId}/actual`]) {
    await page.goto(`${origin}${path}`);
    await page.getByRole('main').waitFor();
    if (await page.getByText('Application error').count()) console.log(`Warm-up: ${path} showed an error on first compile; the journeys below check it strictly.`);
  }
  await context.close();
}

async function main() {
  // Plans are for "today" in London; do not straddle midnight.
  const londonNow = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (londonNow >= '23:45') { console.log('Waiting until after midnight in London so the test stays within one site day.'); while (new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()) !== '00') await wait(30000); }
  await startDatabase();
  const restPort = await startPostgrest();
  const gateway = await startGateway(restPort);
  const next = await startNext(gateway.port);
  nextDiagnosticLog = next.log;
  await compileAuthenticatedRoutes(next.origin, gateway.port);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true });
  await warm(next.origin);
  if (adminTodayOnly) {
    const { runAdminToday } = await import('./admin-today-e2e-flows.mjs');
    await runAdminToday({ browser, origin: next.origin, sql, signIn, screenshots, pass,
      gatewayOrigin: `http://127.0.0.1:${gateway.port}`, tokenFor: email => session(users[email], email).access_token });
    return;
  }
  const { checkLegacyAdmin } = await import('./admin-today-e2e-flows.mjs');
  await checkLegacyAdmin({ browser, origin: next.origin, signIn, pass });
  // Optional developer focus while diagnosing a snag, hold or simple journey. The normal npm
  // test:e2e command always executes the complete existing regression suite.
  if (process.env.E2E_SNAGS_ONLY !== '1' && process.env.E2E_HOLDS_ONLY !== '1' && process.env.E2E_SIMPLE_ONLY !== '1') {
    const { run } = await import('./site-e2e-flows.mjs');
    const { consoleErrors } = await run({ browser, origin: next.origin, sql, signIn, contractId, screenshots, pass, log: next.log });
    assert.deepEqual(consoleErrors, [], 'browser console errors');
    pass('no browser console errors on any screen');
  }
  if (process.env.E2E_HOLDS_ONLY !== '1' && process.env.E2E_SIMPLE_ONLY !== '1') {
    const { runSnags } = await import('./snags-e2e-flows.mjs');
    await runSnags({ browser, origin: next.origin, sql, signIn, contractId, screenshots, pass,
      storage: gateway.storage, gatewayOrigin: `http://127.0.0.1:${gateway.port}`,
      tokenFor: email => session(users[email], email).access_token, log: next.log });
  }
  if (process.env.E2E_SIMPLE_ONLY !== '1') {
    const { runHolds } = await import('./holds-e2e-flows.mjs');
    await runHolds({ browser, origin: next.origin, sql, signIn, contractId, screenshots, pass,
      storage: gateway.storage, rpcFaults: gateway.rpcFaults, gatewayOrigin: `http://127.0.0.1:${gateway.port}`,
      tokenFor: email => session(users[email], email).access_token, log: next.log });
  }
  if (process.env.E2E_SNAGS_ONLY !== '1' && process.env.E2E_HOLDS_ONLY !== '1') {
    const { runSimple } = await import('./simple-e2e-flows.mjs');
    await runSimple({ browser, origin: next.origin, sql, signIn, screenshots, pass,
      storage: gateway.storage, rpcFaults: gateway.rpcFaults, gatewayOrigin: `http://127.0.0.1:${gateway.port}`,
      tokenFor: email => session(users[email], email).access_token, log: next.log });
  }
}

try {
  await main();
} catch (error) {
  console.error(`Next.js test log:\n${nextDiagnosticLog()}`);
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '(unreadable)');
    console.error(`Open page: ${page.url()}\n${text.slice(0, 800)}`);
  }
  throw error;
} finally {
  await browser?.close();
  for (const child of children.reverse()) { try { await child.kill(); } catch {} }
  if (work) {
    try { execFileSync(asPostgres[0] || join(pgBin, 'pg_ctl'), asPostgres.length ? [...asPostgres.slice(1), join(pgBin, 'pg_ctl'), '-D', join(work, 'data'), '-m', 'immediate', 'stop'] : ['-D', join(work, 'data'), '-m', 'immediate', 'stop'], { stdio: 'ignore' }); } catch {}
    await rm(work, { recursive: true, force: true });
  }
  await restoreGeneratedConfiguration();
}
