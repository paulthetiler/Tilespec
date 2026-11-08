"use client";

import { useActionState, useState } from "react";
import { shareDocumentAction, type ShareState } from "@/app/admin/accounts-actions";
import styles from "@/app/admin/admin.module.css";

// Makes a revocable link to one issued document, shows it once, and offers to copy or send it.
export function ShareDocument({ contractId, documentId, reference }: { contractId: string; documentId: string; reference: string }) {
  const [state, action, pending] = useActionState<ShareState, FormData>(shareDocumentAction, {});
  const [copied, setCopied] = useState(false);
  return <div>
    <form action={action} className={`${styles.form} ${styles.compactForm}`}>
      <input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="document_id" value={documentId} />
      <label className={styles.field}>Who is it for (optional)<input name="recipient" maxLength={200} /></label>
      <label className={styles.field}>Link works for<select name="days" defaultValue="30"><option value="7">7 days</option><option value="14">14 days</option>
        <option value="30">30 days</option><option value="90">90 days</option></select></label>
      <button type="submit" className={styles.secondaryButton} disabled={pending}>{pending ? "Making link…" : "Make a link"}</button>
    </form>
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    {state.link && <div className={styles.success} role="status">
      <p>{state.success}</p>
      <input readOnly value={state.link} aria-label={`Link to ${reference}`} onFocus={event => event.currentTarget.select()} />
      <div className={styles.inline}>
        <button type="button" className={styles.secondaryButton} onClick={async () => { await navigator.clipboard?.writeText(state.link!); setCopied(true); }}>
          {copied ? "Copied" : "Copy link"}</button>
        {typeof navigator !== "undefined" && "share" in navigator && <button type="button" className={styles.secondaryButton}
          onClick={() => navigator.share({ title: reference, url: state.link }).catch(() => undefined)}>Send…</button>}
      </div>
    </div>}
  </div>;
}
