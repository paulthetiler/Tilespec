// Subcontractor portal, end to end in a real browser at phone size.
//
// Real Next.js pages and server actions run against a disposable local PostgreSQL with every
// migration, grant and row-level security policy applied. The portal reaches the database only
// through its anonymous portal_* functions and one storage upload, so a small local gateway stands
// in for Supabase: it runs each call as the `anon` database role (exactly as the hosted project
// does) and refuses any function that is not a portal function. No business rule is mocked, and no
// external binary or network is needed.
//
// Journey: no link -> bad link -> personal link -> sign agreement -> generate invoice (PDF) ->
// duplicate refused -> upload own invoice -> malicious file refused -> supervisor verifies ->
// office approves with CIS and retention -> subcontractor sees the payment -> link withdrawn.
// Set SCREENSHOT_DIR to keep phone screenshots.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const repository = fileURLToPath(new URL('..', import.meta.url));
const screenshots = process.env.SCREENSHOT_DIR;
const ids = { owner: 'b0000000-0000-4000-8000-000000000001', supervisor: 'b0000000-0000-4000-8000-000000000002', org: 'b1000000-0000-4000-8000-000000000001',
  contract: 'b2000000-0000-4000-8000-000000000001', floor: 'b3000000-0000-4000-8000-000000000001', entrance: 'b3000000-0000-4000-8000-000000000002',
  team: 'b4000000-0000-4000-8000-000000000001', other: 'b4000000-0000-4000-8000-000000000002' };
