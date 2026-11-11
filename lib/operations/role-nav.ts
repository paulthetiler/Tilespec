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

export function destinationsFor(role: MemberRole, pathname: string, financial = role === "owner"): Destination[] {
  switch (role) {
    case "owner":
      return [
        { key: "today", label: "Today", href: "/admin", icon: "home" },
        { key: "inbox", label: "Inbox", href: "/admin/inbox", icon: "inbox" },
        { key: "jobs", label: "Jobs", href: "/admin/contracts", icon: "briefcase" },
        ...(financial ? [{ key: "money", label: "Money", href: "/admin/finance", icon: "pound" } as Destination] : []),
      ];
    case "contracts_manager":
      return [
        { key: "today", label: "Today", href: "/admin", icon: "home" },
        { key: "inbox", label: "Inbox", href: "/admin/inbox", icon: "inbox" },
        { key: "jobs", label: "Jobs", href: "/admin/contracts", icon: "briefcase" },
        { key: "people", label: "People", href: "/admin/workforce", icon: "users" },
      ];
    case "supervisor": {
      const base = siteBaseOf(pathname);
      if (!base) return [{ key: "today", label: "Today", href: "/admin/supervisor", icon: "home" }];
      return [
        { key: "today", label: "Today", href: base, icon: "home" },
        { key: "people", label: "People", href: `${base}/workforce`, icon: "users" },
        { key: "inspect", label: "Inspect", href: `${base}/inspections`, icon: "clipboard" },
        { key: "documents", label: "Docs", href: `${base}/documents`, icon: "file" },
      ];
    }
    default:
      // A gang's day starts with its own invoices: what it has sent, what is checked and when it is paid.
      return [
        { key: "today", label: "Today", href: "/admin/gang", icon: "home" },
        { key: "fixes", label: "Fixes", href: "/admin/snags", icon: "wrench" },
        { key: "paperwork", label: "Paperwork", href: "/admin/contracts", icon: "file" },
      ];
  }
}

/** The one destination that is current for a path. Longest matching link wins, so "Today" is not always highlighted. */
export function currentDestination(items: Destination[], pathname: string): string | null {
  const hits = items.filter(i => pathname === i.href || (i.href !== "/admin" && pathname.startsWith(`${i.href}/`)));
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0]?.key ?? null;
}

/**
 * The full original menu, kept as a secondary "Everything else" list so no page becomes unreachable.
 * A supervisor has none: every site record is reached from Today, which also offers "Change site".
 */
export function everythingElse(role: MemberRole, financial: boolean): { label: string; href: string }[] {
  if (role === "supervisor") return [];
  if (role === "lead_installer" || role === "subcontract_installer") return [{ label: "Your invoices", href: "/admin/gang" }, { label: "Assigned holds", href: "/admin/holds" }];
  return officeMenu(role, financial).flatMap(section => section.links);
}

export type MenuSection = { title: string; links: { label: string; href: string }[] };
/**
 * The office's complete menu, grouped. Shown as the sidebar on a desk and as "Menu" on a phone, the same
 * on every page. Money, quotations and business settings appear only with money access; user access and
 * email notifications only for the owner.
 */
export function officeMenu(role: MemberRole, financial: boolean): MenuSection[] {
  if (role !== "owner" && role !== "contracts_manager") return [];
  const owner = role === "owner";
  const sections: MenuSection[] = [
    { title: "Command centre", links: [{ label: "Today", href: "/admin" }, { label: "Inbox", href: "/admin/inbox" }, { label: "Search", href: "/admin/search" }] },
    { title: "Operations", links: [
      { label: "Jobs", href: "/admin/contracts" }, { label: "Planner", href: "/admin/planner" }, { label: "Site dashboards", href: "/admin/supervisor" },
      { label: "Materials", href: "/admin/materials" }, { label: "Quality control", href: "/admin/quality" }, { label: "Snag register", href: "/admin/snags" },
      { label: "Holds and releases", href: "/admin/holds" }, { label: "Site alerts", href: "/admin/alerts" },
      { label: "Messages and handovers", href: "/admin/messages" }, { label: "Paperwork", href: "/admin/paperwork" },
    ] },
    { title: "People", links: [
      { label: "Workforce and gangs", href: "/admin/workforce" },
      ...(financial ? [{ label: "Subcontractors", href: "/admin/subcontractors" }] : []),
      ...(owner ? [{ label: "User access", href: "/admin/team" }] : []),
    ] },
    ...(financial ? [{ title: "Money", links: [
      { label: "Debtors and cash flow", href: "/admin/finance" }, { label: "Job money", href: "/admin/money" },
      { label: "Client invoices", href: "/admin/invoices" }, { label: "Gang invoices", href: "/admin/gang-invoices" },
      { label: "Startup expenses", href: "/admin/startup-expenses" },
    ] }] : []),
    { title: "Sales", links: [
      { label: "Customers", href: "/admin/customers" },
      ...(financial ? [{ label: "Quotations", href: "/admin/quotes" }] : []),
      { label: "Tenders", href: "/admin/tenders" },
      ...(financial ? [{ label: "Estimator", href: "/admin/estimator" }] : []),
    ] },
    { title: "Administration", links: [
      { label: "Marketing & SEO readiness", href: "/admin/marketing" },
      ...(financial ? [{ label: "Documents and compliance", href: "/admin/documents" }, { label: "Business settings", href: "/admin/accounts/settings" }] : []),
      ...(owner ? [{ label: "Email notifications", href: "/admin/notifications" }] : []),
    ] },
  ];
  return sections.filter(section => section.links.length);
}

/** The menu entry for a path: the longest matching link. */
export function currentMenuHref(sections: MenuSection[], pathname: string): string | null {
  const links = sections.flatMap(section => section.links);
  const hits = links.filter(link => pathname === link.href || (link.href !== "/admin" && pathname.startsWith(`${link.href}/`)));
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0]?.href ?? null;
}
