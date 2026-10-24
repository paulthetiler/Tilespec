"use client";
import { useState } from "react";
import { LocationPicker } from "@/components/office/location-picker";
import { DailyForm, type DailyActionState } from "./daily-form";
import { installationStageLabels, installationStages, type Location, type WorkPackage } from "@/lib/operations/types";
import styles from "@/app/admin/admin.module.css";

export function OfficeMessageForm({ action, contractId, requestKey, recipients, locations, packages, urgentAvailable = false }: {
  action: (state: DailyActionState, form: FormData) => Promise<DailyActionState>;
  contractId: string; requestKey: string; recipients: { user_id: string; display_name: string }[]; locations: Location[]; packages: WorkPackage[];
  /** Only once instruction changes are installed in the database. */
  urgentAvailable?: boolean;
}) {
  const [kind, setKind] = useState("instruction");
  return <DailyForm action={action} label={kind === "qa_request" ? "Send inspection request" : "Send message"} nextHref={`/admin/supervisor/sites/${contractId}/messages`} nextLabel="View messages or send another">
    <input type="hidden" name="contract_id" value={contractId} /><input type="hidden" name="request_key" value={requestKey} />
    <label className={styles.field}>What are you sending?<select name="kind" value={kind} onChange={event => setKind(event.target.value)}><option value="instruction">Office message</option><option value="qa_request">Inspection request</option></select></label>
    <label className={styles.field}>To<select name="recipient_id" required={kind === "qa_request"}><option value="">Everyone supervising this site</option>{recipients.map(person => <option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}</select></label>
    <label className={styles.field}>Title<input name="title" required maxLength={160} /></label>
    <label className={styles.field}>Instructions<textarea name="body" required maxLength={2000} rows={3} /></label>
    {kind === "instruction" ? <>
      <label className={styles.checkboxRow}><input type="checkbox" name="acknowledgement_required" defaultChecked />Ask the supervisor to acknowledge this</label>
      {urgentAvailable && <label className={styles.checkboxRow}><input type="checkbox" name="urgent" />Urgent: show it at the top of the supervisor’s Today</label>}
    </> : <>
      <LocationPicker name="work_area_id" label="Location to inspect" locations={locations} />
      <label className={styles.field}>Work to inspect<select name="stage" required defaultValue="installation">{installationStages.map(stage => <option key={stage} value={stage}>{installationStageLabels[stage]}</option>)}</select></label>
      {packages.length > 0 && <label className={styles.field}>Work package (optional)<select name="work_package_id"><option value="">All work at this location</option>{packages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </>}
    <label className={styles.field}>Needed by (optional)<input type="date" name="due_on" /></label>
  </DailyForm>;
}
