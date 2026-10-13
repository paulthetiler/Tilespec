import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, requireActor } from "@/lib/auth";
import { checkDatabase, locationsFor, plansFor, workforceFor } from "@/lib/operations/data";
import { addDays, isCalendarDate, londonDate, weekStart } from "@/lib/operations/planning";
import type { WorkPackage } from "@/lib/operations/types";
import { PlanBoard } from "@/components/office/plan-board";
import { cancelPlanAction, planAllocationAction } from "@/app/admin/office-actions";
import styles from "../../../admin.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string | string[] }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { supabase, member } = await requireActor();
  const contract = await supabase.from("contracts").select("id,reference,name").eq("id", id).maybeSingle();
  checkDatabase(contract.error);
  if (!contract.data) notFound();
  const today = londonDate();
  const requested = (await searchParams).week;
  const monday = weekStart(isCalendarDate(requested) ? requested : today);
  const installer = member.role === "lead_installer" || member.role === "subcontract_installer";
  const [locations, workforce, planned, packages] = await Promise.all([
    locationsFor(supabase, id), workforceFor(supabase), plansFor(supabase, id, monday, addDays(monday, 6)),
    supabase.from("work_packages").select("id,contract_id,work_area_id,name,quantity,unit").eq("contract_id", id).order("name"),
  ]);
  checkDatabase(packages.error);
  return <>
    <div className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>{contract.data.reference}</p><h1 className={styles.title}>Plan work</h1>
        <p className={styles.description}>Which team works where, at what stage, on {contract.data.name}. Supervisors confirm or adjust this on site each day.</p></div>
      <div className={styles.inline}>
        <Link className={styles.secondaryButton} href={`/admin/contracts/${id}`}>Contract</Link>
        <Link className={styles.secondaryButton} href={`/admin/contracts/${id}/locations`}>Locations</Link>
      </div>
    </div>
    {installer ? <p className={styles.empty}>Work plans are shared with the office and site supervisors. Your allocated work packages are on the contract page.</p>
      : <PlanBoard contractId={id} weekStart={monday} today={today} basePath={`/admin/contracts/${id}/plan`} canPlan={canManageContracts(member)} newKey={randomUUID}
        locations={locations} teams={workforce.teams} operatives={workforce.operatives} memberships={workforce.memberships} packages={(packages.data ?? []) as WorkPackage[]}
        plans={planned.plans} plannedOperatives={planned.plannedOperatives} actions={{ plan: planAllocationAction, cancel: cancelPlanAction }} />}
  </>;
}
