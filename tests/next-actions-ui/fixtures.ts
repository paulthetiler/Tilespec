// Synthetic, read-only UI fixtures. These replace server dependencies only in
// scripts/test-next-actions-ui.mjs's temporary app, never in the application.
import Data from "../../docs/redesign/prototype/data.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/lib/auth";
import type { NextActionSnapshot } from "@/lib/operations/next-actions";

export const siteId = "a0000000-0000-4000-8000-000000000001";
export const member: Member = {
  organisation_id: "a0000000-0000-4000-8000-000000000002",
  user_id: "u-dave", display_name: "Dave Collins", role: "supervisor", financial_access: false, active: true,
};
export const contract = { id: siteId, reference: "FIXTURE-2041", name: "Riverside Quay", address: "Fictional test site" };

export function snapshotFor(held = false): NextActionSnapshot {
  const snapshot = JSON.parse(JSON.stringify(Data.make("start")).replaceAll('"c1"', JSON.stringify(siteId))) as NextActionSnapshot;
  if (held) snapshot.work_holds.push({
    id: "held-bathroom", contract_id: siteId, work_area_id: "l-f31-bath", hold_type: "safety", status: "active",
    reason: "Unsafe access to the waterproofing area", required_action: "Make this access safe before requesting review",
    raised_by: "u-sam", corrected_by: null, assigned_team_id: null, assigned_operative_id: null,
    target_date: null, critical_snags_open: false, stage: "waterproofing", activity: "Bathroom floor membrane",
    work_package_id: "p1", work_package_name: "Flat 31 bathroom: floor and walls",
    location_path: ["Block B", "Level 3", "Flat 31", "Bathroom"],
  });
  return snapshot;
}

// Only the two additional read-only Today queries are supported. Any unexpected
// table or mutation fails rather than silently simulating a successful write.
export function fixtureClient(held = false): SupabaseClient {
  return {
    fixtureHeld: held,
    from(table: string) {
      if (!["contracts", "document_revisions"].includes(table)) throw new Error(`Unexpected UI fixture table: ${table}`);
      const data = table === "contracts" ? { client: "Fictional client", scope: "Test bathrooms", working_hours: "07:30 to 16:30" } : [];
      const result = { data, error: null };
      const query = {
        select() { return query; }, eq() { return query; }, not() { return query; }, maybeSingle() { return Promise.resolve(result); },
        then(resolve: (value: typeof result) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(result).then(resolve, reject); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
