import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireFinancialActor } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function OmHandoverPage() {
  await requireFinancialActor();
  const source = await readFile(path.join(process.cwd(), "docs/om-handover-template.md"), "utf8");
  return <main style={{maxWidth:900,margin:"0 auto",padding:"32px 20px 80px",color:"#173242"}}>
    <Link href="/admin/documents">← Back to documents</Link>
    <h1 style={{fontSize:32,marginTop:24}}>Tiling O&amp;M handover template</h1>
    <p style={{color:"#8b5b31",fontWeight:700}}>INTERNAL DRAFT — NOT FOR EXTERNAL ISSUE</p>
    <p>Project-specific working template. Complete all placeholders, attach current manufacturer instructions and obtain approval before issue.</p>
    <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontFamily:"inherit",fontSize:14,lineHeight:1.7,background:"#f7faf9",border:"1px solid #dce6e6",padding:24}}>{source}</pre>
  </main>;
}
