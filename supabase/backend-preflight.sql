-- Run only through trusted administration against the explicitly selected
-- project. Read-only catalog inventory; no customer/financial rows or keys.
-- Review results; this script does NOT apply migrations or approve compatibility.
begin transaction read only;
set local statement_timeout = '10s';

select current_database() as database_name, current_user as operator,
       current_setting('server_version') as postgres_version;

select n.nspname as schema_name, c.relname as object_name, c.relkind,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private', 'auth', 'storage', 'supabase_migrations')
  and c.relkind in ('r', 'p', 'v', 'm')
order by n.nspname, c.relname;

select n.nspname as schema_name, t.typname as enum_name,
       array_agg(e.enumlabel order by e.enumsortorder) as labels
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
join pg_catalog.pg_enum e on e.enumtypid = t.oid
where n.nspname in ('public', 'private')
group by n.nspname, t.typname
order by n.nspname, t.typname;

select n.nspname as schema_name, p.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proacl as grants
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
order by n.nspname, p.proname, arguments;

select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
       pn.nspname as function_schema, p.proname as function_name
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_proc p on p.oid = t.tgfoid
join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal and n.nspname in ('public', 'auth', 'storage')
order by n.nspname, c.relname, t.tgname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname in ('public', 'private', 'auth', 'storage')
order by schemaname, tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema in ('public', 'private', 'storage')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_schema, table_name, grantee, privilege_type;

-- Dynamic checks tolerate a new database with no migration ledger/bucket table.
do $inventory$
declare item record;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'Migration ledger absent; inspect schema before applying or marking any migration.';
  else
    for item in execute 'select version from supabase_migrations.schema_migrations order by version'
    loop raise notice 'Applied migration version: %', item.version; end loop;
  end if;
  if to_regclass('storage.buckets') is null then
    raise notice 'Storage schema unavailable; standard Supabase prerequisites not established.';
  else
    for item in execute 'select id, public from storage.buckets order by id'
    loop raise notice 'Storage bucket: %, public: %', item.id, item.public; end loop;
  end if;
end
$inventory$;

rollback;
