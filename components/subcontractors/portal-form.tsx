"use client";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import type { PortalState } from "@/app/subcontractors/actions";
import css from "./portal.module.css";

type Action = (state: PortalState, form: FormData) => Promise<PortalState>;
const LOST = "We could not confirm that because the connection failed. Check your signal and try again. Nothing is sent twice.";

/** A small portal form: disabled while it sends, keeps what was typed on failure, says plainly what happened. */
export function PortalForm({ action, children, submitLabel, pendingLabel = "Sending…", tone = "button", hideOnSuccess = false }:
  { action: Action; children: ReactNode; submitLabel: string; pendingLabel?: string; tone?: "button" | "secondary" | "danger"; hideOnSuccess?: boolean }) {
  const [state, formAction, pending] = useActionState(async (previous: PortalState, form: FormData): Promise<PortalState> => {
    try { return await action(previous, form); } catch { return { error: LOST }; }
  }, {});
  if (hideOnSuccess && state.success) return <p className={css.success} role="status">{state.success}</p>;
  return <form className={css.form} aria-busy={pending} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }}>
    <fieldset className={css.fieldset} disabled={pending}>
      {children}
      <button type="submit" className={css[tone]}>{pending ? pendingLabel : submitLabel}</button>
    </fieldset>
    {!pending && state.error && <p className={css.error} role="alert">{state.error}</p>}
    {!pending && state.success && <p className={css.success} role="status">{state.success}</p>}
  </form>;
}

/** Signing: the three confirmations and the typed signature. The exact text shown is identified by its fingerprint. */
export function SignAgreementForm({ action, agreementId, bodySha, defaultName }: { action: Action; agreementId: string; bodySha: string; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  return <PortalForm action={action} submitLabel="Sign the agreement" pendingLabel="Signing…" hideOnSuccess>
    <input type="hidden" name="agreement_id" value={agreementId} />
    <input type="hidden" name="body_sha256" value={bodySha} />
    <label className={css.field}>Your full name<input name="signer_name" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={160} autoComplete="name" /></label>
    <label className={css.field}>Your position (optional)<small>For example: owner, director, partner.</small><input name="signer_position" maxLength={160} /></label>
    <label className={css.check}><input type="checkbox" name="confirm_read" required /> <span>I have read this agreement and I understand it.</span></label>
    <label className={css.check}><input type="checkbox" name="confirm_authority" required /> <span>I am the subcontractor named above, or I am authorised to sign for them.</span></label>
    <label className={css.check}><input type="checkbox" name="confirm_electronic" required /> <span>I agree to sign electronically, and that typing my name below is my signature.</span></label>
    <label className={css.field}>Type your full name again to sign<small>It must match the name above{name ? `: ${name}` : ""}.</small>
      <input name="signature_text" required minLength={2} maxLength={160} autoComplete="off" /></label>
  </PortalForm>;
}
