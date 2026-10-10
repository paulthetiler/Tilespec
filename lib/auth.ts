import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";
import { authenticationUnavailable } from "./supabase/navigation";
import { canReadFinancial } from "./operations/permissions";
export { canManageContracts, canReadFinancial } from "./operations/permissions";

export type MemberRole = "owner" | "contracts_manager" | "supervisor" | "lead_installer" | "subcontract_installer";
export type Member = {
  organisation_id: string;
  user_id: string;
  display_name: string;
  role: MemberRole;
  financial_access: boolean;
  active: boolean;
};

const memberRoles: readonly string[] = ["owner", "contracts_manager", "supervisor", "lead_installer", "subcontract_installer"];

export async function requireActor() {
  if (!isSupabaseConfigured()) redirect("/login?reason=configuration");
  const supabase = await createClient();
  let userResult;
  try {
    // getUser validates the session against Auth. Cookie content and user metadata
    // are never used as authority for roles or membership.
    userResult = await supabase.auth.getUser();
  } catch {
    redirect("/login?reason=unavailable");
  }
  if (userResult.error || !userResult.data.user) {
    if (authenticationUnavailable(userResult.error)) redirect("/login?reason=unavailable");
    redirect("/login");
  }

  let membership;
  try {
    membership = await supabase.from("organisation_members")
      .select("organisation_id,user_id,display_name,role,financial_access,active")
      .eq("user_id", userResult.data.user.id)
      .eq("active", true)
      .limit(2);
  } catch {
    redirect("/login?reason=unavailable");
  }
  if (membership.error) redirect("/login?reason=unavailable");
  if (membership.data?.length !== 1) redirect("/login?reason=membership");
  const candidate = membership.data[0];
  if (!candidate.organisation_id || candidate.user_id !== userResult.data.user.id
    || candidate.active !== true || !memberRoles.includes(candidate.role)
    || typeof candidate.financial_access !== "boolean" || typeof candidate.display_name !== "string") {
    redirect("/login?reason=membership");
  }
  const member = candidate as Member;
  return { supabase, member };
}

export async function requireFinancialActor() {
  const actor = await requireActor();
  if (!canReadFinancial(actor.member)) redirect("/admin?error=permission");
  return actor;
}
