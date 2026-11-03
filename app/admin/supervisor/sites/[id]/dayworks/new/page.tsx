import { randomUUID } from "node:crypto";
import Link from "next/link";
import { createDayworkAction } from "@/app/admin/supervisor/daywork-actions";
import { DailyForm } from "@/components/site/daily-form";
import { DayworkLines } from "@/components/site/daywork-lines";
import { LocationPicker } from "@/components/office/location-picker";
import { locationsFor } from "@/lib/operations/data";
import { dayworksAvailable, rateItemsFor, variationsAvailable } from "@/lib/operations/daywork-data";
import { londonDate } from "@/lib/operations/planning";
import { requireSite } from "../../../../site-access";
import styles from "@/app/admin/admin.module.css";

export const dynamic = "force-dynamic";

// One short form on a phone. A daywork: what was done, where, who asked, the people, plant and materials.
// A variation: what needs to change, where and who asked; people and materials only if already known.
// Photos and the client's signature are added on the record itself, so neither can block saving it.
export default async function NewDaywork({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { id } = await params;
  const variation = (await searchParams).kind === "variation";
  const { supabase, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`, back = `${base}/commercial?kind=${variation ? "variations" : "dayworks"}`;
  const word = variation ? "variation" : "daywork";
  if (!await dayworksAvailable(supabase) || (variation && !await variationsAvailable(supabase))) return <>
    <h1 className={styles.title}>{variation ? "Raise a variation" : "Record a daywork"}</h1>
    <p className={styles.warning}>{variation ? "Variations" : "Dayworks"} cannot be recorded in TileSPEC yet. Write it in today&apos;s handover for the office.</p>
    <Link className={styles.secondaryButton} href={`${base}/finish`}>Write today&apos;s handover</Link>
  </>;
  const [locations, items] = await Promise.all([locationsFor(supabase, id), rateItemsFor(supabase, id)]);
  const today = londonDate();
  return <>
    <h1 className={styles.title}>{variation ? "Raise a variation" : "Record a daywork"}</h1>
    <p className={styles.description}>{variation
      ? "A change to the agreed work. Send it to the office before starting: do not start until TileSPEC tells you it is approved."
      : "Extra work paid by the hour. Recording it is not permission to proceed or an agreement to pay: the office approves it, and the client's authorisation is recorded separately."}</p>
    <section className={styles.panel} aria-label={`New ${word}`}>
      <DailyForm action={createDayworkAction} label={`Save ${word}`}>
        <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="send_key" value={randomUUID()} />
        {variation && <input type="hidden" name="kind" value="variation" />}
        <label className={styles.field}>{variation ? "What needs to change?" : "What extra work was done?"}<textarea name="description" required minLength={5} maxLength={2000} rows={3} /></label>
        <LocationPicker name="work_area_id" label="Where (optional)" locations={locations} allowTopLevel emptyLabel="Not one location" />
        <label className={styles.field}>Who asked for it?<input name="instructed_by_name" required maxLength={120} autoComplete="off" /></label>
        <label className={styles.field}>Their company (optional)<input name="instructed_by_company" maxLength={120} /></label>
        <label className={styles.field}>When did they ask?<input type="date" name="instructed_on" defaultValue={today} max={today} /></label>
        {variation ? <details className={styles.details}><summary>People, plant and materials (if already known)</summary><DayworkLines today={today} items={items} /></details>
          : <DayworkLines today={today} items={items} />}
        <label className={styles.checkboxRow}><input type="checkbox" name="send_now" defaultChecked />Send to the office now</label>
        <p className={styles.small}>Add photos{variation ? "" : " and the client's signature"} on the next screen. They are optional: it is saved without them.</p>
      </DailyForm>
    </section>
    <Link className={styles.secondaryButton} href={back}>Back to {variation ? "variations" : "dayworks"}</Link>
  </>;
}
