"use client";

import Link from "next/link";

import { useRef, useState } from "react";
import { isConfirmedMorningSave, morningCheckGroups, morningChecks, normalizeMorningAnswers, type ConfirmedMorningSave, type MorningResponse } from "@/lib/operations/morning-checks";

const button = { minHeight: 48, padding: "10px 14px", borderRadius: 8, border: "1px solid #aabdc5", background: "#fff", color: "#0f2a3a", fontWeight: 700, cursor: "pointer", textDecoration: "none" } as const;
const primary = { ...button, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box", background: "#0f2a3a", color: "#fff" } as const;
type PlannedGang = { id: string; name: string; people: { id: string; name: string }[]; expectedCount: number };
export default function MorningReadiness({ contractReference, contractId, dashboardHref, workforceHref, plannedGangs }: { contractReference: string; contractId: string; dashboardHref: string; workforceHref: string; plannedGangs: PlannedGang[] }) {
  const [responses, setResponses] = useState<Record<string, MorningResponse>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photoChoice, setPhotoChoice] = useState<Record<string, "yes" | "no">>({});
  const [issueFiles, setIssueFiles] = useState<Record<string, File | null>>({});
  const [photoError, setPhotoError] = useState("");
  const [photosPending, setPhotosPending] = useState(false);
  const photoChecks = ["Safe, suitable access?", "Work areas available and clear?", "Any other trades obstructing progress?"];
  const [stockLevels, setStockLevels] = useState<Record<string, "plenty" | "low" | "out">>({});
  const [stockCounts, setStockCounts] = useState<Record<string, string>>({});
  const stockItems = ["Adhesive available?", "Grout available?", "Tiles and other required materials available?"];
  const [gangAbsences, setGangAbsences] = useState<Record<string, { status: "all" | "some" | "none"; missing: string[]; count: number }>>({});
  const attendanceItem = "Are the expected lads on site?";
  const attendanceNote = () => plannedGangs.map(gang => { const record = gangAbsences[gang.id]; if (!record || record.status === "all") return null; if (record.status === "none") return `${gang.name}: whole gang absent`; return gang.people.length ? `${gang.name}: missing ${gang.people.filter(p => record.missing.includes(p.id)).map(p => p.name).join(", ")}` : `${gang.name}: ${record.count} missing`; }).filter(Boolean).join("; ");
  const attendanceReady = responses[attendanceItem] !== "no" || (plannedGangs.length === 0 ? true : plannedGangs.every(gang => { const row = gangAbsences[gang.id]; return row && (row.status === "all" || row.status === "none" || (gang.people.length ? row.missing.length > 0 : row.count > 0)); }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState<ConfirmedMorningSave | null>(null);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [uncertain, setUncertain] = useState(false);
  const pendingPayload = useRef<string | null>(null);
  const savingNow = useRef(false);
  const answered = Object.keys(responses).length;
  // Photos are optional evidence, never a blocker to completing a safety check.
  const photoReady = true;
  const ready = photoReady && answered === morningChecks.length && attendanceReady && stockItems.every(item => !stockLevels[item] || stockLevels[item] === "plenty" || (stockLevels[item] === "out" ? stockCounts[item] === "0" : !!stockCounts[item] && Number(stockCounts[item]) > 0));
  const frozen = saving || uncertain;
  const issuePrompts: Record<string, string> = {
    "Are the expected lads on site?": "Who is missing? Which gang?",
    "Has everyone received the relevant site safety briefing?": "Who still needs a briefing, and for which work?",
    "Have office instructions been passed on?": "Which instructions have not been passed on, and to whom?",
    "Adhesive available?": "Which adhesive is missing, and where is it needed?",
    "Grout available?": "Which grout is missing, and where is it needed?",
    "Tiles and other required materials available?": "What materials are missing, and for which area?",
    "Water available?": "Where is water unavailable?",
    "Safe, suitable access?": "Which area cannot be accessed safely, and why?",
    "Work areas available and clear?": "Which area is blocked, and by what?",
    "Any other trades obstructing progress?": "Which trade is in the way, and where?",
    "Any outstanding issues with the site manager?": "What needs sorting with the site manager?",
  };

  async function uploadIssuePhotos(inspectionId: string) {
    const chosen = photoChecks.filter(item => photoChoice[item] === "yes" && issueFiles[item]);
    if (!chosen.length) return true;
    setPhotosPending(true); setPhotoError("");
    try {
      const response = await fetch(`/api/supervisor/inspections?inspection=${encodeURIComponent(inspectionId)}`);
      const body = await response.json() as { issues?: { id: string; check_label: string }[]; error?: string };
      if (!response.ok || !body.issues) throw new Error(body.error || "Cannot find saved issues");
      for (const item of chosen) {
        const issue = body.issues.find(i => i.check_label === item);
        if (!issue) throw new Error(`Saved issue not found: ${item}`);
        const form = new FormData(); form.set("issueId", issue.id); form.set("photo", issueFiles[item]!);
        const uploaded = await fetch("/api/supervisor/issues/photo", { method: "POST", body: form });
        const result = await uploaded.json() as { error?: string };
        if (!uploaded.ok) throw new Error(result.error || `Photo failed: ${item}`);
        setIssueFiles(current => ({ ...current, [item]: null }));
      }
      return true;
    } catch (e) { setPhotoError(e instanceof Error ? e.message : "Photo upload failed"); return false; }
    finally { setPhotosPending(false); }
  }

  async function save() {
    if (savingNow.current || !ready) return;
    savingNow.current = true;
    setSaving(true);
    setSaveError("");
    const answers = normalizeMorningAnswers(morningChecks.map(check => ({ item: check.item, response: responses[check.item], note: check.item === attendanceItem && responses[attendanceItem] === "no" && plannedGangs.length ? [attendanceNote(), notes[check.item] || ""].filter(Boolean).join(". ") : stockLevels[check.item] ? [stockLevels[check.item] === "plenty" ? "Stock sufficient" : stockLevels[check.item] === "low" ? "RESTOCK WARNING: Running low" : "OUT OF STOCK: Work may be delayed", stockLevels[check.item] !== "plenty" ? `${stockCounts[check.item]} ${check.item === "Tiles and other required materials available?" ? "units" : "bags"} remaining` : "", notes[check.item] || ""].filter(Boolean).join(". ") : notes[check.item] || "" })))!;
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
      await uploadIssuePhotos(result.id);
    } catch (error) {
      if (pendingPayload.current) setUncertain(true);
      setSaveError(error instanceof Error ? error.message : "We could not confirm the save.");
    } finally { setSaving(false); savingNow.current = false; }
  }

  if (saved) return <section style={{ background: "#eff8f1", border: "1px solid #a9ceb3", borderRadius: 12, padding: 20, margin: "20px 0" }} aria-labelledby="morning-saved-heading">
    <div role="status"><h2 id="morning-saved-heading">Morning checks complete</h2><p>{contractReference} · Saved at {new Date(saved.createdAt).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}.</p>
      <p>{saved.issuesCount ? `${saved.issuesCount} problem${saved.issuesCount === 1 ? " has" : "s have"} been sent to the office. Keep affected work safe while the problem is reviewed.` : "No problems recorded. You’re ready for the next task."}</p></div>
    {photosPending && <p role="status">Uploading site photos…</p>}
    {photoError && <p role="alert">Morning checks saved, but a photo was not uploaded: {photoError} <button type="button" disabled={photosPending} onClick={() => void uploadIssuePhotos(saved.id)}>Retry photos</button></p>}
    {!photosPending && !photoError && photoChecks.some(item => photoChoice[item] === "yes") && <p>Selected site photos uploaded.</p>}
    <h3>Next: who’s on site?</h3><p>Confirm the lads who are here. Anyone already recorded stays recorded.</p>
    <Link href={workforceHref} style={primary}>Who’s on site?</Link>
    <p><Link href={`${dashboardHref}/inspections`} style={{ ...button, display: "inline-flex", alignItems: "center" }}>Check workmanship</Link></p>
    {saved.issuesCount > 0 && <p>For a serious safety or quality concern, make the affected activity safe, contact the office and <Link href={`/admin/holds/new?contract=${contractId}&morning=${saved.id}`}>record a work restriction</Link> if required.</p>}
    <p><Link href={`${dashboardHref}/checks?inspection=${saved.id}#morning-${saved.id}`}>View saved answers</Link> · <Link href={dashboardHref}>Back to today</Link></p>
  </section>;

  return <section style={{ background: "#fff", border: "1px solid #d7e2e5", borderRadius: 12, padding: 18, margin: "20px 0" }} aria-labelledby="morning-checks-heading">
    <h1 id="morning-checks-heading">Morning checks</h1><p>{contractReference} · A quick check before the day starts.</p>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {morningCheckGroups.map(group => <section key={group.title} aria-labelledby={`morning-${group.title.replaceAll(" ", "-")}`} style={{ marginBottom: 22 }}>
        <h2 id={`morning-${group.title.replaceAll(" ", "-")}`}>{group.title}</h2>
        {group.title === "People" && <p style={{ fontSize: 14, color: "#425d6a" }}>Record who actually arrived under <Link href={workforceHref}>Who’s on site?</Link>. Check that everyone has had the required site briefing before starting work.</p>}
        {group.checks.map(check => {
          const response = responses[check.item];
          const problem = response === check.issueAnswer;
          return <fieldset key={check.item} disabled={frozen} style={{ minWidth: 0, border: 0, padding: "12px 0 16px", margin: 0, borderBottom: "1px solid #edf1f2" }}>
            <legend style={{ padding: 0, fontWeight: 700, lineHeight: 1.5, maxWidth: "100%", overflowWrap: "anywhere" }}>{check.item}</legend>
            {stockItems.includes(check.item) ? <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {([["plenty", "Plenty in stock"], ["low", "Running low"], ["out", "Out of stock"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={stockLevels[check.item] === value} style={{ ...button, flex: "1 1 120px", background: stockLevels[check.item] === value ? "#d5eee5" : "#fff" }} onClick={() => { setStockLevels(current => ({ ...current, [check.item]: value })); setResponses(current => ({ ...current, [check.item]: value === "plenty" ? "yes" : "no" })); if (value === "out") setStockCounts(current => ({ ...current, [check.item]: "0" })); }}>{label}</button>)}
              </div>
              {(stockLevels[check.item] === "low" || stockLevels[check.item] === "out") && <label style={{ display: "block", marginTop: 10 }}>How many {check.item === "Tiles and other required materials available?" ? "units" : "bags"} left?
                <input type="number" min="0" max="100000" step="1" disabled={stockLevels[check.item] === "out"} value={stockCounts[check.item] ?? ""} onChange={event => setStockCounts(current => ({ ...current, [check.item]: event.target.value }))} style={{ display: "block", width: 100, padding: 10, marginTop: 6, border: "1px solid #aabdc5", borderRadius: 6 }}/>
              </label>}
              {stockLevels[check.item] === "low" && <p style={{ fontSize: 14 }}>Restock warning for the office — no order placed automatically.</p>}
              {stockLevels[check.item] === "out" && <p style={{ fontSize: 14 }}>Out of stock — office to review urgently.</p>}
            </div> : <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {([["yes", "YES"], ["no", "NO"], ["na", "NOT APPLICABLE"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={response === value} style={{ ...button, flex: value === "na" ? "1 1 130px" : "1 1 55px", background: response === value ? "#d5eee5" : "#fff", outline: response === value ? "2px solid #326e67" : undefined }} onClick={() => setResponses(current => ({ ...current, [check.item]: value }))}>{label}</button>)}
            </div>}
            {check.item === attendanceItem && response === "no" && <div style={{ marginTop: 12, padding: 12, background: "#f5f8f9", borderRadius: 8 }}>
              <p style={{ marginTop: 0, fontWeight: 700 }}>Who is missing from today's planned gangs?</p>
              {plannedGangs.length === 0 ? <p>No gangs are scheduled here today. Check the office plan in <Link href={workforceHref}>Who's on site?</Link> and add a note below.</p> : plannedGangs.map(gang => {
                const row = gangAbsences[gang.id] || { status: "all" as const, missing: [], count: 0 };
                return <div key={gang.id} style={{ borderTop: "1px solid #d7e2e5", padding: "12px 0" }}>
                  <strong>{gang.name}</strong><p style={{ margin: "4px 0" }}>{gang.people.length ? gang.people.map(p => p.name).join(", ") : `${gang.expectedCount || "Unknown number of"} expected`}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {([["all", "All here"], ["some", "Someone missing"], ["none", "Whole gang absent"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={row.status === value && !!gangAbsences[gang.id]} style={{ ...button, background: row.status === value && gangAbsences[gang.id] ? "#d5eee5" : "#fff" }} onClick={() => setGangAbsences(current => ({ ...current, [gang.id]: { status: value, missing: [], count: 0 } }))}>{label}</button>)}
                  </div>
                  {gangAbsences[gang.id]?.status === "some" && (gang.people.length ? <div style={{ marginTop: 8 }}>{gang.people.map(person => <label key={person.id} style={{ display: "block", padding: "6px 0" }}><input type="checkbox" checked={row.missing.includes(person.id)} onChange={event => setGangAbsences(current => ({ ...current, [gang.id]: { ...row, missing: event.target.checked ? [...row.missing, person.id] : row.missing.filter(id => id !== person.id) } }))}/> {person.name} missing</label>)}</div> : <label style={{ display: "block", marginTop: 8 }}>How many missing? <input type="number" min={1} max={99} value={row.count || ""} onChange={event => setGangAbsences(current => ({ ...current, [gang.id]: { ...row, count: Math.max(0, Number(event.target.value) || 0) } }))} style={{ width: 72, padding: 8 }}/></label>)}
                </div>;
              })}
              <p style={{ marginBottom: 0, fontSize: 13 }}>This records the morning-check exception. Confirm actual attendance separately in <Link href={workforceHref}>Who's on site?</Link>.</p>
            </div>}
            {photoChecks.includes(check.item) && problem && <div style={{ marginTop: 12, padding: 12, background: "#f5f8f9", borderRadius: 8 }}>
              <strong>Add a photo?</strong>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {(["yes", "no"] as const).map(value => <button key={value} type="button" aria-pressed={photoChoice[check.item] === value} style={{ ...button, background: photoChoice[check.item] === value ? "#d5eee5" : "#fff" }} onClick={() => setPhotoChoice(current => ({ ...current, [check.item]: value }))}>{value === "yes" ? "Yes" : "No"}</button>)}
              </div>
              {photoChoice[check.item] === "yes" && <label style={{ display: "block", marginTop: 10 }}>Take photo or choose from phone
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => setIssueFiles(current => ({ ...current, [check.item]: event.target.files?.[0] || null }))} style={{ display: "block", marginTop: 8 }}/>
                {issueFiles[check.item] && <span>Selected: {issueFiles[check.item]?.name}</span>}
              </label>}
            </div>}
            {(response === "no" || problem) && <label style={{ display: "block", marginTop: 10 }}>Short note (optional)<textarea maxLength={2000} rows={2} value={notes[check.item] || ""} onChange={event => setNotes(current => ({ ...current, [check.item]: event.target.value }))} style={{ display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box", minHeight: 64, marginTop: 6, padding: 10, font: "inherit", border: "1px solid #aabdc5", borderRadius: 6 }} placeholder={problem ? issuePrompts[check.item] || "What needs sorting?" : "Anything the office needs to know?"} /></label>}
            {problem && <p style={{ fontSize: 14, marginBottom: 0, color: "#8d3423" }}>This will be recorded for the office to review.</p>}
          </fieldset>;
        })}
      </section>)}
      <p aria-live="polite">{answered} of {morningChecks.length} answered</p>
      {saveError && <p role="alert" style={{ color: "#a12626" }}>{saveError} Your answers are kept here. {uncertain ? "Retry to confirm the same checks before making changes." : "Check the answers and try again."}</p>}
      {!ready && answered === morningChecks.length && <p role="status" style={{ color: "#8d3423" }}>{!attendanceReady ? "Please mark which planned gangs or operatives are missing under People." : stockItems.some(item => stockLevels[item] === "low" && (!stockCounts[item] || Number(stockCounts[item]) <= 0)) ? "Please enter the remaining stock count for materials marked Running low." : "Please complete any outstanding details above."}</p>}
      <button type="submit" disabled={!ready || saving} style={{ ...primary, opacity: !ready || saving ? 0.6 : 1 }}>{saving ? "Saving…" : uncertain ? "Retry saving morning checks" : "COMPLETE MORNING CHECKS"}</button>
    </form>
  </section>;
}
