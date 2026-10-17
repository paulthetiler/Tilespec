import Link from "next/link";
import type { Member } from "@/lib/auth";
import { canReadFinancial } from "@/lib/operations/permissions";
import {
  adminActionHref, buildQueue, classChip, classNote, compute, ctaLabel, idleCopy, queueCounts, todayCountCopy,
  type NextActionSnapshot, type Viewer, type ViewerAction,
} from "@/lib/operations/next-actions";
import type { NextActionConfig } from "@/lib/operations/next-actions/config";
import { holdScope, holdStatusLabels, holdTypes } from "@/lib/operations/holds";
import { dayLabel } from "@/lib/operations/planning";
import styles from "./admin-today.module.css";

type Props = { snapshot: NextActionSnapshot; viewer: Viewer; member: Member; config?: NextActionConfig };

function ActionChips({ action, today }: { action: ViewerAction; today: string }) {
  const chip = classChip(action);
  const due = !action.due ? "" : action.due < today ? `Overdue since ${action.due}` : action.due === today ? "Due today" : `Due ${action.due}`;
  return <span className={styles.chips}>
    <span className={`${styles.chip} ${chip.tone === "must" ? styles.required : chip.tone === "alert" ? styles.alert : ""}`}>{chip.text}</span>
    {due && <span className={`${styles.chip} ${action.overdue ? styles.required : ""}`}>{due}</span>}
    {action.state === "blocked" && <span className={`${styles.chip} ${styles.required}`}>Blocked</span>}
  </span>;
}

function ActionRow({ action, today }: { action: ViewerAction; today: string }) {
  const actionable = action.state === "ready";
  return <article className={`${styles.action} ${action.kind === "gate" ? styles.gateRow : action.kind === "alert" ? styles.alertRow : ""}`} data-action-id={action.id} data-action-state={action.state}>
    <ActionChips action={action} today={today} />
    <h3>{action.title}</h3>
    <p className={styles.where}>{[action.job.reference, action.job.name, action.location].filter(Boolean).join(" · ")}</p>
    <p>{action.why}</p>
    {action.state === "blocked" && <p className={styles.blocked}><strong>You cannot take this decision.</strong> {action.blockedBy}</p>}
    {action.state === "waiting" && <p className={styles.waiting}>Waiting on {action.responsible.who ?? action.responsible.label}.</p>}
    {action.kind !== "reminder" && <p className={styles.note}>{classNote(action)}</p>}
    <Link className={styles.rowLink} href={adminActionHref(action)}>{actionable ? ctaLabel(action) : "View saved details"}<span aria-hidden="true"> →</span></Link>
  </article>;
}

