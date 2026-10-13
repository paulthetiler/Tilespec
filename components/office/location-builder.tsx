"use client";

import { useState } from "react";
import { buildLocationItems } from "@/lib/operations/locations";
import type { Location } from "@/lib/operations/types";
import { LocationPicker } from "./location-picker";
import styles from "@/app/admin/admin.module.css";

// Builds a block of flats, a ward of rooms or a short list of areas in one
// step. The preview uses the same function the server runs before saving.
export function LocationBuilder({ locations }: { locations: Location[] }) {
  const [mode, setMode] = useState<"series" | "names">("series");
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [names, setNames] = useState("");
  const [rooms, setRooms] = useState("");
  let preview: { text: string; error: boolean } | null = null;
  const started = mode === "series" ? Boolean(from || to) : Boolean(names.trim());
  if (started) {
    try {
      const { items, total } = buildLocationItems({ mode, label, from, to, names, rooms });
      const first = items[0].name, last = items[items.length - 1].name;
      const childNames = items[0].children?.map(child => child.name) ?? [];
      const inside = childNames.length > 1 ? `${childNames.slice(0, -1).join(", ")} and ${childNames[childNames.length - 1]}` : childNames[0];
      preview = { error: false, text: `Creates ${items.length === 1 ? first : `${items.length} locations (${first} to ${last})`}${inside ? `, each with ${inside}` : ""}. ${total.toLocaleString("en-GB")} ${total === 1 ? "location" : "locations"} in total.` };
    } catch (error) {
      preview = { error: true, text: error instanceof Error ? error.message : "Check the details." };
    }
  }
  return (
    <div className={styles.form}>
      <LocationPicker name="parent_id" label="Add inside" locations={locations} allowTopLevel hint="For example, choose Level 5 to add flats on that level." />
      <fieldset className={styles.toggle}>
        <legend className={styles.small}>How do you want to add them?</legend>
        <label><input type="radio" name="mode" value="series" checked={mode === "series"} onChange={() => setMode("series")} />Numbered, e.g. Flat 51 to 58</label>
        <label><input type="radio" name="mode" value="names" checked={mode === "names"} onChange={() => setMode("names")} />A list of names</label>
      </fieldset>
      {mode === "series" ? <div className={styles.formGrid}>
        <label className={`${styles.field} ${styles.wide}`}>What are they called?<input name="label" value={label} onChange={event => setLabel(event.target.value)} maxLength={60} placeholder="Flat, Level, Room, Ward or Bay" /></label>
        <label className={styles.field}>First number<input name="from" value={from} onChange={event => setFrom(event.target.value)} inputMode="numeric" maxLength={6} placeholder="51" /></label>
        <label className={styles.field}>Last number<input name="to" value={to} onChange={event => setTo(event.target.value)} inputMode="numeric" maxLength={6} placeholder="58" /></label>
      </div> : <div className={styles.formGrid}>
        <label className={`${styles.field} ${styles.wide}`}>Names, one per line<textarea name="names" value={names} onChange={event => setNames(event.target.value)} rows={5} placeholder={"Sales floor\nCustomer entrance\nStaff toilets"} /></label>
        <label className={`${styles.field} ${styles.wide}`}>Type of location (optional)<input name="label" value={label} onChange={event => setLabel(event.target.value)} maxLength={60} placeholder="Area" /></label>
      </div>}
      <label className={styles.field}>Inside each one, also create (optional)
        <textarea name="rooms" value={rooms} onChange={event => setRooms(event.target.value)} rows={3} placeholder={"Bathroom\nKitchen"} />
        <small>One per line. Leave empty if you only need the locations above.</small>
      </label>
      {preview && <p className={`${styles.preview}${preview.error ? ` ${styles.previewError}` : ""}`} role="status">{preview.text}</p>}
    </div>
  );
}
