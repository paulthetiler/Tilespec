/*
 * Commercial documents: from an issued (or previewed) snapshot to what is printed. Pure and
 * deterministic, so the same snapshot always prints the same document.
 *
 * Every amount comes from the snapshot, which the database worked out. The only sums made here are
 * schedule subtotals, added in whole pence. Business details are printed only if TileSPEC recorded
 * them; nothing is invented, so a missing VAT number or bank detail is simply left off.
 */
import { addPence, formatPercent, formatPounds } from "../operations/money";
import type { DocumentKind, VatTreatment } from "../operations/accounts";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- snapshot JSON from the database
export type Tone = "normal" | "muted" | "subtotal" | "total" | "grand" | "deduction" | "heading";
export type Column = { label: string; width: number; align?: "left" | "right" };
export type Row = { cells: string[]; tone?: Tone };
export type Block =
  | { type: "table"; heading?: string; intro?: string; columns: Column[]; rows: Row[]; note?: string; keepTogether?: boolean }
  | { type: "summary"; heading?: string; rows: { label: string; detail?: string; value: string; tone?: Tone }[] }
  | { type: "text"; heading?: string; paragraphs: string[]; tone?: "normal" | "legal" }
  | { type: "pairs"; heading?: string; items: { label: string; value: string }[] };
export type DocumentModel = {
  kind: DocumentKind; title: string; reference: string; mode: "issued" | "preview" | "sample"; superseded: boolean; revision: string | null;
  issuedOn: string | null;
  issuer: { name: string; tradingAs: string | null; lines: string[]; legal: string[]; footer: string | null };
  parties: { label: string; lines: string[] }[];
  facts: { label: string; value: string }[];
  headline: { label: string; value: string; detail?: string } | null;
  blocks: Block[];
  checksum: string | null;
};
export type DocumentRecord = { kind: DocumentKind; reference: string | null; title: string; issued_on: string | null; snapshot: J;
  snapshot_sha256?: string | null; superseded?: boolean; preview?: boolean };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** 25 October 2026, from a calendar date. No time zone is involved. */
export function longDate(value: unknown): string {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "";
}
const shortDate = (value: unknown) => {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};
const gbp = (value: unknown) => (value === null || value === undefined ? "" : formatPounds(value as number));
const minus = (value: unknown) => (Number(value) === 0 ? formatPounds(0) : `(${formatPounds(value as number)})`);
const present = (...values: unknown[]) => values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
const isZero = (value: unknown) => value === null || value === undefined || Number(value) === 0;

const STATE_WORDS: Record<string, string> = { submitted: "Not yet agreed", approved: "Approved", disputed: "Disputed", rejected: "Rejected", draft: "With site" };
const STATUS_WORDS: Record<string, string> = { draft: "Draft", submitted: "Submitted", certified: "Certified", part_paid: "Part-paid", paid: "Paid",
  disputed: "Disputed", overdue: "Overdue", cancelled: "Cancelled" };

function issuer(s: J): DocumentModel["issuer"] {
  const i: J = s.issuer ?? {};
  const name = i.legal_name ?? i.trading_name ?? "TileSPEC";
  const tradingAs = i.legal_name && i.trading_name && i.trading_name !== i.legal_name ? i.trading_name : null;
  const legal = present(i.registered_address ? `Registered office: ${i.registered_address}` : null, i.company_number ? `Company number ${i.company_number}` : null,
    i.vat_registered && i.vat_number ? `VAT registration ${i.vat_number}` : null);
  return { name, tradingAs, lines: present(i.registered_address, i.phone, i.email, i.website), legal, footer: i.footer ?? null };
}
function parties(s: J, toLabel = "To"): DocumentModel["parties"] {
  const c: J = s.contract ?? {}, b: J = s.bill_to ?? {};
  return [
    { label: toLabel, lines: present(b.name, b.address, b.email) },
    { label: "Project", lines: present(c.name, c.address, c.client && c.client !== b.name ? `Client: ${c.client}` : null) },
  ];
}
function contractFacts(s: J) {
  const c: J = s.contract ?? {};
  return [{ label: "Our reference", value: c.reference ?? "" }, ...(c.order_reference ? [{ label: "Order reference", value: c.order_reference }] : [])];
}

