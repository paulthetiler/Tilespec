# Next Action application UI harness

`npm run test:next-actions-ui` renders the real `NextActionsToday`, admin layout,
`RoleTabs` and Report Issue page in a disposable Next app outside the repository.
The shared rules engine, routing helpers, CSS and feature-flag implementation
are copied unchanged. Both flags are explicitly enabled in the child test
process only; application defaults remain OFF.

The harness checks 320px and 390px phones and an 820px tablet, real CTA targets,
the recorded location/activity/package on stopped work, issue choices, role
navigation, financial menu restrictions, touch targets and browser errors.
Set `SCREENSHOT_DIR` to retain screenshots.

The synthetic scenario and read-only server stubs replace authentication,
Supabase reads and the site's quality overview. A test cookie selects a fixture
member only in this temporary app. This verifies component rendering and route
wiring; it does not verify hosted sessions, RLS, Storage, writes or release
authorisation. No fixture route or stub is installed into the production app.
