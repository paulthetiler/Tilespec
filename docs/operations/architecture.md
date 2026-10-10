# TileSPEC operations architecture and delivery plan

## 1. Architecture assessment

Baseline: `344cd8e` on `paulthetiler/Tilespec`. Next.js 15 App Router, React 19,
TypeScript, CSS modules and lucide icons. The public marketing page and
`/admin/estimator` are the only application routes. The estimator is a client-only,
unsaved draft calculator, currently accessible without authentication. There is
no backend, auth, database, document storage, CI or Vercel project binding in this
checkout. The marketing enquiry opens an email draft.

Retain the website, branding and estimator calculations. Add an authenticated
`/admin` boundary with separate operational and commercial permissions. Use
Supabase Auth, PostgreSQL RLS and private Storage; use the existing stack's server
components and server actions. No additional paid service is required. Runtime
business requests use the authenticated user's publishable-key client. A narrowly
used server-only service client verifies quarantined file bytes and completes only
the authenticated uploader's validated revision. Membership is explicitly
owner-controlled; signup does not confer access.
Use a dedicated TileSPEC staging Supabase project, configured explicitly; never
reuse the live ResinSpec backend or its connection defaults. Missing configuration
fails closed. Production migration and merge remain subject to owner approval.

## 2. Proposed database schema

All business records belong to an organisation. Descendants use composite foreign
keys to prevent cross-contract and cross-organisation linking. Amounts use decimal
GBP, quantities have explicit units, and timestamps are UTC.

| Entity | Purpose | Phase |
| --- | --- | --- |
| organisations | Business identity, configurable target margin | 1 |
| organisation_members | Auth UUID, display name, role, active state, manager financial permission | 1 |
| contracts | Reference, parties, site, scope, specifications, programme, access and obligations; no money columns | 1 |
| contract_commercials | Value, original labour/material budgets, preliminaries, contingency, payment/retention terms | 1 |
| contract_assignments | Explicit allocated manager/supervisor and effective dates | 1 |
| work_areas | Contract location, substrate/system notes, current specification revision, unreleased state | 1 |
| work_packages / package_assignments | Area quantities and explicit installer allocation | 1 |
| document_revisions | Immutable private file path, classification, revision, content hash, actual uploader | 1 |
| audit_events | Actual actor, action, entity and timestamp; immutable, commercial events segregated | 1 |
| idempotency_keys | Actor/operation/request key, canonical payload hash and result | 1 |
| subcontractors / gangs / personnel | Identity, competence, experience, availability and document requirements; tax/rates separate | 3 |
| specification_revisions | Immutable approved criteria, manufacturer/standard references, applicable area | 2 |
| gate_definitions / gate_requirements | Versioned configurable gate policy, scope, evidence, roles and prerequisites | 2 |
| inspections / inspection_measurements / evidence | Genuine performed inspection, equipment, plan location, specified tolerance, observations | 2 |
| gate_submissions / gate_decisions / release_snapshots | Immutable decisions tied to area, revision, policy, evidence and inspector | 2 |
| non_conformances / corrective_actions / reinspections / stop_instructions | Scoped stop, remediation, independent approval, preserved failure history | 2 |
| daily_reports / programme_activities / progress_measurements | Idempotent gang/date/area reports, planned and actual output, attributable delays | 3 |
| alerts / escalation_events | Evidence-backed prioritised alerts, acknowledgement and owner escalation | 3 |
| tenders / tender_versions / budgets / cost_commitments / cost_entries | Estimator snapshots, fixed vs daily costs, contingency reserve distinct from actual spend | 4 |
| variations / variation_instructions / valuations | Unique reference, evidence, authority, unapproved exposure and programme impact | 4 |
| payment_applications / certificates / payment_notices / payment_events | Contractual review, legal notice dates and due sums independent of QA holds | 4 |
| snags / handover_versions / handover_signatures / performance_events | Evidence-based closure, private versioned PDFs, genuine sign-offs and attributable performance | 5 |

Financial fields are stored separately: hiding a widget cannot protect a row's
columns. Phase 1 deliberately has no editable passed-gate or installation-release
field. No fixture or demo data is seeded into the application.

## 3. Role and permissions matrix

| Capability | Owner | Contracts manager | Supervisor | Lead installer | Subcontract installer |
| --- | --- | --- | --- | --- | --- |
| Scope | Own organisation | Allocated contracts | Allocated contracts | Allocated packages | Allocated packages |
| Manage roles / financial permission | Yes | No | No | No | No |
| Create/manage contract and area | Yes | Allocated / newly created | Read | Read allocated | Read allocated |
| Commercial records and estimator | Yes | Explicit owner grant | No | No | No |
| Allocate site access | Yes | Operational staff on allocated contracts | No | No | No |
| View operational private documents | Yes | Allocated | Allocated | Allocated package/area | Allocated package/area |
| Upload evidence | Yes | Allocated | Allocated | Allocated package/area | Allocated package/area |
| Inspect / stop work (Phase 2) | Authorised inspector only | If separately authorised | Allocated, authorised | Report / self-check | Report / self-check |
| Critical independent approval (Phase 2) | Only eligible independent inspector | Only eligible independent inspector | Performed inspection, independent | No | No |
| Payment certification (Phase 4) | Authorised | Explicit permission | Quality evidence only | Own application submission | No other gang's rates |

