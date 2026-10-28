import { DEFAULT_CONFIG, resolveTimings, type NextActionConfig } from "./config";
import { makeLookups, roleKey, visibleContractIds } from "./lookups";
import { rules } from "./rules";
import type { NextAction, NextActionSnapshot, Viewer, ViewerAction, RoleKey } from "./types";

/*
 * The single entry point. Every screen, for every role, calls compute() and nothing else.
 * There is deliberately no second implementation anywhere (the supervisor dashboard included).
 */

function forViewer(raw: NextAction, viewer: Viewer, s: NextActionSnapshot, L: ReturnType<typeof makeLookups>): ViewerAction | null {
  const key = roleKey(viewer);
  const mode = raw.audience[key];
  if (!mode) return null;
  if (mode === "act" && raw.completedUsers?.includes(viewer.user_id)) return null;
  if (raw.financial && key === "office" && !viewer.financial_access) return null;
  if (key === "subcontractor") {
    // A gang only ever receives actions for its own team.
    const teams = L.teamIdsOf(viewer.user_id);
    if (!raw.parties || !raw.parties.teamIds.some(t => !!t && teams.includes(t))) return null;
  }
  const a: ViewerAction = { ...raw, viewerMode: mode, state: mode === "act" ? "ready" : "waiting", blockedBy: null };
  if (raw.actUsers && mode === "act" && !raw.actUsers.includes(viewer.user_id)) { a.state = "waiting"; a.viewerMode = "see"; }
  if (mode === "act" && raw.blockers?.length) { a.state = "blocked"; a.blockedBy = raw.blockers[0]; }
  // Independence is explicit: someone who raised or repaired it sees "blocked", never "ready".
  const barred = mode === "act" && raw.independence?.forbidden.find(f => f.userId === viewer.user_id);
  if (barred) { a.state = "blocked"; a.blockedBy = barred.reason; }
  if (raw.informationOnly && a.state === "ready") a.state = "info";
  a.overdue = !!(a.due && a.due < s.today && a.kind !== "gate") || !!raw.overdue;
  return a;
}

const KIND_RANK = { gate: 0, alert: 1, reminder: 2 } as const;
const isActionable = (a: ViewerAction) => a.state === "ready" || a.state === "info";

export function compute(s: NextActionSnapshot, viewer: Viewer, config: NextActionConfig = DEFAULT_CONFIG): ViewerAction[] {
  const L = makeLookups(s);
  const timings = new Map(s.contracts.map(c => [c.id, resolveTimings(config, c.working_hours)] as const));
  const fallback = resolveTimings(config, null);
  const ctx = { s, L, cfg: config, timingsFor: (id: string) => timings.get(id) ?? fallback };
  const visible = new Set(visibleContractIds(s, viewer));
  const staff = viewer.role === "owner" || viewer.role === "contracts_manager";
  const mine = rules.flatMap(r => r.fn(ctx))
    .filter(a => (a.job.id ? visible.has(a.job.id) : staff))
    .map(a => forViewer(a, viewer, s, L)).filter((a): a is ViewerAction => !!a);
  mine.sort((a, b) => (isActionable(a) ? 0 : 1) - (isActionable(b) ? 0 : 1) || a.priority - b.priority || a.order - b.order
    || KIND_RANK[a.kind] - KIND_RANK[b.kind] || String(a.due ?? "9999").localeCompare(String(b.due ?? "9999")) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return mine.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

/**
 * What Office Today shows. It never shows money figures: the budget margin (the only "money"
 * process) belongs on the Money page. Actions meant only for money access that carry no figures,
 * such as pricing a daywork or approving its charge, do appear; the engine already gives them
 * only to people with money access.
 */
export const withoutFigures = (actions: ViewerAction[]) => actions.filter(a => a.process !== "money");

/** The one prominent action. Only a "ready" action can be primary. If there is nothing to do, say so rather than invent work. */
export function nextAction(actions: ViewerAction[]): ViewerAction | null {
  return actions.find(a => a.state === "ready") ?? null;
}

export interface Queue {
  /** Gets the main button. */
  next: ViewerAction | null;
  /** Everything else this person can act on. Never truncated: the rest of the queue stays visible. */
  then: ViewerAction[];
  /** Read-only information (for example a budget margin). Never a button that leads nowhere. */
  info: ViewerAction[];
  /** Only filled when groupExceptions is set: gates, alerts and overdue items this person cannot act on. Informational items stay in `info`. */
  exceptions: ViewerAction[];
  waiting: ViewerAction[];
  /** Alerts this person must see prominently, whether or not they are the one to act. */
  alerts: ViewerAction[];
}

/** Every action lands in exactly one of next, then, info, exceptions or waiting. Nothing is hidden. */
export function buildQueue(actions: ViewerAction[], options: { groupExceptions?: boolean } = {}): Queue {
  const ready = actions.filter(a => a.state === "ready");
  const infoItems = actions.filter(a => a.state === "info");
  const rest = actions.filter(a => a.state !== "ready" && a.state !== "info");
  // Exceptions are gates, alerts and overdue items this person cannot act on.
  // Informational items (for example a low margin) stay in `info` and are never
  // counted as work to do or as a risk that has been cleared.
  const isException = (a: ViewerAction) => a.kind !== "reminder" || !!a.overdue;
  const exceptions = options.groupExceptions ? rest.filter(isException) : [];
  const remaining = rest.filter(a => !exceptions.includes(a));
  return {
    next: ready[0] ?? null,
    then: ready.slice(1),
    info: infoItems,
    exceptions,
    waiting: remaining,
    alerts: actions.filter(a => a.kind === "alert"),
  };
}

/** Counts that the owner Today header uses: actions to take vs informational alerts. */
export function queueCounts(q: Queue): { actions: number; informational: number; exceptions: number; waiting: number } {
  return {
    actions: (q.next ? 1 : 0) + q.then.length,
    informational: q.info.length,
    exceptions: q.exceptions.length,
    waiting: q.waiting.length,
  };
}

export const queueIds = (q: Queue) => [q.next, ...q.then, ...q.info, ...q.exceptions, ...q.waiting].filter((a): a is ViewerAction => !!a).map(a => a.id);

export type { RoleKey };
