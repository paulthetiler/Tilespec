import type { MemberRole } from "./next-actions/types";

/*
 * Role-specific navigation (behind FEATURE_ROLE_SHELL). At most four primary destinations
 * per role, and every link opens a page that already exists. Nothing is removed: records
 * that are no longer a primary destination stay reachable under "Everything else".
 */
export type Destination = { key: string; label: string; href: string; icon: "home" | "briefcase" | "pound" | "inbox" | "users" | "clipboard" | "alert" | "wrench" | "file" };
export const MAX_DESTINATIONS = 4;

export const SITE_PATH = /^\/admin\/supervisor\/sites\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;
export const siteBaseOf = (pathname: string) => {
  const match = SITE_PATH.exec(pathname);
  return match ? `/admin/supervisor/sites/${match[1]}` : null;
};

export function destinationsFor(role: MemberRole, pathname: string): Destination[] {
  switch (role) {
    case "owner":
      return [
        { key: "today", label: "Today", href: "/admin", icon: "home" },
        { key: "jobs", label: "Jobs", href: "/admin/contracts", icon: "briefcase" },
        { key: "money", label: "Money", href: "/admin/money", icon: "pound" },
      ];
    case "contracts_manager":
      return [
        { key: "today", label: "Today", href: "/admin", icon: "home" },
        { key: "jobs", label: "Jobs", href: "/admin/contracts", icon: "briefcase" },
        { key: "tenders", label: "Tenders", href: "/admin/tenders", icon: "inbox" },
        { key: "labour", label: "Labour", href: "/admin/workforce", icon: "users" },
      ];
    case "supervisor": {
      const base = siteBaseOf(pathname);
      if (!base) return [{ key: "today", label: "Today", href: "/admin/supervisor", icon: "home" }];
      return [
        { key: "today", label: "Today", href: base, icon: "home" },
        { key: "people", label: "People", href: `${base}/workforce`, icon: "users" },
        { key: "inspect", label: "Inspect", href: `${base}/inspections`, icon: "clipboard" },
        { key: "issues", label: "Issues", href: `${base}/snags`, icon: "alert" },
      ];
    }
    default:
      return [
        { key: "today", label: "Today", href: "/admin", icon: "home" },
        { key: "fixes", label: "Fixes", href: "/admin/snags", icon: "wrench" },
        { key: "paperwork", label: "Paperwork", href: "/admin/contracts", icon: "file" },
      ];
  }
}

/** The one destination that is current for a path. Longest matching link wins, so "Today" is not always highlighted. */
export function currentDestination(items: Destination[], pathname: string): string | null {
  const hits = items.filter(i => pathname === i.href || pathname.startsWith(`${i.href}/`));
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0]?.key ?? null;
}

/** The full original menu, kept as a secondary "Everything else" list so no page becomes unreachable. */
export function everythingElse(role: MemberRole, financial: boolean): { label: string; href: string }[] {
  if (role === "supervisor") return [{ label: "Choose another site", href: "/admin/supervisor" }, { label: "Snag register", href: "/admin/snags" }, { label: "Holds and releases", href: "/admin/holds" }];
  if (role === "lead_installer" || role === "subcontract_installer") return [{ label: "Assigned holds", href: "/admin/holds" }];
  const office = role === "owner" || role === "contracts_manager";
  return [
    { label: "Overview", href: "/admin" }, { label: "Contracts", href: "/admin/contracts" },
    ...(office ? [{ label: "Workforce", href: "/admin/workforce" }] : []),
    { label: "Site dashboards", href: "/admin/supervisor" }, { label: "Snag register", href: "/admin/snags" }, { label: "Holds and releases", href: "/admin/holds" },
    { label: "Site alerts", href: "/admin/alerts" },
    ...(office ? [{ label: "Quality control", href: "/admin/quality" }, { label: "Tenders", href: "/admin/tenders" }] : []),
    ...(role === "owner" ? [{ label: "User access", href: "/admin/team" }] : []),
    ...(financial ? [{ label: "Estimator", href: "/admin/estimator" }, { label: "Money", href: "/admin/money" }] : []),
  ];
}
