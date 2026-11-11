import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, canReadFinancial, requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { hrefFor, searchKinds as kinds, type Hit } from "@/lib/operations/search";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";
/** One search across every record the signed-in person may see. The database's own row-level security decides what is found. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, member } = await requireActor();
  if (!canManageContracts(member)) notFound();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const financial = canReadFinancial(member);
  let hits: Hit[] = [];
  let limited = false;
  if (q.length >= 2) {
    const result = await supabase.rpc("office_search", { p_query: q, p_limit: 40 });
    if (result.error && ["PGRST202", "42883"].includes(result.error.code ?? "")) {
      // Before the search update is applied, jobs can still be found.
      limited = true;
      const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`;
      const jobs = await supabase.from("contracts").select("id,reference,name,client").or(`reference.ilike.${like},name.ilike.${like},client.ilike.${like}`).limit(40);
      checkDatabase(jobs.error);
      hits = ((jobs.data ?? []) as { id: string; reference: string; name: string; client: string }[]).map(j => ({ kind: "job", id: j.id, label: `${j.reference} · ${j.name}`, detail: j.client, contract_id: j.id }));
    } else {
      checkDatabase(result.error);
      hits = (result.data ?? []) as Hit[];
    }
  }
  const groups = Object.keys(kinds).map(kind => ({ kind, hits: hits.filter(h => h.kind === kind) })).filter(group => group.hits.length);
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>Search</p><h1 className={styles.title}>Search everything</h1>
      <p className={styles.description}>Jobs, customers, gangs, people, invoices, quotations, tenders, snags, stops, dayworks, materials and site conversations.</p></div></div>
    <form method="get" role="search" className={styles.search}>
      <label className={styles.field}>Search for<input type="search" name="q" defaultValue={q} maxLength={80} autoFocus placeholder="A name, reference, invoice number or word" /></label>
      <button className={styles.button} type="submit">Search</button>
    </form>
    {limited && <p className={styles.warning}>Only jobs can be searched until the latest database update is applied.</p>}
    {q.length > 0 && q.length < 2 && <p>Type at least two characters.</p>}
    {q.length >= 2 && !hits.length && <section className={styles.empty}><h2>Nothing found for “{q}”</h2><p>Try part of a name, a reference such as GI-00012 or Q-00004, or a word from a note.</p></section>}
    {groups.map(group => <section key={group.kind} className={styles.panel} aria-labelledby={`search-${group.kind}`}>
      <h2 id={`search-${group.kind}`}>{kinds[group.kind]} ({group.hits.length})</h2>
      <ul className={styles.plainList}>{group.hits.map(hit => <li key={`${hit.kind}-${hit.id}`} data-search-hit={hit.kind}>
        <Link href={hrefFor(hit, financial)}><strong>{hit.label}</strong></Link>{hit.detail ? <span className={styles.muted}> · {hit.detail}</span> : null}
      </li>)}</ul>
    </section>)}
  </>;
}
