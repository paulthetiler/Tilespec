# Email alerts for website enquiries

Every tender or general enquiry from `/contact` is emailed to **info@tilespec.uk** once the enquiry and all of
its documents have arrived. The alert reuses the existing email service (Resend, `lib/notifications/send.ts`) and
the existing no-service-key design: the database decides what may be sent, and the app holds no Supabase
service-role key.

## How it works

1. The visitor's browser stores each document, then calls `/api/enquiries/complete`. The database function
   `complete_tender_enquiry` checks every reserved file is stored at its declared size and marks the enquiry
   received. **In the same transaction** a trigger queues exactly one alert (`enquiry_notifications`, unique per
   enquiry). If queueing ever failed, the enquiry is still received; the failure is a database warning.
2. The visitor is told the enquiry was received. Only then (Next.js `after()`), the server claims the alert with
   the visitor's one-time token, sends the email and reports the outcome. The email's outcome can never change
   what the visitor is shown.
3. A failed attempt is logged (`enquiry_notification_attempts`, append-only) and retried by the schedule
   (`/api/cron/enquiry-notifications`, every 10 minutes in `vercel.json`) after 2, 6, 18 and 54 minutes, then
   hours, for up to 8 attempts. An attempt whose sender stopped without reporting is counted and taken over after
   10 minutes. After 8 attempts the alert waits for the office.
4. The owner or a contracts manager sees each enquiry's alert status in **Tender enquiries** and can send a
   waiting or failed alert with **Send the email alert now**.

**No duplicates:** one alert row per enquiry; an alert is claimed before sending (`for update skip locked`); each
claim has its own random id, which is the only way to report its outcome; a sent alert can never be claimed
again, including from the inbox; and the alert id is the email service's idempotency key, so a retried request
within 24 hours is not delivered twice.

**What the email contains:** reference, enquiry type, customer name, company, email (and Reply-To set to the
customer, so replying answers them directly), project, tender return date, received time, message, document
names and sizes, and a button to `https://tilespec.uk/admin/tenders?ref=TS-XXXXXXXX`. That link requires
sign-in as the owner or a contracts manager; the reference in it grants nothing. Documents are never attached or
linked: they stay in the private `tilespec-tenders` bucket and open only from the signed-in inbox through
five-minute links. The email never contains the visitor's token, a storage path or any key.

## Settings (Vercel → Project `tilespec` → Settings → Environment Variables, Production)

| Variable | Required | Secret | Purpose |
|---|---|---|---|
| `RESEND_API_KEY` | Yes | Yes (mark Sensitive) | The email service key. Create it in Resend with "Sending access" for the verified domain only. |
| `NOTIFICATIONS_FROM` | Yes | No | Sender on the verified domain, e.g. `TileSPEC Website <enquiries@notify.tilespec.uk>`. |
| `ENQUIRY_NOTIFICATIONS_TO` | No | No | Override the recipient (default `info@tilespec.uk`). |
| `NOTIFICATIONS_BASE_URL` | No | No | Link base; defaults to the production domain Vercel provides. Set `https://tilespec.uk` to be explicit. |
| `CRON_SECRET` | For retries | Yes | Long random value; Vercel sends it to the schedule. |
| `ENQUIRY_NOTIFICATIONS_KEY` | For retries | Yes | Created once by the owner in **Tender enquiries → Email alerts for new enquiries → Create the retry key**. |

Redeploy after changing variables. Without `RESEND_API_KEY` and `NOTIFICATIONS_FROM`, alerts are queued but not
sent; once both are set, the schedule (or **Send the email alert now**) sends the backlog.

## Sending domain (does not touch Microsoft 365)

tilespec.uk's mail is hosted by Microsoft 365 (MX `tilespec-uk.mail.protection.outlook.com`, SPF
`include:secureserver.net -all`, DMARC `p=quarantine`, DNS at GoDaddy). To leave that untouched, verify a
**subdomain** with Resend, for example `notify.tilespec.uk` (region EU, Ireland). Resend then asks for records on
that subdomain only — typically:

| Type | Name (GoDaddy "Host") | Value |
|---|---|---|
| TXT | `resend._domainkey.notify` | the DKIM key Resend shows |
| MX | `send.notify` | `feedback-smtp.eu-west-1.amazonses.com`, priority 10 |
| TXT | `send.notify` | `v=spf1 include:amazonses.com ~all` |

Copy the exact values from the Resend dashboard. **Do not** edit the root `@` MX, the root SPF TXT, `autodiscover`,
`selector1/selector2._domainkey` or `_dmarc`. Mail from `enquiries@notify.tilespec.uk` passes DMARC through its own
DKIM signature. If the first alert lands in Junk in Outlook, mark it "Not junk" (or add the sender to Safe
senders); no change to mailbox hosting is needed.

## Verifying

1. Tender enquiries shows ✓ for the email service. Submit a harmless test enquiry at `/contact`.
2. It arrives at info@tilespec.uk within a minute; its button opens the enquiry after sign-in.
3. Tender enquiries shows "Email alert sent to info@tilespec.uk" with the time.
4. Vercel → Logs: `Enquiry alert TS-… sent`. Logs name only the reference, never the customer or a key.

## Database

`supabase/migrations/20261115090000_enquiry_email_notifications.sql` needs only the enquiry table and is
independent of the office command centre (either order). It changes no existing row and queues nothing for
enquiries received before it. Rollback: `supabase/rollback/20261115090000_enquiry_email_notifications_down.sql`
(removes the alert queue and its log; enquiries are untouched).

## Tests

- `tests/enquiry-notifications.test.ts`: email content and escaping, no private data or links, successful
  submission, email failures, transient retry, duplicate requests, the completion answer never affected by the
  email, the scheduled retry, and the Resend transport (reply-to, idempotency key, key never logged).
- `tests/db/enquiry-notifications.test.sql`: queueing in the confirming transaction, claims by token, key and
  office, duplicate claims, back-off, stale attempts, the 8-attempt limit, permissions by role, the permanent
  log, and an enquiry still received when its alert cannot be queued.
- `tests/db/enquiry-notifications-upgrade.test.sh`: the hosted project's shape, existing enquiries unchanged,
  refusal of a second application, the command centre afterwards and its rollback, and this rollback.
