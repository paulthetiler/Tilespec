// Renders the sample documents in docs/operations/samples from the snapshots the database produced
// for the fictitious job in scripts/sample-commercial-documents.sql. The sample's placeholder VAT
// registration (needed only so the database can show VAT working) is removed first, so no
// registration number is printed. Usage: npx tsx scripts/render-sample-documents.ts <snapshots> <out>
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { documentModel, type DocumentRecord } from "../lib/documents/model";
import { renderDocumentPdf } from "../lib/documents/pdf";

export function sampleRecord(record: DocumentRecord): DocumentRecord {
  const snapshot = structuredClone(record.snapshot);
  snapshot.issuer = { ...snapshot.issuer, vat_number: null, company_number: null, bank_account_name: null, bank_sort_code: null, bank_account_number: null };
  return { ...record, snapshot };
}
async function main() {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error("Usage: render-sample-documents.ts <snapshot directory> <output directory>");
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(from).filter(f => f.endsWith(".json")).sort()) {
    const record = sampleRecord(JSON.parse(readFileSync(path.join(from, file), "utf8")) as DocumentRecord);
    const bytes = await renderDocumentPdf(documentModel(record, { sample: true }));
    writeFileSync(path.join(to, file.replace(/\.json$/, ".pdf")), bytes);
    console.log(`${file.replace(/\.json$/, ".pdf")}: ${bytes.length} bytes`);
  }
}
if (process.argv[1]?.endsWith("render-sample-documents.ts")) main().catch(error => { console.error(error); process.exit(1); });
