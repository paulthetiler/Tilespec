import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortal } from "@/lib/subcontractors/portal";
import { londonDate } from "@/lib/operations/planning";
import { ClaimForm } from "@/components/subcontractors/claim-form";
import { addPhotoAction, previewInvoiceAction, submitInvoiceAction } from "@/app/subcontractors/actions";
import css from "@/components/subcontractors/portal.module.css";

import type { ClaimMode } from "@/lib/subcontractors/claim";

/** Creating an invoice from agreed rates, or uploading an existing one: the same page with one difference. */
export async function ClaimPage({ mode: MODE, searchParams }: { mode: ClaimMode; searchParams: Promise<{ replaces?: string }> }) {
  const portal = await loadPortal();
  if ("problem" in portal) redirect(portal.problem === "none" ? "/subcontractors" : `/subcontractors?link=${portal.problem}`);
  const { session } = portal;
  const { replaces } = await searchParams;
  const original = replaces ? session.invoices.find(i => i.id === replaces && i.status === "returned") : undefined;
  const generated = MODE === "generated";
  const blocked = !session.can_invoice ? "Please read and sign your subcontractor agreement first."
    : session.jobs.length === 0 ? "You are not set up on a job yet. Ask the TileSPEC office to add you to your job."
    : generated && !session.generator.allowed ? session.generator.reason : null;
  return <>
    <div><p className={css.eyebrow}><Link href="/subcontractors">← Back</Link></p>
      <h1 className={css.title}>{original ? `Correct ${original.invoice_number ?? original.reference}` : generated ? "Generate an invoice" : "Upload an invoice"}</h1>
      <p className={css.lead}>{generated ? "Tell us what you have finished. We work out the invoice from your agreed rates and make the PDF for you."
        : "Send the invoice you have already made, and tell us what it is for."}</p></div>
    {replaces && !original && <p className={css.error} role="alert">That invoice is not waiting to be corrected. Go back to see where it is.</p>}
    {blocked ? <div className={`${css.notice} ${css.attention}`}><strong>{blocked}</strong>
        {!session.can_invoice ? <Link className={css.button} href="/subcontractors/agreement">Open my agreement</Link>
          : generated && session.jobs.length > 0 ? <Link className={css.button} href="/subcontractors/upload">Upload my own invoice instead</Link> : null}</div>
      : <ClaimForm mode={MODE} jobs={session.jobs} nextNumber={session.next_invoice_number} today={londonDate()}
          previewAction={previewInvoiceAction} submitAction={submitInvoiceAction} photoAction={addPhotoAction}
          replaces={original ? { id: original.id, reference: original.reference, contract_id: original.contract_id, invoice_number: original.invoice_number, lines: original.lines } : undefined} />}
  </>;
}