function vatRows(treatment: VatTreatment, rate: unknown, vat: unknown, reverse: unknown, total: unknown, totalLabel?: string): { label: string; detail?: string; value: string; tone?: Tone }[] {
  switch (treatment) {
    case "standard": case "reduced":
      return [{ label: `VAT at ${formatPercent(rate as number)}`, value: gbp(vat) }, { label: totalLabel ?? "Total including VAT", value: gbp(total), tone: "grand" }];
    case "zero": return [{ label: "VAT at 0% (zero rated)", value: gbp(0) }, { label: totalLabel ?? "Total including VAT", value: gbp(total), tone: "grand" }];
    case "reverse_charge":
      return [{ label: `VAT at ${formatPercent(rate as number)}: to be accounted for by the customer`, detail: "Domestic reverse charge. Shown for information and not included in the total.",
        value: gbp(reverse), tone: "muted" }, { label: totalLabel ?? "Total due (no VAT charged)", value: gbp(total), tone: "grand" }];
    case "exempt": return [{ label: "Exempt from VAT", value: gbp(0), tone: "muted" }, { label: totalLabel ?? "Total due", value: gbp(total), tone: "grand" }];
    case "outside_scope": return [{ label: "Outside the scope of VAT", value: gbp(0), tone: "muted" }, { label: totalLabel ?? "Total due", value: gbp(total), tone: "grand" }];
    default: return [];
  }
}
function vatNote(treatment: VatTreatment, isTaxInvoice: boolean): string | null {
  if (treatment === "reverse_charge") return "Reverse charge: customer to pay the VAT to HMRC. VAT Act 1994 Section 55A applies.";
  if (!isTaxInvoice && ["standard", "reduced", "zero"].includes(treatment)) return "This is an application for payment, not a VAT invoice. A VAT invoice follows the payment notice or certificate.";
  return null;
}
function cisNote(f: J): string | null {
  if (isZero(f.cis_rate) && isZero(f.cis_expected)) return null;
  return `The Construction Industry Scheme applies. The contractor deducts CIS at ${formatPercent(f.cis_rate)} from the labour element only`
    + (isZero(f.cis_materials) ? "" : `, excluding materials of ${gbp(f.cis_materials)}`)
    + `. The deduction of ${gbp(f.cis_expected)} shown is for information; the contractor's payment and deduction statement is the record.`;
}
function bankBlock(s: J): Block | null {
  const i: J = s.issuer ?? {};
  const items = [
    ...(i.bank_account_name ? [{ label: "Account name", value: i.bank_account_name }] : []),
    ...(i.bank_sort_code ? [{ label: "Sort code", value: i.bank_sort_code }] : []),
    ...(i.bank_account_number ? [{ label: "Account number", value: i.bank_account_number }] : []),
  ];
  if (!items.length && !i.payment_instructions) return null;
  if (i.payment_instructions) items.push({ label: "Instructions", value: i.payment_instructions });
  return { type: "pairs", heading: "Payment details", items };
}
function contractSumBlock(s: J): Block {
  const k: J = s.contract_sum ?? {};
  const rows = [
    { label: "Original contract sum", value: gbp(k.original) },
    { label: "Agreed variations", value: gbp(k.variations_agreed) },
    { label: "Agreed dayworks and additional works", value: gbp(k.dayworks_agreed) },
    { label: "Revised contract sum", value: gbp(k.revised), tone: "total" as Tone },
  ];
  if (!isZero(k.pending)) rows.push({ label: "Submitted but not yet agreed (not included above)", value: gbp(k.pending), tone: "muted" as Tone });
  return { type: "summary", heading: "Contract sum", rows };
}

function retentionDetail(v: J, t: J): string {
  const parts = [`${formatPercent(v.retention_percent)} of ${gbp(v.retention_base)}`];
  if (v.retention_cap !== null && v.retention_cap !== undefined) parts.push(`limited to ${gbp(v.retention_cap)}${v.retention_capped ? " (limit reached)" : ""}`);
  if (!isZero(v.retention_released_pc)) parts.push(`${formatPercent(t.retention_pc_release_percent)} released at practical completion on ${longDate(v.practical_completion_on)}`);
  if (!isZero(v.retention_released_final)) parts.push(`balance released on making good on ${longDate(v.making_good_on)}`);
  return parts.join("; ");
}

