import Link from "next/link";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { gangStatusLabel, gangStatusTone, quantityText } from "@/lib/operations/gang-invoices";
import { londonDate } from "@/lib/operations/planning";
import { calendarDate, money } from "@/components/operations/format";
import styles from "../admin.module.css";
import css from "@/components/gang/gang.module.css";

export const dynamic = "force-dynamic";

type Invoice = { id: string; reference: string; contract_id: string; team_id: string; status: string; workmanship: string | null; submitted_at: string; routed_to: string };
type Line = { invoice_id: string; unit: string; claimed_quantity: number; verified_quantity: number | null; approved_quantity: number | null };
type Money = { invoice_id: string; invoice_number: string | null; invoice_total: number | null; payment_due_on: string; agreed_payment_on: string | null; approved_amount: number | null; paid_on: string | null; paid_amount: number | null };

export default async function GangInvoiceQueue() {
  const { supabase } = await requireFinancialActor();
  const today = londonDate();
  const [requests, invoices, commercials, teams, contracts, assignments] = await Promise.all([
    supabase.from("gang_verification_requests").select("invoice_id,contract_id,routed_to,created_at").is("resolved_at", null),
    supabase.from("gang_invoices").select("id,reference,contract_id,team_id,status,workmanship,submitted_at,routed_to").order("submitted_at", { ascending: false }).limit(300),
    supabase.from("gang_invoice_commercials").select("invoice_id,invoice_number,invoice_total,payment_due_on,agreed_payment_on,approved_amount,paid_on,paid_amount"),
    supabase.from("teams").select("id,name"),
    supabase.from("contracts").select("id,reference,name"),
    supabase.from("contract_assignments").select("contract_id,valid_from,valid_until,organisation_members!inner(role,active)"),
  ]);
  [requests, invoices, commercials, teams, contracts].forEach(r => checkDatabase(r.error));
  const list = (invoices.data ?? []) as Invoice[];
  const ids = list.map(i => i.id);
  const lines = ids.length ? await supabase.from("gang_invoice_lines").select("invoice_id,unit,claimed_quantity,verified_quantity,approved_quantity").in("invoice_id", ids) : { data: [], error: null };
  checkDatabase(lines.error);
  const teamName = new Map((teams.data ?? []).map(t => [t.id, t.name]));
  const job = new Map((contracts.data ?? []).map(c => [c.id, `${c.name} (${c.reference})`]));
  const moneyFor = new Map(((commercials.data ?? []) as Money[]).map(m => [m.invoice_id, m]));
  const supervised = new Set((assignments.data ?? []).filter(a => {
    const m = a.organisation_members as unknown as { role: string; active: boolean } | null;
    return m?.role === "supervisor" && m.active && a.valid_from <= today && (!a.valid_until || a.valid_until >= today);
  }).map(a => a.contract_id));
  const open = new Map((requests.data ?? []).map(r => [r.invoice_id, r]));
  const linesOf = (id: string) => ((lines.data ?? []) as Line[]).filter(l => l.invoice_id === id);
  const sum = (id: string, key: "claimed_quantity" | "verified_quantity" | "approved_quantity") => {
    const ls = linesOf(id); const units = [...new Set(ls.map(l => l.unit))];
    return units.map(u => quantityText(ls.filter(l => l.unit === u).reduce((t, l) => t + Number(l[key] ?? 0), 0), u)).join(" + ");
  };
  const difference = (id: string) => linesOf(id).some(l => l.verified_quantity !== null && Number(l.verified_quantity) !== Number(l.claimed_quantity));

  const needsSupervisor = list.filter(i => open.has(i.id) && !supervised.has(i.contract_id));
  const awaitingSite = list.filter(i => open.has(i.id) && supervised.has(i.contract_id));
  const ready = list.filter(i => i.status === "with_office");
  const gang = list.filter(i => i.status === "query_gang" || i.status === "returned");
  const toPay = list.filter(i => i.status === "approved").sort((a, b) => {
    const da = moneyFor.get(a.id), db = moneyFor.get(b.id);
    return (da?.agreed_payment_on ?? da?.payment_due_on ?? "").localeCompare(db?.agreed_payment_on ?? db?.payment_due_on ?? "");
  });
  const closed = list.filter(i => ["paid", "rejected", "cancelled", "superseded"].includes(i.status)).slice(0, 40);

  const row = (i: Invoice, extra?: React.ReactNode) => {
    const m = moneyFor.get(i.id);
    const due = m?.agreed_payment_on ?? m?.payment_due_on;
    return <li key={i.id}><Link className={css.card} href={`/admin/gang-invoices/${i.id}`}>
      <div className={css.cardHead}><h3>{teamName.get(i.team_id) ?? "Gang"} · {i.reference}{m?.invoice_number ? ` · ${m.invoice_number}` : ""}</h3>
        <span className={`${css.status} ${css[gangStatusTone(i.status, i.workmanship)]}`}>{gangStatusLabel(i.status, i.workmanship)}</span></div>
      <p className={styles.muted} style={{ margin: 0 }}>{job.get(i.contract_id) ?? "Job"} · sent {calendarDate(i.submitted_at)}</p>
      <dl className={css.facts}>
        <dt>Claimed</dt><dd>{sum(i.id, "claimed_quantity")}</dd>
        {linesOf(i.id).some(l => l.verified_quantity !== null) && <><dt>Verified</dt><dd className={difference(i.id) ? css.difference : ""}>{sum(i.id, "verified_quantity")}{difference(i.id) ? " (differs from claim)" : ""}</dd></>}
        {m?.invoice_total != null && <><dt>Invoice total</dt><dd className={css.money}>{money(Number(m.invoice_total))}</dd></>}
        {m?.approved_amount != null && <><dt>Approved</dt><dd className={css.money}>{money(Number(m.approved_amount))}</dd></>}
        {due && !["rejected", "cancelled", "superseded", "paid"].includes(i.status) && <><dt>Payment due</dt><dd>{calendarDate(due)}{due < today ? " — overdue" : ""}</dd></>}
        {m?.paid_on && <><dt>Paid</dt><dd>{money(Number(m.paid_amount))} on {calendarDate(m.paid_on)}</dd></>}
      </dl>
      {extra}
    </Link></li>;
  };
  const section = (title: string, rows: Invoice[], empty: string, extra?: (i: Invoice) => React.ReactNode) => <section>
    <h2 className={css.sectionTitle}>{title}{rows.length > 0 && <span className={css.count}>{rows.length}</span>}</h2>
    {rows.length ? <ul className={css.cards}>{rows.map(i => row(i, extra?.(i)))}</ul> : <p className={styles.muted}>{empty}</p>}
  </section>;

  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Money</p><h1 className={styles.title}>Gang invoices</h1>
      <p className={styles.description}>Gangs claim the work, supervisors verify it, you approve the money. Nothing is paid automatically and no bank payment is made from here.</p></div>
      <div className={styles.actions}><Link className={styles.secondaryButton} href="/admin/subcontractors">Subcontractors</Link>
        <Link className={styles.secondaryButton} href="/admin/gang-invoices/setup">Gangs on jobs, terms and rates</Link></div></div>
    {section("Needs a supervisor", needsSupervisor, "Every waiting check has a supervisor.", i => <p className={styles.warning} style={{ margin: "10px 0 0" }}>
      No supervisor is assigned to this job. Assign one on the job&apos;s team page and it will appear on their site, or check it yourself.</p>)}
    {section("Ready to approve", ready, "Nothing checked and waiting for approval.")}
    {section("Approved — to pay", toPay, "No approved invoices waiting for payment.")}
    {section("Waiting on the gang", gang, "No questions or returned invoices outstanding.")}
    {section("Being checked on site", awaitingSite, "No invoices waiting for a site check.")}
    <details className={styles.panel}><summary><strong>Paid and closed ({closed.length})</strong></summary>
      <ul className={css.cards}>{closed.map(i => row(i))}</ul></details>
    <p className={styles.muted}>Paying less than claimed? Under the agreed subcontract terms and the Construction Act a pay less notice may be needed before the final date for payment. Disputed quantities are never deducted automatically.</p>
  </>;
}
