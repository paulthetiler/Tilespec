// Stands in for the signed-in session: the contract test sets which member is
// acting and supplies a client that runs each database call as that member.
export { canManageContracts, canReadFinancial } from "../../lib/operations/permissions";
type Actor = { supabase: unknown; member: unknown };
export async function requireActor() {
  const actor = (globalThis as { officeActor?: Actor }).officeActor;
  if (!actor) throw new Error("No acting member set for the contract test");
  return actor;
}
