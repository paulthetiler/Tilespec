"use client";
import { startTransition, useActionState, useState } from "react";
import type { LinkState } from "@/app/admin/subcontractors/actions";
import styles from "@/app/admin/admin.module.css";

/** Issues a personal portal link and shows it once, with ways to send it. It cannot be shown again. */
export function IssueLink({ action, teamId, defaultName, email, phone }: { action: (state: LinkState, form: FormData) => Promise<LinkState>; teamId: string; defaultName: string; email: string | null; phone: string | null }) {
  const [state, formAction, pending] = useActionState(async (previous: LinkState, form: FormData): Promise<LinkState> => {
    try { return await action(previous, form); } catch { return { error: "The connection failed. Check the list of links before trying again." }; }
  }, {});
  const [copied, setCopied] = useState(false);
  const words = state.link ? `Hello ${state.issuedTo?.split(/\s+/)[0] ?? ""}, this is your personal TileSPEC subcontractor link for sending invoices and signing your agreement. Keep it private: ${state.link}` : "";
  return <>
    <form className={`${styles.form} ${styles.compactForm}`} onSubmit={event => { event.preventDefault(); if (pending) return; setCopied(false); const data = new FormData(event.currentTarget); startTransition(() => formAction(data)); }}>
      <fieldset disabled={pending} className={styles.fieldset}>
        <input type="hidden" name="team_id" value={teamId} />
        <label className={styles.field}>Issued to (the person who will use it)<input name="issued_to" required minLength={2} maxLength={160} defaultValue={defaultName} /></label>
        <label className={styles.field}>Works for<select name="days" defaultValue="30"><option value="7">7 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label>
        <div className={styles.actions}><button type="submit" className={styles.button}>{pending ? "Creating…" : "Create a new link"}</button></div>
      </fieldset>
      {!pending && state.error && <p className={styles.error} role="alert">{state.error}</p>}
    </form>
    {!pending && state.link && <div className={styles.warning} role="status">
      <p><strong>{state.success}</strong></p>
      <label className={styles.field}>Personal link for {state.issuedTo}<input readOnly value={state.link} onFocus={event => event.currentTarget.select()} /></label>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={async () => { try { await navigator.clipboard.writeText(state.link!); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy link"}</button>
        {email && <a className={styles.secondaryButton} href={`mailto:${email}?subject=${encodeURIComponent("Your TileSPEC subcontractor link")}&body=${encodeURIComponent(words)}`}>Email it</a>}
        {phone && <a className={styles.secondaryButton} href={`sms:${phone.replace(/\s/g, "")}?&body=${encodeURIComponent(words)}`}>Text it</a>}
      </div>
      <p>Send it only to {state.issuedTo}. Anyone holding it can send invoices in their name until it expires or you withdraw it.</p>
    </div>}
  </>;
}
