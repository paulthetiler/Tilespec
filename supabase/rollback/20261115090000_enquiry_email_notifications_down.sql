-- Removes enquiry email alerts (20261115090000). Enquiries, their files and their statuses are untouched;
-- the alert queue and its attempt log are removed with it, so take a backup first if the log is needed.
begin;
drop trigger if exists queue_enquiry_notification on public.tender_enquiries;
drop function if exists public.rotate_enquiry_notification_key(), public.claim_enquiry_notification_for_office(uuid),
  public.claim_due_enquiry_notifications(text,integer), public.claim_submitted_enquiry_notification(uuid,text),
  public.report_enquiry_notification(uuid,text,text,text,text), private.start_enquiry_notification(uuid,text,uuid),
  private.queue_enquiry_notification();
drop table if exists public.enquiry_notification_attempts, public.enquiry_notification_settings, public.enquiry_notifications;
commit;
