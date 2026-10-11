import Link from "next/link";
import SiteWorkflowPreview from "./site-workflow-preview";
import { requireActor } from "@/lib/auth";
import { checkDatabase, contractsFor } from "@/lib/operations/data";

export const dynamic = "force-dynamic";

export default async function SupervisorHub() {
  const { supabase, member } = await requireActor();
  const contracts = await contractsFor(supabase);
  const ids = contracts.map(c => c.id);
  const [areas, docs] = ids.length ? await Promise.all([
    supabase.from("work_areas").select("id,contract_id,name,location,substrate_notes,system_notes,specification_revision").in("contract_id", ids),
    supabase.from("document_revisions").select("id,contract_id,title,document_reference,revision,classification,uploaded_at").in("contract_id", ids).not("uploaded_at","is",null)
  ]) : [{data:[],error:null},{data:[],error:null}];
  checkDatabase(areas.error);
  checkDatabase(docs.error);
  const operationalDocs = (docs.data ?? []).filter(d => d.classification === "operational");
  return <main style={{maxWidth:1000,margin:"0 auto",padding:"24px 16px 70px"}}>
    <p style={{letterSpacing:2,fontSize:12}}>TILESPEC / SITE OPERATIONS</p>
    <h1>Supervisor hub</h1>
    <p>One place for the current job pack, drawings and work areas. Information is read-only until the approval and upload workflows are enabled.</p>
    <p><Link href="/admin">← Admin overview</Link></p>
    <SiteWorkflowPreview areaNames={Array.from(new Set((areas.data ?? []).map(a => a.name)))} />
    {contracts.length === 0 && <section style={{padding:20,border:"1px solid #bbb",borderRadius:10}}>No contracts are assigned yet. An owner or contracts manager must create and assign a contract before the site pack appears.</section>}
    {contracts.map(contract => {
      const contractAreas = (areas.data ?? []).filter(a => a.contract_id === contract.id);
      const contractDocs = operationalDocs.filter(d => d.contract_id === contract.id);
      return <section key={contract.id} style={{border:"1px solid #ccd5d9",borderRadius:12,padding:20,marginTop:20}}>
        <h2>{contract.reference} — {contract.name}</h2>
        <p><strong>Address:</strong> {contract.address || "Not provided"}</p>
        <p><strong>Client:</strong> {contract.client || "Not provided"} · <strong>Site contact:</strong> {contract.site_contact || "Not provided"}</p>
        <details open><summary><strong>Job information</strong></summary>
          <p><strong>Scope:</strong> {contract.scope || "Not provided"}</p>
          <p><strong>Exclusions:</strong> {contract.exclusions || "Not provided"}</p>
          <p><strong>Tile specification:</strong> {contract.tile_specification || "Not provided"}</p>
          <p><strong>Installation system:</strong> {contract.installation_system || "Not provided"}</p>
          <p><strong>Access:</strong> {contract.access_restrictions || "Not provided"}</p>
          <p><strong>Working hours:</strong> {contract.working_hours || "Not provided"}</p>
        </details>
        <details><summary><strong>Work areas ({contractAreas.length})</strong></summary>
          {contractAreas.length === 0 ? <p>No work areas recorded.</p> : contractAreas.map(area => <div key={area.id} style={{borderTop:"1px solid #ddd",padding:"10px 0"}}>
            <strong>{area.name}</strong> — {area.location || "Location not specified"}
            <p>Substrate: {area.substrate_notes || "Not assessed"}</p>
            <p>System: {area.system_notes || "Not specified"}</p>
            <p>Specification: {area.specification_revision}</p>
            <p><strong>Installation release: blocked until quality gates are implemented and signed off.</strong></p>
          </div>)}
        </details>
        <details><summary><strong>Approved job-pack register ({contractDocs.length})</strong></summary>
          {contractDocs.length === 0 ? <p>No uploaded operational drawings or documents recorded.</p> : contractDocs.map(doc => <p key={doc.id}>{doc.title} · {doc.document_reference} · Revision {doc.revision}</p>)}
          <p>Document download and revision approval are not yet enabled. Do not work from an unverified drawing.</p>
        </details>
        <details><summary><strong>Variations and dayworks</strong></summary><p>Recording and approval are not yet enabled. Do not treat an instruction as an authorised variation or daywork.</p></details>
        <p style={{fontSize:13}}>Signed in as {member.display_name} · {member.role}. Commercial values are not displayed in this hub.</p>
      </section>;
    })}
  </main>;
}
