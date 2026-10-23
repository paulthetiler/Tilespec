import { DEFAULT_CONFIG, type NextActionConfig } from "./config";
import { addDays, isoDate } from "./lookups";
import type { NextActionSnapshot, Viewer } from "./types";

/*
 * Information arriving from site that the office should look at: inspection results with
 * problems, and handovers that mention problems or carry notes for the office. Without office
 * reviews in the database nothing records that the office has looked, so they are listed here
 * for a configured number of days, and an inspection result drops off as soon as a snag or stop
 * is raised from it. Once reviews exist, rules R18 and R19 make them real Next Actions instead.
 */
export interface SiteUpdate {
  id: string;
  kind: "inspection" | "handover";
  contractId: string;
  job: string;
  title: string;
  detail: string;
  at: string;
  href: string;
}

const brief = (text: string, length = 180) => (text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text);

export function siteUpdates(s: NextActionSnapshot, viewer: Viewer, cfg: NextActionConfig = DEFAULT_CONFIG): SiteUpdate[] {
  if ((viewer.role !== "owner" && viewer.role !== "contracts_manager") || s.office_reviews) return [];
  const since = addDays(s.today, -(cfg.siteUpdateDays - 1));
  const job = (id: string) => {
    const contract = s.contracts.find(c => c.id === id);
    return contract ? [contract.reference, contract.name].filter(Boolean).join(" · ") : "Recorded job";
  };
  const results = (s.qa_results ?? []).filter(r => r.has_issues && !r.followed_up && isoDate(r.submitted_at) >= since).map((r): SiteUpdate => ({
    id: `qa-result:${r.item_id}`, kind: "inspection", contractId: r.contract_id, job: job(r.contract_id),
    title: `Inspection found problems: ${r.title}`,
    detail: [r.location_path.join(" › "), r.submitted_by_name ? `Sent by ${r.submitted_by_name}` : null, "No snag or stop has been raised from it yet."].filter(Boolean).join(" · "),
    at: r.submitted_at, href: `/admin/supervisor/sites/${r.contract_id}/tasks/${r.item_id}`,
  }));
  const handovers = (s.handover_notes ?? []).filter(h => h.work_date >= since).flatMap((h): SiteUpdate[] => {
    const parts: [string, string, string][] = [["notes for the office", "For the office", h.office_notes], ["problems", "Problems", h.outstanding_problems],
      ["areas needing attention", "Needs attention", h.areas_awaiting_attention]];
    const filled = parts.filter(([, , text]) => text.trim());
    if (!filled.length) return [];
    return [{
      id: `handover:${h.id}`, kind: "handover", contractId: h.contract_id, job: job(h.contract_id),
      title: `Handover from ${h.actor_name}: ${filled.map(([summary]) => summary).join(", ")}`,
      detail: brief(`${filled[0][1]}: ${filled[0][2].trim()}`),
      at: h.created_at, href: `/admin/messages?contract_id=${h.contract_id}#handover-${h.id}`,
    }];
  });
  return [...results, ...handovers].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
