import "server-only";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const siteRoles = ["owner", "contracts_manager", "supervisor"] as const;
export type SiteContract = { id: string; reference: string; name: string; address: string };

// Site screens are for supervisors and the office. The contract must be one
// the database lets this person see; row-level security decides, and every
// change is checked again by the database function that makes it.
export async function requireSite(id: string) {
  if (!uuidPattern.test(id)) notFound();
  const { supabase, member } = await requireActor();
  if (!(siteRoles as readonly string[]).includes(member.role)) return { supabase, member, contract: null };
  const contract = await supabase.from("contracts").select("id,reference,name,address").eq("id", id).maybeSingle();
  checkDatabase(contract.error);
  if (!contract.data) notFound();
  return { supabase, member, contract: contract.data as SiteContract };
}