Inactive members and expired assignments have no access. Financial permission is
owner-managed and never accepted from client claims. Future client access uses a
published, sanitised portal boundary; it is not general read access to these tables.

## 4. Gate workflow and transactional state design

Definitions are versioned policy records, not unrelated status toggles. Gate 0:
commercial acceptance; 1: subcontractor approval; 2: substrate acceptance; 3:
system approval; 4: first installation; 5: corrective closure; 6: variation
authorisation; 7: payment certification; 8: final acceptance; 9: handover.

`not_started -> evidence_in_progress -> submitted -> approved | rejected`.
Rejection creates a linked corrective action. Remediation creates a new submission
and independent reinspection; the rejection is never rewritten. Approved decisions
can become stale/superseded through a revision change, expiry or scoped stop. Gate
5 is repeated per non-conformance; gates 6 and 7 apply per variation/application,
not as a single global checklist.

Transitions run in database transactions using row locks, an expected revision,
idempotency key, current membership/assignment, authorised actual inspector,
independence checks, required evidence and specification revision. The decision
and audit row commit together. A signature is an explicit attestation by the
authenticated actor, never an uploaded/generated imitation.

Mobilisation needs 0 and 1. Installation release needs 2 and 3 for that work area;
only the controlled first-inspection area may proceed before 4. Full production
needs 4. Critical stops block the affected area; unrelated safe areas remain
eligible. Controlled exceptions record scope, authority, risk and reason and never
convert technically unsafe work into compliant work or an unapproved variation
into commercial approval. Revision changes invalidate affected release snapshots.

Specified tolerances and inspection frequencies come from approved project policy;
there is no universal flatness/bedding tolerance. Lifted-tile evidence is required
where specified. Corrective preparation is separate from payment entitlement.
Payment QA review cannot alter statutory/contractual notices, deadlines or due
sums. Missing/stale evidence produces an amber/blocked state, never an invented
green status.

## 5. Development roadmap and acceptance mapping

1. **Foundation:** invite-only auth, roles, contract/package scope, private storage,
   commercial separation, immutable audit, real empty-state dashboard. Prove RLS,
   cross-tenant restrictions, private files, idempotency and no fabricated release.
2. **Quality engine:** approved revision policy, substrate/system/first-area forms,
   actual inspections, independent decisions, scoped stops and corrective closure.
   Prove installer self-approval/bypass denial, rejected-substrate blocking,
   supervisor stops, independent reinspection, revision invalidation and decision
   audit. Keep inspection history immutable.
3. **Site operations:** subcontractor competence/expiry, gangs, daily diaries,
   mobile/offline drafts with visible unsynchronised state, safe retry, progress and
   prioritised escalation. Prove duplicate-report prevention and missing-document
   warnings; attribute client/substrate delays separately.
4. **Commercial:** approved tender conversion, variations, costs/cash forecasting,
   applications, notices and certifications. Prove fixed pricework stays fixed,
   daily costs rise with duration, contingency is not actual expenditure,
   variations need authority and QA does not override payment deadlines.
5. **Handover/intelligence:** snag reinspection, final acceptance, versioned PDF
   handover, evidence-based scorecards and genuine portfolio reporting.

Each phase has an isolated-backend preview, automated acceptance evidence and its
own reviewable PR. No automatic production merge, migration or live data mutation.

## 6. Phase 1 implementation plan

- Create a dedicated feature branch and add migrations plus an isolated local
  PostgreSQL RLS/storage test harness. Existing marketing files remain unchanged.
- Add Supabase SSR cookie sessions, login/signout, server-side access checks and
  `/admin` protection. Owner or expressly authorised manager accesses estimator.
- Add owner membership administration, contract create/edit, separate commercial
  details, areas/packages, explicit staff allocations and real audit history.
- Add private PDF/JPEG/PNG evidence with bounded size, content signature checks,
  immutable revision metadata, actor identity and authorised signed downloads.
- Validate creates/edits, reject stale edits and duplicate-key payload conflicts,
  and distinguish empty/missing records from service failures.
- Deliver mobile layouts and honest blocked/missing-document indicators. No
  operational release, fabricated approval or automatic green project status.
- Run type check, production build, real PostgreSQL permission tests, meaningful
  application tests and phone-width browser checks. Preserve estimator pricing.
- Publish only a review preview with a dedicated staging backend. The feature
  branch is published and draft PR #4 is open. Vercel/Supabase account credentials
  are not yet available here; hosted acceptance remains outstanding.

## Deployment, backup and recovery boundaries

Environment variables must point explicitly to the dedicated staging project;
public URL/key are safe connection values, never membership authority. Disable
public signup and configure allowed redirect URLs. Bootstrap the first owner using
trusted SQL after creating their Auth user; no first-visitor/first-signup owner rule.
Production needs separately approved migration and Supabase backup settings, a
database export/restore drill and a separate private-object backup/restore plan.
Database backups alone do not restore uploaded Storage objects. Export manifests
with content hashes, test RLS again after restore, and retain audit history.
