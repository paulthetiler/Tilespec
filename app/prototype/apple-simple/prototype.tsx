"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleEllipsis,
  ClipboardCheck,
  Clock3,
  FileText,
  HardHat,
  Home,
  MapPin,
  MessageSquareText,
  PoundSterling,
  ShieldAlert,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import styles from "./prototype.module.css";

type Role = "owner" | "office" | "supervisor" | "subcontractor";
type Tone = "neutral" | "warning" | "danger" | "success";
type Icon = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

type NavItem = { id: string; label: string; icon: Icon };
type RoleConfig = {
  name: string;
  user: string;
  strapline: string;
  nav: NavItem[];
  next: {
    eyebrow: string;
    title: string;
    detail: string;
    meta: string;
    action: string;
    tone: Tone;
  };
};

const roles: Record<Role, RoleConfig> = {
  owner: {
    name: "Owner",
    user: "Paul",
    strapline: "Decisions, profit and exceptions",
    nav: [
      { id: "today", label: "Today", icon: Home },
      { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
      { id: "money", label: "Money", icon: PoundSterling },
      { id: "more", label: "More", icon: CircleEllipsis },
    ],
    next: {
      eyebrow: "Exception to review",
      title: "Review the Oak Court margin",
      detail: "The recorded original budget is below the company’s 30% target.",
      meta: "Oak Court · 27.8% recorded margin · Owner only",
      action: "Open budget",
      tone: "warning",
    },
  },
  office: {
    name: "Office",
    user: "Sarah",
    strapline: "Set up work and keep it moving",
    nav: [
      { id: "today", label: "Today", icon: Home },
      { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
      { id: "schedule", label: "Schedule", icon: CalendarDays },
      { id: "more", label: "More", icon: CircleEllipsis },
    ],
    next: {
      eyebrow: "Your next action",
      title: "Add the latest waterproofing drawing",
      detail: "The supervisor needs the office-identified current drawing before tomorrow’s inspection.",
      meta: "Riverside Hotel · Level 2 bathrooms · Due 3:00 pm",
      action: "Add drawing",
      tone: "danger",
    },
  },
  supervisor: {
    name: "Supervisor",
    user: "Dave",
    strapline: "Today’s site, team and quality",
    nav: [
      { id: "today", label: "Today", icon: Home },
      { id: "team", label: "Team", icon: Users },
      { id: "quality", label: "Quality", icon: ClipboardCheck },
      { id: "more", label: "More", icon: CircleEllipsis },
    ],
    next: {
      eyebrow: "Do this next",
      title: "Complete the morning checks",
      detail: "Confirm the site is ready before the team starts. A hold on Level 3 remains in force.",
      meta: "Riverside Hotel · 11 checks · About 2 minutes",
      action: "Start checks",
      tone: "warning",
    },
  },
  subcontractor: {
    name: "Subcontractor",
    user: "Lee",
    strapline: "Your work, instructions and updates",
    nav: [
      { id: "today", label: "Today", icon: Home },
      { id: "work", label: "Work", icon: HardHat },
      { id: "updates", label: "Updates", icon: MessageSquareText },
      { id: "more", label: "More", icon: CircleEllipsis },
    ],
    next: {
      eyebrow: "Before you start",
      title: "Read today’s installation note",
      detail: "Use the revised setting-out drawing for the east wall. Acknowledgement is required.",
      meta: "Riverside Hotel · Level 2 · From Sarah, 7:42 am",
      action: "Read instruction",
      tone: "warning",
    },
  },
};

const statusClass: Record<Tone, string> = {
  neutral: styles.neutral,
  warning: styles.warning,
  danger: styles.danger,
  success: styles.success,
};

function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`${styles.status} ${statusClass[tone]}`}>{children}</span>;
}

function OwnerScreen({ screen }: { screen: string }) {
  if (screen === "jobs") return <ListScreen title="Jobs" intro="Only jobs needing attention rise to the top." rows={[
    ["Riverside Hotel", "Labour plan awaiting your decision", "Needs you", "warning"],
    ["Harbour Offices", "On track · next review Friday", "On track", "success"],
    ["Oak Court", "Two quality issues being corrected", "Watch", "danger"],
  ]} />;
  if (screen === "money") return <MoneyScreen />;
  if (screen === "more") return <MoreScreen items={["People and access", "Tenders", "Company settings", "Audit history"]} />;
  return <OwnerToday />;
}