/** Real saved records, presented by the shared engine. This component never writes or makes an approval. */
export function AdminToday({ snapshot, viewer, member, config }: Props) {
  if (!member.active || !["owner", "contracts_manager"].includes(member.role) || viewer.user_id !== member.user_id || viewer.role !== member.role) {
    throw new Error("Office Today requires the authenticated office or owner.");
  }
  const owner = member.role === "owner";
  // Money has its own authorised destination. Even an owner receives no budget
  // figures, profit text or financial action payload in this Today render.
  const actions = compute(snapshot, viewer, config).filter(action => !action.financial && action.process !== "money");
  const queue = buildQueue(actions, { groupExceptions: owner });
  const counts = queueCounts(queue);
  const holds = snapshot.work_holds.filter(hold => ["active", "correction_submitted", "awaiting_release"].includes(hold.status));
  const safetyCount = holds.filter(hold => hold.hold_type === "safety").length;
  const qualityCount = holds.length - safetyCount;
  const urgentWaiting = queue.waiting.filter(action => action.kind !== "reminder" || action.overdue);
  const idle = idleCopy({ activeRestrictions: holds.length > 0, waitingOnOthers: queue.waiting.length + queue.exceptions.length > 0 });
  const firstName = member.display_name.trim().split(/\s+/)[0] || "there";
  const areaName = (id: string | null) => (id ? snapshot.work_areas.find(area => area.id === id)?.path_ids.map(part => snapshot.work_areas.find(area => area.id === part)?.name).filter(Boolean).join(" › ") : null) || "Entire site";
  const row = (action: ViewerAction) => <ActionRow key={action.id} action={action} today={snapshot.today} />;

  return <div className={styles.today} data-today-role={owner ? "owner" : "office"}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>{owner ? "Your attention today" : "Your working day"}</p>
        <h1>Today</h1>
        <p>Hello, {firstName}. {dayLabel(snapshot.today, "long")}</p>
        <p className={styles.count} data-testid="today-action-count">{todayCountCopy(counts.actions, counts.informational)}</p>
      </div>
      <Link className={styles.secondaryLink} href="/admin/snags/new">Report an issue</Link>
    </header>

    {holds.length > 0 && <aside className={styles.restrictionAlert} aria-label="Active work restrictions">
      <a href="#today-stopped"><strong>{safetyCount} safety {safetyCount === 1 ? "stop" : "stops"} · {qualityCount} quality {qualityCount === 1 ? "hold" : "holds"}</strong><span>Affected work stays stopped. View restrictions<span aria-hidden="true"> →</span></span></a>
    </aside>}

    <div className={styles.columns}>
      <div className={styles.stack}>
        {queue.next ? <section className={`${styles.hero} ${queue.next.kind === "gate" ? styles.gateHero : queue.next.kind === "alert" ? styles.alertHero : ""}`} aria-label="Do this next" data-action-id={queue.next.id} data-action-state={queue.next.state}>
          <p className={styles.eyebrow}>Do this next</p>
          <ActionChips action={queue.next} today={snapshot.today} />
          <h2 id="admin-next-title">{queue.next.title}</h2>
          <p className={styles.where}>{[queue.next.job.reference, queue.next.job.name, queue.next.location].filter(Boolean).join(" · ")}</p>
          <Link className={styles.primaryLink} href={adminActionHref(queue.next)}>{ctaLabel(queue.next)}</Link>
          <p>{queue.next.why}</p>
          {queue.next.requires.length > 0 && <p className={styles.note}>You will need: {queue.next.requires.join(", ")}.</p>}
          {queue.next.kind !== "reminder" && <p className={styles.note}>{classNote(queue.next)}</p>}
        </section> : <section className={styles.empty} aria-label="Your next action">
          <h2>{idle.title}</h2><p>{idle.text}</p>
        </section>}

        {(urgentWaiting.length > 0 || queue.exceptions.length > 0) && <aside className={styles.attention} aria-label="Items needing attention">
          {urgentWaiting.length > 0 && <div><span>{urgentWaiting.length} {urgentWaiting.length === 1 ? "item needs" : "items need"} attention from someone else.</span><a href="#today-waiting">View waiting items<span aria-hidden="true"> →</span></a></div>}
          {queue.exceptions.length > 0 && <div><span>{queue.exceptions.length} outstanding {queue.exceptions.length === 1 ? "problem still needs" : "problems still need"} attention.</span><a href="#today-problems">View outstanding problems<span aria-hidden="true"> →</span></a></div>}
        </aside>}

        {holds.length > 0 && <section className={styles.section} aria-label="Work that is stopped" id="today-stopped">
          <h2>Work that is stopped ({holds.length})</h2>
          <p className={styles.note}>Only the recorded location and activity are stopped. Completing a task here does not release any hold.</p>
          <div className={styles.holds}>{holds.map(hold => {
            const job = snapshot.contracts.find(contract => contract.id === hold.contract_id);
            return <article key={hold.id} className={styles.stop} data-hold-id={hold.id}>
              <strong>{holdTypes[hold.hold_type]} · {job?.name ?? "Recorded job"}</strong>
              <p>{holdScope({ ...hold, location_path: hold.location_path?.length ? hold.location_path : hold.work_area_id ? [areaName(hold.work_area_id)] : [], stage: hold.stage ?? null, activity: hold.activity ?? "" })}</p>
              <p>{hold.reason}</p>
              <p className={styles.note}>{holdStatusLabels[hold.status]}. {hold.hold_type === "safety" && "Follow the principal contractor’s site safety procedures. "}Other restrictions still apply.</p>
              <Link className={styles.rowLink} href={`/admin/holds/${hold.id}`}>View restriction<span aria-hidden="true"> →</span></Link>
            </article>;
          })}</div>
        </section>}

        {queue.then.length > 0 && <section className={styles.section} aria-label="Then">
          <h2>Then ({queue.then.length})</h2><div className={styles.list}>{queue.then.map(row)}</div>
        </section>}

        {queue.exceptions.length > 0 && <section className={styles.section} aria-label="Outstanding problems" id="today-problems">
          <h2>Outstanding problems ({queue.exceptions.length})</h2>
          <p className={styles.note}>These still need attention. The person responsible, or an independent reviewer, must act.</p>
          <div className={styles.list}>{queue.exceptions.map(row)}</div>
        </section>}
      </div>

      <div className={styles.stack}>
        {queue.waiting.length > 0 && <section className={styles.section} aria-label="Waiting on others" id="today-waiting">
          <h2>Waiting on others ({queue.waiting.length})</h2><div className={styles.list}>{queue.waiting.map(row)}</div>
        </section>}
        {queue.info.length > 0 && <section className={styles.section} aria-label="For your information">
          <h2>For your information ({queue.info.length})</h2><div className={styles.list}>{queue.info.map(row)}</div>
        </section>}

        <section className={styles.section} aria-label="Open a record">
          <h2>Open a record</h2>
          <div className={styles.shortcuts}>
            <Link href="/admin/contracts"><strong>Job setup</strong><span>Locations, supervisors, plans and job details</span></Link>
            <Link href="/admin/workforce"><strong>People and workforce</strong><span>Gangs, allocations and insurance</span></Link>
            <Link href="/admin/paperwork"><strong>Paperwork</strong><span>Saved job documents and drawings</span></Link>
            <Link href="/admin/quality"><strong>Quality checks and requests</strong><span>Inspection checks, QA requests and restrictions</span></Link>
            <Link href="/admin/messages"><strong>Site messages and handovers</strong><span>Choose a job to read or send an instruction</span></Link>
          </div>
        </section>
        {canReadFinancial(member) && <aside className={styles.money}><h2>Money</h2><p>Financial records have their own page.</p><Link className={styles.rowLink} href="/admin/money">Open Money<span aria-hidden="true"> →</span></Link></aside>}
      </div>
    </div>
  </div>;
}
