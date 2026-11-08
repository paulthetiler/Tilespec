/*
 * Dayworks (M4): extra work paid by the hour. Pure helpers shared by the pages, the server
 * actions and the tests. Money (rates, prices, totals) only ever reaches these helpers from
 * loaders that run for people with money access; nothing here fetches anything.
 */
export const dayworkUnits = ["hour", "day", "week", "each", "m2", "m", "kg", "litre", "bag", "box", "tub", "tonne"] as const;
export type DayworkUnit = (typeof dayworkUnits)[number];
export const unitLabels: Record<DayworkUnit, string> = {
  hour: "hours", day: "days", week: "weeks", each: "each", m2: "m²", m: "metres", kg: "kg", litre: "litres", bag: "bags", box: "boxes", tub: "tubs", tonne: "tonnes",
};
export const rateCategories = ["operative", "supervisor", "plant", "material"] as const;
export type RateCategory = (typeof rateCategories)[number];
export const categoryLabels: Record<RateCategory, string> = { operative: "Operative", supervisor: "Supervisor", plant: "Plant", material: "Material" };

/** A variation is a change to the agreed work; it uses the same records and workflow as a daywork. */
export const dayworkKinds = ["daywork", "variation"] as const;
export type DayworkKind = (typeof dayworkKinds)[number];
export const kindWords: Record<DayworkKind, { prefix: string; noun: string; title: string; plural: string }> = {
  daywork: { prefix: "DW", noun: "daywork", title: "Daywork", plural: "Dayworks" },
  variation: { prefix: "VO", noun: "variation", title: "Variation", plural: "Variations" },
};
export type Daywork = {
  id: string; contract_id: string; kind: DayworkKind; number: number; work_area_id: string | null; location_path: string[]; description: string;
  instructed_by_name: string; instructed_by_company: string | null; instructed_on: string; created_by: string; created_by_name: string; created_at: string;
  site_status: "recorded" | "sent"; office_status: "awaiting_review" | "more_detail" | "approved" | "rejected" | null;
  signoff_status: "none" | "signed" | "refused" | "unavailable"; lines_version: number; version: number; updated_at: string;
};
/**
 * The only daywork columns a signed-in user may read directly. The client's commercial status and
 * the internal charge status are read through `daywork_office_statuses`, by the office only.
 */
export const DAYWORK_BASE_COLUMNS = "id,organisation_id,contract_id,number,work_area_id,location_path,description,instructed_by_name,instructed_by_company,"
  + "instructed_on,created_by,created_by_name,created_at,request_key,site_status,office_status,signoff_status,lines_version,version,updated_at";
/** With `kind` (variations). Before the variations update is applied, loaders fall back to the base columns and every record is a daywork. */
export const DAYWORK_COLUMNS = `${DAYWORK_BASE_COLUMNS},kind`;
export const DAYWORK_EVENT_COLUMNS = "id,daywork_id,organisation_id,contract_id,actor_id,actor_name,action,note,owner_override,created_at";
/** Office only. `commercial_status` is null without money access. */
export type DayworkOfficeStatus = {
  client_status: "not_authorised" | "authorised" | "declined";
  commercial_status: "awaiting_pricing" | "priced" | "commercially_approved" | null;
  client_authorisation_required: boolean;
};
/**
 * The site's one answer to "may this extra work go ahead?", worked out by the database from the
 * office's decision and, where the contract requires it, the client's authorisation. TileSPEC's
 * internal charge approval is never an input.
 */
export const goAheads = ["not_sent", "awaiting_office", "more_detail", "awaiting_client", "client_declined", "rejected", "proceed"] as const;
export type GoAhead = (typeof goAheads)[number];
export const goAheadLabels: Record<GoAhead, string> = {
  not_sent: "Not sent to the office yet. Recording extra work is not permission to carry on with it.",
  awaiting_office: "Waiting for the office. Do not carry on with this extra work until it is approved.",
  more_detail: "The office needs more detail before it can decide. Do not carry on with this work yet.",
  awaiting_client: "Approved by the office, waiting for the client's authorisation. Do not carry on with this work yet.",
  client_declined: "The client declined this work. Do not carry on with it without a new instruction from the office.",
  rejected: "The office rejected this. Do not carry out this work as extra work.",
  proceed: "Approved. You can go ahead with this work.",
};
/** Unknown (for example before the database update is applied) is answered safely. */
export const goAheadLine = (goAhead: GoAhead | null | undefined) => (goAhead ? goAheadLabels[goAhead] : "Ask the office before carrying on with this work.");
export type DayworkLine = {
  id: string; daywork_id: string; lines_version: number; position: number; kind: "labour" | "plant" | "material"; label: string;
  role: "operative" | "supervisor" | null; work_date: string | null; quantity: number; unit: DayworkUnit;
};
export type DayworkEvent = {
  id: number; daywork_id: string; actor_id: string; actor_name: string; action: string; note: string | null; owner_override: boolean; created_at: string;
};
export type DayworkSignoff = {
  id: string; daywork_id: string; outcome: "signed" | "refused" | "unavailable"; signer_name: string | null; signer_position: string | null;
  signer_company: string | null; signed_at: string; reason: string | null; recorded_by_name: string; recorded_at: string;
};
export type DayworkClientAuthorisation = {
  id: string; daywork_id: string; outcome: "authorised" | "declined"; client_name: string; decided_on: string; reference: string | null;
  document_id: string | null; note: string | null; recorded_by_name: string; recorded_at: string;
};
export type DayworkPhoto = { id: string; daywork_id: string; purpose: "work" | "signed_sheet"; uploaded_at: string | null };
/** Money access only. */
export type DayworkRate = {
  id: string; contract_id: string; category: RateCategory; item: string; unit: DayworkUnit; rate: number; retired: boolean;
  supersedes_id: string | null; created_by_name: string; created_at: string;
};
export type DayworkPricing = { id: string; daywork_id: string; lines_version: number; total: number; method?: "day_rates" | "quoted"; note?: string | null; priced_by_name: string; priced_at: string };
export type DayworkPricingLine = { id: string; pricing_id: string; line_id: string; rate_id: string; category: string; item: string; unit: string; rate: number; quantity: number; amount: number;
  // Agreed markups (commercial accounts, C6); absent until that update is applied.
  markup_percent?: number; markup?: number };
