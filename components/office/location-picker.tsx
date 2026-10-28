"use client";

import { useId, useMemo, useState } from "react";
import { indexLocations, locationPath, orderLocations, searchLocations } from "@/lib/operations/locations";
import type { Location } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";

type Props = {
  name: string;
  label: string;
  locations: Location[];
  defaultValue?: string | null;
  allowTopLevel?: boolean;
  exclude?: string[];
  hint?: string;
  onChange?: (id: string | null) => void;
  /** What "no location" means here, when it is allowed. */
  emptyLabel?: string;
};

// Type a few characters ("52 bath") and tap the match. Writes the chosen ID
// into a hidden field so it submits with the surrounding form.
export function LocationPicker({ name, label, locations, defaultValue = null, allowTopLevel = false, exclude, hint, onChange, emptyLabel = "Top level (not inside another location)" }: Props) {
  const usable = useMemo(() => { const skip = new Set(exclude); return locations.filter(location => !location.archived_at && !skip.has(location.id)); }, [locations, exclude]);
  const index = useMemo(() => indexLocations(locations), [locations]);
  const [selected, setSelected] = useState<string | null>(defaultValue);
  const [choosing, setChoosing] = useState(defaultValue === null && !allowTopLevel);
  const [query, setQuery] = useState("");
  const choose = (id: string | null) => { setSelected(id); setChoosing(false); setQuery(""); onChange?.(id); };
  const matches = query.trim()
    ? searchLocations(indexLocations(usable), query, { limit: 12 })
    : orderLocations(usable).filter(location => !location.parent_id || !index.has(location.parent_id)).slice(0, 12);
  const selectedLabel = selected ? locationPath(index, selected) : emptyLabel;
  const inputId = `${useId()}-search`;
  return (
    <div className={styles.picker}>
      <input type="hidden" name={name} value={selected ?? ""} />
      <span className={styles.field}><label htmlFor={inputId}>{label}</label></span>
      {!choosing && <p className={styles.pickerSelected}>
        <span><strong>{selectedLabel}</strong></span>
        <button type="button" className={styles.linkButton} onClick={() => setChoosing(true)}>Change</button>
      </p>}
      {choosing && <>
        <input id={inputId} type="search" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off"
          placeholder={usable.length > 12 ? "Type a name or number, e.g. 52 bath" : "Type to filter"} aria-describedby={hint ? `${inputId}-hint` : undefined} />
        {hint && <small id={`${inputId}-hint`} className={styles.small}>{hint}</small>}
        <ul className={styles.pickerList} aria-label={`${label} choices`}>
          {allowTopLevel && !query.trim() && <li><button type="button" className={styles.pickerOption} onClick={() => choose(null)}>{emptyLabel}</button></li>}
          {matches.map(location => <li key={location.id}>
            <button type="button" className={styles.pickerOption} onClick={() => choose(location.id)}>{locationPath(index, location.id)}</button>
          </li>)}
        </ul>
        {matches.length === 0 && <p className={styles.small}>{usable.length === 0 ? "No locations yet." : "No match. Try fewer words, or a number such as 52."}</p>}
        {!query.trim() && usable.length > matches.length && <p className={styles.small}>Showing top-level locations. Type to search all {usable.length.toLocaleString("en-GB")}.</p>}
        {(selected !== null || allowTopLevel) && <button type="button" className={styles.linkButton} onClick={() => setChoosing(false)}>Keep current choice</button>}
      </>}
    </div>
  );
}
