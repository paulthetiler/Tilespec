/*
 * Subcontractor portal: what the portal sends to, and shows from, the database.
 *
 * Pure and deterministic. The database prices every claim from the office's agreed rates and is the
 * authority on permissions, quantities and money: nothing here can set a rate or a total. These
 * helpers only shape the form into the payload the database accepts and turn the database's
 * snapshot into the invoice and agreement that are printed.
 */
import type { Block, DocumentModel } from "../documents/model";
import { longDate } from "../documents/model";
import { formatPercent, formatPounds } from "../operations/money";
import { gangUnits, parseMoney, parseQuantity, unitLabel, type GangUnit } from "../operations/gang-invoices";
import { ValidationError } from "../operations/validation";

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- snapshot JSON from the database

export type ClaimMode = "generated" | "upload";
export type PortalArea = { id: string; name: string; rates: { m2: number | null; lm: number | null; item: number | null } };
export type PortalJob = {
  contract_id: string; subcontract_id: string; reference: string; name: string; address: string | null;
  payment_cycle: string; pay_weekday: number; payment_days: number; cycle_anchor: string | null; retention_percent: number;
  areas: PortalArea[];
  claimed: { work_area_id: string; unit: string; approved: number; in_progress: number; correction: number }[];
  day_rates: { id: string; unit: "day" | "hour"; rate: number; description: string | null }[];
  variations: { id: string; reference: string; description: string; amount: number; claimed: number; remaining: number }[];
};
export type PortalPayment = { vat_treatment: string; vat: number; retention_percent: number; retention: number; cis_rate: number; cis_materials: number; cis: number;
  payable: number; adjustment: number; adjustment_reason: string | null };
export type PortalInvoice = {
  id: string; reference: string; status: string; source: ClaimMode; contract_id: string; job: string; submitted_at: string; submitted_by: string;
  period_start: string | null; period_end: string; note: string; workmanship: string | null; correction_note: string | null;
  invoice_number: string | null; invoice_date: string | null; invoice_total: number | null; payment_due_on: string | null; approved_amount: number | null;
  payment: PortalPayment | null; paid_on: string | null; paid_amount: number | null; replaces: string | null; has_document: boolean;
  lines: { area: string; work_area_id: string; unit: string; claimed: number; verified: number | null; approved: number | null }[];
  extras: { kind: "day_rate" | "variation" | "additional"; unit: string; description: string; quantity: number; amount: number | null; variation_id: string | null;
    confirmed: number | null; approved_amount: number | null }[];
  events: { at: string; action: string; by: string; note: string | null; to_status: string | null }[];
};
export type PortalAgreementSummary = { id: string; reference: string; status: "issued" | "signed"; title: string; version_label: string; issued_at: string;
  signed_at: string | null; signer_name: string | null };
export type PortalSession = {
  organisation: string;
  subcontractor: { team_id: string; name: string; issued_to: string; address: string | null; vat_registered: boolean; cis_status: string; details_recorded: boolean; bank_ending: string | null };
  link: { expires_at: string };
  agreement: PortalAgreementSummary | null; agreement_signed: boolean; can_invoice: boolean;
  generator: { allowed: boolean; reason: string | null };
  next_invoice_number: string; jobs: PortalJob[]; invoices: PortalInvoice[];
};
export type PortalAgreement = PortalAgreementSummary & { body: string; body_sha256: string; parties: J; issued_by: string; signer_position: string | null;
  signature_text: string | null; evidence_sha256: string | null };
