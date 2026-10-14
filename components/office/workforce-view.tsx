import Link from "next/link";
import { OperationsForm } from "@/components/operations/operations-form";
import { calendarDate } from "@/components/operations/format";
import { membershipOnDay } from "@/lib/operations/planning";
import { engagements, teamKinds } from "@/lib/operations/validation";
import { engagementLabels, teamKindLabels, type ActionState, type Company, type CompanyAccreditation, type CompanyInsurance, type Operative, type Team, type TeamMembership } from "@/lib/operations/types";
import { CompanyList, type CompanyActions } from "./company-list";
import styles from "@/app/admin/admin.module.css";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;
export type WorkforceActions = CompanyActions & {
  createOperative: Action; updateOperative: Action; confirmOperative: Action; createTeam: Action;
  updateTeam: Action; addMember: Action; endMembership: Action; voidMembership: Action;
};
type Props = {
  companies: Company[]; insurances: CompanyInsurance[]; accreditations: CompanyAccreditation[];
  teams: Team[]; operatives: Operative[]; memberships: TeamMembership[]; logins: { user_id: string; display_name: string }[];
  company: string | null; today: string; newKey: () => string; actions: WorkforceActions; basePath: string;
};
// The company filter is a company ID, or this value for people and teams with none.
export const NO_COMPANY = "none";

