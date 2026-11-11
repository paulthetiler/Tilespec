import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireFinancialActor } from "@/lib/auth";
import { checkDatabase } from "@/lib/operations/data";
import { DailyForm } from "@/components/site/daily-form";
import { createGangAction } from "@/app/admin/command-centre-actions";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

/**
 * Add or onboard a gang in one place: choose an existing gang or create it (with its company), then
 * go straight to its onboarding page for tax and CIS, bank details, the agreement, the portal link,
 * jobs and rates.
 */
export default async function NewGangPage() {
  const { supabase } = await requireFinancialActor();
  const [teams, companies] = await Promise.all([
    supabase.from("teams").select("id,name,kind,active").neq("kind", "direct_team").order("name"),
    supabase.from("subcontractor_companies").select("id,name").eq("active", true).order("name"),
  ]);
  [teams, companies].forEach(r => checkDatabase(r.error));
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}><Link href="/admin/subcontractors">Subcontractors</Link></p><h1 className={styles.title}>Add or onboard a gang</h1>
      <p className={styles.description}>Choose a gang you already have, or add a new one. You then complete onboarding on one page: business and tax details, CIS, bank details, the agreement, the portal link, jobs and rates.</p></div></div>
    {(teams.data ?? []).length > 0 && <section className={styles.panel} aria-labelledby="existing-gang"><h2 id="existing-gang">An existing gang</h2>
      <ul className={styles.plainList}>{(teams.data ?? []).map(t => <li key={t.id}><Link href={`/admin/subcontractors/${t.id}`}>{t.name}</Link>{t.active ? "" : " (inactive)"}</li>)}</ul>
    </section>}
    <section className={styles.panel} aria-labelledby="new-gang"><h2 id="new-gang">A new gang or subcontractor</h2>
      <DailyForm action={createGangAction} label="Add and start onboarding">
        <input type="hidden" name="request_key" value={randomUUID()} /><input type="hidden" name="company_request_key" value={randomUUID()} />
        <div className={styles.formGrid}>
          <label className={styles.field}>Gang name<input name="name" required maxLength={160} placeholder="For example, Smith tiling gang" /></label>
          <label className={styles.field}>Kind<select name="kind" defaultValue="subcontract_gang"><option value="subcontract_gang">Subcontract gang</option><option value="individual_subcontractor">Individual subcontractor</option></select></label>
          <label className={styles.field}>Their company<select name="company_id" defaultValue=""><option value="">A new company (name below) or none</option>
            {(companies.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className={styles.field}>New company name<input name="company_name" maxLength={160} /></label>
          <label className={styles.field}>Contact name<input name="contact_name" maxLength={160} /></label>
          <label className={styles.field}>Contact phone<input name="contact_phone" type="tel" maxLength={40} /></label>
          <label className={styles.field}>Contact email<input name="contact_email" type="email" maxLength={254} /></label>
        </div>
        <p className={styles.small}>Insurance for the company is recorded in Workforce; the command centre warns you before it expires.</p>
      </DailyForm>
    </section>
  </>;
}
