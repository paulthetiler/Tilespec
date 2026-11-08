// Commercial accounts (C6) from a job, end to end: real Next.js pages and server actions talk to the
// migrated disposable PostgreSQL under each person's own JWT. The owner records TileSPEC's business
// details and the contract's payment terms, raises an application, previews it, approves and issues
// it, records the certificate, issues the invoice, records the payment, and shares the invoice by a
// revocable link. Supervisors and office users without money access are refused at every layer.
// Every step is checked against what the database saved. Nothing is mocked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const emails = { owner: 'grace.owner@e2e.invalid', supervisor: 'sid.supervisor@e2e.invalid', manager: 'mia.manager@e2e.invalid' };
export const accountsContractId = 'e2e00000-0000-4000-8000-0000000000c6';

export async function runAccounts({ browser, origin, sql, signIn, pass, screenshots, gatewayOrigin, tokenFor }) {
  const job = accountsContractId, errors = [], contexts = [];
  const open = async (email, viewport = { width: 390, height: 844 }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, locale: 'en-GB' }); contexts.push(context);
    const page = await signIn(context, origin, email);
    context.setDefaultTimeout(60000);
    page.on('pageerror', error => errors.push(`${email}: ${String(error).slice(0, 1500)}`));
    page.on('console', message => { if (message.type() === 'error' && !/favicon|status of 404/.test(message.text())) errors.push(`${email}: ${message.text().slice(0, 6000)}`); });
    return page;
  };
  // caret: 'initial' leaves inputs untouched; hiding the caret adds a style that React would report as a hydration difference.
  const shot = async (page, name) => { if (screenshots) await page.screenshot({ path: join(screenshots, `accounts-${name}.png`), fullPage: true, caret: 'initial' }); };
  const value = statement => sql(statement);
  const waitFor = async (statement, expected, message) => {
    for (const deadline = Date.now() + 30000; ;) {
      const actual = value(statement);
      if (actual === expected) return;
      if (Date.now() > deadline) assert.equal(actual, expected, message);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  };
  const pdf = async (page, path) => {
    const response = await page.request.get(`${origin}${path}`);
    assert.equal(response.status(), 200, `${path} opens`);
    assert.equal(response.headers()['content-type'], 'application/pdf');
    assert.equal(response.headers()['cache-control'], 'private, no-store');
    const bytes = await response.body();
    assert.ok(bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 5000, `${path} is a PDF`);
    return bytes;
  };

  // Seeded here, after every other journey, so no earlier journey sees the extra job.
  sql(readFileSync(fileURLToPath(new URL('../tests/e2e/accounts-seed.sql', import.meta.url)), 'utf8'));
  try {
    // Supervisors and office users without money access never see the accounts.
    const supervisor = await open(emails.supervisor);
    await supervisor.goto(`${origin}/admin/contracts/${job}/accounts`);
    assert.doesNotMatch(new URL(supervisor.url()).pathname, /accounts/, 'a supervisor is turned away from the accounts');
    assert.equal(await supervisor.getByText('Accounts and invoicing').count(), 0);
    const rest = async (email, path) => fetch(`${gatewayOrigin}/rest/v1/${path}`, { headers: { authorization: `Bearer ${tokenFor(email)}` } });
    for (const table of ['contract_payment_terms', 'commercial_documents', 'organisation_billing_profiles', 'payment_notices']) {
      const response = await rest(emails.supervisor, `${table}?select=*`);
      const rows = response.ok ? await response.json() : [];
      assert.ok(!response.ok || rows.length === 0, `a supervisor reads no ${table} through the API`);
    }
    const manager = await open(emails.manager);
    await manager.goto(`${origin}/admin/contracts/${job}/accounts`);
    assert.doesNotMatch(new URL(manager.url()).pathname, /accounts/, 'an office user without money access is turned away');
    pass('accounts: supervisors and office users without money access are refused by the page and the database');

    // The owner records TileSPEC's business details. Nothing is pre-filled.
    const owner = await open(emails.owner, { width: 1280, height: 900 });
    await owner.goto(`${origin}/admin/accounts/settings`);
    assert.equal(await owner.getByLabel('Registered company or legal name').inputValue(), '', 'no business name is invented');
    await owner.getByLabel('Registered company or legal name').fill('Journey Tiling Ltd');
    await owner.getByLabel('TileSPEC is registered for VAT').check();
    await owner.getByLabel('VAT registration number').fill('GB 123 4567 89');
    await owner.getByRole('button', { name: 'Save business details' }).click();
    await waitFor("select legal_name||'|'||vat_number from public.organisation_billing_profiles where organisation_id='e2e00000-0000-4000-8000-0000000000a1'",
      'Journey Tiling Ltd|GB123456789', 'business details saved and normalised');
    pass('accounts: the owner records the business details, normalised by the database');

    // The contract's own payment terms.
    await owner.goto(`${origin}/admin/contracts/${job}/accounts`);
    await owner.getByRole('heading', { name: '1. Contract and payment terms' }).waitFor();
    await owner.getByText('Set the payment terms').click();
    await owner.getByLabel('Due date: days after the later of the valuation date and the application').fill('7');
    await owner.getByLabel('Final date for payment: days after the due date').fill('21');
    await owner.getByLabel('Order or subcontract reference').fill('SUB-77');
    await owner.getByRole('button', { name: 'Save payment terms' }).click();
    await waitFor(`select basis||'|'||vat_treatment||'|'||final_payment_days||'|'||order_reference from public.contract_payment_terms where contract_id='${job}'`,
      'interim|standard|21|SUB-77', 'payment terms saved');
    await shot(owner, 'terms');
    pass('accounts: the payment terms are set for this contract only');

    // A draft application, previewed, then approved and issued.
    await owner.goto(`${origin}/admin/contracts/${job}/accounts`);
    await owner.getByLabel('Value of contract works completed to date (£, gross, excluding VAT)').fill('30,000');
    await owner.getByRole('button', { name: 'Save as draft' }).click();
    await waitFor(`select status||'|'||number from public.payment_applications where contract_id='${job}'`, 'draft|1', 'a draft application is saved');
    const application = value(`select id from public.payment_applications where contract_id='${job}'`);
    await owner.goto(`${origin}/admin/contracts/${job}/accounts/applications/${application}`);
    await owner.getByRole('heading', { name: 'Interim application 1' }).waitFor();
    await owner.getByText('£28,500.00').first().waitFor();
    await pdf(owner, `/admin/contracts/${job}/accounts/preview?kind=payment_application&application=${application}`);
    await shot(owner, 'draft');
    await owner.getByLabel('I have checked the figures and the preview').check();
    await owner.getByRole('button', { name: 'Approve and issue payment application' }).click();
    await waitFor(`select a.status||'|'||d.reference from public.payment_applications a join public.commercial_documents d on d.application_id=a.id where a.id='${application}'`,
      'submitted|ACC-1/PA-01', 'approving and issuing submits the application and issues its document');
    pass('accounts: an application is drafted, previewed as a PDF, then approved and issued in one step');

    // The client's certificate, the invoice and the payment.
    await owner.goto(`${origin}/admin/contracts/${job}/accounts/applications/${application}`);
    await owner.getByLabel('Gross value certified to date (£)').fill('30000');
    await owner.getByRole('button', { name: 'Record certificate' }).click();
    await waitFor(`select status||'|'||cert_net from public.payment_applications where id='${application}'`, 'certified|28500.00', 'the certificate is recorded');
    await owner.goto(`${origin}/admin/contracts/${job}/accounts/applications/${application}`);
    await pdf(owner, `/admin/contracts/${job}/accounts/preview?kind=invoice&application=${application}`);
    await owner.getByLabel('I have checked the invoice').check();
    await owner.getByRole('button', { name: 'Approve and issue invoice' }).click();
    await waitFor(`select reference||'|'||net||'|'||vat||'|'||total from public.commercial_documents where kind='invoice' and application_id='${application}'`,
      'INV-00001|28500.00|5700.00|34200.00', 'the invoice charges VAT at 20% on the sum due');
    await owner.goto(`${origin}/admin/contracts/${job}/accounts/applications/${application}`);
    await owner.getByLabel('Cash received (£)').fill('20000');
    await owner.getByRole('button', { name: 'Record payment' }).click();
    await waitFor(`select count(*) from public.payment_receipts where application_id='${application}'`, '1', 'the part payment is recorded');
    await owner.goto(`${origin}/admin/contracts/${job}/accounts/applications/${application}`);
    await owner.locator('[data-account-status="part_paid"]').first().waitFor();
    await owner.getByLabel('Cash received (£)').fill('14200');
    await owner.getByRole('button', { name: 'Record payment' }).click();
    await waitFor(`select sum(amount) from public.payment_receipts where application_id='${application}'`, '34200.00', 'the balance is recorded');
    await owner.goto(`${origin}/admin/contracts/${job}/accounts/applications/${application}`);
    await owner.locator('[data-account-status="paid"]').first().waitFor();
    await shot(owner, 'paid');
    pass('accounts: certified, invoiced with VAT, part-paid and then paid');

    // Download and share. The link opens only that document, and stops working when revoked.
    const invoice = value(`select id from public.commercial_documents where kind='invoice' and application_id='${application}'`);
    await pdf(owner, `/admin/contracts/${job}/accounts/documents/${invoice}?download=1`);
    await owner.goto(`${origin}/admin/contracts/${job}/accounts`);
    const row = owner.locator('[data-document-reference="INV-00001"]');
    await row.getByText('Share a link').click();
    await row.getByRole('button', { name: 'Make a link' }).click();
    const link = await row.getByLabel('Link to INV-00001').inputValue();
    assert.match(link, /\/shared\/documents\/[0-9a-f]{64}$/);
    const shared = await fetch(link.replace(/^https?:\/\/[^/]+/, origin));
    assert.equal(shared.status, 200, 'the shared link opens without signing in');
    assert.equal(shared.headers.get('content-type'), 'application/pdf');
    assert.equal(shared.headers.get('x-robots-tag'), 'noindex, nofollow');
    await owner.goto(`${origin}/admin/contracts/${job}/accounts`);
    await owner.locator('[data-document-reference="INV-00001"]').getByText('Share a link').click();
    await owner.locator('[data-document-reference="INV-00001"]').getByRole('button', { name: 'Revoke link' }).click();
    await waitFor(`select count(*) from public.commercial_document_shares where revoked_at is not null`, '1', 'the link is revoked');
    assert.equal((await fetch(link.replace(/^https?:\/\/[^/]+/, origin))).status, 404, 'a revoked link opens nothing');
    const outsider = await supervisor.request.get(`${origin}/admin/contracts/${job}/accounts/documents/${invoice}`);
    assert.equal(outsider.status(), 404, 'a supervisor cannot open the issued document');
    await shot(owner, 'documents');
    pass('accounts: documents download, and share by a revocable link that opens only that document');

    // On a phone the same screens fit the width; wide tables scroll inside their own frame.
    const phone = await open(emails.owner);
    for (const [path, name] of [[`/admin/contracts/${job}/accounts`, 'phone-accounts'], [`/admin/contracts/${job}/accounts/applications/${application}`, 'phone-application'],
      ['/admin/accounts/settings', 'phone-settings']]) {
      await phone.goto(`${origin}${path}`);
      await phone.getByRole('main').waitFor();
      assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} fits a phone screen`);
      await shot(phone, name);
    }
    pass('accounts: every accounts screen fits a phone without sideways scrolling');

    assert.deepEqual(errors, [], 'no browser errors on the accounts screens');
    pass('accounts: no browser errors on the accounts screens');
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
}
