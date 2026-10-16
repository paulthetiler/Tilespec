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
    case "job": return `/admin/contracts/${r.id}`;
    case "labour": return "/admin/workforce";
    case "money": return "/admin/money";
    default: return siteBase;
  }
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