export type ClaimSnapshot = {
  mode: ClaimMode; self_billed: boolean; reference: string | null;
  issuer: { name: string; trading_name: string | null; address: string | null; email: string | null; phone: string | null; company_number: string | null; vat_number: string | null; bank_ending: string | null };
  customer: { name: string | null; address: string | null; vat_number: string | null };
  contract: { id: string; reference: string; name: string; address: string | null };
  invoice_number: string; invoice_date: string; period_start: string | null; period_end: string; note: string | null;
  lines: { work_area_id: string; area: string; unit: string; quantity: number; rate: number | null; amount: number | null }[];
  day_rates: { rate_id: string; unit: string; rate_description: string | null; description: string; quantity: number; rate: number; amount: number }[];
  variations: { variation_id: string; reference: string; description: string; agreed: number; previously_claimed: number; amount: number }[];
  additional: { description: string; amount: number }[];
  totals: { measured: number; day_rates: number; variations: number; additional: number; priced: number; net: number; vat_treatment: "none" | "standard" | "reverse_charge";
    vat_rate: number; vat: number; vat_reverse_charge: number; gross: number };
  estimate: { retention_percent: number; retention: number; cis_status: string; cis_rate: number | null; cis: number | null; payable: number | null };
  payment: { due_on: string; cycle: string; pay_weekday: number; payment_days: number };
};

// ---------------------------------------------------------------------------------------------
// The secret in a link, and words for statuses a subcontractor reads.
// ---------------------------------------------------------------------------------------------
export const PORTAL_TOKEN = /^[0-9a-f]{64}$/;
export const isPortalToken = (value: unknown): value is string => typeof value === "string" && PORTAL_TOKEN.test(value);

export const cisLabels: Record<string, string> = {
  unverified: "Not yet verified with HMRC", gross: "Gross payment (no deduction)", net: "Standard rate (20% deduction)", higher: "Higher rate (30% deduction)",
};
export function portalStatusLabel(status: string, workmanship?: string | null): string {
  switch (status) {
    case "uploading": return "Not sent yet";
    case "awaiting_check": return "Sent · waiting for the site check";
    case "with_office": return workmanship === "correction_needed" ? "Checked · correction needed" : "Checked on site · with the office";
    case "query_gang": return "TileSpec has a question";
    case "returned": return "Returned to you to correct";
    case "approved": return "Approved for payment";
    case "paid": return "Paid";
    case "rejected": return "Not accepted";
    case "cancelled": return "Withdrawn";
    case "superseded": return "Replaced by your corrected invoice";
    default: return status;
  }
}
export function portalNextStep(status: string): string {
  switch (status) {
    case "uploading": return "This invoice was not finished. Withdraw it and start again.";
    case "awaiting_check": return "The site supervisor will check the work. You do not need to do anything.";
    case "with_office": return "The work has been checked. The office is reviewing your invoice.";
    case "query_gang": return "The office has asked you a question. Please answer it below.";
    case "returned": return "The office has sent this back. Read why below, then send a corrected invoice.";
    case "approved": return "Approved. It will be paid on the payment date shown.";
    case "paid": return "This invoice has been paid.";
    default: return "";
  }
}

// ---------------------------------------------------------------------------------------------
// The form. Only quantities, descriptions and (for uploads) the subcontractor's own stated total
// are read. There is no rate field to read: rates come from the office's records.
// ---------------------------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function field(form: FormData, key: string, max = 2000): string {
  const raw = form.get(key);
  if (raw !== null && typeof raw !== "string") throw new ValidationError("Check the form and try again.");
  const value = (raw ?? "").trim();
  if (value.length > max) throw new ValidationError(`Keep ${key.replaceAll("_", " ")} under ${max} characters.`);
  return value;
}
const all = (form: FormData, key: string) => form.getAll(key).map(v => (typeof v === "string" ? v.trim() : ""));
function realDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new ValidationError(`Enter ${label} as a real date.`);
  return value;
}

