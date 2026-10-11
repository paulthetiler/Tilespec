import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { checkDatabase, contractsFor } from "@/lib/operations/data";
import SupervisorWorkspace from "./supervisor-workspace";

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
  return <main style={{maxWidth:1000,margin:"0 auto",padding:"16px 12px 80px",minWidth:0}}>
    <p style={{fontSize:12,letterSpacing:2}}>TILESPEC / SITE OPERATIONS</p>
    <p><Link href="/admin">← Admin overview</Link></p>
    <SupervisorWorkspace contracts={contracts.map(c=>({
      id:c.id,reference:c.reference,name:c.name,address:c.address,client:c.client,site_contact:c.site_contact,
      scope:c.scope,exclusions:c.exclusions,tile_specification:c.tile_specification,installation_system:c.installation_system,
      access_restrictions:c.access_restrictions,working_hours:c.working_hours,
      areas:(areas.data??[]).filter(a=>a.contract_id===c.id),
      docs:(docs.data??[]).filter(d=>d.contract_id===c.id && d.classification==="operational")
    }))} role={member.role} displayName={member.display_name}/>
  </main>;
}
