import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { canManageContracts, requireActor } from "@/lib/auth";
import { companyRecordsFor, teamFor, workforceFor } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { NO_COMPANY, WorkforceView } from "@/components/office/workforce-view";
import {
  addTeamMemberAction, confirmOperativeAction, createCompanyAction, createOperativeAction, createTeamAction, endMembershipAction,
  recordAccreditationAction, recordInsuranceAction, updateCompanyAction, updateOperativeAction, updateTeamAction,
  voidAccreditationAction, voidInsuranceAction, voidMembershipAction,
} from "@/app/admin/office-actions";
import styles from "../admin.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function WorkforcePage({ searchParams }: { searchParams: Promise<{ company?: string | string[] }> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) redirect("/admin?error=permission");
  const params = await searchParams;
  const company = typeof params.company === "string" && (params.company === NO_COMPANY || uuidPattern.test(params.company)) ? params.company : null;
  const [{ companies, teams, operatives, memberships }, { insurances, accreditations }, logins] = await Promise.all([
    workforceFor(supabase), companyRecordsFor(supabase), teamFor(supabase),
  ]);
  return <>
    <div className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>Office</p><h1 className={styles.title}>Workforce</h1>
        <p className={styles.description}>Subcontract companies, gangs and the people who work on your sites. Plan them onto locations from each contract.</p></div>
    </div>
    <WorkforceView companies={companies} insurances={insurances} accreditations={accreditations} teams={teams} operatives={operatives} memberships={memberships}
      company={company} today={londonDate()} newKey={randomUUID}
      logins={logins.filter(login => login.active).map(login => ({ user_id: login.user_id, display_name: login.display_name }))} basePath="/admin/workforce"
      actions={{ createCompany: createCompanyAction, updateCompany: updateCompanyAction, recordInsurance: recordInsuranceAction,
        recordAccreditation: recordAccreditationAction, voidInsurance: voidInsuranceAction, voidAccreditation: voidAccreditationAction,
        createOperative: createOperativeAction, updateOperative: updateOperativeAction, confirmOperative: confirmOperativeAction, createTeam: createTeamAction,
        updateTeam: updateTeamAction, addMember: addTeamMemberAction, endMembership: endMembershipAction, voidMembership: voidMembershipAction }} />
  </>;
}
