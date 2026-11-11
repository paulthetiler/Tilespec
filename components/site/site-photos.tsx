"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoChoices, uploadPhoto, usePhotos } from "@/components/snags/photo-upload";
import styles from "@/app/admin/admin.module.css";

/** Today's site photographs: chosen on the phone, each verified in private storage before it counts. */
export function SitePhotoUploader({ contractId, locations }: { contractId: string; locations: { id: string; label: string }[] }) {
  const photos = usePhotos(), router = useRouter();
  const [caption, setCaption] = useState(""), [area, setArea] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(0);
  return <div aria-label="Add site photographs">
    <label className={styles.field}>Where (optional)<select value={area} onChange={event => setArea(event.target.value)} disabled={busy}>
      <option value="">Whole site</option>{locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
    <label className={styles.field}>Caption (optional)<input value={caption} onChange={event => setCaption(event.target.value)} maxLength={300} disabled={busy} placeholder="For example, level 2 corridor floor laid" /></label>
    <PhotoChoices entries={photos.entries} add={photos.add} remove={photos.remove} disabled={busy} />
    <button type="button" className={styles.button} disabled={busy || !photos.entries.some(entry => !entry.verifiedId)} onClick={async () => {
      setBusy(true); setError("");
      try {
        if (photos.entries.length > 12) throw new Error("Upload up to 12 photographs at a time.");
        for (const entry of photos.entries.filter(item => !item.verifiedId)) {
          try {
            const id = await uploadPhoto(contractId, "site", entry, percent => photos.patch(entry.key, { percent }), "sites", { caption, work_area_id: area });
            photos.patch(entry.key, { verifiedId: id, error: undefined }); setDone(count => count + 1);
          } catch (failure) { photos.patch(entry.key, { error: failure instanceof Error ? failure.message : "Upload failed." }); throw failure; }
        }
        router.refresh();
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not confirm photographs were saved."); }
      finally { setBusy(false); }
    }}>{busy ? "Uploading and verifying…" : "Upload photographs"}</button>
    {done > 0 && !busy && <p className={styles.success} role="status">{done} {done === 1 ? "photograph" : "photographs"} saved. The office sees them in tomorrow's Yesterday on site.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
