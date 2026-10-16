import type { NextAction } from "./types";

/*
 * Wording shared by every screen, so the app and the preview can never disagree about
 * what a button or a label says.
 */
export const CTA: Record<string, string> = {
  G01: "Choose who fixes it", G02: "Choose who fixes it", G03: "Fix it and send photos", G04: "Ask for the check", G05: "Review and decide",
  G06: "Inspect again", G07: "Start inspection", G08: "Decide", G10: "Check the repair",
  A01: "Review defect", A02: "Update cover",
  S03: "Fix it and send photos", R01: "Start morning checks", R02: "Finish earlier work", R03: "Confirm who is here", R04: "Confirm person",
  R05: "Read it", R06: "Review handover", R07: "Chase now", R08: "Set it up", R09: "Publish checks", R10: "Give access", R11: "Update cover",
  R13: "Choose who fixes it", R14: "See the budget", R15: "Respond", R16: "Start inspection",
};
export const ctaLabel = (a: Pick<NextAction, "rule">) => CTA[a.rule] ?? "Open";

export type ClassTone = "must" | "alert" | "reminder";
/** The chip shown on an action. It says only what is true: a gate names what it holds up, an alert says the system does not enforce it. */
export function classChip(a: Pick<NextAction, "kind">): { tone: ClassTone; text: string } {
  if (a.kind === "gate") return { tone: "must", text: "Required step" };
  if (a.kind === "alert") return { tone: "alert", text: "Needs attention" };
  return { tone: "reminder", text: "Reminder" };
}
/** One plain sentence explaining the class. Gates say what they hold up. Alerts say the system will not stop anything. */
export function classNote(a: Pick<NextAction, "kind" | "blocks">): string {
  if (a.kind === "gate") return `${a.blocks ?? "A required step."} It cannot be dismissed, and TileSpec never completes it for anyone.`;
  if (a.kind === "alert") return "TileSpec does not block anything because of this. It is shown first because it matters, and the people named have to act on it.";
  return "A reminder. Nothing is held up by it.";
}
