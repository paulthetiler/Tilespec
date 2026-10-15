import { OperationsForm } from "@/components/operations/operations-form";
import { LocationPicker } from "@/components/office/location-picker";
import { londonClock } from "@/lib/operations/planning";
import { exceptionLabels, type DayException, type Period, type PersonOnPlan, type TeamCard } from "@/lib/operations/site-day";
import {
  absenceReasons, arrivalNotes, changeReasons, departureNotes, notOnSiteReasons,
} from "@/lib/operations/validation";
import {
  allocationDeviationLabels, installationStageLabels, installationStages, type ActionState, type Location, type Operative,
} from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;
export type SiteActions = {
  confirmAsPlanned: Action; confirmChanges: Action; notOnSite: Action; undoNotOnSite: Action; move: Action; arrival: Action;
  departure: Action; finishPeriod: Action; finishDay: Action; setLead: Action; voidPeriod: Action; recordUnplanned: Action;
};
export type DayContext = {
  contractId: string; day: string; newKey: () => string; locations: Location[]; operatives: Operative[];
  names: Map<string, string>; userId: string; isOffice: boolean;
  // Without actions the view is read-only, as in the history and the office view.
  actions?: SiteActions;
};

const statusBadge = {
  unconfirmed: [styles.warningBadge, "Not confirmed"], on_site: [styles.okBadge, "On site"],
  finished: [styles.badge, "Finished"], not_on_site: [styles.dangerBadge, "Not on site"],
} as const;
const cardClass = { unconfirmed: styles.cardUnconfirmed, on_site: styles.cardOnSite, finished: styles.cardFinished, not_on_site: styles.cardNotOnSite };
const personText: Record<PersonOnPlan["status"], string> = { here: "Here", left: "Left", absent: "Absent", not_recorded: "Not recorded", awaiting: "Expected" };
const usable = (people: Operative[]) => people.filter(person => person.status !== "inactive").sort((a, b) => a.display_name.localeCompare(b.display_name, "en-GB"));
const dateRange = (from: string, to: string) => {
  const format = (value: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  return from === to ? format(from) : `${format(from)} to ${format(to)}`;
};

function Hidden({ values }: { values: Record<string, string> }) {
  return <>{Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}</>;
}
// One tap on a usual reason, or the supervisor's own words.
function ReasonChoices({ name, legend, reasons, required = false, hint }: { name: string; legend: string; reasons: readonly string[]; required?: boolean; hint?: string }) {
  return <div className={styles.stack}>
    <fieldset className={styles.choices}>
      <legend>{legend}{required ? " *" : ""}</legend>
      {reasons.map(reason => <label key={reason}><input type="radio" name={name} value={reason} />{reason}</label>)}
    </fieldset>
    <label className={styles.field}>Or in your own words<input name={`${name}_other`} maxLength={2000} />{hint && <small>{hint}</small>}</label>
  </div>;
}
function TimeField({ name, label, hint = "Leave blank to record the time now.", required = false }: { name: string; label: string; hint?: string; required?: boolean }) {
  return <label className={`${styles.field} ${styles.timeField}`}>{label}{required ? " *" : ""}<input type="time" name={name} required={required} /><small>{hint}</small></label>;
}
function PersonSelect({ name, label, groups }: { name: string; label: string; groups: [string, Operative[]][] }) {
  return <label className={styles.field}>{label}<select name={name} required defaultValue="">
    <option value="" disabled>Choose a person</option>
    {groups.filter(([, people]) => people.length).map(([group, people]) => <optgroup key={group} label={group}>
      {people.map(person => <option key={person.id} value={person.id}>{person.display_name}{person.status === "provisional" ? " (provisional)" : ""}</option>)}
    </optgroup>)}
  </select></label>;
}

export function ExceptionList({ exceptions, empty }: { exceptions: DayException[]; empty: string }) {
  if (exceptions.length === 0) return <p className={styles.empty}>{empty}</p>;
  return <ul className={styles.exceptionList}>{exceptions.map((item, index) => <li key={`${item.kind}-${index}`}>
    <strong>{exceptionLabels[item.kind]}:</strong> {item.text}{item.at ? ` (${londonClock(item.at)})` : ""}{item.reason ? <>. <em>{item.reason}</em></> : ""}
  </li>)}</ul>;
}

export function TeamCardView({ card, context }: { card: TeamCard; context: DayContext }) {
  const { plan } = card;
  const [badge, label] = statusBadge[card.status];
  const headingId = `team-${plan.id}`;
  const leadName = card.people.find(person => person.id === card.plannedLead)?.name ?? context.operatives.find(person => person.id === card.plannedLead)?.display_name;
  return <article className={`${styles.card} ${styles.teamCard} ${cardClass[card.status]}`} aria-labelledby={headingId}>
    <div className={styles.cardTop}>
      <div><h3 id={headingId}>{card.team?.name ?? "Team"}</h3>
        <p className={styles.small}>{[card.company?.name, leadName ? `Lead: ${leadName}` : "No lead set"].filter(Boolean).join(" · ")}</p></div>
      <span className={badge}>{label}</span>
    </div>
    <p className={styles.small}><strong>Planned:</strong> {card.location} · <span className={`${styles.badge} ${styles.stageBadge}`}>{installationStageLabels[plan.stage]}</span> · {dateRange(plan.planned_start, plan.planned_end)}</p>
    {plan.instructions && <p className={styles.small}>{plan.instructions}</p>}
    <ul className={styles.personList} aria-label={`${card.team?.name ?? "Team"} people`}>
      {card.people.map(person => <li key={person.id}>
        <span><strong>{person.name}</strong>{person.provisional && <> <span className={styles.warningBadge}>Provisional</span></>}{person.inactive && " · Inactive"}{!person.planned && " · Not planned"}</span>
        <span>{personText[person.status]}{person.status === "awaiting" ? "" : ` · ${person.detail}`}</span>
      </li>)}
      {card.people.length === 0 && <li><span>Nobody is named for this team today.</span></li>}
    </ul>
    {card.teamAbsence && <p className={styles.small}><strong>Not on site:</strong> {card.teamAbsence.reason} (recorded {londonClock(card.teamAbsence.recorded_at)}
      {context.names.get(card.teamAbsence.recorded_by) ? ` by ${context.names.get(card.teamAbsence.recorded_by)}` : ""})</p>}
    {context.actions && (card.status === "unconfirmed" || card.status === "not_on_site") && <ConfirmControls card={card} context={context} actions={context.actions} />}
    {card.periods.map(period => <PeriodView key={period.allocation.id} period={period} context={context} card={card} />)}
  </article>;
}

function ConfirmControls({ card, context, actions }: { card: TeamCard; context: DayContext; actions: SiteActions }) {
  const { plan } = card;
  const confirmable = card.expected.filter(id => context.operatives.find(person => person.id === id && person.status !== "inactive"));
  const base = { contract_id: context.contractId, planned_allocation_id: plan.id, day: context.day };
  const confirmKey = context.newKey(), changeKey = context.newKey(), absentKey = context.newKey();
  const expected = card.people.filter(person => person.planned && !person.inactive);
  const teamOthers = usable(context.operatives).filter(person => !card.expected.includes(person.id));
  return <div className={styles.cardButtons}>
    {confirmable.length > 0
      ? <OperationsForm freezeOnFailure key={confirmKey} action={actions.confirmAsPlanned} submitLabel={card.status === "not_on_site" ? "Arrived: confirm as planned" : "Confirm as planned"}
        submitClassName={styles.bigButton} plain footer={<details className={styles.details}><summary>Started before now?</summary><TimeField name="started_time" label="Start time" /></details>}>
        <Hidden values={{ ...base, request_key: confirmKey }} />
        {confirmable.map(id => <input key={id} type="hidden" name="operative_ids" value={id} />)}
        {card.plannedLead && confirmable.includes(card.plannedLead) && <input type="hidden" name="lead_operative_id" value={card.plannedLead} />}
      </OperationsForm>
      : <p className={styles.small}>Nobody is named for this team. Use Make changes to record who is here.</p>}
    <details className={styles.disclosure}>
      <summary aria-label={`Make changes for ${card.team?.name ?? "team"}`}>Make changes</summary>
      <OperationsForm freezeOnFailure key={changeKey} action={actions.confirmChanges} submitLabel="Save what happened">
        <div className={`${styles.stack} ${styles.splitForm}`}>
          <Hidden values={{ ...base, request_key: changeKey }} />
          <p className={styles.small}>Mark each person. Only differences from the plan need a reason; an absence reason is enough when someone is missing.</p>
          {expected.map(person => <div key={person.id} className={styles.personChoice}>
            <strong>{person.name}{person.provisional ? " (provisional)" : ""}</strong>
            <input type="hidden" name="person" value={person.id} />
            <fieldset className={styles.choices}><legend className={styles.srOnly}>Is {person.name} here?</legend>
              <label><input type="radio" name={`status_${person.id}`} value="here" defaultChecked />Here</label>
              <label><input type="radio" name={`status_${person.id}`} value="absent" />Absent</label>
              <label><input type="radio" name={`status_${person.id}`} value="later" />Not here yet</label>
            </fieldset>
            <div className={styles.absentOnly}><ReasonChoices name={`absent_reason_${person.id}`} legend={`Why is ${person.name} absent?`} reasons={absenceReasons} required /></div>
            <fieldset className={`${styles.choices} ${styles.splitOnly}`}><legend>Where is {person.name} working?</legend>
              <label><input type="radio" name={`group_${person.id}`} value="a" defaultChecked />First location</label>
              <label><input type="radio" name={`group_${person.id}`} value="b" />Second location</label>
            </fieldset>
          </div>)}
          <label className={styles.field}>Someone else is also here<select name="extra_ids" defaultValue="">
            <option value="">Nobody else</option>
            {teamOthers.map(person => <option key={person.id} value={person.id}>{person.display_name}{person.status === "provisional" ? " (provisional)" : ""}</option>)}
          </select><small>They join this team for today only; their usual team does not change.</small></label>
          <LocationPicker name="work_area_id" label="Working at" locations={context.locations} defaultValue={plan.work_area_id}
            hint="Change only if they are working somewhere other than planned." />
          <label className={styles.checkboxRow}><input type="checkbox" name="split" />Split the gang between two locations</label>
          <div className={styles.splitOnly}>
            <LocationPicker name="work_area_id_b" label="Second location" locations={context.locations} />
            <label className={styles.field}>Acting lead at the second location<select name="lead_b" defaultValue="">
              <option value="">No lead recorded</option>{expected.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select></label>
          </div>
          <div className={styles.formGrid}>
            <label className={styles.field}>Stage<select name="stage" defaultValue={plan.stage}>
              {installationStages.map(stage => <option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>
            <label className={styles.field}>Acting lead<select name="lead_a" defaultValue={card.plannedLead ?? ""}>
              <option value="">No lead recorded</option>{expected.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select></label>
            <TimeField name="started_time" label="Start time" />
          </div>
          <ReasonChoices name="reason" legend="Why is it different from the plan?" reasons={changeReasons} hint="Needed when the location, stage or people differ from the plan." />
        </div>
      </OperationsForm>
    </details>
    {card.status === "unconfirmed" && <details className={styles.disclosure}>
      <summary aria-label={`Not on site: ${card.team?.name ?? "team"}`}>Not on site</summary>
      <OperationsForm freezeOnFailure key={absentKey} action={actions.notOnSite} submitLabel="Record not on site">
        <Hidden values={{ ...base, request_key: absentKey }} />
        <ReasonChoices name="reason" legend="Why is the team not on site?" reasons={notOnSiteReasons} required />
      </OperationsForm>
    </details>}
    {card.teamAbsence && <details className={styles.disclosure}>
      <summary>Recorded by mistake?</summary>
      <OperationsForm freezeOnFailure action={actions.undoNotOnSite} submitLabel="Remove not on site">
        <Hidden values={{ contract_id: context.contractId, record_id: card.teamAbsence.id }} />
        <label className={styles.field}>Why remove it? *<input name="reason_other" required minLength={5} maxLength={2000} placeholder="Recorded against the wrong team" /></label>
      </OperationsForm>
    </details>}
  </div>;
}

export function PeriodView({ period, context, card }: { period: Period; context: DayContext; card?: TeamCard }) {
  const { allocation } = period;
  const recordedBy = context.names.get(allocation.confirmed_by);
  const presentPeople = period.people.filter(person => person.left_at === null);
  const presentNow = presentPeople.map(person => person.operative_id);
  const everyone = usable(context.operatives);
  const expectedAway = card ? everyone.filter(person => card.expected.includes(person.id) && !presentNow.includes(person.id)) : [];
  const others = everyone.filter(person => !presentNow.includes(person.id) && !expectedAway.includes(person));
  const presentOperatives = everyone.filter(person => presentNow.includes(person.id));
  const base = { contract_id: context.contractId, allocation_id: allocation.id, day: context.day };
  const moveKey = context.newKey();
  const actions = context.actions;
  const canVoid = allocation.confirmed_by === context.userId || context.isOffice;
  return <section className={`${styles.period}${period.open ? "" : ` ${styles.periodEnded}`}`} aria-label={`${period.location} from ${londonClock(allocation.started_at)}`}>
    <h4>{period.location}</h4>
    <p className={styles.small}><span className={`${styles.badge} ${styles.stageBadge}`}>{installationStageLabels[allocation.stage]}</span>{" "}
      {londonClock(allocation.started_at)} to {allocation.ended_at ? londonClock(allocation.ended_at) : "now"}
      {!card && period.team ? ` · ${period.team.name}` : ""}{` · Acting lead: ${period.lead ?? "not recorded"}`}</p>
    <p className={styles.small}>Recorded{recordedBy ? ` by ${recordedBy}` : ""} at {londonClock(allocation.recorded_at)}
      {allocation.deviations.length > 0 && ` · ${allocation.deviations.map(item => allocationDeviationLabels[item]).join(", ")}`}
      {allocation.deviation_reason && <>: <em>{allocation.deviation_reason}</em></>}</p>
    <ul className={styles.personList} aria-label={`People at ${period.location}`}>
      {period.people.map(person => <li key={person.id}>
        <span><strong>{person.name}</strong>{person.provisional && <> <span className={styles.warningBadge}>Provisional</span></>}</span>
        <span>{londonClock(person.joined_at)}{person.left_at ? ` to ${londonClock(person.left_at)}` : ""}{person.note ? ` · ${person.note}` : ""}{person.departure_note ? ` · ${person.departure_note}` : ""}</span>
      </li>)}
    </ul>
    {period.open && actions && <div className={styles.rowActions}>
      <details className={styles.disclosure}>
        <summary aria-label={`Move or split from ${period.location}`}>Move or split</summary>
        <OperationsForm freezeOnFailure key={moveKey} action={actions.move} submitLabel="Record move">
          <div className={`${styles.stack} ${styles.splitForm}`}>
            <Hidden values={{ ...base, request_key: moveKey }} />
            <p className={styles.small}>Everyone here moves unless you split them. The time here is kept as it was.</p>
            {presentPeople.map(person => <input key={person.operative_id} type="hidden" name="person" value={person.operative_id} />)}
            <LocationPicker name="work_area_id" label="Moving to *" locations={context.locations} />
            <label className={styles.checkboxRow}><input type="checkbox" name="split" />Split them between two locations</label>
            <div className={styles.splitOnly}>
              <LocationPicker name="work_area_id_b" label="Second location" locations={context.locations} />
              {presentPeople.map(person => <fieldset key={person.operative_id} className={styles.choices}><legend>Where is {person.name} going?</legend>
                <label><input type="radio" name={`group_${person.operative_id}`} value="a" defaultChecked />First location</label>
                <label><input type="radio" name={`group_${person.operative_id}`} value="b" />Second location</label>
              </fieldset>)}
              <label className={styles.field}>Acting lead at the second location<select name="lead_b" defaultValue="">
                <option value="">No lead recorded</option>{presentOperatives.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
              </select></label>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>Stage<select name="stage" defaultValue={allocation.stage}>
                {installationStages.map(stage => <option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>
              <label className={styles.field}>Acting lead<select name="lead_a" defaultValue={allocation.lead_operative_id ?? ""}>
                <option value="">No lead recorded</option>{presentOperatives.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
              </select></label>
              <TimeField name="at_time" label="When did they move?" />
            </div>
            <ReasonChoices name="reason" legend="Why did they move?" reasons={changeReasons} required />
          </div>
        </OperationsForm>
      </details>
      <details className={styles.disclosure}>
        <summary aria-label={`Someone arrived at ${period.location}`}>Someone arrived</summary>
        <OperationsForm freezeOnFailure action={actions.arrival} submitLabel="Record arrival">
          <Hidden values={base} />
          <PersonSelect name="operative_id" label="Who arrived? *" groups={[["Expected on this team", expectedAway], ["Everyone else", others]]} />
          <TimeField name="at_time" label="Arrived at" />
          <ReasonChoices name="note" legend="Why did they join?" reasons={arrivalNotes} required />
        </OperationsForm>
      </details>
      {presentOperatives.length > 0 && <details className={styles.disclosure}>
        <summary aria-label={`Someone left ${period.location}`}>Someone left</summary>
        <OperationsForm freezeOnFailure action={actions.departure} submitLabel="Record departure">
          <Hidden values={base} />
          <PersonSelect name="operative_id" label="Who left? *" groups={[["Here now", presentOperatives]]} />
          <TimeField name="at_time" label="Left at" />
          <ReasonChoices name="note" legend="Why did they leave? (optional)" reasons={departureNotes} />
        </OperationsForm>
      </details>}
      {!allocation.lead_operative_id && presentOperatives.length > 0 && <details className={styles.disclosure}>
        <summary aria-label={`Acting lead at ${period.location}`}>Acting lead</summary>
        <OperationsForm freezeOnFailure action={actions.setLead} submitLabel="Record acting lead">
          <Hidden values={base} />
          <PersonSelect name="operative_id" label="Who is leading here today? *" groups={[["Here now", presentOperatives]]} />
        </OperationsForm>
      </details>}
      <details className={styles.disclosure}>
        <summary aria-label={`Finish work at ${period.location}`}>Finish here</summary>
        <OperationsForm freezeOnFailure action={actions.finishPeriod} submitLabel="Finish work here">
          <Hidden values={base} />
          <TimeField name="at_time" label="Finished at" />
        </OperationsForm>
      </details>
      {canVoid && <details className={styles.disclosure}>
        <summary aria-label={`Entered in error: ${period.location}`}>Entered in error</summary>
        <OperationsForm freezeOnFailure action={actions.voidPeriod} submitLabel="Mark as entered in error">
          <Hidden values={{ contract_id: context.contractId, record_id: allocation.id }} />
          <p className={styles.small}>Use this only for a record made by mistake. It stays in the history with your reason.</p>
          <label className={styles.field}>What was wrong? *<input name="reason_other" required minLength={5} maxLength={2000} placeholder="Recorded against the wrong team" /></label>
        </OperationsForm>
      </details>}
    </div>}
  </section>;
}
