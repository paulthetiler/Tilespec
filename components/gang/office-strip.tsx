import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { officeGangSummary } from "@/lib/operations/gang-data";
import { londonDate } from "@/lib/operations/planning";
import css from "./gang.module.css";

/** The office's handovers in one line: shown only when a gang invoice is waiting on the office. */
export async function GangOfficeStrip({ supabase }: { supabase: SupabaseClient }) {
  const summary = await officeGangSummary(supabase, londonDate());
  if (!summary) return null;
  const parts = [
    summary.readyToApprove && `${summary.readyToApprove} ready to approve`,
    summary.needsSupervisor && `${summary.needsSupervisor} ${summary.needsSupervisor === 1 ? "needs" : "need"} a supervisor`,
    summary.dueThisWeek && `${summary.dueThisWeek} to pay within a week`,
  ].filter(Boolean);
  const count = summary.readyToApprove + summary.needsSupervisor;
  if (!parts.length) return null;
  return <Link className={css.verifyStrip} href="/admin/gang-invoices">
    <span>Gang invoices{count > 0 && <span className={css.count}>{count}</span>}<small>{parts.join(" · ")}</small></span>
    <span aria-hidden="true">›</span>
  </Link>;
}
