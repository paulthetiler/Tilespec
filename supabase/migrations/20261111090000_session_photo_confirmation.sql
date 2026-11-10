-- Snag, stop (hold) and daywork photographs, and office document uploads, are confirmed with the
-- uploader's own session.
--
-- Until now a photograph could only be marked as saved by a server holding the service-role key.
-- Production deliberately has no such key, so every snag, stop and daywork photograph and every office
-- document upload failed.
-- This migration lets the person who reserved a photograph confirm it themselves, exactly as gang
-- invoice files already work, with every check enforced here in the database:
--   * only the person who reserved the photograph, and only while they still hold permission on
--     that job and the record is still in the same repair/correction cycle;
--   * only when the reserved fingerprint is quoted and the stored object has the reserved size
--     and type;
--   * a retry never moves the original confirmation time.
-- The service-role complete_*_photo functions are left exactly as they were. No table, row or
-- stored photograph is changed.
begin;
do $$ begin
 if to_regprocedure('public.confirm_snag_photo(uuid,text)') is not null or to_regprocedure('public.confirm_hold_photo(uuid,text)') is not null
   or to_regprocedure('public.confirm_daywork_photo(uuid,text)') is not null or to_regprocedure('public.confirm_document_upload(uuid,text)') is not null then
  raise exception 'Preflight failed: session photograph confirmation is already installed';
 end if;
 if to_regprocedure('private.can_upload_snag_photo(uuid,text)') is null or to_regprocedure('private.can_upload_hold_photo(uuid,text)') is null
   or to_regprocedure('private.can_upload_daywork_photo(uuid,text)') is null then
  raise exception 'Preflight failed: the snag, hold and daywork photograph migrations must be applied first';
 end if;
end $$;

-- The uploader may read back their own not-yet-confirmed object (to check its bytes). Everyone
-- else still sees a photograph only once it is confirmed and only with access to that job.
create or replace function private.can_read_issue_object(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.supervisor_issue_photos p where p.object_path=p_path
   and ((p.purpose is not null and p.uploaded_at is not null and private.can_read_snag(p.issue_id))
     or (p.purpose is not null and p.uploaded_at is null and p.actor_id=auth.uid() and private.can_upload_snag_photo(p.issue_id,p.purpose))
     or (p.purpose is null and private.can_read_snag(p.issue_id))))
$$;
create or replace function private.can_read_hold_object(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hold_photos p where p.object_path=p_path
   and ((p.uploaded_at is not null and private.can_read_work_hold(p.hold_id))
     or (p.uploaded_at is null and p.actor_id=auth.uid() and private.can_upload_hold_photo(p.hold_id,p.purpose))))
$$;
create or replace function private.can_read_daywork_object(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.daywork_photos p where p.object_path=p_path
   and ((p.uploaded_at is not null and private.can_read_daywork(p.daywork_id))
     or (p.uploaded_at is null and p.actor_id=auth.uid() and private.can_upload_daywork_photo(p.daywork_id,p.purpose))))
$$;

create function public.confirm_snag_photo(p_photo uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.supervisor_issue_photos;
begin
 select * into p from public.supervisor_issue_photos where id=p_photo for update;
 if not found or auth.uid() is null or p.purpose is null or p.actor_id is distinct from auth.uid()
   or p.organisation_id is distinct from private.current_org() or p.sha256 is distinct from p_sha256 then
  raise exception 'Photograph reservation unavailable' using errcode='42501'; end if;
 if p.uploaded_at is not null then return; end if;
 if not private.can_upload_snag_photo(p.issue_id,p.purpose) or not exists(select 1 from public.supervisor_issues i where i.id=p.issue_id and i.repair_cycle=p.repair_cycle) then
  raise exception 'Uploader no longer has permission for this repair cycle' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path
   and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
  raise exception 'Photograph missing or stored metadata differs from reservation' using errcode='23514'; end if;
 update public.supervisor_issue_photos set uploaded_at=now() where id=p.id;
end $$;

create function public.confirm_hold_photo(p_photo uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.hold_photos;
begin
 select * into p from public.hold_photos where id=p_photo for update;
 if not found or auth.uid() is null or p.actor_id is distinct from auth.uid()
   or p.organisation_id is distinct from private.current_org() or p.sha256 is distinct from p_sha256 then
  raise exception 'Photograph reservation unavailable' using errcode='42501'; end if;
 if p.uploaded_at is not null then return; end if;
 if not private.can_upload_hold_photo(p.hold_id,p.purpose) or not exists(select 1 from public.work_holds h where h.id=p.hold_id and h.correction_cycle=p.correction_cycle) then
  raise exception 'Uploader no longer has permission for this correction cycle' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path
   and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
  raise exception 'Stored photograph does not match the reservation' using errcode='23514'; end if;
 update public.hold_photos set uploaded_at=now() where id=p.id;
end $$;

create function public.confirm_daywork_photo(p_photo uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.daywork_photos;
begin
 select * into p from public.daywork_photos where id=p_photo for update;
 if not found or auth.uid() is null or p.actor_id is distinct from auth.uid()
   or p.organisation_id is distinct from private.current_org() or p.sha256 is distinct from p_sha256 then
  raise exception 'Photograph reservation unavailable' using errcode='42501'; end if;
 if p.uploaded_at is not null then return; end if;
 if not private.can_upload_daywork_photo(p.daywork_id,p.purpose) then
  raise exception 'Uploader no longer has permission for this daywork' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='supervisor-evidence' and name=p.object_path
   and metadata->>'size'=p.bytes::text and metadata->>'mimetype'=p.mime_type) then
  raise exception 'Stored photograph does not match the reservation' using errcode='23514'; end if;
 update public.daywork_photos set uploaded_at=now() where id=p.id;
end $$;

-- Office documents: the same arrangement for the person who is uploading a revision.
create or replace function private.can_read_path(p_path text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.document_revisions d where d.object_path = p_path
    and ((d.uploaded_at is not null and private.can_read_document(d.contract_id,d.work_area_id,d.classification))
      or (d.uploaded_at is null and d.created_by = auth.uid() and private.can_upload_document(d.contract_id,d.work_area_id,d.classification))))
$$;
create function public.confirm_document_upload(p_document uuid,p_sha256 text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.document_revisions;
begin
 select * into d from public.document_revisions where id=p_document for update;
 if not found or auth.uid() is null or d.created_by is distinct from auth.uid()
   or d.organisation_id is distinct from private.current_org() or d.sha256 is distinct from p_sha256 then
  raise exception 'Document upload unavailable' using errcode='42501'; end if;
 if d.uploaded_at is not null then return; end if;
 if not private.can_upload_document(d.contract_id,d.work_area_id,d.classification) then
  raise exception 'Uploader no longer has permission for this document' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='tilespec-evidence' and name=d.object_path
   and metadata->>'size'=d.bytes::text and metadata->>'mimetype'=d.mime_type) then
  raise exception 'File is missing or upload size/type does not match' using errcode='23514'; end if;
 update public.document_revisions set uploaded_at=now() where id=d.id;
end $$;
revoke all on function public.confirm_document_upload(uuid,text) from public,anon;
grant execute on function public.confirm_document_upload(uuid,text) to authenticated;

revoke all on function public.confirm_snag_photo(uuid,text),public.confirm_hold_photo(uuid,text),public.confirm_daywork_photo(uuid,text) from public,anon;
grant execute on function public.confirm_snag_photo(uuid,text),public.confirm_hold_photo(uuid,text),public.confirm_daywork_photo(uuid,text) to authenticated;
commit;
