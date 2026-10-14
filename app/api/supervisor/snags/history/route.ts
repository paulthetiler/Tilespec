import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { installationStages } from "@/lib/operations/types";
export async function GET(request:Request) {
 const {supabase,member}=await requireActor();
 if(!["owner","contracts_manager","supervisor"].includes(member.role)) return NextResponse.json({error:"Site supervision permission required"},{status:403});
 const q=new URL(request.url).searchParams,contract=q.get("contract"),location=q.get("location"),stage=q.get("stage");
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!contract||!location||!uuid.test(contract)||!uuid.test(location)||!stage||!(installationStages as readonly string[]).includes(stage))
  return NextResponse.json({error:"Choose a site, location and stage"},{status:400});
 const area=await supabase.from("work_areas").select("id").eq("contract_id",contract).eq("id",location).maybeSingle();
 if(area.error||!area.data) return NextResponse.json({error:"Location unavailable"},{status:404});
 const result=await supabase.rpc("location_work_history",{p_area:location});
 if(result.error) return NextResponse.json({error:"Workforce history unavailable"},{status:503});
 return NextResponse.json({history:(result.data||[]).filter((item:{stage:string})=>item.stage===stage)},{headers:{"Cache-Control":"private, no-store"}});
}
