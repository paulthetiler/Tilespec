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
| A8 (applied) | **Applied to production on 28 October 2026**, recorded as `20261024090000_job_messages.sql` → `20261028163603 job_messages`. The preflight was clean before and after, and the new objects match the repository |  Lets the supervisor ask the office questions about the job or a record, and the office reply, with "Seen" receipts. Without it the message box stays hidden and everything else works | Supabase SQL or migration tool |
| A9 (applied) | **Applied to production on 28 October 2026**, after A8, recorded as `20261028090000_dayworks.sql` → `20261028165123 dayworks`. The preflight was clean before and after, and the new objects match the repository | Lets supervisors record dayworks, the office approve them and record the client's authorisation, and money access set day rates, price and approve the charge. Without it the Dayworks pages stay "Not built yet" and everything else works | Supabase SQL or migration tool |

A1 and A2 also fix the public enquiry form. Test it once afterwards with a short
enquiry marked TEST and one small PDF, then check it under Tenders.

Status on 2 November 2026: A3, A4, A8 and A9 are done. A1, A5 and A6 are still open, and
production has only the owner's login, with no supervisor yet. Steps marked **(A1)** below
need the Production secret key, because they save a photo or a file. Without it, run every
other step and repeat the (A1) steps once it is added.

## 2. Office set-up (owner, desktop, about 30 minutes)

Use the existing screens. Each step must show "Saved".

| # | Step | Screen | Check |
| --- | --- | --- | --- |
| O1 | Add the supervisor: paste their user ID, role Supervisor | Everything else → User access | They appear as an active member |
| O2 | Choose or create the real job. Fill in working hours (for example `07:30 to 16:30`), dates, specification | Jobs → the job | Working hours drive the reminder times |
| O3 | Add the real locations for the trial day, plus one location named `TRIAL AREA – not real work` | Job → Locations | Locations show in the tree |
| O4 | Allocate the supervisor to the job | Job → Staff allocations | Allocation listed with today's date |
| O5 **(A1)** | Upload the current drawing for one location (operational) | Job → Documents | Revision shows as uploaded, not pending |
| O6 | Record the gang: company, team and its people | Everything else → Workforce | Team listed with its lead |
| O7 | Plan the gang at one real location for the trial day | Job → Plan | Plan shows on the day |
| O8 | Publish the workmanship checklist for that location and stage, and decide which inspections apply | Today → "Confirm which inspections apply" (or Everything else → Site dashboards → the job → Check workmanship) | That action has left Today |
| O9 | Send one instruction that needs acknowledgement, and one inspection request for the planned location | Messages → the job | Both listed under Saved messages |
| O10 | Set the job's daywork rates: operative and supervisor per hour, and one material the gang uses | Job → Daywork rates (money access only) | Each rate is listed |
| O11 (optional) | Add a second office user without money access (role Contracts manager, money access off), to check what they can see in D11 | Everything else → User access | They appear as an active member |

## 3. Trial day (supervisor, own phone, on site, no training)

Give the phone and say only: "You have just arrived. Open this." Record the time to
the first correct tap, wrong taps and any question asked.

| # | Step | Pass when |
| --- | --- | --- |
| S1 | Opens the invitation email, sets a password, signs in | Lands straight on the job's Today (one job, so no picker) |
| S2 | Does what the main button says: morning checks | All 11 answered and saved. The main button moves on by itself |
| S3 | Confirms the gang is here | Saved. The gang shows as on site |
| S4 | Reads the instruction and taps Got it | It leaves Then. The office sees it acknowledged |
| S5 **(A1)** | Opens the drawing from Drawings and documents | The file opens on the phone |
| S6 | Does the office's inspection request: checks, photo if needed, sends the result | The office sees the saved result. It does not release anything |
| S7 **(A1)** | Report an issue → No, just record it: a real snag with a photo | Saved. Today now says "Say who will fix this snag". Without A1 the snag stays a draft, because it needs a verified photo |
| S8 **(A1)** | Chooses the gang and a date for that snag | It moves to Waiting on others |
| S9 | Report an issue → quality hold on `TRIAL AREA – not real work` | Saved. Today shows the stopped work for that area only |
| S10 | Owner releases the trial hold (supervisor cannot, as the raiser) | Supervisor sees "This decision is for the office". After release it leaves both Todays |
| S11 | Finish today: handover | Saved. The owner reads it under Messages |
| S12 | Asks the office a question with "I need an answer" ticked: Messages → "Message the office", or "Ask the office about this" on a record | Saved. The owner's Today shows "Reply to" the supervisor; the owner replies; the supervisor taps Got it; the owner sees "Seen by …" |

### Dayworks (M4)

Use a real piece of extra work if there is one; otherwise a small one on
`TRIAL AREA – not real work`, described as a test. Everything saved is permanent.

| # | Who | Step | Pass when |
| --- | --- | --- | --- |
| D1 | Supervisor | Report an issue → "Daywork (paid by the hour)": what, where, who asked for it, the people and hours, and one material | Saved and sent in one step. The page says it is not approved yet, and that recording work is not permission to proceed or agreement to pay |
| D2 | Supervisor | The client's representative signs (name and position). If they refuse or are not there, record that with the reason | The signature status shows it. It confirms the work only, not payment |
| D3 | Supervisor | Looks over the whole daywork | Every status is shown separately, and there is no rate, price, total or £ anywhere |
| D4 **(A1)** | Supervisor | Adds a photo of the work or the signed sheet | It shows as verified. Without A1 it says photos cannot be saved yet, and the daywork is unaffected |
| D5 | Owner | Today → "Review daywork DW-1" → Approve the work | Office status: approved. No reason is asked, because the supervisor submitted it |
| D6 | Owner | Records the client's authorisation of the cost, with the instruction reference | Client status: authorised. It is separate from the signature and the office approval |
| D7 | Owner | Today → "Price daywork DW-1" → Price it from the job's rates | The total shows, and the charge status is priced. If a line has no rate yet, it cannot be priced and stays "Awaiting pricing" until the rate is added |
| D8 | Owner | Today → "Approve the charge for daywork DW-1" → Approve the charge internally | Charge approved internally, marked as not the client's acceptance or agreement to pay |
| D9 | Owner | Changes one rate on the job | The daywork's price stays exactly as it was |
| D10 (optional) | Owner | Records a daywork themselves, then approves it | It is refused until a reason is given; the reason is logged in the daywork's history |
| D11 (optional, needs O11) | Office user without money access | Opens the daywork and Today | Statuses only: no charge section, no £, and Today never asks them to price or approve the charge |
| D12 | Supervisor | Opens the daywork again | Sees the office, signature, charge and client statuses, still with no money |

Pass overall: S1 to S12, D1 to D9 and D12 done without help, every save confirmed, and the
owner's Today showed each item when it needed the owner and not after. The (A1) steps
pass once the Production secret key is added.

## 4. Record and roll back

Note each step as Pass, Fail (what happened) or Needed help (what was asked), with
screenshots of anything unexpected. To roll back the screens, unset A4 and redeploy.
Messages and dayworks stay available after that, because they depend on A8 and A9, not
on A4. Saved records stay: they are the real job's history.

## 5. Not covered by this trial

Subcontractor Today (needs B1), tender replies (B5), owner margin sign-off (B3),
variations (M5, not built yet) and claims (B4, B6), office reviews and instruction
changes (needs A7), and inviting staff from inside the app.