function valuationBlocks(s: J, opts: { final: boolean }): Block[] {
  const f: J = s.figures ?? {}, v: J = f.valuation ?? {}, t: J = s.terms ?? {}, a: J = s.application ?? {};
  const lines: J[] = s.lines ?? [];
  const blocks: Block[] = [];
  if (a.kind !== "advance") {
    const work = lines.filter(l => l.kind !== "deduction");
    blocks.push({ type: "table", heading: opts.final ? "Final valuation" : "Valuation of work to date", intro: `Cumulative to ${longDate(a.period_end)}.`,
      columns: [{ label: "Ref.", width: 12 }, { label: "Description", width: 63 }, { label: "Value to date", width: 25, align: "right" }],
      rows: [
        ...work.map(l => ({ cells: [l.reference ?? (l.kind === "materials_on_site" ? "MOS" : l.kind === "stage" ? "Stage" : ""),
          l.kind === "stage" && l.stage_value !== undefined && Number(l.amount) !== Number(l.stage_value) ? `${l.description} (of ${gbp(l.stage_value)})` : l.description, gbp(l.amount)] })),
        { cells: ["", "Gross valuation", gbp(v.gross)], tone: "total" },
      ] });
  }
  const deductions = lines.filter(l => l.kind === "deduction");
  const rows: { label: string; detail?: string; value: string; tone?: Tone }[] = [];
  if (a.kind !== "advance") {
    rows.push({ label: "Gross valuation to date", value: gbp(v.gross) });
    if (!isZero(v.retention) || !isZero(v.retention_percent)) rows.push({ label: "Less retention held", detail: retentionDetail(v, t), value: minus(v.retention_held), tone: "deduction" });
  }
  if (!isZero(v.advance)) rows.push({ label: a.kind === "advance" ? "Advance payment" : "Add advance payment made", value: gbp(v.advance) });
  if (!isZero(v.advance_recovered)) rows.push({ label: "Less advance payment recovered", detail: t.advance_recovery === "pro_rata" ? "In proportion to the contract works valued" : undefined,
    value: minus(v.advance_recovered), tone: "deduction" });
  if (!isZero(v.deductions)) rows.push({ label: "Less agreed deductions", detail: deductions.map(d => `${d.description} ${gbp(d.amount)}`).join("; "), value: minus(v.deductions), tone: "deduction" });
  rows.push({ label: "Net valuation to date", value: gbp(f.net), tone: "subtotal" });
  rows.push({ label: "Less previously certified or notified", value: minus(f.previous_notified), tone: "deduction" });
  rows.push({ label: opts.final ? "Balance due on the final account (excluding VAT)" : "Amount due this application (excluding VAT)", value: gbp(f.applied_this_period), tone: "total" });
  if (String(f.applied_this_period) === String(f.due_this_period)) {
    rows.push(...vatRows(f.vat_treatment, f.vat_rate, f.vat, f.vat_reverse_charge, f.total_due));
    if (!isZero(f.cis_expected)) {
      rows.push({ label: `CIS deduction expected at ${formatPercent(f.cis_rate)}`, detail: "For information: the contractor deducts CIS from the labour element", value: minus(f.cis_expected), tone: "muted" });
      rows.push({ label: "Expected payment", value: gbp(f.payable), tone: "grand" });
    }
  }
  blocks.push({ type: "summary", heading: "Valuation summary", rows });
  return blocks;
}

