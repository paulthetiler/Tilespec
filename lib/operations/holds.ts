import { text, uuid, ValidationError } from "./validation";
import { installationStages } from "./types";
import { isCalendarDate } from "./planning";

export const holdTypes = { quality: "Quality hold", safety: "Safety stop-work" } as const;
export const holdStatusLabels:Record<string,string> = {active:"Active — affected work stopped",correction_submitted:"Corrective action submitted",awaiting_release:"Awaiting release authorisation",released:"Released for specified activity",superseded:"Superseded by another hold",entered_in_error:"Entered in error — record preserved"};
export const qualityCategories = ["Unsuitable substrate","Excessive moisture","Failed waterproofing inspection","Movement or deflection","Wrong material or system","Incorrect preparation","Serious workmanship defect","Required inspection not passed","Other quality concern"];
export const safetyCategories = ["Unsafe access or platform","Dust or hazardous exposure","Dangerous equipment","Electrical hazard","Unsafe opening or excavation","Other immediate hazard"];
export type Hold = {id:string;organisation_id:string;contract_id:string;work_area_id:string|null;work_package_id:string|null;work_package_name?:string|null;stage:string|null;activity:string;hold_type:"quality"|"safety";category:string;severity:"major"|"critical";reason:string;required_action:string;status:string;version:number;correction_cycle:number;raised_by:string;raised_name?:string;created_at:string;location_path:string[];assigned_team_id:string|null;assigned_operative_id:string|null;assignment_action?:string|null;target_date:string|null;correction_submitted_by:string|null;corrected_at?:string|null;released_by:string|null;released_at:string|null;source_inspection_id:string|null;source_snag_id:string|null;source_morning_inspection_id:string|null;original_document_ids?:string[];evidence_explanation:string|null;authority_acknowledgement?:Record<string,unknown>|null;escalated:boolean;contract_name?:string;contract_reference?:string;assigned_team_name?:string;assigned_operative_name?:string;overdue?:boolean};
export type HoldPhoto={id:string;hold_id:string;actor_id:string;purpose:"original"|"correction"|"release";correction_cycle:number;uploaded_at:string|null;created_at:string;event_id:number|null;mime_type:string};
export type HoldEvent={id:number;action:string;actor_id:string;actor_name:string;created_at:string;previous_status:string|null;new_status:string;note:string;snapshot:Record<string,unknown>};
export type HoldCounts={active_quality:number;active_safety:number;awaiting_release:number;overdue:number;rejected:number;released:number};
export type HoldRegister={rows:Hold[];counts:HoldCounts;total:number};
const optionalId=(form:FormData,key:string)=>text(form,key,36)?uuid(form,key):null;
function stageFor(form:FormData) {const stage=text(form,"stage",30);if(stage&&!(installationStages as readonly string[]).includes(stage))throw new ValidationError("Choose an installation stage or all activities.");return stage||null;}
function idsFor(form:FormData,key:string) {const ids=form.getAll(key).map(value=>{const f=new FormData();f.set(key,value);return uuid(f,key);});if(ids.length>12||new Set(ids).size!==ids.length)throw new ValidationError("Choose up to 12 different evidence records.");return ids;}
export function createHoldInput(form:FormData) {
 const hold_type=text(form,"hold_type",20,true),severity=text(form,"severity",20,true);
 if(!Object.hasOwn(holdTypes,hold_type)||!["major","critical"].includes(severity))throw new ValidationError("Choose a hold type and severity.");
 const work_area_id=optionalId(form,"work_area_id");
 if(!work_area_id&&form.get("site_scope")!=="on")throw new ValidationError("Choose the affected location or explicitly stop the whole site.");
 return {contract_id:uuid(form,"contract_id"),work_area_id,work_package_id:optionalId(form,"work_package_id"),stage:stageFor(form),activity:text(form,"activity",200),hold_type,severity,category:text(form,"category",100,true),reason:text(form,"reason",2000,true),required_action:text(form,"required_action",2000,true),evidence_explanation:text(form,"evidence_explanation",2000),document_ids:idsFor(form,"document_ids"),source_inspection_id:optionalId(form,"source_inspection_id"),source_snag_id:optionalId(form,"source_snag_id"),source_morning_inspection_id:optionalId(form,"source_morning_inspection_id")};
}
export function holdTransitionInput(form:FormData) {
 const action=text(form,"action",40,true),note=text(form,"note",2000,true);
 if(!["add_original_evidence","assign","submit_correction","request_release","reject_release","release","escalate","supersede","entered_in_error"].includes(action)||note.length<5)throw new ValidationError("Choose an action and explain the decision (at least 5 characters).");
 if(["release","supersede","entered_in_error"].includes(action)&&form.get("confirm_decision")!=="on")throw new ValidationError("Confirm this recorded decision before saving.");
 const data:Record<string,unknown>={note,photo_ids:idsFor(form,"photo_ids"),document_ids:idsFor(form,"document_ids")};
 for(const key of ["team_id","operative_id","successor_id"]){const value=optionalId(form,key);if(value)data[key]=value;}
 for(const key of ["required_action","evidence_explanation","authority_name","authority_role","authority_reference"]){const value=text(form,key,2000);if(value)data[key]=value;}
 const target=text(form,"target_date",10);if(target){if(!isCalendarDate(target))throw new ValidationError("Choose a valid target date.");data.target_date=target;}
 for(const key of ["completed_at","authority_acknowledged_at"]){const value=text(form,key,40);if(value){const time=new Date(value);if(!Number.isFinite(time.getTime())||time.getTime()>Date.now())throw new ValidationError("Choose a recorded date and time that is not in the future.");data[key]=time.toISOString();}}
 return {action,data};
}
export function holdFilters(query:Record<string,string|string[]|undefined>) {const result:Record<string,unknown>={};for(const key of ["contract_id","location_id","team_id"]){if(typeof query[key]==="string"&&query[key]){const f=new FormData();f.set(key,query[key]);result[key]=uuid(f,key);}}for(const key of ["stage","status","hold_type","search"]){if(typeof query[key]==="string"&&query[key]){if(query[key].length>200)throw new ValidationError("Filter text is too long.");result[key]=query[key];}}if(query.overdue==="on")result.overdue=true;return result;}
export function holdPhotoIdsFor(photos:HoldPhoto[],purpose:HoldPhoto["purpose"],cycle:number,user:string){return photos.filter(p=>p.purpose===purpose&&p.correction_cycle===cycle&&p.actor_id===user&&p.uploaded_at&&p.event_id===null).map(p=>p.id);}
export function holdScope(hold:Pick<Hold,"location_path"|"stage"|"activity">&Partial<Pick<Hold,"work_package_id"|"work_package_name">>){return `${hold.location_path?.join(" › ")||"Entire site"} · ${hold.stage||"All installation activities"}${hold.work_package_id?` · Work package: ${hold.work_package_name||hold.work_package_id}`:""}${hold.activity?` · ${hold.activity}`:""}`;}
