# 11. Two-way communication and commercial records

**Status: proposal. Nothing in sections 3 to 7 is built.** Every item labelled
New backend needs the owner's approval before any migration is written. The
Query-only stage (section 2) is in the same pull request as this document.

The aim is one connected job workflow. The office and the supervisor work on the
same job story, and every time information moves from one side to the other, the
person who must act gets a clear next action. When they act, the other side sees
it on their next screen.

## 1. Rules for the design

| Rule | What it means in practice |
| --- | --- |
| One job story | Everything appears in Job Activity, newest first, with who and when. Nothing lives only in someone's inbox |
| One owner per step | Each step has exactly one person or role who acts. Everyone else sees it as waiting, with the owner's name |
| Done only when saved | An action disappears only when a saved record completes it. Nothing is ticked off on screen |
| Threads on records | A reply is attached to the thing it is about (snag, stop, instruction, inspection result, handover, daywork, variation), not floating in a separate chat |
| Supervisor stays simple | Today, People, Inspect, Issues, and Report an issue. Any new capability is reached from Today or from the record. No new menu |
| No money on site | Supervisors record what happened (hours, materials, who asked). Rates, prices and approval values are only visible with money access |
| Same safety as today | Append-only records, audit events, request keys so a retry never duplicates, row-level security, verified private photos. No existing record is rewritten |

## 2. Stage A: built now (Query only, no database change)

| What | Where |
| --- | --- |
| Job Activity: the shared, chronological story of a job | Supervisor: Today → More → Job activity. Office: the job page, a job's Messages page, the Messages index and each "From site" item |
| Office Today "From site" list: inspection results with problems, and handovers with problems or notes for the office | Office Today, under the main action. Shown for 7 days (configurable); a result drops off when a snag or stop is raised from it |
| Office repair instructions and target date on Supervisor Today | The snag or stop row, including while waiting on the gang |
| Who acknowledged an instruction, and when | The job's Messages page and the Messages index |
| One owner for "Say who will fix this snag" (the office) and duplicate buttons removed | Today and the snag pages |

What Stage A cannot do, because no record exists: the supervisor cannot send the
office a message; nothing records that the office has reviewed a result or a
handover; an instruction cannot be replaced or withdrawn; dayworks and variations
cannot be recorded. Stage B closes these gaps.

## 3. Proposed workflow (Stage B)

Each flow shows what the supervisor taps, what the office sees, and how it ends.

### B1. Messages and replies, both ways

```
Supervisor: on any record (snag, stop, instruction, result, handover) → "Reply" or "Ask the office"
            or Today → More → "Message the office" (about the job in general)
   → Office Today: "Reply to Dave: <first line>" (one owner: the office user who sent the
                    original, otherwise any office user for that job)
   → Office replies on the same thread → Supervisor Today: "Reply from Sam: <first line>"
   → Read receipt saved when opened; the person who asked sees "Seen 10:42"
```

Supervisor screen: one text box, optional photo, Send. A message can be marked
"needs an answer"; only those create a Next Action for the other side.

### B2. Instructions that can be changed or withdrawn

```
Office: open instruction → "Change it" → new text (and optional "Urgent")
   → Supervisor Today: "Changed: <new title>" with "Replaces: <old title>"; the old one is
      shown struck through and no longer asks for acknowledgement
   → Supervisor taps "Got it" → Office sees "Acknowledged by Dave at 07:52" on the new version
Office: "Withdraw" with a reason → the instruction leaves Supervisor Today with
   "Withdrawn by Sam: <reason>" in Job Activity
```

Urgent instructions sit above everything except safety stops on Supervisor Today.
There is no separate "priority" screen; urgency is a property of the instruction.

### B3. Office review of inspection results and handovers

```
Supervisor sends a result with problems, or a handover with problems or notes
   → Office Today: "Review the inspection result" / "Read Dave's handover" (one owner: office)
   → Office taps "Reviewed" and chooses: "Noted", "Snag raised", "Stop raised" or
      "Instruction sent" (the follow-up opens the existing form, pre-filled with the
      location and the result)
   → Supervisor sees "Office reviewed this at 11:20" on the result or handover and in
      Job Activity
```

The Stage A "From site" list becomes real Next Actions that complete when reviewed,
instead of disappearing after 7 days.

### B4. Dayworks

```
Supervisor: Report an issue → "Extra work" → "Daywork (paid by the hour)"
   → short form: what, where, who asked for it (name and company), when, photos
   → during or after the work: people and hours, materials used → "Send to the office"
   → Office Today: "Review daywork: <what>" → "Authorise", "Ask for more detail" or "Reject",
      with a reason
   → If the job needs the client's signature: Supervisor Today: "Get the daywork signed" →
      name, position and a photo of the signed sheet (or a typed name and time)
   → Office (money access): "Price the daywork" → rates and total, kept in a separate
      commercial record
   → Job Activity shows each step; the supervisor never sees rates or totals
```

Rule: the person who recorded the daywork cannot authorise it.

### B5. Variations

```
Supervisor: Report an issue → "Extra work" → "Change to the agreed work (variation)"
   → what changed, where, who asked for it, photos or drawings. Nothing about money
   → Office Today: "Price and submit variation V-003" → costs (labour, materials, other)
      and price, in a separate commercial record → "Sent to the client"
   → Office Today: "Record the client's decision on V-003" → approved, rejected or
      withdrawn, with who decided, when and their reference or document
   → Supervisor Today: "V-003 approved: go ahead" (or "rejected: do not do this work"),
      sent as an instruction that needs acknowledging
```

Until a variation is approved, the supervisor sees it as "Waiting on the client" and
Today warns: "Do not start this work until it is approved." This is an alert, not a
database block, unless the owner decides otherwise.

