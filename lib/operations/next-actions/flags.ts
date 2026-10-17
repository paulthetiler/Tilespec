import type { MemberRole } from "./types";

/*
 * Feature flags for Phase 2. Both are OFF unless set, so merging changes nothing for anyone.
 *
 *   FEATURE_NEXT_ACTIONS   the shared rules engine drives Supervisor, Office and Owner Today
 *   FEATURE_ROLE_SHELL     role-specific navigation (at most four destinations per role)
 *
 * A flag can be "off", "on" (everyone) or a comma list of roles for a staged rollout,
 * for example FEATURE_ROLE_SHELL=supervisor,lead_installer
 */
export type FlagName = "nextActions" | "roleShell";
const ENV_NAME: Record<FlagName, string> = { nextActions: "FEATURE_NEXT_ACTIONS", roleShell: "FEATURE_ROLE_SHELL" };
const ON = new Set(["1", "true", "on", "yes", "all"]);
const ROLES = new Set<string>(["owner", "contracts_manager", "supervisor", "lead_installer", "subcontract_installer"]);

/**
 * The clickable Supervisor Today prototype is copied to /preview/workflow
 * on Vercel Preview and local `next dev` only. Production never serves it.
 */
export function workflowPreviewExposed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV === "preview") return true;
  if (env.VERCEL) return false;
  return env.NODE_ENV === "development";
}

export function flagEnabled(name: FlagName, role: MemberRole, env: Record<string, string | undefined> = process.env): boolean {
  // Local, preview and production all require explicit opt-in. The fictional
  // workflow preview is exposed separately and never enables application flags.
  const raw = (env[ENV_NAME[name]] ?? "").trim().toLowerCase();
  if (!raw) return false;
  if (ON.has(raw)) return true;
  const listed = raw.split(",").map(x => x.trim()).filter(Boolean);
  return listed.length > 0 && listed.every(x => ROLES.has(x)) && listed.includes(role);
}
