// Realistic but fictional records for the office UI harness only. They are
// never written to any database and no application route serves them.
import type { Company, CompanyAccreditation, CompanyInsurance, Location, Operative, PlannedAllocation, PlannedOperative, Team, TeamMembership, WorkPackage } from "@/lib/operations/types";

export const today = "2026-10-14";
export const contractId = "c0000000-0000-4000-8000-000000000001";
const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let sequence = 0;
function location(name: string, parent: Location | null, extra: Partial<Location> = {}): Location {
  const id = uuid("a", ++sequence);
  return {
    id, contract_id: contractId, name, location: "", substrate_notes: "", system_notes: "", specification_revision: "unapproved",
    parent_id: parent?.id ?? null, path_ids: [...(parent?.path_ids ?? []), id], location_type: "", code: "", sort_order: sequence,
    version: 1, archived_at: null, ...extra,
  };
}
export const locations: Location[] = [];
const block = location("Block B", null, { location_type: "Block", code: "B" });
locations.push(block);
for (let level = 1; level <= 6; level++) {
  const floor = location(`Level ${level}`, block, { location_type: "Level" });
  locations.push(floor);
  for (let flat = 1; flat <= 10; flat++) {
    const number = `${level}${String(flat).padStart(2, "0")}`;
    const home = location(`Flat ${number}`, floor, { location_type: "Flat", code: number, archived_at: number === "610" ? "2026-10-01T09:00:00Z" : null });
    locations.push(home, location("Bathroom", home, { archived_at: home.archived_at }), location("Kitchen", home, { archived_at: home.archived_at }), location("Ensuite", home, { archived_at: home.archived_at }));
  }
}
const communal = location("Communal corridors", null, { location_type: "Area" });
locations.push(communal);
export const find = (path: string[]) => {
  let current: Location | undefined;
  for (const name of path) current = locations.find(item => item.name === name && item.parent_id === (current?.id ?? null));
  if (!current) throw new Error(`Fixture location not found: ${path.join(" > ")}`);
  return current;
};

const company = (n: number, name: string, extra: Partial<Company> = {}): Company => ({
  id: uuid("3", n), organisation_id: "org", name, company_number: "", contact_name: "", contact_phone: "", contact_email: "", address: "", notes: "",
  active: true, version: 1, ...extra,
});
export const companies: Company[] = [
  company(1, "Jones Installations", { contact_name: "Jo Jones", contact_phone: "07700 900456" }),
  company(2, "Moss Tiling", { active: false, version: 3 }),
  company(3, "Site Labour Agency", { contact_email: "bookings@labour.example" }),
  company(4, "Smith Tiling Ltd", { contact_name: "Sam Smith", contact_phone: "07700 900123", contact_email: "office@smith-tiling.example", company_number: "01234567" }),
];
export const smithCompany = uuid("3", 4);
const insurance = (n: number, companyNumber: number, insurance_type: CompanyInsurance["insurance_type"], expires_on: string, extra: Partial<CompanyInsurance> = {}): CompanyInsurance => ({
  id: uuid("4", n), company_id: uuid("3", companyNumber), insurance_type, insurer: "", policy_number: "", cover_amount: null, starts_on: null, expires_on,
  notes: "", recorded_at: "2026-09-01T09:00:00Z", ...extra,
});
export const insurances: CompanyInsurance[] = [
  insurance(1, 4, "public_liability", "2027-06-30", { insurer: "Example Mutual", policy_number: "PL-1002", cover_amount: 10000000, starts_on: "2026-07-01" }),
  insurance(2, 4, "public_liability", "2026-06-30", { insurer: "Example Mutual", policy_number: "PL-1001", cover_amount: 5000000 }),
  insurance(3, 4, "employers_liability", "2026-10-30", { insurer: "Example Mutual" }),
  insurance(4, 1, "public_liability", "2026-10-03"),
];
export const accreditations: CompanyAccreditation[] = [
  { id: uuid("5", 1), company_id: uuid("3", 4), scheme: "CHAS", reference: "CH-778", expires_on: "2027-03-31", notes: "", recorded_at: "2026-09-01T09:00:00Z" },
  { id: uuid("5", 2), company_id: uuid("3", 1), scheme: "The Tile Association member", reference: "", expires_on: null, notes: "", recorded_at: "2026-09-01T09:00:00Z" },
];

export const teams: Team[] = [
  { id: uuid("b", 1), organisation_id: "org", name: "Smith Tiling", kind: "subcontract_gang", company_id: smithCompany, active: true, version: 1 },
  { id: uuid("b", 2), organisation_id: "org", name: "Jones Installations", kind: "subcontract_gang", company_id: uuid("3", 1), active: true, version: 1 },
  { id: uuid("b", 3), organisation_id: "org", name: "Direct Team A", kind: "direct_team", company_id: null, active: true, version: 1 },
  { id: uuid("b", 4), organisation_id: "org", name: "Old Snagging Crew", kind: "temporary", company_id: null, active: false, version: 2 },
  { id: uuid("b", 5), organisation_id: "org", name: "Smith Tiling gang 2", kind: "subcontract_gang", company_id: smithCompany, active: true, version: 1 },
];
const person = (n: number, display_name: string, engagement: Operative["engagement"], companyNumber: number | null, status: Operative["status"] = "active", user_id: string | null = null): Operative =>
  ({ id: uuid("d", n), organisation_id: "org", display_name, engagement, company_id: companyNumber === null ? null : uuid("3", companyNumber), user_id, status, version: 1 });
