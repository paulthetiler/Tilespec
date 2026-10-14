import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, requireActor } from "@/lib/auth";
import { checkDatabase, locationsFor } from "@/lib/operations/data";
import { indexLocations, locationPath, searchLocations } from "@/lib/operations/locations";
import { LocationBuilder } from "@/components/office/location-builder";
import { LocationEditor, LocationTree } from "@/components/office/location-tree";
import { OperationsForm } from "@/components/operations/operations-form";
import { archiveLocationAction, createLocationsAction, updateLocationAction } from "@/app/admin/office-actions";
import styles from "../../../admin.module.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function LocationsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string | string[]; q?: string | string[]; archived?: string | string[] }>;
}) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { supabase, member } = await requireActor();
  const contract = await supabase.from("contracts").select("id,reference,name").eq("id", id).maybeSingle();
  checkDatabase(contract.error);
  if (!contract.data) notFound();
  const query = await searchParams;
  const locations = await locationsFor(supabase, id);
  const manage = canManageContracts(member);
  const showArchived = query.archived === "1";
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const editing = manage && typeof query.edit === "string" ? locations.find(location => location.id === query.edit && !location.archived_at) : undefined;
  const visible = showArchived ? locations : locations.filter(location => !location.archived_at);
  const active = locations.filter(location => !location.archived_at);
  const base = `/admin/contracts/${id}/locations`;
  const index = indexLocations(locations);
  const results = q ? searchLocations(index, q, { limit: 50, includeArchived: showArchived }) : [];
  const requestKey = randomUUID();
  return <>
    <div className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>{contract.data.reference}</p><h1 className={styles.title}>Locations</h1>
        <p className={styles.description}>The blocks, floors, flats and rooms on {contract.data.name}. Plans, inspections and snags are all recorded against these.</p></div>
      <div className={styles.inline}>
        <Link className={styles.secondaryButton} href={`/admin/contracts/${id}`}>Contract</Link>
        <Link className={styles.button} href={`/admin/contracts/${id}/plan`}>Plan work</Link>
      </div>
    </div>
    {editing && <LocationEditor location={editing} locations={locations} contractId={id} updateAction={updateLocationAction} archiveAction={archiveLocationAction} closeHref={base} />}
    {manage && <section className={styles.panel} aria-labelledby="add-locations-heading">
      <h2 id="add-locations-heading">Add locations</h2>
      <OperationsForm action={createLocationsAction} submitLabel="Create locations">
        <input type="hidden" name="contract_id" value={id} />
        <input type="hidden" name="request_key" value={requestKey} />
        <LocationBuilder key={requestKey} locations={active} />
      </OperationsForm>
    </section>}
    <section className={styles.panel} aria-labelledby="all-locations-heading">
      <div className={styles.panelHeader}>
        <div><h2 id="all-locations-heading">All locations</h2><p className={styles.muted}>{active.length.toLocaleString("en-GB")} in use{locations.length > active.length ? ` · ${locations.length - active.length} archived` : ""}</p></div>
        {locations.length > active.length && <Link className={styles.secondaryButton} href={showArchived ? base : `${base}?archived=1`}>{showArchived ? "Hide archived" : "Show archived"}</Link>}
      </div>
      <form method="get" className={styles.search}>
        <label className={styles.field}>Find a location<input type="search" name="q" defaultValue={q} maxLength={100} placeholder="For example, 52 bath" /></label>
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <button className={styles.secondaryButton} type="submit">Find</button>
        {q && <Link className={styles.secondaryButton} href={showArchived ? `${base}?archived=1` : base}>Clear</Link>}
      </form>
      {q && <ul className={styles.documentList} aria-label="Search results">{results.map(location => <li key={location.id} className={styles.documentRow}>
        <div><strong>{locationPath(index, location.id)}</strong>{location.archived_at && <> <span className={styles.warningBadge}>Archived</span></>}</div>
        {manage && !location.archived_at && <Link className={styles.secondaryButton} href={`${base}?edit=${location.id}`}>Edit</Link>}
      </li>)}{results.length === 0 && <li className={styles.small}>No location matches “{q}”.</li>}</ul>}
      {!q && (visible.length ? <LocationTree locations={visible} canEdit={manage} editHref={locationId => `${base}?edit=${locationId}`} />
        : <p className={styles.empty}>{manage ? "No locations yet. Use Add locations above: for example, add a block, then its floors, then the flats on each floor." : "No locations have been recorded for this contract yet."}</p>)}
    </section>
  </>;
}
