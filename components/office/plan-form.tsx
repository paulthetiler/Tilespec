"use client";

import { useState } from "react";
import { membershipOnDay } from "@/lib/operations/planning";
import { installationStageLabels, installationStages, type Company, type Location, type Operative, type PlannedAllocation, type Team, type TeamMembership, type WorkPackage } from "@/lib/operations/types";
import { LocationPicker } from "./location-picker";
import styles from "@/app/admin/admin.module.css";

type Props = {
  locations: Location[]; companies: Company[]; teams: Team[]; operatives: Operative[]; memberships: TeamMembership[]; packages: WorkPackage[];
  today: string; plan?: PlannedAllocation & { operative_ids: string[] };
};

// Where, who, what stage and when. Naming people is optional: the supervisor
// confirms who actually attends on site.
export function PlanForm({ locations, companies, teams, operatives, memberships, packages, today, plan }: Props) {
  const [locationId, setLocationId] = useState<string | null>(plan?.work_area_id ?? null);
  const [teamId, setTeamId] = useState(plan?.team_id ?? "");
  const [firstDay, setFirstDay] = useState(plan?.planned_start ?? today);
  const location = locations.find(item => item.id === locationId);
  const fits = (pack: WorkPackage) => {
    const area = locations.find(item => item.id === pack.work_area_id);
    return Boolean(location && area && (location.path_ids.includes(area.id) || area.path_ids.includes(location.id)));
  };
  const memberIds = new Set(memberships.filter(m => m.team_id === teamId && membershipOnDay(m, firstDay)).map(m => m.operative_id));
  for (const id of plan?.operative_ids ?? []) memberIds.add(id);
  const people = operatives.filter(person => memberIds.has(person.id) && person.status === "active");
  const lead = memberships.find(m => m.team_id === teamId && m.is_lead && membershipOnDay(m, firstDay));
  const choosable = teams.filter(team => team.active || team.id === plan?.team_id);
  const companyName = (team: Team) => companies.find(company => company.id === team.company_id)?.name;
  return (
    <div className={styles.form}>
      <LocationPicker name="work_area_id" label="Where *" locations={locations} defaultValue={plan?.work_area_id ?? null} onChange={setLocationId}
        hint="Choose a flat, a whole level, or a single room." />
      <div className={styles.formGrid}>
        <label className={styles.field}>Which team *<select name="team_id" required value={teamId} onChange={event => setTeamId(event.target.value)}>
          <option value="" disabled>Choose a team</option>
          {choosable.map(team => <option key={team.id} value={team.id}>{team.name}{companyName(team) ? ` (${companyName(team)})` : ""}</option>)}
        </select></label>
        <label className={styles.field}>Stage *<select name="stage" required defaultValue={plan?.stage ?? "installation"}>
          {installationStages.map(stage => <option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}
        </select></label>
        <label className={styles.field}>First day *<input type="date" name="planned_start" required value={firstDay} onChange={event => setFirstDay(event.target.value)} /></label>
        <label className={styles.field}>Last day<input type="date" name="planned_end" defaultValue={plan?.planned_end ?? ""} min={firstDay} /><small>Leave blank for a single day.</small></label>
      </div>
      {teamId && <fieldset className={styles.fieldset}>
        <legend>Who is expected (optional)</legend>
        {people.length > 0 ? <div className={styles.checkList}>{people.map(person => <label key={person.id} className={styles.checkboxRow}>
          <input type="checkbox" name="operative_ids" value={person.id} defaultChecked={plan?.operative_ids.includes(person.id) ?? false} />
          {person.display_name}{lead?.operative_id === person.id ? " (lead)" : ""}
        </label>)}</div> : <p className={styles.small}>This team has no confirmed members on the first day. You can still plan the team; the supervisor records who attends.</p>}
        <p className={styles.small}>Leave everyone unticked to let the supervisor confirm who attends on the day.</p>
      </fieldset>}
      {location && packages.some(fits) && <label className={styles.field}>Work package (optional)<select name="work_package_id" defaultValue={plan?.work_package_id ?? ""}>
        <option value="">Not linked to a package</option>
        {packages.filter(fits).map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
      </select></label>}
      <label className={styles.field}>Instructions for the team<textarea name="instructions" defaultValue={plan?.instructions ?? ""} rows={3} maxLength={4000} placeholder="For example: bathroom first, protect the bath panel" /></label>
    </div>
  );
}
