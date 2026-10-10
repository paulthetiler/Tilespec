-- Test-only Supabase platform surface. Business schema, permissions, triggers,
-- RPCs and RLS all come from the real application migrations.
-- This file must never be applied to a hosted database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant all on storage.objects, storage.buckets to service_role;
grant select on storage.buckets to anon, authenticated;
create function storage.foldername(path text) returns text[] language sql immutable as $$
  select (string_to_array(path, '/'))[1:array_length(string_to_array(path, '/'), 1) - 1]
$$;
create function storage.filename(path text) returns text language sql immutable as $$
  select (string_to_array(path, '/'))[array_length(string_to_array(path, '/'), 1)]
$$;
create function storage.extension(path text) returns text language sql immutable as $$
  select reverse(split_part(reverse(storage.filename(path)), '.', 1))
$$;

create schema test;
grant usage on schema test to anon, authenticated, service_role;
-- Assertions run as the caller, never SECURITY DEFINER.
create function test.assert(condition boolean, description text) returns void
language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'FAIL: %', description;
  end if;
  raise notice 'ok - %', description;
end $$;
create function test.expect_error(statement text, states text[], description text) returns void
language plpgsql as $$
declare actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
  end;
  if actual_state is null then
    raise exception 'FAIL: % (statement succeeded)', description;
  end if;
  if not (actual_state = any(states)) then
    raise exception 'FAIL: % (unexpected SQLSTATE %)', description, actual_state;
  end if;
  raise notice 'ok - %', description;
end $$;
