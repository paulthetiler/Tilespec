"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/admin/admin.module.css";
import css from "./snags.module.css";
export type PhotoUpload={file:File;key:string;preview:string;percent:number;verifiedId?:string;error?:string};
export function uploadPhoto(issue:string,purpose:string,entry:PhotoUpload,onProgress:(percent:number)=>void,resource:"snags"|"holds"="snags"):Promise<string> {
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest(), form=new FormData();
  form.set("request_key",entry.key);form.set("purpose",purpose);form.set("file",entry.file);
  xhr.open("POST",`/api/supervisor/${resource}/${issue}/photos`);
  xhr.upload.onprogress=event=>{if(event.lengthComputable) onProgress(Math.round(event.loaded/event.total*100));};
  xhr.onerror=()=>reject(new Error("We could not confirm this photograph was saved. Retry with the same file."));
  xhr.onabort=xhr.onerror;xhr.timeout=120000;xhr.ontimeout=xhr.onerror;
  xhr.onload=()=>{
   try {const data=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300||data.verified!==true||typeof data.id!=="string") throw new Error(data.error||"Photograph was not confirmed saved.");resolve(data.id);}
   catch(error){reject(error instanceof Error?error:new Error("Photograph was not confirmed saved."));}
  };
  xhr.send(form);
 });
}
export function usePhotos() {
 const [entries,setEntries]=useState<PhotoUpload[]>([]);const previews=useRef<string[]>([]);
 useEffect(()=>()=>{for(const url of previews.current) URL.revokeObjectURL(url);},[]);
 const add=(files:FileList|null)=>{
  if(!files) return;
  const next=Array.from(files).map(file=>{const preview=URL.createObjectURL(file);previews.current.push(preview);return {file,key:crypto.randomUUID(),preview,percent:0};});
  setEntries(current=>[...current,...next]);
 };
 const patch=(key:string,change:Partial<PhotoUpload>)=>setEntries(current=>current.map(entry=>entry.key===key?{...entry,...change}:entry));
 const remove=(key:string)=>setEntries(current=>current.filter(entry=>entry.key!==key));
 return {entries,add,patch,remove};
}
export function PhotoChoices({entries,add,remove,disabled}:{entries:PhotoUpload[];add:(files:FileList|null)=>void;remove:(key:string)=>void;disabled:boolean}) {
 return <div>
  <p>JPEG or PNG, up to 4 MB each. Keep originals: photographs cannot be overwritten or deleted.</p>
  <label className={css.fileChoice}>Take photograph<input type="file" accept="image/jpeg,image/png" capture="environment" disabled={disabled} onChange={event=>{add(event.target.files);event.target.value="";}} /></label>
  <label className={css.fileChoice}>Choose photographs<input type="file" accept="image/jpeg,image/png" multiple disabled={disabled} onChange={event=>{add(event.target.files);event.target.value="";}} /></label>
  <div className={css.photoGrid}>{entries.map(entry=><figure key={entry.key}>
   {/* Local previews are explicitly separate from saved private evidence. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}<img src={entry.preview} alt={`Selected photograph: ${entry.file.name}`} />
   <figcaption>{entry.verifiedId?"Verified in private storage":entry.percent===100?"Verifying — save not yet confirmed":`Not yet saved · upload ${entry.percent}%`}</figcaption>
   {entry.percent>0&&!entry.verifiedId&&<progress max={100} value={entry.percent} aria-label={`Upload ${entry.file.name}`} />}
   {!entry.verifiedId&&<button type="button" className={styles.secondaryButton} disabled={disabled} onClick={()=>remove(entry.key)}>Remove unsaved selection</button>}
   {entry.error&&<p className={styles.error} role="alert">{entry.error}</p>}
  </figure>)}</div>
 </div>;
}
export function SnagPhotoUploader({issue,purpose}:{issue:string;purpose:"original"|"rectification"|"reinspection"}) {
 const photos=usePhotos(),router=useRouter();const [busy,setBusy]=useState(false),[error,setError]=useState("");
 return <section className={styles.panel} aria-label={`${purpose} photograph uploads`}>
  <h3>{purpose==="original"?"Original defect photographs":purpose==="rectification"?"Rectification photographs":"Reinspection photographs"}</h3>
  <PhotoChoices entries={photos.entries} add={photos.add} remove={photos.remove} disabled={busy} />
  <button className={styles.button} disabled={busy||!photos.entries.some(entry=>!entry.verifiedId)} onClick={async()=>{
   setBusy(true);setError("");
   try {
    if(photos.entries.length>12) throw new Error("Upload up to 12 photographs at a time.");
    for(const entry of photos.entries.filter(item=>!item.verifiedId)) {
     try {const id=await uploadPhoto(issue,purpose,entry,percent=>photos.patch(entry.key,{percent}));photos.patch(entry.key,{verifiedId:id,error:undefined});}
     catch(error){photos.patch(entry.key,{error:error instanceof Error?error.message:"Upload failed."});throw error;}
    }
    router.refresh();
   } catch(error){setError(error instanceof Error?error.message:"Could not confirm photographs were saved.");}
   finally{setBusy(false);}
  }}>{busy?"Uploading and verifying…":"Upload photographs"}</button>
  <p>Verified photographs are attached to history when you submit the corresponding action below. Pending uploads never count as completed evidence.</p>
  {error&&<p className={styles.error} role="alert">{error}</p>}
 </section>;
}
