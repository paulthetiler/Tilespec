# Office and Owner Today application UI harness

`node scripts/test-admin-today-ui.mjs` renders the actual `AdminToday`, admin
layout, `RoleTabs`, shared Next Action engine, routing helpers and CSS in a
disposable Next app outside the checkout. Both feature flags are explicitly
enabled for office and owner in the child test process only. Defaults in the
application remain OFF.

The browser checks 320px and 390px phones and an 820px tablet for office staff
without financial access, office staff with financial access and the owner.
Synthetic saved-record snapshots contain more than 20 remaining actions,
independent-review restrictions, overdue work, waiting instructions and QA, long
names and distinctive financial figures. Assertions check one primary action,
the full untruncated shared-engine queue, exact counts, no duplicate tasks,
visible waiting and problem records, every active restriction's exact scope,
useful existing page destinations, four-or-fewer main navigation links, the
complete secondary menu, authorised Money links, no financial figures on Today,
44px controls, horizontal overflow and browser errors. The complete primary
task title must fit above the fixed navigation on the initial phone screen,
including when stopped-work and waiting/problem summaries are present.
An additional ordinary job/location scenario requires the whole primary action
button above navigation for both office and owner at 320px and 390px.

Set `SCREENSHOT_DIR` to retain nine full-page and nine first-screen phone/tablet
screenshots, plus four ordinary-job first-screen captures. The
test fixture supports only HMAC-signed role sessions and has no database client
or mutation handlers. It replaces authentication only inside this temporary
app; neither fixture routes nor synthetic records enter the real application.
This is a component/mobile test, not evidence of hosted Auth, RLS, Storage or
release authorisation. The separate authenticated acceptance suite verifies
real migrated database reads, role permissions, financial denial and flag-off
fallback behaviour.
