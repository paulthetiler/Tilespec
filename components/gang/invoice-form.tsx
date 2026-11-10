"use client";
import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import type { ActionState } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";
import css from "./gang.module.css";

export type GangJob = { contract_id: string; reference: string; name: string; team_id: string; team_name: string; areas: { id: string; name: string }[] };
type Line = { key: string; area: string; quantity: string; unit: string };
type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  jobs: GangJob[];
  initial?: { job?: string; lines?: { work_area_id: string; unit: string; claimed: number }[]; invoice_number?: string; replaces?: { id: string; reference: string } };
};
const MAX = 4 * 1024 * 1024;
const newLine = (): Line => ({ key: crypto.randomUUID(), area: "", quantity: "", unit: "m2" });

/** A large phone photo is made smaller (still easily readable) so it uploads quickly and fits the 4 MB limit. */
async function shrinkPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size <= 3.5 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  return file;
}

export function GangInvoiceForm({ action, jobs, initial }: Props) {
  const [state, formAction, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    try { return await action(previous, form); }
    catch (error) {
      // A redirect after a confirmed send is not an error.
      if (error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw error;
      return { error: "We could not confirm it was sent because the connection failed. Your entries are still here: try again. It will not be sent twice." };
    }
  }, {});
  const [requestKey] = useState(() => crypto.randomUUID());
  const [job, setJob] = useState(initial?.job ?? (jobs.length === 1 ? `${jobs[0].contract_id}:${jobs[0].team_id}` : ""));
  const [lines, setLines] = useState<Line[]>(() => initial?.lines?.length
    ? initial.lines.map(l => ({ key: crypto.randomUUID(), area: l.work_area_id, quantity: String(l.claimed), unit: l.unit }))
    : [newLine()]);
  const [file, setFile] = useState<File | null>(null);
  const [fileNote, setFileNote] = useState("");
  const [clientError, setClientError] = useState("");
  const [more, setMore] = useState(!!initial?.invoice_number);
  const formRef = useRef<HTMLFormElement>(null);
  const areas = useMemo(() => jobs.find(j => `${j.contract_id}:${j.team_id}` === job)?.areas ?? [], [job, jobs]);
  const patch = (key: string, change: Partial<Line>) => setLines(current => current.map(l => (l.key === key ? { ...l, ...change } : l)));

  return <form ref={formRef} className={styles.form} aria-busy={pending} onSubmit={event => {
    event.preventDefault();
    setClientError("");
    if (pending) return;
    if (!file) { setClientError("Add your invoice: a PDF or a photo of it."); return; }
    if (file.size > MAX) { setClientError("That file is larger than 4 MB. Send a PDF or take the photo again."); return; }
    const data = new FormData(event.currentTarget);
    data.delete("file_input"); // only the prepared (possibly smaller) copy is sent
    data.set("file", file);
    startTransition(() => formAction(data));
  }}>
    <fieldset disabled={pending} className={styles.fieldset}>
      <input type="hidden" name="request_key" value={requestKey} />
      {initial?.replaces && <input type="hidden" name="replaces_invoice_id" value={initial.replaces.id} />}
      {initial?.replaces && <p className={styles.warning}>This corrected invoice replaces {initial.replaces.reference}. The original is kept.</p>}

      <label className={styles.field}>1. Job
        <select name="job" required value={job} onChange={event => { setJob(event.target.value); setLines([newLine()]); }} disabled={!!initial?.replaces}>
          {jobs.length !== 1 && <option value="">Choose your job</option>}
          {jobs.map(j => <option key={`${j.contract_id}:${j.team_id}`} value={`${j.contract_id}:${j.team_id}`}>{j.name}{jobs.some(o => o.team_id !== j.team_id) ? ` — ${j.team_name}` : ""}</option>)}
        </select>
      </label>
      {initial?.replaces && <input type="hidden" name="job" value={job} />}

      <label className={styles.field}>2. Your invoice (PDF or photo)
        <input type="file" name="file_input" accept="application/pdf,image/jpeg,image/png" required onChange={async event => {
          const chosen = event.target.files?.[0] ?? null;
          setFileNote("");
          if (!chosen) { setFile(null); return; }
          try {
            const ready = await shrinkPhoto(chosen);
            setFile(ready);
            if (ready !== chosen) setFileNote(`Photo made smaller for upload (${(ready.size / 1024 / 1024).toFixed(1)} MB).`);
          } catch { setFile(chosen); }
        }} />
        {fileNote && <small>{fileNote}</small>}
      </label>

      <div>
        <p className={styles.field} style={{ marginBottom: 6 }}>3. What you are claiming</p>
        {lines.map((line, index) => <div className={css.lineRow} key={line.key}>
          <label className={styles.field}>Work area{lines.length > 1 ? ` ${index + 1}` : ""}
            <select name="line_area" value={line.area} onChange={event => patch(line.key, { area: event.target.value })} required={index === 0} disabled={!job}>
              <option value="">{job ? "Choose area" : "Choose the job first"}</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className={styles.field}>Quantity
            <input name="line_quantity" inputMode="decimal" autoComplete="off" placeholder="e.g. 55" value={line.quantity}
              onChange={event => patch(line.key, { quantity: event.target.value })} required={index === 0} />
          </label>
          <label className={styles.field}>Unit
            <select name="line_unit" value={line.unit} onChange={event => patch(line.key, { unit: event.target.value })}>
              <option value="m2">m²</option><option value="lm">linear m</option><option value="item">items</option>
            </select>
          </label>
        </div>)}
        {lines.length < 20 && <button type="button" className={styles.secondaryButton} onClick={() => setLines(current => [...current, newLine()])}>+ Add another area</button>}
      </div>

      {!more ? <button type="button" className={styles.linkButton} onClick={() => setMore(true)}>Add invoice number, total or a note (optional)</button>
        : <>
          <label className={styles.field}>Invoice number (optional)<input name="invoice_number" maxLength={60} defaultValue={initial?.invoice_number ?? ""} /></label>
          <label className={styles.field}>Invoice total £ (optional)<input name="invoice_total" inputMode="decimal" placeholder="As shown on your invoice" /></label>
          <label className={styles.field}>Note for the office (optional)<textarea name="note" rows={2} maxLength={2000} /></label>
        </>}

      <p className={styles.muted}>Sending your invoice asks the site supervisor to check the work. It is not a payment approval.</p>
      <div className={styles.actions}><button type="submit" className={css.bigAction}>{pending ? "Sending…" : "Send invoice"}</button></div>
    </fieldset>
    {!pending && (clientError || state.error) && <p className={styles.error} role="alert">{clientError || state.error}</p>}
    {!pending && state.success && <p className={styles.success} role="status">{state.success}</p>}
  </form>;
}

