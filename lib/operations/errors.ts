// Supervisor V2 database functions raise messages written for the person using
// the screen ("Another active location here is already called ..."). Show those;
// never show raw PostgreSQL text such as constraint or relation names.
type DatabaseError = { code?: string; message?: string } | null;

const writtenForPeople = new Set(["22023", "23514", "23P01", "23503", "23505", "40001"]);
const knownConstraints: [RegExp, string][] = [
  [/teams_active_name/, "An active team already has that name."],
  [/subcontractor_companies_name/, "A company with that name is already on record. Check the list, including inactive companies."],
  [/operatives_organisation_id_user_id_key/, "That login is already linked to another operative."],
  [/allocation_absences_once/, "That absence has already been recorded."],
];
const technical = /violates|constraint|duplicate key|relation |column |syntax|function .*does not exist|permission denied/i;

export function rpcErrorMessage(error: NonNullable<DatabaseError>): string {
  const message = error.message ?? "";
  if (error.code === "42501") return "You do not have permission for this operation.";
  for (const [pattern, friendly] of knownConstraints) if (pattern.test(message)) return friendly;
  if (error.code && writtenForPeople.has(error.code) && message && !technical.test(message)) {
    return error.code === "40001" && !/reload|refresh/i.test(message) ? `${message} Refresh and try again.` : message;
  }
  if (error.code === "40001") return "This record changed while you were editing. Refresh before trying again.";
  if (error.code === "23505") return "That already exists. Refresh to see the current records.";
  return "The record could not be saved. Check your connection and try again.";
}
