import Link from "next/link";
import { indexLocations, locationPath, orderLocations, subtreeIds } from "@/lib/operations/locations";
import type { ActionState, Location } from "@/lib/operations/types";
import { OperationsForm } from "@/components/operations/operations-form";
import { LocationPicker } from "./location-picker";
import styles from "@/app/admin/admin.module.css";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

// The whole site as an indented, collapsible list. The top two levels start
// open; deeper levels (rooms in each flat) open on tap.
export function LocationTree({ locations, editHref, canEdit }: { locations: Location[]; editHref: (id: string) => string; canEdit: boolean }) {
  const ordered = orderLocations(locations);
  const index = indexLocations(locations);
  const children = new Map<string | null, Location[]>();
  for (const location of ordered) {
    const parent = location.parent_id && index.has(location.parent_id) ? location.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), location]);
  }
  const within = new Map<string, number>();
  for (const location of ordered) for (const ancestor of location.path_ids.slice(0, -1)) within.set(ancestor, (within.get(ancestor) ?? 0) + 1);
  const row = (location: Location, hasChildren: boolean) => <div className={styles.treeRow}>
    <span>
      {hasChildren ? <span className={styles.treeToggle} aria-hidden="true" /> : <span className={styles.treeLeaf} aria-hidden="true" />}
      <strong>{location.name}</strong>
      {location.location_type && <span className={styles.badge}>{location.location_type}</span>}
      {location.code && <span className={styles.small}>Ref {location.code}</span>}
      {hasChildren && <span className={styles.small}>{within.get(location.id) ?? 0} inside</span>}
      {location.archived_at && <span className={styles.warningBadge}>Archived</span>}
    </span>
    {canEdit && !location.archived_at && <Link className={styles.secondaryButton} href={editHref(location.id)} aria-label={`Edit ${locationPath(index, location.id)}`}>Edit</Link>}
  </div>;
  const branch = (parent: string | null, depth: number): React.ReactNode => {
    const nodes = children.get(parent) ?? [];
    if (nodes.length === 0) return null;
    return <ul className={depth === 0 ? styles.tree : undefined}>{nodes.map(location => {
      const hasChildren = (children.get(location.id) ?? []).length > 0;
      return <li key={location.id}>{hasChildren
        ? <details open={depth < 1}><summary>{row(location, true)}</summary>{branch(location.id, depth + 1)}</details>
        : row(location, false)}</li>;
    })}</ul>;
  };
  return <>{branch(null, 0)}</>;
}

export function LocationEditor({ location, locations, contractId, updateAction, archiveAction, closeHref }: {
  location: Location; locations: Location[]; contractId: string; updateAction: Action; archiveAction: Action; closeHref: string;
}) {
  const index = indexLocations(locations);
  const inside = [...subtreeIds(locations, location.id)];
  return (
    <section className={styles.panel} aria-labelledby="edit-location-heading">
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>Edit location</p><h2 id="edit-location-heading">{locationPath(index, location.id)}</h2></div>
        <Link className={styles.secondaryButton} href={closeHref}>Close</Link>
      </div>
      <OperationsForm action={updateAction} submitLabel="Save location">
        <input type="hidden" name="contract_id" value={contractId} />
        <input type="hidden" name="location_id" value={location.id} />
        <input type="hidden" name="version" value={location.version} />
        <div className={styles.formGrid}>
          <label className={styles.field}>Name *<input name="name" defaultValue={location.name} required maxLength={160} /></label>
          <label className={styles.field}>Type<input name="location_type" defaultValue={location.location_type} maxLength={60} placeholder="Flat, Room, Ward" /></label>
          <label className={styles.field}>Reference or code<input name="code" defaultValue={location.code} maxLength={40} placeholder="Drawing or door number" /></label>
          <label className={styles.field}>Notes for the team<input name="description" defaultValue={location.location} maxLength={500} placeholder="Access, drawing reference" /></label>
          <label className={styles.field}>Substrate notes<textarea name="substrate_notes" defaultValue={location.substrate_notes} rows={2} maxLength={4000} /></label>
          <label className={styles.field}>Installation system notes<textarea name="system_notes" defaultValue={location.system_notes} rows={2} maxLength={4000} /></label>
          <div className={styles.wide}>
            <LocationPicker name="parent_id" label="Inside" locations={locations} defaultValue={location.parent_id} allowTopLevel exclude={inside}
              hint="Moving keeps the same records; everything inside moves with it." />
          </div>
        </div>
      </OperationsForm>
      <details className={styles.details}>
        <summary>Archive this location{inside.length > 1 ? ` and the ${inside.length - 1} inside it` : ""}</summary>
        <p className={styles.small}>Archived locations disappear from planning but every record made against them is kept. Locations with open or future work cannot be archived.</p>
        <OperationsForm action={archiveAction} submitLabel="Archive location">
          <input type="hidden" name="contract_id" value={contractId} />
          <input type="hidden" name="location_id" value={location.id} />
          <input type="hidden" name="version" value={location.version} />
          <label className={styles.field}>Reason *<input name="reason" required minLength={5} maxLength={2000} placeholder="For example, omitted from scope by variation" /></label>
        </OperationsForm>
      </details>
    </section>
  );
}
