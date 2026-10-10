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

Read the [architecture, permissions and phased plan](docs/operations/architecture.md),
[staging deployment instructions](docs/operations/deployment.md), and
[database/bootstrap instructions](supabase/README.md). Copy `.env.example` to a
local ignored environment file and supply project values through secure settings.
Never use the ResinSpec production backend for staging.

Run `npm test`, `npm run test:db`, `npm run test:browser`, `npm run test:forms`,
and `npm run build` as described in the deployment instructions. The public
website and estimator calculations are retained; estimator access now requires
an owner or expressly authorised contracts manager.

## Launch checklist
- Replace curated illustrative photography with authorised original commercial project images.
- Confirm the correct trading company legal name, registered address, contact email and phone.
- Connect tender form to an authenticated server-side email/upload service. The current form opens an email draft; it does not silently collect or store documents.
- Add verified project case studies, insurance and accreditation information only once checked.
- Connect repository to Vercel and set the custom domain after review.

No invented project completions, certifications or client testimonials are published.
