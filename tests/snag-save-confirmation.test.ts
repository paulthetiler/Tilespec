import test from "node:test";
import assert from "node:assert/strict";
import { confirmsSnagCreation, confirmsSnagTransition } from "../lib/operations/snag-save-confirmation";

const issue = "b1000000-0000-4000-8000-000000000001";
const contract = "b1000000-0000-4000-8000-000000000002";
const actor = "b1000000-0000-4000-8000-000000000003";

test("snag creation requires the persisted record for this site and authenticated reporter", () => {
  const saved = { id: issue, contract_id: contract, inspector_id: actor };
  assert.equal(confirmsSnagCreation(saved, issue, contract, actor), true);
  for (const record of [null, { ...saved, id: contract }, { ...saved, contract_id: issue }, { ...saved, inspector_id: contract }]) {
    assert.equal(confirmsSnagCreation(record, issue, contract, actor), false);
  }
  for (const response of [null, "", "HTTP 200", contract, { id: issue }]) {
    assert.equal(confirmsSnagCreation(saved, response, contract, actor), false);
  }
});

test("an expected-ID HTTP response without a persisted snag transition is not success", () => {
  const saved = { id: issue, contract_id: contract, version: 1, snag_status: "draft" };
  assert.equal(confirmsSnagTransition(saved, issue, issue, 1, "submit"), false);
  assert.equal(confirmsSnagTransition({ ...saved, version: 2 }, issue, issue, 1, "submit"), false);
  assert.equal(confirmsSnagTransition({ ...saved, version: 2, snag_status: "open" }, issue, issue, 1, "submit"), true);
  for (const response of [null, { id: issue }, contract]) {
    assert.equal(confirmsSnagTransition({ ...saved, version: 2, snag_status: "open" }, response, issue, 1, "submit"), false);
  }
});

test("missing, unrelated or malformed saved rows cannot confirm an action", () => {
  const saved = { id: issue, contract_id: contract, version: 3, snag_status: "assigned" };
  for (const record of [null, {}, { ...saved, id: contract }, { ...saved, contract_id: "" }, { ...saved, version: "3" }, { ...saved, version: 2.5 }]) {
    assert.equal(confirmsSnagTransition(record, issue, issue, 2, "assign"), false);
  }
});

test("repair submission and independent acceptance require their saved outcomes", () => {
  const saved = { id: issue, contract_id: contract, version: 8, snag_status: "reinspection" };
  assert.equal(confirmsSnagTransition(saved, issue, issue, 7, "accept"), false);
  assert.equal(confirmsSnagTransition({ ...saved, snag_status: "closed" }, issue, issue, 7, "accept"), true);
  assert.equal(confirmsSnagTransition(saved, issue, issue, 7, "submit_rectification"), false);
  assert.equal(confirmsSnagTransition({ ...saved, snag_status: "rectification_submitted" }, issue, issue, 7, "submit_rectification"), true);
});

test("idempotent submission replay can confirm a snag that has subsequently been assigned", () => {
  const saved = { id: issue, contract_id: contract, version: 4, snag_status: "assigned" };
  assert.equal(confirmsSnagTransition(saved, issue, issue, 1, "submit"), true);
  assert.equal(confirmsSnagTransition(saved, issue, issue, 3, "mark_unknown"), true);
  assert.equal(confirmsSnagTransition(saved, issue, issue, 4, "mark_unknown"), false);
});
