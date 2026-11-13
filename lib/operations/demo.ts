/*
 * Demonstration and test records live alongside real ones in the same database (nothing is deleted without the
 * owner's approval). They are named by convention: a job whose reference starts "DEMO-" or "TEST-", or whose name
 * starts with the capitalised word DEMO or TEST ("DEMO — Supermarket refurbishment"); a gang whose name starts
 * with TEST. Screens mark them so they are never mistaken for real work. The check is deliberately strict about
 * capitals, so a real "Test kitchen refit" is not caught.
 */
export function isDemoRecord(record: { reference?: string | null; name?: string | null }): boolean {
  return /^(DEMO|TEST)[-\s]/i.test(record.reference ?? "") || /^(DEMO|TEST)\b/.test(record.name ?? "");
}