function notClaimedBlock(s: J): Block | null {
  const items: J[] = s.not_claimed ?? [];
  if (!items.length) return null;
  return { type: "table", heading: "Submitted but not yet agreed", intro: "For information only. These are not included in the valuation above.",
    columns: [{ label: "Ref.", width: 12 }, { label: "Description", width: 50 }, { label: "Status", width: 18 }, { label: "Value", width: 20, align: "right" }],
    rows: items.map(x => ({ cells: [x.reference, x.description, STATE_WORDS[x.state] ?? x.state, gbp(x.value)], tone: "muted" as Tone })) };
}
function historyBlock(s: J): Block | null {
  const items: J[] = s.history ?? [];
  if (!items.length) return null;
  return { type: "table", heading: "Previous applications", keepTogether: true,
    columns: [{ label: "No.", width: 6 }, { label: "Valuation date", width: 18 }, { label: "Net applied", width: 16, align: "right" }, { label: "Net certified", width: 16, align: "right" },
      { label: "Sum due", width: 15, align: "right" }, { label: "Received", width: 15, align: "right" }, { label: "Status", width: 14, align: "right" }],
    rows: items.map(h => ({ cells: [String(h.number), longDate(h.period_end), gbp(h.net), h.certified_net === null ? "Not certified" : gbp(h.certified_net), gbp(h.due_this_period),
      gbp(h.received), STATUS_WORDS[h.status] ?? h.status] })) };
}
function noticeParagraphs(s: J): string[] {
  const f: J = s.figures ?? {}, a: J = s.application ?? {}, t: J = s.terms ?? {};
  const out: string[] = [];
  if (f.construction_act ?? t.construction_act) {
    out.push(`This application is made under the payment provisions of the contract and the Housing Grants, Construction and Regeneration Act 1996, as amended. `
      + (a.due_on ? `The payment due date is ${longDate(a.due_on)}. ` : "")
      + (a.payment_notice_by ? `The payer's payment notice is to be given by ${longDate(a.payment_notice_by)}. ` : "")
      + (a.pay_less_by ? `Any notice of intention to pay less than the notified sum must be given no later than ${longDate(a.pay_less_by)}. ` : "")
      + (f.final_on_effective ? `The final date for payment is ${longDate(f.final_on_effective)}.` : ""));
  } else if (a.due_on) out.push(`Payment is due on ${longDate(a.due_on)}; the final date for payment is ${longDate(f.final_on_effective ?? a.final_on)}.`);
  return out;
}
function termsParagraphs(s: J): string[] {
  const c: J = s.contract ?? {}, a: J = s.application ?? {};
  return present(a.note, c.payment_terms ? `Payment terms: ${c.payment_terms}` : null);
}
function legalBlock(paragraphs: (string | null)[]): Block | null {
  const items = paragraphs.filter((p): p is string => !!p);
  return items.length ? { type: "text", heading: "Notes", paragraphs: items, tone: "legal" } : null;
}
const blocks = (...items: (Block | null)[]) => items.filter((b): b is Block => !!b);

function paymentApplication(r: DocumentRecord, final: boolean): Omit<DocumentModel, "mode" | "superseded" | "checksum" | "issuer"> {
  const s = r.snapshot, f: J = s.figures ?? {}, a: J = s.application ?? {};
  return {
    kind: r.kind, title: final ? "Final account" : a.kind === "advance" ? "Application for advance payment" : "Payment application",
    reference: r.reference ?? "Not yet issued", revision: s.revision ? `Revision ${String.fromCharCode(64 + Number(s.revision))}` : null, issuedOn: r.issued_on,
    parties: parties(s),
    facts: [
      { label: final ? "Final account" : "Application", value: `No. ${a.number}` },
      { label: "Valuation date", value: longDate(a.period_end) },
      { label: "Date of application", value: longDate(a.applied_on) },
      ...(a.due_on ? [{ label: "Payment due date", value: longDate(a.due_on) }] : []),
      ...(f.final_on_effective ? [{ label: "Final date for payment", value: longDate(f.final_on_effective) }] : []),
      ...contractFacts(s),
    ],
    headline: { label: final ? "Balance due on the final account" : "Amount applied for", value: gbp(f.applied_this_period), detail: "Excluding VAT" },
    blocks: blocks(
      a.kind === "advance" ? null : contractSumBlock(s),
      ...valuationBlocks(s, { final }),
      final ? finalReconciliation(s) : null,
      a.kind === "advance" ? null : notClaimedBlock(s),
      final ? extrasTable(s.extras ?? [], "Agreed variations and dayworks", e => e.claimable || !!e.included_in) : null,
      historyBlock(s),
      final ? receiptsTable(s) : null,
      legalBlock([...noticeParagraphs(s), vatNote(f.vat_treatment, false), cisNote(f), ...termsParagraphs(s),
        s.revision_reason ? `This revision replaces ${s.supersedes}: ${s.revision_reason}` : null]),
      bankBlock(s),
    ),
  };
}
function finalReconciliation(s: J): Block {
  const v: J = s.figures?.valuation ?? {};
  const rows: { label: string; detail?: string; value: string; tone?: Tone }[] = [{ label: "Final account value", value: gbp(v.gross), tone: "subtotal" }];
  if (isZero(v.retention)) rows.push({ label: "Retention", detail: "No retention is held under this contract.", value: gbp(0), tone: "muted" });
  else rows.push({ label: "Retention taken", value: gbp(v.retention) }, { label: "Released at practical completion", value: gbp(v.retention_released_pc) },
    { label: "Released on making good", value: gbp(v.retention_released_final) }, { label: "Retention still held", value: gbp(v.retention_held), tone: "total" });
  rows.push({ label: "Payments received before this account (including CIS deducted)", value: gbp(s.received_to_date) });
  if (!isZero(s.credits_to_date)) rows.push({ label: "Credit notes issued", value: gbp(s.credits_to_date) });
  return { type: "summary", heading: "Retention and payments", rows };
}
function receiptsTable(s: J): Block | null {
  const items: J[] = s.receipts ?? [];
  if (!items.length) return null;
  return { type: "table", heading: "Payments received", columns: [{ label: "Date", width: 20 }, { label: "Reference", width: 30 }, { label: "Application", width: 14 },
    { label: "Cash", width: 18, align: "right" }, { label: "CIS deducted", width: 18, align: "right" }],
    rows: items.map(p => ({ cells: [longDate(p.on), p.reference ?? "", String(p.application), gbp(p.amount), gbp(p.cis_deducted)] })) };
}
function extrasTable(items: J[], heading: string, include: (e: J) => boolean): Block | null {
  const chosen = items.filter(include);
  if (!chosen.length) return null;
  return { type: "table", heading, columns: [{ label: "Ref.", width: 11 }, { label: "Description", width: 49 }, { label: "Status", width: 20 }, { label: "Value", width: 20, align: "right" }],
    rows: chosen.map(e => ({ cells: [e.reference, e.description, e.included_in ? `Included in ${e.included_in}` : STATE_WORDS[e.state] ?? e.state,
      e.included_in ? "In variation" : gbp(e.value)] })) };
}

