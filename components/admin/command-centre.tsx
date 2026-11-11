import Link from "next/link";
import type { ReactNode } from "react";
import type { Member } from "@/lib/auth";
import type { NextActionSnapshot, Viewer } from "@/lib/operations/next-actions";
import type { NextActionConfig } from "@/lib/operations/next-actions/config";
import { dayLabel } from "@/lib/operations/planning";
import { money, plural, programmeLabels, stageLabels, type Metric } from "@/lib/operations/command-centre";
import type { CommandCentreData } from "@/lib/operations/command-centre-data";
import { AdminToday } from "./admin-today";
import styles from "./command-centre.module.css";

type Props = { snapshot: NextActionSnapshot; viewer: Viewer; member: Member; config?: NextActionConfig; data: CommandCentreData; queueCount: number; stops: { safety: number; quality: number } };

const shortDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const tone = (t: Metric["tone"]) => (t === "alert" ? styles.alert : t === "warning" ? styles.warning : t === "ok" ? styles.ok : "");

function Panel({ id, title, action, children, description }: { id: string; title: string; action?: ReactNode; children: ReactNode; description?: string }) {
  return <section className={styles.panel} aria-labelledby={`${id}-heading`} id={id}>
    <div className={styles.panelHead}>
      <div><h2 id={`${id}-heading`}>{title}</h2>{description && <p className={styles.muted}>{description}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

export function metricsFor(data: CommandCentreData, queueCount: number, stops: { safety: number; quality: number }): Metric[] {
  const onSite = data.jobs.filter(job => job.gangsPlannedToday.length || job.gangsOnSiteToday);
  const confirmed = data.jobs.reduce((sum, job) => sum + job.gangsOnSiteToday, 0), planned = data.jobs.reduce((sum, job) => sum + job.gangsPlannedToday.length, 0);
  const expiring = data.admin.insurance.length, incomplete = data.admin.gangs?.filter(g => g.steps.some(s => !s.done)).length ?? 0;
  const metrics: Metric[] = [
    { key: "needs", label: "Needs you", value: String(queueCount), detail: stops.safety + stops.quality ? `${plural(stops.safety, "safety stop")} · ${plural(stops.quality, "quality hold")}` : "No work stopped",
      href: "#attention", tone: stops.safety ? "alert" : queueCount ? "warning" : "ok" },
    { key: "inbox", label: "Inbox", value: String(data.inbox.total), detail: `${plural(data.inbox.threads, "site question")} · ${plural(data.inbox.reports, "report")} to review`,
      href: "/admin/inbox", tone: data.inbox.threads ? "warning" : data.inbox.total ? "neutral" : "ok" },
    { key: "site", label: "On site today", value: `${onSite.length}/${data.jobs.length}`, detail: `${plural(confirmed, "gang")} confirmed of ${planned} planned`,
      href: "/admin/planner", tone: planned > confirmed ? "warning" : "neutral" },
  ];
  if (data.money) {
    metrics.push(
      { key: "in", label: "Overdue from customers", value: money(data.money.ageing.overdue), detail: `${money(data.money.ageing.total)} outstanding in total`,
        href: "/admin/finance#debtors", tone: data.money.ageing.overdue > 0 ? "alert" : "ok" },
      { key: "out", label: "Gang payments this week", value: money(data.money.gang.dueWeek.amount),
        detail: `${plural(data.money.gang.toApprove.count, "claim")} to approve · ${data.money.gang.toCheck.count} with supervisors`, href: "/admin/gang-invoices",
        tone: data.money.gang.overdue.count ? "alert" : data.money.gang.toApprove.count ? "warning" : "neutral" },
    );
  } else {
    metrics.push(
      { key: "jobs", label: "Live jobs", value: String(data.jobs.length), detail: `${data.jobs.filter(j => j.status === "behind" || j.status === "overrun").length} behind programme`,
        href: "#live-jobs", tone: data.jobs.some(j => j.status === "behind" || j.status === "overrun") ? "warning" : "neutral" },
      { key: "claims", label: "Claims to check", value: String(data.inbox.gangChecks), detail: "Gang invoices waiting for a supervisor", href: "/admin/gang-invoices",
        tone: data.inbox.gangChecks ? "warning" : "ok" },
    );
  }
  metrics.push({ key: "compliance", label: "Compliance", value: String(expiring + incomplete),
    detail: `${plural(expiring, "insurance")} expiring or expired · ${plural(incomplete, "gang")} not fully onboarded`, href: "/admin/subcontractors",
    tone: data.admin.insurance.some(i => i.expired) ? "alert" : expiring + incomplete ? "warning" : "ok" });
  return metrics;
}

function QuickActions({ financial, owner }: { financial: boolean; owner: boolean }) {
  const links = [
    ["New job", "/admin/contracts/new"], ["Add or onboard a gang", "/admin/subcontractors/new"], ["Plan gangs", "/admin/planner"],
    ["Send an instruction to site", "/admin/messages"], ["Raise a snag or stop", "/admin/snags/new"], ["Request materials", "/admin/materials#new"],
    ["Add a customer", "/admin/customers#new"], ...(financial ? [["New quotation", "/admin/quotes#new"], ["Record a customer payment", "/admin/contracts?invoice=1"],
      ["Record a startup expense", "/admin/startup-expenses"]] : []), ...(owner ? [["Email notifications", "/admin/notifications"]] : []),
  ];
  return <details className={styles.quick}>
    <summary>+ New</summary>
    <div className={styles.quickMenu}>{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</div>
  </details>;
}

export function CommandCentre({ snapshot, viewer, member, config, data, queueCount, stops }: Props) {
  const owner = member.role === "owner";
  const firstName = member.display_name.trim().split(/\s+/)[0] || "there";
  const metrics = metricsFor(data, queueCount, stops);
  const m = data.money;
  return <div className={styles.centre} data-command-centre={owner ? "owner" : "office"}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>Command centre</p>
        <h1>Good morning, {firstName}</h1>
        <p className={styles.muted}>{dayLabel(data.today, "long")} · {plural(data.jobs.length, "live job")}</p>
      </div>
      <div className={styles.headerTools}>
        <form action="/admin/search" method="get" role="search" className={styles.search}>
          <label htmlFor="centre-search" className={styles.srOnly}>Search jobs, customers, gangs, invoices and records</label>
          <input id="centre-search" name="q" type="search" placeholder="Search jobs, customers, gangs, invoices…" maxLength={80} />
          <button type="submit">Search</button>
        </form>
        <QuickActions financial={data.financial} owner={owner} />
      </div>
    </header>

    <nav className={styles.metrics} aria-label="Summary">
      {metrics.map(metric => <Link key={metric.key} href={metric.href} className={`${styles.metric} ${tone(metric.tone)}`} data-metric={metric.key}>
        <span className={styles.metricLabel}>{metric.label}</span>
        <strong className={styles.metricValue}>{metric.value}</strong>
        <span className={styles.metricDetail}>{metric.detail}</span>
      </Link>)}
    </nav>

    <Panel id="attention" title="Immediate attention" description="Every decision and action across the company, most urgent first. Each opens its record."
      action={<Link className={styles.link} href="/admin/inbox">Open the inbox →</Link>}>
      <ul className={styles.attentionStrip}>
        {data.inbox.threads > 0 && <li><Link href="/admin/inbox#questions"><strong>{data.inbox.threads}</strong> supervisor {data.inbox.threads === 1 ? "question or decision" : "questions and decisions"} waiting for an answer</Link></li>}
        {data.inbox.reports > 0 && <li><Link href="/admin/inbox#reports"><strong>{data.inbox.reports}</strong> site {data.inbox.reports === 1 ? "report" : "reports"} with problems to review</Link></li>}
        {data.inbox.instructions > 0 && <li><Link href="/admin/inbox#instructions"><strong>{data.inbox.instructions}</strong> {data.inbox.instructions === 1 ? "instruction" : "instructions"} not yet acknowledged on site</Link></li>}
        {data.inbox.gangChecks > 0 && <li><Link href="/admin/gang-invoices"><strong>{data.inbox.gangChecks}</strong> gang {data.inbox.gangChecks === 1 ? "claim" : "claims"} waiting for supervisor verification</Link></li>}
        {data.inbox.gangApprovals > 0 && <li><Link href="/admin/gang-invoices"><strong>{data.inbox.gangApprovals}</strong> gang {data.inbox.gangApprovals === 1 ? "claim" : "claims"} ready for approval</Link></li>}
        {m && m.ageing.overdue > 0 && <li className={styles.alertItem}><Link href="/admin/finance#debtors"><strong>{money(m.ageing.overdue)}</strong> overdue from customers</Link></li>}
        {m && m.gang.overdue.count > 0 && <li className={styles.alertItem}><Link href="/admin/gang-invoices"><strong>{money(m.gang.overdue.amount)}</strong> approved gang payments past their date</Link></li>}
        {data.admin.insurance.filter(i => i.expired).map(i => <li key={`${i.company}${i.type}`} className={styles.alertItem}><Link href="/admin/workforce">{i.company}: {i.type} insurance expired {shortDay(i.on)}</Link></li>)}
        {data.admin.insurance.filter(i => !i.expired).slice(0, 3).map(i => <li key={`${i.company}${i.type}`}><Link href="/admin/workforce">{i.company}: {i.type} insurance expires {shortDay(i.on)}</Link></li>)}
      </ul>
      <AdminToday snapshot={snapshot} viewer={viewer} member={member} config={config} embedded />
    </Panel>

    <Panel id="live-jobs" title={`Live jobs (${data.jobs.length})`} description="Every active project: stage, programme, people, progress, money and open items."
      action={<Link className={styles.link} href="/admin/contracts">All jobs →</Link>}>
      {data.jobs.length === 0 ? <p className={styles.empty}>No jobs are live. Jobs that are won appear here once they start, or move a job to Mobilising or Live from its page.</p>
      : <div className={styles.jobs} role="table" aria-label="Live jobs">
        <div className={styles.jobHead} role="row">
          <span role="columnheader">Job and stage</span><span role="columnheader">People</span><span role="columnheader">Today</span><span role="columnheader">Progress</span>
          <span role="columnheader">Programme</span>{data.financial && <span role="columnheader">Money</span>}<span role="columnheader">Open items</span>
        </div>
        {data.jobs.map(job => <Link key={job.id} href={`/admin/contracts/${job.id}`} className={styles.job} role="row" data-job={job.reference}>
          <span role="cell" className={styles.jobName}><strong>{job.reference} · {job.name}</strong><small>{job.client || "Customer not set"}</small>
            <span className={`${styles.chip} ${job.stage === "on_hold" ? styles.warning : ""}`}>{stageLabels[job.stage]}{job.stageConfirmed ? "" : " (from dates)"}</span></span>
          <span role="cell"><small>Supervisor</small>{job.supervisors.join(", ") || <em className={styles.missing}>None assigned</em>}
            {job.managers.length > 0 && <><small>Manager</small>{job.managers.join(", ")}</>}</span>
          <span role="cell"><small>Planned</small>{job.gangsPlannedToday.join(", ") || "Nobody planned"}<small>Confirmed on site</small>{plural(job.peopleOnSiteToday, "person", "people")}</span>
          <span role="cell">{job.progress === null ? <em className={styles.missing}>Not measured</em> : <><strong>{job.progress}%</strong> done</>}
            {job.programme !== null && <small>{job.programme}% of time used</small>}
            {job.progress !== null && <span className={styles.bar} aria-hidden="true"><span style={{ width: `${job.progress}%` }} /></span>}</span>
          <span role="cell"><span className={`${styles.chip} ${job.status === "behind" || job.status === "overrun" ? styles.alert : job.status === "on_track" ? styles.ok : ""}`}>{programmeLabels[job.status]}</span>
            <small>{job.end ? `Finish ${shortDay(job.end)}` : "No finish date"}</small></span>
          {data.financial && <span role="cell">{job.money ? <><strong className={job.money.below ? styles.alertText : ""}>{job.money.margin === null ? "No margin" : `${job.money.margin.toFixed(1)}% margin`}</strong>
            <small>{money(job.money.value)} value · {money(job.money.cost)} cost</small>{job.money.target !== null && <small>Target {job.money.target}%</small>}</> : <em className={styles.missing}>No budget</em>}</span>}
          <span role="cell" className={styles.counts}>
            {job.safetyStops > 0 && <span className={`${styles.chip} ${styles.alert}`}>{plural(job.safetyStops, "safety stop")}</span>}
            {job.stops - job.safetyStops > 0 && <span className={`${styles.chip} ${styles.warning}`}>{plural(job.stops - job.safetyStops, "hold")}</span>}
            {job.openSnags > 0 && <span className={styles.chip}>{plural(job.openSnags, "snag")}{job.criticalSnags ? `, ${job.criticalSnags} critical` : ""}</span>}
            {job.waitingOnOffice > 0 && <span className={`${styles.chip} ${styles.warning}`}>{plural(job.waitingOnOffice, "question")}</span>}
            {job.openActions > 0 && <span className={styles.chip}>{plural(job.openActions, "action")}</span>}
            {!job.stops && !job.openSnags && !job.waitingOnOffice && !job.openActions && <span className={`${styles.chip} ${styles.ok}`}>Nothing open</span>}
          </span>
        </Link>)}
      </div>}
    </Panel>

    <Panel id="yesterday" title={`Yesterday on site · ${shortDay(data.yesterday)}`} description="Supervisor reports, attendance, progress, photographs, inspections, snags and materials, job by job.">
      {data.yesterdayJobs.length === 0 ? <p className={styles.empty}>Nothing was recorded on site yesterday.</p>
      : <div className={styles.yesterday}>{data.yesterdayJobs.map(job => {
        const quiet = !job.handovers.length && !job.people && !job.progress.length && !job.photoCount && !job.inspections && !job.snags.length;
        return <article key={job.id} className={styles.day} data-yesterday={job.reference}>
          <h3><Link href={`/admin/contracts/${job.id}/activity?date=${data.yesterday}`}>{job.reference} · {job.name}</Link></h3>
          {quiet ? <p className={styles.warningText}>No report, attendance or progress was recorded.</p> : <>
            <p className={styles.facts}>
              <span>{job.handovers.length ? `Report from ${job.handovers.map(h => h.actor).join(", ")}` : <em className={styles.missing}>No end-of-day report</em>}</span>
              <span>{plural(job.people, "person", "people")} on site{job.teams.length ? ` (${job.teams.join(", ")})` : ""}</span>
              <span>{plural(job.inspections, "inspection")}{job.failedInspections ? `, ${job.failedInspections} with problems` : ""}</span>
              <span>{plural(job.photoCount, "photograph")}</span>
            </p>
            {job.handovers.map(h => <div key={h.id} className={styles.report}>
              {h.completed && <p><strong>Done:</strong> {h.completed}</p>}
              {h.problems && <p className={styles.alertText}><strong>Problems:</strong> {h.problems}</p>}
              {h.attention && <p className={styles.warningText}><strong>Needs attention:</strong> {h.attention}</p>}
              {h.materials && <p><strong>Materials:</strong> {h.materials}</p>}
              {h.office && <p><strong>For the office:</strong> {h.office}</p>}
            </div>)}
            {job.progress.length > 0 && <ul className={styles.progress}>{job.progress.map((p, i) => <li key={i}>{p.description}{p.quantity !== null ? ` · ${p.quantity} ${p.unit}` : ""}{p.where ? ` · ${p.where}` : ""}</li>)}</ul>}
            {job.photos.length > 0 && <div className={styles.photos}>{job.photos.map(photo => photo.url
              ? <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={photo.caption ?? `Site photograph, ${job.name}`} loading="lazy" /></a> : null)}</div>}
            {(job.snags.length > 0 || job.materials.length > 0) && <ul className={styles.progress}>
              {job.snags.map(s => <li key={s.id}><Link href={`/admin/snags/${s.id}`}>Snag raised: {s.label}{s.severity === "critical" ? " (critical)" : ""}</Link></li>)}
              {job.materials.map(item => <li key={item.id}><Link href="/admin/materials">Materials requested: {item.quantity} {item.unit} {item.item}</Link></li>)}
            </ul>}
          </>}
          {job.waitingOnOffice > 0 && <p><Link className={styles.link} href={`/admin/inbox?job=${job.id}`}>{plural(job.waitingOnOffice, "message")} waiting for a response →</Link></p>}
        </article>;
      })}</div>}
    </Panel>

    {m && <Panel id="money" title="Financial control" description="From the recorded applications, invoices, receipts, gang claims and job costs. Only people with money access see this."
      action={<Link className={styles.link} href="/admin/finance">Debtors and cash flow →</Link>}>
      <div className={styles.moneyGrid}>
        <div className={styles.card}>
          <h3>Customers owe</h3>
          <p className={styles.big}>{money(m.ageing.total)}</p>
          <dl className={styles.pairs}>
            <div><dt>Not yet due</dt><dd>{money(m.ageing.current)}</dd></div><div><dt>1–30 days late</dt><dd>{money(m.ageing.days_1_30)}</dd></div>
            <div><dt>31–60 days</dt><dd>{money(m.ageing.days_31_60)}</dd></div><div><dt>Over 60 days</dt><dd>{money(m.ageing.days_61_90 + m.ageing.days_over_90)}</dd></div>
          </dl>
          {m.debts.slice(0, 3).map(d => <p key={d.application_id} className={styles.small}><Link href={`/admin/contracts/${d.contract_id}/accounts/applications/${d.application_id}`}>{d.job} · application {d.number}: {money(d.outstanding)}{d.days_overdue ? `, ${d.days_overdue} days late` : ""}</Link></p>)}
        </div>
        <div className={styles.card}>
          <h3>Subcontractors</h3>
          <dl className={styles.pairs}>
            <div><dt>With supervisors to verify</dt><dd>{m.gang.toCheck.count} · {money(m.gang.toCheck.amount)}</dd></div>
            <div><dt>Ready for approval</dt><dd>{m.gang.toApprove.count} · {money(m.gang.toApprove.amount)}</dd></div>
            <div><dt>Due within 7 days</dt><dd>{m.gang.dueWeek.count} · {money(m.gang.dueWeek.amount)}</dd></div>
            <div><dt>Retention held</dt><dd>{money(m.gang.retentionHeld)}</dd></div>
            <div><dt>CIS deducted this month</dt><dd>{money(m.gang.cisThisMonth)}</dd></div>
          </dl>
          <Link className={styles.link} href="/admin/gang-invoices">Gang invoices →</Link>
        </div>
        <div className={styles.card}>
          <h3>Extras and sales</h3>
          <dl className={styles.pairs}>
            <div><dt>Dayworks and variations to price</dt><dd>{m.extras.toPrice}</dd></div>
            <div><dt>Waiting for the customer to sign</dt><dd>{m.extras.awaitingClient}</dd></div>
            {m.quotes && <div><dt>Quotations awaiting a decision</dt><dd>{m.quotes.open} · {money(m.quotes.value)}</dd></div>}
            {m.quotes && <div><dt>Quotation follow-ups due</dt><dd>{m.quotes.followUps}</dd></div>}
          </dl>
          <Link className={styles.link} href="/admin/quotes">Quotations →</Link>
        </div>
      </div>
      <h3 className={styles.subhead}>Cash flow: next 8 weeks</h3>
      <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th scope="col">Week of</th><th scope="col">Expected in</th><th scope="col">Expected out</th><th scope="col">Net</th><th scope="col">Running</th></tr></thead>
        <tbody>{m.cash.map(week => <tr key={week.start}><td>{shortDay(week.start)}</td><td>{money(week.in)}{week.overdueIn ? <small> incl. {money(week.overdueIn)} overdue</small> : null}</td>
          <td>{money(week.out)}</td><td className={week.net < 0 ? styles.alertText : ""}>{money(week.net)}</td><td className={week.running < 0 ? styles.alertText : ""}>{money(week.running)}</td></tr>)}</tbody>
      </table></div>
      {m.positions.length > 0 && <>
        <h3 className={styles.subhead}>Profitability by job</h3>
        <div className={styles.scroll}><table className={styles.table}>
          <thead><tr><th scope="col">Job</th><th scope="col">Revised value</th><th scope="col">Cost to date</th><th scope="col">Forecast profit</th><th scope="col">Margin</th></tr></thead>
          <tbody>{m.positions.map(p => <tr key={p.id}><td><Link href={`/admin/contracts/${p.id}/money`}>{p.job}</Link></td><td>{money(p.value)}</td><td>{money(p.cost)}</td>
            <td>{money(p.profit)}</td><td className={p.below ? styles.alertText : ""}>{p.margin === null ? "—" : `${p.margin.toFixed(1)}%`}{p.target !== null ? ` (target ${p.target}%)` : ""}</td></tr>)}</tbody>
        </table></div>
      </>}
    </Panel>}

    <Panel id="planning" title="Planning: next 14 days" description="Who is where, jobs starting, gaps, materials and deadlines." action={<Link className={styles.link} href="/admin/planner">Open the planner →</Link>}>
      <div className={styles.planGrid}>
        <div className={styles.card}>
          <h3>Job starts</h3>
          {data.planning.starts.length === 0 ? <p className={styles.muted}>No jobs start in the next 14 days.</p>
          : <ul className={styles.list}>{data.planning.starts.map(s => <li key={s.id}><Link href={`/admin/contracts/${s.id}`}><strong>{shortDay(s.on)}</strong> {s.label}</Link>
            {s.ready ? <span className={`${styles.chip} ${styles.ok}`}>Set up</span> : <small className={styles.warningText}>Still to do: {s.missing.join("; ")}</small>}</li>)}</ul>}
        </div>
        <div className={styles.card}>
          <h3>Staffing</h3>
          <ul className={styles.list}>
            {data.planning.unplannedJobs.map(job => <li key={job.id}><Link href={`/admin/contracts/${job.id}/plan`} className={styles.warningText}>No gang planned: {job.label}</Link></li>)}
            {data.planning.doubleBooked > 0 && <li><Link href="/admin/planner" className={styles.alertText}>{plural(data.planning.doubleBooked, "gang-day")} double-booked</Link></li>}
            {data.planning.idle.slice(0, 5).map(i => <li key={i.team}><Link href="/admin/planner">{i.team}: {plural(i.days, "working day")} without work</Link></li>)}
            {!data.planning.unplannedJobs.length && !data.planning.doubleBooked && !data.planning.idle.length && <li className={styles.muted}>Every live job and gang is planned.</li>}
          </ul>
        </div>
        <div className={styles.card}>
          <h3>Materials</h3>
          {data.planning.materials === null ? <p className={styles.muted}>Materials tracking is installed with the latest database update.</p>
          : data.planning.materials.length === 0 ? <p className={styles.muted}>Nothing requested or on order.</p>
          : <ul className={styles.list}>{data.planning.materials.slice(0, 6).map(item => <li key={item.id}><Link href="/admin/materials">{item.quantity} {item.unit} {item.item} · {item.job}</Link>
            <small className={item.status === "requested" && item.needed_by && item.needed_by <= data.today ? styles.alertText : ""}>{item.status === "ordered" ? "Ordered" : "Not ordered"}{item.needed_by ? `, needed ${shortDay(item.needed_by)}` : ""}</small></li>)}</ul>}
        </div>
        <div className={styles.card}>
          <h3>Deadlines</h3>
          {data.planning.deadlines.length === 0 ? <p className={styles.muted}>No deadlines in the next 14 days.</p>
          : <ul className={styles.list}>{data.planning.deadlines.slice(0, 8).map((d, i) => <li key={i}><Link href={d.href}><strong>{shortDay(d.on)}</strong> {d.what}{d.job ? ` · ${d.job}` : ""}</Link></li>)}</ul>}
        </div>
      </div>
    </Panel>

    <Panel id="administration" title="Administration" description="Customers, subcontractors, compliance, sales and settings.">
      <div className={styles.adminGrid}>
        <Link className={styles.adminLink} href="/admin/customers"><strong>Customers</strong><span>{data.admin.customers === null ? "Customer list" : plural(data.admin.customers, "customer")}</span></Link>
        <Link className={styles.adminLink} href="/admin/subcontractors"><strong>Subcontractor onboarding</strong>
          <span>{data.admin.gangs === null ? "Gangs, portal links and agreements" : `${data.admin.gangs.filter(g => g.steps.every(s => s.done)).length} of ${data.admin.gangs.length} gangs fully onboarded`}</span></Link>
        <Link className={styles.adminLink} href="/admin/workforce"><strong>Insurance and people</strong><span>{plural(data.admin.insurance.length, "certificate")} expiring or expired</span></Link>
        <Link className={styles.adminLink} href="/admin/tenders"><strong>Tenders</strong><span>{data.admin.tenders === null ? "Enquiries" : `${data.admin.tenders} open`}</span></Link>
        {data.financial && <Link className={styles.adminLink} href="/admin/quotes"><strong>Quotations</strong><span>{data.admin.quotes === null ? "Quotations" : `${data.admin.quotes} awaiting a decision`}</span></Link>}
        {data.financial && <Link className={styles.adminLink} href="/admin/documents"><strong>Documents and compliance</strong><span>RAMS, COSHH, health and safety, terms</span></Link>}
        {data.financial && <Link className={styles.adminLink} href="/admin/startup-expenses"><strong>Startup expenses</strong><span>{data.admin.startup ? `${money(data.admin.startup.amount)} still to reimburse` : "Company setup costs"}</span></Link>}
        {data.financial && <Link className={styles.adminLink} href="/admin/accounts/settings"><strong>Business settings</strong><span>Company, bank and invoice details</span></Link>}
        {owner && <Link className={styles.adminLink} href="/admin/notifications"><strong>Email notifications</strong>
          <span>{data.admin.notifications === null ? "Set up urgent alerts and the morning summary" : data.admin.notifications.live ? `On · ${plural(data.admin.notifications.recipients, "recipient")}` : "Not switched on yet"}</span></Link>}
        {owner && <Link className={styles.adminLink} href="/admin/team"><strong>User access</strong><span>Staff accounts and roles</span></Link>}
      </div>
    </Panel>
  </div>;
}
