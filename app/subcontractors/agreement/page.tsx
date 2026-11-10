import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPortal, portalClient } from "@/lib/subcontractors/portal";
import { agreementSections, type PortalAgreement } from "@/lib/subcontractors/claim";
import { SignAgreementForm } from "@/components/subcontractors/portal-form";
import { signAgreementAction } from "../actions";
import css from "@/components/subcontractors/portal.module.css";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(iso));

export default async function AgreementPage() {
  const portal = await loadPortal();
  if ("problem" in portal) redirect(portal.problem === "none" ? "/subcontractors" : `/subcontractors?link=${portal.problem}`);
  const publicClient = portalClient();
  const { data, error } = await publicClient.rpc("portal_agreement", { p_token: portal.token });
  const agreement = error ? null : (data as PortalAgreement | null);
  const back = <p className={css.eyebrow}><Link href="/subcontractors">← Back</Link></p>;
  if (error) return <>{back}<p className={css.error} role="alert">Your agreement cannot be opened at the moment. Please try again in a few minutes.</p></>;
  if (!agreement) return <>{back}<h1 className={css.title}>Subcontractor agreement</h1>
    <p className={`${css.notice} ${css.attention}`}>TileSPEC has not issued your agreement yet. Call the office if you are waiting for it.</p></>;
  const subcontractor = agreement.parties?.subcontractor ?? {}, contractor = agreement.parties?.contractor ?? {};
  const signed = agreement.status === "signed";
  return <>
    <div>{back}<h1 className={css.title}>Subcontractor agreement</h1>
      <p className={css.lead}>{signed ? "You have signed this agreement. Here is your copy." : "Please read all of it, then sign at the bottom. Ask the office about anything you are unsure of before you sign."}</p></div>
    {signed && agreement.signed_at && <p className={css.success} role="status">Signed by {agreement.signer_name} on {when(agreement.signed_at)}.</p>}
    <section className={css.panel}>
      <dl className={css.facts}>
        <dt>Contractor</dt><dd>{contractor.name}{contractor.address ? `, ${contractor.address}` : ""}</dd>
        <dt>Subcontractor</dt><dd>{subcontractor.name}{subcontractor.address ? `, ${subcontractor.address}` : ""}</dd>
        <dt>Agreement</dt><dd>{agreement.title}</dd>
        <dt>Version</dt><dd>{agreement.version_label} · reference {agreement.reference}</dd>
      </dl>
      <a className={`${css.secondary} ${css.small}`} href="/subcontractors/agreement/pdf" target="_blank" rel="noopener noreferrer">Open as a PDF</a>
    </section>
    <section className={css.agreement} aria-label="Agreement text" tabIndex={0}>
      {agreementSections(agreement.body).map((section, index) => <div key={index}>
        {section.heading && <h3>{section.heading}</h3>}
        {section.paragraphs.map((paragraph, i) => <p key={i} style={{ marginTop: 8 }}>{paragraph}</p>)}
      </div>)}
    </section>
    {signed ? <Link className={css.button} href="/subcontractors">Back to my invoices</Link>
      : <section className={css.panel} aria-label="Sign">
        <h2>Sign the agreement</h2>
        <p className={css.muted}>Signing here is a legal signature. The time, this device and the exact version of the text are recorded with it.</p>
        <SignAgreementForm action={signAgreementAction} agreementId={agreement.id} bodySha={agreement.body_sha256} defaultName={portal.session.subcontractor.issued_to} />
        <Link className={css.linkButton} href="/subcontractors">I will do this later</Link>
      </section>}
  </>;
}
