import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageContracts, canReadFinancial, requireActor } from "@/lib/auth";
import { checkDatabase, contractDetails, teamFor } from "@/lib/operations/data";
import { budgetSummary, contractWarnings } from "@/lib/operations/summary";
import { roleLabels, type Contract } from "@/lib/operations/types";
import { MAX_FILE_BYTES } from "@/lib/operations/validation";
import { assignContractAction, assignPackageAction, createAreaAction, createPackageAction, removeContractAssignmentAction, removePackageAssignmentAction, saveCommercialAction, updateContractAction, uploadDocumentAction } from "@/app/admin/actions";
import { ContractFields } from "@/components/operations/contract-fields";
import { AuditHistory } from "@/components/operations/audit-history";
import { OperationsForm } from "@/components/operations/operations-form";
import { calendarDate, eventDate, money } from "@/components/operations/format";
import styles from "../../admin.module.css";

type ContractAllocation = { user_id: string; valid_from: string; valid_until: string | null };
type PackageAllocation = { user_id: string; work_package_id: string };

function ContractReadout({ contract }: { contract: Contract }) {
  const fields: [string, string | null][] = [
    ["Client", contract.client], ["Principal contractor", contract.principal_contractor],
    ["Site address", contract.address], ["Site contact", contract.site_contact],
    ["Scope", contract.scope], ["Exclusions", contract.exclusions],
    ["Tile specification", contract.tile_specification], ["Substrate details", contract.substrate_details],
    ["Installation system", contract.installation_system], ["Movement joints", contract.movement_joints],
    ["Programme start", calendarDate(contract.start_date)], ["Programme end", calendarDate(contract.end_date)],
    ["Working hours", contract.working_hours], ["Access restrictions", contract.access_restrictions],
    ["Insurance requirements", contract.insurance_requirements], ["Defects liability", contract.defects_liability],
  ];
  return <dl className={styles.detailGrid}>{fields.map(([label, value]) => <div className={styles.detailItem} key={label}><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>)}</dl>;
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { supabase, member } = await requireActor();
  const manage = canManageContracts(member), financial = canReadFinancial(member);
  const data = await contractDetails(supabase, id, financial);
  if (!data) notFound();
  const { contract, areas, packages, documents, audit, commercial } = data;
  const [team, contractAssignmentResult, packageAssignmentResult] = await Promise.all([
    manage ? teamFor(supabase) : Promise.resolve([member]),
    supabase.from("contract_assignments").select("user_id,valid_from,valid_until").eq("contract_id", id),
    supabase.from("package_assignments").select("user_id,work_package_id").eq("contract_id", id),
  ]);
  checkDatabase(contractAssignmentResult.error);
  checkDatabase(packageAssignmentResult.error);
  const contractAssignments = (contractAssignmentResult.data ?? []) as ContractAllocation[];
  const packageAssignments = (packageAssignmentResult.data ?? []) as PackageAllocation[];
  const inspectorCandidates = team.filter(person => person.active && (person.role === "supervisor" || (member.role === "owner" && person.role === "contracts_manager")));
  const installerCandidates = team.filter(person => person.active && ["lead_installer", "subcontract_installer"].includes(person.role));
  const personLabel = (userId: string) => {
    const person = team.find(person => person.user_id === userId);
    return person ? `${person.display_name} (${roleLabels[person.role]})` : userId;
  };
  const areaLabel = (areaId: string | null) => areaId ? areas.find(area => area.id === areaId)?.name ?? "Allocated area" : "Contract documents";
  const warnings = contractWarnings(contract, areas.length, documents.filter(document => document.uploaded_at).length);
  const installer = ["lead_installer", "subcontract_installer"].includes(member.role);
  const summary = commercial ? budgetSummary(commercial) : null;
  return <>
    <div className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>{contract.reference}</p><h1 className={styles.title}>{contract.name}</h1><p className={styles.description}>{contract.client} · {contract.address}</p></div>
      <Link href="/admin/contracts" className={styles.secondaryButton}>Contract register</Link>
    </div>
    <section className={styles.warning} aria-label="Contract release status"><span className={styles.warningBadge}>Draft · unreleased</span><h2>Installation is not authorised</h2><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul><p className={styles.small}>No inspection, approval or signature has been recorded by this setup workflow. Quality gates must be implemented and completed before release.</p></section>

    <section className={styles.panel}><h2>Contract information</h2><ContractReadout contract={contract} />
      {manage && <details className={styles.details}><summary>Edit operational contract details</summary><OperationsForm key={`contract-${contract.version}`} action={updateContractAction} submitLabel="Save contract details"><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="version" value={contract.version} /><input type="hidden" name="request_key" value={randomUUID()} /><ContractFields contract={contract} /></OperationsForm></details>}
    </section>

    {financial && <section className={styles.panel}><h2>Original commercial budget</h2>
      {summary ? <div className={styles.metrics}>
        <div className={styles.metric}><span className={styles.metricLabel}>Contract value</span><strong className={styles.metricValue}>{money(summary.value)}</strong></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Budgeted costs</span><strong className={styles.metricValue}>{money(summary.originalCost)}</strong></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Contingency reserve</span><strong className={styles.metricValue}>{money(summary.reserve)}</strong></div>
        <div className={styles.metric}><span className={styles.metricLabel}>Margin after reserve</span><strong className={styles.metricValue}>{summary.margin === null ? "Not calculable" : `${summary.margin.toFixed(1)}%`}</strong></div>
      </div> : <p className={styles.muted}>No original budget has been recorded.</p>}
      {summary?.margin !== null && summary?.margin !== undefined && commercial && summary.margin < Number(commercial.target_margin) && <p className={styles.warning}><strong>Below target margin.</strong> The budget margin is {summary.margin.toFixed(1)}% against a target of {Number(commercial.target_margin).toFixed(1)}%. Explicit owner approval with a recorded reason is required before commercial acceptance.</p>}
      <p className={styles.small}>These are budget amounts. Actual expenditure, approved variations, programme costs, payment notices and cash forecasts are not yet recorded. Contingency is a reserve.</p>
      <details className={styles.details}><summary>{commercial ? "Edit original budget and payment terms" : "Record original budget and payment terms"}</summary>
        <OperationsForm key={`commercial-${commercial?.version ?? 0}`} action={saveCommercialAction} submitLabel="Save original budget">
          <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="version" value={commercial?.version ?? 0} /><input type="hidden" name="request_key" value={randomUUID()} />
          <div className={styles.formGrid}>
            {([
              ["contract_value", "Contract value (£)"], ["labour_budget", "Original labour budget (£)"],
              ["materials_budget", "Original materials budget (£)"], ["preliminaries_budget", "Original preliminaries budget (£)"],
              ["contingency", "Contingency reserve (£)"], ["target_margin", "Target margin (%)"], ["retention_percent", "Contractual retention (%)"],
            ] as const).filter(([name]) => name !== "target_margin" || member.role === "owner").map(([name, label]) => <label className={styles.field} key={name}>{label}<input type="number" name={name} defaultValue={commercial?.[name] ?? (name === "target_margin" ? 30 : 0)} required min="0" max={name === "target_margin" ? "99" : name === "retention_percent" ? "100" : "1000000000"} step="0.01" inputMode="decimal" /></label>)}
            {member.role !== "owner" && <p className={styles.small}>Target margin is owner-controlled. {commercial ? `The recorded target is ${Number(commercial.target_margin).toFixed(1)}%.` : "The company target will be applied when this budget is saved."}</p>}
            <label className={`${styles.field} ${styles.wide}`}>Payment terms<textarea name="payment_terms" defaultValue={commercial?.payment_terms ?? ""} rows={4} maxLength={4000} /></label>
          </div>
        </OperationsForm>
      </details>
    </section>}

    <section className={styles.panel}><h2>Work areas and packages</h2><p className={styles.muted}>Each area requires its own accepted specification and quality gates. An allocation is access permission, not installation release.</p>
      <div className={styles.stack}>{areas.map(area => <article key={area.id} className={styles.contractCard}>
        <div className={styles.cardTop}><h3>{area.name}</h3><span className={styles.warningBadge}>Specification unapproved</span></div>
        <p>{area.location}</p>
        <dl className={styles.detailGrid}><div className={styles.detailItem}><dt>Substrate notes</dt><dd>{area.substrate_notes || "Not recorded"}</dd></div><div className={styles.detailItem}><dt>System notes</dt><dd>{area.system_notes || "Not recorded"}</dd></div></dl>
        {packages.filter(pack => pack.work_area_id === area.id).map(pack => <div key={pack.id} className={styles.documentRow}><div><strong>{pack.name}</strong><p>{Number(pack.quantity).toLocaleString("en-GB")} {pack.unit === "m2" ? "m²" : pack.unit === "lm" ? "linear metres" : "items"}</p>
          {packageAssignments.filter(assignment => assignment.work_package_id === pack.id).length === 0 && <p className={styles.small}>No installer allocated.</p>}
          {packageAssignments.filter(assignment => assignment.work_package_id === pack.id).map(assignment => <div key={assignment.user_id} className={styles.inline}><span className={styles.small}>Allocated: {personLabel(assignment.user_id)}</span>{manage && <OperationsForm compact action={removePackageAssignmentAction} submitLabel="Remove package allocation"><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="package_id" value={pack.id} /><input type="hidden" name="user_id" value={assignment.user_id} /></OperationsForm>}</div>)}
        </div></div>)}
        {packages.every(pack => pack.work_area_id !== area.id) && <p className={styles.small}>No accessible work packages recorded for this area.</p>}
      </article>)}</div>
      {areas.length === 0 && <p className={styles.empty}>No work areas available. {manage ? "Record a work area before creating packages." : "Ask your contracts manager to allocate the relevant work package."}</p>}
      {manage && <>
        <details className={styles.details}><summary>Add a work area</summary><OperationsForm action={createAreaAction} submitLabel="Create unreleased area"><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} /><div className={styles.formGrid}>
          <label className={styles.field}>Area name *<input name="name" required maxLength={160} /></label><label className={styles.field}>Location *<input name="location" required maxLength={500} /></label>
          <label className={`${styles.field} ${styles.wide}`}>Substrate notes<textarea name="substrate_notes" rows={3} maxLength={4000} /></label><label className={`${styles.field} ${styles.wide}`}>Installation system notes<textarea name="system_notes" rows={3} maxLength={4000} /></label>
        </div></OperationsForm></details>
        {areas.length > 0 && <details className={styles.details}><summary>Add a work package</summary><OperationsForm action={createPackageAction} submitLabel="Create work package"><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} /><div className={styles.formGrid}>
          <label className={styles.field}>Work area *<select name="area_id" required>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <label className={styles.field}>Package name *<input name="name" required maxLength={160} /></label>
          <label className={styles.field}>Quantity *<input name="quantity" type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" required /></label>
          <label className={styles.field}>Unit *<select name="unit" defaultValue="m2"><option value="m2">Square metres (m²)</option><option value="lm">Linear metres</option><option value="item">Items</option></select></label>
        </div></OperationsForm></details>}
      </>}
    </section>

    <section className={styles.panel}><h2>{manage ? "Staff allocations" : "Your allocation"}</h2>
      {contractAssignments.length > 0 && <div className={styles.stack}>{contractAssignments.map(assignment => {
        const target = team.find(person => person.user_id === assignment.user_id);
        const canRemove = manage && (member.role === "owner" || target?.role === "supervisor");
        return <div className={styles.inline} key={assignment.user_id}><span>{personLabel(assignment.user_id)} · from {calendarDate(assignment.valid_from)}{assignment.valid_until ? ` until ${calendarDate(assignment.valid_until)}` : " · no expiry recorded"}</span>{canRemove && <OperationsForm compact action={removeContractAssignmentAction} submitLabel="Remove contract allocation"><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="user_id" value={assignment.user_id} /></OperationsForm>}</div>;
      })}</div>}
      {contractAssignments.length === 0 && !installer && <p className={styles.muted}>No accessible manager or supervisor allocation is recorded.</p>}
      {installer && <p className={styles.muted}>Your allocated packages are listed with their work areas above. Other contractors&apos; packages and commercial records are restricted.</p>}
      {manage && <>
        <details className={styles.details}><summary>Allocate {member.role === "owner" ? "manager or supervisor" : "supervisor"}</summary>
          {inspectorCandidates.length > 0 ? <OperationsForm action={assignContractAction} submitLabel="Save contract allocation"><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} /><div className={styles.formGrid}><label className={styles.field}>Person *<select name="user_id" required>{inspectorCandidates.map(person => <option key={person.user_id} value={person.user_id}>{person.display_name} · {roleLabels[person.role]}</option>)}</select></label><label className={styles.field}>Access expiry (optional)<input type="date" name="valid_until" /></label></div></OperationsForm> : <p className={styles.muted}>No eligible active staff. The owner can add existing Auth users from Team access.</p>}
        </details>
        <details className={styles.details}><summary>Allocate installer to package</summary>
          {installerCandidates.length > 0 && packages.length > 0 ? <OperationsForm action={assignPackageAction} submitLabel="Save package allocation"><input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} /><div className={styles.formGrid}><label className={styles.field}>Installer *<select name="user_id" required>{installerCandidates.map(person => <option key={person.user_id} value={person.user_id}>{person.display_name} · {roleLabels[person.role]}</option>)}</select></label><label className={styles.field}>Work package *<select name="package_id" required>{packages.map(pack => <option key={pack.id} value={pack.id}>{areaLabel(pack.work_area_id)} · {pack.name}</option>)}</select></label></div></OperationsForm> : <p className={styles.muted}>Create a work package and add an active lead installer or subcontract installer first.</p>}
        </details>
      </>}
    </section>

    <section className={styles.panel}><h2>Private documents and evidence</h2><p className={styles.muted}>Revisions are immutable. Files remain private and are opened through an authenticated download. Evidence uploads do not create an approval.</p>
      <div className={styles.documentList}>{documents.map(document => <article className={styles.documentRow} key={document.id}>
        <div><strong>{document.title}</strong><p>{document.document_reference} · revision {document.revision} · {areaLabel(document.work_area_id)}</p><p className={styles.small}>{document.classification === "commercial" ? "Commercial" : "Operational"} · {(document.bytes / 1024 / 1024).toFixed(2)} MB · {eventDate(document.created_at)}</p>
          {!document.uploaded_at && (document.created_by === member.user_id ? <details className={styles.details}><summary>Retry this pending upload</summary>
            <OperationsForm action={uploadDocumentAction} submitLabel="Retry original file upload">
              <input type="hidden" name="request_key" value={document.id} /><input type="hidden" name="contract_id" value={id} />
              <input type="hidden" name="area_id" value={document.work_area_id ?? ""} /><input type="hidden" name="classification" value={document.classification} />
              <input type="hidden" name="document_reference" value={document.document_reference} /><input type="hidden" name="revision" value={document.revision} /><input type="hidden" name="title" value={document.title} />
              <label className={styles.field}>Reselect the original PDF, JPEG or PNG file *<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required /><span className={styles.small}>The content must match the original upload exactly. Maximum {MAX_FILE_BYTES / 1024 / 1024} MB.</span></label>
            </OperationsForm>
          </details> : <p className={styles.small}>The original uploader must retry this pending file. It is not available for download.</p>)}
        </div>
        {document.uploaded_at ? <a className={styles.secondaryButton} href={`/admin/documents/${document.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${document.title}, revision ${document.revision} in a new tab`}>Open file</a> : <span className={styles.warningBadge}>Upload pending</span>}
      </article>)}</div>
      {documents.length === 0 && <p className={styles.empty}>No accessible document revisions have been recorded.</p>}
      {installer && areas.length === 0 ? <p className={styles.warning}>Evidence upload requires an allocated work area. Ask your manager to allocate a work package first.</p> : <details className={styles.details}><summary>Upload a document revision or photo</summary><OperationsForm action={uploadDocumentAction} submitLabel="Upload private revision">
        <input type="hidden" name="contract_id" value={id} /><input type="hidden" name="request_key" value={randomUUID()} />
        <div className={styles.formGrid}>
          <label className={styles.field}>Document reference *<input name="document_reference" maxLength={80} required /></label>
          <label className={styles.field}>Revision number *<input name="revision" type="number" min="1" max="100000" step="1" defaultValue="1" required inputMode="numeric" /></label>
          <label className={styles.field}>Title *<input name="title" maxLength={160} required /></label>
          <label className={styles.field}>Work area{installer ? " *" : ""}<select name="area_id" required={installer}>{!installer && <option value="">Contract documents</option>}{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <label className={styles.field}>Classification<select name="classification" defaultValue="operational"><option value="operational">Operational</option>{financial && <option value="commercial">Commercial — restricted</option>}</select></label>
          <label className={styles.field}>PDF, JPEG or PNG file *<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required /><span className={styles.small}>Maximum {MAX_FILE_BYTES / 1024 / 1024} MB. Use your phone camera or select a file.</span></label>
        </div><p className={styles.small}>If connectivity fails, retry the same form and file. A pending record does not confirm the file is available.</p>
      </OperationsForm></details>}
    </section>

    {!["lead_installer", "subcontract_installer"].includes(member.role) && <section className={styles.panel}><h2>Audit history</h2><p className={styles.muted}>Latest 50 authorised events. Actor identifiers and timestamps come from the server record.</p>
      <AuditHistory events={audit} />
    </section>}
  </>;
}
