# 10. Real job trial: one job, one supervisor

The aim is to prove the whole supervisor loop on the live system with real data:
**select job → see next action → complete it or report an issue → next action**.
One real job, one real supervisor, one gang, one working day. Everything saved is
permanent and audited, so only real information is entered.

## 1. Before the trial (each item needs the owner's approval)

| # | Change | Why | Where |
| --- | --- | --- | --- |
| A1 | Add `SUPABASE_SERVICE_ROLE_KEY` (the TileSpec project's secret key, marked Sensitive, never `NEXT_PUBLIC_`) to Vercel **Production**, then redeploy | Without it no file can be verified: the public enquiry form fails, a supervisor cannot add the photo a snag needs, and the office cannot upload drawings | Vercel → tilespec → Settings → Environment Variables |
| A2 | Apply `supabase/migrations/20261013210000_tender_enquiries.sql` to the TileSpec project | Creates the missing `tender_enquiries` table and private `tilespec-tenders` bucket that the website form writes to | Supabase SQL or migration tool |
| A3 | Merge this pull request and let it deploy | Supervisor simplifications | GitHub |
| A4 | Set `FEATURE_NEXT_ACTIONS=supervisor,owner` and `FEATURE_ROLE_SHELL=supervisor,owner` in Vercel **Production**, then redeploy | Turns on the new Today for the supervisor and the owner only. Unsetting both and redeploying restores the old screens | Vercel environment variables |
| A5 | Check Supabase Auth: Site URL `https://tilespec.vercel.app`, that URL in the redirect allow list, public sign-up off, invite and recovery templates as in `docs/operations/deployment.md` | The supervisor's invitation link must land on the real site | Supabase → Authentication |
| A6 | Invite the supervisor in Supabase Auth with their real email | Creates their login. There is no in-app invite yet | Supabase → Authentication → Users |
| A7 (optional) | After the M3/M2 pull request is merged: back up, run `supabase/inspection/office-reviews-preflight.sql`, then apply `20261023090000_office_reviews_instruction_changes.sql` | Lets the office review results and handovers, and change, mark urgent or withdraw instructions. Without it those controls stay hidden and everything else works | Supabase SQL or migration tool |
| A8 (optional) | After the M1 pull request is merged: back up, run `supabase/inspection/job-messages-preflight.sql`, then apply `20261024090000_job_messages.sql` | Lets the supervisor ask the office questions about the job or a record, and the office reply, with "Seen" receipts. Without it the message box stays hidden and everything else works | Supabase SQL or migration tool |
| A9 (optional) | After the M4 pull request is merged: back up, run `supabase/inspection/dayworks-preflight.sql`, then apply `20261028090000_dayworks.sql`. If M1 is wanted too, apply A8 first | Lets supervisors record dayworks, the office approve them and record the client's authorisation, and money access set day rates, price and approve the charge. Without it the Dayworks pages stay "Not built yet" and everything else works | Supabase SQL or migration tool |

A1 and A2 also fix the public enquiry form. Test it once afterwards with a short
enquiry marked TEST and one small PDF, then check it under Tenders.

## 2. Office set-up (owner, desktop, about 30 minutes)

Use the existing screens. Each step must show "Saved".

| # | Step | Screen | Check |
| --- | --- | --- | --- |
| O1 | Add the supervisor: paste their user ID, role Supervisor | Everything else → User access | They appear as an active member |
| O2 | Choose or create the real job. Fill in working hours (for example `07:30 to 16:30`), dates, specification | Jobs → the job | Working hours drive the reminder times |
| O3 | Add the real locations for the trial day, plus one location named `TRIAL AREA – not real work` | Job → Locations | Locations show in the tree |
| O4 | Allocate the supervisor to the job | Job → Staff allocations | Allocation listed with today's date |
| O5 | Upload the current drawing for one location (operational) | Job → Documents | Revision shows as uploaded, not pending |
| O6 | Record the gang: company, team and its people | Everything else → Workforce | Team listed with its lead |
| O7 | Plan the gang at one real location for the trial day | Job → Plan | Plan shows on the day |
| O8 | Publish the workmanship checklist for that location and stage, and decide which inspections apply | Today → "Confirm which inspections apply" (or Everything else → Site dashboards → the job → Check workmanship) | That action has left Today |
| O9 | Send one instruction that needs acknowledgement, and one inspection request for the planned location | Messages → the job | Both listed under Saved messages |

## 3. Trial day (supervisor, own phone, on site, no training)

Give the phone and say only: "You have just arrived. Open this." Record the time to
the first correct tap, wrong taps and any question asked.

| # | Step | Pass when |
| --- | --- | --- |
| S1 | Opens the invitation email, sets a password, signs in | Lands straight on the job's Today (one job, so no picker) |
| S2 | Does what the main button says: morning checks | All 11 answered and saved. The main button moves on by itself |
| S3 | Confirms the gang is here | Saved. The gang shows as on site |
| S4 | Reads the instruction and taps Got it | It leaves Then. The office sees it acknowledged |
| S5 | Opens the drawing from Drawings and documents | The file opens on the phone |
| S6 | Does the office's inspection request: checks, photo if needed, sends the result | The office sees the saved result. It does not release anything |
| S7 | Report an issue → No, just record it: a real snag with a photo | Saved. Today now says "Say who will fix this snag" |
| S8 | Chooses the gang and a date for that snag | It moves to Waiting on others |
| S9 | Report an issue → quality hold on `TRIAL AREA – not real work` | Saved. Today shows the stopped work for that area only |
| S10 | Owner releases the trial hold (supervisor cannot, as the raiser) | Supervisor sees "This decision is for the office". After release it leaves both Todays |
| S11 | Finish today: handover | Saved. The owner reads it under Messages |
| S12 | Today → More → Dayworks | The page says "Not built yet. Nothing on this page is saved." and says what to do instead. There is no form to fill in |

Pass overall: S1 to S12 done without help, every save confirmed, and the owner's
Today showed each item when it needed the owner and not after.

## 4. Record and roll back

Note each step as Pass, Fail (what happened) or Needed help (what was asked), with
screenshots of anything unexpected. To roll back the screens, unset A4 and redeploy.
Saved records stay: they are the real job's history.

## 5. Not covered by this trial

Subcontractor Today (needs B1), tender replies (B5), owner margin sign-off (B3),
recording variations, dayworks and claims (B4, B6; reachable but not built), and inviting staff from inside the app.
