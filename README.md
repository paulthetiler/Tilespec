# TileSPEC

Commercial tiling contractors — website and authenticated operations foundation,
built with Next.js App Router, TypeScript and CSS.

## Run locally
```bash
npm ci
npm run dev
```

## Operations development

Phase 1 adds owner-controlled access, contract budgets, work areas/packages,
private document revisions and audit history. Internal routes require a dedicated
Supabase backend; missing configuration fails closed. Contracts remain drafts
without installation release. Quality gates and later commercial/site workflows
are planned subsequent phases.

The Supervisor Operations System V2 (locations, teams, planned and actual
allocations, attribution) is planned in [supervisor-v2.md](docs/operations/supervisor-v2.md).

Commercial integration (variations, labour and job costs, materials used, payment
applications and one financial position per job, with supervisors kept out of all
commercial information) is described in [commercial-integration.md](docs/operations/commercial-integration.md),
following the [audit](docs/operations/commercial-audit.md). Its migrations must be
reconciled and approved before they are applied to a hosted project; see
[migration-reconciliation.md](docs/operations/migration-reconciliation.md).

Commercial accounts and invoicing (each contract's payment terms, numbered applications and invoices, retention and its
release, Construction Act dates and notices, VAT and CIS, credit notes, statements, final accounts and branded PDFs with an
audit trail) are described in [commercial-accounts.md](docs/operations/commercial-accounts.md), with
[sample documents](docs/operations/samples/README.md).

The subcontractor portal (`/subcontractors`: personal links instead of logins, a signed agreement, invoices generated from agreed
rates or uploaded, CIS and retention at approval, all on the gang invoice workflow) and its audit are described in
[subcontractor-portal.md](docs/operations/subcontractor-portal.md). `npm run test:portal` runs its journey in a real browser.

Read the [architecture, permissions and phased plan](docs/operations/architecture.md),
[staging deployment instructions](docs/operations/deployment.md), and
[database/bootstrap instructions](supabase/README.md). Copy `.env.example` to a
local ignored environment file and supply project values through secure settings.
Never use the ResinSpec production backend for staging.

Run `npm test`, `npm run test:db`, `npm run test:browser`, `npm run test:forms`,
and `npm run build` as described in the deployment instructions. `npm run samples:documents`
regenerates the sample commercial documents from the real database functions. The public
website and estimator calculations are retained; estimator access now requires
an owner or expressly authorised contracts manager.

## Launch checklist
- Replace curated illustrative photography with authorised original commercial project images.
- Confirm the correct trading company legal name, Companies House registration details, registered office, contact email and phone. Do not publish an unleased or unverified trading premises address.
- Tender form now uses a Supabase-backed server-side enquiry reservation, private document uploads and completion acknowledgement. Verify the hosted configuration and run a full end-to-end test with a harmless test enquiry before launch. The website does not currently demonstrate automatic email alerts for new submissions; monitor the admin tender inbox until notifications are verified.
- Add verified project case studies, insurance and accreditation information only once checked.
- Connect repository to Vercel and set the custom domain after review.

No invented project completions, certifications or client testimonials are published.
