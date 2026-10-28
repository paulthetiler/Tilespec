"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoChoices, uploadPhoto, usePhotos } from "@/components/snags/photo-upload";
import styles from "@/app/admin/admin.module.css";

/** Optional photographs of the work or the signed sheet. Each is verified in private storage; the daywork never waits for one. */
export function DayworkPhotoUploader({ daywork }: { daywork: string }) {
  const photos = usePhotos(), router = useRouter();
  const [purpose, setPurpose] = useState<"work" | "signed_sheet">("work"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div aria-label="Add photographs">
    <label className={styles.field}>What do they show?<select value={purpose} onChange={event => setPurpose(event.target.value as "work" | "signed_sheet")} disabled={busy}>
      <option value="work">The work</option><option value="signed_sheet">The signed daywork sheet</option></select></label>
    <PhotoChoices entries={photos.entries} add={photos.add} remove={photos.remove} disabled={busy} />
    <button type="button" className={styles.button} disabled={busy || !photos.entries.some(entry => !entry.verifiedId)} onClick={async () => {
      setBusy(true); setError("");
      try {
        if (photos.entries.length > 12) throw new Error("Upload up to 12 photographs at a time.");
        for (const entry of photos.entries.filter(item => !item.verifiedId)) {
          try { const id = await uploadPhoto(daywork, purpose, entry, percent => photos.patch(entry.key, { percent }), "dayworks"); photos.patch(entry.key, { verifiedId: id, error: undefined }); }
          catch (failure) { photos.patch(entry.key, { error: failure instanceof Error ? failure.message : "Upload failed." }); throw failure; }
        }
        router.refresh();
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not confirm photographs were saved."); }
      finally { setBusy(false); }
    }}>{busy ? "Uploading and verifying…" : "Upload photographs"}</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
