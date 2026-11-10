import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { GangInvoiceForm, type GangJob } from "@/components/gang/invoice-form";
import { submitGangInvoiceAction } from "../actions";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

type Mine = { id: string; reference: string; status: string; contract_id: string; team_id: string; invoice_number: string | null; lines: { work_area_id: string; unit: string; claimed: number }[] };

export default async function SendGangInvoice({ searchParams }: { searchParams: Promise<{ replaces?: string }> }) {
  const { supabase, member } = await requireActor();
  if (!["lead_installer", "subcontract_installer"].includes(member.role)) redirect("/admin/gang");
  const { replaces } = await searchParams;
  const [jobs, invoices] = await Promise.all([supabase.rpc("my_gang_jobs"), replaces ? supabase.rpc("my_gang_invoices") : Promise.resolve({ data: [], error: null })]);
  checkDatabase(jobs.error); checkDatabase(invoices.error);
  const list = (jobs.data ?? []) as GangJob[];
  const original = replaces ? ((invoices.data ?? []) as Mine[]).find(i => i.id === replaces && i.status === "returned") : undefined;
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Gang invoice</p><h1 className={styles.title}>{original ? `Correct ${original.reference}` : "Send an invoice"}</h1>
      <p className={styles.description}>Choose the job, add your invoice, and say how much you did in each area.</p></div>
      <Link href="/admin/gang">Back to your invoices</Link></div>
    {replaces && !original && <p className={styles.warning}>That invoice is not waiting for correction. Go back to your invoices to see where it is.</p>}
    {list.length === 0 ? <p className={styles.empty}>Your gang is not set up on a job yet. Ask the office to add your gang to the job.</p>
      : <section className={styles.panel}>
        <GangInvoiceForm action={submitGangInvoiceAction} jobs={list} initial={original ? {
          job: `${original.contract_id}:${original.team_id}`, lines: original.lines, invoice_number: original.invoice_number ?? undefined,
          replaces: { id: original.id, reference: original.reference },
        } : undefined} />
      </section>}
  </>;
}
