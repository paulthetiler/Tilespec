import type { NextAction } from "./types";

/** Where each action opens in the real application. Only pages that already exist. */
export function actionHref(a: Pick<NextAction, "route">, siteBase: string): string {
  const r = a.route;
  switch (r.screen) {
    case "hold": case "decision": return `/admin/holds/${r.id}`;
    case "snag": return `/admin/snags/${r.id}`;
    case "fix": return r.kind === "hold" ? `/admin/holds/${r.id}` : `/admin/snags/${r.id}`;
    case "morning": return `${siteBase}/checks`;
    case "people": return r.earlier ? `${siteBase}/workforce#earlier-work` : `${siteBase}/workforce`;
    case "inspect": {
      if (r.qa) return `${siteBase}/tasks/${r.qa}`;
      const q = new URLSearchParams({ ...(r.id ? { location: r.id } : {}), ...(r.stage ? { stage: r.stage } : {}) });
      return `${siteBase}/inspections${q.size ? `?${q}` : ""}`;
    }
    case "messages": return `${siteBase}/messages`;
    case "handover": return `${siteBase}/finish`;
    case "handover-review": return `${siteBase}/messages?handover=${r.id}#handover-${r.id}`;
    case "thread": return `${siteBase}/messages?thread=${r.id}#thread-${r.id}`;
    case "job": return `/admin/contracts/${r.id}`;
    case "labour": return "/admin/workforce";
    case "money": return "/admin/money";
    default: return siteBase;
  }
}

/** Office/owner actions open the actual saved job or its existing relevant form. */
export function adminActionHref(a: Pick<NextAction, "route" | "job" | "rule">): string {
  const contractId = a.job.id;
  const base = contractId ? `/admin/supervisor/sites/${contractId}` : "/admin/supervisor";
  if ((a.rule === "G08" || a.rule === "R09") && contractId) {
    const query = new URLSearchParams({ ...(a.route.locationId ? { location: a.route.locationId } : {}), ...(a.route.stage ? { stage: a.route.stage } : {}) });
    return `${base}/inspections${query.size ? `?${query}` : ""}`;
  }
  if (a.route.screen === "job") {
    const id = a.route.id ?? contractId;
    if (!id) return "/admin/contracts";
    const job = `/admin/contracts/${id}`;
    switch (a.route.step) {
      case "details": return `${job}#contract-information`;
      case "locations": return `${job}/locations`;
      case "plan": return `${job}/plan`;
      case "supervisor": return `${job}#staff-allocations`;
      case "spec": return `${job}#documents`;
    }
    return a.rule === "R10" ? `${job}#staff-allocations` : job;
  }
  // The office reads the saved daily records. It must not be sent to a form
  // that pretends to finish another supervisor's own handover.
  if (a.route.screen === "handover" || a.route.screen === "messages") {
    return contractId ? `/admin/messages?contract_id=${encodeURIComponent(contractId)}` : "/admin/messages";
  }
  if (a.rule === "R04") return "/admin/workforce#people-heading";
  const href = actionHref(a, base);
  return href === base ? (contractId ? `/admin/contracts/${contractId}` : "/admin/contracts") : href;
}

/** True when the href is one of the existing forms, not a dump back onto Today. */
export function hrefIsExistingForm(href: string, siteBase: string): boolean {
  if (!href || href === siteBase || href === `${siteBase}/`) return false;
  const path = href.split("?")[0].split("#")[0];
  const esc = siteBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    /^\/admin\/holds\/[^/]+$/,
    /^\/admin\/snags\/[^/]+$/,
    /^\/admin\/contracts\/[^/]+$/,
    /^\/admin\/workforce$/,
    /^\/admin\/money$/,
    new RegExp(`^${esc}/(checks|workforce|inspections|messages|finish)$`),
    new RegExp(`^${esc}/tasks/[^/]+$`),
  ].some(re => re.test(path));
}