function OwnerToday() {
  return (
    <>
      <MetricStrip items={[["3", "decisions"], ["1", "job at risk"], ["32.4%", "planned margin"]]} />
      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>Exceptions only</p><h2>What needs your attention</h2></div><button className={styles.textButton}>See all <ChevronRight size={18} /></button></div>
        <div className={styles.list}>
          <ActionRow icon={ShieldAlert} title="Level 3 remains stopped" detail="Riverside Hotel · Waterproofing" status="Mandatory hold" tone="danger" />
          <ActionRow icon={PoundSterling} title="Oak Court margin is below target" detail="27.8% after updated labour allowance" status="Decision" tone="warning" />
          <ActionRow icon={CheckCircle2} title="Harbour Offices is on track" detail="No owner action needed" status="Good" tone="success" />
        </div>
      </section>
    </>
  );
}

function MoneyScreen() {
  return (
    <>
      <MetricStrip items={[["£1.24m", "recorded value"], ["£402k", "budgeted profit"], ["1", "margin exception"]]} />
      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>Commercial view</p><h2>Jobs by attention</h2></div></div>
        <div className={styles.list}>
          <ActionRow icon={AlertTriangle} title="Oak Court" detail="27.8% margin · below 30% target" status="Review" tone="warning" />
          <ActionRow icon={WalletCards} title="Riverside Hotel" detail="34.1% budgeted margin" status="On target" tone="success" />
          <ActionRow icon={WalletCards} title="Harbour Offices" detail="31.6% budgeted margin" status="On target" tone="success" />
        </div>
        <p className={styles.honesty}>Prototype note: these are original contract budgets. Actual costs, variations and payment claims are not implemented in the current backend.</p>
      </section>
    </>
  );
}

function OfficeScreen({ screen }: { screen: string }) {
  if (screen === "jobs") return <ListScreen title="Jobs" intro="Setup gaps and blocked handoffs are shown before routine records." rows={[
    ["Riverside Hotel", "Current drawing needed for tomorrow", "Blocked", "danger"],
    ["Oak Court", "Assign a supervisor before Monday", "Needs setup", "warning"],
    ["Harbour Offices", "No action due today", "Ready", "success"],
  ]} />;
  if (screen === "schedule") return <ScheduleScreen />;
  if (screen === "more") return <MoreScreen items={["Tenders", "Documents", "People and access", "Quality control", "Estimator"]} />;
  return <OfficeToday />;
}

function OfficeToday() {
  return (
    <>
      <MetricStrip items={[["5", "actions today"], ["2", "waiting on site"], ["1", "blocked handoff"]]} />
      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>In priority order</p><h2>Today’s work</h2></div><button className={styles.textButton}>All actions <ChevronRight size={18} /></button></div>
        <div className={styles.list}>
          <ActionRow icon={FileText} title="Add revised waterproofing drawing" detail="Riverside Hotel · You · due 3:00 pm" status="Blocks site" tone="danger" />
          <ActionRow icon={Users} title="Assign Monday’s team" detail="Oak Court · You · due today" status="Required" tone="warning" />
          <ActionRow icon={MessageSquareText} title="Review Dave’s handover" detail="Riverside Hotel · received 4:52 pm yesterday" status="Reminder" tone="neutral" />
        </div>
      </section>
    </>
  );
}

function ScheduleScreen() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><p className={styles.kicker}>Monday 19 October</p><h2>Labour schedule</h2><p>Plan from the same teams, people and locations already saved.</p></div><button className={styles.smallPrimary}>Plan work</button></div>
      <div className={styles.schedule}>
        <div><strong>Riverside Hotel</strong><span>Level 2 · Installation</span><span>Northwest Tiling · 4 people</span><Status tone="success">Ready</Status></div>
        <div><strong>Oak Court</strong><span>Ground floor · Preparation</span><span>No team assigned</span><Status tone="warning">Assign team</Status></div>
        <div><strong>Harbour Offices</strong><span>Reception · Grouting</span><span>J. Smith · 2 people</span><Status tone="success">Ready</Status></div>
      </div>
    </section>
  );
}