export type DayworkApproval = { id: string; daywork_id: string; pricing_id: string; note: string | null; owner_override: boolean; override_reason: string | null; approved_by_name: string; approved_at: string };
/** A rate item without its money: what a supervisor may pick from. */
export type RateItem = { category: RateCategory; item: string; unit: DayworkUnit };

export const dayworkReference = (daywork: { number: number; kind?: DayworkKind | null }) => `${kindWords[daywork.kind ?? "daywork"].prefix}-${daywork.number}`;
export const currentLines = (daywork: Pick<Daywork, "id" | "lines_version">, lines: DayworkLine[]) =>
  lines.filter(line => line.daywork_id === daywork.id && line.lines_version === daywork.lines_version).sort((a, b) => a.position - b.position);

/** Site, signature and office statuses for everyone; client and charge statuses for the office only. */
export function dayworkStatuses(daywork: Daywork, office?: DayworkOfficeStatus | null) {
  const site = daywork.office_status === "more_detail" ? "Sent back for more detail" : daywork.site_status === "sent" ? "Sent to the office" : "Recorded, not sent yet";
  const signature = { none: "Not signed yet", signed: "Signed by the client's representative", refused: "Client's representative refused to sign", unavailable: "Client's representative not available" }[daywork.signoff_status];
  const decision = { awaiting_review: "Waiting for the office", more_detail: "Office asked for more detail", approved: "Approved by the office", rejected: "Rejected by the office" }[daywork.office_status ?? "awaiting_review"];
  // Office only: the client's commercial decision, and (with money access) the internal charge.
  const client = office ? { not_authorised: office.client_authorisation_required ? "Client has not authorised the cost" : "Client's authorisation not required by the contract",
    authorised: "Client authorised the cost", declined: "Client declined the cost" }[office.client_status] : null;
  const charge = office?.commercial_status ? { awaiting_pricing: "Awaiting pricing", priced: "Priced, waiting for internal approval",
    commercially_approved: "Charge approved internally by TileSPEC" }[office.commercial_status] : null;
  return { site, signature, office: daywork.office_status ? decision : "Not sent to the office yet", client, charge };
}
export const lineCategory = (line: Pick<DayworkLine, "kind" | "role">): RateCategory => (line.kind === "labour" ? line.role! : line.kind);
export function lineSummary(line: DayworkLine): string {
  if (line.kind === "labour") return `${line.label} (${line.role === "supervisor" ? "supervisor" : "operative"}) · ${line.quantity} ${line.quantity === 1 ? "hour" : "hours"}${line.work_date ? ` on ${line.work_date}` : ""}`;
  return `${line.label} · ${line.quantity} ${unitLabels[line.unit] ?? line.unit}${line.work_date ? ` on ${line.work_date}` : ""}`;
}

/** Current rates: not retired and not replaced by a newer version. */
export const currentRates = (rates: DayworkRate[]) => rates.filter(rate => !rate.retired && !rates.some(other => other.supersedes_id === rate.id));
/** The rate each line would be priced at: the only current rate of the same kind, item and unit. Anything else is chosen by a person. */
export function suggestRates(lines: DayworkLine[], rates: DayworkRate[]): Map<string, string> {
  const current = currentRates(rates), suggestions = new Map<string, string>();
  for (const line of lines) {
    const sameKind = current.filter(rate => rate.category === lineCategory(line) && rate.unit === line.unit);
    const named = sameKind.filter(rate => rate.item.trim().toLowerCase() === line.label.trim().toLowerCase());
    const match = named.length === 1 ? named[0] : line.kind === "labour" && sameKind.length === 1 ? sameKind[0] : undefined;
    if (match) suggestions.set(line.id, match.id);
  }
  return suggestions;
}
export const pounds = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

/** What happened, for the daywork's history and Job activity. Never mentions money. */
export function eventLine(event: Pick<DayworkEvent, "action" | "note" | "owner_override">, reference: string): string {
  switch (event.action) {
    case "record": return `recorded ${reference.startsWith("VO-") ? "variation" : "daywork"} ${reference}`;
    case "update_lines": return `corrected the people, plant and materials on ${reference}`;
    case "send": return `sent ${reference} to the office`;
    case "request_detail": return `asked for more detail on ${reference}`;
    case "approve": return `approved ${reference}${event.owner_override ? " (owner override)" : ""}`;
    case "reject": return `rejected ${reference}`;
    case "sign_off": return event.note === "signed" ? `recorded the client's signature on ${reference}`
      : event.note === "refused" ? `recorded that the client's representative refused to sign ${reference}` : `recorded that nobody was available to sign ${reference}`;
    case "client_authorisation": return event.note === "declined" ? `recorded that the client declined ${reference}` : `recorded the client's authorisation of ${reference}`;
    case "price": return `priced ${reference}`;
    case "commercial_approval": return `approved the charge for ${reference} internally${event.owner_override ? " (owner override)" : ""}`;
    default: return `updated ${reference}`;
  }
}
