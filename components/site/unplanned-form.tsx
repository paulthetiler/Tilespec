"use client";

import { useState } from "react";
import { OperationsForm } from "@/components/operations/operations-form";
import { LocationPicker } from "@/components/office/location-picker";
import { membershipOnDay } from "@/lib/operations/planning";
import { changeReasons, engagements } from "@/lib/operations/validation";
import {
  engagementLabels, installationStageLabels, installationStages, type ActionState, type Company, type Location, type Operative, type Team, type TeamMembership,
} from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>; contractId: string; day: string; requestKey: string; personKey: string;
  teams: Team[]; operatives: Operative[]; memberships: TeamMembership[]; companies: Company[]; locations: Location[]; onSite: string[];
};

// Labour that is not on the office's plan: a registered team, people from
// other teams for the day, or someone new. Someone new is recorded as
// provisional; only the office confirms people and manages companies.
export function UnplannedForm({ action, contractId, day, requestKey, personKey, teams, operatives, memberships, companies, locations, onSite }: Props) {
  const [teamId, setTeamId] = useState("");
  const available = operatives.filter(person => person.status !== "inactive" && !onSite.includes(person.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "en-GB"));
  const members = teamId ? memberships.filter(item => item.team_id === teamId && membershipOnDay(item, day)).map(item => item.operative_id) : [];
  const fromTeam = available.filter(person => members.includes(person.id));
  const others = available.filter(person => !members.includes(person.id));
  return <OperationsForm key={requestKey} action={action} submitLabel="Record labour on site">
    <div className={styles.stack}>
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="request_key" value={requestKey} />
      <input type="hidden" name="person_request_key" value={personKey} />
      <label className={styles.field}>Team (optional)<select name="team_id" value={teamId} onChange={event => setTeamId(event.target.value)}>
        <option value="">No team: individuals</option>
        {teams.filter(team => team.active).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select></label>
      {fromTeam.length > 0 && <fieldset className={styles.fieldset}>
        <legend>Who from this team is here?</legend>
        <div className={styles.checkList}>{fromTeam.map(person => <label key={`${teamId}-${person.id}`} className={styles.checkboxRow}>
          <input type="checkbox" name="operative_ids" value={person.id} defaultChecked />{person.display_name}{person.status === "provisional" ? " (provisional)" : ""}
        </label>)}</div>
      </fieldset>}
      <label className={styles.field}>{fromTeam.length ? "Someone else (optional)" : "Who is here?"}<select name="operative_ids" defaultValue="">
        <option value="">{fromTeam.length ? "Nobody else" : "Choose a registered person"}</option>
        {others.map(person => <option key={person.id} value={person.id}>{person.display_name}{person.status === "provisional" ? " (provisional)" : ""}</option>)}
      </select><small>Working with another team today does not change their usual team.</small></label>
      <details className={styles.details}>
        <summary>Someone new, not registered yet</summary>
        <p className={styles.small}>They are recorded as provisional. The office must confirm them; this is not a compliance check.</p>
        <div className={styles.formGrid}>
          <label className={styles.field}>Full name<input name="new_name" maxLength={160} autoComplete="off" /></label>
          <label className={styles.field}>Engaged as<select name="new_engagement" defaultValue="subcontractor">
            {engagements.map(kind => <option key={kind} value={kind}>{engagementLabels[kind]}</option>)}</select></label>
          <label className={styles.field}>Company<select name="company_id" defaultValue="">
            <option value="">Not known / not listed</option>
            {companies.filter(company => company.active).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select><small>Only the office can add a new company.</small></label>
        </div>
      </details>
      <LocationPicker name="work_area_id" label="Working at *" locations={locations} />
      <div className={styles.formGrid}>
        <label className={styles.field}>Stage *<select name="stage" defaultValue="installation">
          {installationStages.map(stage => <option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>
        <label className={styles.field}>Acting lead<select name="lead_operative_id" defaultValue="">
          <option value="">No lead recorded</option>{fromTeam.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
        </select></label>
        <label className={`${styles.field} ${styles.timeField}`}>Start time<input type="time" name="started_time" /><small>Leave blank to record the time now.</small></label>
      </div>
      <fieldset className={styles.choices}><legend>Why are they on site? *</legend>
        {[...changeReasons.slice(4), "Called in for extra work", "Covering for an absent team"].map(reason => <label key={reason}><input type="radio" name="reason" value={reason} />{reason}</label>)}
      </fieldset>
      <label className={styles.field}>Or in your own words<input name="reason_other" maxLength={2000} /></label>
    </div>
  </OperationsForm>;
}