function SupervisorScreen({ screen }: { screen: string }) {
  if (screen === "team") return <TeamScreen />;
  if (screen === "quality") return <QualityScreen />;
  if (screen === "more") return <MoreScreen items={["Messages from office", "Stop work", "Snags", "Site history", "Finish today"]} />;
  return <SupervisorToday />;
}

function SupervisorToday() {
  return (
    <>
      <div className={styles.siteCard}><MapPin size={20} /><div><strong>Riverside Hotel</strong><span>14 River Street, Manchester M3 4AB</span></div><button aria-label="Open directions">Directions</button></div>
      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>Today’s site</p><h2>After morning checks</h2></div></div>
        <div className={styles.taskGrid}>
          <TaskTile icon={Users} title="Confirm team" detail="4 people planned" status="Not started" />
          <TaskTile icon={ClipboardCheck} title="Inspect work" detail="2 checks due" status="Required" />
          <TaskTile icon={Camera} title="Add progress" detail="Photos and notes" status="Optional" />
          <TaskTile icon={AlertTriangle} title="Report a problem" detail="Snag or stop work" status="Any time" />
        </div>
      </section>
      <button className={styles.finishButton}>Finish today <ArrowRight size={20} /></button>
    </>
  );
}

function TeamScreen() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><p className={styles.kicker}>4 planned today</p><h2>Who is on site?</h2><p>Confirm the saved plan. Only record differences.</p></div></div>
      <div className={styles.peopleList}>
        {["Lee Carter · Lead", "Marek Nowak", "Jamie Hall", "Chris Owen"].map((person, index) => (
          <label key={person}><span className={styles.avatar}>{person.slice(0, 1)}</span><strong>{person}</strong><input type="checkbox" defaultChecked={index < 3} /><span className={styles.checkmark}><Check size={18} /></span></label>
        ))}
      </div>
      <button className={styles.fullPrimary}>Save who is here</button>
      <p className={styles.savedHint}><Check size={15} /> Last saved yesterday at 7:19 am</p>
    </section>
  );
}

function QualityScreen() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><p className={styles.kicker}>Quality and safety</p><h2>Two checks need attention</h2></div><button className={styles.smallPrimary}>New snag</button></div>
      <div className={styles.list}>
        <ActionRow icon={ShieldAlert} title="Do not start waterproofing" detail="Level 3 bathrooms · held by Sarah · 8:06 am" status="Work stopped" tone="danger" />
        <ActionRow icon={ClipboardCheck} title="Inspect tile installation" detail="Level 2 bathrooms · requested by Sarah" status="Due today" tone="warning" />
        <ActionRow icon={CheckCircle2} title="Substrate check passed" detail="Level 2 bathrooms · saved yesterday" status="Complete" tone="success" />
      </div>
      <p className={styles.honesty}>Completing a checklist does not release a hold. An authorised person must make and record that decision separately.</p>
    </section>
  );
}

function SubcontractorScreen({ screen }: { screen: string }) {
  if (screen === "work") return <SubcontractorWork />;
  if (screen === "updates") return <ListScreen title="Updates" intro="Only messages about your allocated work are shown." rows={[
    ["Revised setting-out drawing", "From Sarah · acknowledgement required", "Unread", "warning"],
    ["Tomorrow’s allocation", "Level 2 bathrooms · 7:30 am", "New", "neutral"],
    ["Progress saved", "3 photos · today at 11:24 am", "Complete", "success"],
  ]} />;
  if (screen === "more") return <MoreScreen items={["Required paperwork", "Your documents", "Report a problem", "Help and sign out"]} />;
  return <SubcontractorToday />;
}

function SubcontractorToday() {
  return (
    <>
      <div className={styles.siteCard}><MapPin size={20} /><div><strong>Riverside Hotel</strong><span>14 River Street, Manchester M3 4AB · arrive 7:30 am</span></div><button aria-label="Open directions">Directions</button></div>
      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>Your allocation</p><h2>Level 2 bathrooms</h2><p>Tile installation · east wall · 42 m²</p></div><Status tone="success">Ready</Status></div>
        <div className={styles.instruction}>
          <FileText size={22} /><div><strong>Today’s instruction</strong><p>Use revised setting-out drawing T-204 Rev 3. Start from the corridor datum.</p><button className={styles.textButton}>Open drawing <ArrowRight size={17} /></button></div>
        </div>
        <button className={styles.fullPrimary}><Camera size={20} /> Add progress update</button>
      </section>
    </>
  );
}

