// Exercise the actual shared React form outside the production route tree. No
// backend, real credentials, seeded business data or public test route is used.
import { copyFile, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const repository = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'tilespec-form-test-'));
let server, browser;
let log = '';
try {
  await mkdir(join(temporary, 'app'));
  // Copy the exact production component and imports; no test implementation is
  // substituted. Local paths avoid Next resolving an external app's aliases.
  for (const path of ['components/operations/operations-form.tsx', 'app/admin/admin.module.css', 'lib/operations/validation.ts', 'lib/operations/types.ts']) {
    await mkdir(dirname(join(temporary, path)), { recursive: true });
    await copyFile(join(repository, path), join(temporary, path));
  }
  await symlink(join(repository, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ private: true, scripts: { dev: 'next dev' } }));
  await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2017', jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', strict: true, paths: { '@/*': ['./*'] } }, include: ['**/*.tsx'] }));
  await writeFile(join(temporary, 'next.config.mjs'), 'export default {};');
  await writeFile(join(temporary, 'app/layout.tsx'), 'export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}');
  await writeFile(join(temporary, 'app/page.tsx'), `"use client";
import { OperationsForm } from "@/components/operations/operations-form";
import type { ActionState } from "@/lib/operations/types";
async function result(_:ActionState,form:FormData):Promise<ActionState>{
  await new Promise(resolve=>setTimeout(resolve,150));
  return form.get('outcome')==='success'?{success:'Saved test form'}:{error:'Retry test form'};
}
export default function Page(){return <OperationsForm action={result} submitLabel="Save test form">
  <label>Reference<input name="reference" defaultValue="" required /></label>
  <label>Test file<input name="file" type="file" required /></label>
  <label>Outcome<select name="outcome"><option value="error">Error</option><option value="success">Success</option></select></label>
  <input name="request_key" type="hidden" value="stable-test-request" />
</OperationsForm>}`);
  const portServer = net.createServer();
  await new Promise(resolvePort => portServer.listen(0, '127.0.0.1', resolvePort));
  const port = portServer.address().port;
  await new Promise(resolvePort => portServer.close(resolvePort));
  server = spawn(process.execPath, [join(repository, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: temporary, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { log = (log + bytes.toString()).slice(-6000); });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60000;
  while (true) {
    let response;
    try { response = await fetch(origin, { signal: AbortSignal.timeout(5000) }); } catch {}
    if (response?.ok) break;
    if (response?.status >= 500) throw new Error(`Form harness compile failed: ${log}`);
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Form test server failed: ${log}`);
    await new Promise(wait => setTimeout(wait, 200));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(origin);
  const reference = page.getByRole('textbox', { name: 'Reference' });
  const file = page.getByLabel('Test file');
  await reference.fill('TS-NORTH-001');
  await file.setInputFiles({ name: 'inspection.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nform-test') });
  await page.getByRole('button', { name: 'Save test form' }).click();
  await page.getByRole('alert').filter({ hasText: 'Retry test form' }).waitFor();
  assert.equal(await reference.inputValue(), 'TS-NORTH-001');
  assert.equal(await file.evaluate(input => input.files[0].name), 'inspection.pdf');
  assert.equal(await page.locator('input[name="request_key"]').inputValue(), 'stable-test-request');
  console.log('PASS: failed submission preserves fields, selected file and request key for retry');
  await page.getByLabel('Outcome').selectOption('success');
  await page.getByRole('button', { name: 'Save test form' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved test form' }).waitFor();
  await page.waitForFunction(() => document.querySelector('input[name="reference"]').value === '');
  assert.equal(await reference.inputValue(), '');
  assert.equal(await file.evaluate(input => input.files.length), 0);
  console.log('PASS: confirmed success resets create fields and file, preventing unchanged resubmission');
} finally {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    await new Promise(done => { if (server.exitCode !== null) done(); else { server.once('exit', done); setTimeout(done, 3000); } });
  }
  await rm(temporary, { recursive: true, force: true });
}
