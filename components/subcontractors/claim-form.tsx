"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalState } from "@/app/subcontractors/actions";
import type { ClaimMode, ClaimSnapshot, PortalJob } from "@/lib/subcontractors/claim";
import { cisLabels } from "@/lib/subcontractors/claim";
import { shrinkPhoto } from "@/components/gang/invoice-form";
import css from "./portal.module.css";

type Action = (state: PortalState, form: FormData) => Promise<PortalState>;
type Props = {
  mode: ClaimMode; jobs: PortalJob[]; nextNumber: string; today: string;
  previewAction: Action; submitAction: Action; photoAction: Action;
  replaces?: { id: string; reference: string; contract_id: string; invoice_number: string | null; lines: { work_area_id: string; unit: string; claimed: number }[] };
};
type Line = { key: string; area: string; quantity: string; unit: string };
type DayRow = { key: string; rate: string; quantity: string; description: string };
type Extra = { key: string; description: string; amount: string };

const MAX = 4 * 1024 * 1024;
const LOST = "We could not confirm that because the connection failed. Your entries are still here: check your signal and try again. Nothing is sent twice.";
const pounds = (value: number | null | undefined) => value === null || value === undefined ? "" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value));
const units: Record<string, string> = { m2: "m²", lm: "linear m", item: "items" };
const number = (text: string) => { const n = Number(text.replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
const amount = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const longDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const id = () => crypto.randomUUID();

/** The invoice as the database priced it, for the subcontractor to check before it is sent. */
export function ClaimPreview({ snapshot }: { snapshot: ClaimSnapshot }) {
  const t = snapshot.totals, e = snapshot.estimate;
  return <div className={css.form}>
    <dl className={css.facts}>
      <dt>From</dt><dd>{snapshot.issuer.name}</dd>
      <dt>To</dt><dd>{snapshot.customer.name}</dd>
      <dt>Job</dt><dd>{snapshot.contract.name}</dd>
      <dt>Invoice number</dt><dd>{snapshot.invoice_number}</dd>
      <dt>Invoice date</dt><dd>{longDate(snapshot.invoice_date)}</dd>
    </dl>
    <table className={css.rows}>
      <thead><tr><th>Work</th><th className={css.num}>Amount</th></tr></thead>
      <tbody>
        {snapshot.lines.map(l => <tr key={l.work_area_id + l.unit}><td>{l.area}<br /><span className={css.muted}>{amount(l.quantity)} {units[l.unit]} at {pounds(l.rate)}</span></td><td className={css.num}>{pounds(l.amount)}</td></tr>)}
        {snapshot.day_rates.map((d, i) => <tr key={`d${i}`}><td>Day rate: {d.description}<br /><span className={css.muted}>{amount(d.quantity)} {d.unit}{d.quantity === 1 ? "" : "s"} at {pounds(d.rate)}</span></td><td className={css.num}>{pounds(d.amount)}</td></tr>)}
        {snapshot.variations.map(v => <tr key={v.variation_id}><td>Approved variation {v.reference}<br /><span className={css.muted}>{v.description}</span></td><td className={css.num}>{pounds(v.amount)}</td></tr>)}
        {snapshot.additional.map((a, i) => <tr key={`a${i}`}><td>Additional work — not yet approved<br /><span className={css.muted}>{a.description}</span></td><td className={css.num}>{pounds(a.amount)}</td></tr>)}
      </tbody>
      <tfoot>
        {t.vat_treatment === "standard" && <><tr><td>Before VAT</td><td className={css.num}>{pounds(t.net)}</td></tr><tr><td>VAT at {t.vat_rate}%</td><td className={css.num}>{pounds(t.vat)}</td></tr></>}
      </tfoot>
    </table>
    <p className={css.total}><span>Invoice total</span><span>{pounds(t.gross)}</span></p>
    {t.vat_treatment === "reverse_charge" && <p className={css.muted}>Reverse charge applies: no VAT is charged on this invoice. TileSpec accounts for the VAT to HMRC.</p>}
    {snapshot.additional.length > 0 && <p className={`${css.notice} ${css.attention}`}>Additional work has not been approved yet. TileSpec will decide whether to pay it and will tell you why if they do not.</p>}
    <div className={css.notice}>
      <strong>What you should be paid (estimate)</strong>
      <dl className={css.facts}>
        <dt>Invoice total</dt><dd>{pounds(t.gross)}</dd>
        {e.retention > 0 && <><dt>Retention held ({e.retention_percent}%)</dt><dd>− {pounds(e.retention)}</dd></>}
        <dt>CIS tax</dt><dd>{e.cis === null ? cisLabels[e.cis_status] ?? "To be confirmed" : e.cis > 0 ? `− ${pounds(e.cis)} (${e.cis_rate}%)` : "None"}</dd>
        {e.payable !== null && <><dt>Estimated payment</dt><dd>{pounds(e.payable)}</dd></>}
        <dt>Payment date</dt><dd>{longDate(snapshot.payment.due_on)}</dd>
      </dl>
      <span className={css.muted}>The site supervisor checks the work first, then the office approves payment. The final figures are confirmed when your invoice is approved.</span>
    </div>
  </div>;
}

/**
 * One form for both ways of invoicing. Creating an invoice: the subcontractor enters quantities
 * only; rates are shown, never typed. Uploading: their own invoice file with its number, date and
 * amount, and what it is for. Either way it goes to the same supervisor check and office approval.
 */
export function ClaimForm({ mode, jobs, nextNumber, today, previewAction, submitAction, photoAction, replaces }: Props) {
  const router = useRouter();
  const generated = mode === "generated";
  const [job, setJob] = useState(replaces?.contract_id ?? (jobs.length === 1 ? jobs[0].contract_id : ""));
  const [lines, setLines] = useState<Line[]>(() => replaces?.lines.length
    ? replaces.lines.map(l => ({ key: id(), area: l.work_area_id, quantity: String(l.claimed), unit: l.unit }))
    : [{ key: id(), area: "", quantity: "", unit: "m2" }]);
  const [days, setDays] = useState<DayRow[]>([]);
  const [variationAmounts, setVariationAmounts] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"edit" | "check">("edit");
  const [preview, setPreview] = useState<ClaimSnapshot | null>(null);
  const [busy, setBusy] = useState<"" | "checking" | "sending" | "photos">("");
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(id);
  const formRef = useRef<HTMLFormElement>(null);
  const kept = useRef<FormData | null>(null);
  const current = useMemo(() => jobs.find(j => j.contract_id === job), [job, jobs]);
  const rateFor = (line: Line) => current?.areas.find(a => a.id === line.area)?.rates[line.unit as "m2" | "lm" | "item"] ?? null;
  const history = (line: Line) => current?.claimed.find(c => c.work_area_id === line.area && c.unit === line.unit);
  const patch = (key: string, change: Partial<Line>) => setLines(rows => rows.map(r => (r.key === key ? { ...r, ...change } : r)));
  let step = 0;
  const next = () => ++step;

  function collect(): FormData | null {
    if (!formRef.current) return null;
    const data = new FormData(formRef.current);
    data.delete("file_input"); data.delete("photo_input");
    data.set("mode", mode);
    if (!generated) {
      if (!file) { setError("Add your invoice: a PDF or a photo of it."); return null; }
      if (file.size > MAX) { setError("That file is larger than 4 MB. Send a PDF or take the photo again."); return null; }
      data.set("file", file);
    }
    return data;
  }
  async function run(action: Action, data: FormData): Promise<PortalState> {
    try { return await action({}, data); } catch { return { error: LOST }; }
  }
  async function check() {
    setError("");
    const data = collect();
    if (!data) return;
    setBusy("checking");
    const result = await run(previewAction, data);
    setBusy("");
    if (result.error || !result.preview) { setError(result.error ?? LOST); return; }
    kept.current = data; setPreview(result.preview); setStage("check"); window.scrollTo({ top: 0 });
  }
  async function send() {
    setError("");
    const data = generated ? kept.current : collect();
    if (!data) return;
    data.set("request_key", requestKey);
    setBusy("sending");
    const result = await run(submitAction, data);
    if (result.error || !result.sent) {
      setBusy(""); setError(result.error ?? LOST);
      // A refusal means nothing was saved under this key; a fresh key lets a corrected invoice through.
      if (result.error && result.error !== LOST) setRequestKey(id());
      return;
    }
    let missed = 0;
    if (photos.length) {
      setBusy("photos");
      for (const photo of photos) {
        const upload = new FormData();
        upload.set("invoice_id", result.sent.id); upload.set("request_key", id()); upload.set("file", photo);
        if ((await run(photoAction, upload)).error) missed++;
      }
    }
    router.push(`/subcontractors/sent/${result.sent.id}${missed ? `?photos=${missed}` : ""}`);
  }

  const working = busy !== "";
  return <>
    {stage === "check" && preview && <section className={css.panel} aria-label="Check your invoice">
      <h2>Check your invoice</h2>
      <p className={css.muted}>This is what will be sent to TileSpec. Nothing has been sent yet.</p>
      <ClaimPreview snapshot={preview} />
      {error && <p className={css.error} role="alert">{error}</p>}
      <div className={css.actions}>
        <button type="button" className={css.button} disabled={working} onClick={send}>{busy === "sending" ? "Creating your invoice…" : busy === "photos" ? "Sending your photos…" : "Send invoice to TileSpec"}</button>
        <button type="button" className={css.secondary} disabled={working} onClick={() => { setStage("edit"); setError(""); }}>Change something</button>
      </div>
    </section>}

    <form ref={formRef} className={css.form} hidden={stage === "check"} aria-busy={working} onSubmit={event => { event.preventDefault(); if (!working) void (generated ? check() : send()); }}>
      <fieldset className={css.fieldset} disabled={working}>
        {replaces && <><input type="hidden" name="replaces_invoice_id" value={replaces.id} />
          <p className={`${css.notice} ${css.attention}`}>This corrected invoice replaces {replaces.reference}. The original is kept on record.</p></>}

        <div className={css.step}>
          <p className={css.stepTitle}><span className={css.stepNumber}>{next()}</span> Which job?</p>
          {replaces ? <><input type="hidden" name="contract_id" value={job} /><p><strong>{current?.name}</strong></p></>
            : <label className={css.field}><span className={css.srOnly}>Job</span>
              <select name="contract_id" required value={job} onChange={event => { setJob(event.target.value); setLines([{ key: id(), area: "", quantity: "", unit: "m2" }]); setDays([]); setVariationAmounts({}); }}>
                {jobs.length !== 1 && <option value="">Choose your job</option>}
                {jobs.map(j => <option key={j.contract_id} value={j.contract_id}>{j.name}</option>)}
              </select></label>}
          {current?.address && <p className={css.muted}>{current.address}</p>}
        </div>

        {!generated && <div className={css.step}>
          <p className={css.stepTitle}><span className={css.stepNumber}>{next()}</span> Your invoice</p>
          <label className={css.field}>Invoice file<small>A PDF, or a clear photo of your invoice (JPEG or PNG, up to 4 MB).</small>
            <input type="file" name="file_input" accept="application/pdf,image/jpeg,image/png" required onChange={async event => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen ? await shrinkPhoto(chosen).catch(() => chosen) : null);
            }} /></label>
          <label className={css.field}>Invoice number<input name="invoice_number" required maxLength={60} defaultValue={replaces?.invoice_number ?? ""} autoComplete="off" /></label>
          <div className={css.pair}>
            <label className={css.field}>Invoice date<input type="date" name="invoice_date" required max={today} defaultValue={today} /></label>
            <label className={css.field}>Amount before VAT (£)<input name="invoice_total" inputMode="decimal" required placeholder="e.g. 1250.00" autoComplete="off" /></label>
          </div>
        </div>}

        <div className={css.step}>
          <p className={css.stepTitle}><span className={css.stepNumber}>{next()}</span> {generated ? "What have you completed?" : "What is this invoice for?"}</p>
          <p className={css.muted}>Choose the area and enter how much you have finished since your last invoice{generated ? ". Your agreed rate is filled in for you." : "."}</p>
          {lines.map((line, index) => {
            const rate = rateFor(line), before = history(line), q = number(line.quantity);
            return <div className={css.line} key={line.key}>
              <label className={css.field}>Work area{lines.length > 1 ? ` ${index + 1}` : ""}
                <select name="line_area" value={line.area} onChange={event => patch(line.key, { area: event.target.value })} disabled={!job}>
                  <option value="">{job ? "Choose area" : "Choose the job first"}</option>
                  {(current?.areas ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select></label>
              <div className={css.pair}>
                <label className={css.field}>How much<input name="line_quantity" inputMode="decimal" autoComplete="off" placeholder="e.g. 55" value={line.quantity} onChange={event => patch(line.key, { quantity: event.target.value })} /></label>
                <label className={css.field}>Measured in<select name="line_unit" value={line.unit} onChange={event => patch(line.key, { unit: event.target.value })}>
                  <option value="m2">m²</option><option value="lm">linear m</option><option value="item">items</option></select></label>
              </div>
              {line.area && <div className={css.lineFoot}>
                {generated && (rate !== null ? <span>Agreed rate: <strong>{pounds(rate)} per {units[line.unit]}</strong>{q > 0 && <> · This line: <strong>{pounds(Math.round(q * rate * 100) / 100)}</strong></>}</span>
                  : <span><strong>No agreed rate is recorded for this area in {units[line.unit]}.</strong> Ask TileSpec to add it, or upload your own invoice.</span>)}
                {before && (before.approved > 0 || before.in_progress > 0) && <span>Already approved: {amount(before.approved)} {units[line.unit]}{before.in_progress > 0 ? ` · being checked: ${amount(before.in_progress)}` : ""}</span>}
                {before && before.correction > 0 && <span>Waiting for correction: {amount(before.correction)} {units[line.unit]}</span>}
              </div>}
              {lines.length > 1 && <button type="button" className={css.linkButton} onClick={() => setLines(rows => rows.filter(r => r.key !== line.key))}>Remove this area</button>}
            </div>;
          })}
          {lines.length < 20 && <button type="button" className={`${css.secondary} ${css.small}`} onClick={() => setLines(rows => [...rows, { key: id(), area: "", quantity: "", unit: "m2" }])}>+ Add another area</button>}
        </div>

        {current && <div className={css.step}>
          <p className={css.stepTitle}><span className={css.stepNumber}>{next()}</span> Anything else? <span className={css.muted}>(optional)</span></p>

          {current.day_rates.length > 0 && <>
            <h3>Day rate work</h3>
            {days.map(row => {
              const rate = current.day_rates.find(r => r.id === row.rate);
              return <div className={css.line} key={row.key}>
                <label className={css.field}>Rate<select name="day_rate_id" value={row.rate} onChange={event => setDays(rows => rows.map(r => r.key === row.key ? { ...r, rate: event.target.value } : r))}>
                  {current.day_rates.map(r => <option key={r.id} value={r.id}>{r.description ?? (r.unit === "day" ? "Day rate" : "Hourly rate")}{generated ? ` — ${pounds(r.rate)} per ${r.unit}` : ""}</option>)}</select></label>
                <label className={css.field}>How many {rate?.unit === "hour" ? "hours" : "days"}<input name="day_quantity" inputMode="decimal" autoComplete="off" value={row.quantity}
                  onChange={event => setDays(rows => rows.map(r => r.key === row.key ? { ...r, quantity: event.target.value } : r))} /></label>
                <label className={css.field} style={{ gridColumn: "1 / -1" }}>What was the work?<input name="day_description" maxLength={300} value={row.description} placeholder="For example: making good around the tills"
                  onChange={event => setDays(rows => rows.map(r => r.key === row.key ? { ...r, description: event.target.value } : r))} /></label>
                <button type="button" className={css.linkButton} onClick={() => setDays(rows => rows.filter(r => r.key !== row.key))}>Remove</button>
              </div>;
            })}
            {days.length < 10 && <button type="button" className={`${css.secondary} ${css.small}`} onClick={() => setDays(rows => [...rows, { key: id(), rate: current.day_rates[0].id, quantity: "", description: "" }])}>+ Add day rate work</button>}
          </>}

          {current.variations.filter(v => v.remaining > 0).length > 0 && <>
            <h3>Approved variations</h3>
            <p className={css.muted}>Extra work TileSpec has already approved for you. Enter how much of it you are claiming now.</p>
            {current.variations.filter(v => v.remaining > 0).map(v => <div className={css.line} key={v.id}>
              <div><strong>{v.reference}</strong> — {v.description}<br /><span className={css.muted}>Agreed {pounds(v.amount)} · left to claim {pounds(v.remaining)}</span></div>
              <label className={css.field}>Claim now (£)<input type="hidden" name="variation_id" value={v.id} />
                <input name="variation_amount" inputMode="decimal" autoComplete="off" value={variationAmounts[v.id] ?? ""} placeholder="Leave blank if none"
                  onChange={event => setVariationAmounts(a => ({ ...a, [v.id]: event.target.value }))} /></label>
            </div>)}
          </>}

          <h3>Additional work not yet approved</h3>
          <p className={css.muted}>Only for extra work you were asked to do that is not in the list above. TileSpec will review it separately.</p>
          {extras.map(row => <div className={css.line} key={row.key}>
            <label className={css.field}>What was it, and who asked for it?<input name="additional_description" maxLength={500} value={row.description}
              onChange={event => setExtras(rows => rows.map(r => r.key === row.key ? { ...r, description: event.target.value } : r))} /></label>
            <label className={css.field}>Amount (£)<input name="additional_amount" inputMode="decimal" autoComplete="off" value={row.amount}
              onChange={event => setExtras(rows => rows.map(r => r.key === row.key ? { ...r, amount: event.target.value } : r))} /></label>
            <button type="button" className={css.linkButton} onClick={() => setExtras(rows => rows.filter(r => r.key !== row.key))}>Remove</button>
          </div>)}
          {extras.length < 10 && <button type="button" className={`${css.secondary} ${css.small}`} onClick={() => setExtras(rows => [...rows, { key: id(), description: "", amount: "" }])}>+ Add additional work</button>}
        </div>}

        <div className={css.step}>
          <p className={css.stepTitle}><span className={css.stepNumber}>{next()}</span> Notes and photos <span className={css.muted}>(optional)</span></p>
          {generated && <label className={css.field}>Your invoice number<small>We have suggested the next number. Change it if you use your own numbering.</small>
            <input name="invoice_number" required maxLength={60} defaultValue={replaces?.invoice_number ?? nextNumber} autoComplete="off" /></label>}
          <label className={css.field}>Work completed up to<input type="date" name="period_end" max={today} defaultValue={today} /></label>
          <label className={css.field}>Note for TileSpec<textarea name="note" maxLength={2000} rows={2} /></label>
          <label className={css.field}>Photos of the work<small>Up to six. They help the supervisor check your work quickly.</small>
            <input type="file" name="photo_input" accept="image/jpeg,image/png" multiple onChange={async event => {
              const chosen = Array.from(event.target.files ?? []).slice(0, 6);
              setPhotos(await Promise.all(chosen.map(p => shrinkPhoto(p).catch(() => p))));
            }} /></label>
          {photos.length > 0 && <p className={css.muted}>{photos.length} photo{photos.length === 1 ? "" : "s"} ready to send.</p>}
        </div>

        <p className={css.muted}>Sending your invoice asks the site supervisor to check the work. It is not a payment approval.</p>
        <button type="submit" className={css.button}>{generated ? (busy === "checking" ? "Working out your invoice…" : "Check my invoice")
          : busy === "sending" ? "Sending your invoice…" : busy === "photos" ? "Sending your photos…" : "Send invoice to TileSpec"}</button>
      </fieldset>
      {!working && error && stage === "edit" && <p className={css.error} role="alert">{error}</p>}
    </form>
  </>;
}
