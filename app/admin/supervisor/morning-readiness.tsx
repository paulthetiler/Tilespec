"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { isConfirmedMorningSave, morningCheckGroups, morningChecks, normalizeMorningAnswers, type ConfirmedMorningSave, type MorningResponse } from "@/lib/operations/morning-checks";

const button = { minHeight: 48, padding: "10px 14px", borderRadius: 8, border: "1px solid #aabdc5", background: "#fff", color: "#0f2a3a", fontWeight: 700, cursor: "pointer", textDecoration: "none" } as const;
const primary = { ...button, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box", background: "#0f2a3a", color: "#fff" } as const;
export default function MorningReadiness({ contractReference, contractId, dashboardHref, workforceHref }: { contractReference: string; contractId: string; dashboardHref: string; workforceHref: string }) {
  const [responses, setResponses] = useState<Record<string, MorningResponse>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState<ConfirmedMorningSave | null>(null);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [uncertain, setUncertain] = useState(false);
  const pendingPayload = useRef<string | null>(null);
  const savingNow = useRef(false);
  const answered = Object.keys(responses).length;
  const ready = answered === morningChecks.length;
  const frozen = saving || uncertain;

  async function save() {
    if (savingNow.current || !ready) return;
    savingNow.current = true;
    setSaving(true);
    setSaveError("");
    const answers = normalizeMorningAnswers(morningChecks.map(check => ({ item: check.item, response: responses[check.item], note: notes[check.item] || "" })))!;
    if (!pendingPayload.current) pendingPayload.current = JSON.stringify({ contractId, requestKey, answers });
    try {
      const response = await fetch("/api/supervisor/inspections", { method: "POST", headers: { "Content-Type": "application/json" }, body: pendingPayload.current });
      const result: unknown = await response.json();
      if (!response.ok) {
        // These responses reject the input before writing. An interrupted or
        // uncertain reply keeps the exact request and key locked for retry.
        if ([400, 403, 409].includes(response.status)) { pendingPayload.current = null; setUncertain(false); }
        else setUncertain(true);
        throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "We could not confirm the save.");
      }
      if (!isConfirmedMorningSave(result, contractId, requestKey, answers.filter(answer => answer.status === "issue").length)) {
        setUncertain(true);
        throw new Error("We could not confirm the save.");
      }
      setSaved(result);
      setUncertain(false);
    } catch (error) {
      if (pendingPayload.current) setUncertain(true);
      setSaveError(error instanceof Error ? error.message : "We could not confirm the save.");
    } finally { setSaving(false); savingNow.current = false; }
  }

  if (saved) return <section style={{ background: "#eff8f1", border: "1px solid #a9ceb3", borderRadius: 12, padding: 20, margin: "20px 0" }} aria-labelledby="morning-saved-heading">
    <div role="status"><h2 id="morning-saved-heading">Morning checks complete</h2><p>{contractReference} · Saved at {new Date(saved.createdAt).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}.</p>
      <p>{saved.issuesCount ? `${saved.issuesCount} problem${saved.issuesCount === 1 ? " has" : "s have"} been sent to the office. Keep affected work safe while the problem is reviewed.` : "No problems recorded. You’re ready for the next task."}</p></div>
    <h3>Next: who’s on site?</h3><p>Confirm the lads who are here. Anyone already recorded stays recorded.</p>
    <Link href={workforceHref} style={primary}>Who’s on site?</Link>
    <p><Link href={`${dashboardHref}/inspections`} style={{ ...button, display: "inline-flex", alignItems: "center" }}>Check workmanship</Link></p>
    {saved.issuesCount > 0 && <><p><Link href={`/admin/snags/new?contract=${contractId}`} style={{ ...button, display: "inline-flex", alignItems: "center" }}>Add a photographed snag</Link></p><p><Link href={`/admin/holds/new?contract=${contractId}&morning=${saved.id}`} style={{ ...button, display: "inline-flex", alignItems: "center", background: "#8a3228", color: "#fff" }}>STOP WORK</Link></p></>}
    <p><Link href={`${dashboardHref}/checks?inspection=${saved.id}#morning-${saved.id}`}>View saved answers</Link> · <Link href={dashboardHref}>Back to today</Link></p>
  </section>;

  return <section style={{ background: "#fff", border: "1px solid #d7e2e5", borderRadius: 12, padding: 18, margin: "20px 0" }} aria-labelledby="morning-checks-heading">
    <h1 id="morning-checks-heading">Morning checks</h1><p>{contractReference} · A quick check before the day starts.</p>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {morningCheckGroups.map(group => <section key={group.title} aria-labelledby={`morning-${group.title.replaceAll(" ", "-")}`} style={{ marginBottom: 22 }}>
        <h2 id={`morning-${group.title.replaceAll(" ", "-")}`}>{group.title}</h2>
        {group.title === "People" && <p style={{ fontSize: 14, color: "#425d6a" }}>Attendance is confirmed separately in Who’s on site. Follow the actual site briefing and induction requirements; these answers do not replace safety records.</p>}
        {group.checks.map(check => {
          const response = responses[check.item];
          const problem = response === check.issueAnswer;
          return <fieldset key={check.item} disabled={frozen} style={{ minWidth: 0, border: 0, padding: "12px 0 16px", margin: 0, borderBottom: "1px solid #edf1f2" }}>
            <legend style={{ padding: 0, fontWeight: 700, lineHeight: 1.5, maxWidth: "100%", overflowWrap: "anywhere" }}>{check.item}</legend>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {([["yes", "YES"], ["no", "NO"], ["na", "NOT APPLICABLE"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={response === value} style={{ ...button, flex: value === "na" ? "1 1 130px" : "1 1 55px", background: response === value ? "#d5eee5" : "#fff", outline: response === value ? "2px solid #326e67" : undefined }} onClick={() => setResponses(current => ({ ...current, [check.item]: value }))}>{label}</button>)}
            </div>
            {(response === "no" || problem) && <label style={{ display: "block", marginTop: 10 }}>Short note (optional)<textarea maxLength={2000} rows={2} value={notes[check.item] || ""} onChange={event => setNotes(current => ({ ...current, [check.item]: event.target.value }))} style={{ display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box", minHeight: 64, marginTop: 6, padding: 10, font: "inherit", border: "1px solid #aabdc5", borderRadius: 6 }} placeholder={problem ? "What’s needed, and where?" : "Anything the office needs to know?"} /></label>}
            {problem && <p style={{ fontSize: 14, marginBottom: 0, color: "#8d3423" }}>This problem will be sent to the office. You can add a photographed snag after saving.</p>}
          </fieldset>;
        })}
      </section>)}
      <p aria-live="polite">{answered} of {morningChecks.length} answered</p>
      {saveError && <p role="alert" style={{ color: "#a12626" }}>{saveError} Your answers are kept here. {uncertain ? "Retry to confirm the same checks before making changes." : "Check the answers and try again."}</p>}
      <button type="submit" disabled={!ready || saving} style={{ ...primary, opacity: !ready || saving ? 0.6 : 1 }}>{saving ? "Saving…" : uncertain ? "Retry saving morning checks" : "COMPLETE MORNING CHECKS"}</button>
    </form>
  </section>;
}
