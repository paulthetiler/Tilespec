// Proves the office screens use the Supervisor V2 database functions correctly.
// 1. Every supabase.rpc(...) call in the application names a function that
//    exists, passes only its parameters (and all required ones), and is
//    executable by signed-in users. Every column the data loaders select exists.
// 2. The real office server actions run in screen order against a database
//    with every migration applied. Forms are parsed by the real parsers, and
//    each database call is executed as the acting member through row-level
//    security, exactly as Supabase would run it.
// Run by tests/db/office-actions.test.sh; never against a hosted database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { londonDate } from "../../lib/operations/planning";
import type { ActionState } from "../../lib/operations/types";

const [psqlBinary, host, port, database, repository] = process.argv.slice(2);
const connection = ["-X", "-q", "-A", "-t", "-w", "-h", host, "-p", port, "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"];
const pass = (message: string) => console.log(` ok - ${message}`);
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
function query(sql: string): string[] {
  return execFileSync(psqlBinary, connection, { input: sql, encoding: "utf8" }).split("\n").filter(line => line !== "");
}
const value = (sql: string) => query(sql)[0];

// --- 1. Static contract ------------------------------------------------------
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}
type Signature = { args: string[]; required: string[]; executableBy: Set<string> };
const signatures = new Map<string, Signature[]>();
for (const line of query(`select p.proname || '|' || coalesce(array_to_string(p.proargnames[1:p.pronargs], ','), '') || '|' || p.pronargdefaults
    || '|' || has_function_privilege('authenticated', p.oid, 'execute') || '|' || has_function_privilege('service_role', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)) {
  const [name, argList, defaults, signedIn, service] = line.split("|");
  const args = argList ? argList.split(",") : [];
  const executableBy = new Set([...(signedIn === "true" ? ["authenticated"] : []), ...(service === "true" ? ["service_role"] : [])]);
  signatures.set(name, [...(signatures.get(name) ?? []), { args, required: args.slice(0, args.length - Number(defaults)), executableBy }]);
}
const columns = new Map<string, Set<string>>();
for (const line of query(`select table_name || '|' || column_name from information_schema.columns where table_schema = 'public'`)) {
  const [table, column] = line.split("|");
  columns.set(table, (columns.get(table) ?? new Set()).add(column));
}
const readable = new Set(query(`select r.rolname || ':' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join pg_roles r where r.rolname in ('authenticated', 'service_role') and n.nspname = 'public' and c.relkind in ('r', 'v')
    and has_table_privilege(r.rolname, c.oid, 'select')`));

// The upload verifier is the one server-side client with the service role.
const rpcCalls: { file: string; name: string; keys: string[]; role: string }[] = [];
// Screens read through the signed-in member's own client, named supabase; the
// server-only tender inbox reads through a service-role client.
const selects: { file: string; table: string; list: string; role: string }[] = [];
for (const file of ["app", "lib", "components"].flatMap(directory => sources(join(repository, directory)))) {
  const text = readFileSync(file, "utf8");
  const constants = new Map([...text.matchAll(/const (\w+) = "([^"]*)";/g)].map(match => [match[1], match[2]]));
  for (const line of text.split("\n")) {
    for (const match of line.matchAll(/(\w+)\.rpc\("(\w+)",\s*\{(.*)/g)) {
      rpcCalls.push({ file: relative(repository, file), name: match[2], keys: [...match[3].matchAll(/\b(p_\w+)\s*:/g)].map(key => key[1]),
        role: match[1] === "verifier" ? "service_role" : "authenticated" });
    }
  }
  for (const match of text.matchAll(/(\w+)\.from\("(\w+)"\)\s*\.select\((?:"([^"]*)"|(\w+))\)/g)) {
    const list = match[3] ?? constants.get(match[4]);
    if (list && !list.includes("*") && !list.includes("(")) {
      selects.push({ file: relative(repository, file), table: match[2], list, role: match[1] === "supabase" ? "authenticated" : "service_role" });
    }
  }
}
assert.ok(rpcCalls.length >= 25, `expected the application's database calls, found ${rpcCalls.length}`);
for (const call of rpcCalls) {
  const found = signatures.get(call.name);
  assert.ok(found, `${call.file}: public.${call.name} does not exist`);
  assert.equal(found.length, 1, `${call.file}: public.${call.name} is overloaded; named calls would be ambiguous`);
  const [signature] = found;
  assert.ok(signature.executableBy.has(call.role), `${call.file}: ${call.role} cannot execute public.${call.name}`);
  for (const key of call.keys) assert.ok(signature.args.includes(key), `${call.file}: public.${call.name} has no parameter ${key}`);
  for (const key of signature.required) assert.ok(call.keys.includes(key), `${call.file}: public.${call.name} call is missing ${key}`);
}
pass(`all ${rpcCalls.length} database function calls in the application match an existing function's parameters and are executable by the calling role`);
assert.ok(selects.length >= 10, `expected the data loaders' column lists, found ${selects.length}`);
for (const select of selects) {
  assert.ok(readable.has(`${select.role}:${select.table}`), `${select.file}: ${select.role} cannot read public.${select.table}`);
  for (const column of select.list.split(",").map(item => item.trim())) {
    assert.ok(columns.get(select.table)?.has(column), `${select.file}: public.${select.table} has no column ${column}`);
  }
}
pass(`all ${selects.length} column lists the screens read exist, on tables the reading role can read`);

// --- 2. The real office actions, run in screen order ---------------------------
const ids = {
  org: "a7000000-0000-4000-8000-000000000001", contract: "a7000000-0000-4000-8000-000000000002",
  manager: "a7100000-0000-4000-8000-000000000001", supervisor: "a7100000-0000-4000-8000-000000000002",
};
type Call = { name: string; args: Record<string, unknown> };
const calls: Call[] = [];
function argument(input: unknown) {
  if (input === null || input === undefined) return "null";
  if (typeof input === "number" || typeof input === "boolean") return String(input);
  return literal(typeof input === "string" ? input : JSON.stringify(input));
}
// Each call is its own transaction as the member, as PostgREST runs it.
function clientFor(userId: string) {
  return {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const named = Object.entries(args).map(([key, item]) => `${key} => ${argument(item)}`).join(", ");
      const sql = `\\set VERBOSITY verbose\nbegin;\nset local role authenticated;\nselect set_config('request.jwt.claims', ${literal(JSON.stringify({ sub: userId }))}, true) is not null;\nselect public.${name}(${named});\ncommit;\n`;
      try {
        const result = execFileSync(psqlBinary, connection, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).split("\n")[1] ?? "";
        const data = result === "" ? null : /^\{.*\}$/.test(result) ? result.slice(1, -1).split(",") : /^-?\d+$/.test(result) ? Number(result) : result;
        return { data, error: null };
      } catch (failure) {
        const stderr = String((failure as { stderr?: string }).stderr ?? failure);
        const match = /ERROR:\s+([0-9A-Z]{5}): (.*)/.exec(stderr);
        return { data: null, error: { code: match?.[1] ?? "XX000", message: match?.[2] ?? stderr } };
      }
    },
  };
}
function actAs(userId: string, role: string) {
  (globalThis as { officeActor?: unknown }).officeActor = {
    supabase: clientFor(userId),
    member: { organisation_id: ids.org, user_id: userId, display_name: role, role, financial_access: false, active: true },
  };
}
const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, item] of Object.entries(values)) for (const entry of [item].flat()) data.append(key, entry);
  return data;
};
const key = (n: number) => `a7200000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Action = (state: ActionState, data: FormData) => Promise<ActionState>;
const used = new Set<string>();
async function submit(name: string, action: Action, values: Record<string, string | string[]>) {
  used.add(name);
  const before = calls.length;
  const result = await action({}, form(values));
  assert.ok(calls.length > before, `${name} did not call the database`);
  return result;
}
async function ok(name: string, action: Action, values: Record<string, string | string[]>) {
  const result = await submit(name, action, values);
  assert.ok(result.success && !result.error, `${name} failed: ${result.error}`);
  return result.success;
}
const idOf = (sql: string) => { const found = value(sql); assert.ok(found, `no record for: ${sql}`); return found; };

async function main() {
  const actions = await import("../../app/admin/office-actions");
  const today = londonDate();
  actAs(ids.manager, "contracts_manager");

  // Companies: created once, edited, insured and accredited.
  const companyForm = { request_key: key(1), name: "  Smith   Tiling Ltd ", contact_name: "Sam Smith", contact_phone: "07700 900123", contact_email: "office@smith.example", company_number: "", address: "", notes: "" };
  await ok("createCompanyAction", actions.createCompanyAction, companyForm);
  await ok("createCompanyAction", actions.createCompanyAction, companyForm);
  const smith = idOf("select id from public.subcontractor_companies where name = 'Smith Tiling Ltd'");
  assert.equal(value("select count(*) from public.subcontractor_companies"), "1");
  const duplicate = await submit("createCompanyAction", actions.createCompanyAction, { ...companyForm, request_key: key(2), name: "SMITH TILING LTD" });
  assert.equal(duplicate.error, "A company called Smith Tiling Ltd is already on record");
  await ok("createCompanyAction", actions.createCompanyAction, { ...companyForm, request_key: key(3), name: "Site Labour Agency", contact_email: "" });
  const agency = idOf("select id from public.subcontractor_companies where name = 'Site Labour Agency'");
  await ok("updateCompanyAction", actions.updateCompanyAction, { company_id: smith, version: "1", name: "Smith Tiling Ltd", contact_name: "Sam Smith", contact_phone: "0113 496 0000",
    contact_email: "office@smith.example", company_number: "01234567", address: "1 Yard Lane", notes: "", active: "on" });
  await ok("recordInsuranceAction", actions.recordInsuranceAction, { request_key: key(4), company_id: smith, insurance_type: "public_liability", expires_on: "2027-06-30",
    starts_on: "2026-07-01", insurer: "Example Mutual", policy_number: "PL-1", cover_amount: "£10,000,000" });
  await ok("recordInsuranceAction", actions.recordInsuranceAction, { request_key: key(5), company_id: smith, insurance_type: "employers_liability", expires_on: "2027-01-31" });
  await ok("recordAccreditationAction", actions.recordAccreditationAction, { request_key: key(6), company_id: smith, scheme: "CHAS", reference: "CH-778", expires_on: "2027-03-31" });
  await ok("recordAccreditationAction", actions.recordAccreditationAction, { request_key: key(7), company_id: smith, scheme: "Wrong scheme", reference: "" });
  await ok("voidInsuranceAction", actions.voidInsuranceAction, { record_id: idOf("select id from public.company_insurances where insurance_type = 'employers_liability'"), reason: "Recorded against the wrong company" });
  await ok("voidAccreditationAction", actions.voidAccreditationAction, { record_id: idOf("select id from public.company_accreditations where scheme = 'Wrong scheme'"), reason: "Recorded by mistake" });
  assert.equal(value(`select contact_phone || '|' || company_number || '|' || version from public.subcontractor_companies where id = '${smith}'`), "0113 496 0000|01234567|2");
  assert.equal(value(`select cover_amount from public.company_insurances where company_id = '${smith}' and voided_at is null`), "10000000");
  pass("companies are created once (a retry adds nothing), edited, insured and accredited through the real office actions");

  // Gangs and operatives linked by company ID; one company, two gangs.
  await ok("createTeamAction", actions.createTeamAction, { request_key: key(10), name: "Smith Gang A", kind: "subcontract_gang", company_id: smith });
  await ok("createTeamAction", actions.createTeamAction, { request_key: key(11), name: "Smith Gang B", kind: "subcontract_gang", company_id: smith });
  await ok("createTeamAction", actions.createTeamAction, { request_key: key(12), name: "Direct Team", kind: "direct_team", company_id: smith });
  const gangA = idOf("select id from public.teams where name = 'Smith Gang A'"), gangB = idOf("select id from public.teams where name = 'Smith Gang B'");
  await ok("createOperativeAction", actions.createOperativeAction, { request_key: key(13), display_name: "Sam Smith", engagement: "subcontractor", company_id: smith, user_id: "" });
  await ok("createOperativeAction", actions.createOperativeAction, { request_key: key(14), display_name: "Lee Hart", engagement: "subcontractor", company_id: smith, user_id: "" });
  await ok("createOperativeAction", actions.createOperativeAction, { request_key: key(15), display_name: "Dan Price", engagement: "direct_employee", company_id: smith, user_id: "" });
  const sam = idOf("select id from public.operatives where display_name = 'Sam Smith'"), lee = idOf("select id from public.operatives where display_name = 'Lee Hart'");
  actAs(ids.supervisor, "supervisor");
  await ok("createOperativeAction", actions.createOperativeAction, { request_key: key(16), display_name: "Ava Kerr", engagement: "agency", company_id: agency });
  actAs(ids.manager, "contracts_manager");
  const ava = idOf("select id from public.operatives where display_name = 'Ava Kerr'");
  await ok("confirmOperativeAction", actions.confirmOperativeAction, { operative_id: ava, version: "1" });
  await ok("updateOperativeAction", actions.updateOperativeAction, { operative_id: lee, version: "1", display_name: "Lee Hart", engagement: "subcontractor", company_id: smith, user_id: "", status: "active" });
  await ok("updateTeamAction", actions.updateTeamAction, { team_id: gangB, version: "1", name: "Smith Gang B (Level 5)", kind: "subcontract_gang", company_id: smith, active: "on" });
  await ok("addTeamMemberAction", actions.addTeamMemberAction, { request_key: key(17), team_id: gangA, operative_id: sam, valid_from: today, is_lead: "on" });
  await ok("addTeamMemberAction", actions.addTeamMemberAction, { request_key: key(18), team_id: gangB, operative_id: lee, valid_from: today, is_lead: "on" });
  await ok("addTeamMemberAction", actions.addTeamMemberAction, { request_key: key(19), team_id: gangB, operative_id: ava, valid_from: today });
  await ok("addTeamMemberAction", actions.addTeamMemberAction, { request_key: key(20), team_id: gangA, operative_id: ava, valid_from: today });
  await ok("voidMembershipAction", actions.voidMembershipAction, { membership_id: idOf(`select id from public.team_memberships where team_id = '${gangA}' and operative_id = '${ava}'`), reason: "Added to the wrong gang" });
  await ok("endMembershipAction", actions.endMembershipAction, { membership_id: idOf(`select id from public.team_memberships where team_id = '${gangB}' and operative_id = '${ava}'`), valid_until: today, reason: "" });
  assert.equal(value(`select string_agg(name, ',' order by name) from public.teams where company_id = '${smith}'`), "Smith Gang A,Smith Gang B (Level 5)");
  assert.equal(value("select coalesce(company_id::text, 'none') from public.operatives where display_name = 'Dan Price'"), "none");
  assert.equal(value("select coalesce(company_id::text, 'none') from public.teams where name = 'Direct Team'"), "none");
  assert.equal(value(`select status || '|' || company_id from public.operatives where id = '${ava}'`), `active|${agency}`);
  pass("gangs and operatives are linked to their company by ID, a supervisor's provisional operative is confirmed, and membership changes keep history");

  // Locations and planning on a contract.
  await ok("createLocationsAction", actions.createLocationsAction, { contract_id: ids.contract, request_key: key(30), parent_id: "", mode: "series", label: "Flat", from: "51", to: "52", names: "", rooms: "Bathroom\nKitchen" });
  assert.equal(value(`select count(*) from public.work_areas where contract_id = '${ids.contract}'`), "6");
  const flat51 = idOf(`select id from public.work_areas where contract_id = '${ids.contract}' and name = 'Flat 51'`);
  await ok("updateLocationAction", actions.updateLocationAction, { contract_id: ids.contract, location_id: flat51, version: "1", name: "Flat 51A", location_type: "Flat", code: "51A", description: "", substrate_notes: "Sand and cement screed", system_notes: "", parent_id: "" });
  const archived = await ok("archiveLocationAction", actions.archiveLocationAction, { contract_id: ids.contract, location_id: idOf(`select id from public.work_areas where contract_id = '${ids.contract}' and name = 'Flat 52'`), version: "1", reason: "Flat removed from scope" });
  assert.equal(archived, "Archived this location and 2 inside it. Its records are kept.");
  const bathroom = idOf(`select id from public.work_areas where parent_id = '${flat51}' and name = 'Bathroom'`);
  await ok("planAllocationAction", actions.planAllocationAction, { contract_id: ids.contract, request_key: key(31), work_area_id: bathroom, team_id: gangA, stage: "installation", planned_start: today, planned_end: "", operative_ids: [sam], instructions: "Bathroom first" });
  const plan = idOf(`select id from public.planned_allocations where team_id = '${gangA}'`);
  await ok("planAllocationAction", actions.planAllocationAction, { contract_id: ids.contract, request_key: key(32), supersedes_id: plan, work_area_id: flat51, team_id: gangA, stage: "grouting", planned_start: today, planned_end: "", operative_ids: [sam], instructions: "" });
  await ok("cancelPlanAction", actions.cancelPlanAction, { contract_id: ids.contract, plan_id: idOf(`select id from public.planned_allocations where supersedes_id = '${plan}'`), reason: "Area not ready" });
  assert.equal(value(`select string_agg(stage || ':' || (superseded_by is not null) || ':' || (cancelled_at is not null), ',' order by created_at) from public.planned_allocations`), "installation:true:false,grouting:false:true");
  pass("locations are built, edited and archived, and work is planned, revised and cancelled, through the real office actions");

  // Database rules reach the screen as written for people.
  const blocked = await submit("updateCompanyAction", actions.updateCompanyAction, { company_id: smith, version: "2", name: "Smith Tiling Ltd", active: "" });
  assert.equal(blocked.error, "This company still has 2 active teams and 2 active operatives. Deactivate them or link them to another company first.");
  const stale = await submit("updateTeamAction", actions.updateTeamAction, { team_id: gangB, version: "1", name: "Stale", kind: "subcontract_gang", company_id: smith, active: "on" });
  assert.equal(stale.error, "Team changed; reload before saving");
  pass("database refusals (an active company, a stale screen) are shown to the person as written, never as raw PostgreSQL text");

  const exported = Object.keys(actions).filter(name => name.endsWith("Action"));
  assert.deepEqual(exported.filter(name => !used.has(name)), [], "every office action is exercised");
  const names = new Set(rpcCalls.filter(call => call.file === "app/admin/office-actions.ts").map(call => call.name));
  assert.deepEqual([...names].filter(name => !calls.some(call => call.name === name)), [], "every database function the office actions call was executed");
  assert.ok(((globalThis as { revalidated?: string[] }).revalidated ?? []).includes("/admin/workforce"));
  pass(`all ${exported.length} office actions ran against the migrated database, calling ${names.size} distinct database functions as the signed-in member`);
}
main().catch(error => { console.error(error); process.exit(1); });
