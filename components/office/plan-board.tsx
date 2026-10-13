import Link from "next/link";
import { OperationsForm } from "@/components/operations/operations-form";
import { calendarDate, eventDate } from "@/components/operations/format";
import { indexLocations, locationPath } from "@/lib/operations/locations";
import { addDays, dayLabel, planCoversDay, planOverlaps, planStatus, weekDays } from "@/lib/operations/planning";
import { installationStageLabels, type ActionState, type Location, type Operative, type PlannedAllocation, type PlannedOperative, type Team, type TeamMembership, type WorkPackage } from "@/lib/operations/types";
import { PlanForm } from "./plan-form";
import styles from "@/app/admin/admin.module.css";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;
type Plan = PlannedAllocation & { cancel_reason?: string | null };
type Props = {
  contractId: string; weekStart: string; today: string; basePath: string; canPlan: boolean; newKey: () => string;
  locations: Location[]; teams: Team[]; operatives: Operative[]; memberships: TeamMembership[]; packages: WorkPackage[];
  plans: Plan[]; plannedOperatives: PlannedOperative[]; actions: { plan: Action; cancel: Action };
};

export function PlanBoard({ contractId, weekStart, today, basePath, canPlan, newKey, locations, teams, operatives, memberships, packages, plans, plannedOperatives, actions }: Props) {
  const days = weekDays(weekStart), weekEnd = days[6];
  const index = indexLocations(locations);
  const names = new Map(operatives.map(person => [person.id, person.display_name]));
  const namedFor = (planId: string) => plannedOperatives.filter(item => item.planned_allocation_id === planId).map(item => item.operative_id);
  const active = plans.filter(plan => planStatus(plan) === "active" && planOverlaps(plan, weekStart, weekEnd));
  const changed = plans.filter(plan => planStatus(plan) !== "active" && planOverlaps(plan, weekStart, weekEnd));
  const teamIds = [...new Set(active.map(plan => plan.team_id))].sort((a, b) => (teams.find(t => t.id === a)?.name ?? "").localeCompare(teams.find(t => t.id === b)?.name ?? "", "en-GB"));
  const formFields = (plan?: Plan) => <>
    <input type="hidden" name="contract_id" value={contractId} />
    <input type="hidden" name="request_key" value={newKey()} />
    {plan && <input type="hidden" name="supersedes_id" value={plan.id} />}
    <PlanForm locations={locations} teams={teams} operatives={operatives} memberships={memberships} packages={packages} today={today}
      plan={plan ? { ...plan, operative_ids: namedFor(plan.id) } : undefined} />
  </>;
  const ready = locations.some(location => !location.archived_at) && teams.some(team => team.active);
  return <>
    <nav className={styles.weekNav} aria-label="Choose week">
      <strong>Week of {dayLabel(weekStart, "long")}</strong>
      <Link className={styles.secondaryButton} href={`${basePath}?week=${addDays(weekStart, -7)}`}>← Previous week</Link>
      <Link className={styles.secondaryButton} href={basePath}>This week</Link>
      <Link className={styles.secondaryButton} href={`${basePath}?week=${addDays(weekStart, 7)}`}>Next week →</Link>
    </nav>

    {canPlan && (ready ? <section className={styles.panel} aria-labelledby="add-plan-heading">
      <details className={`${styles.disclosure} ${styles.primaryDisclosure}`} open={active.length === 0}>
        <summary id="add-plan-heading">+ Add work to the plan</summary>
        <OperationsForm action={actions.plan} submitLabel="Add to plan">{formFields()}</OperationsForm>
      </details>
    </section> : <div className={styles.empty}>
      <h2>Before you can plan</h2>
      <p>You need at least one location on this contract and one active team. <Link href={`/admin/contracts/${contractId}/locations`}>Set up locations</Link> · <Link href="/admin/workforce">Set up teams</Link></p>
    </div>)}

    <section className={styles.panel} aria-labelledby="week-heading">
      <div className={styles.panelHeader}><div><h2 id="week-heading">Planned this week</h2><p className={styles.muted}>{active.length} planned {active.length === 1 ? "allocation" : "allocations"} for {teamIds.length} {teamIds.length === 1 ? "team" : "teams"}.</p></div></div>
      {teamIds.map(teamId => {
        const team = teams.find(item => item.id === teamId);
        const lead = memberships.find(m => m.team_id === teamId && m.is_lead && !m.voided_at && m.valid_from <= weekEnd && (m.valid_until === null || m.valid_until >= weekStart));
        return <div key={teamId} className={styles.teamBlock}>
          <h3>{team?.name ?? "Team"}<span className={styles.small}>{team?.contractor_name && team.contractor_name !== team.name ? ` · ${team.contractor_name}` : ""}{lead ? ` · Lead: ${names.get(lead.operative_id)}` : ""}</span></h3>
          {active.filter(plan => plan.team_id === teamId).sort((a, b) => a.planned_start.localeCompare(b.planned_start)).map(plan => {
            const named = namedFor(plan.id);
            return <article key={plan.id} className={styles.planCard}>
              <div>
                <h4>{locationPath(index, plan.work_area_id) || "Location not visible"}</h4>
                <p className={styles.small}><span className={`${styles.badge} ${styles.stageBadge}`}>{installationStageLabels[plan.stage]}</span>{" "}
                  {plan.planned_start === plan.planned_end ? calendarDate(plan.planned_start) : `${calendarDate(plan.planned_start)} to ${calendarDate(plan.planned_end)}`}
                  {plan.work_package_id ? ` · ${packages.find(pack => pack.id === plan.work_package_id)?.name ?? "Work package"}` : ""}</p>
                <p className={styles.small}>{named.length ? `Expected: ${named.map(id => names.get(id)).join(", ")}` : "Supervisor confirms who attends"}</p>
                {plan.instructions && <p className={styles.small}>{plan.instructions}</p>}
              </div>
              <ul className={styles.days} aria-label="Days planned this week">{days.map(day => <li key={day} className={`${styles.day}${planCoversDay(plan, day) ? ` ${styles.dayOn}` : ""}`}>
                <span aria-hidden="true">{dayLabel(day)}</span><span className={styles.srOnly}>{dayLabel(day, "long")}: {planCoversDay(plan, day) ? "planned" : "not planned"}</span>
              </li>)}</ul>
              {canPlan && <div className={styles.planActions}>
                <details className={styles.disclosure}>
                  <summary>Change</summary>
                  <p className={styles.small}>Saving creates a new version; the current one is kept in the history.</p>
                  <OperationsForm action={actions.plan} submitLabel="Save change">{formFields(plan)}</OperationsForm>
                </details>
                <details className={styles.disclosure}>
                  <summary>Cancel</summary>
                  <OperationsForm action={actions.cancel} submitLabel="Cancel planned work">
                    <input type="hidden" name="contract_id" value={contractId} />
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <label className={styles.field}>Reason *<input name="reason" required minLength={5} maxLength={2000} placeholder="For example, area not ready" /></label>
                  </OperationsForm>
                </details>
              </div>}
            </article>;
          })}
        </div>;
      })}
      {active.length === 0 && <p className={styles.empty}>Nothing is planned for this week yet.</p>}
    </section>

    {changed.length > 0 && <section className={styles.panel} aria-labelledby="changes-heading">
      <details className={styles.details}>
        <summary id="changes-heading">Changes and cancellations this week ({changed.length})</summary>
        <ul className={styles.documentList}>{changed.map(plan => {
          const revision = plans.find(item => item.id === plan.superseded_by);
          return <li key={plan.id} className={styles.documentRow}><div>
            <strong>{teams.find(team => team.id === plan.team_id)?.name} · {locationPath(index, plan.work_area_id)}</strong>
            <p className={styles.small}>{installationStageLabels[plan.stage]} · {calendarDate(plan.planned_start)} to {calendarDate(plan.planned_end)}</p>
            <p className={styles.small}>{planStatus(plan) === "cancelled"
              ? `Cancelled ${plan.cancelled_at ? eventDate(plan.cancelled_at) : ""}: ${plan.cancel_reason ?? ""}`
              : `Replaced by a newer version${revision ? ` on ${eventDate(revision.created_at)}` : ""}`}</p>
          </div></li>;
        })}</ul>
      </details>
    </section>}
  </>;
}
