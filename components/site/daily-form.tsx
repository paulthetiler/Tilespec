"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";

/** `href`: where to go once the save is confirmed, for a form that creates a new record. */
export type DailyActionState = ActionState & { id?: string; uncertain?: boolean; href?: string };
export function DailyForm({ action, children, label, nextHref, nextLabel }: {
  action: (state: DailyActionState, form: FormData) => Promise<DailyActionState>;
  children: React.ReactNode; label: string; nextHref?: string; nextLabel?: string;
}) {
  const frozen = useRef<FormData | null>(null), router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [state, dispatch, pending] = useActionState(async (previous: DailyActionState, input: FormData) => {
    try { return await action(previous, input); }
    catch { return { error: "We could not confirm the save. Your entries are kept here. Check your connection, then retry the same details.", uncertain: true }; }
  }, {});
  useEffect(() => {
    if (!state.uncertain) frozen.current = null;
    if (state.success) setDirty(false);
    if (state.success && state.href) router.push(state.href);
  }, [state, router]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return <form className={styles.form} aria-busy={pending} onInput={() => setDirty(true)} onSubmit={event => {
    event.preventDefault();
    if (pending || state.success) return;
    if (!frozen.current) frozen.current = new FormData(event.currentTarget);
    const input = frozen.current;
    setDirty(true);
    startTransition(() => dispatch(input));
  }}>
    <fieldset disabled={pending || !!state.uncertain || !!state.success} className={styles.plainFieldset}>{children}</fieldset>
    {!state.success && <button className={styles.bigButton} disabled={pending} type="submit">{pending ? "Saving…" : state.uncertain ? "Retry the same details" : label}</button>}
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    {state.success && <div className={styles.success} role="status"><p>{state.success}</p>{nextHref && <a className={styles.button} href={nextHref}>{nextLabel || "Back to today"}</a>}</div>}
  </form>;
}