export const operatives: Operative[] = [
  person(1, "Sam Smith", "subcontractor", 4, "active", uuid("e", 1)),
  person(2, "Tom Baker", "subcontractor", 4),
  person(3, "Lee Hart", "subcontractor", 4),
  person(4, "Jo Jones", "subcontractor", 1),
  person(5, "Kim Lowe", "subcontractor", 1),
  person(6, "Dan Price", "direct_employee", null),
  person(7, "Eve Shaw", "direct_employee", null),
  person(8, "Replacement Labourer", "agency", 3, "provisional"),
  person(9, "Ray Dunn", "subcontractor", 4, "inactive"),
  person(10, "Ben Ward", "subcontractor", 4),
];
const member = (n: number, team: number, operative: number, valid_from: string, extra: Partial<TeamMembership> = {}): TeamMembership =>
  ({ id: uuid("f", n), team_id: uuid("b", team), operative_id: uuid("d", operative), is_lead: false, valid_from, valid_until: null, voided_at: null, end_reason: null, void_reason: null, ...extra });
export const memberships: TeamMembership[] = [
  member(1, 1, 1, "2026-08-01", { is_lead: true }),
  member(2, 1, 2, "2026-08-01", { valid_until: "2026-10-13", end_reason: "Transferred to Jones Installations" }),
  member(3, 1, 3, "2026-08-01"),
  member(4, 2, 4, "2026-08-01", { is_lead: true }),
  member(5, 2, 5, "2026-08-01"),
  member(6, 2, 2, "2026-10-14"),
  member(7, 3, 6, "2026-08-01", { is_lead: true }),
  member(8, 3, 7, "2026-08-01"),
  member(9, 1, 6, "2026-10-02", { voided_at: "2026-10-02T10:00:00Z", void_reason: "Added to the wrong team" }),
  member(10, 3, 3, "2026-10-20"),
  member(11, 5, 10, "2026-09-01", { is_lead: true }),
];
export const logins = [
  { user_id: uuid("e", 1), display_name: "Sam Smith" },
  { user_id: uuid("e", 2), display_name: "Jo Jones" },
];

export const packages: WorkPackage[] = [
  { id: uuid("9", 1), contract_id: contractId, work_area_id: find(["Block B", "Level 5", "Flat 502"]).id, name: "Flat 502 wall and floor tiling", quantity: 36, unit: "m2" },
  { id: uuid("9", 2), contract_id: contractId, work_area_id: find(["Block B", "Level 5", "Flat 505"]).id, name: "Flat 505 wall and floor tiling", quantity: 36, unit: "m2" },
];
type Plan = PlannedAllocation & { cancel_reason: string | null };
const plan = (n: number, team: number, area: string, stage: Plan["stage"], start: string, end: string, extra: Partial<Plan> = {}): Plan => ({
  id: uuid("7", n), contract_id: contractId, work_area_id: area, work_package_id: null, team_id: uuid("b", team), stage,
  planned_start: start, planned_end: end, instructions: "", supersedes_id: null, superseded_by: null, cancelled_at: null, cancel_reason: null,
  created_by: "office", created_at: "2026-10-10T09:00:00Z", ...extra,
});
export const plans: Plan[] = [
  plan(1, 1, find(["Block B", "Level 5", "Flat 502"]).id, "installation", "2026-10-12", "2026-10-14", { work_package_id: uuid("9", 1), instructions: "Bathroom first; protect the bath panel." }),
  plan(2, 2, find(["Block B", "Level 5", "Flat 505"]).id, "installation", "2026-10-13", "2026-10-16"),
  plan(3, 3, communal.id, "preparation", "2026-10-12", "2026-10-16"),
  plan(4, 1, find(["Block B", "Level 5", "Flat 503"]).id, "grouting", "2026-10-15", "2026-10-16", { supersedes_id: uuid("7", 5), created_at: "2026-10-13T08:00:00Z" }),
  plan(5, 1, find(["Block B", "Level 5", "Flat 503"]).id, "grouting", "2026-10-14", "2026-10-15", { superseded_by: uuid("7", 4) }),
  plan(6, 2, find(["Block B", "Level 4", "Flat 401"]).id, "sealant", "2026-10-16", "2026-10-16", { cancelled_at: "2026-10-13T15:00:00Z", cancel_reason: "Silicone colour not yet approved" }),
];
export const plannedOperatives: PlannedOperative[] = [
  { planned_allocation_id: uuid("7", 1), operative_id: uuid("d", 1) },
  { planned_allocation_id: uuid("7", 1), operative_id: uuid("d", 3) },
];
