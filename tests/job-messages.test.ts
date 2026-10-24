import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import Data from "../docs/redesign/prototype/data.js";
import { buildActivity, type ActivitySources } from "../lib/operations/activity";
import { aboutHref, aboutLabel, emptyLookups, jobThreadRows } from "../lib/operations/conversations";
import { firstLine, seenAt, threadState, threadsFrom, type JobMessage, type JobMessageRead } from "../lib/operations/daily";
import { aboutParam, messageInput } from "../lib/operations/daily-input";
import { ValidationError } from "../lib/operations/validation";
import { actionHref, adminActionHref, compute, ctaLabel, hrefIsExistingForm, type JobThreadRow, type NextActionSnapshot, type ViewerAction } from "../lib/operations/next-actions";

const root = path.resolve(__dirname, "..");
const source = (file: string) => readFileSync(path.join(root, file), "utf8");
const make = () => Data.make("start") as unknown as NextActionSnapshot;
const who = (s: NextActionSnapshot, first: string) => s.members.find(m => m.display_name.startsWith(first))!;
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ofRule = (actions: ViewerAction[], rule: string) => actions.filter(a => a.rule === rule);

const message = (over: Partial<JobMessage>): JobMessage => ({
  id: "t1", contract_id: "c1", thread_id: "t1", site_user_id: "u-dave", author_id: "u-dave", author_name: "Dave Collins", author_side: "site",
  body: "Which grout for the shower walls?\nThe spec says two colours.", needs_answer: true, about_type: "snag", about_id: "s1",
  created_at: "2026-10-24T08:00:00+00:00", request_key: id(1), ...over,
});
const reply = (over: Partial<JobMessage>) => message({ id: "r1", about_type: null, about_id: null, author_id: "u-sam", author_name: "Sam Patel", author_side: "office",
  body: "Use the light grey.", needs_answer: false, created_at: "2026-10-24T09:00:00+00:00", request_key: id(2), ...over });
const read = (over: Partial<JobMessageRead>): JobMessageRead => ({ id: "read1", message_id: "r1", reader_id: "u-dave", read_at: "2026-10-24T09:30:00+00:00", ...over });

// --- Conversation state --------------------------------------------------------------------
test("replies sit under the message that started the conversation, newest conversation first", () => {
  const threads = threadsFrom([
    message({}), reply({}), message({ id: "t2", thread_id: "t2", about_type: "job", about_id: null, body: "Skip on Friday?", created_at: "2026-10-24T08:30:00+00:00", request_key: id(3) }),
  ], []);
  assert.deepEqual(threads.map(thread => [thread.id, thread.messages.map(m => m.id)]), [["t1", ["t1", "r1"]], ["t2", ["t2"]]]);
  assert.equal(threads[0].about_type, "snag");
  assert.equal(threads[1].about_type, "job");
});

test("a question waits on the office until it is answered; a reply waits until the supervisor has read it", () => {
  const state = (messages: JobMessage[], reads: JobMessageRead[] = []) => threadState(threadsFrom(messages, reads)[0]).waitingOn;
  assert.equal(state([message({})]), "office", "a question marked 'I need an answer' waits on the office");
  assert.equal(state([message({ needs_answer: false })]), null, "a message that needs no answer creates no task");
  assert.equal(state([message({}), reply({})]), "site", "the office reply waits until the supervisor sees it");
  assert.equal(state([message({}), reply({})], [read({ reader_id: "u-sam" })]), "site", "only the supervisor in the conversation can clear it");
  assert.equal(state([message({}), reply({})], [read({})]), null, "Got it clears it");
  assert.equal(state([message({}), reply({ needs_answer: true })], [read({})]), "site", "a question from the office still needs an answer after it is read");
  assert.equal(state([message({}), reply({ needs_answer: true }), message({ id: "r2", about_type: null, about_id: null, needs_answer: false, body: "Done.", created_at: "2026-10-24T10:00:00+00:00", request_key: id(4) })]), null);
});

