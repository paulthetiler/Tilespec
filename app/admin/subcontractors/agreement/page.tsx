import Link from "next/link";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { OperationsForm } from "@/components/operations/operations-form";
import { AGREEMENT_TEMPLATE_BODY, AGREEMENT_TEMPLATE_TITLE, AGREEMENT_TEMPLATE_VERSION } from "@/lib/subcontractors/agreement-template";
import { agreementSections } from "@/lib/subcontractors/claim";
import { calendarDate, eventDate } from "@/components/operations/format";
import { createAgreementVersionAction, publishAgreementVersionAction, withdrawAgreementVersionAction } from "../actions";
import styles from "../../admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";

export default async function AgreementVersions() {
  const { supabase, member } = await requireFinancialActor();
  const [versions, agreements] = await Promise.all([
    supabase.from("subcontractor_agreement_versions").select("*").order("created_at", { ascending: false }),
    supabase.from("subcontractor_agreements").select("version_id,status"),
  ]);
  checkDatabase(versions.error); checkDatabase(agreements.error);
  const list = versions.data ?? [];
  const used = (id: string) => (agreements.data ?? []).filter(a => a.version_id === id);
  const taken = new Set(list.map(v => v.version_label));
  const suggested = taken.has(AGREEMENT_TEMPLATE_VERSION) ? "" : AGREEMENT_TEMPLATE_VERSION;
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Subcontractors</p><h1 className={styles.title}>Agreement versions</h1>
      <p className={styles.description}>The exact text of each version is fixed once saved. A subcontractor signs a copy of one published version; later versions never change what they signed.</p></div>
      <Link href="/admin/subcontractors">Back to subcontractors</Link></div>
    <p className={styles.warning}><strong>Legal review is required before use.</strong> The standard draft is written in ordinary commercial contract language and preserves Construction Act payment rights, but it has not been reviewed by a solicitor. Have it reviewed (including employment status, CIS, VAT self-billing, insurance levels and retention terms for your business). Only the owner can publish, and only by recording who reviewed it and when.</p>

    {list.length === 0 ? <p className={styles.empty}>No versions yet. Save the standard draft below, then have it reviewed.</p>
      : <ul className={css.cards}>{list.map(v => {
        const copies = used(v.id);
        return <li key={v.id} className={css.card}>
          <div className={css.cardHead}><h3>{v.title} · version {v.version_label}</h3>
            <span className={`${css.status} ${v.status === "published" ? css.good : v.status === "draft" ? css.attention : css.closed}`}>{v.status === "published" ? "Published" : v.status === "draft" ? "Draft — legal review needed" : "Withdrawn"}</span></div>
          <dl className={css.facts}>
            <dt>Saved</dt><dd>{eventDate(v.created_at)} by {v.created_by_name}</dd>
            {v.legal_reviewed_on && <><dt>Legal review</dt><dd>{v.legal_reviewed_by} on {calendarDate(v.legal_reviewed_on)}{v.legal_review_note ? ` · ${v.legal_review_note}` : ""}</dd></>}
            {v.published_at && <><dt>Published</dt><dd>{eventDate(v.published_at)}</dd></>}
            <dt>Issued</dt><dd>{copies.length} ({copies.filter(c => c.status === "signed").length} signed)</dd>
            <dt>Text fingerprint</dt><dd><code>{v.body_sha256.slice(0, 16)}…</code></dd>
          </dl>
          <details><summary>Read this version</summary>
            <div className={styles.panel}>{agreementSections(v.body).map((s, i) => <div key={i}>{s.heading && <h4 style={{ margin: "12px 0 4px" }}>{s.heading}</h4>}{s.paragraphs.map((p, j) => <p key={j} style={{ margin: "6px 0" }}>{p}</p>)}</div>)}</div>
          </details>
          {v.status === "draft" && (member.role === "owner" ? <details><summary>Record legal review and publish</summary>
            <OperationsForm action={publishAgreementVersionAction} submitLabel="Publish this version" compact>
              <input type="hidden" name="version_id" value={v.id} />
              <div className={css.inputs}>
                <label className={styles.field}>Reviewed by (solicitor and firm)<input name="legal_reviewed_by" required minLength={2} maxLength={200} /></label>
                <label className={styles.field}>Date of review<input name="legal_reviewed_on" type="date" required max={londonDate()} /></label>
              </div>
              <label className={styles.field}>Note (optional)<input name="legal_review_note" maxLength={2000} placeholder="For example: reviewed with amendments to clause 6" /></label>
              <label className={styles.checkboxRow}><input type="checkbox" name="confirmed" required /> This exact text has been legally reviewed and I approve it for use.</label>
            </OperationsForm></details>
            : <p className={styles.muted}>Only the owner can record the legal review and publish.</p>)}
          {v.status === "published" && member.role === "owner" && <details><summary>Withdraw this version</summary>
            <OperationsForm action={withdrawAgreementVersionAction} submitLabel="Withdraw version" compact>
              <input type="hidden" name="version_id" value={v.id} />
              <p className={styles.muted}>It can no longer be issued. Agreements already signed on it stay in force.</p>
            </OperationsForm></details>}
        </li>;
      })}</ul>}

    <details className={styles.panel} open={list.length === 0}><summary><strong>Save a new draft version</strong></summary>
      <p className={styles.muted}>Start from the standard draft, or paste the text your solicitor returns. A line starting with <code>## </code> is a clause heading; leave a blank line between paragraphs.</p>
      <OperationsForm action={createAgreementVersionAction} submitLabel="Save as a draft">
        <div className={css.inputs}>
          <label className={styles.field}>Version label<input name="version_label" required maxLength={40} defaultValue={suggested} placeholder="For example: 1.0" /></label>
          <label className={styles.field}>Title<input name="title" required maxLength={200} defaultValue={AGREEMENT_TEMPLATE_TITLE} /></label>
        </div>
        <label className={styles.field}>Agreement text<textarea name="body" rows={24} required minLength={500} maxLength={120000} defaultValue={AGREEMENT_TEMPLATE_BODY} /></label>
      </OperationsForm>
    </details>
  </>;
}
