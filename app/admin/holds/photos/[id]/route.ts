import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
 const {supabase}=await requireActor();const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found",{status:404});
 const photo=await supabase.from("hold_photos").select("object_path,purpose,uploaded_at").eq("id",id).maybeSingle();
 if(photo.error) return new NextResponse("Photo service unavailable",{status:503});
 if(!photo.data || (photo.data.purpose && !photo.data.uploaded_at)) return new NextResponse("Not found",{status:404});
 const signed=await supabase.storage.from("supervisor-evidence").createSignedUrl(photo.data.object_path,60);
 if(signed.error || !signed.data?.signedUrl) return new NextResponse("Photo unavailable",{status:503});
 return NextResponse.redirect(signed.data.signedUrl,{status:303,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
}
