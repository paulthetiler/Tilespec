"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import {
  arrivalInput, confirmAsPlannedInput, confirmChangesInput, departureInput, finishDayInput, finishInput, leadInput, moveInput, newArrivalInput,
  notOnSiteInput, unplannedInput, uuid, voidRecordInput,
} from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

// The supervisor's daily workforce. Every change is a Supervisor V2 database
// function called with the signed-in user's own session, so the database
// decides who may record what on which contract. A success message is shown
// only after the database has confirmed the change.
const failure = (error: unknown): ActionState => ({ error: error instanceof Error ? error.message : "The change could not be saved. Try again." });
function refresh(contractId: string) {
  for (const path of ["", "/workforce", "/history"]) revalidatePath(`/admin/supervisor/sites/${contractId}${path}`);
  revalidatePath(`/admin/contracts/${contractId}/actual`);
}
const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

export async function confirmAsPlannedAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = confirmAsPlannedInput(form);
    checkRpc((await supabase.rpc("confirm_planned_allocation", { p_request_key: uuid(form, "request_key"), p_data: input })).error);
    refresh(input.contract_id);
    return { success: `Confirmed as planned: ${people(input.groups[0].operative_ids.length)} on site.` };
  } catch (error) { return failure(error); }
}
export async function confirmChangesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = confirmChangesInput(form);
    checkRpc((await supabase.rpc("confirm_planned_allocation", { p_request_key: uuid(form, "request_key"), p_data: input })).error);
    refresh(input.contract_id);
    const here = input.groups.reduce((total, group) => total + group.operative_ids.length, 0);
    return { success: `Confirmed with changes: ${people(here)} on site${input.absent ? `, ${input.absent.length} absent` : ""}.` };
  } catch (error) { return failure(error); }
}
export async function notOnSiteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    checkRpc((await supabase.rpc("record_allocation_absence", { p_request_key: uuid(form, "request_key"), p_data: notOnSiteInput(form) })).error);
    refresh(uuid(form, "contract_id"));
    return { success: "Recorded as not on site." };
  } catch (error) { return failure(error); }
}
export async function undoNotOnSiteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = voidRecordInput(form);
    checkRpc((await supabase.rpc("void_allocation_absence", { p_absence: input.id, p_reason: input.reason })).error);
    refresh(uuid(form, "contract_id"));
    return { success: "Not on site removed. The record is kept with your reason." };
  } catch (error) { return failure(error); }
}
export async function moveAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = moveInput(form);
    checkRpc((await supabase.rpc("reallocate_actual_allocation", { p_request_key: uuid(form, "request_key"), p_allocation: input.allocation_id, p_data: input.data })).error);
    refresh(uuid(form, "contract_id"));
    return { success: input.data.targets.length > 1 ? "Split recorded. The earlier period is kept." : "Move recorded. The earlier period is kept." };
  } catch (error) { return failure(error); }
}
export async function arrivalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = arrivalInput(form);
    checkRpc((await supabase.rpc("add_allocation_operative", { p_allocation: input.allocation_id, p_operative: input.operative_id, p_joined_at: input.joined_at, p_note: input.note })).error);
    refresh(uuid(form, "contract_id"));
    return { success: "Arrival recorded." };
  } catch (error) { return failure(error); }
}
export async function departureAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = departureInput(form);
    checkRpc((await supabase.rpc("record_operative_departure", { p_allocation: input.allocation_id, p_operative: input.operative_id, p_left_at: input.left_at, p_note: input.note })).error);
    refresh(uuid(form, "contract_id"));
    return { success: "Departure recorded." };
  } catch (error) { return failure(error); }
}
export async function finishPeriodAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = finishInput(form);
    checkRpc((await supabase.rpc("end_actual_allocation", { p_allocation: input.allocation_id, p_ended_at: input.ended_at })).error);
    refresh(uuid(form, "contract_id"));
    return { success: "Work here finished." };
  } catch (error) { return failure(error); }
}
export async function finishDayAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = finishDayInput(form, form.get("earlier") === "true");
    const result = await supabase.rpc("end_open_allocations", { p_contract: input.contract_id, p_at: input.at });
    checkRpc(result.error);
    refresh(input.contract_id);
    const finished = Number(result.data) || 0;
    return { success: finished ? `Finished ${finished} ${finished === 1 ? "period" : "periods"} of work.` : "No work is still open for that day." };
  } catch (error) { return failure(error); }
}
export async function setLeadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = leadInput(form);
    checkRpc((await supabase.rpc("set_allocation_lead", { p_allocation: input.allocation_id, p_operative: input.operative_id })).error);
    refresh(uuid(form, "contract_id"));
    return { success: "Acting lead recorded." };
  } catch (error) { return failure(error); }
}
export async function voidPeriodAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = voidRecordInput(form);
    checkRpc((await supabase.rpc("void_actual_allocation", { p_allocation: input.id, p_reason: input.reason })).error);
    refresh(uuid(form, "contract_id"));
    return { success: "Marked as entered in error. It stays in the history with your reason." };
  } catch (error) { return failure(error); }
}
// Labour not on the plan. Someone not yet registered is added provisionally
// first; each step has its own request key, so a retry repeats nothing.
export async function recordUnplannedAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const arrival = newArrivalInput(form);
    const input = unplannedInput(form);
    const peopleIds = [...input.operative_ids];
    if (arrival) {
      const created = await supabase.rpc("create_operative", { p_request_key: uuid(form, "person_request_key"), p_data: arrival });
      checkRpc(created.error);
      peopleIds.push(String(created.data));
    }
    if (peopleIds.length === 0) throw new Error("Choose who is working, or add someone new.");
    checkRpc((await supabase.rpc("record_actual_allocation", { p_request_key: uuid(form, "request_key"), p_data: { ...input, operative_ids: peopleIds } })).error);
    refresh(input.contract_id);
    return { success: `Recorded ${people(peopleIds.length)} not on the plan${arrival ? `, including ${arrival.display_name} (provisional until the office confirms them)` : ""}.` };
  } catch (error) { return failure(error); }
}
