import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { checkDatabase, teamFor } from "@/lib/operations/data";
import { roles, roleLabels, type AuditEvent, type Member } from "@/lib/operations/types";
import { saveMemberAction } from "@/app/admin/actions";
import { OperationsForm } from "@/components/operations/operations-form";
import { AuditHistory } from "@/components/operations/audit-history";
import styles from "../admin.module.css";

function MemberFields({ member }: { member?: Member }) {
  return <div className={styles.formGrid}>
    <input type="hidden" name="request_key" value={randomUUID()} />
    <label className={styles.field}>Supabase Auth user UUID *<input name="user_id" defaultValue={member?.user_id ?? ""} readOnly={Boolean(member)} required maxLength={36} autoCapitalize="none" spellCheck={false} /></label>
    <label className={styles.field}>Display name *<input name="display_name" defaultValue={member?.display_name ?? ""} required maxLength={160} /></label>
    <label className={styles.field}>Role *<select name="role" defaultValue={member?.role ?? "subcontract_installer"}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
    <div className={styles.field}>
      <label className={styles.checkboxRow}><input type="checkbox" name="active" defaultChecked={member?.active ?? true} />Active membership</label>
      <label className={styles.checkboxRow}><input type="checkbox" name="financial_access" defaultChecked={member?.financial_access ?? false} />Authorise contracts manager commercial access</label>
    </div>
  </div>;
}

export default async function TeamPage() {
  const { supabase, member } = await requireActor();
  if (member.role !== "owner") redirect("/admin?error=permission");
  const [team, auditResult] = await Promise.all([
    teamFor(supabase),
    supabase.from("audit_events").select("*").is("contract_id", null).order("created_at", { ascending: false }).limit(50),
  ]);
  checkDatabase(auditResult.error);
  return <>
    <div className={styles.pageHeader}><div><p className={styles.eyebrow}>People and permissions</p><h1 className={styles.title}>Team access</h1><p className={styles.description}>Only the owner can manage roles and commercial permissions.</p></div></div>
    <div className={styles.warning}>Create or invite the person in the dedicated TileSPEC Supabase Auth dashboard first. Then add their user UUID here. Membership alone does not allocate a contract or package.</div>
    <section className={styles.panel}><h2>Add existing Auth user</h2><OperationsForm action={saveMemberAction} submitLabel="Add membership"><MemberFields /></OperationsForm><p className={styles.small}>Owners have full commercial access. Manager access requires an explicit grant. Supervisors and installers cannot receive commercial access.</p></section>
    <section className={styles.panel}>
      <h2>Organisation members</h2>
      <div className={styles.stack}>{team.map(person => <details key={person.user_id} className={styles.details}>
        <summary><strong>{person.display_name}</strong><span className={styles.meta}>{roleLabels[person.role]} · {person.active ? "Active" : "Inactive"}</span></summary>
        <OperationsForm action={saveMemberAction} submitLabel="Save membership"><MemberFields member={person} /></OperationsForm>
      </details>)}</div>
      {team.length === 0 && <p className={styles.empty}>No membership records available.</p>}
    </section>
    <section className={styles.panel}><h2>Membership audit history</h2><p className={styles.muted}>Latest 50 owner-visible events, including recorded access changes.</p><AuditHistory events={(auditResult.data ?? []) as AuditEvent[]} /></section>
  </>;
}