/** One photo at a time, each with a fresh request key so a retry never duplicates and a second photo is never mistaken for the first. */
export function ClaimPhotoForm({ action, invoiceId, label = "Add a photo" }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; invoiceId: string; label?: string }) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    try {
      const result = await action(previous, form);
      if (result.success) { setKey(crypto.randomUUID()); setFile(null); if (inputRef.current) inputRef.current.value = ""; }
      return result;
    } catch { return { error: "The connection failed. Try again; the photo will not be saved twice." }; }
  }, {});
  return <form className={styles.compactForm} onSubmit={event => {
    event.preventDefault();
    if (!file || pending) return;
    const data = new FormData(event.currentTarget);
    data.set("file", file);
    startTransition(() => formAction(data));
  }}>
    <input type="hidden" name="invoice_id" value={invoiceId} />
    <input type="hidden" name="request_key" value={key} />
    <label className={styles.field}>{label}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png" capture="environment" disabled={pending}
        onChange={async event => { const chosen = event.target.files?.[0] ?? null; setFile(chosen ? await shrinkPhoto(chosen).catch(() => chosen) : null); }} />
    </label>
    <button type="submit" className={styles.secondaryButton} disabled={!file || pending}>{pending ? "Saving…" : "Save photo"}</button>
    {!pending && state.error && <p className={styles.error} role="alert">{state.error}</p>}
    {!pending && state.success && <p className={styles.success} role="status">{state.success}</p>}
  </form>;
}

/** Finishing an interrupted upload needs the same file again. */
export function FinishUploadForm({ action, invoiceId }: { action: (state: ActionState, form: FormData) => Promise<ActionState>; invoiceId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, formAction, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    try { return await action(previous, form); } catch { return { error: "The connection failed. Try again." }; }
  }, {});
  return <form className={styles.compactForm} onSubmit={event => {
    event.preventDefault();
    if (!file || pending) return;
    const data = new FormData(event.currentTarget);
    data.set("file", file);
    startTransition(() => formAction(data));
  }}>
    <input type="hidden" name="invoice_id" value={invoiceId} />
    <label className={styles.field}>Choose the same invoice file again
      <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={pending}
        onChange={async event => { const chosen = event.target.files?.[0] ?? null; setFile(chosen ? await shrinkPhoto(chosen).catch(() => chosen) : null); }} />
    </label>
    <button type="submit" className={styles.button} disabled={!file || pending}>{pending ? "Sending…" : "Finish sending"}</button>
    {!pending && state.error && <p className={styles.error} role="alert">{state.error}</p>}
    {!pending && state.success && <p className={styles.success} role="status">{state.success}</p>}
  </form>;
}
