import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { OperationsForm } from "@/components/operations/operations-form";
import { paymentTermsText, unitLabel } from "@/lib/operations/gang-invoices";
import { calendarDate, money } from "@/components/operations/format";
import { saveGangRateAction, saveGangSubcontractAction, voidGangRateAction } from "../actions";
import styles from "../../admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";
const weekdays = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [7, "Sunday"]] as const;

type Sub = { id: string; contract_id: string; team_id: string; payment_cycle: string; pay_weekday: number; payment_days: number; cycle_anchor: string | null; terms_note: string; active: boolean; version: number; retention_percent?: number };
const rateUnit = (unit: string) => (unit === "day" ? "day" : unit === "hour" ? "hour" : unitLabel(unit));

function TermsFields({ sub }: { sub?: Sub }) {
  return <>
    <div className={css.inputs}>
      <label className={styles.field}>Payment cycle<select name="payment_cycle" defaultValue={sub?.payment_cycle ?? "weekly"}>
        <option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="custom">Custom (days after invoice)</option></select></label>
      <label className={styles.field}>Invoice week ends / pay day<select name="pay_weekday" defaultValue={String(sub?.pay_weekday ?? 5)}>
        {weekdays.map(([n, d]) => <option key={n} value={n}>{d}</option>)}</select></label>
      <label className={styles.field}>Days to pay<input name="payment_days" inputMode="numeric" defaultValue={String(sub?.payment_days ?? 7)} required /></label>
      <label className={styles.field}>Fortnightly: a period end date<input name="cycle_anchor" type="date" defaultValue={sub?.cycle_anchor ?? ""} /></label>
      <label className={styles.field}>Retention % (0 if none)<input name="retention_percent" inputMode="decimal" defaultValue={String(Number(sub?.retention_percent ?? 0))} /></label>
    </div>
    <label className={styles.field}>Agreed terms note (optional)<input name="terms_note" maxLength={2000} defaultValue={sub?.terms_note ?? ""} placeholder="For example: agreed exceptions" /></label>
    <small>Weekly with Friday and 7 days: invoice Friday, paid the following Friday.</small>
  </>;
}

