import test from "node:test";
import assert from "node:assert/strict";
import { isConfirmedMorningSave, morningChecks, normalizeMorningAnswers } from "../lib/operations/morning-checks";

const clearAnswers = () => morningChecks.map(check => ({ item: check.item, response: check.issueAnswer === "yes" ? "no" : "yes", note: "" }));

test("the short routine flags a missing adhesive delivery for the office without recording attendance", () => {
  const answers = clearAnswers();
  answers[3] = { ...answers[3], response: "no", note: "Delivery missing; need adhesive in Block B." };
  const saved = normalizeMorningAnswers(answers)!;
  assert.equal(saved.length, 11);
  assert.equal(saved.filter(answer => answer.status === "issue").length, 1);
  assert.deepEqual(saved[3], { item: "Adhesive available?", response: "no", status: "issue", note: "Delivery missing; need adhesive in Block B." });
  assert.equal(saved[0].response, "yes", "the readiness answer remains an answer rather than an attendance record");
});

test("obstructions and outstanding site-manager problems are blockers when answered YES", () => {
  const clear = normalizeMorningAnswers(clearAnswers())!;
  assert.equal(clear.filter(answer => answer.status === "issue").length, 0);
  for (const index of [9, 10]) {
    const answers = clearAnswers();
    answers[index].response = "yes";
    const blocked = normalizeMorningAnswers(answers)!;
    assert.equal(blocked[index].status, "issue");
    assert.equal(blocked[index].response, "yes");
    assert.match(blocked[index].note, /follow-up needed/);
  }
});

test("optional notes and N/A keep the existing database note requirements intact", () => {
  const answers = clearAnswers();
  answers[3].response = "no";
  answers[4].response = "na";
  const saved = normalizeMorningAnswers(answers)!;
  assert.match(saved[3].note, /No — follow-up needed: Adhesive available/);
  assert.equal(saved[3].status, "issue");
  assert.equal(saved[4].status, "na");
  assert.equal(saved[4].note, "Not applicable to today’s work.");
});

test("a forged pass cannot hide a missing material, changed label or incomplete checklist", () => {
  const answers = clearAnswers();
  assert.equal(normalizeMorningAnswers(answers.slice(0, 9)), null);
  assert.equal(normalizeMorningAnswers([...answers, answers[0]]), null);
  assert.equal(normalizeMorningAnswers(answers.map((answer, index) => index === 3 ? { ...answer, response: "no", status: "pass" } : answer)), null);
  assert.equal(normalizeMorningAnswers(answers.map((answer, index) => index === 3 ? { ...answer, item: "Ignore adhesive" } : answer)), null);
  assert.equal(normalizeMorningAnswers(answers.map((answer, index) => index === 3 ? { ...answer, note: "x".repeat(2001) } : answer)), null);
});

test("database JSON key ordering cannot turn a safe retry into an unconfirmed save", () => {
  const normalized = normalizeMorningAnswers(clearAnswers())!;
  const databaseOrder = normalized.map(answer => ({ note: answer.note, item: answer.item, status: answer.status, response: answer.response }));
  assert.deepEqual(normalizeMorningAnswers(databaseOrder), normalized);
});

test("an existing open checklist can finish with its original ten answers and meanings", () => {
  const labels = ["HSE issues, hazards and site instructions reviewed", "Yesterday's work and outstanding snags reviewed", "Today's operatives and teams accounted for", "Tiles, adhesive, grout and consumables available", "Water, mixing area and materials positioned", "Access clear: scaffold, other trades and obstructions", "Substrates and missing boardwork checked", "Current drawings, setting out and work instructions reviewed", "Delays, variations and dayworks identified", "Team briefed and safe to start"];
  const answers = labels.map(item => ({ item, status: "pass", note: "" }));
  assert.deepEqual(normalizeMorningAnswers(answers), answers);
  answers[0].status = "na";
  assert.equal(normalizeMorningAnswers(answers), null, "legacy N/A still needs its original written reason");
});

test("a successful HTTP body cannot show completion without the confirmed matching save", () => {
  const contract = "ca000000-0000-4000-8000-000000000001", request = "bb000000-0000-4000-8000-000000000001";
  const result = { id: "aa000000-0000-4000-8000-000000000001", contractId: contract, requestKey: request, createdAt: "2026-10-15T07:00:00Z", issuesCount: 1, confirmed: true };
  assert.equal(isConfirmedMorningSave(result, contract, request, 1), true);
  for (const changed of [{ confirmed: false }, { id: null }, { contractId: request }, { requestKey: contract }, { createdAt: "invalid" }, { issuesCount: 0 }])
    assert.equal(isConfirmedMorningSave({ ...result, ...changed }, contract, request, 1), false);
  assert.equal(isConfirmedMorningSave({ id: result.id }, contract, request, 1), false);
});