export type ClaimPayload = {
  mode: ClaimMode; contract_id: string; invoice_number: string; invoice_date?: string; invoice_total?: number; period_end?: string; note?: string; replaces_invoice_id?: string;
  lines?: { work_area_id: string; unit: GangUnit; quantity: number }[];
  day_rates?: { rate_id: string; quantity: number; description: string }[];
  variations?: { variation_id: string; amount: number }[];
  additional?: { description: string; amount: number }[];
};
export function parseClaimForm(form: FormData, mode: ClaimMode): ClaimPayload {
  const contract = field(form, "contract_id", 36);
  if (!UUID.test(contract)) throw new ValidationError("Choose the job.");
  const number = field(form, "invoice_number", 60);
  if (!number) throw new ValidationError("Enter the invoice number.");
  const payload: ClaimPayload = { mode, contract_id: contract, invoice_number: number };

  const areas = all(form, "line_area"), quantities = all(form, "line_quantity"), units = all(form, "line_unit");
  const lines: NonNullable<ClaimPayload["lines"]> = [];
  const seen = new Set<string>();
  areas.forEach((area, index) => {
    const quantity = quantities[index] ?? "";
    if (!area && !quantity) return; // an unused row
    if (!UUID.test(area)) throw new ValidationError(`Choose the work area for line ${index + 1}.`);
    const unit = (units[index] || "m2") as GangUnit;
    if (!gangUnits.includes(unit)) throw new ValidationError("Choose m², linear metres or items.");
    if (seen.has(`${area}:${unit}`)) throw new ValidationError("The same work area is listed twice. Put its total on one line.");
    seen.add(`${area}:${unit}`);
    lines.push({ work_area_id: area, unit, quantity: parseQuantity(quantity, `line ${index + 1}`) as number });
  });
  if (lines.length > 20) throw new ValidationError("Claim up to twenty work areas on one invoice.");
  if (lines.length) payload.lines = lines;

  const rateIds = all(form, "day_rate_id"), dayQuantities = all(form, "day_quantity"), dayDescriptions = all(form, "day_description");
  const days: NonNullable<ClaimPayload["day_rates"]> = [];
  rateIds.forEach((rate, index) => {
    const quantity = dayQuantities[index] ?? "", description = dayDescriptions[index] ?? "";
    if (!quantity && !description) return;
    if (!UUID.test(rate)) throw new ValidationError("Choose the day rate.");
    if (description.length < 3) throw new ValidationError("Say what the day rate work was.");
    if (description.length > 300) throw new ValidationError("Keep the day rate description under 300 characters.");
    days.push({ rate_id: rate, quantity: parseQuantity(quantity, "the day rate work") as number, description });
  });
  if (days.length) payload.day_rates = days;

  const variationIds = all(form, "variation_id"), variationAmounts = all(form, "variation_amount");
  const variations: NonNullable<ClaimPayload["variations"]> = [];
  variationIds.forEach((id, index) => {
    const raw = variationAmounts[index] ?? "";
    if (!raw) return;
    if (!UUID.test(id)) throw new ValidationError("Choose the variation.");
    const amount = parseMoney(raw, "the variation amount");
    if (!amount || amount <= 0) throw new ValidationError("Enter the amount you are claiming for the variation.");
    variations.push({ variation_id: id, amount });
  });
  if (variations.length) payload.variations = variations;

  const additionalDescriptions = all(form, "additional_description"), additionalAmounts = all(form, "additional_amount");
  const additional: NonNullable<ClaimPayload["additional"]> = [];
  additionalDescriptions.forEach((description, index) => {
    const raw = additionalAmounts[index] ?? "";
    if (!description && !raw) return;
    if (description.length < 5) throw new ValidationError("Describe the additional work and who asked for it.");
    if (description.length > 500) throw new ValidationError("Keep the additional work description under 500 characters.");
    const amount = parseMoney(raw, "the additional work amount");
    if (!amount || amount <= 0) throw new ValidationError("Enter the amount for the additional work.");
    additional.push({ description, amount });
  });
  if (additional.length) payload.additional = additional;

  if (!lines.length && !days.length && !variations.length && !additional.length) {
    throw new ValidationError(mode === "upload" ? "Say what work this invoice is for: choose a work area and enter the quantity." : "Enter the work you are invoicing for: choose a work area and enter the quantity.");
  }
  if (mode === "upload") {
    const total = parseMoney(field(form, "invoice_total", 20), "the invoice amount");
    if (!total || total <= 0) throw new ValidationError("Enter the amount on your invoice, before VAT.");
    payload.invoice_total = total;
    const date = field(form, "invoice_date", 10);
    if (!date) throw new ValidationError("Enter the date on your invoice.");
    payload.invoice_date = realDate(date, "the invoice date");
  }
  const periodEnd = field(form, "period_end", 10);
  if (periodEnd) payload.period_end = realDate(periodEnd, "the work date");
  const note = field(form, "note", 2000);
  if (note) payload.note = note;
  const replaces = field(form, "replaces_invoice_id", 36);
  if (replaces) {
    if (!UUID.test(replaces)) throw new ValidationError("The invoice you are correcting could not be found. Go back and try again.");
    payload.replaces_invoice_id = replaces;
  }
  return payload;
}

