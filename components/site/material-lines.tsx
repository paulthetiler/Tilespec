"use client";
import { useState } from "react";
import { materialUnitLabels, materialUnits, type MaterialUnit } from "@/lib/operations/job-costs";
import styles from "@/app/admin/admin.module.css";

type Row = { key: string; item: string; quantity: string; unit: MaterialUnit; work_area_id: string; note: string };
const blank = (): Row => ({ key: crypto.randomUUID(), item: "", quantity: "", unit: "bag", work_area_id: "", note: "" });

/** Materials used, sent with the form as one list: what, how much, and where. Never a price. */
export function MaterialLines({ locations }: { locations: { id: string; label: string }[] }) {
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const patch = (key: string, change: Partial<Row>) => setRows(current => current.map(row => (row.key === key ? { ...row, ...change } : row)));
  const value = JSON.stringify(rows.filter(row => row.item.trim()).map(row => ({ item: row.item.trim(), quantity: row.quantity, unit: row.unit,
    ...(row.work_area_id ? { work_area_id: row.work_area_id } : {}), ...(row.note.trim() ? { note: row.note.trim() } : {}) })));
  return <div className={styles.cardList}>
    <input type="hidden" name="materials" value={value} />
    {rows.map((row, index) => <div key={row.key} className={styles.card} data-material-line="">
      <label className={styles.field}>Material<input value={row.item} maxLength={120} aria-label={`Material ${index + 1}`} placeholder="e.g. Flexible adhesive"
        onChange={event => patch(row.key, { item: event.target.value })} /></label>
      <label className={styles.field}>How much<input inputMode="decimal" value={row.quantity} aria-label={`Material ${index + 1}: how much`}
        onChange={event => patch(row.key, { quantity: event.target.value })} /></label>
      <label className={styles.field}>Unit<select value={row.unit} aria-label={`Material ${index + 1}: unit`} onChange={event => patch(row.key, { unit: event.target.value as MaterialUnit })}>
        {materialUnits.map(unit => <option key={unit} value={unit}>{materialUnitLabels[unit]}</option>)}</select></label>
      {locations.length > 0 && <label className={styles.field}>Where (optional)<select value={row.work_area_id} aria-label={`Material ${index + 1}: where`}
        onChange={event => patch(row.key, { work_area_id: event.target.value })}><option value="">Not one location</option>
        {locations.map(location => <option key={location.id} value={location.id}>{location.label}</option>)}</select></label>}
      <label className={styles.field}>Note (optional)<input value={row.note} maxLength={500} aria-label={`Material ${index + 1}: note`}
        onChange={event => patch(row.key, { note: event.target.value })} /></label>
      {rows.length > 1 && <button type="button" className={styles.secondaryButton} onClick={() => setRows(current => current.filter(other => other.key !== row.key))}>Remove</button>}
    </div>)}
    <button type="button" className={styles.secondaryButton} onClick={() => setRows(current => [...current, blank()])}>Add another material</button>
  </div>;
}
