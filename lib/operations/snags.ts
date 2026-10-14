import { text, uuid, ValidationError } from "./validation";
import { isCalendarDate, londonDate } from "./planning";
import { installationStages } from "./types";
export const defectCategories = ["Excessive lippage", "Incorrect setting out", "Poor alignment", "Hollow or loose tiles", "Damaged or chipped tiles", "Poor cuts", "Incorrect trim installation", "Adhesive contamination", "Grout defects", "Silicone/sealant defects", "Movement-joint defects", "Waterproofing concerns", "Substrate/preparation issues", "Other"] as const;
export const snagStatuses = ["draft", "open", "assigned", "rectification_submitted", "reinspection", "closed", "cancelled"] as const;
export const severityLabels = { minor: "Minor — cosmetic or finishing defect", major: "Major — workmanship requiring rectification", critical: "Critical — serious concern requiring immediate office review" };
export const responsibilityLabels: Record<string,string> = { not_assessed: "Not assessed", proposed: "Proposed", accepted: "Accepted by proposed team", disputed: "Disputed", under_review: "Under office review", confirmed: "Confirmed by office", unable_to_determine: "Unable to determine" };
export const statusLabels: Record<string,string> = { draft: "Draft — not submitted", open: "Open", assigned: "Assigned for rectification", rectification_submitted: "Rectification submitted", reinspection: "Reinspection", closed: "Closed", cancelled: "Entered in error", rectification_reported: "Legacy repair reported", reinspection_required: "Legacy reinspection required" };
export type Snag = {
 id:string; organisation_id:string; contract_id:string; inspection_id:string|null; check_label:string; description:string; state:string; created_at:string;
 snag_status:string|null; version:number|null; work_area_id:string|null; work_package_id:string|null; location_inspection_id:string|null;
 stage:string|null; category:string|null; severity:"minor"|"major"|"critical"|null; required_rectification:string|null; inspector_name:string|null;
 inspector_id:string|null; location_path:string[]|null; responsibility_state:string|null; responsibility_team_id:string|null;
 responsibility_allocation_id:string|null; assigned_team_id:string|null; assigned_operative_id:string|null; assigned_action:string|null;
 target_date:string|null; repair_cycle:number|null; repair_event_id:number|null; rectified_by:string|null; escalated:boolean|null; escalation_reason:string|null;
 contract_name?:string; contract_reference?:string; repair_team?:string|null; repair_operative?:string|null; responsible_team?:string|null; overdue?:boolean;
};
export type SnagPhoto = {id:string; issue_id:string; purpose:"original"|"rectification"|"reinspection"|null; event_id:number|null; repair_cycle:number|null; actor_id:string; uploaded_at:string|null; created_at:string; mime_type:string|null};
export type SnagEvent = {id:number; action:string; note:string; actor_id:string; actor_name:string|null; created_at:string; previous_status:string|null; new_status:string|null; snapshot:Record<string,unknown>|null};
export type SnagCounts = {open:number; critical:number; awaiting_rectification:number; awaiting_reinspection:number; disputed:number; overdue:number; closed:number};
export type SnagRegister = { rows:Snag[]; counts:SnagCounts; total:number };
export const emptySnagCounts:SnagCounts = {open:0,critical:0,awaiting_rectification:0,awaiting_reinspection:0,disputed:0,overdue:0,closed:0};
const optionalId = (form:FormData,key:string) => text(form,key,36) ? uuid(form,key) : null;
export function createSnagInput(form:FormData) {
 const stage=text(form,"stage",30,true), severity=text(form,"severity",20,true);
 if (!(installationStages as readonly string[]).includes(stage) || !Object.hasOwn(severityLabels,severity)) throw new ValidationError("Choose a stage and severity.");
 const category=text(form,"category",100,true);
 if (!(defectCategories as readonly string[]).includes(category)) throw new ValidationError("Choose a defect category; use Other for a custom finding.");
 return {contract_id:uuid(form,"contract_id"),work_area_id:uuid(form,"work_area_id"),work_package_id:optionalId(form,"work_package_id"),inspection_id:optionalId(form,"inspection_id"),
  stage,category,severity,description:text(form,"description",2000,true),required_rectification:text(form,"required_rectification",2000,true)};
}
export function snagTransitionInput(form:FormData) {
 const action=text(form,"action",40,true), note=text(form,"note",2000,true);
 const actions=["submit","add_original_evidence","propose_responsibility","mark_unknown","accept_responsibility","dispute_responsibility","review_responsibility","assign","submit_rectification","start_reinspection","accept","reject","escalate","resolve_escalation","reopen","cancel"];
 if (!actions.includes(action) || note.length<5) throw new ValidationError("Choose an action and add an explanation of at least 5 characters.");
 const data:Record<string,unknown>={note};
 for (const key of ["team_id","operative_id","allocation_id"] as const) { const value=optionalId(form,key); if(value) data[key]=value; }
 for (const key of ["target_date","completed_on"] as const) { const value=text(form,key,10); if(value) {if(!isCalendarDate(value)) throw new ValidationError("Choose a valid date."); data[key]=value;} }
 if(action==="submit_rectification" && String(data.completed_on ?? "")>londonDate()) throw new ValidationError("Completion cannot be in the future.");
 for (const key of ["required_action","decision"] as const) {const value=text(form,key,key==="decision"?30:2000); if(value) data[key]=value;}
 const photo_ids=form.getAll("photo_ids").map(value=>{const single=new FormData();single.set("id",value);return uuid(single,"id");});
 if(photo_ids.length>12 || new Set(photo_ids).size!==photo_ids.length) throw new ValidationError("Choose up to 12 different photographs.");
 data.photo_ids=photo_ids;
 return {action,data};
}
export function photoIdsFor(photos:SnagPhoto[],purpose:NonNullable<SnagPhoto["purpose"]>,cycle:number,userId:string) {
 return photos.filter(p=>p.purpose===purpose && p.uploaded_at && p.event_id===null && p.repair_cycle===cycle && p.actor_id===userId).map(p=>p.id);
}
export function isSnagOverdue(snag:Pick<Snag,"target_date"|"snag_status"|"state">,today=londonDate()) {
 return !!snag.target_date && snag.target_date<today && !["draft","closed","cancelled"].includes(snag.snag_status??snag.state);
}
export function snagFilters(query:Record<string,string|string[]|undefined>) {
 const result:Record<string,unknown>={};
 for(const key of ["contract_id","location_id","team_id","assigned_team_id","assigned_operative_id"]){
  const value=query[key];if(typeof value==="string"&&value){const f=new FormData();f.set(key,value);result[key]=uuid(f,key);}
 }
 for(const key of ["stage","category","severity","status","search"]){
  const value=query[key];if(typeof value==="string"&&value.trim()){if(value.length>200)throw new ValidationError("Search/filter text is too long.");result[key]=value.trim();}
 }
 for(const key of ["overdue","awaiting_reinspection","disputed"]) if(query[key]==="on"||query[key]==="true") result[key]=true;
 return result;
}
