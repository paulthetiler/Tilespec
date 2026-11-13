import type { MemberRole } from "./types";

/*
 * The rules-engine dashboards (Supervisor Today and the office command centre) are the standard experience
 * for every role. They were introduced behind FEATURE_NEXT_ACTIONS and rolled out role by role. The flag now
 * stays only as an emergency switch back to the earlier dashboards:
 *
 *   unset or empty     on for everyone (the normal state)
 *   off / 0 / false    the earlier dashboards for everyone
 *   on / 1 / true      on for everyone
 *   a comma list       on only for the listed roles, for example "supervisor,owner". A typo in the list
 *                      turns it off rather than on.
 *
 * There is no flag for navigation any more: every role has the one role-aware navigation (lib/operations/role-nav.ts).
 * FEATURE_ROLE_SHELL is ignored.
 */
export type FlagName = "nextActions";
const ENV_NAME: Record<FlagName, string> = { nextActions: "FEATURE_NEXT_ACTIONS" };
const ON = new Set(["1", "true", "on", "yes", "all"]);
const OFF = new Set(["0", "false", "off", "no", "none"]);
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
  const raw = (env[ENV_NAME[name]] ?? "").trim().toLowerCase();
  if (!raw || ON.has(raw)) return true;
  if (OFF.has(raw)) return false;
  const listed = raw.split(",").map(x => x.trim()).filter(Boolean);
  return listed.length > 0 && listed.every(x => ROLES.has(x)) && listed.includes(role);
}