export type SignaturePayload = { body_sha256: string; signer_name: string; signer_position?: string; signature_text: string;
  confirm_read: boolean; confirm_authority: boolean; confirm_electronic: boolean };
export function parseSignatureForm(form: FormData): SignaturePayload {
  const sha = field(form, "body_sha256", 64);
  if (!PORTAL_TOKEN.test(sha)) throw new ValidationError("Open the agreement again and read the current version.");
  const name = field(form, "signer_name", 160), signature = field(form, "signature_text", 160), position = field(form, "signer_position", 160);
  if (name.length < 2) throw new ValidationError("Enter your full name.");
  const same = (a: string, b: string) => a.replace(/\s+/g, " ").toLowerCase() === b.replace(/\s+/g, " ").toLowerCase();
  if (!same(name, signature)) throw new ValidationError("To sign, type your full name again exactly as you entered it.");
  const ticked = (key: string) => form.get(key) === "on" || form.get(key) === "true";
  if (!ticked("confirm_read") || !ticked("confirm_authority") || !ticked("confirm_electronic")) {
    throw new ValidationError("Tick all three boxes to confirm you have read the agreement, can sign it and agree to sign electronically.");
  }
  return { body_sha256: sha, signer_name: name, ...(position ? { signer_position: position } : {}), signature_text: signature,
    confirm_read: true, confirm_authority: true, confirm_electronic: true };
}

// ---------------------------------------------------------------------------------------------
// Printing. Every amount comes from the database's snapshot; nothing is calculated here.
// ---------------------------------------------------------------------------------------------
const gbp = (value: unknown) => (value === null || value === undefined ? "" : formatPounds(value as number));
const present = (...values: unknown[]) => values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
const qty = (value: number, unit: string) => `${Number(value).toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${unit === "day" ? (Number(value) === 1 ? "day" : "days") : unit === "hour" ? (Number(value) === 1 ? "hour" : "hours") : unitLabel(unit)}`;

