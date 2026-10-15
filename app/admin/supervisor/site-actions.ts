"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { checkRpc } from "@/lib/operations/data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcErrorMessage } from "@/lib/operations/errors";
import { londonDate } from "@/lib/operations/planning";
import { confirmsWorkforceAbsence, confirmsWorkforceGroups, savedAllocationIds, type WorkforceGroup } from "@/lib/operations/workforce-save-confirmation";
import {
  arrivalInput, confirmAsPlannedInput, confirmChangesInput, departureInput, finishDayInput, finishInput, leadInput, moveInput, newArrivalInput,
  notOnSiteInput, unplannedInput, uuid, voidRecordInput, ValidationError,
} from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

// The supervisor's daily workforce. Every change is a Supervisor V2 database
// function called with the signed-in user's own session, so the database
// decides who may record what on which contract. A success message is shown
// only after the database has confirmed the change.
type SiteActionState = ActionState & { uncertain?: boolean };
class RefusedSave extends Error {}
function mutationError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code && /^(22|23|42501$|40001$|40P01$|PGRST20[0-6]$)/.test(error.code)) throw new RefusedSave(rpcErrorMessage(error));
  throw new Error("We could not confirm the change was saved. Retry the same details or review the saved workforce records.");
}
const unconfirmed = () => new Error("We could not confirm the change in the saved workforce records. Your entries are kept; retry the same details.");
// Preflight reads happen before any mutation. A missing RLS-visible target is
// a definitive refusal, without disclosing whether another site's row exists.
function checkedTarget(error: { code?: string; message?: string } | null, data: unknown) {
  if (error?.code === "PGRST116" || (!error && !data)) throw new RefusedSave(rpcErrorMessage({ code: "42501" }));
  checkRpc(error);
}
const failure = (error: unknown): SiteActionState => ({ error: error instanceof Error ? error.message : "The change could not be confirmed. Retry the same details.", uncertain: !(error instanceof ValidationError || error instanceof RefusedSave) });
function refresh(contractId: string) {
  for (const path of ["", "/workforce", "/history"]) revalidatePath(`/admin/supervisor/sites/${contractId}${path}`);
  revalidatePath(`/admin/contracts/${contractId}/actual`);
}
const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;
async function verifyGroups(supabase: SupabaseClient, result: unknown, expected: { contract: string; actor: string; day: string; groups: WorkforceGroup[]; plan?: string | null; previous?: string | null }) {
  const ids = savedAllocationIds(result, expected.groups.length); if (!ids) throw unconfirmed();
  const [allocations, attendance] = await Promise.all([
    supabase.from("actual_allocations").select("id,contract_id,planned_allocation_id,previous_allocation_id,confirmed_by,work_date,work_area_id,stage,lead_operative_id,recorded_at,team_id,work_package_id,started_at").in("id", ids),
    supabase.from("actual_allocation_operatives").select("actual_allocation_id,operative_id,added_by,recorded_at").in("actual_allocation_id", ids),
  ]);
  checkRpc(allocations.error); checkRpc(attendance.error);
  if (!confirmsWorkforceGroups(ids, allocations.data || [], attendance.data || [], expected)) throw unconfirmed();
}
async function packagesOnBranch(supabase: SupabaseClient, packageId: string | null, areas: string[]) {
  if (!packageId) return new Map(areas.map(area => [area, null] as const));
  const workPackage = await supabase.from("work_packages").select("work_area_id").eq("id", packageId).single(); checkedTarget(workPackage.error, workPackage.data); if (!workPackage.data) throw unconfirmed();
  const locations = await supabase.from("work_areas").select("id,path_ids").in("id", [...new Set([...areas, workPackage.data.work_area_id])]); checkRpc(locations.error);
  const packageArea = locations.data?.find(area => area.id === workPackage.data.work_area_id); if (!packageArea) throw unconfirmed();
  return new Map(areas.map(area => {
    const target = locations.data?.find(location => location.id === area); if (!target) throw unconfirmed();
    return [area, target.path_ids.includes(packageArea.id) || packageArea.path_ids.includes(target.id) ? packageId : null] as const;
  }));
}
async function confirmPlan(supabase: SupabaseClient, actor: string, form: FormData, input: ReturnType<typeof confirmChangesInput> | ReturnType<typeof confirmAsPlannedInput>) {
  const plan = await supabase.from("planned_allocations").select("work_area_id,stage,team_id,work_package_id").eq("id", input.planned_allocation_id).eq("contract_id", input.contract_id).single();
  checkedTarget(plan.error, plan.data); if (!plan.data) throw unconfirmed();
  const groups = input.groups.map(group => ({ ...group, work_area_id: "work_area_id" in group ? group.work_area_id || plan.data.work_area_id : plan.data.work_area_id, stage: "stage" in group ? group.stage || plan.data.stage : plan.data.stage,
    team_id: plan.data.team_id, ...(input.started_at ? { started_at: input.started_at } : {}) }));
  const packages = await packagesOnBranch(supabase, plan.data.work_package_id, groups.map(group => group.work_area_id));
  const result = await supabase.rpc("confirm_planned_allocation", { p_request_key: uuid(form, "request_key"), p_data: input }); mutationError(result.error);
  await verifyGroups(supabase, result.data, { contract: input.contract_id, actor, day: String(form.get("day")), plan: input.planned_allocation_id, previous: null,
    groups: groups.map(group => ({ ...group, work_package_id: packages.get(group.work_area_id)! })) });
  if ("absent" in input && input.absent?.length) {
    const absences = await supabase.from("allocation_absences").select("operative_id,reason").eq("planned_allocation_id", input.planned_allocation_id).eq("contract_id", input.contract_id).eq("work_date", String(form.get("day"))).is("voided_at", null);
    checkRpc(absences.error);
    if (!input.absent.every(person => absences.data?.some(saved => saved.operative_id === person.operative_id && saved.reason === person.reason))) throw unconfirmed();
  }
}

