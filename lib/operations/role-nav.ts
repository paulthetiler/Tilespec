import type { MemberRole } from "./next-actions/types";

/*
 * The one navigation for every role. At most four primary destinations per role: a bottom bar on a phone or
 * tablet, a row of tabs or a sidebar on a desk. The office (owner and contracts managers) also has a grouped
 * menu with everything else: the sidebar on a desk and the "Menu" tab on a phone or tablet. Every link opens a
 * page that already exists. Nothing is removed: records that are not a primary destination stay reachable
 * from the menu, from Today or from inside a job.
 */
export type Destination = { key: string; label: string; href: string; icon: "home" | "briefcase" | "pound" | "inbox" | "users" | "clipboard" | "alert" | "wrench" | "file" | "receipt" };
export const MAX_DESTINATIONS = 4;

export const SITE_PATH = /^\/admin\/supervisor\/sites\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;
export const siteBaseOf = (pathname: string) => {
  const match = SITE_PATH.exec(pathname);
  return match ? `/admin/supervisor/sites/${match[1]}` : null;
};

export const isOffice = (role: MemberRole) => role === "owner" || role === "contracts_manager";
export const isGang = (role: MemberRole) => role === "lead_installer" || role === "subcontract_installer";

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
      if (!base) return [{ key: "today", label: "My sites", href: "/admin/supervisor", icon: "home" }];
      return [
        { key: "today", label: "Today", href: base, icon: "home" },
        { key: "people", label: "People", href: `${base}/workforce`, icon: "users" },
        { key: "inspect", label: "Inspect", href: `${base}/inspections`, icon: "clipboard" },
        { key: "documents", label: "Drawings", href: `${base}/documents`, icon: "file" },
      ];
    }
    default:
      // A gang: its allocated work and drawings, the fixes it has been asked to make, and its invoices.
      return [
        { key: "today", label: "Today", href: "/admin/gang", icon: "home" },
        { key: "fixes", label: "Fixes", href: "/admin/snags", icon: "wrench" },
        { key: "paperwork", label: "Jobs", href: "/admin/contracts", icon: "file" },
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
 * Every link a role can reach beyond its tabs. For the office this is the grouped menu. A gang has its work
 * restrictions (linked from its Today page too). A supervisor has none: every site record is reached from Today.
 */
export function everythingElse(role: MemberRole, financial: boolean): { label: string; href: string }[] {
  if (role === "supervisor") return [];
  if (isGang(role)) return [{ label: "Your invoices", href: "/admin/gang" }, { label: "Work restrictions", href: "/admin/holds" }];
  return officeMenu(role, financial).flatMap(section => section.links);
}

export type MenuSection = { title: string; links: { label: string; href: string }[] };
/**
 * The office's complete menu, grouped by how the work is done rather than by database table. The same on every
 * page: the sidebar on a desk and the "Menu" tab on a phone or tablet. Money, quotations and business settings
 * appear only with money access; user access and email notifications only for the owner.
 *
 * Earlier pages that overlap are kept and reached from the page they belong to: site alerts from Stops and
 * holds, and search from the search box at the top of the menu.
 */
export function officeMenu(role: MemberRole, financial: boolean): MenuSection[] {
  if (!isOffice(role)) return [];
  const owner = role === "owner";
  const sections: MenuSection[] = [
    { title: "Today", links: [{ label: "Today", href: "/admin" }, { label: "Inbox", href: "/admin/inbox" }] },
    { title: "Jobs and sites", links: [
      { label: "Jobs", href: "/admin/contracts" }, { label: "Planner", href: "/admin/planner" },
      { label: "Sites (supervisor view)", href: "/admin/supervisor" }, { label: "Materials", href: "/admin/materials" },
      { label: "Instructions and handovers", href: "/admin/messages" }, { label: "Job documents", href: "/admin/paperwork" },
    ] },
    { title: "Quality and safety", links: [
      { label: "Stops and holds", href: "/admin/holds" }, { label: "Snags", href: "/admin/snags" }, { label: "Quality overview", href: "/admin/quality" },
    ] },
    { title: "People", links: [
      { label: "Gangs and workforce", href: "/admin/workforce" },
      ...(financial ? [{ label: "Subcontractor onboarding", href: "/admin/subcontractors" }] : []),
      ...(owner ? [{ label: "User access", href: "/admin/team" }] : []),
    ] },
    ...(financial ? [{ title: "Money", links: [
      { label: "Money overview", href: "/admin/finance" }, { label: "Job money", href: "/admin/money" },
      { label: "Customer invoices", href: "/admin/invoices" }, { label: "Gang invoices", href: "/admin/gang-invoices" },
      { label: "Startup expenses", href: "/admin/startup-expenses" },
    ] }] : []),
    { title: "Sales", links: [
      { label: "Customers", href: "/admin/customers" }, { label: "Tenders", href: "/admin/tenders" },
      ...(financial ? [{ label: "Quotations", href: "/admin/quotes" }, { label: "Estimator", href: "/admin/estimator" }] : []),
    ] },
    { title: "Settings", links: [
      ...(financial ? [{ label: "Business settings", href: "/admin/accounts/settings" }, { label: "Company documents (RAMS, COSHH)", href: "/admin/documents" }] : []),
      ...(owner ? [{ label: "Email notifications", href: "/admin/notifications" }] : []),
      { label: "Website and enquiries", href: "/admin/marketing" },
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
