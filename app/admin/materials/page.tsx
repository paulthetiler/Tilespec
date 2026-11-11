import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { canManageContracts, requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { addDays } from "@/lib/operations/next-actions/lookups";
import { DailyForm } from "@/components/site/daily-form";
import { requestMaterialAction, updateMaterialAction } from "@/app/admin/command-centre-actions";
import { materialUnits } from "@/lib/operations/command-centre";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const day = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "—";
const statusLabel: Record<string, string> = { requested: "Requested, not ordered", ordered: "Ordered", delivered: "Delivered", cancelled: "Cancelled" };

/** Materials requirements and orders across every job: what site needs, what is ordered and what has arrived. */
export default async function MaterialsPage() {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) notFound();
  const today = londonDate();
  const [contracts, requests] = await Promise.all([
    supabase.from("contracts").select("id,reference,name").order("reference"),
    supabase.from("material_requests").select("*").or(`status.in.(requested,ordered),updated_at.gte.${addDays(today, -30)}`).order("needed_by", { nullsFirst: false }).order("requested_at"),
  ]);
  checkDatabase(contracts.error);
  const unavailable = !!requests.error && ["42P01", "PGRST205"].includes(requests.error.code ?? "");
  if (!unavailable) checkDatabase(requests.error);
  const jobs = new Map(((contracts.data ?? []) as Row[]).map(c => [String(c.id), `${c.reference} · ${c.name}`]));
  const rows = (requests.data ?? []) as Row[];
  const groups = (["requested", "ordered", "delivered", "cancelled"] as const).map(status => ({ status, rows: rows.filter(r => r.status === status) }));
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Operations</p><h1 className={styles.title}>Materials</h1>
      <p className={styles.description}>What each site needs, what has been ordered and what has arrived. Supervisors request from their site diary; the office orders here.</p></div></div>
    {unavailable && <p className={styles.warning}>The materials tracker arrives with the latest database update, which is not applied yet.</p>}
    {!unavailable && <>
      {groups.map(group => group.rows.length > 0 && <section key={group.status} className={styles.panel} aria-labelledby={`materials-${group.status}`}>
        <h2 id={`materials-${group.status}`}>{statusLabel[group.status]} ({group.rows.length})</h2>
        <div className={styles.cardList}>{group.rows.map(r => {
          const late = r.status === "requested" && r.needed_by && String(r.needed_by) <= addDays(today, 2);
          return <article key={String(r.id)} id={`material-${r.id}`} className={styles.card} data-material-status={String(r.status)}>
            <p className={styles.eyebrow}>{jobs.get(String(r.contract_id))}{(r.location_path as string[])?.length ? ` · ${(r.location_path as string[]).join(" › ")}` : ""}</p>
            <h3>{String(r.quantity)} {String(r.unit)} · {String(r.item)}</h3>
            <p className={late ? styles.error : styles.small}>Needed {day(r.needed_by as string | null)} · requested by {String(r.requested_by_name)}{r.note ? ` · ${String(r.note)}` : ""}</p>
            {r.status === "ordered" && <p className={styles.small}>Ordered {day(r.ordered_on as string)} from {String(r.supplier ?? "supplier not recorded")}{r.order_reference ? `, order ${String(r.order_reference)}` : ""}{r.expected_on ? ` · expected ${day(r.expected_on as string)}` : ""}</p>}
            {r.status === "delivered" && <p className={styles.small}>Delivered {day(r.delivered_on as string)}{r.supplier ? ` by ${String(r.supplier)}` : ""}</p>}
            {(r.status === "requested" || r.status === "ordered") && <details className={styles.details}><summary>{r.status === "requested" ? "Record the order" : "Update or record delivery"}</summary>
              <DailyForm action={updateMaterialAction} label="Save">
                <input type="hidden" name="request_id" value={String(r.id)} /><input type="hidden" name="version" value={String(r.version)} />
                <label className={styles.field}>Status<select name="status" defaultValue={r.status === "requested" ? "ordered" : "delivered"}>
                  <option value="ordered">Ordered</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option>
                </select></label>
                <div className={styles.formGrid}>
                  <label className={styles.field}>Supplier<input name="supplier" maxLength={160} defaultValue={String(r.supplier ?? "")} /></label>
                  <label className={styles.field}>Order reference<input name="order_reference" maxLength={120} defaultValue={String(r.order_reference ?? "")} /></label>
                  <label className={styles.field}>Expected delivery<input type="date" name="expected_on" defaultValue={String(r.expected_on ?? "")} /></label>
                  <label className={styles.field}>Delivered on<input type="date" name="delivered_on" /></label>
                </div>
                <label className={styles.field}>Note (a reason is needed to cancel)<input name="note" maxLength={1000} /></label>
              </DailyForm>
            </details>}
          </article>;
        })}</div>
      </section>)}
      {!rows.length && <section className={styles.empty}><h2>No materials requested or on order</h2><p>Requests from site and the office appear here.</p></section>}
      <section className={styles.panel} id="new" aria-labelledby="new-material">
        <h2 id="new-material">Add a materials requirement</h2>
        <DailyForm action={requestMaterialAction} label="Add requirement">
          <input type="hidden" name="request_key" value={randomUUID()} />
          <label className={styles.field}>Job<select name="contract_id" required defaultValue="">{[<option key="" value="" disabled>Choose a job</option>, ...[...jobs].map(([id, label]) => <option key={id} value={id}>{label}</option>)]}</select></label>
          <div className={styles.formGrid}>
            <label className={styles.field}>Item<input name="item" required maxLength={160} placeholder="For example, flexible S1 adhesive" /></label>
            <label className={styles.field}>Quantity<input name="quantity" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" /></label>
            <label className={styles.field}>Unit<select name="unit" defaultValue="bag">{materialUnits.map(u => <option key={u} value={u}>{u}</option>)}</select></label>
            <label className={styles.field}>Needed by<input type="date" name="needed_by" /></label>
          </div>
          <label className={styles.field}>Note<input name="note" maxLength={1000} /></label>
        </DailyForm>
      </section>
    </>}
    <p className={styles.small}><Link href="/admin">Back to the command centre</Link></p>
  </>;
}
