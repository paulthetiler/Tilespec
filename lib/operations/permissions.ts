import type { Member } from "./types";

export function canManageContracts(member: Member): boolean {
  return member.active && (member.role === "owner" || member.role === "contracts_manager");
}
export function canReadFinancial(member: Member): boolean {
  return member.active && (member.role === "owner" || (member.role === "contracts_manager" && member.financial_access === true));
}
