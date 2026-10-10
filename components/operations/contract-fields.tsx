import type { Contract } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";

export function ContractFields({ contract }: { contract?: Contract }) {
  const field = (name: keyof Contract, label: string, maxLength: number, required = false, multiline = false) => (
    <label className={multiline ? `${styles.field} ${styles.wide}` : styles.field} key={name}>
      {label}{required ? " *" : ""}
      {multiline
        ? <textarea name={name} defaultValue={String(contract?.[name] ?? "")} required={required} maxLength={maxLength} rows={3} />
        : <input name={name} defaultValue={String(contract?.[name] ?? "")} required={required} maxLength={maxLength} />}
    </label>
  );
  return (
    <div className={styles.formGrid}>
      {field("reference", "Contract reference", 80, true)}
      {field("name", "Project name", 160, true)}
      {field("client", "Client", 160, true)}
      {field("principal_contractor", "Principal contractor", 160)}
      {field("address", "Site address", 1000, true, true)}
      {field("site_contact", "Site contact", 500)}
      {field("working_hours", "Working hours", 500)}
      {field("scope", "Agreed scope", 8000, true, true)}
      {field("exclusions", "Exclusions", 4000, false, true)}
      {field("tile_specification", "Tile type, dimensions and thickness", 4000, false, true)}
      {field("substrate_details", "Substrate details", 4000, false, true)}
      {field("installation_system", "Adhesive, grout and installation system", 4000, false, true)}
      {field("movement_joints", "Movement-joint requirements", 4000, false, true)}
      <label className={styles.field}>Programme start<input type="date" name="start_date" defaultValue={contract?.start_date ?? ""} /></label>
      <label className={styles.field}>Programme end<input type="date" name="end_date" defaultValue={contract?.end_date ?? ""} /></label>
      {field("access_restrictions", "Access restrictions", 2000, false, true)}
      {field("insurance_requirements", "Insurance requirements", 2000, false, true)}
      {field("defects_liability", "Defects liability obligations", 2000, false, true)}
    </div>
  );
}
