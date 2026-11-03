import { randomUUID } from "node:crypto";
import Link from "next/link";
import { recordMaterialsAction, voidMaterialAction } from "@/app/admin/supervisor/material-actions";
import { DailyForm } from "@/components/site/daily-form";
import { MaterialLines } from "@/components/site/material-lines";
import { locationsFor } from "@/lib/operations/data";
import { materialUnitLabels } from "@/lib/operations/job-costs";
import { materialsFor } from "@/lib/operations/job-costs-data";
import { indexLocations, locationPath } from "@/lib/operations/locations";
import { addDays, dayLabel, londonDate } from "@/lib/operations/planning";
import { requireSite } from "../../../site-access";
import styles from "@/app/admin/admin.module.css";

export const dynamic = "force-dynamic";

// Materials used on site: what, how much and where. Never a price: the office matches these to
// purchases and invoices separately. One short form on a phone, and the last fortnight below it.
export default async function MaterialsUsed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`, today = londonDate();
  const [records, locations] = await Promise.all([materialsFor(supabase, id, addDays(today, -14)), locationsFor(supabase, id)]);
  if (!records) return <>
    <h1 className={styles.title}>Materials used</h1>
    <p className={styles.warning}>Materials cannot be recorded in TileSPEC yet. Write them in today&apos;s handover for the office.</p>
    <Link className={styles.secondaryButton} href={`${base}/finish`}>Write today&apos;s handover</Link>
  </>;
  const index = indexLocations(locations);
  const choices = locations.filter(location => !location.archived_at).map(location => ({ id: location.id, label: locationPath(index, location.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const current = records.filter(record => !record.voided_at);
  return <>
    <h1 className={styles.title}>Materials used</h1>
    <p className={styles.description}>What you used today, and how much. The office matches it to deliveries and invoices.</p>
    <section className={styles.panel} aria-label="Record materials used">
      <DailyForm action={recordMaterialsAction} label="Save materials">
        <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} />
        <MaterialLines locations={choices} />
        <label className={styles.field}>Day used<input type="date" name="work_date" defaultValue={today} max={today} min={addDays(today, -31)} /></label>
      </DailyForm>
    </section>
    <section className={styles.panel} aria-label="Recent materials">
      <h2>Last two weeks</h2>
      {current.length ? <ul className={styles.plainList}>{current.map(record => <li key={record.id} data-material-id={record.id}>
        <strong>{record.item}</strong> · {record.quantity} {materialUnitLabels[record.unit]}{record.location_path.length ? ` · ${record.location_path.join(" › ")}` : ""}
        <span className={styles.small}> · {dayLabel(record.work_date)} · {record.recorded_by === member.user_id ? "you" : record.recorded_by_name}</span>
        {record.note && <p className={styles.small}>{record.note}</p>}
        {record.recorded_by === member.user_id && <details className={styles.details}><summary>Remove this entry</summary>
          <DailyForm action={voidMaterialAction} label="Remove">
            <input type="hidden" name="record_id" value={record.id} /><input type="hidden" name="contract_id" value={id} />
            <label className={styles.field}>Why?<input name="reason" required minLength={3} maxLength={1000} /></label>
          </DailyForm></details>}
      </li>)}</ul> : <p>No materials recorded in the last two weeks.</p>}
    </section>
    <Link className={styles.secondaryButton} href={base}>Back to today</Link>
  </>;
}