test("'Seen' is the first Got it or reply from the other side", () => {
  const [thread] = threadsFrom([message({}), reply({ created_at: "2026-10-24T09:00:00+00:00" })], [read({ message_id: "t1", reader_id: "u-sam", read_at: "2026-10-24T08:40:00+00:00" })]);
  assert.equal(seenAt(thread.messages[0], thread), "2026-10-24T08:40:00+00:00");
  assert.equal(seenAt(thread.messages[1], thread), null, "Dave has not seen the reply yet");
  const [replied] = threadsFrom([message({}), reply({})], []);
  assert.equal(seenAt(replied.messages[0], replied), "2026-10-24T09:00:00+00:00", "a reply proves the question was seen");
  assert.equal(firstLine(message({}).body), "Which grout for the shower walls?");
  assert.equal(firstLine("x".repeat(100)).length, 80);
});

test("conversations say what they are about and open that record", () => {
  const lookups = emptyLookups();
  lookups.snags.set("s1", "Lippage");
  lookups.holds.set("h1", "Quality hold, Wrong adhesive");
  lookups.items.set("m1", { title: "Kitchen grout first", kind: "instruction" });
  lookups.items.set("q1", { title: "Splashback ready?", kind: "qa_request" });
  lookups.results.set("res1", { item_id: "q1" });
  lookups.handovers.set("hd1", { work_date: "2026-10-23", actor_name: "Dave Collins" });
  assert.equal(aboutLabel("job", null, lookups), "About the job");
  assert.equal(aboutLabel("snag", "s1", lookups), "About the snag: Lippage");
  assert.equal(aboutLabel("snag", "unknown", lookups), "About the snag: a snag");
  assert.equal(aboutLabel("hold", "h1", lookups), "About the stop: Quality hold, Wrong adhesive");
  assert.equal(aboutLabel("office_item", "m1", lookups), "About the instruction: “Kitchen grout first”");
  assert.equal(aboutLabel("office_item", "q1", lookups), "About the inspection request: “Splashback ready?”");
  assert.equal(aboutLabel("qa_result", "res1", lookups), "About the inspection result: “Splashback ready?”");
  assert.match(aboutLabel("handover", "hd1", lookups), /^About Dave Collins’s handover of /);
  const base = "/admin/supervisor/sites/c1";
  assert.equal(aboutHref("job", null, lookups, base, false), null);
  assert.equal(aboutHref("snag", "s1", lookups, base, false), "/admin/snags/s1");
  assert.equal(aboutHref("hold", "h1", lookups, base, true), "/admin/holds/h1");
  assert.equal(aboutHref("office_item", "m1", lookups, base, false), `${base}/messages#message-m1`);
  assert.equal(aboutHref("office_item", "q1", lookups, base, false), `${base}/tasks/q1`);
  assert.equal(aboutHref("qa_result", "res1", lookups, base, false), `${base}/tasks/q1`);
  assert.equal(aboutHref("handover", "hd1", lookups, base, true), `${base}/messages?handover=hd1#handover-hd1`);
  assert.equal(aboutHref("handover", "hd1", lookups, base, false), `${base}/finish`);
  const [row] = jobThreadRows(threadsFrom([message({})], []), lookups);
  assert.deepEqual({ ...row, latest: row.latest.id }, { id: "t1", contract_id: "c1", site_user_id: "u-dave", about: "About the snag: Lippage", latest: "t1", waiting_on: "office" });
});

// --- Next Actions ---------------------------------------------------------------------------
const thread = (s: NextActionSnapshot, over: Partial<JobThreadRow> = {}, latest: Partial<JobThreadRow["latest"]> = {}): JobThreadRow => ({
  id: "t1", contract_id: "c1", site_user_id: who(s, "Dave").user_id, about: "About the snag: Lippage", waiting_on: "office", ...over,
  latest: { id: "t1", author_side: "site", author_name: "Dave Collins", body: "Which grout for the shower walls?\nThe spec says two colours.", needs_answer: true,
    created_at: `${s.today}T08:00:00+00:00`, ...latest },
});