export async function confirmAsPlannedAction(_: ActionState, form: FormData): Promise<SiteActionState> {
  const { supabase, member } = await requireActor();
  try {
    const input = confirmAsPlannedInput(form);
    await confirmPlan(supabase, member.user_id, form, input);
    refresh(input.contract_id);
    return { success: `Confirmed as planned: ${people(input.groups[0].operative_ids.length)} on site.` };
  } catch (error) { return failure(error); }
}
export async function confirmChangesAction(_: ActionState, form: FormData): Promise<SiteActionState> {
  const { supabase, member } = await requireActor();
  try {
    const input = confirmChangesInput(form);
    await confirmPlan(supabase, member.user_id, form, input);
    refresh(input.contract_id);
    const here = input.groups.reduce((total, group) => total + group.operative_ids.length, 0);
    return { success: `Confirmed with changes: ${people(here)} on site${input.absent ? `, ${input.absent.length} absent` : ""}.` };
  } catch (error) { return failure(error); }
}
export async function notOnSiteAction(_: ActionState, form: FormData): Promise<SiteActionState> {
  const { supabase, member } = await requireActor();
  try {
    const input = notOnSiteInput(form), contract = uuid(form, "contract_id");
    const result = await supabase.rpc("record_allocation_absence", { p_request_key: uuid(form, "request_key"), p_data: input }); mutationError(result.error);
    const ids = savedAllocationIds([result.data], 1); if (!ids) throw unconfirmed();
    const saved = await supabase.from("allocation_absences").select("id,contract_id,planned_allocation_id,work_date,recorded_by,reason,operative_id,voided_at").eq("id", ids[0]).single(); checkRpc(saved.error);
    if (!confirmsWorkforceAbsence(saved.data, result.data, { contract, plan: input.planned_allocation_id, day: input.work_date, actor: member.user_id, reason: input.reason })) throw unconfirmed();
    refresh(contract);
    return { success: "Recorded as not on site." };
  } catch (error) { return failure(error); }
}
export async function undoNotOnSiteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = voidRecordInput(form);
    const contract = uuid(form, "contract_id");
    mutationError((await supabase.rpc("void_allocation_absence", { p_absence: input.id, p_reason: input.reason })).error);
    const saved = await supabase.from("allocation_absences").select("contract_id,voided_at").eq("id", input.id).single(); checkRpc(saved.error);
    if (saved.data?.contract_id !== contract || !saved.data.voided_at) throw unconfirmed();
    refresh(contract);
    return { success: "Not on site removed. The record is kept with your reason." };
  } catch (error) { return failure(error); }
}
export async function moveAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, member } = await requireActor();
  try {
    const input = moveInput(form), contract = uuid(form, "contract_id");
    const source = await supabase.from("actual_allocations").select("stage,work_date,team_id,work_package_id").eq("id", input.allocation_id).eq("contract_id", contract).single(); checkedTarget(source.error, source.data); if (!source.data) throw unconfirmed();
    const packages = await packagesOnBranch(supabase, source.data.work_package_id, input.data.targets.map(group => group.work_area_id));
    const attendance = await supabase.from("actual_allocation_operatives").select("operative_id,joined_at,left_at").eq("actual_allocation_id", input.allocation_id); checkRpc(attendance.error);
    const result = await supabase.rpc("reallocate_actual_allocation", { p_request_key: uuid(form, "request_key"), p_allocation: input.allocation_id, p_data: input.data }); mutationError(result.error);
    const savedSource = await supabase.from("actual_allocations").select("ended_at").eq("id", input.allocation_id).single(); checkRpc(savedSource.error); if (!savedSource.data?.ended_at) throw unconfirmed();
    const changeTime = Date.parse(savedSource.data.ended_at);
    const present = (attendance.data || []).filter(row => Date.parse(row.joined_at) < changeTime && (!row.left_at || Date.parse(row.left_at) > changeTime)).map(row => row.operative_id);
    await verifyGroups(supabase, result.data, { contract, actor: member.user_id, day: londonDate(new Date(savedSource.data.ended_at)), previous: input.allocation_id,
      groups: input.data.targets.map(group => ({ ...group, operative_ids: "operative_ids" in group ? group.operative_ids as string[] : present, stage: group.stage || source.data.stage, team_id: source.data.team_id, work_package_id: packages.get(group.work_area_id)!, started_at: savedSource.data.ended_at })) });
    refresh(contract);
    return { success: input.data.targets.length > 1 ? "Split recorded. The earlier period is kept." : "Move recorded. The earlier period is kept." };
  } catch (error) { return failure(error); }
}
export async function arrivalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = arrivalInput(form);
    const contract = uuid(form, "contract_id");
    const result = await supabase.rpc("add_allocation_operative", { p_allocation: input.allocation_id, p_operative: input.operative_id, p_joined_at: input.joined_at, p_note: input.note }); mutationError(result.error);
    const ids = savedAllocationIds([result.data], 1); if (!ids) throw unconfirmed();
    const saved = await supabase.from("actual_allocation_operatives").select("contract_id,actual_allocation_id,operative_id,joined_at").eq("id", ids[0]).single(); checkRpc(saved.error);
    if (saved.data?.contract_id !== contract || saved.data.actual_allocation_id !== input.allocation_id || saved.data.operative_id !== input.operative_id || (input.joined_at && Date.parse(saved.data.joined_at) !== Date.parse(input.joined_at))) throw unconfirmed();
    refresh(contract);
    return { success: "Arrival recorded." };
  } catch (error) { return failure(error); }
}
export async function departureAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = departureInput(form);
    const contract = uuid(form, "contract_id");
    mutationError((await supabase.rpc("record_operative_departure", { p_allocation: input.allocation_id, p_operative: input.operative_id, p_left_at: input.left_at, p_note: input.note })).error);
    const saved = await supabase.from("actual_allocation_operatives").select("contract_id,left_at").eq("actual_allocation_id", input.allocation_id).eq("operative_id", input.operative_id).single(); checkRpc(saved.error);
    if (saved.data?.contract_id !== contract || !saved.data.left_at || (input.left_at && Date.parse(saved.data.left_at) !== Date.parse(input.left_at))) throw unconfirmed();
    refresh(contract);
    return { success: "Departure recorded." };
  } catch (error) { return failure(error); }
}
export async function finishPeriodAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = finishInput(form);
    const contract = uuid(form, "contract_id");
    mutationError((await supabase.rpc("end_actual_allocation", { p_allocation: input.allocation_id, p_ended_at: input.ended_at })).error);
    const saved = await supabase.from("actual_allocations").select("contract_id,ended_at").eq("id", input.allocation_id).single(); checkRpc(saved.error);
    if (saved.data?.contract_id !== contract || !saved.data.ended_at || (input.ended_at && Date.parse(saved.data.ended_at) !== Date.parse(input.ended_at))) throw unconfirmed();
    refresh(contract);
    return { success: "Work here finished." };
  } catch (error) { return failure(error); }
}
export async function finishDayAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = finishDayInput(form, true);
    const ending = input.at!;
    const result = await supabase.rpc("end_open_allocations", { p_contract: input.contract_id, p_at: ending }); mutationError(result.error);
    if (!Number.isSafeInteger(result.data) || result.data < 0) throw unconfirmed();
    const remaining = await supabase.from("actual_allocations").select("id").eq("contract_id", input.contract_id).eq("work_date", londonDate(new Date(ending))).is("ended_at", null).is("voided_at", null).lt("started_at", ending); checkRpc(remaining.error);
    if (!remaining.data || remaining.data.length) throw unconfirmed();
    refresh(input.contract_id);
    const finished = result.data;
    return { success: finished ? `Finished ${finished} ${finished === 1 ? "period" : "periods"} of work.` : "No earlier work is still open at that finish time." };
  } catch (error) { return failure(error); }
}
export async function setLeadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = leadInput(form);
    const contract = uuid(form, "contract_id");
    mutationError((await supabase.rpc("set_allocation_lead", { p_allocation: input.allocation_id, p_operative: input.operative_id })).error);
    const saved = await supabase.from("actual_allocations").select("contract_id,lead_operative_id").eq("id", input.allocation_id).single(); checkRpc(saved.error);
    if (saved.data?.contract_id !== contract || saved.data.lead_operative_id !== input.operative_id) throw unconfirmed();
    refresh(contract);
    return { success: "Acting lead recorded." };
  } catch (error) { return failure(error); }
}
export async function voidPeriodAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActor();
  try {
    const input = voidRecordInput(form);
    const contract = uuid(form, "contract_id");
    mutationError((await supabase.rpc("void_actual_allocation", { p_allocation: input.id, p_reason: input.reason })).error);
    const saved = await supabase.from("actual_allocations").select("contract_id,voided_at").eq("id", input.id).single(); checkRpc(saved.error);
    if (saved.data?.contract_id !== contract || !saved.data.voided_at) throw unconfirmed();
    refresh(contract);
    return { success: "Marked as entered in error. It stays in the history with your reason." };
  } catch (error) { return failure(error); }
}
// Labour not on the plan. Someone not yet registered is added provisionally
// first; each step has its own request key, so a retry repeats nothing.
export async function recordUnplannedAction(_: ActionState, form: FormData): Promise<SiteActionState> {
  const { supabase, member } = await requireActor();
  let partial = false;
  try {
    const arrival = newArrivalInput(form);
    const input = unplannedInput(form);
    const peopleIds = [...input.operative_ids];
    if (arrival) {
      const created = await supabase.rpc("create_operative", { p_request_key: uuid(form, "person_request_key"), p_data: arrival });
      mutationError(created.error);
      const ids = savedAllocationIds([created.data], 1); if (!ids) throw unconfirmed();
      const person = await supabase.from("operatives").select("display_name,status,organisation_id").eq("id", ids[0]).single(); checkRpc(person.error);
      if (person.data?.display_name !== arrival.display_name || person.data.organisation_id !== member.organisation_id || !["active", "provisional"].includes(person.data.status)) throw unconfirmed();
      partial = true; peopleIds.push(ids[0]);
    }
    if (peopleIds.length === 0) throw new ValidationError("Choose who is working, or add someone new.");
    const result = await supabase.rpc("record_actual_allocation", { p_request_key: uuid(form, "request_key"), p_data: { ...input, operative_ids: peopleIds } }); mutationError(result.error);
    await verifyGroups(supabase, [result.data], { contract: input.contract_id, actor: member.user_id, day: String(form.get("day")), plan: null, previous: null, groups: [{ ...input, operative_ids: peopleIds, team_id: input.team_id || null, work_package_id: null }] });
    refresh(input.contract_id);
    return { success: `Recorded ${people(peopleIds.length)} not on the plan${arrival ? `, including ${arrival.display_name} (provisional until the office confirms them)` : ""}.` };
  } catch (error) { return partial ? { ...failure(error), uncertain: true } : failure(error); }
}
