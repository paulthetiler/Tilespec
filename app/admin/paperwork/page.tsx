import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, canReadFinancial, requireActor } from "@/lib/auth";
import { checkDatabase, contractsFor } from "@/lib/operations/data";
import { flagEnabled } from "@/lib/operations/next-actions/flags";
import { eventDate } from "@/components/operations/format";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 40;
type SavedDocument = {
  id: string; contract_id: string; document_reference: string; revision: number;
  title: string; classification: "operational" | "commercial";
  uploaded_at: string | null; created_at: string;
  contract: { id: string; reference: string; name: string };
};

export default async function PaperworkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member) || (!flagEnabled("nextActions", member.role) && !flagEnabled("roleShell", member.role))) notFound();
  const query = await searchParams;
  const contractId = typeof query.contract_id === "string" ? query.contract_id : "";
  if (contractId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contractId)) notFound();
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Math.min(Number(query.page), 100000) : 0;
  const contracts = await contractsFor(supabase);
  if (contractId && !contracts.some(contract => contract.id === contractId)) notFound();
  const financial = canReadFinancial(member);
  let documents = supabase.from("document_revisions")
    .select("id,contract_id,document_reference,revision,title,classification,uploaded_at,created_at,contract:contracts!inner(id,reference,name)", { count: "exact" })
    .order("created_at", { ascending: false }).order("id");
  if (contractId) documents = documents.eq("contract_id", contractId);
  // Keep commercial titles and references out of the non-financial response, in addition to database RLS.
  if (!financial) documents = documents.eq("classification", "operational");
  const result = await documents.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
  checkDatabase(result.error);
  const rows = (result.data ?? []) as unknown as SavedDocument[];
  const total = result.count ?? 0;
  const scope = contractId ? `?contract_id=${contractId}` : "";
  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (contractId) params.set("contract_id", contractId);
    params.set("page", String(next));
    return `/admin/paperwork?${params}`;
  };
  return <>
    <div className={styles.pageHeader}><div><h1 className={styles.title}>Paperwork</h1><p className={styles.description}>Saved job documents, inspection requests and site messages.</p></div></div>
    <nav className={styles.rowActions} aria-label="Paperwork tools">
      <Link className={styles.secondaryButton} href={`/admin/messages${scope}`}>Messages and handovers</Link>
      <Link className={styles.secondaryButton} href={`/admin/quality${scope}`}>Quality checks</Link>
      <Link className={styles.secondaryButton} href="/admin/tenders">Tender enquiries and documents</Link>
    </nav>
    <form method="get" className={styles.search} style={{ marginTop: 20 }}>
      <label>Job<select name="contract_id" defaultValue={contractId}><option value="">All authorised jobs</option>{contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.reference} · {contract.name}</option>)}</select></label>
      <button className={styles.secondaryButton} type="submit">Show paperwork</button>
    </form>
    <section className={styles.panel} aria-labelledby="saved-documents-heading">
      <h2 id="saved-documents-heading">Saved job documents</h2>
      <p className={styles.small}>{total} authorised revision{total === 1 ? "" : "s"} · Page {page + 1}. {financial ? "Commercial documents remain restricted to authorised users." : "Operational documents only."}</p>
      <div className={styles.documentList}>{rows.map(document => <article className={styles.documentRow} key={document.id}>
        <div><p className={styles.eyebrow}>{document.contract.reference} · {document.contract.name}</p><h3>{document.title}</h3>
          <p>{document.document_reference} · revision {document.revision}</p>
          <p className={styles.small}>{document.classification === "commercial" ? "Commercial · restricted" : "Operational"} · {eventDate(document.created_at)}</p>
          {!document.uploaded_at && <p className={styles.warningBadge}>Upload pending — the file is not available yet</p>}
        </div>
        <div className={styles.rowActions}>
          {document.uploaded_at && <a className={styles.secondaryButton} href={`/admin/documents/${document.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${document.title}, revision ${document.revision} in a new tab`}>Open file</a>}
          <Link className={styles.secondaryButton} href={`/admin/contracts/${document.contract_id}#documents`}>{document.uploaded_at ? "Job document history" : "Review pending upload"}</Link>
        </div>
      </article>)}</div>
      {!rows.length && <p>No saved document revisions on this page. Open a job below to add its first document.</p>}
      <nav className={`${styles.rowActions} ${styles.cardActions}`} aria-label="Document pages">{page > 0 && <Link className={styles.secondaryButton} href={pageHref(page - 1)}>Previous page</Link>}{(page + 1) * PAGE_SIZE < total && <Link className={styles.secondaryButton} href={pageHref(page + 1)}>Next page</Link>}</nav>
    </section>
    <details className={styles.details}><summary>Add or revise a job document</summary><p>Use the existing private upload form on the job. Each saved revision and its audit history are preserved.</p>
      <div className={styles.cardList}>{contracts.filter(contract => !contractId || contract.id === contractId).map(contract => <Link key={contract.id} className={styles.contractCard} href={`/admin/contracts/${contract.id}#documents`}>{contract.reference} · {contract.name}</Link>)}</div>
      {!contracts.length && <p>No authorised jobs yet. <Link href="/admin/contracts/new">Create a job</Link> before adding its documents.</p>}
    </details>
  </>;
}