function invoice(r: DocumentRecord): Omit<DocumentModel, "mode" | "superseded" | "checksum" | "issuer"> {
  const s = r.snapshot, inv: J = s.invoice ?? {}, a: J = s.application ?? {}, f: J = s.figures ?? {};
  const basis = inv.basis === "certificate" ? `certificate${a.certificate_reference ? ` ${a.certificate_reference}` : ""} dated ${longDate(a.certified_on)}`
    : inv.basis === "pay_less" ? `the payer's pay less notice dated ${longDate(f.pay_less_on)}` : inv.basis === "default_notice" ? "TileSPEC's default payment notice" : "the application";
  return {
    kind: "invoice", title: "Invoice", reference: r.reference ?? "Not yet issued", revision: null, issuedOn: r.issued_on, parties: parties(s, "Invoice to"),
    facts: [
      { label: "Invoice number", value: r.reference ?? "Allocated on issue" },
      { label: "Invoice date and tax point", value: longDate(r.issued_on ?? s.as_at) },
      { label: "Application", value: `No. ${a.number}` }, { label: "Valuation date", value: longDate(a.period_end) },
      ...(inv.due_on ? [{ label: "Payment due date", value: longDate(inv.due_on) }] : []),
      ...(inv.final_on ? [{ label: "Final date for payment", value: longDate(inv.final_on) }] : []),
      ...contractFacts(s),
    ],
    headline: { label: inv.vat_treatment === "standard" || inv.vat_treatment === "reduced" ? "Total due including VAT" : "Total due", value: gbp(inv.total) },
    blocks: blocks(
      { type: "table", heading: "Invoice", columns: [{ label: "Description", width: 75 }, { label: "Net", width: 25, align: "right" }],
        rows: [{ cells: [`${a.kind === "final" ? "Final account" : a.kind === "advance" ? "Advance payment" : `Interim payment application No. ${a.number}`}, `
          + `works valued to ${longDate(a.period_end)}, in accordance with ${basis}. ${s.contract?.name ?? ""}`, gbp(inv.net)] }] },
      { type: "summary", rows: [{ label: "Net amount", value: gbp(inv.net), tone: "subtotal" },
        ...vatRows(inv.vat_treatment, inv.vat_rate, inv.vat, inv.vat_reverse_charge, inv.total),
        ...(!isZero(inv.cis_expected) ? [{ label: `CIS deduction expected at ${formatPercent(f.cis_rate)}`, detail: "For information: deducted by the contractor from the labour element",
          value: minus(inv.cis_expected), tone: "muted" as Tone }, { label: "Expected payment", value: gbp(f.payable), tone: "grand" as Tone }] : [])] },
      legalBlock([vatNote(inv.vat_treatment, true), cisNote(f), ...termsParagraphs({ ...s, application: {} })]),
      bankBlock(s),
    ),
  };
}
function creditNote(r: DocumentRecord): Omit<DocumentModel, "mode" | "superseded" | "checksum" | "issuer"> {
  const s = r.snapshot, c: J = s.credit_note ?? {};
  return {
    kind: "credit_note", title: "Credit note", reference: r.reference ?? "Not yet issued", revision: null, issuedOn: r.issued_on, parties: parties(s),
    facts: [{ label: "Credit note number", value: r.reference ?? "Allocated on issue" }, { label: "Date", value: longDate(r.issued_on ?? s.as_at) },
      { label: "Credits invoice", value: c.invoice_reference }, { label: "Invoice date", value: longDate(c.invoice_issued_on) },
      ...(c.application_number ? [{ label: "Application", value: `No. ${c.application_number}` }] : []), ...contractFacts(s)],
    headline: { label: "Total credited", value: gbp(c.total) },
    blocks: blocks(
      { type: "table", heading: c.full ? "Credit of the whole invoice" : "Credit", columns: [{ label: "Reason", width: 75 }, { label: "Net", width: 25, align: "right" }],
        rows: [{ cells: [c.reason, gbp(c.net)] }] },
      { type: "summary", rows: [{ label: "Net credit", value: gbp(c.net), tone: "subtotal" }, ...vatRows(c.vat_treatment, c.vat_rate, c.vat, c.vat_reverse_charge, c.total, "Total credited")] },
      legalBlock([vatNote(c.vat_treatment, true)]),
    ),
  };
}
function variationSchedule(r: DocumentRecord): Omit<DocumentModel, "mode" | "superseded" | "checksum" | "issuer"> {
  const s = r.snapshot, items: J[] = s.extras ?? [];
  const total = (state: string) => addPence(...items.filter(e => e.state === state && !e.included_in && e.value !== null).map(e => e.value)) / 100;
  return {
    kind: "variation_schedule", title: "Schedule of variations", reference: r.reference ?? "Not yet issued", revision: s.revision ? `Revision ${String.fromCharCode(64 + Number(s.revision))}` : null,
    issuedOn: r.issued_on, parties: parties(s), facts: [{ label: "Schedule date", value: longDate(r.issued_on ?? s.as_at) }, ...contractFacts(s)],
    headline: { label: "Agreed variations", value: gbp(s.contract_sum?.variations_agreed) },
    blocks: blocks(
      { type: "table", heading: "Variations", columns: [{ label: "Ref.", width: 9 }, { label: "Description", width: 37 }, { label: "Instructed", width: 13 },
        { label: "Status", width: 15 }, { label: "Value", width: 13, align: "right" }, { label: "Claimed", width: 13 }],
        rows: items.map(e => ({ cells: [e.reference, [e.description, ...(e.includes?.length ? [`Includes ${e.includes.join(", ")}`] : []),
          e.client_authorisation?.reference ? `Client instruction ${e.client_authorisation.reference}` : e.client_required ? "Client instruction awaited" : "",
          e.dispute ? `Dispute: ${e.dispute.summary}` : ""].filter(Boolean).join(". "),
          shortDate(e.instructed_on), STATE_WORDS[e.state] ?? e.state, gbp(e.value), e.claimed_in ? `Application ${e.claimed_in}` : "Not yet"],
          tone: e.state === "rejected" ? "muted" as Tone : undefined })) },
      { type: "summary", heading: "Summary", rows: [
        { label: "Approved (in the revised contract sum)", value: gbp(total("approved")), tone: "total" },
        { label: "Submitted, not yet agreed", value: gbp(total("submitted")), tone: "muted" },
        { label: "Disputed", value: gbp(total("disputed")), tone: "muted" },
        { label: "Rejected", value: gbp(total("rejected")), tone: "muted" }] },
      legalBlock(["Only approved variations are included in the revised contract sum and in payment applications. A variation is approved when the office has "
        + "approved it, its charge is approved, and the client has authorised it where the contract requires."]),
    ),
  };
}
function dayworkSummary(r: DocumentRecord): Omit<DocumentModel, "mode" | "superseded" | "checksum" | "issuer"> {
  const s = r.snapshot, items: J[] = s.dayworks ?? [];
  const tables: Block[] = items.map(d => {
    const ack: J | null = d.site_acknowledgement, client: J | null = d.client_authorisation;
    return { type: "table", keepTogether: true, heading: `${d.reference} · ${d.description}`,
      intro: [`Instructed by ${d.instructed_by}${d.instructed_by_company ? `, ${d.instructed_by_company}` : ""} on ${longDate(d.instructed_on)}`, d.location || null,
        `Site acknowledgement: ${ack ? ack.outcome === "signed" ? `signed by ${ack.signer_name}${ack.signer_position ? `, ${ack.signer_position}` : ""}` : `${ack.outcome} (${ack.reason})` : "none recorded"}`,
        `Commercial approval: ${d.commercial_status === "commercially_approved" ? "approved" : d.commercial_status === "priced" ? "priced, awaiting approval" : "awaiting pricing"}`,
        `Client authorisation: ${client ? `${client.reference ?? "recorded"} (${longDate(client.decided_on)})` : d.client_required ? "awaited" : "not required"}`,
        `Evidence: ${d.photos} photograph${d.photos === 1 ? "" : "s"}, ${d.signed_sheets} signed sheet${d.signed_sheets === 1 ? "" : "s"}`,
        d.included_in ? `Included in ${d.included_in}; not charged separately` : d.claimed_in ? `Claimed in application ${d.claimed_in}` : null].filter(Boolean).join(" · "),
      columns: [{ label: "Item", width: 30 }, { label: "Date", width: 12 }, { label: "Qty", width: 9, align: "right" }, { label: "Unit", width: 9 },
        { label: "Rate", width: 12, align: "right" }, { label: "Amount", width: 14, align: "right" }, { label: "Markup", width: 14, align: "right" }],
      rows: [...(d.lines as J[]).map(l => ({ cells: [`${l.kind === "labour" ? (l.role === "supervisor" ? "Supervision" : "Labour") : l.kind === "plant" ? "Plant" : "Materials"}: ${l.label}`,
        shortDate(l.work_date), String(l.quantity), l.unit,
        l.rate === null ? "" : gbp(l.rate), l.amount === null ? "Not priced" : gbp(l.amount),
        isZero(l.markup) ? "" : `${gbp(l.markup)} (${formatPercent(l.markup_percent)})`] })),
        { cells: ["Total", "", "", "", "", "", d.value === null ? "Not priced" : gbp(d.value)], tone: "total" as Tone }] };
  });
  const charged = items.filter(d => d.claimable && d.value !== null);
  return {
    kind: "daywork_summary", title: "Daywork summary", reference: r.reference ?? "Not yet issued", revision: s.revision ? `Revision ${String.fromCharCode(64 + Number(s.revision))}` : null,
    issuedOn: r.issued_on, parties: parties(s), facts: [{ label: "Summary date", value: longDate(r.issued_on ?? s.as_at) }, ...contractFacts(s)],
    headline: { label: "Agreed dayworks", value: gbp(addPence(...charged.map(d => d.value)) / 100) },
    blocks: blocks(...tables, legalBlock(["Site acknowledgement records the work, hours and materials only. Commercial approval is TileSPEC's own approval of the charge. "
      + "Client authorisation is the client's agreement to pay. A daywork included in a variation is valued within that variation and never charged twice."])),
  };
}
function statement(r: DocumentRecord): Omit<DocumentModel, "mode" | "superseded" | "checksum" | "issuer"> {
  const s = r.snapshot, ageing: J = s.ageing ?? {};
  return {
    kind: "statement", title: "Statement of account", reference: r.reference ?? "Not yet issued", revision: s.revision ? `Revision ${String.fromCharCode(64 + Number(s.revision))}` : null,
    issuedOn: r.issued_on, parties: parties(s), facts: [{ label: "Statement date", value: longDate(r.issued_on ?? s.as_at) }, ...contractFacts(s)],
    headline: { label: "Balance due", value: gbp(s.balance) },
    blocks: blocks(
      { type: "table", heading: "Account", columns: [{ label: "Date", width: 19 }, { label: "Description", width: 39 }, { label: "Debit", width: 14, align: "right" },
        { label: "Credit", width: 14, align: "right" }, { label: "Balance", width: 14, align: "right" }],
        rows: [...(s.entries as J[]).map(e => ({ cells: [longDate(e.on), e.description, isZero(e.debit) ? "" : gbp(e.debit), isZero(e.credit) ? "" : gbp(e.credit), gbp(e.balance)] })),
          { cells: ["", "Balance due", "", "", gbp(s.balance)], tone: "total" as Tone }] },
      { type: "table", heading: "Ageing of amounts due", keepTogether: true, intro: "By days past the final date for payment.",
        columns: [{ label: "Not yet due", width: 20, align: "right" }, { label: "1 to 30 days", width: 20, align: "right" }, { label: "31 to 60 days", width: 20, align: "right" },
          { label: "61 to 90 days", width: 20, align: "right" }, { label: "Over 90 days", width: 20, align: "right" }],
        rows: [{ cells: [gbp(ageing.current), gbp(ageing.days_1_30), gbp(ageing.days_31_60), gbp(ageing.days_61_90), gbp(ageing.days_over_90)] }] },
      { type: "summary", rows: [{ label: "Retention held (not yet due)", value: gbp(s.retention_held), tone: "muted" }] },
      bankBlock(s),
    ),
  };
}
function defaultNotice(r: DocumentRecord): Omit<DocumentModel, "mode" | "superseded" | "checksum" | "issuer"> {
  const s = r.snapshot, n: J = s.notice ?? {}, a: J = s.application ?? {};
  return {
    kind: "default_payment_notice", title: "Payment notice", reference: r.reference ?? "Not yet issued", revision: null, issuedOn: r.issued_on, parties: parties(s),
    facts: [{ label: "Notice date", value: longDate(r.issued_on ?? s.as_at) }, { label: "Application", value: `No. ${a.number}` },
      { label: "Valuation date", value: longDate(a.period_end) },
      { label: "Final date for payment", value: longDate(n.final_on_postponed) }, ...contractFacts(s)],
    headline: { label: "Sum considered due", value: gbp(n.sum_stated), detail: "Excluding VAT" },
    blocks: blocks({ type: "text", heading: "Notice given in default of the payer's payment notice", paragraphs: [
      `This notice is given under section 110B of the Housing Grants, Construction and Regeneration Act 1996, as amended. No payment notice was given by the payer by ${longDate(n.payment_notice_by)} in respect of application No. ${a.number}.`,
      `The sum TileSPEC considers to have become due on the payment due date of ${longDate(a.due_on)} is ${gbp(n.sum_stated)}, excluding VAT.`,
      `Basis of calculation: ${n.basis}`,
      `The final date for payment of this sum is postponed by the number of days by which this notice follows the date the payer's notice was required, to ${longDate(n.final_on_postponed)}.`] },
      ...valuationBlocks(s, { final: a.kind === "final" }), bankBlock(s)),
  };
}

const BUILDERS: Record<DocumentKind, (r: DocumentRecord) => Omit<DocumentModel, "mode" | "superseded" | "checksum" | "issuer">> = {
  payment_application: r => paymentApplication(r, false), final_account: r => paymentApplication(r, true), invoice, credit_note: creditNote,
  variation_schedule: variationSchedule, daywork_summary: dayworkSummary, statement, default_payment_notice: defaultNotice,
};

/** The printed document for a snapshot. A preview is marked as not issued; a sample as a sample. */
export function documentModel(record: DocumentRecord, options: { sample?: boolean } = {}): DocumentModel {
  const build = BUILDERS[record.kind];
  if (!build) throw new Error(`Unknown document: ${record.kind}`);
  return { ...build(record), issuer: issuer(record.snapshot), mode: options.sample ? "sample" : record.preview || !record.reference ? "preview" : "issued",
    superseded: !!record.superseded, checksum: record.snapshot_sha256 ?? null };
}