function SubcontractorWork() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><p className={styles.kicker}>Your allocated work only</p><h2>Riverside Hotel</h2></div><Status tone="success">On site</Status></div>
      <div className={styles.detailCard}>
        <Detail label="Location" value="Level 2 · Bathrooms · East wall" />
        <Detail label="Work" value="Tile installation · 42 m²" />
        <Detail label="Team" value="Northwest Tiling · 4 people" />
        <Detail label="Instructions" value="Drawing T-204 Rev 3 · start from corridor datum" />
      </div>
      <div className={styles.buttonPair}><button className={styles.fullPrimary}><Camera size={20} /> Add progress</button><button className={styles.fullSecondary}>Report a problem</button></div>
    </section>
  );
}

function MetricStrip({ items }: { items: [string, string][] }) {
  return <div className={styles.metrics}>{items.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}

function ActionRow({ icon: Icon, title, detail, status, tone }: { icon: Icon; title: string; detail: string; status: string; tone: Tone }) {
  return <button className={styles.actionRow}><span className={styles.rowIcon}><Icon size={21} /></span><span className={styles.rowCopy}><strong>{title}</strong><small>{detail}</small></span><Status tone={tone}>{status}</Status><ChevronRight className={styles.chevron} size={20} /></button>;
}

function TaskTile({ icon: Icon, title, detail, status }: { icon: Icon; title: string; detail: string; status: string }) {
  return <button className={styles.taskTile}><span><Icon size={24} /></span><strong>{title}</strong><small>{detail}</small><em>{status}</em></button>;
}

function ListScreen({ title, intro, rows }: { title: string; intro: string; rows: string[][] }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.kicker}>Sorted by what needs action</p><h2>{title}</h2><p>{intro}</p></div></div><div className={styles.list}>{rows.map(([name, detail, status, tone]) => <ActionRow key={name} icon={BriefcaseBusiness} title={name} detail={detail} status={status} tone={tone as Tone} />)}</div></section>;
}

function MoreScreen({ items }: { items: string[] }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.kicker}>Less-used tools</p><h2>More</h2><p>Administration stays available without competing with today’s work.</p></div></div><div className={styles.moreList}>{items.map(item => <button key={item}><span>{item}</span><ChevronRight size={20} /></button>)}</div></section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ActionDetail({ role, onBack, onComplete }: { role: Role; onBack: () => void; onComplete: () => void }) {
  const config = roles[role];
  const requirements = role === "supervisor"
    ? ["Answer all 11 readiness questions", "Add a note for every blocked answer", "Save the checks with your name and time"]
    : role === "subcontractor"
      ? ["Open drawing T-204 Rev 3", "Read the setting-out instruction", "Confirm you understand before starting"]
      : role === "office"
        ? ["Choose the saved Riverside Hotel job", "Mark it as an operational drawing", "Upload the office-identified current file revision"]
        : ["Open the saved original budget", "Review the recorded cost allowances", "Discuss and update the budget through the existing controlled form"];
  return (
    <section className={styles.detailScreen}>
      <button className={styles.back} onClick={onBack}><ArrowLeft size={20} /> Back</button>
      <div className={styles.detailHero}>
        <Status tone={config.next.tone}>{config.next.eyebrow}</Status>
        <h1>{config.next.title}</h1>
        <p>{config.next.detail}</p>
        <span><MapPin size={16} /> {config.next.meta}</span>
      </div>
      <div className={styles.detailCard}>
        <h2>What is needed</h2>
        <ol>{requirements.map(item => <li key={item}><span><Check size={16} /></span>{item}</li>)}</ol>
      </div>
      <div className={styles.gateNote}><ShieldAlert size={21} /><p><strong>{role === "supervisor" ? "Quality gate" : "Responsibility stays clear"}</strong>{role === "supervisor" ? " Saving these checks records the inspection. It does not release a hold or authorise work." : " This action is recorded against the signed-in person. Required approvals remain separate."}</p></div>
      <button className={styles.fullPrimary} onClick={onComplete}>{role === "owner" ? "Open budget record" : role === "office" ? "Choose drawing" : role === "supervisor" ? "Begin 11 checks" : "Open instruction"} <ArrowRight size={20} /></button>
    </section>
  );
}

