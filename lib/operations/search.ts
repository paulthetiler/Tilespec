/** Global search: result groups and where each result opens. */
export type Hit = { kind: string; id: string; label: string; detail: string | null; contract_id: string | null };
export const searchKinds: Record<string, string> = {
  job: "Jobs", customer: "Customers", gang: "Gangs and teams", company: "Subcontractor companies", person: "People", gang_invoice: "Gang invoices",
  client_document: "Client invoices and documents", quote: "Quotations", tender: "Tender enquiries", snag: "Snags and site findings", hold: "Stops and holds",
  daywork: "Dayworks and variations", material: "Materials", message: "Site conversations",
};

/** Where each search result opens: always the record itself or the page that holds it. */
export function hrefFor(hit: Hit, financial: boolean): string {
  switch (hit.kind) {
    case "job": return `/admin/contracts/${hit.id}`;
    case "customer": return `/admin/customers/${hit.id}`;
    case "gang": return financial ? `/admin/subcontractors/${hit.id}` : "/admin/workforce";
    case "company": case "person": return "/admin/workforce";
    case "gang_invoice": return financial ? `/admin/gang-invoices/${hit.id}` : hit.contract_id ? `/admin/supervisor/sites/${hit.contract_id}/progress` : "/admin/inbox#claims";
    case "client_document": return hit.contract_id ? `/admin/contracts/${hit.contract_id}/accounts` : "/admin/invoices";
    case "quote": return `/admin/quotes/${hit.id}`;
    case "tender": return `/admin/tenders#tender-${hit.id}`;
    case "snag": return `/admin/snags/${hit.id}`;
    case "hold": return `/admin/holds/${hit.id}`;
    case "daywork": return hit.contract_id ? `/admin/supervisor/sites/${hit.contract_id}/dayworks/${hit.id}` : "/admin/contracts";
    case "material": return `/admin/materials#material-${hit.id}`;
    case "message": return `/admin/inbox?thread=${hit.id}#thread-${hit.id}`;
    default: return "/admin";
  }
}

