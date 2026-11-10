import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { loadPortal } from "@/lib/subcontractors/portal";
import css from "@/components/subcontractors/portal.module.css";

const pounds = (value: number | null) => value === null ? "" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value));
const day = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "Europe/London" }).format(new Date(iso)) : "";

export default async function Sent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ photos?: string }> }) {
  const portal = await loadPortal();
  if ("problem" in portal) redirect("/subcontractors");
  const { id } = await params;
  const invoice = portal.session.invoices.find(i => i.id === id);
  if (!invoice) notFound();
  const missed = Number((await searchParams).photos) || 0;
  return <>
    <div className={css.success} role="status" style={{ display: "grid", gap: 8 }}>
      <CheckCircle2 size={40} aria-hidden="true" />
      <h1 className={css.title}>Invoice sent</h1>
      <p>TileSPEC has your invoice. Your reference is <strong>{invoice.reference}</strong>.</p>
    </div>
    {missed > 0 && <p className={`${css.notice} ${css.attention}`}>{missed} photo{missed === 1 ? "" : "s"} did not upload. Your invoice was still sent; show the supervisor the work on site.</p>}
    <section className={css.panel}>
      <h2>Your copy</h2>
      <dl className={css.facts}>
        <dt>Submission reference</dt><dd>{invoice.reference}</dd>
        <dt>Invoice number</dt><dd>{invoice.invoice_number}</dd>
        <dt>Job</dt><dd>{invoice.job}</dd>
        <dt>Invoice amount</dt><dd>{pounds(invoice.invoice_total)}</dd>
        <dt>Payment date</dt><dd>{day(invoice.payment_due_on)}</dd>
      </dl>
      {invoice.source === "generated" ? <a className={css.button} href={`/subcontractors/invoices/${invoice.id}/pdf?download=1`}>Download my invoice (PDF)</a>
        : <p className={css.muted}>Keep your own copy of the invoice you uploaded. Take a screenshot of this page for your reference.</p>}
      <p className={css.muted}>You can open this again at any time from your link.</p>
    </section>
    <section className={css.panel}>
      <h2>What happens next</h2>
      <ol style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 6 }}>
        <li>The site supervisor checks the work and the quantities.</li>
        <li>The TileSPEC office reviews and approves the payment. If anything is different from your invoice, they will tell you why.</li>
        <li>Payment is made on the payment date, less CIS tax and any agreed retention.</li>
      </ol>
      <p className={css.muted}>Sending an invoice is not a payment approval.</p>
    </section>
    <Link className={css.secondary} href="/subcontractors">Back to my invoices</Link>
  </>;
}
