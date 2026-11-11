import styles from "@/app/admin/admin.module.css";

type Customer = { name?: string; kind?: string; contact_name?: string | null; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null };
/** The customer's details, shared by the add and edit forms. */
export function CustomerFields({ customer = {} }: { customer?: Customer }) {
  return <>
    <div className={styles.formGrid}>
      <label className={styles.field}>Name<input name="name" required maxLength={160} defaultValue={customer.name ?? ""} /></label>
      <label className={styles.field}>Kind<select name="kind" defaultValue={customer.kind ?? "client"}>
        <option value="client">Client</option><option value="main_contractor">Main contractor</option><option value="developer">Developer</option>
        <option value="consultant">Consultant</option><option value="other">Other</option></select></label>
      <label className={styles.field}>Contact name<input name="contact_name" maxLength={160} defaultValue={customer.contact_name ?? ""} /></label>
      <label className={styles.field}>Email<input name="email" type="email" maxLength={254} defaultValue={customer.email ?? ""} /></label>
      <label className={styles.field}>Phone<input name="phone" type="tel" maxLength={40} defaultValue={customer.phone ?? ""} /></label>
    </div>
    <label className={styles.field}>Address<textarea name="address" maxLength={500} rows={2} defaultValue={customer.address ?? ""} /></label>
    <label className={styles.field}>Notes<textarea name="notes" maxLength={2000} rows={2} defaultValue={customer.notes ?? ""} /></label>
  </>;
}
