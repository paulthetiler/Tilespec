-- Public tender enquiries, the office tender inbox and shared document links without a
-- service-role key.
--
-- These three features were written to run through a server holding the Supabase service-role
-- key. Production holds no such key, so none of them worked. This migration replaces the key with
-- narrow, checked database functions and policies:
--
--   * A visitor's enquiry is recorded by submit_tender_enquiry, which validates every field,
--     limits how many enquiries can arrive in an hour, and reserves the exact file paths.
--   * A visitor may store a file only at a path reserved by an enquiry that is still being
--     sent, and can never read, list, replace or delete anything.
--   * complete_tender_enquiry needs the one-time token returned to that visitor and confirms
--     every reserved file arrived at its declared size.
--   * Only the owner and contracts managers can read enquiries and their files.
--   * A shared document link is opened with its 256-bit secret token, as before; the function
--     that checks the token (live, not revoked, not expired) may now be called without the key.
--
-- These four functions are the only application functions an anonymous visitor may call. No
-- existing row is changed. The enquiry table and bucket are created here if the earlier
-- tender_enquiries migration was never applied to this project.
begin;
do $$ begin
 if to_regprocedure('public.submit_tender_enquiry(jsonb)') is not null or to_regprocedure('public.complete_tender_enquiry(uuid,text)') is not null then
  raise exception 'Preflight failed: public intake without a service key is already installed';
 end if;
 if to_regprocedure('public.shared_commercial_document(text)') is null or to_regprocedure('private.current_role()') is null then
  raise exception 'Preflight failed: the commercial accounts migration must be applied first';
 end if;
end $$;

create table if not exists public.tender_enquiries (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique,
 kind text not null check (kind in ('tender','general')),
 name text not null,
 company text not null default '',
 email text not null,
 project text not null default '',
 deadline date,
 message text not null default '',
 status text not null default 'uploading' check (status in ('uploading','received','reviewing','pricing','declined','submitted')),
 token_hash text not null,
 attachments jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 received_at timestamptz
);
alter table public.tender_enquiries enable row level security;
revoke all on public.tender_enquiries from anon, authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tilespec-tenders','tilespec-tenders',false,26214400,null)
on conflict (id) do nothing;
create index if not exists tender_enquiries_received_idx on public.tender_enquiries(received_at desc);
create index if not exists tender_enquiries_created_idx on public.tender_enquiries(created_at desc);

