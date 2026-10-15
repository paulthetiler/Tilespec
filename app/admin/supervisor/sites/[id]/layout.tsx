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
    <SiteNav base={`/admin/supervisor/sites/${id}`} contractId={id} siteName={contract.name} reference={contract.reference} />
    {children}
  </>;
}
