import { addDays } from "./planning";
import type { CompanyAccreditation, CompanyInsurance, InsuranceType } from "./types";

// How a company's recorded cover stands today. This informs the office; it
// never blocks planning or site work.
export type CoverStatus = "valid" | "expiring" | "expired" | "none";
export const EXPIRY_WARNING_DAYS = 30;

export function coverStatus(expiresOn: string | null, today: string): Exclude<CoverStatus, "none"> {
  if (expiresOn === null) return "valid";
  if (expiresOn < today) return "expired";
  return expiresOn <= addDays(today, EXPIRY_WARNING_DAYS) ? "expiring" : "valid";
}
const severity: Record<CoverStatus, number> = { none: 0, valid: 1, expiring: 2, expired: 3 };
function worst(statuses: CoverStatus[]): CoverStatus {
  return statuses.reduce<CoverStatus>((result, status) => severity[status] > severity[result] ? status : result, "none");
}

// A renewal is a new entry, so each kind of cover is judged by its latest
// expiry. The company's status is the worst of those.
export function insuranceSummary(insurances: CompanyInsurance[], companyId: string, today: string) {
  const latest = new Map<InsuranceType, CompanyInsurance>();
  for (const entry of insurances) {
    if (entry.company_id !== companyId) continue;
    const current = latest.get(entry.insurance_type);
    if (!current || entry.expires_on > current.expires_on) latest.set(entry.insurance_type, entry);
  }
  const policies = [...latest.values()].map(entry => ({ entry, status: coverStatus(entry.expires_on, today) }))
    .sort((a, b) => a.entry.expires_on.localeCompare(b.entry.expires_on));
  const status = worst(policies.map(policy => policy.status));
  const attention = policies.find(policy => policy.status === status) ?? null;
  return { status, policies, attention };
}

export function accreditationSummary(accreditations: CompanyAccreditation[], companyId: string, today: string) {
  const latest = new Map<string, CompanyAccreditation>();
  for (const entry of accreditations) {
    if (entry.company_id !== companyId) continue;
    const key = entry.scheme.trim().toLowerCase();
    const current = latest.get(key);
    if (!current || (current.expires_on !== null && (entry.expires_on === null || entry.expires_on > current.expires_on))) latest.set(key, entry);
  }
  const schemes = [...latest.values()].map(entry => ({ entry, status: coverStatus(entry.expires_on, today) }))
    .sort((a, b) => a.entry.scheme.localeCompare(b.entry.scheme, "en-GB"));
  return { status: worst(schemes.map(scheme => scheme.status)), schemes };
}

export function daysUntil(date: string, today: string) {
  return Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86_400_000);
}
