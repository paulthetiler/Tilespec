"use client";
// Harness pages rendering the real Phase 2A components with fixture data.
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { WorkforceView } from "@/components/office/workforce-view";
import { LocationBuilder } from "@/components/office/location-builder";
import { LocationEditor, LocationTree } from "@/components/office/location-tree";
import { PlanBoard } from "@/components/office/plan-board";
import { SiteSetup } from "@/components/office/site-setup";
import { OperationsForm } from "@/components/operations/operations-form";
import styles from "@/app/admin/admin.module.css";
import * as fixture from "./fixtures";
import { locationActions, planActions, workforceActions } from "./stub-actions";

// A fixed key keeps server and browser renders identical; the real pages
// generate a fresh key per form on the server only.
const newKey = () => "22222222-2222-4222-8222-222222222222";
function Frame({ children }: { children: React.ReactNode }) {
  // Effects run only after the hydrated tree commits: the harness waits for this.
  useEffect(() => { document.body.dataset.hydrated = "true"; }, []);
  return <div className={styles.admin}><main className={`${styles.shell} ${styles.main}`}>{children}</main></div>;
}
function Workforce() {
  const company = useSearchParams().get("company");
  return <Frame><h1 className={styles.title}>Workforce</h1>
    <WorkforceView companies={fixture.companies} insurances={fixture.insurances} accreditations={fixture.accreditations} teams={fixture.teams} operatives={fixture.operatives} memberships={fixture.memberships} logins={fixture.logins} company={company}
      today={fixture.today} newKey={newKey} actions={workforceActions} basePath="/workforce" />
  </Frame>;
}
export function WorkforcePage() { return <Suspense><Workforce /></Suspense>; }

export function LocationsPage() {
  const flat = fixture.find(["Block B", "Level 5", "Flat 502"]);
  return <Frame><h1 className={styles.title}>Locations</h1>
    <SiteSetup contractId={fixture.contractId} locationCount={fixture.locations.length} activeTeamCount={3} plannedThisWeek={0} />
    <LocationEditor location={flat} locations={fixture.locations} contractId={fixture.contractId} updateAction={locationActions.update} archiveAction={locationActions.archive} closeHref="/locations" />
    <section className={styles.panel}><h2>Add locations</h2>
      <OperationsForm action={locationActions.create} submitLabel="Create locations">
        <input type="hidden" name="contract_id" value={fixture.contractId} />
        <input type="hidden" name="request_key" value="11111111-1111-4111-8111-111111111111" />
        <LocationBuilder locations={fixture.locations.filter(location => !location.archived_at)} />
      </OperationsForm>
    </section>
    <section className={styles.panel}><h2>All locations</h2>
      <LocationTree locations={fixture.locations.filter(location => !location.archived_at)} canEdit editHref={id => `/locations?edit=${id}`} />
    </section>
  </Frame>;
}

export function PlanPage() {
  return <Frame><h1 className={styles.title}>Plan work</h1>
    <PlanBoard contractId={fixture.contractId} weekStart="2026-10-12" today={fixture.today} basePath="/plan" canPlan newKey={newKey}
      locations={fixture.locations} companies={fixture.companies} teams={fixture.teams} operatives={fixture.operatives} memberships={fixture.memberships} packages={fixture.packages}
      plans={fixture.plans} plannedOperatives={fixture.plannedOperatives} actions={planActions} />
  </Frame>;
}