/** The subcontractor's invoice: their own document, addressed to TileSPEC, at gross value. Deductions are not part of it. */
export function invoiceDocument(s: ClaimSnapshot): DocumentModel {
  const t = s.totals;
  const blocks: Block[] = [];
  const money = { label: "Amount", width: 18, align: "right" as const };
  if (s.lines.length) blocks.push({ type: "table", heading: "Measured work at agreed rates",
    columns: [{ label: "Work area", width: 44 }, { label: "Quantity", width: 19, align: "right" }, { label: "Rate", width: 19, align: "right" }, money],
    rows: [...s.lines.map(l => ({ cells: [l.area, qty(l.quantity, l.unit), `${gbp(l.rate)} per ${unitLabel(l.unit)}`, gbp(l.amount)] })),
      { cells: ["Measured work", "", "", gbp(t.measured)], tone: "subtotal" as const }] });
  if (s.day_rates.length) blocks.push({ type: "table", heading: "Day rate work",
    columns: [{ label: "Description", width: 44 }, { label: "Time", width: 19, align: "right" }, { label: "Rate", width: 19, align: "right" }, money],
    rows: [...s.day_rates.map(d => ({ cells: [d.description, qty(d.quantity, d.unit), `${gbp(d.rate)} per ${d.unit}`, gbp(d.amount)] })),
      { cells: ["Day rate work", "", "", gbp(t.day_rates)], tone: "subtotal" as const }] });
  if (s.variations.length) blocks.push({ type: "table", heading: "Approved variations",
    columns: [{ label: "Ref.", width: 14 }, { label: "Description", width: 49 }, { label: "Agreed sum", width: 19, align: "right" }, money],
    rows: [...s.variations.map(v => ({ cells: [v.reference, v.description, gbp(v.agreed), gbp(v.amount)] })),
      { cells: ["", "Approved variations", "", gbp(t.variations)], tone: "subtotal" as const }] });
  if (s.additional.length) blocks.push({ type: "table", heading: "Additional work claimed (not yet approved)",
    intro: "These items have not been approved as variations. They are claimed for the contractor's consideration and are shown separately from approved variations.",
    columns: [{ label: "Description", width: 82 }, money],
    rows: [...s.additional.map(a => ({ cells: [a.description, gbp(a.amount)] })),
      { cells: ["Additional work claimed", gbp(t.additional)], tone: "subtotal" as const }] });
  const vatRows = t.vat_treatment === "standard"
    ? [{ label: `VAT at ${formatPercent(t.vat_rate)}`, value: gbp(t.vat) }, { label: "Invoice total including VAT", value: gbp(t.gross), tone: "grand" as const }]
    : t.vat_treatment === "reverse_charge"
      ? [{ label: `VAT at ${formatPercent(t.vat_rate)}: to be accounted for by the customer`, detail: "Domestic reverse charge. Shown for information and not included in the total.",
        value: gbp(t.vat_reverse_charge), tone: "muted" as const }, { label: "Invoice total (no VAT charged)", value: gbp(t.gross), tone: "grand" as const }]
      : [{ label: "Invoice total", detail: "Not registered for VAT: no VAT is charged.", value: gbp(t.gross), tone: "grand" as const }];
  blocks.push({ type: "summary", heading: "Invoice summary", rows: [{ label: "Value of work before VAT", value: gbp(t.net), tone: "total" as const }, ...vatRows] });
  const notes = present(
    t.vat_treatment === "reverse_charge" ? "Reverse charge: customer to pay the VAT to HMRC. VAT Act 1994 Section 55A applies." : null,
    s.self_billed ? "Self-billed invoice, issued under the self-billing agreement between the parties." : null,
    s.self_billed && t.vat_treatment === "standard" ? "The VAT shown is your output tax due to HMRC." : null,
    "This invoice states the gross value of the work. Construction Industry Scheme deductions and any agreed retention are made from the payment under the subcontract and shown on the contractor's payment notice; they are not part of this invoice.",
    `Payment is due on ${longDate(s.payment.due_on)} under the agreed payment terms, subject to verification of the work and approval.`,
    s.issuer.bank_ending ? `Payment to the bank account the contractor holds for ${s.issuer.name}, ending ${s.issuer.bank_ending}.` : null,
    s.note ? `Note from ${s.issuer.name}: ${s.note}` : null);
  blocks.push({ type: "text", paragraphs: notes, tone: "legal" });
  return {
    kind: "subcontractor_invoice", title: s.self_billed ? "Self-billed invoice" : "Invoice", reference: s.invoice_number, mode: "issued", superseded: false,
    revision: null, eyebrow: "Subcontractor invoice", statusLabel: `Dated ${s.invoice_date.split("-").reverse().join("/")}`, issuedOn: s.invoice_date, plainHeader: true,
    issuer: { name: s.issuer.name, tradingAs: s.issuer.trading_name && s.issuer.trading_name !== s.issuer.name ? s.issuer.trading_name : null,
      lines: present(s.issuer.address, s.issuer.phone, s.issuer.email),
      legal: present(s.issuer.company_number ? `Company number ${s.issuer.company_number}` : null, s.issuer.vat_number ? `VAT registration ${s.issuer.vat_number}` : null),
      footer: s.reference ? `Submitted through the TileSPEC subcontractor portal · submission reference ${s.reference}` : null },
    parties: [
      { label: "To", lines: present(s.customer.name, s.customer.address, s.customer.vat_number ? `VAT registration ${s.customer.vat_number}` : null) },
      { label: "Job", lines: present(s.contract.name, s.contract.address, `Job reference ${s.contract.reference}`) },
    ],
    facts: [
      { label: "Invoice number", value: s.invoice_number }, { label: "Invoice date", value: longDate(s.invoice_date) },
      { label: "Work completed to", value: longDate(s.period_end) }, { label: "Submission reference", value: s.reference ?? "" },
    ],
    headline: { label: "Invoice total", value: gbp(t.gross), detail: t.vat_treatment === "standard" ? "Including VAT" : t.vat_treatment === "reverse_charge" ? "Reverse charge: no VAT charged" : "No VAT" },
    blocks, checksum: null, createdAt: `${s.invoice_date}T12:00:00Z`,
  };
}

