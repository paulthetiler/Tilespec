/*
 * Turns a queued notification into an email. The content was assembled by the database for this
 * recipient (money only for someone with money access); this file only formats it. Pure.
 */
export type RenderedEmail = { subject: string; html: string; text: string };
type Json = Record<string, unknown>;
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const gbp = (value: unknown) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value) || 0);
const day = (iso: unknown) => typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso)
  ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "";
const list = (value: unknown) => (Array.isArray(value) ? (value as Json[]) : []);

type Section = { title: string; lines: { text: string; href?: string; tone?: "alert" }[] };
function emailFrom(title: string, intro: string, sections: Section[], baseUrl: string, footer: string): { html: string; text: string } {
  const url = (path?: string) => (path ? new URL(path, baseUrl).toString() : undefined);
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:#0f2a3a">
<div style="max-width:640px;margin:auto;background:#fff;border:1px solid #d7e2e5;border-radius:10px;padding:24px">
<p style="margin:0 0 4px;color:#326e67;font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase">TileSPEC</p>
<h1 style="margin:0 0 8px;font-size:22px">${esc(title)}</h1><p style="margin:0 0 16px;color:#536b77">${esc(intro)}</p>
${sections.filter(s => s.lines.length).map(s => `<h2 style="margin:20px 0 8px;font-size:16px">${esc(s.title)}</h2><ul style="margin:0;padding-left:18px">${s.lines.map(l =>
  `<li style="margin:0 0 6px;${l.tone === "alert" ? "color:#a3261b;" : ""}">${l.href ? `<a href="${esc(url(l.href))}" style="color:#326e67">${esc(l.text)}</a>` : esc(l.text)}</li>`).join("")}</ul>`).join("")}
<p style="margin:24px 0 0"><a href="${esc(url("/admin"))}" style="display:inline-block;padding:10px 16px;background:#326e67;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Open the command centre</a></p>
<p style="margin:16px 0 0;color:#536b77;font-size:12px">${esc(footer)}</p></div></body></html>`;
  const text = [title, intro, ...sections.filter(s => s.lines.length).map(s => `\n${s.title}\n${s.lines.map(l => `- ${l.text}${l.href ? ` (${url(l.href)})` : ""}`).join("\n")}`),
    `\nOpen the command centre: ${url("/admin")}`, footer].join("\n");
  return { html, text };
}

const FOOTER = "You receive this because the owner added your TileSPEC sign-in address. The owner can change or stop these emails in TileSPEC.";

export function renderNotification(kind: string, subject: string, payload: Json, baseUrl: string): RenderedEmail {
  if (kind === "summary") return { subject, ...renderSummary(payload, baseUrl) };
  const sections: Section[] = [{ title: "Details", lines: [
    ...(payload.job ? [{ text: `Job: ${payload.job}` }] : []), ...(payload.where ? [{ text: `Where: ${payload.where}` }] : []),
    ...(payload.detail ? [{ text: String(payload.detail) }] : []), ...(payload.raised_by ? [{ text: `Raised by ${payload.raised_by}` }] : []),
    ...(payload.path ? [{ text: "Open the record", href: String(payload.path) }] : []),
  ] }];
  return { subject, ...emailFrom(String(payload.headline ?? subject), kind === "test" ? "" : "This needs attention now.", sections, baseUrl, FOOTER) };
}

export function renderSummary(p: Json, baseUrl: string): { html: string; text: string } {
  const money = p.money && typeof p.money === "object" ? p.money as Json : null;
  const yesterday = list(p.yesterday);
  const sections: Section[] = [
    { title: "Stopped work", lines: list(p.stops).map(s => ({ text: `${s.type === "safety" ? "Safety stop" : "Quality hold"}: ${s.job}${s.where ? `, ${s.where}` : ""}. ${s.reason}`, href: String(s.path), tone: s.type === "safety" ? "alert" as const : undefined })) },
    { title: "Waiting for your answer", lines: list(p.waiting).map(w => ({ text: `${w.urgent ? "URGENT " : ""}${w.category === "decision" ? "Decision" : w.category === "problem" ? "Problem" : "Question"} from ${w.from} on ${w.job}: ${w.text}`, href: String(w.path) })) },
    { title: "Yesterday on site", lines: yesterday.map(y => ({ text: `${y.job}: ${y.handover ? "report received" : "NO REPORT"}; ${y.teams} gang${y.teams === 1 ? "" : "s"} on site; ${y.progress} progress ${y.progress === 1 ? "entry" : "entries"}; ${y.photos} photo${y.photos === 1 ? "" : "s"}; ${y.inspections} inspection${y.inspections === 1 ? "" : "s"}; ${y.snags} new snag${y.snags === 1 ? "" : "s"}${y.problems ? `. Problems: ${y.problems}` : ""}`,
      href: String(y.path), tone: !y.handover || y.problems ? "alert" as const : undefined })) },
    { title: "Today", lines: list(p.today).map(t => ({ text: `${t.job}: ${t.teams} gang${t.teams === 1 ? "" : "s"} planned` })) },
    { title: "Coming up", lines: list(p.upcoming).map(u => ({ text: `${day(u.on)}: ${u.what}${u.job ? ` (${u.job})` : ""}` })) },
    { title: "Also waiting", lines: [
      ...(Number(p.unreviewed) > 0 ? [{ text: `${p.unreviewed} site report${p.unreviewed === 1 ? "" : "s"} with problems not reviewed`, href: "/admin/inbox#reports" }] : []),
      ...(Number(p.gang_checks) > 0 ? [{ text: `${p.gang_checks} gang claim${p.gang_checks === 1 ? "" : "s"} waiting for a supervisor to verify`, href: "/admin/gang-invoices" }] : []),
    ] },
    ...(money ? [{ title: "Money", lines: [
      ...list(money.overdue).map(o => ({ text: `Overdue: ${o.job}, application ${o.application}: ${gbp(o.outstanding)}, ${o.days} days late`, href: "/admin/finance#debtors", tone: "alert" as const })),
      ...(Number(money.gang_to_approve) > 0 ? [{ text: `${money.gang_to_approve} gang claim${money.gang_to_approve === 1 ? "" : "s"} ready for approval`, href: "/admin/gang-invoices" }] : []),
      ...(Number(money.gang_due_7_days) > 0 ? [{ text: `Gang payments due within 7 days: ${gbp(money.gang_due_7_days)}`, href: "/admin/finance#cash-flow" }] : []),
      ...(Number(money.quotes_follow_up) > 0 ? [{ text: `${money.quotes_follow_up} quotation follow-up${money.quotes_follow_up === 1 ? "" : "s"} due`, href: "/admin/quotes?status=sent" }] : []),
    ] }] : []),
  ];
  const quiet = sections.every(s => !s.lines.length);
  return emailFrom(`Good morning${p.recipient ? `, ${String(p.recipient).split(/\s+/)[0]}` : ""}`,
    quiet ? "Nothing needs your attention this morning." : `Your TileSPEC summary for ${day(p.date)}.`, sections, baseUrl, FOOTER);
}
