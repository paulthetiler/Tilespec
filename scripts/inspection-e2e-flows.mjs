// Real Phase 3A screens, server actions, PostgREST and disposable PostgreSQL.
import assert from 'node:assert/strict';
export async function inspect({ manager, page, site, sql, pass }) {
  const flat = sql("select id from public.work_areas where name='Flat 54'");
  const bathroom = sql(`select id from public.work_areas where name='Bathroom' and parent_id='${flat}'`);
  await manager.goto(`${site}/inspections?location=${flat}`);
  await manager.getByText('Create or revise a location template', { exact: true }).click();
  const templateForm = manager.locator('form').filter({ has: manager.getByRole('button', { name: 'Save template revision' }) });
  await templateForm.getByLabel('Title', { exact: true }).fill('Grout quality');
  await templateForm.locator('select[name=stage]').selectOption('grouting');
  await templateForm.getByLabel('Specification reference', { exact: true }).fill('GROUT-54');
  await templateForm.getByLabel('Specification revision', { exact: true }).fill('A');
  await templateForm.getByLabel('Checklist', { exact: false }).fill('Grout joints filled\n[wet] Wet-area grout specified');
  await templateForm.getByRole('button', { name: 'Save template revision' }).click();
  await templateForm.getByRole('status').filter({ hasText: 'Template revision saved' }).waitFor();
  const template = sql("select id from public.location_inspection_templates where title='Grout quality'");
  assert.ok(template);
  pass('Phase 3A: office creates a specification template on a containing location through the real server action');
  const url = `${site}/inspections?location=${bathroom}&template=${template}`;
  await page.goto(url);
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save inspection', exact: true }) });
  assert.equal(await form.getByLabel('Wet-area grout specified', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Create or revise a location template', { exact: true }).count(), 0, 'supervisor has no template editing controls');
  await form.locator('select[name=status_0]').selectOption('issue');
  await form.getByRole('button', { name: 'Save inspection', exact: true }).click();
  await form.getByRole('alert').filter({ hasText: 'Issue and N/A need a reason' }).waitFor();
  assert.equal(sql('select count(*) from public.location_inspections'), '0');
  await form.getByLabel('Reason / observation for check 1', { exact: false }).fill('Joint beside doorway incomplete');
  await form.locator('input[name=allocation_ids]').first().check();
  let savedRequest;
  // Lose the response after the database saved, then retry the same form/key.
  await page.route('**/*', async route => {
    const request = route.request();
    if (request.method() !== 'POST' || !request.headers()['next-action']) return route.continue();
    savedRequest = { url: request.url(), headers: await request.allHeaders(), body: request.postDataBuffer() };
    const response = await route.fetch();
    await route.fulfill({ response, body: '' });
  });
  await form.getByRole('button', { name: 'Save inspection', exact: true }).click();
  await form.getByRole('alert').filter({ hasText: 'could not confirm this was saved' }).waitFor();
  assert.equal(sql('select count(*) from public.location_inspections'), '1');
  await page.unroute('**/*');
  await form.getByRole('button', { name: 'Save inspection', exact: true }).click();
  await form.getByRole('status').filter({ hasText: 'Inspection saved' }).waitFor();
  assert.equal(sql('select count(*) from public.location_inspections'), '1');
  assert.equal(sql('select count(*) from public.location_inspection_allocations'), '1');
  assert.equal(sql("select workforce_snapshot->'attendance'->0->>'display_name' is not null from public.location_inspection_allocations"), 't');
  await page.reload();
  await page.getByText('Saved inspection history', { exact: true }).waitFor();
  const openObservation = async () => {
    const record = page.locator('details').filter({ has: page.getByText('Grout joints filled: issue — Joint beside doorway incomplete', { exact: true }) }).first();
    if (!await record.evaluate(element => element.open)) await record.locator('summary').first().click();
  };
  await openObservation();
  await page.getByText('Grout joints filled: issue — Joint beside doorway incomplete', { exact: true }).waitFor();
  assert.equal(sql("select actor_name from public.location_inspections"), 'Sid Supervisor');
  // Add later observations only to the disposable database; verify the original
  // record remains accessible beyond the first page of location history.
  sql(`begin; set local role authenticated;
    select set_config('request.jwt.claims','{"sub":"e2e00000-0000-4000-8000-000000000001"}',true);
    select public.record_location_inspection(gen_random_uuid(), jsonb_build_object('contract_id','${site.split('/').at(-1)}',
      'work_area_id','${bathroom}','template_id','${template}', 'answers','[{"status":"pass","note":"Later observation"}]'::jsonb,
      'allocation_ids','[]'::jsonb)) from generate_series(1,50); commit;`);
  await page.reload();
  await page.getByRole('link', { name: 'Earlier inspections', exact: true }).click();
  await openObservation();
  await page.getByText('Grout joints filled: issue — Joint beside doorway incomplete', { exact: true }).waitFor();
  pass('Phase 3A: location history pagination retains access to original records beyond the first 50');
  pass('Phase 3A: conditional checklist, reason validation, actual workforce link, lost-response retry and reloaded history are verified against the database');
  return { url, savedRequest };
}