export function WorkforceView({ companies, insurances, accreditations, teams, operatives, memberships, logins, company, today, newKey, actions, basePath }: Props) {
  const companyOf = (record: { company_id: string | null }) => record.company_id ?? NO_COMPANY;
  const counts = new Map<string, number>();
  for (const record of [...teams, ...operatives]) counts.set(companyOf(record), (counts.get(companyOf(record)) ?? 0) + 1);
  const names = new Map(companies.map(item => [item.id, item.name]));
  const chipCompanies = companies.filter(item => item.active || counts.has(item.id));
  const selected = company && company !== NO_COMPANY && names.has(company) ? company : null;
  const shownTeams = company ? teams.filter(team => companyOf(team) === company) : teams;
  const shownPeople = company ? operatives.filter(person => companyOf(person) === company) : operatives;
  const byId = new Map(operatives.map(person => [person.id, person]));
  const current = (teamId: string) => memberships.filter(m => m.team_id === teamId && membershipOnDay(m, today));
  const upcoming = (teamId: string) => memberships.filter(m => m.team_id === teamId && !m.voided_at && m.valid_from > today);
  const history = (teamId: string) => memberships.filter(m => m.team_id === teamId && (m.voided_at || (m.valid_until !== null && m.valid_until < today)));
  const teamsOf = (personId: string) => memberships.filter(m => m.operative_id === personId && membershipOnDay(m, today)).map(m => teams.find(team => team.id === m.team_id)?.name).filter(Boolean);
  const linked = new Set(operatives.map(person => person.user_id).filter(Boolean));
  const provisional = operatives.filter(person => person.status === "provisional");
  // Keyed by its default so a new company filter (or a saved change) re-selects;
  // a select only reads defaultValue when it mounts.
  const companyField = (current: string | null) => <label className={styles.field}>Company<select key={current ?? ""} name="company_id" defaultValue={current ?? ""}>
    <option value="">No company (direct staff)</option>
    {companies.filter(item => item.active || item.id === current).map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (inactive)"}</option>)}
  </select><small>Not listed? Add the company above first.</small></label>;
  return <>
    <nav className={styles.chips} aria-label="Filter by company">
      <Link className={styles.chip} href={basePath} aria-current={company === null}>All <span className={styles.chipCount}>{teams.length + operatives.length}</span></Link>
      {chipCompanies.map(item => <Link key={item.id} className={styles.chip} href={`${basePath}?company=${item.id}`} aria-current={company === item.id}>{item.name} <span className={styles.chipCount}>{counts.get(item.id) ?? 0}</span></Link>)}
      {counts.has(NO_COMPANY) && <Link className={styles.chip} href={`${basePath}?company=${NO_COMPANY}`} aria-current={company === NO_COMPANY}>No company recorded <span className={styles.chipCount}>{counts.get(NO_COMPANY)}</span></Link>}
    </nav>
    {company !== NO_COMPANY && <CompanyList companies={companies} insurances={insurances} accreditations={accreditations} teams={teams} operatives={operatives}
      selected={selected} today={today} newKey={newKey} actions={actions} basePath={basePath} />}
    {provisional.length > 0 && <div className={styles.warning} role="status"><strong>{provisional.length} {provisional.length === 1 ? "person was" : "people were"} added on site and {provisional.length === 1 ? "needs" : "need"} confirming:</strong> {provisional.map(person => person.display_name).join(", ")}. Confirm them below before naming them in plans.</div>}

    <section className={styles.panel} aria-labelledby="teams-heading">
      <div className={styles.panelHeader}><div><h2 id="teams-heading">Gangs and teams</h2><p className={styles.muted}>Who works together. A person can be in more than one team.</p></div></div>
      <details className={`${styles.disclosure} ${styles.panelDisclosure}`}>
        <summary>+ Add a team</summary>
        <OperationsForm action={actions.createTeam} submitLabel="Create team">
          <input type="hidden" name="request_key" value={newKey()} />
          <div className={styles.formGrid}>
            <label className={styles.field}>Team name *<input name="name" required maxLength={160} placeholder="Smith Tiling gang 1" /></label>
            <label className={styles.field}>Kind of team *<select name="kind" defaultValue="subcontract_gang">{teamKinds.map(kind => <option key={kind} value={kind}>{teamKindLabels[kind]}</option>)}</select></label>
            {companyField(selected)}
          </div>
        </OperationsForm>
      </details>
      <div className={styles.cardList}>{shownTeams.map(team => {
        const members = current(team.id), lead = members.find(m => m.is_lead);
        const candidates = operatives.filter(person => person.status !== "inactive" && ![...members, ...upcoming(team.id)].some(m => m.operative_id === person.id));
        return <article key={team.id} className={styles.card}>
          <div className={styles.cardTop}>
            <div><h3>{team.name}</h3><p className={styles.small}>{teamKindLabels[team.kind]}{team.company_id ? ` · ${names.get(team.company_id) ?? "Company"}` : ""}{lead ? ` · Lead: ${byId.get(lead.operative_id)?.display_name}` : " · No lead set"}</p></div>
            {!team.active && <span className={styles.warningBadge}>Inactive</span>}
          </div>
          <ul className={styles.people} aria-label={`${team.name} members`}>
            {members.map(m => <li key={m.id} className={`${styles.person}${m.is_lead ? ` ${styles.lead}` : ""}`}>{byId.get(m.operative_id)?.display_name}{m.is_lead ? " (lead)" : ""}</li>)}
            {upcoming(team.id).map(m => <li key={m.id} className={styles.person}>{byId.get(m.operative_id)?.display_name} · starts {calendarDate(m.valid_from)}</li>)}
            {members.length === 0 && <li className={styles.small}>No current members.</li>}
          </ul>
          <details className={styles.disclosure}>
            <summary aria-label={`Manage ${team.name}`}>Manage team</summary>
            <div className={styles.stack}>
              {team.active && <OperationsForm action={actions.addMember} submitLabel="Add to team">
                <input type="hidden" name="request_key" value={newKey()} />
                <input type="hidden" name="team_id" value={team.id} />
                <div className={styles.formGrid}>
                  <label className={styles.field}>Person *<select name="operative_id" required defaultValue="">
                    <option value="" disabled>Choose a person</option>
                    {candidates.map(person => <option key={person.id} value={person.id}>{person.display_name}{person.company_id ? ` (${names.get(person.company_id) ?? "Company"})` : ""}</option>)}
                  </select></label>
                  <label className={styles.field}>From *<input type="date" name="valid_from" defaultValue={today} required /></label>
                  <label className={`${styles.checkboxRow} ${styles.wide}`}><input type="checkbox" name="is_lead" />Team lead</label>
                </div>
              </OperationsForm>}
              {members.map(m => <details key={m.id} className={styles.details}>
                <summary>{byId.get(m.operative_id)?.display_name}{m.is_lead ? " (lead)" : ""} · since {calendarDate(m.valid_from)}</summary>
                <OperationsForm action={actions.endMembership} submitLabel="End membership" compact>
                  <input type="hidden" name="membership_id" value={m.id} />
                  <div className={styles.formGrid}>
                    <label className={styles.field}>Last day in the team *<input type="date" name="valid_until" defaultValue={today} min={m.valid_from} required /></label>
                    <label className={styles.field}>Reason<input name="reason" maxLength={2000} placeholder="Moved to another gang" /></label>
                  </div>
                </OperationsForm>
                <p className={styles.small}>Added by mistake? Mark it as entered in error instead; it stays on record with your reason.</p>
                <OperationsForm action={actions.voidMembership} submitLabel="Entered in error" compact>
                  <input type="hidden" name="membership_id" value={m.id} />
                  <label className={styles.field}>Reason *<input name="reason" required minLength={5} maxLength={2000} placeholder="Added to the wrong team" /></label>
                </OperationsForm>
              </details>)}
              <details className={styles.details}>
                <summary>Team details</summary>
                <OperationsForm action={actions.updateTeam} submitLabel="Save team">
                  <input type="hidden" name="team_id" value={team.id} />
                  <input type="hidden" name="version" value={team.version} />
                  <div className={styles.formGrid}>
                    <label className={styles.field}>Team name *<input name="name" defaultValue={team.name} required maxLength={160} /></label>
                    <label className={styles.field}>Kind of team *<select name="kind" defaultValue={team.kind}>{teamKinds.map(kind => <option key={kind} value={kind}>{teamKindLabels[kind]}</option>)}</select></label>
                    {companyField(team.company_id)}
                    <label className={styles.checkboxRow}><input type="checkbox" name="active" defaultChecked={team.active} />Active (can be planned)</label>
                  </div>
                </OperationsForm>
              </details>
              {history(team.id).length > 0 && <details className={styles.details}>
                <summary>Past members ({history(team.id).length})</summary>
                <ul className={styles.documentList}>{history(team.id).map(m => <li key={m.id} className={styles.documentRow}>
                  <div><strong>{byId.get(m.operative_id)?.display_name}</strong>{m.is_lead ? " (lead)" : ""}
                    <p className={styles.small}>{m.voided_at ? `Entered in error: ${m.void_reason ?? ""}` : `${calendarDate(m.valid_from)} to ${calendarDate(m.valid_until)}${m.end_reason ? ` · ${m.end_reason}` : ""}`}</p></div>
                </li>)}</ul>
              </details>}
            </div>
          </details>
        </article>;
      })}</div>
      {shownTeams.length === 0 && <p className={styles.empty}>{company ? "No teams for this company yet." : "No teams yet. Create your first gang or team above."}</p>}
    </section>

    <section className={styles.panel} aria-labelledby="people-heading">
      <div className={styles.panelHeader}><div><h2 id="people-heading">Operatives</h2><p className={styles.muted}>Everyone who works on your sites, with or without a login.</p></div></div>
      <details className={`${styles.disclosure} ${styles.panelDisclosure}`}>
        <summary>+ Add an operative</summary>
        <OperationsForm action={actions.createOperative} submitLabel="Add operative">
          <input type="hidden" name="request_key" value={newKey()} />
          <div className={styles.formGrid}>
            <label className={styles.field}>Full name *<input name="display_name" required maxLength={160} /></label>
            <label className={styles.field}>Engaged as *<select name="engagement" defaultValue="subcontractor">{engagements.map(kind => <option key={kind} value={kind}>{engagementLabels[kind]}</option>)}</select></label>
            {companyField(selected)}
            <label className={styles.field}>TileSPEC login (optional)<select name="user_id" defaultValue=""><option value="">No login</option>
              {logins.filter(login => !linked.has(login.user_id)).map(login => <option key={login.user_id} value={login.user_id}>{login.display_name}</option>)}
            </select></label>
          </div>
        </OperationsForm>
      </details>
      <ul className={styles.documentList}>{shownPeople.map(person => {
        const memberOf = teamsOf(person.id);
        return <li key={person.id} className={styles.personRow}>
          <div>
            <strong>{person.display_name}</strong>{" "}
            {person.status === "provisional" && <span className={styles.warningBadge}>Added on site, needs confirming</span>}
            {person.status === "inactive" && <span className={styles.badge}>Inactive</span>}
            <p className={styles.small}>{engagementLabels[person.engagement]}{person.company_id ? ` · ${names.get(person.company_id) ?? "Company"}` : ""} · {memberOf.length ? `${memberOf.length === 1 ? "Team" : "Teams"}: ${memberOf.join(", ")}` : "Not in a team"}{person.user_id ? " · Has a login" : ""}</p>
          </div>
          {person.status === "provisional" && <OperationsForm action={actions.confirmOperative} submitLabel={`Confirm ${person.display_name}`} compact>
            <input type="hidden" name="operative_id" value={person.id} />
            <input type="hidden" name="version" value={person.version} />
          </OperationsForm>}
          <details className={styles.disclosure}>
            <summary aria-label={`Edit ${person.display_name}`}>Edit</summary>
            <OperationsForm action={actions.updateOperative} submitLabel="Save operative">
              <input type="hidden" name="operative_id" value={person.id} />
              <input type="hidden" name="version" value={person.version} />
              <div className={styles.formGrid}>
                <label className={styles.field}>Full name *<input name="display_name" defaultValue={person.display_name} required maxLength={160} /></label>
                <label className={styles.field}>Engaged as *<select name="engagement" defaultValue={person.engagement}>{engagements.map(kind => <option key={kind} value={kind}>{engagementLabels[kind]}</option>)}</select></label>
                {companyField(person.company_id)}
                <label className={styles.field}>TileSPEC login<select name="user_id" defaultValue={person.user_id ?? ""}><option value="">No login</option>
                  {logins.filter(login => login.user_id === person.user_id || !linked.has(login.user_id)).map(login => <option key={login.user_id} value={login.user_id}>{login.display_name}</option>)}
                </select></label>
                <label className={styles.field}>Status<select name="status" defaultValue={person.status === "inactive" ? "inactive" : "active"}><option value="active">Active</option><option value="inactive">Inactive (no longer works for you)</option></select></label>
              </div>
            </OperationsForm>
          </details>
        </li>;
      })}</ul>
      {shownPeople.length === 0 && <p className={styles.empty}>{company ? "No operatives for this company yet." : "No operatives yet. Add the people who work on your sites."}</p>}
    </section>
  </>;
}
