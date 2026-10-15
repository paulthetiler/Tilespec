"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { HoldActionState } from "@/app/admin/holds/actions";
import { snapshotSnagForm,restoreSnagForm,type SnagFormSnapshot } from "@/lib/operations/snag-create-workflow";
import styles from "@/app/admin/admin.module.css";

// Freeze both the request key and its exact payload before dispatch. A transport
// error cannot tell us whether a safety stop/release reached the database.
export function HoldForm({action,children,label,create=false,contract}:{action:(state:HoldActionState,form:FormData)=>Promise<HoldActionState>;children:React.ReactNode;label:string;create?:boolean;contract?:string}) {
 const router=useRouter(),saved=useRef<SnagFormSnapshot|null>(null);
 const [busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[dirty,setDirty]=useState(false),[state,setState]=useState<HoldActionState>({});
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
 return <form className={styles.form} aria-busy={busy} onInput={()=>setDirty(true)} onSubmit={async event=>{
  event.preventDefault();if(busy)return;setBusy(true);setDirty(true);setState({});
  if(!saved.current)saved.current=snapshotSnagForm(new FormData(event.currentTarget));setLocked(true);
  try {const result=await action({},restoreSnagForm(saved.current));setState(result);
   if(result.success){setDirty(false);saved.current=null;setLocked(false);if(create&&result.id)router.push(`/admin/holds/${result.id}`);router.refresh();}
   else if(result.uncertain===false){saved.current=null;setLocked(false);}
  }catch{setState({error:"Connection failed. This stop or release has not been confirmed here. Check the saved history, then retry the same request.",uncertain:true});}
  finally{setBusy(false);}
 }}>
  <fieldset className={styles.fieldset} disabled={busy||locked}>{children}</fieldset>
  <button className={create?styles.bigButton:styles.button} disabled={busy||!!state.success}>{busy?"Saving — awaiting confirmation…":locked?`Retry: ${label}`:label}</button>
  {state.error&&<p className={styles.error} role="alert">{state.error}</p>}
  {state.success&&<p className={styles.success} role="status">{state.success}</p>}
  {locked&&!busy&&<p>These details are kept unchanged for a safe retry. <Link href={`/admin/holds${contract?`?contract_id=${contract}`:""}`}>Check saved holds</Link> before starting another stop or decision.</p>}
 </form>;
}
