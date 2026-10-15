export const morningCheckGroups = [
  { title: "People", checks: [
    { item: "Are the expected lads on site?", issueAnswer: "no" },
    { item: "Has everyone received the relevant site safety briefing?", issueAnswer: "no" },
    { item: "Have office instructions been passed on?", issueAnswer: "no" },
  ] },
  { title: "Materials", checks: [
    { item: "Adhesive available?", issueAnswer: "no" },
    { item: "Grout available?", issueAnswer: "no" },
    { item: "Tiles and other required materials available?", issueAnswer: "no" },
    { item: "Water available?", issueAnswer: "no" },
  ] },
  { title: "Site readiness", checks: [
    { item: "Safe, suitable access?", issueAnswer: "no" },
    { item: "Work areas available and clear?", issueAnswer: "no" },
    { item: "Any other trades obstructing progress?", issueAnswer: "yes" },
    { item: "Any outstanding issues with the site manager?", issueAnswer: "yes" },
  ] },
] as const;
export const morningChecks = morningCheckGroups.flatMap(group => [...group.checks]);
export type MorningResponse = "yes" | "no" | "na";
export type MorningAnswer = { item: string; response?: MorningResponse; status: "pass" | "issue" | "na"; note: string };

// Existing open browser tabs can finish the original checklist. Its saved
// wording and meanings remain unchanged, as do all historical records.
const legacyLabels = [
  "HSE issues, hazards and site instructions reviewed", "Yesterday's work and outstanding snags reviewed",
  "Today's operatives and teams accounted for", "Tiles, adhesive, grout and consumables available",
  "Water, mixing area and materials positioned", "Access clear: scaffold, other trades and obstructions",
  "Substrates and missing boardwork checked", "Current drawings, setting out and work instructions reviewed",
  "Delays, variations and dayworks identified", "Team briefed and safe to start",
];
export const morningUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeMorningAnswers(value: unknown): MorningAnswer[] | null {
  if (!Array.isArray(value)) return null;
  const legacy = value.length === legacyLabels.length;
  if (!legacy && value.length !== morningChecks.length) return null;
  const result: MorningAnswer[] = [];
  for (let index = 0; index < value.length; index++) {
    const answer = value[index];
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
    const label = legacy ? legacyLabels[index] : morningChecks[index].item;
    if (answer.item !== label || typeof answer.note !== "string" || answer.note.length > 2000) return null;
    const note = answer.note.trim();
    if (legacy) {
      if (!["pass", "issue", "na"].includes(answer.status) || (["issue", "na"].includes(answer.status) && !note)) return null;
      result.push({ item: label, status: answer.status, note });
    } else {
      const response = answer.response as MorningResponse;
      if (!["yes", "no", "na"].includes(response)) return null;
      const status = response === "na" ? "na" : response === morningChecks[index].issueAnswer ? "issue" : "pass";
      // The server derives blocker status rather than trusting a client flag.
      if (answer.status !== undefined && answer.status !== status) return null;
      result.push({ item: label, response, status, note: note || (status === "na" ? "Not applicable to today’s work." : status === "issue" ? `${response === "yes" ? "Yes" : "No"} — follow-up needed: ${label}` : "") });
    }
  }
  return result;
}

export type ConfirmedMorningSave = { id: string; contractId: string; requestKey: string; createdAt: string; issuesCount: number; confirmed: true };
export function isConfirmedMorningSave(value: unknown, contractId: string, requestKey: string, issuesCount: number): value is ConfirmedMorningSave {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.confirmed === true && typeof result.id === "string" && morningUuid.test(result.id)
    && result.contractId === contractId && result.requestKey === requestKey
    && typeof result.createdAt === "string" && Number.isFinite(Date.parse(result.createdAt))
    && Number.isInteger(result.issuesCount) && result.issuesCount === issuesCount;
}