export default async function GangSetup() {
  const { supabase } = await requireFinancialActor();
  const [subs, rates, teams, contracts, areas, members] = await Promise.all([
    supabase.from("gang_subcontracts").select("*").order("created_at"),
    supabase.from("gang_rates").select("id,subcontract_id,work_area_id,unit,rate,description,effective_from,voided_at,created_by_name").order("effective_from", { ascending: false }),
    supabase.from("teams").select("id,name,kind,active").order("name"),
    supabase.from("contracts").select("id,reference,name").order("name"),
    supabase.from("work_areas").select("id,contract_id,name,path_ids,archived_at"),
    supabase.from("team_memberships").select("team_id,valid_until,voided_at,operatives(display_name,user_id)").is("voided_at", null),
  ]);
  [subs, rates, teams, contracts, areas].forEach(r => checkDatabase(r.error));
  const teamName = new Map((teams.data ?? []).map(t => [t.id, t.name]));
  const job = new Map((contracts.data ?? []).map(c => [c.id, `${c.name} (${c.reference})`]));
  const areaById = new Map((areas.data ?? []).map(a => [a.id, a]));
  const areaName = (id: string | null) => !id ? "Every area" : (areaById.get(id)?.path_ids as string[] | undefined)?.map(p => areaById.get(p)?.name).filter(Boolean).join(" › ") || "Area";
  const today = new Date().toISOString().slice(0, 10);
  const logins = (teamId: string) => (members.data ?? []).filter(m => m.team_id === teamId && (!m.valid_until || m.valid_until >= today))
    .map(m => m.operatives as unknown as { display_name: string; user_id: string | null } | null).filter(Boolean) as { display_name: string; user_id: string | null }[];
  const gangTeams = (teams.data ?? []).filter(t => t.active && t.kind !== "direct_team");

  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Gang invoices</p><h1 className={styles.title}>Gangs on jobs</h1>
      <p className={styles.description}>A gang can send invoices for a job once it is set up here. Payment terms set the scheduled payment date of each invoice. Rates are seen only by office users with money access.</p></div>
      <Link href="/admin/gang-invoices">Back to gang invoices</Link></div>

    <section className={styles.panel}>
      <h2>Add a gang to a job</h2>
      <p className={styles.muted}>Gang members sign in with their own login. Link each person&apos;s login to their operative record and gang in <Link href="/admin/workforce">Workforce</Link>.</p>
      <OperationsForm action={saveGangSubcontractAction} submitLabel="Add gang to job">
        <div className={css.inputs}>
          <label className={styles.field}>Job<select name="contract_id" required defaultValue=""><option value="">Choose job</option>{(contracts.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name} ({c.reference})</option>)}</select></label>
          <label className={styles.field}>Gang<select name="team_id" required defaultValue=""><option value="">Choose gang</option>{gangTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        </div>
        <TermsFields />
      </OperationsForm>
    </section>

    {(subs.data ?? []).length === 0 ? <p className={styles.empty}>No gangs are set up on jobs yet.</p>
      : <ul className={css.cards}>{((subs.data ?? []) as Sub[]).map(sub => {
        const subRates = (rates.data ?? []).filter(r => r.subcontract_id === sub.id);
        const people = logins(sub.team_id);
        return <li key={sub.id} className={css.card}>
          <div className={css.cardHead}><h3>{teamName.get(sub.team_id) ?? "Gang"} — {job.get(sub.contract_id) ?? "Job"}</h3>
            <span className={`${css.status} ${sub.active ? css.good : css.closed}`}>{sub.active ? "Can send invoices" : "Stopped"}</span></div>
          <p style={{ margin: "4px 0" }}>{paymentTermsText(sub)} Retention {Number(sub.retention_percent ?? 0)}%.{sub.terms_note ? ` ${sub.terms_note}` : ""} <Link href={`/admin/subcontractors/${sub.team_id}`}>Onboarding, agreement, variations and portal link</Link></p>
          <p className={styles.muted} style={{ margin: "4px 0" }}>Members: {people.length ? people.map(p => `${p.display_name}${p.user_id ? "" : " (no login)"}`).join(", ") : "none recorded"}</p>
          <h4 style={{ margin: "12px 0 4px" }}>Agreed rates</h4>
          {subRates.length ? <table className={css.compare}><tbody>{subRates.map(r => <tr key={r.id} style={r.voided_at ? { opacity: 0.55 } : undefined}>
            <td>{["day", "hour"].includes(r.unit) ? (r.description || (r.unit === "day" ? "Day rate" : "Hourly rate")) : `${areaName(r.work_area_id)}${r.description ? ` · ${r.description}` : ""}`}</td><td className={css.num}>{money(Number(r.rate))} per {rateUnit(r.unit)}</td>
            <td>from {calendarDate(r.effective_from)}{r.voided_at ? " · withdrawn" : ""}</td>
            <td>{!r.voided_at && <details><summary>Withdraw</summary><OperationsForm action={voidGangRateAction} submitLabel="Withdraw rate" compact>
              <input type="hidden" name="rate_id" value={r.id} /><label className={styles.field}>Reason<input name="reason" required minLength={3} maxLength={1000} /></label>
            </OperationsForm></details>}</td></tr>)}</tbody></table>
            : <p className={styles.muted}>No rates recorded. The office enters the rate when approving.</p>}
          <details><summary>Add a rate</summary>
            <OperationsForm action={saveGangRateAction} submitLabel="Save rate" compact>
              <input type="hidden" name="subcontract_id" value={sub.id} /><input type="hidden" name="request_key" value={randomUUID()} />
              <div className={css.inputs}>
                <label className={styles.field}>Area<select name="work_area_id" defaultValue=""><option value="">Every area</option>
                  {(areas.data ?? []).filter(a => a.contract_id === sub.contract_id && !a.archived_at).map(a => <option key={a.id} value={a.id}>{areaName(a.id)}</option>)}</select></label>
                <label className={styles.field}>Unit<select name="unit" defaultValue="m2"><option value="m2">m²</option><option value="lm">linear m</option><option value="item">items</option><option value="day">day (every area)</option><option value="hour">hour (every area)</option></select></label>
                <label className={styles.field}>Rate £<input name="rate" inputMode="decimal" required /></label>
                <label className={styles.field}>From<input name="effective_from" type="date" /></label>
              </div>
              <label className={styles.field}>Description (optional)<input name="description" maxLength={200} placeholder="For example: floor tiling, fix only; or for a day rate: tiler, labourer" /></label>
              <small>The subcontractor sees their own agreed rates in the portal and cannot change them. A day or hourly rate applies across the job: leave the area as every area.</small>
            </OperationsForm>
          </details>
          <details><summary>Change terms or stop invoices</summary>
            <OperationsForm action={saveGangSubcontractAction} submitLabel="Save terms" compact>
              <input type="hidden" name="contract_id" value={sub.contract_id} /><input type="hidden" name="team_id" value={sub.team_id} /><input type="hidden" name="version" value={sub.version} />
              <TermsFields sub={sub} />
              <label className={styles.field}>Status<select name="active" defaultValue={String(sub.active)}><option value="true">Can send invoices</option><option value="false">Stopped (no new invoices)</option></select></label>
            </OperationsForm>
          </details>
        </li>;
      })}</ul>}
  </>;
}
