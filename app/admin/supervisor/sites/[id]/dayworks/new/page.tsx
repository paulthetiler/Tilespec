import { randomUUID } from "node:crypto";
import Link from "next/link";
import { createDayworkAction } from "@/app/admin/supervisor/daywork-actions";
import { DailyForm } from "@/components/site/daily-form";
import { DayworkLines } from "@/components/site/daywork-lines";
import { LocationPicker } from "@/components/office/location-picker";
import { locationsFor } from "@/lib/operations/data";
import { dayworksAvailable, rateItemsFor } from "@/lib/operations/daywork-data";
import { londonDate } from "@/lib/operations/planning";
import { requireSite } from "../../../../site-access";
import styles from "@/app/admin/admin.module.css";

export const dynamic = "force-dynamic";

// One short form on a phone: what, where, who asked, the people, plant and materials. Photos
// and the client's signature are added on the daywork itself, so neither can block saving it.
export default async function NewDaywork({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contract } = await requireSite(id);
  if (!contract) return null;
  const base = `/admin/supervisor/sites/${id}`;
  if (!await dayworksAvailable(supabase)) return <>
    <h1 className={styles.title}>Record a daywork</h1>
    <p className={styles.warning}>Dayworks cannot be recorded in TileSPEC yet. Write it in today&apos;s handover for the office.</p>
    <Link className={styles.secondaryButton} href={`${base}/finish`}>Write today&apos;s handover</Link>
  </>;
  const [locations, items] = await Promise.all([locationsFor(supabase, id), rateItemsFor(supabase, id)]);
  const today = londonDate();
  return <>
    <h1 className={styles.title}>Record a daywork</h1>
    <p className={styles.description}>Extra work paid by the hour. Recording it is not permission to proceed or an agreement to pay: the office approves it, and the client&apos;s authorisation is recorded separately.</p>
    <section className={styles.panel} aria-label="New daywork">
      <DailyForm action={createDayworkAction} label="Save daywork">
        <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="send_key" value={randomUUID()} />
        <label className={styles.field}>What extra work was done?<textarea name="description" required minLength={5} maxLength={2000} rows={3} /></label>
        <LocationPicker name="work_area_id" label="Where (optional)" locations={locations} allowTopLevel emptyLabel="Not one location" />
        <label className={styles.field}>Who asked for it?<input name="instructed_by_name" required maxLength={120} autoComplete="off" /></label>
        <label className={styles.field}>Their company (optional)<input name="instructed_by_company" maxLength={120} /></label>
        <label className={styles.field}>When did they ask?<input type="date" name="instructed_on" defaultValue={today} max={today} /></label>
        <DayworkLines today={today} items={items} />
        <label className={styles.checkboxRow}><input type="checkbox" name="send_now" defaultChecked />Send to the office now</label>
        <p className={styles.small}>Add photos and the client&apos;s signature on the next screen. They are optional: the daywork is saved without them.</p>
      </DailyForm>
    </section>
    <Link className={styles.secondaryButton} href={`${base}/commercial?kind=dayworks`}>Back to dayworks</Link>
  </>;
}
