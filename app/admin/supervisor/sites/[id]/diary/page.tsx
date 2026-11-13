import Link from "next/link";
import { randomUUID } from "node:crypto";
import { checkDatabase, locationsFor } from "@/lib/operations/data";
import { indexLocations, locationPath, orderLocations } from "@/lib/operations/locations";
import { londonDate, dayLabel } from "@/lib/operations/planning";
import { addDays } from "@/lib/operations/next-actions/lookups";
import { materialUnits } from "@/lib/operations/command-centre";
import { DailyForm } from "@/components/site/daily-form";
import { SitePhotoUploader } from "@/components/site/site-photos";
import { recordProgressAction, requestMaterialAction, updateMaterialAction, voidProgressAction } from "@/app/admin/command-centre-actions";
import { requireSite } from "../../../site-access";
import { SiteDaySteps } from "@/components/site/day-steps";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * The site diary: what was done today (quantities against the job's packages), photographs and the
 * materials needed. The office sees it the next morning in Yesterday on site and in the job's history.
 */
export default async function SiteDiary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, member, contract } = await requireSite(id);
  if (!contract) return null;
  const today = londonDate(), since = addDays(today, -6);
  const [locations, packages, teams, progress, photos, materials] = await Promise.all([
    locationsFor(supabase, id),
    supabase.from("work_packages").select("id,name,unit,quantity,work_area_id").eq("contract_id", id).order("name"),
    supabase.from("teams").select("id,name").eq("active", true).order("name"),
    supabase.from("site_progress_entries").select("*").eq("contract_id", id).gte("work_date", since).order("recorded_at", { ascending: false }),
    supabase.from("site_photos").select("id,object_path,caption,work_date,actor_name,location_path").eq("contract_id", id).not("uploaded_at", "is", null).gte("work_date", since).order("created_at", { ascending: false }).limit(12),
    supabase.from("material_requests").select("*").eq("contract_id", id).or(`status.in.(requested,ordered),updated_at.gte.${since}`).order("needed_by", { nullsFirst: false }),
  ]);
  if (progress.error && ["42P01", "PGRST205"].includes(progress.error.code ?? "")) {
    return <><h1 className={styles.title}>Site diary</h1><p className={styles.warning}>The site diary arrives with the latest database update, which is not applied yet.</p></>;
  }
  [packages, teams, progress, photos, materials].forEach(r => checkDatabase(r.error));
  const index = indexLocations(locations);
  const places = orderLocations(locations).filter(l => !l.archived_at).map(l => ({ id: l.id, label: locationPath(index, l.id) }));
  const photoRows = (photos.data ?? []) as Row[];
  const signed = photoRows.length ? await supabase.storage.from("supervisor-evidence").createSignedUrls(photoRows.map(p => String(p.object_path)), 600) : { data: [] };
  const done = new Map<string, number>();
  for (const e of (progress.data ?? []) as Row[]) if (!e.voided_at && e.work_package_id) done.set(String(e.work_package_id), (done.get(String(e.work_package_id)) ?? 0) + Number(e.quantity ?? 0));
  const siteBase = `/admin/supervisor/sites/${id}`;
  return <>
    {member.role === "supervisor" && <SiteDaySteps supabase={supabase} contractId={id} userId={member.user_id} current="progress" />}
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>{contract.reference} · {contract.name}</p><h1 className={styles.title}>Site diary</h1>
      <p className={styles.description}>Record what was done, add photographs and ask for materials. The office sees it first thing tomorrow.</p></div>
      <Link className={styles.secondaryButton} href={siteBase}>Back to today</Link></div>

    <section className={styles.panel} aria-labelledby="progress-heading"><h2 id="progress-heading">Work done</h2>
      <DailyForm action={recordProgressAction} label="Save progress">
        <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} />
        <label className={styles.field}>What was done<input name="description" required maxLength={500} placeholder="For example, level 2 corridor floor tiled and grouted" /></label>
        <div className={styles.formGrid}>
          <label className={styles.field}>Against the package (optional)<select name="work_package_id" defaultValue=""><option value="">No package</option>
            {((packages.data ?? []) as Row[]).map(p => <option key={String(p.id)} value={String(p.id)}>{String(p.name)} ({String(p.quantity)} {String(p.unit)})</option>)}</select></label>
          <label className={styles.field}>Quantity done<input name="quantity" inputMode="decimal" pattern="\d+(\.\d{1,2})?" /></label>
          <label className={styles.field}>Unit (if no package)<select name="unit" defaultValue="m2"><option value="m2">m²</option><option value="lm">linear m</option><option value="m">m</option>
            <option value="item">items</option><option value="each">each</option><option value="room">rooms</option><option value="day">days</option></select></label>
          <label className={styles.field}>Where<select name="work_area_id" defaultValue=""><option value="">Whole site</option>{places.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className={styles.field}>Gang<select name="team_id" defaultValue=""><option value="">Not recorded</option>{((teams.data ?? []) as Row[]).map(t => <option key={String(t.id)} value={String(t.id)}>{String(t.name)}</option>)}</select></label>
          <label className={styles.field}>Day<input type="date" name="work_date" defaultValue={today} min={since} max={today} /></label>
        </div>
      </DailyForm>
      {((packages.data ?? []) as Row[]).length > 0 && <details className={styles.details}><summary>Progress against each package (last seven days)</summary>
        <ul className={styles.plainList}>{((packages.data ?? []) as Row[]).map(p => <li key={String(p.id)}>{String(p.name)}: {done.get(String(p.id)) ?? 0} of {String(p.quantity)} {String(p.unit)} this week</li>)}</ul>
      </details>}
      <ul className={styles.plainList}>{((progress.data ?? []) as Row[]).map(e => <li key={String(e.id)} data-progress={String(e.id)}>
        <strong>{dayLabel(String(e.work_date))}</strong> · {String(e.description)}{e.quantity !== null ? ` · ${String(e.quantity)} ${String(e.unit)}` : ""}{(e.location_path as string[])?.length ? ` · ${(e.location_path as string[]).join(" › ")}` : ""} · {String(e.recorded_by_name)}
        {e.voided_at ? <em> · entered in error: {String(e.void_reason)}</em> : e.recorded_by === member.user_id && <details className={styles.details}><summary>Entered in error?</summary>
          <DailyForm action={voidProgressAction} label="Mark as entered in error"><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="entry_id" value={String(e.id)} />
            <label className={styles.field}>Reason<input name="reason" required minLength={3} maxLength={500} /></label></DailyForm></details>}
      </li>)}</ul>
    </section>

    <section className={styles.panel} aria-labelledby="photos-heading"><h2 id="photos-heading">Photographs</h2>
      <SitePhotoUploader contractId={id} locations={places} />
      {photoRows.length > 0 && <div className={styles.rowActions}>{photoRows.map((p, i) => { const url = signed.data?.[i]?.signedUrl;
        return url ? <a key={String(p.id)} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={String(p.caption ?? `Site photograph, ${dayLabel(String(p.work_date))}`)} width={120} height={90} style={{ objectFit: "cover", borderRadius: 6 }} /></a> : null; })}</div>}
    </section>

    <section className={styles.panel} aria-labelledby="materials-heading"><h2 id="materials-heading">Materials</h2>
      <DailyForm action={requestMaterialAction} label="Ask the office for materials">
        <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} />
        <div className={styles.formGrid}>
          <label className={styles.field}>Item<input name="item" required maxLength={160} placeholder="For example, grey grout 5 kg" /></label>
          <label className={styles.field}>Quantity<input name="quantity" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" /></label>
          <label className={styles.field}>Unit<select name="unit" defaultValue="bag">{materialUnits.map(u => <option key={u} value={u}>{u}</option>)}</select></label>
          <label className={styles.field}>Needed by<input type="date" name="needed_by" min={today} /></label>
          <label className={styles.field}>Where<select name="work_area_id" defaultValue=""><option value="">Whole site</option>{places.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        </div>
        <label className={styles.field}>Note<input name="note" maxLength={1000} /></label>
      </DailyForm>
      <ul className={styles.plainList}>{((materials.data ?? []) as Row[]).map(m => <li key={String(m.id)}>
        <strong>{String(m.quantity)} {String(m.unit)} {String(m.item)}</strong> · {m.status === "requested" ? "asked for, not ordered yet" : m.status === "ordered" ? `ordered${m.expected_on ? `, expected ${dayLabel(String(m.expected_on))}` : ""}` : String(m.status)}
        {m.status === "ordered" && <DailyForm action={updateMaterialAction} label="It has arrived"><input type="hidden" name="request_id" value={String(m.id)} />
          <input type="hidden" name="version" value={String(m.version)} /><input type="hidden" name="status" value="delivered" /></DailyForm>}
      </li>)}</ul>
    </section>
  </>;
}
