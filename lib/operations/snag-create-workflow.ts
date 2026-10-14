import { ValidationError } from "./validation";

// Keep the exact payload sent under an idempotency key. A connection failure
// leaves the outcome unknown, so editable controls must not change its retry.
export type SnagFormSnapshot = ReadonlyArray<readonly [string, string]>;
export function snapshotSnagForm(form: FormData): SnagFormSnapshot {
  return Object.freeze(Array.from(form.entries(), ([key, value]) => {
    if (typeof value !== "string") throw new ValidationError("Photographs must be verified separately from the finding.");
    return Object.freeze([key, value] as const);
  }));
}
export function restoreSnagForm(snapshot: SnagFormSnapshot) {
  const form = new FormData();
  for (const [key, value] of snapshot) form.append(key, value);
  return form;
}
