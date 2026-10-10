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
};

export function OperationsForm({ action, children, submitLabel, compact = false }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // Only a confirmed successful mutation clears a create/upload form. Errors
    // keep both the original values and file available for an idempotent retry.
    if (state.success) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className={`${styles.form}${compact ? ` ${styles.compactForm}` : ""}`} aria-busy={pending} onSubmit={event => {
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
      const submitted = new FormData(event.currentTarget);
      startTransition(() => formAction(submitted));
    }}>
      <fieldset disabled={pending} className={styles.fieldset}>
        {children}
        <div className={styles.actions}>
          <button type="submit" className={styles.button}>{pending ? "Saving…" : submitLabel}</button>
        </div>
      </fieldset>
      {!pending && (clientError || state.error) && <p className={styles.error} role="alert">{clientError || state.error}</p>}
      {!pending && !clientError && state.success && <p className={styles.success} role="status">{state.success}</p>}
    </form>
  );
}
