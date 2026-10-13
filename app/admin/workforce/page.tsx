import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { canManageContracts, requireActor } from "@/lib/auth";
import { teamFor, workforceFor } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { WorkforceView } from "@/components/office/workforce-view";
import {
  addTeamMemberAction, confirmOperativeAction, createOperativeAction, createTeamAction, endMembershipAction,
  updateOperativeAction, updateTeamAction, voidMembershipAction,
} from "@/app/admin/office-actions";
import styles from "../admin.module.css";

export default async function WorkforcePage({ searchParams }: { searchParams: Promise<{ company?: string | string[] }> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) redirect("/admin?error=permission");
  const params = await searchParams;
  const company = typeof params.company === "string" && params.company.trim() ? params.company.trim().slice(0, 160) : null;
  const [{ teams, operatives, memberships }, logins] = await Promise.all([workforceFor(supabase), teamFor(supabase)]);
  return <>
    <div className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>Office</p><h1 className={styles.title}>Workforce</h1>
        <p className={styles.description}>Subcontract companies, gangs and the people who work on your sites. Plan them onto locations from each contract.</p></div>
    </div>
    <WorkforceView teams={teams} operatives={operatives} memberships={memberships} company={company} today={londonDate()} newKey={randomUUID}
      logins={logins.filter(login => login.active).map(login => ({ user_id: login.user_id, display_name: login.display_name }))} basePath="/admin/workforce"
      actions={{ createOperative: createOperativeAction, updateOperative: updateOperativeAction, confirmOperative: confirmOperativeAction, createTeam: createTeamAction,
        updateTeam: updateTeamAction, addMember: addTeamMemberAction, endMembership: endMembershipAction, voidMembership: voidMembershipAction }} />
  </>;
}
