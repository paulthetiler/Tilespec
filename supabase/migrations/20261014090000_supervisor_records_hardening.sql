-- Supervisor V2, Phase 1: close integrity gaps in the existing supervisor records.
-- Additive. No existing row is changed or removed, and the application's own
-- writes are unaffected: it never sends created_at, always computes the same
-- issue count, and uploads a photograph before recording it.
begin;

do $$
begin
  if to_regclass('public.supervisor_inspections') is null or to_regclass('public.supervisor_issues') is null
    or to_regclass('public.supervisor_issue_photos') is null
    or to_regprocedure('private.inspection_issues()') is null
    or to_regprocedure('private.enforce_issue_closure()') is null then
    raise exception 'Preflight failed: supervisor inspection/issue objects are missing or renamed. Run supabase/inspection/supervisor-v2-preflight.sql and review drift before applying.';
  end if;
  if to_regprocedure('private.guard_supervisor_inspection()') is not null or to_regprocedure('private.guard_issue_photo()') is not null then
    raise exception 'Preflight failed: hardening functions already exist (schema drift). Review before applying.';
  end if;
end $$;

-- Raw table inserts could previously backdate an inspection or understate its
-- issues. Record server time and derive the count from the answers themselves.
create function private.guard_supervisor_inspection() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Inspection actor must be the signed-in supervisor' using errcode='42501';
  end if;
  if exists (select 1 from jsonb_array_elements(new.answers) a
    where jsonb_typeof(a) <> 'object' or jsonb_typeof(a->'item') is distinct from 'string'
      or length(trim(a->>'item')) not between 1 and 200
      or coalesce(a->>'status','') not in ('pass','issue','na')
      or jsonb_typeof(coalesce(a->'note','""'::jsonb)) <> 'string' or length(coalesce(a->>'note','')) > 2000
      or (a->>'status' in ('issue','na') and length(trim(coalesce(a->>'note',''))) = 0)) then
    raise exception 'Every check needs an item, a pass/issue/na status, and a note for issues and N/A' using errcode='22023';
  end if;
  if (select count(distinct lower(trim(a->>'item'))) from jsonb_array_elements(new.answers) a) <> jsonb_array_length(new.answers) then
    raise exception 'Each check may be answered only once' using errcode='22023';
  end if;
  new.created_at := now();
  new.issues_count := (select count(*) from jsonb_array_elements(new.answers) a where a->>'status' = 'issue');
  return new;
end $$;
create trigger guard_supervisor_inspection before insert on public.supervisor_inspections
  for each row execute function private.guard_supervisor_inspection();

-- A photograph record must refer to bytes that were actually stored; it cannot
-- be pointed at an object that was never uploaded to satisfy closure rules.
create function private.guard_issue_photo() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.actor_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Photograph actor must be the signed-in user' using errcode='42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'supervisor-evidence' and o.name = new.object_path) then
    raise exception 'Photograph has not been stored. Upload it before recording the evidence.' using errcode='23514';
  end if;
  new.created_at := now();
  return new;
end $$;
create trigger guard_issue_photo before insert on public.supervisor_issue_photos
  for each row execute function private.guard_issue_photo();

-- Closure also re-checks the stored object, covering any earlier record that
-- was inserted before this guard existed.
create or replace function private.enforce_issue_closure() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state = 'closed' and old.state is distinct from 'closed' then
    if new.closed_by = old.rectified_by then raise exception 'Independent reinspection required' using errcode='42501'; end if;
    if not exists (select 1 from public.supervisor_issue_photos p
      join storage.objects o on o.bucket_id = 'supervisor-evidence' and o.name = p.object_path
      where p.issue_id = new.id) then
      raise exception 'Photographic evidence required before closure' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

-- Functions created after the foundation's blanket revoke kept PUBLIC execute.
revoke all on function private.inspection_issues(), private.enforce_issue_closure(),
  private.guard_supervisor_inspection(), private.guard_issue_photo() from public, anon, authenticated;
commit;