### B6. Next actions when information moves

| When this is saved | The person who acts | What they see | Completed by |
| --- | --- | --- | --- |
| Message marked "needs an answer" | The other side (named person first) | "Reply to <name>" | A reply on the same thread |
| Urgent instruction | The supervisor it is for | Top of Today: "Urgent: <title>" | Acknowledgement |
| Changed instruction | The supervisor | "Changed: <title>" | Acknowledgement of the new version |
| Inspection result with problems | Office | "Review the inspection result" | Office review saved |
| Handover with problems or notes | Office | "Read Dave's handover" | Office review saved |
| Daywork sent | Office | "Review daywork" | Authorise, reject or ask for detail |
| Daywork needs client signature | Supervisor | "Get the daywork signed" | Signature evidence saved |
| Daywork authorised | Office (money access) | "Price the daywork" | Commercial record saved |
| Variation raised | Office | "Price and submit V-n" | Sent to the client |
| Variation sent to the client | Office | "Record the client's decision" | Decision saved |
| Variation decided | Supervisor | "V-n approved: go ahead" or "rejected" | Acknowledgement |

Every row is a new engine rule in `lib/operations/next-actions/rules.ts`, reading the new
records. Nothing is completed by the system.

## 4. Backend changes (New backend, each needs approval)

All additive and transactional, with a read-only preflight, a disposable local
database test (`npm run test:db`), audit triggers, request keys and append-only
guards, like the existing migrations. No existing row is rewritten.

| # | Migration | New or changed records | Functions | Who can do what |
| --- | --- | --- | --- | --- |
| M1 | Job messages | `job_messages` (job, author, side, body, optional photo, about: record type and id, reply_to, needs_answer); `job_message_reads` (who read it, when) | `post_job_message`, `mark_job_message_read` | Office and supervisors assigned to the job read and write. Installers excluded until B1 (gang plan access) |
| M2 | Instruction changes | `supervisor_office_items` gains `replaces_id` and `urgent` (nullable, default false); new `supervisor_office_item_withdrawals` (reason, who, when) | `create_supervisor_office_item` accepts `replaces_id` and `urgent`; new `withdraw_supervisor_office_item` | Office only. The supervisor's acknowledgement applies to the newest version |
| M3 | Office reviews | `office_reviews` (subject: inspection result or handover, outcome, note, optional follow-up record, reviewer, when; one review per subject) | `record_office_review` | Office only. Supervisors can read that a review happened and when |
| M4 | Dayworks | `dayworks` (job, location, what, who instructed it, when, status); `daywork_labour` (person, hours, date); `daywork_materials` (item, quantity, unit); `daywork_photos` (verified private evidence, as for snags); `daywork_events` (record, send, authorise, reject, ask for detail, client signed); `daywork_commercials` (rates, total; money access only) | `create_daywork`, `add_daywork_lines`, `send_daywork`, `decide_daywork`, `record_daywork_signoff`, `price_daywork` | Supervisor records and sends. Office decides (not the person who recorded it). Pricing needs money access |
| M5 | Variations | `variations` (job, reference V-n, what changed, where, who asked, status); `variation_events` (raise, price, send, decide, withdraw); `variation_documents` (links to existing document revisions); `variation_commercials` (costs, price, approved value; money access only) | `raise_variation`, `price_variation`, `send_variation`, `record_variation_decision`, `withdraw_variation` | Supervisor or office raises. Office prices, sends and records the client's decision. Money only with money access |

The two "not built yet" pages for Variations and Dayworks are replaced by M4 and M5.
Nothing in M1 to M5 changes release rules, hold independence, inspection
requirements or existing money calculations.

## 5. Screens

| Who | Change | Where |
| --- | --- | --- |
| Supervisor | "Reply" on records, "Message the office" in More | Today, record pages |
| Supervisor | "Extra work" as a fourth choice in Report an issue, leading to the daywork or variation form | Report an issue |
| Supervisor | Daywork and variation status on Today and in Job Activity | Today |
| Office | New actions from B6 on Office Today; "Reviewed" on results and handovers; "Change it" and "Withdraw" on instructions | Office Today, record pages |
| Office | Dayworks and variations list per job, with status | Job page, replacing the "not built yet" links |
| Owner, money access | Prices and approved values on the Money page | Money |

All forms follow the existing pattern: a failed save keeps everything typed, and
"Saved" appears only when the database confirms it.

## 6. Recommended order

| Step | Contents | Size | Why first |
| --- | --- | --- | --- |
| 1 | M3 office reviews and M2 instruction changes | Small | Closes the loops found in the audit, using records that already exist |
| 2 | M1 messages and replies | Medium | Lets the supervisor talk to the office about any record |
| 3 | M4 dayworks | Large | Direct commercial value; reuses M1 for questions |
| 4 | M5 variations | Large | Builds on the daywork pattern |

Each step is one pull request: a migration with preflight and tests, engine rules
and screens behind the existing flags, then a hosted rehearsal before production.

## 7. Decisions needed from the owner

1. Approve M1 to M5 individually, and the order above.
2. Dayworks: who may authorise (any office user, a named manager, or the owner)? Is
   the client's signature required on every daywork, or only above a value or for
   some clients?
3. Daywork rates: per person, per trade or per job? Who enters them?
4. Variations: does the supervisor raise them, or only flag "possible variation" for
   the office to raise? Should work be blocked in the database until approved, or
   is a clear warning enough?
5. Messages: should a supervisor be able to message the office about the job in
   general, or only about a specific record?
6. Notifications: is an email or phone notification needed for urgent instructions
   and safety stops? This is separate from the records above and needs its own
   approval.
