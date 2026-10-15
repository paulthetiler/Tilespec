type SavedSnag = {
  id?: unknown;
  contract_id?: unknown;
  inspector_id?: unknown;
  version?: unknown;
  snag_status?: unknown;
};

export function isSavedSnagId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function confirmsSnagCreation(saved: SavedSnag | null | undefined, result: unknown, contract: string, actor: string) {
  return isSavedSnagId(result) && saved?.id === result && saved.contract_id === contract && saved.inspector_id === actor;
}

// An HTTP response (even the expected ID) is not evidence of a saved change.
// Keep the original request available when the persisted version did not advance.
export function confirmsSnagTransition(saved: SavedSnag | null | undefined, result: unknown, issue: string, version: number, action: string) {
  if (result !== issue || !isSavedSnagId(result) || saved?.id !== issue || !isSavedSnagId(saved.contract_id)
    || !Number.isInteger(saved.version) || Number(saved.version) < version + 1) return false;
  if (action === "submit") return typeof saved.snag_status === "string" && ["open", "assigned", "rectification_submitted", "reinspection", "closed", "cancelled"].includes(saved.snag_status);
  const expected: Record<string, string> = { assign: "assigned", submit_rectification: "rectification_submitted", start_reinspection: "reinspection", accept: "closed", reject: "open", reopen: "open", cancel: "cancelled" };
  return !expected[action] || saved.snag_status === expected[action];
}