const children = [];
let browser, work, pgBin, pgPort, asPostgres = [], restore = [];
const pass = message => console.log(`PASS: ${message}`);
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- PostgreSQL ----------------------------------------------------------------
function findPostgres() {
  try { return execFileSync('pg_config', ['--bindir'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  for (const version of existsSync('/usr/lib/postgresql') ? readdirSync('/usr/lib/postgresql').sort().reverse() : []) {
    if (existsSync(`/usr/lib/postgresql/${version}/bin/initdb`)) return `/usr/lib/postgresql/${version}/bin`;
  }
  throw new Error('PostgreSQL server binaries are required (initdb, pg_ctl).');
}
function psql(statement) {
  return execFileSync(join(pgBin, 'psql'), ['-X', '-q', '-A', '-t', '-w', '-h', work, '-p', String(pgPort), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
const quote = value => { const tag = `q${randomBytes(6).toString('hex')}`; return `$${tag}$${value}$${tag}$`; };
/** A statement run as one signed-in office or site user, under row-level security. */
const as = (user, statement) => psql(`begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${user}"}', true);\n${statement};\ncommit;`).split('\n').pop();
async function startDatabase() {
  pgBin = findPostgres();
  work = await mkdtemp(join(tmpdir(), 'tilespec-portal-'));
  if (process.getuid?.() === 0) { execFileSync('chown', ['postgres', work]); asPostgres = ['runuser', '-u', 'postgres', '--']; }
  await chmod(work, 0o755);
  const run = (binary, args) => asPostgres.length ? execFileSync(asPostgres[0], [...asPostgres.slice(1), join(pgBin, binary), ...args]) : execFileSync(join(pgBin, binary), args);
  pgPort = await freePort();
  run('initdb', ['-D', join(work, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale']);
  run('pg_ctl', ['-D', join(work, 'data'), '-o', `-p ${pgPort} -k ${work} -c listen_addresses=''`, '-l', join(work, 'postgres.log'), '-w', 'start']);
  psql(await readFile(join(repository, 'tests/db/platform.sql'), 'utf8'));
  for (const migration of readdirSync(join(repository, 'supabase/migrations')).sort()) psql(await readFile(join(repository, 'supabase/migrations', migration), 'utf8'));
}

// --- The office sets a subcontractor up, through the real functions -------------------
function seed() {
  psql(`
    insert into auth.users(id,email) values ('${ids.owner}','owner@e2e.invalid'),('${ids.supervisor}','supervisor@e2e.invalid');
    insert into public.organisations(id,name) values ('${ids.org}','TileSPEC Test');
    insert into public.organisation_members(organisation_id,user_id,display_name,role,financial_access) values
      ('${ids.org}','${ids.owner}','Olive Owner','owner',true),('${ids.org}','${ids.supervisor}','Sam Supervisor','supervisor',false);
    insert into public.organisation_billing_profiles(organisation_id,legal_name,registered_address) values ('${ids.org}','TileSPEC Test Ltd','Unit 24, The Wharf, Warrington WA1 2HT');
    insert into public.contracts(id,organisation_id,reference,name,address,created_by) values ('${ids.contract}','${ids.org}','SM-1','Supermarket refurbishment','Retail Park, Warrington','${ids.owner}');
    insert into public.work_areas(id,organisation_id,contract_id,name,created_by) values
      ('${ids.floor}','${ids.org}','${ids.contract}','Main shop floor','${ids.owner}'),('${ids.entrance}','${ids.org}','${ids.contract}','Entrance','${ids.owner}');
    insert into public.contract_assignments(organisation_id,contract_id,user_id) values ('${ids.org}','${ids.contract}','${ids.supervisor}');
    insert into public.teams(id,organisation_id,name,kind) values ('${ids.team}','${ids.org}','Dave Tiling','individual_subcontractor'),('${ids.other}','${ids.org}','Secret Rival Tiling','subcontract_gang');`);
  const o = statement => as(ids.owner, statement);
  o(`select public.save_subcontractor_profile('${ids.team}',null,'{"legal_name":"Dave Tiler","trading_name":"Dave Tiling","address":"1 High Street, Warrington","utr":"1234567890","cis_status":"net","cis_verified_on":"2026-01-05","phone":"07700 900123"}')`);
  o(`select public.save_subcontractor_bank('${ids.team}','{"account_name":"D Tiler","sort_code":"12-34-56","account_number":"87654321"}')`);
  const version = o(`select public.create_agreement_version(jsonb_build_object('version_label','1.0','title','Subcontractor Agreement','body',${quote(`## 1. Standard of work\n\n${'The Subcontractor will carry out the Works with reasonable skill and care. '.repeat(12)}\n\n## 2. Payment\n\nPayment is made under the Construction Act on the final date for payment.`)}))`);
  o(`select public.publish_agreement_version('${version}','{"legal_reviewed_by":"A Solicitor, Example LLP","legal_reviewed_on":"2026-01-06"}')`);
  o(`select public.issue_subcontractor_agreement('${ids.team}','${version}')`);
  const subcontract = o(`select public.save_gang_subcontract('{"contract_id":"${ids.contract}","team_id":"${ids.team}","payment_cycle":"weekly","pay_weekday":5,"payment_days":7,"retention_percent":5}')`);
  o(`select public.save_gang_rate(gen_random_uuid(),'{"subcontract_id":"${subcontract}","unit":"m2","rate":20,"effective_from":"2026-01-01"}')`);
  o(`select public.save_gang_rate(gen_random_uuid(),'{"subcontract_id":"${subcontract}","unit":"day","rate":180,"description":"Tiler day rate","effective_from":"2026-01-01"}')`);
  o(`select public.save_gang_variation(gen_random_uuid(),'{"subcontract_id":"${subcontract}","description":"Extra skirting to the cafe","amount":500}')`);
  const token = o(`select public.issue_portal_link('${ids.team}','{"issued_to":"Dave Tiler","days":14}')->>'token'`);
  assert.match(token, /^[0-9a-f]{64}$/);
  return { token, version };
}

// --- A stand-in for the hosted project's API: portal functions and one upload, as `anon` -------
async function startGateway() {
  const port = await freePort();
  const stored = new Map(), calls = [];
  const body = request => new Promise((resolve, reject) => { const chunks = []; request.on('data', c => chunks.push(c)); request.on('end', () => resolve(Buffer.concat(chunks))); request.on('error', reject); });
  const send = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(value === undefined ? '' : JSON.stringify(value)); };
  const failure = error => {
    const match = /ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/.exec(String(error.stderr ?? error.message ?? ''));
    return match ? { code: match[1], message: match[2], details: null, hint: null } : { code: 'XX000', message: 'gateway failure', details: String(error.stderr ?? error) };
  };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://gateway');
      const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
      if (rpc && request.method === 'POST') {
        // Only the portal's own functions exist to an anonymous visitor.
        if (!/^portal_[a-z_]+$/.test(rpc[1])) return send(response, 404, { code: 'PGRST202', message: 'Could not find the function' });
        calls.push(rpc[1]);
        const args = JSON.parse((await body(request)).toString('utf8') || '{}');
        const signature = psql(`select coalesce(string_agg(n || ':' || format_type(t, null), ',' order by o), ''), (prorettype = 'void'::regtype)::text from pg_proc p
          left join lateral unnest(p.proargnames, p.proargtypes::oid[]) with ordinality a(n, t, o) on true where p.oid = 'public.${rpc[1]}'::regproc group by p.oid, p.prorettype`);
        const [list, isVoid] = signature.split('|');
        const json = quote(JSON.stringify(args));
        const call = `public.${rpc[1]}(${list.split(',').filter(Boolean).map(pair => { const [name, type] = pair.split(':'); return `${name} => ${type === 'jsonb' ? `(${json}::jsonb -> '${name}')` : `(${json}::jsonb ->> '${name}')::${type}`}`; }).join(', ')})`;
        try {
          const out = psql(`begin; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);\n${isVoid === 'true' ? `select ${call}; select 'null'` : `select coalesce(to_jsonb(${call})::text, 'null')`};\ncommit;`).split('\n').pop();
          return send(response, 200, JSON.parse(out || 'null'));
        } catch (error) { const e = failure(error); return send(response, e.code === '42501' ? 403 : 400, e); }
      }
      const upload = /^\/storage\/v1\/object\/gang-claims\/(.+)$/.exec(url.pathname);
      if (upload && request.method === 'POST') {
        const bytes = await body(request), path = decodeURIComponent(upload[1]), type = (request.headers['content-type'] ?? '').split(';')[0];
        if (type.startsWith('multipart/')) return send(response, 400, { statusCode: '400', error: 'Unexpected', message: 'multipart upload not expected' });
        try {
          psql(`begin; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
            insert into storage.objects(bucket_id,name,metadata) values ('gang-claims', ${quote(path)}, jsonb_build_object('size', ${bytes.length}, 'mimetype', ${quote(type)})); commit;`);
        } catch (error) {
          const e = failure(error);
          return e.code === '23505' ? send(response, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
            : send(response, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        }
        stored.set(path, bytes);
        return send(response, 200, { Key: `gang-claims/${path}`, Id: randomUUID() });
      }
      send(response, 404, { message: `not served by the portal gateway: ${request.method} ${url.pathname}` });
    } catch (error) { send(response, 500, { message: String(error) }); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  children.push({ kill: () => server.close() });
  return { port, stored, calls };
}

// --- Next.js -----------------------------------------------------------------------
async function startNext(gatewayPort) {
  const port = await freePort();
  restore = await Promise.all(['tsconfig.json', 'next-env.d.ts'].map(async name => [name, await readFile(join(repository, name), 'utf8')]));
  await rm(join(repository, '.next/e2e'), { recursive: true, force: true });
  const anonKey = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role: 'anon', iss: 'supabase' })).toString('base64url')}.local`;
  let log = '';
  const child = spawn(process.execPath, [join(repository, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: repository, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TILESPEC_E2E_OUTPUT: '1', NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${gatewayPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey, NEXT_TELEMETRY_DISABLED: '1', SUPABASE_SERVICE_ROLE_KEY: '' } });
  child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  children.push(child);
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(`${origin}/subcontractors`)).status < 500) return { origin, log: () => log }; } catch {}
    await wait(1000);
  }
  throw new Error(`Next.js did not start:\n${log}`);
}

const pdf = label => Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

async function main() {
  await startDatabase();
  const { token } = seed();
  const gateway = await startGateway();
  const next = await startNext(gateway.port);
  const { origin } = next;
  // Use a pre-installed Chromium when one is named; otherwise the browser Playwright installed.
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const shot = async name => { if (screenshots) { await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: join(screenshots, `${name}.png`), fullPage: true }); } };
  const text = () => page.locator('body').innerText();
  const overflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label} fits a phone without sideways scrolling`);

  // 1. Without a link the landing page is public but shows nothing private.
  await page.goto(`${origin}/subcontractors`);
  let body = await text();
  assert.match(body, /Generate an invoice/); assert.match(body, /Upload an existing invoice/); assert.match(body, /Review and sign subcontractor agreement/);
  assert.match(body, /Open the personal link/);
  assert.doesNotMatch(body, /Dave|Secret Rival|Supermarket|£/, 'no subcontractor, job or money is shown without a link');
  assert.equal(await page.locator('a[href="/subcontractors/invoice"]').count(), 0, 'the options are not usable without a link');
  await overflow('the landing page'); await shot('01-landing-no-link');
  await page.goto(`${origin}/subcontractors/invoice`);
  assert.equal(new URL(page.url()).pathname, '/subcontractors', 'the invoice page is not reachable without a link');
  await page.goto(`${origin}/subcontractors/access/${'0'.repeat(64)}`);
  assert.match(await text(), /expired or been withdrawn/);
  pass('the landing page is public, shows the three options and exposes no subcontractor, job or money; a guessed link is refused');

  // 2. The personal link opens the portal; its secret is moved out of the address bar.
  await page.goto(`${origin}/subcontractors/access/${token}`);
  assert.equal(new URL(page.url()).pathname, '/subcontractors'); assert.ok(!page.url().includes(token), 'the secret is not left in the address');
  const cookie = (await context.cookies()).find(c => c.name === 'tilespec_subcontractor_link');
  assert.ok(cookie?.httpOnly && cookie.path === '/subcontractors', 'the link is kept in an http-only cookie limited to the portal');
  body = await text();
  assert.match(body, /Hello, Dave/i); assert.match(body, /waiting for your signature/i); assert.match(body, /Account ending 4321/);
  assert.doesNotMatch(body, /87654321|12-34-56|Secret Rival/, 'bank numbers and other subcontractors are never shown');
  assert.equal(await page.locator('a[href="/subcontractors/invoice"]').count(), 0, 'no invoice can be started before the agreement is signed');
  await shot('02-home-agreement-waiting');
  await page.goto(`${origin}/subcontractors/invoice`);
  assert.match(await text(), /sign your subcontractor agreement first/i);
  pass('the personal link opens the portal for that subcontractor only, and invoicing waits for the signed agreement');

  // 3. Reading and signing the agreement.
  await page.goto(`${origin}/subcontractors/agreement`);
  assert.match(await text(), /Standard of work/);
  for (const name of ['confirm_read', 'confirm_authority', 'confirm_electronic']) await page.check(`input[name="${name}"]`);
  await page.fill('input[name="signature_text"]', 'Somebody Else');
  await page.getByRole('button', { name: 'Sign the agreement' }).click();
  await page.getByRole('alert').filter({ hasText: /type your full name again/i }).waitFor();
  assert.equal(psql(`select status from public.subcontractor_agreements where team_id='${ids.team}'`), 'issued', 'a mismatched signature signs nothing');
  await page.fill('input[name="signature_text"]', 'Dave Tiler');
  await overflow('the agreement page'); await shot('03-agreement-sign');
  await page.getByRole('button', { name: 'Sign the agreement' }).click();
  await page.getByText(/Signed by Dave Tiler on/).waitFor();
  assert.equal(psql(`select status || '|' || signer_name || '|' || (evidence_sha256 ~ '^[0-9a-f]{64}$')::text || '|' || (signer_user_agent is not null)::text from public.subcontractor_agreements where team_id='${ids.team}'`),
    'signed|Dave Tiler|true|true');
  const agreementPdf = await context.request.get(`${origin}/subcontractors/agreement/pdf`);
  assert.equal(agreementPdf.headers()['content-type'], 'application/pdf'); assert.ok((await agreementPdf.body()).subarray(0, 5).toString() === '%PDF-');
  pass('the agreement is read and signed on a phone; the signature record and a PDF copy are kept');

  // 4. Generating an invoice: quantities only, priced from the agreed rates.
  await page.goto(`${origin}/subcontractors`);
  await page.locator('a[href="/subcontractors/invoice"]').click();
  await page.waitForURL(/\/subcontractors\/invoice$/);
  assert.equal(await page.locator('input[name*="rate" i]:not([type="hidden"])').count(), 0, 'there is no field in which to type a rate');
  await page.selectOption('select[name="line_area"]', ids.floor);
  await page.fill('input[name="line_quantity"]', '50');
  await page.getByText(/Agreed rate: £20\.00 per m²/).waitFor();
  await page.getByRole('button', { name: '+ Add day rate work' }).click();
  await page.fill('input[name="day_quantity"]', '2'); await page.fill('input[name="day_description"]', 'Making good around the tills');
  await page.fill('input[name="variation_amount"]', '300');
  await page.getByRole('button', { name: '+ Add additional work' }).click();
  await page.fill('input[name="additional_description"]', 'Moved pallets, asked by the site manager'); await page.fill('input[name="additional_amount"]', '120');
  await page.fill('textarea[name="note"]', 'Week 45');
  await overflow('the invoice form'); await shot('04-invoice-form');
  await page.getByRole('button', { name: 'Check my invoice' }).click();
  await page.getByRole('heading', { name: 'Check your invoice' }).waitFor();
  body = await text();
  assert.match(body, /£1,780\.00/); assert.match(body, /Additional work — not yet approved/); assert.match(body, /Approved variation SV-00001/);
  assert.match(body, /Retention held \(5%\)/); assert.match(body, /£338\.20 \(20%\)/); assert.match(body, /£1,352\.80/);
  assert.equal(psql('select count(*) from public.gang_invoices'), '0', 'checking the invoice saves nothing');
  await overflow('the invoice preview'); await shot('05-invoice-preview');
  await page.getByRole('button', { name: 'Send invoice to TileSpec' }).click();
  await page.waitForURL(/\/subcontractors\/sent\//);
  body = await text();
  assert.match(body, /Invoice sent/i); assert.match(body, /GI-\d{5}/); assert.match(body, /not a payment approval/i);
  await overflow('the confirmation'); await shot('06-invoice-sent');
  const invoiceId = page.url().split('/sent/')[1].split('?')[0];
  assert.equal(psql(`select i.status || '|' || i.source || '|' || (i.submitted_by is null)::text || '|' || c.invoice_total || '|' || (c.approved_at is null)::text
    from public.gang_invoices i join public.gang_invoice_commercials c on c.invoice_id=i.id where i.id='${invoiceId}'`), 'awaiting_check|generated|true|1780.00|true');
  assert.equal(psql(`select count(*) from public.gang_verification_requests where invoice_id='${invoiceId}' and resolved_at is null and routed_to='supervisor'`), '1');
  const document = psql(`select object_path from public.gang_invoice_files where invoice_id='${invoiceId}' and kind='invoice' and uploaded_at is not null`);
  assert.equal(gateway.stored.get(document)?.subarray(0, 5).toString(), '%PDF-', 'the generated PDF is stored privately as the invoice document');
  const copy = await context.request.get(`${origin}/subcontractors/invoices/${invoiceId}/pdf`);
  assert.equal(copy.headers()['content-type'], 'application/pdf');
  pass('an invoice is generated from agreed rates, previewed, turned into a PDF and submitted for the supervisor check, never auto-approved');

  // 5. The same completed work cannot be claimed twice.
  await page.goto(`${origin}/subcontractors/invoice`);
  await page.selectOption('select[name="line_area"]', ids.floor); await page.fill('input[name="line_quantity"]', '50');
  await page.getByRole('button', { name: 'Check my invoice' }).click();
  await page.getByRole('alert').filter({ hasText: /already claimed .* still being checked/i }).waitFor();
  pass('a second claim for the same work area is refused while the first is open');

  // 6. Uploading an existing invoice, with its number, date and amount.
  await page.goto(`${origin}/subcontractors/upload`);
  await page.setInputFiles('input[name="file_input"]', { name: 'malware.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00 this is not a PDF') });
  await page.fill('input[name="invoice_number"]', 'DT-77'); await page.fill('input[name="invoice_total"]', '230');
  await page.selectOption('select[name="line_area"]', ids.entrance); await page.fill('input[name="line_quantity"]', '10');
  await page.getByRole('button', { name: 'Send invoice to TileSpec' }).click();
  await page.getByRole('alert').filter({ hasText: /matching file signature/i }).waitFor();
  assert.equal(psql(`select count(*) from public.gang_invoices where source='upload'`), '0', 'a file that is not what it claims to be is refused before anything is saved');
  await page.setInputFiles('input[name="file_input"]', { name: 'invoice-77.pdf', mimeType: 'application/pdf', buffer: pdf('DT-77') });
  await shot('07-upload-form');
  await page.getByRole('button', { name: 'Send invoice to TileSpec' }).click();
  await page.waitForURL(/\/subcontractors\/sent\//);
  const uploadId = page.url().split('/sent/')[1].split('?')[0];
  assert.equal(psql(`select i.status || '|' || i.source || '|' || c.invoice_number || '|' || c.invoice_total from public.gang_invoices i join public.gang_invoice_commercials c on c.invoice_id=i.id where i.id='${uploadId}'`),
    'awaiting_check|upload|DT-77|230.00');
  await page.goto(`${origin}/subcontractors/upload`);
  await page.setInputFiles('input[name="file_input"]', { name: 'again.pdf', mimeType: 'application/pdf', buffer: pdf('a different file') });
  await page.fill('input[name="invoice_number"]', 'dt-77'); await page.fill('input[name="invoice_total"]', '230');
  await page.getByRole('button', { name: '+ Add additional work' }).click();
  await page.fill('input[name="additional_description"]', 'Same invoice sent again'); await page.fill('input[name="additional_amount"]', '230');
  await page.getByRole('button', { name: 'Send invoice to TileSpec' }).click();
  await page.getByRole('alert').filter({ hasText: /Invoice number dt-77 has already been sent/i }).waitFor();
  pass('an existing invoice is uploaded into the same approval process; a disguised file and a duplicate invoice number are refused');

  // 7. Supervisor verifies quantities (no money); the office approves with CIS and retention.
  const line = psql(`select id from public.gang_invoice_lines where invoice_id='${invoiceId}'`);
  const extra = kind => psql(`select id from public.gang_invoice_extras where invoice_id='${invoiceId}' and kind='${kind}'`);
  as(ids.supervisor, `select public.verify_gang_invoice(gen_random_uuid(),'${invoiceId}',2,jsonb_build_object('note','45 m2 laid',
    'lines',jsonb_build_array(jsonb_build_object('line_id','${line}','measured_passed',45,'verified_quantity',45)),
    'extras',jsonb_build_array(jsonb_build_object('extra_id','${extra('day_rate')}','confirmed_quantity',2),jsonb_build_object('extra_id','${extra('variation')}','confirmed_quantity',1),
      jsonb_build_object('extra_id','${extra('additional')}','confirmed_quantity',0,'note','Not instructed'))))`);
  assert.equal(psql(`select status || '|' || (select approved_at is null from public.gang_invoice_commercials where invoice_id='${invoiceId}')::text from public.gang_invoices where id='${invoiceId}'`), 'with_office|true',
    'supervisor verification does not authorise payment');
  await page.goto(`${origin}/subcontractors`);
  assert.match(await text(), /Checked on site · with the office/);
  as(ids.owner, `select public.decide_gang_invoice(gen_random_uuid(),'${invoiceId}',3,'approve',jsonb_build_object('note','5 m2 not laid; pallet moving not instructed',
    'lines',jsonb_build_array(jsonb_build_object('line_id','${line}','approved_quantity',45,'rate',20)),
    'extras',jsonb_build_array(jsonb_build_object('extra_id','${extra('day_rate')}','approved_amount',360),jsonb_build_object('extra_id','${extra('variation')}','approved_amount',300),
      jsonb_build_object('extra_id','${extra('additional')}','approved_amount',0))))`);
  await page.goto(`${origin}/subcontractors`);
  body = await text();
  assert.match(body, /Approved for payment/); assert.match(body, /£1,560\.00/); assert.match(body, /− £78\.00/); assert.match(body, /− £296\.40/); assert.match(body, /£1,185\.60/);
  await overflow('the home page with invoices'); await shot('08-home-approved');
  as(ids.owner, `select public.decide_gang_invoice(gen_random_uuid(),'${invoiceId}',4,'mark_paid','{"paid_amount":1185.60,"payment_reference":"BACS 1"}')`);
  as(ids.owner, `select public.decide_gang_invoice(gen_random_uuid(),'${uploadId}',2,'return','{"note":"The amount does not match your agreed rate"}')`);
  await page.goto(`${origin}/subcontractors`);
  body = await text();
  assert.match(body, /Returned to you to correct/); assert.match(body, /The amount does not match your agreed rate/); assert.match(body, /Send a corrected invoice/);
  await page.getByRole('link', { name: 'Send a corrected invoice' }).click();
  await page.waitForURL(/replaces=/);
  await page.setInputFiles('input[name="file_input"]', { name: 'invoice-77b.pdf', mimeType: 'application/pdf', buffer: pdf('DT-77 corrected') });
  await page.fill('input[name="invoice_total"]', '200');
  await page.getByRole('button', { name: 'Send invoice to TileSpec' }).click();
  await page.waitForURL(/\/subcontractors\/sent\//);
  assert.equal(psql(`select status from public.gang_invoices where id='${uploadId}'`), 'superseded', 'the corrected invoice replaces the returned one, which is kept');
  pass('the supervisor verifies without authorising payment; the office approves with retention and CIS; the subcontractor sees the payment, and corrects a returned invoice');

  // 8. Someone else, and a withdrawn link.
  const stranger = await browser.newContext();
  const refused = await stranger.request.get(`${origin}/subcontractors/invoices/${invoiceId}/pdf`);
  assert.equal(refused.status(), 404, 'an invoice cannot be opened without the subcontractor\'s link');
  await stranger.close();
  as(ids.owner, `select public.revoke_portal_link(id) from public.subcontractor_portal_links where team_id='${ids.team}'`);
  await page.goto(`${origin}/subcontractors`);
  body = await text();
  assert.match(body, /expired or been withdrawn/); assert.doesNotMatch(body, /Dave Tiler|£1,185/i);
  await page.goto(`${origin}/subcontractors/invoice`);
  assert.equal(new URL(page.url()).pathname, '/subcontractors');
  await shot('09-link-withdrawn');
  pass('nothing is reachable without the link, and a withdrawn link stops working at once');

  assert.ok(gateway.calls.length > 20 && gateway.calls.every(name => name.startsWith('portal_')), 'the portal used only its own anonymous functions');
  assert.doesNotMatch(next.log(), /Error:|Unhandled|TypeError/, `no server errors:\n${next.log().slice(-4000)}`);
  console.log('Subcontractor portal end-to-end PASSED');
}

let failed = false;
try { await main(); } catch (error) { failed = true; console.error(error); }
finally {
  await browser?.close().catch(() => {});
  for (const child of children) { try { child.kill('SIGTERM'); } catch {} }
  if (pgBin && work) {
    try { const stop = [join(pgBin, 'pg_ctl'), '-D', join(work, 'data'), '-m', 'immediate', 'stop']; execFileSync(asPostgres.length ? asPostgres[0] : stop[0], asPostgres.length ? [...asPostgres.slice(1), ...stop] : stop.slice(1), { stdio: 'ignore' }); } catch {}
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
  // next dev rewrites these for its own output directory; put the committed versions back.
  for (const [name, content] of restore) await writeFile(join(repository, name), content);
  await rm(join(repository, '.next/e2e'), { recursive: true, force: true }).catch(() => {});
}
process.exit(failed ? 1 : 0);
