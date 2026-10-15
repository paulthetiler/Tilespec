import assert from "node:assert/strict";
import { test } from "node:test";
import { handoverInput, isRecordId, officeItemInput } from "../lib/operations/daily-input";

const contract = "e2e00000-0000-4000-8000-0000000000c1";
const supervisor = "e2e00000-0000-4000-8000-000000000001";
const area = "e2e00000-0000-4000-8000-0000000000a1";
const form = (data: Record<string, string>) => { const result = new FormData(); for (const [key, value] of Object.entries(data)) result.set(key, value); return result; };

test("office inspection requests require an explicit supervisor, location and recognised stage", () => {
  const input = { contract_id: contract, kind: "qa_request", title: "Inspect bathroom", body: "Check the floor before lunch", recipient_id: supervisor, work_area_id: area, stage: "installation" };
  assert.equal(officeItemInput(form(input)).recipient_id, supervisor);
  assert.throws(() => officeItemInput(form({ ...input, recipient_id: "" })), /supervisor/);
  assert.throws(() => officeItemInput(form({ ...input, work_area_id: "" })), /location to inspect/);
  assert.throws(() => officeItemInput(form({ ...input, stage: "payment" })), /work to inspect/);
  assert.throws(() => officeItemInput(form({ ...input, due_on: "2026-02-30" })), /valid due date/);
});
test("site messages cannot smuggle inspection scope and only request acknowledgement explicitly", () => {
  const input = officeItemInput(form({ contract_id: contract, kind: "instruction", title: "Adhesive arriving", body: "Delivery at ten", work_area_id: area, stage: "payment" }));
  assert.equal(input.work_area_id, null); assert.equal(input.stage, null); assert.equal(input.acknowledgement_required, false);
});
test("handover uses London workforce finish times and requires meaningful office information", () => {
  const input = { contract_id: contract, day: "2026-10-15", at_time: "16:30", work_completed: "Block B floor completed", finish_workforce: "on" };
  const result = handoverInput(form(input));
  assert.equal(result.finished_at, "2026-10-15T15:30:00.000Z"); assert.equal(result.finish_workforce, true);
  assert.throws(() => handoverInput(form({ ...input, at_time: "" })), /time work finished/);
  assert.throws(() => handoverInput(form({ ...input, work_completed: "  " })), /short handover/);
});
test("a successful HTTP body must still contain a valid record identifier", () => {
  for (const value of [null, {}, true, "ok", "", [supervisor], "00000000-0000-0000-0000-000000000000"]) assert.equal(isRecordId(value), false);
  assert.equal(isRecordId(supervisor), true);
});
