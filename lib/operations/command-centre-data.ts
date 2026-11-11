import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "../auth";
import { canReadFinancial } from "./permissions";
import { checkDatabase } from "./data";
import { positionsFor } from "./financial-position-data";
import { belowTarget } from "./financial-position";
import { londonDate, londonTimeToIso } from "./planning";
import { addDays } from "./next-actions/lookups";
import { meaningfulText } from "./text";
import type { NextActionSnapshot, ViewerAction } from "./next-actions/types";
import {
  ACTIVE_STAGES, ageing, cashWeeks, jobStage, onboardingSteps, programmePercent, programmeStatus, progressPercent, staffingGaps, workingDays,
  type Ageing, type CashLine, type CashWeek, type DebtLine, type OnboardingStep, type PackageProgress, type ProgrammeStatus, type Stage,
} from "./command-centre";

type Row = Record<string, unknown>;
const MISSING = ["42P01", "PGRST205", "42703", "PGRST204", "PGRST202", "42883"];
/** A read of a table or function from a later migration: absent means "not installed yet", never an error. */
async function optional<T = Row>(query: PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<T[] | null> {
  const result = await query;
  if (result.error && MISSING.includes(result.error.code ?? "")) return null;
  checkDatabase(result.error);
  return (result.data ?? []) as T[];
}
async function required<T = Row>(query: PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<T[]> {
  const result = await query;
  checkDatabase(result.error);
  return (result.data ?? []) as T[];
}
const n = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

export type LiveJob = {
  id: string; reference: string; name: string; client: string; stage: Stage; stageConfirmed: boolean; start: string | null; end: string | null;
  supervisors: string[]; managers: string[]; gangsPlannedToday: string[]; gangsOnSiteToday: number; peopleOnSiteToday: number;
  progress: number | null; programme: number | null; status: ProgrammeStatus; packages: PackageProgress[];
  stops: number; safetyStops: number; openSnags: number; criticalSnags: number; openActions: number; waitingOnOffice: number;
  money: { value: number; cost: number; forecastProfit: number; margin: number | null; target: number | null; below: boolean } | null;
};
export type YesterdayJob = {
  id: string; reference: string; name: string;
  handovers: { id: string; actor: string; completed: string; problems: string | null; materials: string | null; attention: string | null; office: string | null }[];
  teams: string[]; people: number; progress: { description: string; quantity: number | null; unit: string | null; where: string }[];
  photos: { id: string; url: string | null; caption: string | null }[]; photoCount: number;
  inspections: number; failedInspections: number; snags: { id: string; label: string; severity: string | null }[]; holds: { id: string; type: string; reason: string }[];
  materials: { id: string; item: string; quantity: number; unit: string }[]; waitingOnOffice: number;
};
export type InboxCounts = { threads: number; urgent: number; reports: number; instructions: number; qa: number; gangChecks: number; gangApprovals: number; drafts: number; total: number };
export type MoneyView = {
  ageing: Ageing; debts: (DebtLine & { job: string })[]; cash: CashWeek[];
  gang: { toCheck: { count: number; amount: number }; toApprove: { count: number; amount: number }; dueWeek: { count: number; amount: number };
    overdue: { count: number; amount: number }; retentionHeld: number; cisThisMonth: number };
  quotes: { open: number; value: number; followUps: number } | null;
  extras: { toPrice: number; awaitingClient: number };
  positions: { id: string; job: string; value: number; cost: number; profit: number; margin: number | null; target: number | null; below: boolean }[];
};
export type Deadline = { on: string; what: string; job: string | null; href: string };
export type PlanningView = {
  days: string[]; teams: { id: string; name: string }[]; calendar: { team_id: string; date: string; contracts: string[] }[];
  doubleBooked: number; idle: { team: string; days: number }[]; unplannedJobs: { id: string; label: string }[];
  starts: { id: string; label: string; on: string; ready: boolean; missing: string[] }[];
  materials: { id: string; job: string; contract_id: string; item: string; quantity: number; unit: string; needed_by: string | null; status: string }[] | null;
  deadlines: Deadline[];
};
export type AdminView = {
  customers: number | null; gangs: { id: string; name: string; steps: OnboardingStep[] }[] | null;
  insurance: { company: string; type: string; on: string; expired: boolean }[]; tenders: number | null; quotes: number | null;
  startup: { count: number; amount: number } | null; notifications: { live: boolean; recipients: number } | null;
};
export type CommandCentreData = {
  today: string; yesterday: string; financial: boolean; jobs: LiveJob[]; upcomingJobs: LiveJob[]; yesterdayJobs: YesterdayJob[]; inbox: InboxCounts;
  money: MoneyView | null; planning: PlanningView; admin: AdminView; jobLabels: Map<string, string>;
};

/**
 * Everything the command centre shows beyond the action queue, read with the signed-in person's own
 * session. Row-level security decides what each person sees; money is read only with money access.
 */
export async function loadCommandCentre(supabase: SupabaseClient, member: Member, snapshot: NextActionSnapshot, actions: ViewerAction[]): Promise<CommandCentreData> {
  const today = snapshot.today ?? londonDate();
  const yesterday = addDays(today, -1);
  const horizon = addDays(today, 14);
  const financial = canReadFinancial(member);
  const owner = member.role === "owner";

  const contractRows = await optional(supabase.from("contracts").select("id,reference,name,client,start_date,end_date,lifecycle_stage,customer_id").order("start_date"))
    ?? await required(supabase.from("contracts").select("id,reference,name,client,start_date,end_date").order("start_date"));
  const ids = contractRows.map(row => String(row.id));
  const jobLabels = new Map(contractRows.map(row => [String(row.id), `${row.reference} · ${row.name}`]));
  const yStart = londonTimeToIso(yesterday, "00:00"), tStart = londonTimeToIso(today, "00:00");
  const scoped = <T>(fn: () => PromiseLike<T>, fallback: T) => (ids.length ? fn() : Promise.resolve(fallback));

  const [packages, plans, actuals, handovers, progress, photos, inspections, newIssues, openMaterials, gangInvoices, teams, customers, tenders] = await Promise.all([
    scoped(() => required(supabase.from("work_packages").select("id,contract_id,name,unit,quantity").in("contract_id", ids)), [] as Row[]),
    scoped(() => required(supabase.from("planned_allocations").select("id,contract_id,team_id,planned_start,planned_end").in("contract_id", ids)
      .lte("planned_start", horizon).gte("planned_end", today).is("cancelled_at", null).is("superseded_by", null)), [] as Row[]),
    scoped(() => required(supabase.from("actual_allocations").select("id,contract_id,team_id,work_date").in("contract_id", ids).in("work_date", [yesterday, today]).is("voided_at", null)), [] as Row[]),
    scoped(() => required(supabase.from("site_handovers").select("id,contract_id,actor_name,work_date,work_completed,outstanding_problems,materials_needed,areas_awaiting_attention,office_notes")
      .in("contract_id", ids).eq("work_date", yesterday).order("created_at")), [] as Row[]),
    scoped(() => optional(supabase.from("site_progress_entries").select("id,contract_id,work_date,work_package_id,description,quantity,unit,location_path").in("contract_id", ids).is("voided_at", null)), [] as Row[]),
    scoped(() => optional(supabase.from("site_photos").select("id,contract_id,object_path,caption").in("contract_id", ids).eq("work_date", yesterday).not("uploaded_at", "is", null).order("created_at")), [] as Row[]),
    scoped(() => required(supabase.from("location_inspections").select("id,contract_id,issues_count").in("contract_id", ids).gte("created_at", yStart).lt("created_at", tStart)), [] as Row[]),
    scoped(() => required(supabase.from("supervisor_issues").select("id,contract_id,check_label,severity,snag_status").in("contract_id", ids).gte("created_at", yStart).lt("created_at", tStart)), [] as Row[]),
    scoped(() => optional(supabase.from("material_requests").select("id,contract_id,item,quantity,unit,needed_by,status,requested_at").in("contract_id", ids).in("status", ["requested", "ordered"]).order("needed_by")), [] as Row[]),
    scoped(() => optional(supabase.from("gang_invoices").select("id,contract_id,status").in("contract_id", ids).in("status", ["awaiting_check", "with_office", "query_gang", "returned", "approved"])), [] as Row[]),
    required(supabase.from("teams").select("id,name,active,company_id").order("name")),
    optional(supabase.from("customers").select("id", { count: "exact", head: false }).eq("active", true)),
    optional(supabase.from("tender_enquiries").select("id,reference,project,deadline,status").in("status", ["received", "reviewing", "pricing"])),
  ]);

  // Who runs each job: active supervisors and managers assigned today (already in the snapshot).
  const memberName = new Map(snapshot.members.map(m => [m.user_id, m]));
  const people = (contractId: string, role: string) => snapshot.contract_assignments.filter(a => a.contract_id === contractId)
    .map(a => memberName.get(a.user_id)).filter(m => m && m.role === role && m.active !== false).map(m => m!.display_name);
  const teamName = new Map(teams.map(t => [String(t.id), String(t.name)]));
  const actionsByJob = new Map<string, number>();
  for (const action of actions) if (action.job.id && (action.state === "ready" || action.state === "info")) actionsByJob.set(action.job.id, (actionsByJob.get(action.job.id) ?? 0) + 1);
  const waitingThreads = (snapshot.job_threads ?? []).filter(t => t.waiting_on === "office");
  const positions = financial ? await positionsFor(supabase, ids) : null;

  const allJobs: LiveJob[] = contractRows.map(row => {
    const id = String(row.id);
    const { stage, confirmed } = jobStage(row.lifecycle_stage as string | null, row.start_date as string | null, row.end_date as string | null, today);
    const pkg: PackageProgress[] = packages.filter(p => p.contract_id === id).map(p => ({ id: String(p.id), name: String(p.name), unit: String(p.unit), quantity: n(p.quantity),
      done: (progress ?? []).filter(e => e.work_package_id === p.id).reduce((sum, e) => sum + n(e.quantity), 0) }));
    const pct = progressPercent(pkg);
    const holds = snapshot.work_holds.filter(h => h.contract_id === id);
    const snags = snapshot.supervisor_issues.filter(i => i.contract_id === id && !["closed", "cancelled"].includes(i.snag_status));
    const position = positions?.get(id);
    return {
      id, reference: String(row.reference), name: String(row.name), client: String(row.client ?? ""), stage, stageConfirmed: confirmed,
      start: (row.start_date as string | null) ?? null, end: (row.end_date as string | null) ?? null,
      supervisors: people(id, "supervisor"), managers: people(id, "contracts_manager"),
      gangsPlannedToday: [...new Set(plans.filter(p => p.contract_id === id && String(p.planned_start) <= today && String(p.planned_end) >= today).map(p => teamName.get(String(p.team_id)) ?? "Gang"))],
      gangsOnSiteToday: new Set(actuals.filter(a => a.contract_id === id && a.work_date === today).map(a => a.team_id)).size,
      peopleOnSiteToday: actuals.filter(a => a.contract_id === id && a.work_date === today).length,
      progress: pct, programme: programmePercent(row.start_date as string | null, row.end_date as string | null, today),
      status: programmeStatus({ start: row.start_date as string | null, end: row.end_date as string | null, today, progress: pct, stage }), packages: pkg,
      stops: holds.length, safetyStops: holds.filter(h => h.hold_type === "safety").length, openSnags: snags.length, criticalSnags: snags.filter(s => s.severity === "critical").length,
      openActions: actionsByJob.get(id) ?? 0, waitingOnOffice: waitingThreads.filter(t => t.contract_id === id).length,
      money: position ? { value: position.revised_value, cost: position.actual_cost, forecastProfit: position.forecast_profit, margin: position.forecast_margin,
        target: position.target_margin, below: belowTarget(position) } : null,
    };
  });
  const jobs = allJobs.filter(job => ACTIVE_STAGES.includes(job.stage));
  const upcomingJobs = allJobs.filter(job => job.stage === "won" || job.stage === "tender");

  // Yesterday on site, for every job that had anything recorded or is running now.
  const photoUrls = new Map<string, string>();
  const shown = (photos ?? []).filter((photo, index, list) => list.filter(p => p.contract_id === photo.contract_id).indexOf(photo) < 4);
  if (shown.length) {
    const signed = await supabase.storage.from("supervisor-evidence").createSignedUrls(shown.map(p => String(p.object_path)), 600);
    for (const [index, item] of (signed.data ?? []).entries()) if (item.signedUrl) photoUrls.set(String(shown[index].id), item.signedUrl);
  }
  const yesterdayJobs: YesterdayJob[] = allJobs.filter(job => ACTIVE_STAGES.includes(job.stage)
    || handovers.some(h => h.contract_id === job.id) || actuals.some(a => a.contract_id === job.id && a.work_date === yesterday)).map(job => {
    const y = actuals.filter(a => a.contract_id === job.id && a.work_date === yesterday);
    return {
      id: job.id, reference: job.reference, name: job.name,
      handovers: handovers.filter(h => h.contract_id === job.id).map(h => ({ id: String(h.id), actor: String(h.actor_name), completed: String(h.work_completed ?? ""),
        problems: meaningfulText(h.outstanding_problems as string) ? String(h.outstanding_problems) : null,
        materials: meaningfulText(h.materials_needed as string) ? String(h.materials_needed) : null,
        attention: meaningfulText(h.areas_awaiting_attention as string) ? String(h.areas_awaiting_attention) : null,
        office: meaningfulText(h.office_notes as string) ? String(h.office_notes) : null })),
      teams: [...new Set(y.map(a => teamName.get(String(a.team_id)) ?? "Gang"))], people: y.length,
      progress: (progress ?? []).filter(e => e.contract_id === job.id && e.work_date === yesterday).map(e => ({ description: String(e.description),
        quantity: e.quantity === null ? null : n(e.quantity), unit: (e.unit as string | null) ?? null, where: ((e.location_path as string[]) ?? []).join(" › ") })),
      photos: shown.filter(p => p.contract_id === job.id).map(p => ({ id: String(p.id), url: photoUrls.get(String(p.id)) ?? null, caption: (p.caption as string | null) ?? null })),
      photoCount: (photos ?? []).filter(p => p.contract_id === job.id).length,
      inspections: inspections.filter(i => i.contract_id === job.id).length, failedInspections: inspections.filter(i => i.contract_id === job.id && n(i.issues_count) > 0).length,
      snags: newIssues.filter(i => i.contract_id === job.id && i.snag_status !== null && i.snag_status !== "draft").map(i => ({ id: String(i.id), label: String(i.check_label), severity: (i.severity as string | null) ?? null })),
      holds: snapshot.work_holds.filter(h => h.contract_id === job.id).map(h => ({ id: h.id, type: h.hold_type, reason: h.reason })),
      materials: (openMaterials ?? []).filter(m => m.contract_id === job.id && String(m.requested_at ?? "") >= yStart && String(m.requested_at ?? "") < tStart)
        .map(m => ({ id: String(m.id), item: String(m.item), quantity: n(m.quantity), unit: String(m.unit) })),
      waitingOnOffice: job.waitingOnOffice,
    };
  });

  // The inbox counts behind the headline figures.
  const reviewed = new Set((snapshot.office_reviews ?? []).map(r => r.handover_id).filter(Boolean));
  const reports = (snapshot.handover_notes ?? []).filter(h => h.work_date >= addDays(today, -7) && !reviewed.has(h.id)
    && [h.outstanding_problems, h.areas_awaiting_attention, h.office_notes].some(meaningfulText)).length
    + (snapshot.qa_results ?? []).filter(r => r.has_issues && !r.followed_up && !(snapshot.office_reviews ?? []).some(v => v.qa_submission_id === r.submission_id)).length;
  const acknowledged = new Set(snapshot.supervisor_office_acknowledgements.map(a => a.item_id));
  const withdrawn = new Set((snapshot.office_item_withdrawals ?? []).map(w => w.item_id));
  const instructions = snapshot.supervisor_office_items.filter(i => i.kind === "instruction" && i.acknowledgement_required && !acknowledged.has(i.id) && !withdrawn.has(i.id)
    && !snapshot.supervisor_office_items.some(m => m.replaces_id === i.id)).length;
  const qa = snapshot.supervisor_office_items.filter(i => i.kind === "qa_request" && !snapshot.supervisor_qa_submissions.some(q => q.item_id === i.id) && !withdrawn.has(i.id)).length;
  const gangChecks = (gangInvoices ?? []).filter(g => g.status === "awaiting_check").length;
  const gangApprovals = financial ? (gangInvoices ?? []).filter(g => g.status === "with_office").length : 0;
  const drafts = (snapshot.draft_snags ?? []).filter(d => d.created_at.slice(0, 10) < today).length;
  const inbox: InboxCounts = { threads: waitingThreads.length, urgent: 0, reports, instructions, qa, gangChecks, gangApprovals, drafts,
    total: waitingThreads.length + reports + instructions + qa + gangChecks + gangApprovals + drafts };

  // Money: only for money access, from the database's own calculations.
  let moneyView: MoneyView | null = null;
  if (financial) {
    const [debts, cash, commercials, quotes, retention] = await Promise.all([
      optional<DebtLine>(supabase.rpc("debtor_ledger")),
      optional<CashLine>(supabase.rpc("cash_flow_lines", { p_weeks: 8 })),
      ids.length ? optional(supabase.from("gang_invoice_commercials").select("invoice_id,contract_id,invoice_total,approved_amount,net_payable,retention_amount,cis_amount,payment_due_on,agreed_payment_on,paid_on").in("contract_id", ids)) : Promise.resolve([] as Row[]),
      optional(supabase.from("quotes").select("id,status,value_net,follow_up_on").eq("status", "sent")),
      ids.length ? optional(supabase.from("gang_retention_releases").select("amount,voided_at").in("contract_id", ids)) : Promise.resolve([] as Row[]),
    ]);
    const status = new Map((gangInvoices ?? []).map(g => [String(g.id), String(g.status)]));
    const all = await optional(supabase.from("gang_invoices").select("id,status").in("contract_id", ids.length ? ids : ["00000000-0000-4000-8000-000000000000"]).in("status", ["approved", "paid"]));
    for (const g of all ?? []) status.set(String(g.id), String(g.status));
    const sum = (rows: Row[], key: (row: Row) => number) => Math.round(rows.reduce((total, row) => total + key(row), 0) * 100) / 100;
    const of = (wanted: string[]) => (commercials ?? []).filter(c => wanted.includes(status.get(String(c.invoice_id)) ?? ""));
    const approvedUnpaid = of(["approved"]).filter(c => !c.paid_on);
    const due = (c: Row) => String(c.agreed_payment_on ?? c.payment_due_on ?? "");
    const monthStart = `${today.slice(0, 7)}-01`;
    const debtLines = (debts ?? []).map(d => ({ ...d, outstanding: n(d.outstanding), days_overdue: n(d.days_overdue), job: jobLabels.get(d.contract_id) ?? "Job" }));
    const dayworks = snapshot.dayworks ?? [];
    moneyView = {
      ageing: ageing(debtLines), debts: debtLines.sort((a, b) => b.days_overdue - a.days_overdue || b.outstanding - a.outstanding),
      cash: cashWeeks((cash ?? []).map(c => ({ ...c, amount: n(c.amount) })), today, 8),
      gang: {
        toCheck: { count: of(["awaiting_check"]).length, amount: sum(of(["awaiting_check"]), c => n(c.invoice_total)) },
        toApprove: { count: of(["with_office"]).length, amount: sum(of(["with_office"]), c => n(c.invoice_total)) },
        dueWeek: { count: approvedUnpaid.filter(c => due(c) <= addDays(today, 7)).length, amount: sum(approvedUnpaid.filter(c => due(c) <= addDays(today, 7)), c => n(c.net_payable ?? c.approved_amount)) },
        overdue: { count: approvedUnpaid.filter(c => due(c) < today).length, amount: sum(approvedUnpaid.filter(c => due(c) < today), c => n(c.net_payable ?? c.approved_amount)) },
        retentionHeld: Math.max(0, sum(of(["approved", "paid"]), c => n(c.retention_amount)) - sum((retention ?? []).filter(r => !r.voided_at), r => n(r.amount))),
        cisThisMonth: sum(of(["paid"]).filter(c => String(c.paid_on ?? "") >= monthStart), c => n(c.cis_amount)),
      },
      quotes: quotes ? { open: quotes.length, value: sum(quotes, q => n(q.value_net)), followUps: quotes.filter(q => q.follow_up_on && String(q.follow_up_on) <= today).length } : null,
      extras: { toPrice: dayworks.filter(d => d.commercial_status === "awaiting_pricing" && d.site_status === "sent").length,
        awaitingClient: dayworks.filter(d => d.client_status === "not_authorised" && d.client_authorisation_required && d.office_status === "approved").length },
      positions: allJobs.filter(job => job.money && (ACTIVE_STAGES.includes(job.stage) || job.stage === "final_account")).map(job => ({ id: job.id, job: `${job.reference} · ${job.name}`,
        value: job.money!.value, cost: job.money!.cost, profit: job.money!.forecastProfit, margin: job.money!.margin, target: job.money!.target, below: job.money!.below })),
    };
  }

  // Planning: the next 14 days.
  const days = workingDays(today, 14);
  const activeTeams = teams.filter(t => t.active !== false);
  const gaps = staffingGaps({ plans: plans.map(p => ({ id: String(p.id), contract_id: String(p.contract_id), team_id: String(p.team_id), planned_start: String(p.planned_start), planned_end: String(p.planned_end) })),
    activeJobs: jobs.filter(j => ["mobilising", "live"].includes(j.stage)).map(j => ({ id: j.id, start: j.start, end: j.end })), teamIds: activeTeams.map(t => String(t.id)), days });
  const setup = actions.filter(a => a.rule === "R08");
  const deadlines: Deadline[] = [
    ...allJobs.filter(j => j.end && j.end >= today && j.end <= horizon && ["mobilising", "live"].includes(j.stage)).map(j => ({ on: j.end!, what: "Programme finish", job: `${j.reference} · ${j.name}`, href: `/admin/contracts/${j.id}/programme` })),
    ...(tenders ?? []).filter(t => t.deadline && String(t.deadline) <= horizon).map(t => ({ on: String(t.deadline), what: `Tender return: ${t.project || t.reference}`, job: null, href: "/admin/tenders" })),
    ...actions.filter(a => (a.rule === "G07" || a.rule === "R16") && a.due && a.due <= horizon).map(a => ({ on: a.due!, what: a.title, job: [a.job.reference, a.job.name].filter(Boolean).join(" · "), href: a.job.id ? `/admin/supervisor/sites/${a.job.id}/inspections` : "/admin/quality" })),
    ...snapshot.company_insurances.filter(i => i.expires_on >= today && i.expires_on <= addDays(today, 30)).map(i => ({ on: i.expires_on,
      what: `${snapshot.companies.find(c => c.id === i.company_id)?.name ?? "Company"} ${i.insurance_type.replaceAll("_", " ")} insurance expires`, job: null, href: "/admin/workforce" })),
  ].sort((a, b) => a.on.localeCompare(b.on));
  const planning: PlanningView = {
    days, teams: activeTeams.map(t => ({ id: String(t.id), name: String(t.name) })), calendar: gaps.calendar,
    doubleBooked: gaps.doubleBooked.length, idle: gaps.idle.map(i => ({ team: teamName.get(i.team_id) ?? "Gang", days: i.days.length })),
    unplannedJobs: gaps.unplannedJobs.map(id => ({ id, label: jobLabels.get(id) ?? "Job" })),
    starts: allJobs.filter(j => j.start && j.start >= today && j.start <= horizon).map(j => ({ id: j.id, label: `${j.reference} · ${j.name}`, on: j.start!,
      missing: setup.filter(a => a.job.id === j.id).map(a => a.title), ready: !setup.some(a => a.job.id === j.id) })),
    materials: openMaterials ? openMaterials.map(m => ({ id: String(m.id), job: jobLabels.get(String(m.contract_id)) ?? "Job", contract_id: String(m.contract_id), item: String(m.item),
      quantity: n(m.quantity), unit: String(m.unit), needed_by: (m.needed_by as string | null) ?? null, status: String(m.status) })) : null,
    deadlines,
  };

  // Administration: onboarding, compliance, sales and settings.
  let gangs: AdminView["gangs"] = null;
  if (financial) {
    const teamIds = activeTeams.map(t => String(t.id));
    const [tax, bank, agreements, links, subcontracts, rates] = teamIds.length ? await Promise.all([
      optional(supabase.from("subcontractor_tax_profiles").select("team_id,cis_status").in("team_id", teamIds)),
      optional(supabase.from("subcontractor_bank_details").select("team_id").in("team_id", teamIds)),
      optional(supabase.from("subcontractor_agreements").select("team_id,status").in("team_id", teamIds)),
      optional(supabase.from("subcontractor_portal_links").select("team_id,expires_at,revoked_at").in("team_id", teamIds).is("revoked_at", null)),
      optional(supabase.from("gang_subcontracts").select("team_id,active").in("team_id", teamIds).eq("active", true)),
      optional(supabase.from("gang_rates").select("team_id").in("team_id", teamIds).is("voided_at", null)),
    ]) : [[], [], [], [], [], []];
    if (tax && bank && agreements && links) {
      const now = new Date().toISOString();
      gangs = activeTeams.map(t => {
        const id = String(t.id);
        const cover = t.company_id ? snapshot.company_insurances.filter(i => i.company_id === t.company_id) : [];
        const steps = onboardingSteps({ team_id: id, name: String(t.name), active: true, company_id: (t.company_id as string | null) ?? null,
          tax_profile: (tax.find(x => x.team_id === id) as { cis_status: string } | undefined) ?? null, bank: bank.some(x => x.team_id === id),
          agreement: agreements.some(x => x.team_id === id && x.status === "signed") ? "signed" : agreements.some(x => x.team_id === id && x.status === "issued") ? "issued" : "none",
          live_link: links.some(x => x.team_id === id && String(x.expires_at) > now), insurance_ok: cover.length ? cover.every(i => i.expires_on >= today) : false,
          on_jobs: (subcontracts ?? []).filter(x => x.team_id === id).length, rates: (rates ?? []).filter(x => x.team_id === id).length });
        return { id, name: String(t.name), steps };
      });
    }
  }
  const insurance = snapshot.company_insurances.filter(i => i.expires_on <= addDays(today, 30)).map(i => ({ company: snapshot.companies.find(c => c.id === i.company_id)?.name ?? "Company",
    type: i.insurance_type.replaceAll("_", " "), on: i.expires_on, expired: i.expires_on < today }));
  const latest = new Map<string, (typeof insurance)[number]>();
  for (const i of insurance) { const key = `${i.company}:${i.type}`; if (!latest.has(key) || latest.get(key)!.on < i.on) latest.set(key, i); }
  const [startup, notifications] = await Promise.all([
    financial ? optional(supabase.from("startup_expenses").select("amount_gbp,reimbursed_gbp,payment_source").eq("payment_source", "personal")) : Promise.resolve(null),
    owner ? optional(supabase.from("notification_settings").select("live")) : Promise.resolve(null),
  ]);
  const recipients = owner && notifications ? await optional(supabase.from("notification_recipients").select("id").eq("active", true).not("confirmed_at", "is", null)) : null;
  const unpaid = (startup ?? []).filter(e => n(e.reimbursed_gbp) < n(e.amount_gbp));
  const admin: AdminView = {
    customers: customers ? customers.length : null, gangs, insurance: [...latest.values()].sort((a, b) => a.on.localeCompare(b.on)),
    tenders: tenders ? tenders.length : null, quotes: moneyView?.quotes?.open ?? null,
    startup: startup ? { count: unpaid.length, amount: Math.round(unpaid.reduce((s, e) => s + n(e.amount_gbp) - n(e.reimbursed_gbp), 0) * 100) / 100 } : null,
    notifications: notifications ? { live: notifications[0]?.live === true, recipients: recipients?.length ?? 0 } : null,
  };
  return { today, yesterday, financial, jobs, upcomingJobs, yesterdayJobs, inbox, money: moneyView, planning, admin, jobLabels };
}
