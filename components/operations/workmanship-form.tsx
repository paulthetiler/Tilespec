"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { InspectionActionState } from "@/app/admin/supervisor/inspection-actions";
import { hollowInvestigationNote, isHollowSoundCheck, type InspectionCheck } from "@/lib/operations/inspections";
import { restoreSnagForm, snapshotSnagForm, type SnagFormSnapshot } from "@/lib/operations/snag-create-workflow";
import styles from "@/app/admin/admin.module.css";

export function WorkmanshipForm({ action, checks, evidence, children, nextHref, siteHref }: {
  action: (state: InspectionActionState, form: FormData) => Promise<InspectionActionState>;
  checks: InspectionCheck[]; evidence: React.ReactNode[]; children: React.ReactNode; nextHref?: string; siteHref: string;
}) {
  const router = useRouter(), submitted = useRef<SnagFormSnapshot | null>(null);
  const [answers, setAnswers] = useState<string[]>([]), [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [dirty, setDirty] = useState(false);
  const [state, setState] = useState<InspectionActionState>({});
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return <form className={styles.form} aria-busy={busy} onInput={() => setDirty(true)} onSubmit={async event => {
    event.preventDefault(); if (busy || state.success) return;
    if (!submitted.current) submitted.current = snapshotSnagForm(new FormData(event.currentTarget));
    setBusy(true); setLocked(true); setDirty(true); setState({});
    try {
      const result = await action({}, restoreSnagForm(submitted.current)); setState(result);
      if (result.success) { setDirty(false); router.refresh(); }
      else if (result.uncertain === false) { submitted.current = null; setLocked(false); }
    } catch { setState({ error: "We could not confirm this was saved because the connection failed. Your answers are kept here. Retry the same result; it will not be recorded twice.", uncertain: true }); }
    finally { setBusy(false); }
  }}>
    <fieldset className={styles.fieldset} disabled={busy || locked || !!state.success}>
      <div className={styles.stack}>{checks.map((check, i) => {
        const hollow = isHollowSoundCheck(check.label), answer = answers[i] || "", needsNote = answer === "issue" || answer === "na";
        return <section key={i}>
          <label>{check.label}{check.hold_point ? " · Required hold point" : check.mandatory ? " · Required check" : ""}
            <select name={`status_${i}`} required value={answer} onChange={event => {
              const value = event.target.value;
              setAnswers(previous => { const next = [...previous]; next[i] = value; return next; });
              if (hollow && value === "issue" && !notes[i]) setNotes(previous => { const next = [...previous]; next[i] = hollowInvestigationNote; return next; });
            }}>
              <option value="">Choose answer</option><option value="pass">{hollow ? "No hollow sound found" : "Pass"}</option>
              <option value="issue">{hollow ? "Hollow sound — investigate" : "Issue"}</option><option value="na">Not applicable</option>
            </select>
          </label>
          {hollow && <><input type="hidden" name={`hollow_found_${i}`} value={answer === "issue" ? "true" : "false"} /><p>A hollow sound needs investigation against this installation system and the project requirements.</p></>}
          {(check.mandatory || check.hold_point) && <p>Issue or Not applicable keeps this required check outstanding.</p>}
          {needsNote && <label>Reason / observation for check {i + 1} (required)<textarea name={`note_${i}`} maxLength={2000} value={notes[i] || ""} onChange={event => setNotes(previous => { const next = [...previous]; next[i] = event.target.value; return next; })} /></label>}
          <details className={styles.details} open={check.evidence_required && answer === "pass" ? true : undefined}><summary>{check.evidence_required ? "Supporting evidence (required for Pass)" : needsNote ? "Add evidence (optional)" : "Add a note or evidence (optional)"}</summary>
            {!needsNote && <label>Reason / observation for check {i + 1}<textarea name={`note_${i}`} maxLength={2000} value={notes[i] || ""} onChange={event => setNotes(previous => { const next = [...previous]; next[i] = event.target.value; return next; })} /></label>}{evidence[i]}</details>
        </section>;
      })}{children}</div>
    </fieldset>
    <button className={styles.bigButton} disabled={busy || !!state.success}>{busy ? "Saving…" : locked && !state.success ? "Retry SUBMIT RESULT" : "SUBMIT RESULT"}</button>
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    {locked && !busy && !state.success && <p>Your answers are kept unchanged for a safe retry. <Link href={`${siteHref}/inspections`}>Check saved inspection history</Link> before starting a different result.</p>}
    {state.success && <><p className={styles.success} role="status">{state.success}</p><div className={styles.rowActions}>{nextHref && <Link className={styles.button} href={nextHref}>Back to office request</Link>}<Link className={styles.secondaryButton} href={siteHref}>Back to today</Link>{state.id && <Link className={styles.secondaryButton} href={`${siteHref}/inspections?inspection=${state.id}#inspection-${state.id}`}>View saved result</Link>}</div></>}
  </form>;
}
