/**
 * Whether a supervisor's note actually reports something. "None", "n/a", "all good" and blank notes
 * are not problems for the office to review. Mirrors private.meaningful_text in the database so the
 * dashboard and the morning email agree.
 */
const NOTHING = /^ *(none|no|nil|nothing|n a|na|ok|okay|all good|all ok|fine|good|none good day|none all good|nothing to report|no issues|no problems|none today|not applicable)? *$/;
export function meaningfulText(text: string | null | undefined): boolean {
  const value = (text ?? "").toLowerCase();
  if (!value.replace(/[^a-z0-9]+/g, "")) return false;
  return !NOTHING.test(value.trim().replace(/[\s\p{P}\p{S}]+/gu, " "));
}
