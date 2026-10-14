import Link from "next/link";
import styles from "@/app/admin/admin.module.css";

// Three steps get a site ready for supervisors. The first unfinished step is
// highlighted with the one button that matters.
export function SiteSetup({ contractId, locationCount, activeTeamCount, plannedThisWeek }: {
  contractId: string; locationCount: number; activeTeamCount: number; plannedThisWeek: number;
}) {
  const steps = [
    { done: locationCount > 0, title: "Locations", status: locationCount ? `${locationCount.toLocaleString("en-GB")} recorded` : "Add the blocks, floors, flats or rooms you will work in.", href: `/admin/contracts/${contractId}/locations`, action: locationCount ? "Manage locations" : "Set up locations" },
    { done: activeTeamCount > 0, title: "Teams", status: activeTeamCount ? `${activeTeamCount} active ${activeTeamCount === 1 ? "team" : "teams"}` : "Add your gangs and the people in them.", href: "/admin/workforce", action: activeTeamCount ? "Manage workforce" : "Set up teams" },
    { done: plannedThisWeek > 0, title: "Plan", status: plannedThisWeek ? `${plannedThisWeek} planned this week` : "Say which team works where, and when.", href: `/admin/contracts/${contractId}/plan`, action: "Plan work" },
  ];
  const next = steps.findIndex(step => !step.done);
  return (
    <section className={styles.panel} aria-labelledby="site-setup-heading">
      <h2 id="site-setup-heading">Site setup</h2>
      <ol className={styles.steps}>{steps.map((step, index) => <li key={step.title} className={`${styles.step} ${step.done ? styles.stepDone : index === next ? styles.stepNext : ""}`}>
        <div><span className={styles.stepTitle}>{index + 1}. {step.title}{step.done ? " ✓" : ""}</span><p>{step.status}</p></div>
        <Link className={index === next ? styles.button : styles.secondaryButton} href={step.href}>{step.action}</Link>
      </li>)}</ol>
      {next === -1 && <p className={styles.small}>This site is ready. Supervisors confirm who actually attends on site each day.</p>}
    </section>
  );
}
