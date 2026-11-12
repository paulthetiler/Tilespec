-- Email alerts to the office for every enquiry from the website (November 2026).
--
-- When a visitor's enquiry is confirmed (complete_tender_enquiry has checked every reserved file arrived
-- at its declared size), the same transaction queues exactly one email alert for it. The server sends the
-- alert through the existing email service and reports the outcome here; every attempt is logged. Nothing
-- here can fail or delay the visitor's enquiry: a problem queueing or sending an alert is recorded and
-- retried, and the enquiry is in the office inbox either way.
--
--   * Queued once: one alert per enquiry (unique), added by a trigger when the enquiry becomes received.
--     A repeated confirmation, a retried request or two senders at once cannot add a second.
--   * Sent once: an alert is claimed before it is sent. Each claim has its own random id, which is the only
--     way to report the outcome, so a late or stale report cannot overwrite a newer attempt. The server
--     gives the email service the alert's id as its idempotency key.
--   * Who may claim an alert:
--       - the server that confirmed the enquiry, with that visitor's one-time token: the first attempt only
--       - the scheduled retry, with the retry key the owner created (only its fingerprint is kept)
--       - the owner or a contracts manager, signed in, from the tender inbox
--   * A failed attempt is retried after 2, 6, 18 and 54 minutes, then after hours, for up to 8 attempts
--     (about a day and a half); after that it waits for the office to send it again. An attempt whose
--     sender stopped without reporting is counted as failed and claimed again after 10 minutes.
--   * A claim returns only what the email needs: never the token, a file's storage path or a file link.
--
-- Requires the tender enquiry table; the public enquiry form (20261110112916_public_intake_without_service_key)
-- is what confirms enquiries. Independent of the office command centre (20261114090000): either may be applied
-- first. No existing row is changed, and no alert is queued for an enquiry received before this migration.
begin;
do $preflight$ begin
  if to_regclass('public.tender_enquiries') is null or to_regprocedure('private.current_role()') is null
    or to_regprocedure('private.guard_append_only()') is null
    or (select count(*) from information_schema.columns where table_schema='public' and table_name='tender_enquiries'
        and column_name in ('token_hash','attachments','received_at','reference')) <> 4 then
    raise exception 'Preflight failed: the tender enquiry table must be applied first';
  end if;
  if to_regclass('public.enquiry_notifications') is not null or to_regclass('public.enquiry_notification_attempts') is not null
    or to_regclass('public.enquiry_notification_settings') is not null then
    raise exception 'Preflight failed: enquiry email alerts are already installed';
  end if;
end $preflight$;

