import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageContracts, requireActor } from "@/lib/auth";
import { createContractAction } from "@/app/admin/actions";
import { ContractFields } from "@/components/operations/contract-fields";
import { OperationsForm } from "@/components/operations/operations-form";
import styles from "../../admin.module.css";

export default async function NewContractPage() {
  const { member } = await requireActor();
  if (!canManageContracts(member)) redirect("/admin?error=permission");
  return (
    <>
      <div className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>Contract mobilisation</p><h1 className={styles.title}>Create a contract</h1><p className={styles.description}>Record the agreed project information. Fields marked * are required.</p></div>
        <Link className={styles.secondaryButton} href="/admin/contracts">Back to contracts</Link>
      </div>
      <div className={styles.warning}>New contracts remain draft and unreleased. Creating a record does not authorise mobilisation or installation.</div>
      <section className={styles.panel} aria-label="New contract details">
        <OperationsForm action={createContractAction} submitLabel="Create draft contract">
          <input type="hidden" name="request_key" value={randomUUID()} />
          <ContractFields />
        </OperationsForm>
      </section>
      <p className={styles.muted}>Authorised commercial users can add the budget and payment terms after creating the contract. Upload drawings and specification revisions from the contract page.</p>
    </>
  );
}