-- ---------------------------------------------------------------------------------------------
-- 1. A visitor sends an enquiry.
-- ---------------------------------------------------------------------------------------------
create function public.submit_tender_enquiry(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid := gen_random_uuid();
 v_token text := replace(gen_random_uuid()::text,'-','') || substr(replace(gen_random_uuid()::text,'-',''),1,16);
 v_kind text; v_name text; v_email text; v_deadline date; v_files jsonb := '[]'::jsonb; f jsonb; v_filename text; v_ext text; v_size bigint; v_path text;
begin
 if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid enquiry' using errcode='22023'; end if;
 -- A burst of enquiries is refused rather than filling the inbox or storage.
 if (select count(*) from public.tender_enquiries where created_at > now() - interval '1 hour') >= 30
   or (select count(*) from public.tender_enquiries where created_at > now() - interval '1 day') >= 200 then
  raise exception 'Too many enquiries have been received. Please email us instead.' using errcode='53400'; end if;
 v_kind := case when p_data->>'kind' = 'general' then 'general' else 'tender' end;
 v_name := left(btrim(coalesce(p_data->>'name','')),120);
 v_email := left(btrim(coalesce(p_data->>'email','')),200);
 if v_name = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Name and a valid email are required' using errcode='22023'; end if;
 if coalesce(p_data->>'deadline','') ~ '^\d{4}-\d{2}-\d{2}$' then
  begin v_deadline := (p_data->>'deadline')::date; exception when others then v_deadline := null; end;
 end if;
 if p_data ? 'files' and jsonb_typeof(p_data->'files') = 'array' then
  if jsonb_array_length(p_data->'files') > 10 then raise exception 'Maximum 10 files' using errcode='22023'; end if;
  for f in select * from jsonb_array_elements(p_data->'files') loop
   v_filename := left(regexp_replace(btrim(coalesce(f->>'name','')),'[\\/[:cntrl:]]','_','g'),180);
   v_ext := lower(substring(v_filename from '\.([A-Za-z0-9]+)$'));
   if coalesce(f->>'size','') !~ '^\d{1,9}$' then raise exception 'Unsupported file or file too large' using errcode='22023'; end if;
   v_size := (f->>'size')::bigint;
   if v_ext is null or v_ext not in ('pdf','dwg','dxf','doc','docx','xls','xlsx','zip','jpg','jpeg','png') or v_size < 1 or v_size > 26214400 then
    raise exception 'Unsupported file or file too large' using errcode='22023'; end if;
   v_path := v_id::text || '/' || gen_random_uuid()::text || '.' || v_ext;
   v_files := v_files || jsonb_build_object('name',v_filename,'size',v_size,'type',left(btrim(coalesce(f->>'type','')),100),'path',v_path);
  end loop;
 end if;
 insert into public.tender_enquiries(id,reference,kind,name,email,company,project,message,deadline,token_hash,attachments)
 values(v_id,'TS-'||upper(substr(v_id::text,1,8)),v_kind,v_name,v_email,left(btrim(coalesce(p_data->>'company','')),160),
  left(btrim(coalesce(p_data->>'project','')),200),left(btrim(coalesce(p_data->>'message','')),3000),v_deadline,
  encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_files);
 -- The token is returned once, here, and only its fingerprint is kept.
 return jsonb_build_object('id',v_id,'token',v_token,'reference','TS-'||upper(substr(v_id::text,1,8)),
  'files',(select coalesce(jsonb_agg(jsonb_build_object('path',a->>'path','type',a->>'type')),'[]'::jsonb) from jsonb_array_elements(v_files) a));
end $$;

-- A file may be stored only at a path reserved by an enquiry that is still being sent.
create function private.can_upload_tender_file(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tender_enquiries e, jsonb_array_elements(e.attachments) a
  where e.id::text = split_part(p_path,'/',1) and e.status = 'uploading' and e.created_at > now() - interval '2 hours' and a->>'path' = p_path)
$$;

create function public.complete_tender_enquiry(p_id uuid,p_token text) returns text
language plpgsql security definer set search_path='' as $$
declare e public.tender_enquiries;
begin
 if p_id is null or p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'Invalid submission' using errcode='42501'; end if;
 select * into e from public.tender_enquiries where id = p_id for update;
 if not found or e.token_hash is distinct from encode(sha256(convert_to(p_token,'UTF8')),'hex') then
  raise exception 'Invalid submission' using errcode='42501'; end if;
 if e.status = 'received' then return 'received'; end if;
 if e.status <> 'uploading' then raise exception 'Invalid status' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(e.attachments) a where not exists(select 1 from storage.objects o
   where o.bucket_id = 'tilespec-tenders' and o.name = a->>'path' and o.metadata->>'size' = a->>'size')) then
  return 'pending'; end if;
 update public.tender_enquiries set status = 'received', received_at = now() where id = e.id;
 return 'received';
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. The office reads the inbox in its own signed-in session.
-- ---------------------------------------------------------------------------------------------
grant select (id,reference,kind,name,company,email,project,deadline,message,status,attachments,created_at,received_at)
 on public.tender_enquiries to authenticated;
create policy tender_enquiries_office_read on public.tender_enquiries for select to authenticated using (
 coalesce(private.current_role()::text in ('owner','contracts_manager'), false));

create policy tender_files_visitor_insert on storage.objects for insert to anon with check (
 bucket_id = 'tilespec-tenders' and private.can_upload_tender_file(name));
create policy tender_files_office_read on storage.objects for select to authenticated using (
 bucket_id = 'tilespec-tenders' and coalesce(private.current_role()::text in ('owner','contracts_manager'), false));
-- No UPDATE or DELETE policy: a stored enquiry file is never replaced or removed through the API.

-- ---------------------------------------------------------------------------------------------
-- 3. Grants. These are the only application functions an anonymous visitor may call.
-- ---------------------------------------------------------------------------------------------
grant usage on schema private to anon;
-- The enquiry form always runs signed out, so signed-in roles are given nothing here.
revoke all on function public.submit_tender_enquiry(jsonb), public.complete_tender_enquiry(uuid,text), private.can_upload_tender_file(text) from public, authenticated;
grant execute on function public.submit_tender_enquiry(jsonb), public.complete_tender_enquiry(uuid,text), private.can_upload_tender_file(text) to anon;
-- Whoever holds a live link may open that one document, and nothing else.
grant execute on function public.shared_commercial_document(text) to anon;
commit;