-- ---------------------------------------------------------------------------------------------
-- 1. The alert queue, its attempt log and the retry key's fingerprint
-- ---------------------------------------------------------------------------------------------
create table public.enquiry_notifications (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null unique references public.tender_enquiries(id),
  status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check(attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  -- The current claim. Its id is the capability to report the outcome and is never readable through the API.
  claim_id uuid unique, claimed_at timestamptz, claimed_via text check(claimed_via in ('submission','schedule','office')),
  claimed_by uuid references auth.users(id),
  recipient text check(recipient is null or length(recipient) <= 254),
  sent_at timestamptz, provider_message_id text check(provider_message_id is null or length(provider_message_id) <= 200),
  last_error text check(last_error is null or length(last_error) <= 1000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((status = 'sending') = (claim_id is not null)),
  check(status <> 'sent' or (sent_at is not null and provider_message_id is not null))
);
create index enquiry_notifications_due on public.enquiry_notifications(status, next_attempt_at);

create table public.enquiry_notification_attempts (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.enquiry_notifications(id),
  attempted_at timestamptz not null default now(),
  via text not null check(via in ('submission','schedule','office')),
  actor_id uuid references auth.users(id),
  result text not null check(result in ('sent','failed')),
  recipient text check(recipient is null or length(recipient) <= 254),
  provider_message_id text check(provider_message_id is null or length(provider_message_id) <= 200),
  error text check(error is null or length(error) <= 1000)
);
create index enquiry_notification_attempts_by_alert on public.enquiry_notification_attempts(notification_id, attempted_at desc);
-- The attempt log is permanent.
create trigger enquiry_notification_attempts_append_only before update or delete on public.enquiry_notification_attempts
  for each row execute function private.guard_append_only();

create table public.enquiry_notification_settings (
  singleton boolean primary key default true check(singleton),
  retry_key_hash text check(retry_key_hash is null or retry_key_hash ~ '^[0-9a-f]{64}$'),
  retry_key_set_at timestamptz, retry_key_set_by uuid references auth.users(id)
);
insert into public.enquiry_notification_settings default values;

alter table public.enquiry_notifications enable row level security;
alter table public.enquiry_notification_attempts enable row level security;
alter table public.enquiry_notification_settings enable row level security;
revoke all on public.enquiry_notifications, public.enquiry_notification_attempts, public.enquiry_notification_settings from public, anon, authenticated;
revoke all on sequence public.enquiry_notification_attempts_id_seq from public, anon, authenticated;
-- The office reads alerts beside the enquiries they are about: the owner and contracts managers only, the same
-- people who can read the tender inbox. Nobody can read a claim id or the retry key's fingerprint.
grant select (id,enquiry_id,status,attempts,next_attempt_at,claimed_at,claimed_via,recipient,sent_at,provider_message_id,last_error,created_at,updated_at)
  on public.enquiry_notifications to authenticated;
grant select on public.enquiry_notification_attempts to authenticated;
grant select (singleton,retry_key_set_at) on public.enquiry_notification_settings to authenticated;
create policy enquiry_notifications_office_read on public.enquiry_notifications for select to authenticated using (
  coalesce(private.current_role()::text in ('owner','contracts_manager'), false));
create policy enquiry_notification_attempts_office_read on public.enquiry_notification_attempts for select to authenticated using (
  coalesce(private.current_role()::text in ('owner','contracts_manager'), false));
create policy enquiry_notification_settings_office_read on public.enquiry_notification_settings for select to authenticated using (
  coalesce(private.current_role()::text in ('owner','contracts_manager'), false));

-- ---------------------------------------------------------------------------------------------
-- 2. Queue the alert in the transaction that confirms the enquiry. Never fails the confirmation.
-- ---------------------------------------------------------------------------------------------
create function private.queue_enquiry_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status = 'received' and old.status = 'uploading' then
    begin
      insert into public.enquiry_notifications(enquiry_id) values (new.id) on conflict (enquiry_id) do nothing;
    exception when others then
      raise warning 'TileSPEC could not queue the email alert for enquiry %: %', new.reference, sqlerrm;
    end;
  end if;
  return null;
end $$;
create trigger queue_enquiry_notification after update of status on public.tender_enquiries
  for each row execute function private.queue_enquiry_notification();

-- ---------------------------------------------------------------------------------------------
-- 3. Claim and report. The caller has already checked who is asking and locked the alert.
-- ---------------------------------------------------------------------------------------------
create function private.start_enquiry_notification(p_notification uuid, p_via text, p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.enquiry_notifications; e public.tender_enquiries; claim uuid := gen_random_uuid(); tries integer;
begin
  select * into n from public.enquiry_notifications where id = p_notification;
  tries := n.attempts;
  -- A sender that stopped without reporting: that attempt counts as failed.
  if n.status = 'sending' then
    insert into public.enquiry_notification_attempts(notification_id,via,actor_id,result,error)
      values (n.id, n.claimed_via, n.claimed_by, 'failed', 'No outcome was reported for this attempt');
    tries := tries + 1;
  end if;
  update public.enquiry_notifications set status='sending', attempts=tries, claim_id=claim, claimed_at=now(), claimed_via=p_via,
    claimed_by=p_actor, updated_at=now() where id = n.id;
  select * into e from public.tender_enquiries where id = n.enquiry_id;
  return jsonb_build_object('claim', claim, 'notification', n.id, 'attempt', tries + 1, 'enquiry', jsonb_build_object(
    'reference', e.reference, 'kind', e.kind, 'name', e.name, 'company', e.company, 'email', e.email, 'project', e.project,
    'deadline', e.deadline, 'message', e.message, 'received_at', e.received_at,
    -- File names and sizes only: the files stay in private storage and open only in the signed-in inbox.
    'files', (select coalesce(jsonb_agg(jsonb_build_object('name', a->>'name', 'size', (a->>'size')::bigint) order by o), '[]'::jsonb)
      from jsonb_array_elements(e.attachments) with ordinality x(a, o))));
end $$;

-- The outcome of one claimed attempt. Only whoever holds the claim id can report it, once.
create function public.report_enquiry_notification(p_claim uuid, p_result text, p_recipient text, p_provider_id text, p_error text) returns text
language plpgsql security definer set search_path='' as $$
declare n public.enquiry_notifications; message text;
begin
  if p_claim is null then raise exception 'This attempt is no longer current' using errcode='23514'; end if;
  if p_result is null or p_result not in ('sent','failed') then raise exception 'The result must be sent or failed' using errcode='22023'; end if;
  if p_recipient is not null and (length(p_recipient) > 254 or p_recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Invalid recipient' using errcode='22023'; end if;
  if p_result = 'sent' and (p_recipient is null or nullif(btrim(coalesce(p_provider_id,'')),'') is null) then
    raise exception 'A sent alert needs its recipient and the email service''s message id' using errcode='22023'; end if;
  select * into n from public.enquiry_notifications where claim_id = p_claim and status = 'sending' for update;
  if not found then raise exception 'This attempt is no longer current' using errcode='23514'; end if;
  message := case when p_result = 'failed' then left(coalesce(nullif(btrim(p_error),''), 'The email could not be sent'), 1000) end;
  insert into public.enquiry_notification_attempts(notification_id,via,actor_id,result,recipient,provider_message_id,error)
    values (n.id, n.claimed_via, n.claimed_by, p_result, p_recipient, left(btrim(p_provider_id),200), message);
  if p_result = 'sent' then
    update public.enquiry_notifications set status='sent', attempts=attempts+1, sent_at=now(), recipient=p_recipient,
      provider_message_id=left(btrim(p_provider_id),200), last_error=null, claim_id=null, updated_at=now() where id = n.id;
    return 'sent';
  end if;
  if n.attempts + 1 >= 8 then
    update public.enquiry_notifications set status='failed', attempts=attempts+1, recipient=coalesce(p_recipient,recipient), last_error=message,
      claim_id=null, updated_at=now() where id = n.id;
    return 'failed';
  end if;
  update public.enquiry_notifications set status='pending', attempts=attempts+1, recipient=coalesce(p_recipient,recipient), last_error=message, claim_id=null,
    next_attempt_at=now() + interval '2 minutes' * power(3, n.attempts), updated_at=now() where id = n.id;
  return 'retry';
end $$;

-- 3a. Straight after confirmation, by the server holding the visitor's one-time token. First attempt only:
-- retries belong to the schedule and the office. Returns null when there is nothing to send.
create function public.claim_submitted_enquiry_notification(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.tender_enquiries; target uuid;
begin
  if p_id is null or p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'Invalid submission' using errcode='42501'; end if;
  select * into e from public.tender_enquiries where id = p_id;
  if not found or e.token_hash is distinct from encode(sha256(convert_to(p_token,'UTF8')),'hex') then
    raise exception 'Invalid submission' using errcode='42501'; end if;
  select id into target from public.enquiry_notifications where enquiry_id = e.id and status = 'pending' and attempts = 0
    and next_attempt_at <= now() for update skip locked;
  if target is null then return null; end if;
  return private.start_enquiry_notification(target, 'submission', null);
end $$;

-- 3b. The scheduled retry, with the owner's retry key. Due alerts, and attempts whose sender stopped.
create function public.claim_due_enquiry_notifications(p_key text, p_limit integer default 10) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare s public.enquiry_notification_settings; target uuid;
begin
  if p_key is null or length(p_key) < 32 or length(p_key) > 200 then raise exception 'Retry key required' using errcode='42501'; end if;
  select * into s from public.enquiry_notification_settings where singleton;
  if s.retry_key_hash is null or s.retry_key_hash <> encode(sha256(convert_to(p_key,'UTF8')),'hex') then
    raise exception 'Retry key not recognised' using errcode='42501'; end if;
  for target in select id from public.enquiry_notifications
      where (status = 'pending' and next_attempt_at <= now() and attempts < 8) or (status = 'sending' and claimed_at < now() - interval '10 minutes')
      order by next_attempt_at, created_at limit least(greatest(coalesce(p_limit,10),1),50) for update skip locked loop
    return next private.start_enquiry_notification(target, 'schedule', null);
  end loop;
end $$;

-- 3c. The owner or a contracts manager sends an alert now from the tender inbox. Never one already sent.
create function public.claim_enquiry_notification_for_office(p_notification uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.enquiry_notifications;
begin
  if not coalesce(private.current_role()::text in ('owner','contracts_manager'), false) then
    raise exception 'Only the owner or a contracts manager can send enquiry alerts' using errcode='42501'; end if;
  select * into n from public.enquiry_notifications where id = p_notification for update;
  if not found then raise exception 'Alert not found' using errcode='22023'; end if;
  if n.status = 'sent' then raise exception 'This alert has already been sent' using errcode='23514'; end if;
  if n.status = 'sending' and n.claimed_at > now() - interval '10 minutes' then
    raise exception 'This alert is being sent now. Refresh in a few minutes to see the result.' using errcode='23514'; end if;
  return private.start_enquiry_notification(n.id, 'office', auth.uid());
end $$;

-- A new retry key; only its fingerprint is stored. Shown once to the owner, who adds it to the hosting settings.
create function public.rotate_enquiry_notification_key() returns text
language plpgsql security definer set search_path='' as $$
declare token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not coalesce(private.current_role()::text = 'owner', false) then
    raise exception 'Only the owner manages enquiry email alerts' using errcode='42501'; end if;
  update public.enquiry_notification_settings set retry_key_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),
    retry_key_set_at=now(), retry_key_set_by=auth.uid() where singleton;
  return token;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. Function privileges
-- ---------------------------------------------------------------------------------------------
revoke all on function private.queue_enquiry_notification(), private.start_enquiry_notification(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.report_enquiry_notification(uuid,text,text,text,text), public.claim_submitted_enquiry_notification(uuid,text),
  public.claim_due_enquiry_notifications(text,integer), public.claim_enquiry_notification_for_office(uuid), public.rotate_enquiry_notification_key()
  from public, anon, authenticated;
-- The server has no user session when it sends an alert: the visitor's token or the retry key proves the request.
grant execute on function public.claim_submitted_enquiry_notification(uuid,text), public.claim_due_enquiry_notifications(text,integer) to anon;
-- Reporting needs the claim id returned to whoever claimed the attempt.
grant execute on function public.report_enquiry_notification(uuid,text,text,text,text) to anon, authenticated;
grant execute on function public.claim_enquiry_notification_for_office(uuid), public.rotate_enquiry_notification_key() to authenticated;
commit;