test("a question from site is an office Next Action until someone replies", () => {
  const s = make();
  s.job_threads = [thread(s)];
  for (const person of ["Sam", "Jo", "Alex"]) {
    const [action] = ofRule(compute(s, who(s, person)), "R20");
    assert.equal(action?.state, "ready", `${person} can reply`);
    assert.equal(action.title, "Reply to Dave Collins: Which grout for the shower walls?");
    assert.equal(action.why, "About the snag: Lippage. Dave Collins needs an answer.");
    assert.equal(ctaLabel(action), "Reply");
    assert.equal(adminActionHref(action), "/admin/supervisor/sites/c1/messages?thread=t1#thread-t1");
    assert.ok(hrefIsExistingForm(adminActionHref(action), "/admin/supervisor/sites/c1"));
  }
  assert.deepEqual(ofRule(compute(s, who(s, "Dave")), "R20"), [], "the supervisor's own question is not a task for them");
  s.job_threads = [thread(s, { waiting_on: "site" }, { id: "r1", author_side: "office", author_name: "Sam Patel", body: "Use the light grey.", needs_answer: false })];
  assert.deepEqual(ofRule(compute(s, who(s, "Sam")), "R20"), [], "a reply completes it");
});

test("a reply from the office is the supervisor's Next Action until they read or answer it", () => {
  const s = make();
  const dave = who(s, "Dave");
  s.job_threads = [thread(s, { waiting_on: "site" }, { id: "r1", author_side: "office", author_name: "Sam Patel", body: "Use the light grey.", needs_answer: false })];
  const [action] = ofRule(compute(s, dave), "R21");
  assert.equal(action.state, "ready");
  assert.equal(action.title, "Reply from Sam Patel: Use the light grey.");
  assert.equal(action.why, "About the snag: Lippage.");
  assert.equal(ctaLabel(action), "Open");
  assert.equal(actionHref(action, "/admin/supervisor/sites/c1"), "/admin/supervisor/sites/c1/messages?thread=t1#thread-t1");
  assert.deepEqual(ofRule(compute(s, who(s, "Sam")), "R21"), [], "the office is not given the supervisor's task");
  s.job_threads = [thread(s, { waiting_on: "site" }, { id: "r1", author_side: "office", author_name: "Sam Patel", body: "Which day suits?", needs_answer: true })];
  const [question] = ofRule(compute(s, dave), "R21");
  assert.equal(question.title, "Answer Sam Patel: Which day suits?");
  assert.deepEqual(question.requires, ["Your reply"]);
  // Another supervisor on the job never receives Dave's conversation as their own task.
  s.members.push({ user_id: "u-other", display_name: "Other Supervisor", role: "supervisor", financial_access: false });
  s.contract_assignments.push({ contract_id: "c1", user_id: "u-other" });
  assert.equal(ofRule(compute(s, { user_id: "u-other", role: "supervisor", financial_access: false }), "R21")[0]?.state, "waiting");
  s.job_threads = [thread(s, { waiting_on: null }, { id: "r1", author_side: "office", author_name: "Sam Patel", body: "Use the light grey.", needs_answer: false })];
  assert.deepEqual(ofRule(compute(s, dave), "R21"), [], "Got it completes it");
});

test("without job messages in the database there are no conversation actions", () => {
  const s = make();
  assert.equal(s.job_threads, undefined);
  for (const person of ["Sam", "Dave", "Alex"]) assert.deepEqual(compute(s, who(s, person)).filter(a => a.rule === "R20" || a.rule === "R21"), []);
});

