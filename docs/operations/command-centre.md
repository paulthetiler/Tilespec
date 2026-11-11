# Office command centre

The owner's and contracts managers' homepage (`/admin`) and the pages behind it. It replaces the earlier Today
page, keeps everything that page did, and builds on the existing records, permissions and engines. There is no
second rules engine, task list, invoicing engine or messaging system.

## The homepage

| Section | What it shows | Source |
|---|---|---|
| Header | Greeting, global search, **+ New** quick actions | – |
| Six figures | Needs you · Inbox · On site today · Overdue from customers · Gang payments this week · Compliance. Without money access, the two money figures become Live jobs and Claims to check | Engine queue, inbox counts, plans and actuals, `debtor_ledger`, gang invoice commercials, insurance and onboarding |
| Immediate attention | Supervisor questions and decisions, reports to review, unacknowledged instructions, claims to verify or approve, overdue customer money, overdue gang payments, expired or expiring insurance, then the full action queue (stops, decisions, setup, snags, inspections, dayworks) | The shared Next Action engine (`lib/operations/next-actions`) plus direct reads |
| Live jobs | Every job in Mobilising, Live, On hold, Practical completion or Defects: stage, supervisor and manager, gangs planned and confirmed today, progress against package quantities, programme status, margin (money access only), open items | `contracts`, assignments, plans, actuals, `site_progress_entries`, `contract_financial_positions` |
| Yesterday on site | Per job: end-of-day reports (problems only when real), attendance, progress quantities, photographs, inspections, new snags, materials requested, messages waiting | Handovers, actuals, progress, photos, inspections, issues, materials |
| Financial control (money access only) | Customer debt ageing, subcontractor claims and payments, retention, CIS this month, extras to price or sign, quotations, eight-week cash flow, profit by job | `debtor_ledger`, `cash_flow_lines`, gang invoice commercials, dayworks, quotes, financial positions |
| Planning | Job starts and what is still to set up, staffing gaps (unplanned jobs, double bookings, idle gangs), materials, deadlines | Plans, setup actions, materials, tenders, insurance |
| Administration | Customers, onboarding, insurance, tenders, quotations, documents, startup expenses, business settings, notifications, user access | – |

Every row opens its record. The owner sees all office work. When an active contracts manager is assigned to a job,
the owner sees that job's office work as waiting on them by name; otherwise it is the owner's to do.

## Pages

| Page | Purpose |
|---|---|
| `/admin/inbox` | Everything from site waiting on the office: answer, approve or reject a decision request (the supervisor sees it in the conversation), review reports, follow up instructions, claims, unsent snags and stop notices |
| `/admin/search` | One search across jobs, customers, gangs, people, invoices, quotations, tenders, snags, stops, dayworks, materials and conversations; row-level security decides what each person finds |
| `/admin/planner` | Every active gang against the next 14 working days, double bookings, idle days and jobs with nobody planned |
| `/admin/materials` | Requirements from site and the office, orders, expected and confirmed deliveries |
| `/admin/finance` | Debt ageing by application and customer, 12-week cash flow with every line, profit by job |
| `/admin/customers` | Customers with their jobs, quotations and balances |
| `/admin/quotes` | Quotations from draft to sent, accepted, declined, expired or withdrawn; linked to tenders and jobs |
| `/admin/tenders` | Tender enquiries from receipt through reviewing, pricing, submitted, won, lost or declined |
| `/admin/subcontractors/new` | Choose or create a gang and its company, then onboard it on one page |
| `/admin/notifications` | Email recipients, test messages, delivery switch, dispatcher key, summary preview and delivery log (owner only) |
| `/admin/contracts/[id]` | Adds the job's stage and customer, and a link to its complete history |
| `/admin/supervisor/sites/[id]/diary` | For supervisors: work done with quantities, photographs and materials needed |

## Supervisor to office

A supervisor messages the office as a question, a decision request, a problem or a plain message, and can mark
it urgent. Urgent messages are emailed to the office when notifications are on. The office answers or decides in the
inbox. The decision is recorded (`job_thread_outcomes`) and posted into the same conversation, so the supervisor
sees it where they already read replies. Progress quantities, photographs and materials requests come from the
site diary, and everything appears in the job's history.

## Email notifications

- **Urgent alerts:** safety stops, critical defects and urgent site problems or decision requests.
- **Morning summary:** after 07:00, covering stops, conversations waiting, yesterday on site, today's plan, the
  next 14 days, and money for recipients with money access.

The content is assembled by the database for each recipient. Emails are queued in an outbox with one key per event
and recipient, so the same event is never emailed twice, and urgent alerts are capped per hour. Each message is
re-checked when sent and suppressed if the recipient has lost access. Failures retry with back-off, and every
attempt is logged.

Recipients are owners and contracts managers only, at the address they sign in with. Nothing is sent until the owner
has a confirmed recipient (via a test message) and switches delivery on. Until then each message is logged as a dry
run. The scheduled dispatcher (`/api/cron/notifications`, every ten minutes) has no user session: it proves itself
to Vercel with `CRON_SECRET` and to the database with the owner's dispatcher key, and no service key is used. See
[command-centre-rollout.md](command-centre-rollout.md) for setting it up.

## Tests

- `tests/command-centre.test.ts`: the calculations, the summary's money boundary, search links, message
  categories, owner visibility and unsent snags.
- `tests/db/command-centre.test.sql`: every new function and policy by role, including the notification pipeline.
- `tests/db/command-centre-rollback.test.sh`: the migration rolls back and installs again.
- `npm run test:command-centre`: the morning journey in a real browser against the migrated database, with email
  delivered to a local stand-in.
- `npm run test:pre-migration`: the new app against a database shaped like the hosted project before the update:
  every page opens, new pages explain the update, and site questions still reach the office.
