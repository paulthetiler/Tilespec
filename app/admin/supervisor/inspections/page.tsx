import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
export const dynamic="force-dynamic";
// Preserve bookmarked links while consolidating snag navigation. Legacy issues
// and their original transitions/history are available in the same register.
export default async function PreviousIssueQueue({searchParams}:{searchParams:Promise<{contract?:string|string[]}>}) {
 await requireActor();const q=await searchParams;
 const contract=typeof q.contract==="string"&&/^[0-9a-f-]{36}$/i.test(q.contract)?q.contract:null;
 redirect(`/admin/snags${contract?`?contract_id=${contract}`:""}`);
}
