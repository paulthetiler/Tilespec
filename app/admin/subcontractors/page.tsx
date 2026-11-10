import Link from "next/link";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { londonDate } from "@/lib/operations/planning";
import { cisLabels } from "@/lib/subcontractors/claim";
import { calendarDate, money } from "@/components/operations/format";
import styles from "../admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";
type Commercial = { invoice_id: string; approved_amount: number | null; net_payable: number | null; retention_amount: number | null; payment_due_on: string; agreed_payment_on: string | null; paid_on: string | null };

// One place for every subcontractor: where each is in onboarding, what is waiting and what is owed.
export default async function Subcontractors() {
  const { supabase } = await requireFinancialActor();
  const now = new Date().toISOString(), today = londonDate();
  const [teams, profiles, agreements, links, subcontracts, invoices, commercials, releases, versions] = await Promise.all([
    supabase.from("teams").select("id,name,kind,active").neq("kind", "direct_team").order("name"),
    supabase.from("subcontractor_tax_profiles").select("team_id,legal_name,cis_status,vat_registered"),
    supabase.from("subcontractor_agreements").select("team_id,status,signed_at,issued_at"),
    supabase.from("subcontractor_portal_links").select("team_id,expires_at,revoked_at"),
    supabase.from("gang_subcontracts").select("id,team_id,active"),
    supabase.from("gang_invoices").select("id,team_id,status"),
    supabase.from("gang_invoice_commercials").select("invoice_id,approved_amount,net_payable,retention_amount,payment_due_on,agreed_payment_on,paid_on"),
    supabase.from("gang_retention_releases").select("team_id,amount,voided_at"),
    supabase.from("subcontractor_agreement_versions").select("id,status"),
  ]);
  [teams, profiles, agreements, links, subcontracts, invoices, commercials, releases, versions].forEach(r => checkDatabase(r.error));
  const moneyFor = new Map(((commercials.data ?? []) as Commercial[]).map(c => [c.invoice_id, c]));
  const published = (versions.data ?? []).some(v => v.status === "published");
  const rows = (teams.data ?? []).map(team => {
    const profile = (profiles.data ?? []).find(p => p.team_id === team.id);
    const mine = (agreements.data ?? []).filter(a => a.team_id === team.id);
    const signed = mine.some(a => a.status === "signed"), issued = mine.some(a => a.status === "issued");
    const live = (links.data ?? []).filter(l => l.team_id === team.id && !l.revoked_at && l.expires_at > now).length;
    const jobs = (subcontracts.data ?? []).filter(s => s.team_id === team.id && s.active).length;
    const list = (invoices.data ?? []).filter(i => i.team_id === team.id);
    const approved = list.filter(i => i.status === "approved").map(i => moneyFor.get(i.id)).filter(Boolean) as Commercial[];
    const held = list.filter(i => ["approved", "paid"].includes(i.status)).reduce((t, i) => t + Number(moneyFor.get(i.id)?.retention_amount ?? 0), 0)
      - (releases.data ?? []).filter(r => r.team_id === team.id && !r.voided_at).reduce((t, r) => t + Number(r.amount), 0);
    const due = approved.map(c => c.agreed_payment_on ?? c.payment_due_on).sort()[0];
    return { team, profile, signed, issued, live, jobs, held, due,
      waiting: list.filter(i => i.status === "with_office").length, onSite: list.filter(i => i.status === "awaiting_check").length,
      disputed: list.filter(i => ["query_gang", "returned"].includes(i.status)).length,
      outstanding: approved.reduce((t, c) => t + Number(c.net_payable ?? c.approved_amount ?? 0), 0),
      next: !profile ? "Record business and tax details" : profile.cis_status === "unverified" ? "Verify CIS status with HMRC" : !signed && !issued ? "Issue the agreement"
        : !signed ? (live ? "Waiting for the subcontractor to sign" : "Send a link so they can sign") : !jobs ? "Put them on a job with rates" : !live ? "Send a link so they can invoice" : null };
  });
  const badge = (ok: boolean, yes: string, no: string) => <span className={`${css.status} ${ok ? css.good : css.attention}`}>{ok ? yes : no}</span>;
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Money</p><h1 className={styles.title}>Subcontractors</h1>
      <p className={styles.description}>Onboarding, agreements, portal links, rates, invoices, CIS, retention and payments for every subcontractor, in one place. Subcontractors send invoices from their personal link at <code>/subcontractors</code>; nothing is approved or paid automatically.</p></div>
      <div className={styles.actions}><Link className={styles.secondaryButton} href="/admin/subcontractors/agreement">Agreement versions</Link>
        <Link className={styles.secondaryButton} href="/admin/gang-invoices">Invoice approvals</Link></div></div>
    {!published && <p className={styles.warning}><strong>No subcontractor agreement is published yet.</strong> The standard draft must be reviewed by your solicitor before use. The owner then records the review and publishes it in <Link href="/admin/subcontractors/agreement">Agreement versions</Link>. Until then no agreement can be issued, and subcontractors cannot invoice through the portal.</p>}
    {rows.length === 0 ? <p className={styles.empty}>No subcontractors or gangs are recorded yet. Add them in <Link href="/admin/workforce">Workforce</Link>.</p>
      : <ul className={css.cards}>{rows.map(r => <li key={r.team.id}><Link className={css.card} href={`/admin/subcontractors/${r.team.id}`}>
        <div className={css.cardHead}><h3>{r.profile?.legal_name ?? r.team.name}{r.profile && r.profile.legal_name !== r.team.name ? ` · ${r.team.name}` : ""}{r.team.active ? "" : " (inactive)"}</h3>
          <span>{badge(r.signed, "Agreement signed", r.issued ? "Agreement not signed" : "No agreement")} {badge(r.live > 0, "Link live", "No live link")}</span></div>
        {r.next && <p className={styles.warning} style={{ margin: "6px 0" }}><strong>Next:</strong> {r.next}</p>}
        <dl className={css.facts}>
          <dt>CIS</dt><dd>{r.profile ? cisLabels[r.profile.cis_status] : "No tax details recorded"}{r.profile?.vat_registered ? " · VAT registered" : ""}</dd>
          <dt>Jobs</dt><dd>{r.jobs || "None"}</dd>
          {(r.onSite > 0 || r.waiting > 0 || r.disputed > 0) && <><dt>Invoices</dt><dd>{[r.onSite && `${r.onSite} being checked on site`, r.waiting && `${r.waiting} ready to approve`, r.disputed && `${r.disputed} queried or returned`].filter(Boolean).join(" · ")}</dd></>}
          {r.outstanding > 0 && <><dt>Approved, to pay</dt><dd className={css.money}>{money(r.outstanding)}{r.due ? ` · due ${calendarDate(r.due)}${r.due < today ? " — overdue" : ""}` : ""}</dd></>}
          {r.held > 0 && <><dt>Retention held</dt><dd className={css.money}>{money(r.held)}</dd></>}
        </dl>
      </Link></li>)}</ul>}
  </>;
}