/** Clause headings and paragraphs from the agreement's text ("## " starts a heading). */
export function agreementSections(body: string): { heading: string | null; paragraphs: string[] }[] {
  const sections: { heading: string | null; paragraphs: string[] }[] = [];
  let current: { heading: string | null; paragraphs: string[] } = { heading: null, paragraphs: [] };
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const text = chunk.trim();
    if (!text) continue;
    if (text.startsWith("## ")) {
      if (current.heading !== null || current.paragraphs.length) sections.push(current);
      const [first, ...rest] = text.split("\n");
      current = { heading: first.slice(3).trim(), paragraphs: rest.join(" ").trim() ? [rest.join(" ").trim()] : [] };
    } else current.paragraphs.push(text.replace(/\n/g, " "));
  }
  if (current.heading !== null || current.paragraphs.length) sections.push(current);
  return sections;
}

const dateTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "long", timeStyle: "medium" }).format(new Date(iso));
/** The agreement as issued, with its signature record when signed. An unsigned copy says so on every page. */
export function agreementDocument(a: PortalAgreement): DocumentModel {
  const contractor: J = a.parties?.contractor ?? {}, subcontractor: J = a.parties?.subcontractor ?? {};
  const blocks: Block[] = agreementSections(a.body).map(section => ({ type: "text" as const, heading: section.heading ?? undefined, paragraphs: section.paragraphs }));
  blocks.push(a.status === "signed" && a.signed_at ? { type: "pairs", heading: "Signed electronically by the Subcontractor", items: [
    { label: "Signed by", value: a.signer_name ?? "" }, { label: "Position", value: a.signer_position ?? "Not given" }, { label: "Typed signature", value: a.signature_text ?? "" },
    { label: "Date and time (UK)", value: dateTime(a.signed_at) }, { label: "Agreement version", value: a.version_label }, { label: "Agreement reference", value: a.reference },
  ] } : { type: "text", heading: "Not signed", paragraphs: ["This agreement has been issued for signature and has not been accepted. It has no effect until the Subcontractor signs it."] });
  blocks.push({ type: "text", tone: "legal", paragraphs: present(
    `Document fingerprint (SHA-256 of the agreement text): ${a.body_sha256}`,
    a.evidence_sha256 ? `Acceptance record fingerprint: ${a.evidence_sha256}` : null,
    `Issued by ${a.issued_by} for the Contractor on ${dateTime(a.issued_at)}.`) });
  return {
    kind: "subcontractor_agreement", title: "Subcontractor agreement", reference: a.reference, mode: a.status === "signed" ? "issued" : "preview", superseded: false,
    revision: null, eyebrow: `Version ${a.version_label}`, statusLabel: a.status === "signed" ? `Signed ${a.signed_at ? a.signed_at.slice(0, 10).split("-").reverse().join("/") : ""}` : "Awaiting signature",
    issuedOn: a.issued_at.slice(0, 10),
    issuer: { name: contractor.name ?? "TileSPEC", tradingAs: contractor.trading_name && contractor.trading_name !== contractor.name ? contractor.trading_name : null,
      lines: present(contractor.address), legal: present(contractor.company_number ? `Company number ${contractor.company_number}` : null), footer: null },
    parties: [{ label: "Subcontractor", lines: present(subcontractor.name, subcontractor.trading_name && subcontractor.trading_name !== subcontractor.name ? `Trading as ${subcontractor.trading_name}` : null,
      subcontractor.address, subcontractor.company_number ? `Company number ${subcontractor.company_number}` : null) }],
    facts: [{ label: "Agreement", value: a.title }, { label: "Version", value: a.version_label }, { label: "Reference", value: a.reference },
      { label: "Status", value: a.status === "signed" ? "Signed" : "Awaiting signature" }],
    headline: null, blocks, checksum: a.body_sha256, issuerLabel: "Contractor", ...(a.status === "signed" ? {} : { watermark: "NOT SIGNED" }),
  };
}
