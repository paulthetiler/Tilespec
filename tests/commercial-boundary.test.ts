import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DAYWORK_COLUMNS, DAYWORK_EVENT_COLUMNS } from "../lib/operations/dayworks";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const filesUnder = (dir: string): string[] => readdirSync(path.join(root, dir)).flatMap(name => {
  const relative = path.join(dir, name);
  return statSync(path.join(root, relative)).isDirectory() ? filesUnder(relative) : /\.(ts|tsx)$/.test(name) ? [relative] : [];
});
const application = [...filesUnder("app"), ...filesUnder("components"), ...filesUnder("lib")];

test("signed-in users read only the site columns of a daywork and its history", () => {
  const columns = DAYWORK_COLUMNS.split(","), events = DAYWORK_EVENT_COLUMNS.split(",");
  for (const hidden of ["commercial_status", "client_status"]) assert.ok(!columns.includes(hidden), hidden);
  assert.ok(!events.includes("snapshot"), "history snapshots stay unread");
  const migration = source("supabase/migrations/20261104090000_supervisor_commercial_boundary.sql");
  const granted = migration.match(/grant select\(([^)]*)\)\s+on public\.dayworks/)![1].replace(/\s/g, "").split(",");
  assert.deepEqual([...granted].sort(), [...columns].sort(), "the app reads exactly the columns the database grants");
  const grantedEvents = migration.match(/grant select\(([^)]*)\)\s+on public\.daywork_events/)![1].replace(/\s/g, "").split(",");
  assert.deepEqual([...grantedEvents].sort(), [...events].sort());
});

test("no application code reads every daywork column or the hidden statuses directly", () => {
  for (const file of application) {
    const text = source(file);
    assert.doesNotMatch(text, /from\("dayworks"\)\.select\("\*"\)/, file);
    assert.doesNotMatch(text, /from\("daywork_events"\)\.select\("\*"\)/, file);
    assert.doesNotMatch(text, /optionalRows\("dayworks", "[^"]*(commercial_status|client_status)/, file);
  }
  const loader = source("lib/operations/daywork-data.ts");
  assert.match(loader, /rows\("dayworks", "number", DAYWORK_COLUMNS\)/);
  assert.match(loader, /rows\("daywork_events", "created_at", DAYWORK_EVENT_COLUMNS\)/);
  assert.match(loader, /options\.office \? supabase\.rpc\("daywork_office_statuses"/, "office statuses are asked for only on the office's behalf");
});

test("supervisor screens ask for office statuses only for the office, and show the client record only to the office", () => {
  const record = source("app/admin/supervisor/sites/[id]/dayworks/[dayworkId]/page.tsx");
  assert.match(record, /const office = canManageContracts\(member\)/);
  assert.match(record, /dayworksFor\(supabase, id, dayworkId, \{ office \}\)/);
  assert.match(record, /\{office && <section className=\{styles\.panel\} aria-label="Client authorisation">/);
  assert.match(record, /goAheadLine\(goAhead\)/, "the site is told plainly whether to go ahead");
  assert.doesNotMatch(record, /daywork\.(commercial_status|client_status)/);
  const list = source("app/admin/supervisor/sites/[id]/commercial/page.tsx");
  assert.match(list, /dayworksFor\(supabase, id, undefined, \{ office: canManageContracts\(member\) \}\)/);
  assert.doesNotMatch(list, /daywork\.(commercial_status|client_status)/);
  assert.match(source("lib/operations/next-actions/snapshot-data.ts"), /\{ office: member\.role === "owner" \|\| member\.role === "contracts_manager" \}/);
});

test("office and money daywork actions are refused in the application before reaching the database", () => {
  const actions = source("app/admin/supervisor/daywork-actions.ts");
  const body = (name: string) => actions.slice(actions.indexOf(`export async function ${name}(`), actions.indexOf("\n}\n", actions.indexOf(`export async function ${name}(`)));
  for (const [name, guard, rpc] of [
    ["decideDayworkAction", "notOffice", "decide_daywork"], ["clientAuthorisationAction", "notOffice", "record_daywork_client_authorisation"],
    ["saveRateAction", "notMoney", "save_daywork_rate"], ["priceDayworkAction", "notMoney", "price_daywork"], ["approveChargeAction", "notMoney", "approve_daywork_charge"],
  ] as const) {
    const text = body(name);
    assert.ok(text.includes(`const refused = ${guard}(member);`), `${name} checks ${guard}`);
    assert.ok(text.indexOf("if (refused) return refused;") < text.indexOf(`.rpc("${rpc}"`), `${name} refuses before calling ${rpc}`);
  }
  assert.match(actions, /canManageContracts\(member\) \? null/);
  assert.match(actions, /canReadFinancial\(member\) \? null/);
});

test("the go-ahead never depends on the internal charge approval", () => {
  const migration = source("supabase/migrations/20261104090000_supervisor_commercial_boundary.sql");
  const goAhead = migration.slice(migration.indexOf("create function private.daywork_go_ahead"), migration.indexOf("$$;", migration.indexOf("create function private.daywork_go_ahead")));
  assert.doesNotMatch(goAhead, /commercial_status/);
  assert.match(goAhead, /office_status='approved'|office_status='awaiting_review'/);
  assert.match(goAhead, /client_authorisation_required\(d\.contract_id/);
});
