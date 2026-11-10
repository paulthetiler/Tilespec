"use client";
import { useState } from "react";
import styles from "@/app/admin/admin.module.css";
import css from "./gang.module.css";

type Props = {
  lineId: string; label: string; unit: string; unitText: string; claimed: number;
  passed: number; correction: number; approved: number; verifiedElsewhere: number; available: number;
};
const n = (value: string) => { const x = Number(value.replace(/,/g, "")); return Number.isFinite(x) && x > 0 ? x : 0; };
const fmt = (x: number) => x.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/**
 * One claimed line. Already-recorded progress is shown first so nothing is measured twice; new
 * measured work (passed or needing correction) is added to the site record; the verified
 * quantity defaults to what can honestly be verified and the difference is shown as it changes.
 */
export function VerifyLine(p: Props) {
  const [passed, setPassed] = useState("");
  const [correction, setCorrection] = useState("");
  const [verified, setVerified] = useState(String(Math.max(0, Math.min(p.claimed, p.available))));
  const [touched, setTouched] = useState(false);
  const canVerify = Math.max(0, p.available + n(passed));
  const suggested = Math.min(p.claimed, canVerify);
  const shown = touched ? verified : String(suggested);
  const difference = p.claimed - n(shown);
  return <div className={css.lineBox}>
    <input type="hidden" name="line_id" value={p.lineId} />
    <input type="hidden" name={`label_${p.lineId}`} value={p.label} />
    <h3>{p.label}</h3>
    <div className={css.ledger} aria-label="Already recorded for this gang and area">
      <span>Measured and passed so far: <strong>{fmt(p.passed)} {p.unitText}</strong></span>
      <span>Already approved for payment: <strong>{fmt(p.approved)} {p.unitText}</strong></span>
      {p.verifiedElsewhere > 0 && <span>On other invoices with the office: <strong>{fmt(p.verifiedElsewhere)} {p.unitText}</strong></span>}
      {p.correction > 0 && <span>Waiting for correction: <strong>{fmt(p.correction)} {p.unitText}</strong></span>}
      <span>Available to verify: <strong>{fmt(Math.max(0, p.available))} {p.unitText}</strong></span>
    </div>
    <div className={css.inputs}>
      <label className={styles.field}>New work measured now — passed ({p.unitText})
        <input name={`passed_${p.lineId}`} inputMode="decimal" autoComplete="off" value={passed} onChange={e => setPassed(e.target.value)} placeholder="Only work not yet recorded" />
      </label>
      <label className={styles.field}>New work measured now — needs correction ({p.unitText})
        <input name={`correction_${p.lineId}`} inputMode="decimal" autoComplete="off" value={correction} onChange={e => setCorrection(e.target.value)} placeholder="Not passed for payment" />
      </label>
      <label className={styles.field}>Verified for this invoice ({p.unitText})
        <input name={`verified_${p.lineId}`} inputMode="decimal" autoComplete="off" required value={shown}
          onChange={e => { setTouched(true); setVerified(e.target.value); }} />
      </label>
    </div>
    <table className={css.compare}><tbody>
      <tr><th>Gang claimed</th><td className={css.num}>{fmt(p.claimed)} {p.unitText}</td></tr>
      <tr><th>Supervisor verified</th><td className={css.num}>{fmt(n(shown))} {p.unitText}</td></tr>
      <tr><th>Difference</th><td className={`${css.num} ${difference !== 0 ? css.difference : ""}`}>{fmt(difference)} {p.unitText}</td></tr>
    </tbody></table>
    {n(shown) > canVerify && <p className={styles.warning}>You can verify at most {fmt(canVerify)} {p.unitText}: record the new measured work first.</p>}
    <label className={styles.field}>Note for this area (optional)<input name={`note_${p.lineId}`} maxLength={1000} placeholder="Exact location, measurements, anything to check" /></label>
  </div>;
}

export function WorkmanshipChoice() {
  const [value, setValue] = useState("satisfactory");
  return <>
    <fieldset className={styles.plainFieldset}>
      <legend><strong>Workmanship</strong></legend>
      <label className={styles.checkboxRow}><input type="radio" name="workmanship" value="satisfactory" checked={value === "satisfactory"} onChange={() => setValue("satisfactory")} /> Checked and passed</label>
      <label className={styles.checkboxRow}><input type="radio" name="workmanship" value="correction_needed" checked={value === "correction_needed"} onChange={() => setValue("correction_needed")} /> Correction needed</label>
    </fieldset>
    {value === "correction_needed" && <label className={styles.field}>What needs correcting<textarea name="correction_note" rows={3} maxLength={2000} required placeholder="Where, what is wrong and what the gang must do" /></label>}
  </>;
}
