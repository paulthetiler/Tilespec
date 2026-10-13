// Harness-only stand-ins for the office server actions. Each runs the real
// server-side parser on the submitted form and reports the payload it would
// send to the database, so tests prove the screens submit valid requests.
import { buildLocationItems } from "@/lib/operations/locations";
import {
  locationBuilderInput, locationUpdateInput, membershipInput, operativeInput, operativeUpdateInput, planInput, teamInput, text, uuid,
} from "@/lib/operations/validation";
import type { ActionState } from "@/lib/operations/types";

type Parser = (form: FormData) => unknown;
function stub(parse: Parser) {
  return async (_: ActionState, form: FormData): Promise<ActionState> => {
    await new Promise(resolve => setTimeout(resolve, 50));
    try { return { success: `Submitted ${JSON.stringify(parse(form))}` }; }
    catch (error) { return { error: error instanceof Error ? error.message : "Invalid" }; }
  };
}
const withKey = (parse: Parser): Parser => form => ({ request_key: uuid(form, "request_key"), data: parse(form) });
export const workforceActions = {
  createOperative: stub(withKey(form => operativeInput(form, true))),
  updateOperative: stub(form => ({ id: uuid(form, "operative_id"), data: operativeUpdateInput(form) })),
  confirmOperative: stub(form => ({ id: uuid(form, "operative_id"), status: "active" })),
  createTeam: stub(withKey(teamInput)),
  updateTeam: stub(form => ({ id: uuid(form, "team_id"), data: { ...teamInput(form), active: form.get("active") === "on" } })),
  addMember: stub(withKey(membershipInput)),
  endMembership: stub(form => ({ id: uuid(form, "membership_id"), until: text(form, "valid_until", 10, true) })),
  voidMembership: stub(form => ({ id: uuid(form, "membership_id"), reason: text(form, "reason", 2000, true) })),
};
export const locationActions = {
  create: stub(withKey(form => ({ parent: text(form, "parent_id", 36) || null, ...buildLocationItems(locationBuilderInput(form)) }))),
  update: stub(form => ({ id: uuid(form, "location_id"), data: locationUpdateInput(form) })),
  archive: stub(form => ({ id: uuid(form, "location_id"), reason: text(form, "reason", 2000, true) })),
};
export const planActions = {
  plan: stub(withKey(planInput)),
  cancel: stub(form => ({ id: uuid(form, "plan_id"), reason: text(form, "reason", 2000, true) })),
};