export default function AppleSimplePrototype() {
  const [role, setRole] = useState<Role>("supervisor");
  const [screen, setScreen] = useState("today");
  const [detail, setDetail] = useState(false);
  const [completed, setCompleted] = useState(false);
  const config = roles[role];
  const title = useMemo(() => config.nav.find(item => item.id === screen)?.label ?? "Today", [config, screen]);

  function changeRole(next: Role) {
    setRole(next);
    setScreen("today");
    setDetail(false);
    setCompleted(false);
  }

  function changeScreen(next: string) {
    setScreen(next);
    setDetail(false);
    setCompleted(false);
  }

  return (
    <div className={styles.prototype}>
      <div className={styles.prototypeBar}><Sparkles size={15} /><span>Phase 1 prototype · sample data only · no records are changed</span><a href="/admin">Exit prototype</a></div>
      <div className={styles.roleBar}>
        <span>View as</span>
        <div role="group" aria-label="Choose prototype role">
          {(Object.keys(roles) as Role[]).map(key => <button key={key} onClick={() => changeRole(key)} aria-pressed={role === key}>{roles[key].name}</button>)}
        </div>
      </div>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <div className={styles.logo}><img src="/tilespec-logo-animated.svg" alt="TileSPEC" /></div>
          <div className={styles.profile}><span>{config.user.slice(0, 1)}</span><div><strong>{config.user}</strong><small>{config.name}</small></div></div>
          <nav aria-label={`${config.name} prototype navigation`}>
            {config.nav.map(item => <NavButton key={item.id} item={item} active={screen === item.id && !detail} onClick={() => changeScreen(item.id)} />)}
          </nav>
          <p className={styles.sidebarHint}>{config.strapline}</p>
        </aside>
        <main className={styles.main}>
          <header className={styles.mobileHeader}><img src="/tilespec-logo-animated.svg" alt="TileSPEC" /><span>{config.user.slice(0, 1)}</span></header>
          {!detail && <div className={styles.greeting}><div><p>{title === "Today" ? "Thursday, 15 October" : config.name}</p><h1>{title === "Today" ? `Good ${role === "supervisor" || role === "subcontractor" ? "morning" : "afternoon"}, ${config.user}` : title}</h1></div>{screen === "today" && <span className={styles.synced}><Check size={15} /> Up to date</span>}</div>}
          {completed ? <div className={styles.toast} role="status"><CheckCircle2 size={20} /><span><strong>Prototype action complete</strong> The next saved-data action would now move to the top.</span><button onClick={() => setCompleted(false)} aria-label="Dismiss"><X size={18} /></button></div> : null}
          {detail
            ? <ActionDetail role={role} onBack={() => setDetail(false)} onComplete={() => { setCompleted(true); setDetail(false); }} />
            : <>
              {screen === "today" && <button className={`${styles.nextAction} ${statusClass[config.next.tone]}`} onClick={() => setDetail(true)}>
                <span className={styles.nextTop}><span>{config.next.eyebrow}</span><Clock3 size={19} /></span>
                <strong>{config.next.title}</strong>
                <p>{config.next.detail}</p>
                <small>{config.next.meta}</small>
                <span className={styles.nextButton}>{config.next.action} <ArrowRight size={20} /></span>
              </button>}
              {role === "owner" && <OwnerScreen screen={screen} />}
              {role === "office" && <OfficeScreen screen={screen} />}
              {role === "supervisor" && <SupervisorScreen screen={screen} />}
              {role === "subcontractor" && <SubcontractorScreen screen={screen} />}
            </>}
        </main>
      </div>
      <nav className={styles.bottomNav} aria-label={`${config.name} mobile navigation`}>
        {config.nav.map(item => <NavButton key={item.id} item={item} active={screen === item.id && !detail} onClick={() => changeScreen(item.id)} />)}
      </nav>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button onClick={onClick} aria-current={active ? "page" : undefined}><Icon size={22} strokeWidth={active ? 2.4 : 1.8} /><span>{item.label}</span></button>;
}
