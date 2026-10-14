import { ConnectionStatus } from "@/components/site/connection-status";
import { SiteNav } from "@/components/site/site-nav";
import { requireSite } from "../../site-access";
import styles from "../../../admin.module.css";

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { contract } = await requireSite(id);
  if (!contract) return <p className={styles.empty}>Site screens are for supervisors and the office. Your allocated work is on the contract page.</p>;
  return <>
    <ConnectionStatus />
    <div className={styles.siteHeader}>
      <p className={styles.eyebrow}>{contract.reference}</p>
      <h1 className={styles.title}>{contract.name}</h1>
      {contract.address && <p>{contract.address}</p>}
    </div>
    <SiteNav base={`/admin/supervisor/sites/${id}`} contractId={id} />
    {children}
  </>;
}
