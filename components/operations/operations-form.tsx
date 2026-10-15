"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/lib/operations/types";
import { MAX_FILE_BYTES } from "@/lib/operations/validation";
import styles from "@/app/admin/admin.module.css";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  compact?: boolean;
  // A single large button for the supervisor's most common actions.
  submitClassName?: string;
  // No box around the form, and anything optional placed after the button.
  plain?: boolean;
  footer?: React.ReactNode;
  // Workforce forms keep the exact attempted payload until the database can
  // confirm the outcome. Other existing forms retain their current behaviour.
  freezeOnFailure?: boolean;
};

// A lost connection is not a refusal: the change may or may not have reached
// the server. Say so plainly; the request key makes a retry safe either way.
export const CONNECTION_FAILED = "We could not confirm this was saved because the connection failed. Your entries are still here: check your signal and try again. It will not be recorded twice.";

type RetryState = ActionState & { uncertain?: boolean };
export function OperationsForm({ action, children, submitLabel, compact = false, submitClassName, plain = false, footer, freezeOnFailure = false }: Props) {
  const frozen = useRef<FormData | null>(null);
  const [state, formAction, pending] = useActionState(async (previous: RetryState, form: FormData): Promise<RetryState> => {
    try {
      return await action(previous, form) as RetryState;
    } catch {
      return { error: CONNECTION_FAILED, uncertain: true };
    }
  }, {});
  const [clientError, setClientError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.uncertain) frozen.current = null;
    // Only a confirmed successful mutation clears a create/upload form. Errors
    // keep both the original values and file available for an idempotent retry.
    if (state.success) {
      formRef.current?.reset();
      setUnsaved(false);
    }
  }, [state]);
  useEffect(() => {
    // Typed but unsaved entries are not lost silently to a refresh or a closed tab.
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  return (
    <form ref={formRef} action={formAction} className={`${styles.form}${compact ? ` ${styles.compactForm}` : ""}`} aria-busy={pending}
      onInput={() => setUnsaved(true)} onSubmit={event => {
      event.preventDefault();
      setClientError(null);
      const input = event.currentTarget.elements.namedItem("file");
      const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
      if (file && (file.size === 0 || file.size > MAX_FILE_BYTES)) {
        setClientError(`Choose a file between 1 byte and ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
        return;
      }
      // Dispatch explicitly so React does not reset uncontrolled fields when a
      // server action returns a validation/upload error. The original file and
      // request key remain available for a safe connectivity retry.
      if (pending) return;
      if (freezeOnFailure && !frozen.current) frozen.current = new FormData(event.currentTarget);
      const submitted = frozen.current ?? new FormData(event.currentTarget);
      if (freezeOnFailure) setUnsaved(true);
      startTransition(() => formAction(submitted));
    }}>
      <fieldset disabled={pending} className={plain ? styles.plainFieldset : styles.fieldset}>
        {freezeOnFailure ? <fieldset disabled={!!state.uncertain} className={styles.plainFieldset}>{children}</fieldset> : children}
        <div className={styles.actions}>
          <button type="submit" className={submitClassName ?? styles.button}>{pending ? "Saving…" : submitLabel}</button>
        </div>
        {freezeOnFailure && footer ? <fieldset disabled={!!state.uncertain} className={styles.plainFieldset}>{footer}</fieldset> : footer}
      </fieldset>
      {!pending && (clientError || state.error) && <p className={styles.error} role="alert">{clientError || state.error}</p>}
      {!pending && freezeOnFailure && state.uncertain && <p role="status">Your entries are kept unchanged. Retry sends the same details; check saved records before starting a different entry.</p>}
      {!pending && !clientError && state.success && <p className={styles.success} role="status">{state.success}</p>}
    </form>
  );
}
