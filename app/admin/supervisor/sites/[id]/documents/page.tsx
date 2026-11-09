import Link from "next/link";
import { requireSite } from "../../../site-access";
import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";
type Revision = { id:string; title:string; document_reference:string; revision:number; uploaded_at:string; created_at:string; mime_type:string };
const section = (title:string) => /rams|risk assess|method statement|coshh|safety/i.test(title) ? "RAMS & safety" : /drawing|plan|layout|setting.out|detail|elevation/i.test(title) ? "Drawings" : "Specifications & other";
export default async function SiteDocuments({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 const {supabase,contract}=await requireSite(id);
 if(!contract) return null;
 const result=await supabase.from("document_revisions").select("id,title,document_reference,revision,uploaded_at,created_at,mime_type")
  .eq("contract_id",id).eq("classification","operational").not("uploaded_at","is",null)
  .order("revision",{ascending:false}).order("created_at",{ascending:false});
 if(result.error) return <main className={styles.panel}><h1>Site documents</h1><p role="alert">Documents are temporarily unavailable. Contact the office before relying on an old drawing.</p></main>;
 const revisions=(result.data||[]) as Revision[];
 const current=new Map<string,Revision>();
 for(const document of revisions) if(!current.has(document.document_reference)) current.set(document.document_reference,document);
 const latest=[...current.values()];
 return <main style={{maxWidth:900,margin:"0 auto",padding:"16px 12px 90px"}}>
  <p><Link href={`/admin/supervisor/sites/${id}`}>← Back to site</Link></p>
  <h1>Drawings &amp; Documents</h1><p><strong>{contract.name}</strong></p>
  <p>Current job documents uploaded by the office. Open or save a PDF for use on site. Older revisions are kept separately so you can check what changed.</p>
  {["Drawings","RAMS & safety","Specifications & other"].map(group=><section key={group} className={styles.panel} style={{marginTop:18}}>
   <h2>{group}</h2>
   {latest.filter(doc=>section(doc.title+" "+doc.document_reference)===group).map(doc=><article key={doc.id} className={styles.documentRow}>
    <div><strong>{doc.title}</strong><p>{doc.document_reference} · Revision {doc.revision} · Current uploaded version</p></div>
    <a className={styles.secondaryButton} href={`/admin/documents/${doc.id}`} target="_blank" rel="noopener noreferrer">Open / save</a>
   </article>)}
   {!latest.some(doc=>section(doc.title+" "+doc.document_reference)===group)&&<p>No documents uploaded for this section yet.</p>}
  </section>)}
  <details className={styles.details} style={{marginTop:20}}><summary>Previous drawing and document revisions</summary>
   {revisions.filter(doc=>current.get(doc.document_reference)?.id!==doc.id).map(doc=><article key={doc.id} className={styles.documentRow}>
    <div><strong>{doc.title}</strong><p>{doc.document_reference} · Revision {doc.revision} · Superseded — do not build from this version</p></div>
    <a href={`/admin/documents/${doc.id}`} target="_blank" rel="noopener noreferrer">View old revision</a>
   </article>)}
   {!revisions.some(doc=>current.get(doc.document_reference)?.id!==doc.id)&&<p>No older revisions.</p>}
  </details>
  <p style={{marginTop:20}}>Missing a drawing or RAMS? Ask the office to add it to this contract. Site documents are shared across authorised supervisors, not stored against an individual tablet.</p>
 </main>;
}
