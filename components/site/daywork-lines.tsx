"use client";
import { useState } from "react";
import { dayworkUnits, unitLabels, type DayworkLine, type RateItem } from "@/lib/operations/dayworks";
import styles from "@/app/admin/admin.module.css";

type Row = { key: string; kind: "labour" | "plant" | "material"; label: string; role: "operative" | "supervisor"; work_date: string; quantity: string; unit: string };
const blank = (kind: Row["kind"], today: string): Row => ({ key: crypto.randomUUID(), kind, label: "", role: "operative", work_date: kind === "labour" ? today : "", quantity: "",
  unit: kind === "labour" ? "hour" : kind === "plant" ? "day" : "bag" });
const sections: { kind: Row["kind"]; title: string; add: string; name: string }[] = [
  { kind: "labour", title: "People and hours", add: "Add a person", name: "Name" },
  { kind: "plant", title: "Plant", add: "Add plant", name: "Item" },
  { kind: "material", title: "Materials", add: "Add materials", name: "Item" },
];

/**
 * People and hours, plant and materials, sent with the form as one list. Item names the job
 * already has rates for are offered as suggestions (names and units only, never prices).
 */
export function DayworkLines({ today, initial, items }: { today: string; initial?: DayworkLine[]; items: RateItem[] }) {
  const [rows, setRows] = useState<Row[]>(() => initial?.length
    ? initial.map(line => ({ key: line.id, kind: line.kind, label: line.label, role: line.role ?? "operative", work_date: line.work_date ?? "",
      quantity: String(line.quantity), unit: line.unit }))
    : [blank("labour", today)]);
  const patch = (key: string, change: Partial<Row>) => setRows(current => current.map(row => (row.key === key ? { ...row, ...change } : row)));
  const value = JSON.stringify(rows.filter(row => row.label.trim()).map(row => row.kind === "labour"
    ? { kind: row.kind, label: row.label.trim(), role: row.role, work_date: row.work_date, quantity: row.quantity }
    : { kind: row.kind, label: row.label.trim(), unit: row.unit, quantity: row.quantity, ...(row.work_date ? { work_date: row.work_date } : {}) }));
  return <div className={styles.cardList}>
    <input type="hidden" name="lines" value={value} />
    {sections.map(section => {
      const list = rows.filter(row => row.kind === section.kind);
      const suggestions = items.filter(item => item.category === section.kind);
      return <fieldset key={section.kind} className={styles.plainFieldset} aria-label={section.title}>
        <h3>{section.title}</h3>
        {suggestions.length > 0 && <datalist id={`daywork-${section.kind}-items`}>{suggestions.map(item => <option key={`${item.item}-${item.unit}`} value={item.item}>{unitLabels[item.unit]}</option>)}</datalist>}
        {list.map((row, index) => <div key={row.key} className={styles.card} data-line={section.kind}>
          <label className={styles.field}>{section.name}<input value={row.label} maxLength={120} list={suggestions.length ? `daywork-${section.kind}-items` : undefined}
            aria-label={`${section.title} ${index + 1}: ${section.name.toLowerCase()}`} onChange={event => patch(row.key, { label: event.target.value })} /></label>
          {row.kind === "labour" ? <>
            <label className={styles.field}>Role<select value={row.role} aria-label={`${section.title} ${index + 1}: role`} onChange={event => patch(row.key, { role: event.target.value as Row["role"] })}>
              <option value="operative">Operative</option><option value="supervisor">Supervisor</option></select></label>
            <label className={styles.field}>Day worked<input type="date" value={row.work_date} max={today} aria-label={`${section.title} ${index + 1}: day worked`} onChange={event => patch(row.key, { work_date: event.target.value })} /></label>
            <label className={styles.field}>Hours<input inputMode="decimal" value={row.quantity} aria-label={`${section.title} ${index + 1}: hours`} placeholder="e.g. 7.5" onChange={event => patch(row.key, { quantity: event.target.value })} /></label>
          </> : <>
            <label className={styles.field}>Quantity<input inputMode="decimal" value={row.quantity} aria-label={`${section.title} ${index + 1}: quantity`} onChange={event => patch(row.key, { quantity: event.target.value })} /></label>
            <label className={styles.field}>Unit<select value={row.unit} aria-label={`${section.title} ${index + 1}: unit`} onChange={event => patch(row.key, { unit: event.target.value })}>
              {dayworkUnits.filter(unit => unit !== "hour" || row.kind === "plant").map(unit => <option key={unit} value={unit}>{unitLabels[unit]}</option>)}</select></label>
          </>}
          <button type="button" className={styles.secondaryButton} onClick={() => setRows(current => current.filter(other => other.key !== row.key))}>Remove</button>
        </div>)}
        <button type="button" className={styles.secondaryButton} onClick={() => setRows(current => [...current, blank(section.kind, today)])}>{section.add}</button>
      </fieldset>;
    })}
  </div>;
}
