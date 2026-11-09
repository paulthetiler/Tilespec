import Link from "next/link";
import { requireFinancialActor } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function DocumentsPage(){
 await requireFinancialActor();
 return <main style={{maxWidth:920,margin:"0 auto",padding:"36px 20px 90px",color:"#173242"}}>
 <Link href="/admin">← Back to admin</Link>
 <h1 style={{fontSize:36,marginTop:28}}>Documents</h1>
 <p>Commercial documents and working drafts for TileSpec.</p>
 <section style={{border:"1px solid #dce6e6",padding:24,marginTop:26,background:"#f7faf9"}}>
 <div style={{fontSize:12,fontWeight:800,color:"#8b5b31",letterSpacing:1}}>INTERNAL DRAFT — NOT FOR ISSUE YET</div>
 <h2 style={{fontSize:23,margin:"12px 0"}}>Commercial Terms &amp; Conditions</h2>
 <p>20-section working draft dated 9 November 2026. Includes payment, retention, materials, variations, dayworks, site delays, protection of completed work and liability. The PDF includes the internal review checklist.</p>
 <a href="/admin/documents/terms/pdf" target="_blank" rel="noopener noreferrer" style={{display:"inline-block",padding:"13px 20px",background:"#0f2a3a",color:"#fff",fontWeight:700,marginTop:12}}>Open / save PDF</a>
 <p style={{fontSize:12,color:"#637880",marginTop:14}}>Requires legal review and approval before sending as contractual terms.</p>
 </section></main>;
}