// --- Form input -----------------------------------------------------------------------------
test("a new message names what it is about; a reply names only its conversation", () => {
  assert.deepEqual(messageInput(form({ contract_id: id(1), body: "  Skip on Friday?  ", needs_answer: "on" })),
    { contract_id: id(1), about_type: "job", body: "Skip on Friday?", needs_answer: true });
  assert.deepEqual(messageInput(form({ contract_id: id(1), about_type: "snag", about_id: id(2), body: "Which grout?" })),
    { contract_id: id(1), about_type: "snag", about_id: id(2), body: "Which grout?", needs_answer: false });
  assert.deepEqual(messageInput(form({ contract_id: id(1), thread_id: id(3), about_type: "snag", about_id: id(2), body: "Light grey." })),
    { contract_id: id(1), thread_id: id(3), body: "Light grey.", needs_answer: false });
  assert.throws(() => messageInput(form({ contract_id: id(1), about_type: "invoice", about_id: id(2), body: "x" })), ValidationError);
  assert.throws(() => messageInput(form({ contract_id: id(1), about_type: "snag", body: "x" })), ValidationError);
  assert.throws(() => messageInput(form({ contract_id: id(1), body: "   " })), ValidationError);
  assert.equal(aboutParam(`snag:${id(2)}`)?.about_id, id(2));
  assert.equal(aboutParam("job:"), null);
  assert.equal(aboutParam("snag:not-an-id"), null);
  assert.equal(aboutParam(undefined), null);
});

// --- Job activity ---------------------------------------------------------------------------
const empty: ActivitySources = { snagEvents: [], snags: [], holdEvents: [], holds: [], messages: [], acknowledgements: [], results: [], handovers: [],
  morningChecks: [], inspections: [], plans: [], documents: [] };

test("job activity shows each question and reply, and opens the conversation", () => {
  const entries = buildActivity({ ...empty, jobMessages: [
    { ...message({}), about: "About the snag: Lippage" },
    { ...reply({}), about: "About the snag: Lippage" },
  ] }, { viewerId: "u-dave", names: new Map(), siteBase: "/admin/supervisor/sites/c1", contractId: "c1", office: false });
  const line = (key: string) => { const entry = entries.find(e => e.id === key)!; return `${entry.who} ${entry.what}`; };
  assert.equal(line("job-message:t1"), "You asked the office: “Which grout for the shower walls?”");
  assert.equal(entries.find(e => e.id === "job-message:t1")!.detail, "About the snag: Lippage · Needs an answer");
  assert.equal(line("job-message:r1"), "Sam Patel replied: “Use the light grey.”");
  assert.equal(entries.find(e => e.id === "job-message:r1")!.href, "/admin/supervisor/sites/c1/messages?thread=t1#thread-t1");
  assert.deepEqual(entries.map(e => e.id), ["job-message:r1", "job-message:t1"]);
});

// --- Hidden until the reviewed migration is applied ------------------------------------------
test("questions and replies stay hidden until their migration is applied, and loaders never write", () => {
  assert.match(source("lib/operations/daily-data.ts"), /const conversations = !missing\(messages\.error\) && !missing\(messageReads\.error\)/);
  assert.match(source("app/admin/supervisor/sites/[id]/messages/page.tsx"), /\{daily\.conversations && lookups && <JobConversations/);
  assert.match(source("components/site/next-actions-today.tsx"), /\{snapshot\.job_threads && member\.role === "supervisor" && <Link className=\{styles\.row\} href=\{`\$\{base\}\/messages#ask`\}><strong>Message the office<\/strong>/);
  assert.match(source("lib/operations/next-actions/office-snapshot.ts"), /optionalRows\("job_messages"/);
  assert.match(source("lib/operations/activity-data.ts"), /optionalPage\("job_messages"/);
  for (const page of ["app/admin/snags/[id]/page.tsx", "app/admin/holds/[id]/page.tsx"]) assert.match(source(page), /await conversationsAvailable\(supabase\)/);
  for (const file of ["lib/operations/conversation-data.ts", "lib/operations/activity-data.ts", "lib/operations/next-actions/office-snapshot.ts", "lib/operations/next-actions/snapshot-data.ts"])
    assert.doesNotMatch(source(file), /\.(insert|update|upsert|delete)\(|\.rpc\("(post_job_message|mark_job_message_read)/);
  // Saving goes only through the two reviewed functions.
  const actions = source("app/admin/supervisor/daily-actions.ts");
  assert.match(actions, /\.rpc\("post_job_message"/);
  assert.match(actions, /\.rpc\("mark_job_message_read"/);
  assert.doesNotMatch(actions, /from\("job_messages"\)\.(insert|update|upsert|delete)|from\("job_message_reads"\)\.(insert|update|upsert|delete)/);
});
