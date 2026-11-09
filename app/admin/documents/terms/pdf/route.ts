import { requireFinancialActor } from "@/lib/auth";
import { readFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export const dynamic = "force-dynamic";
const s = StyleSheet.create({
 page:{paddingTop:46,paddingBottom:50,paddingHorizontal:46,fontFamily:"Helvetica",fontSize:9.5,color:"#173242"},
 title:{fontSize:20,fontFamily:"Helvetica-Bold",color:"#0f2a3a",marginBottom:10},
 meta:{fontSize:8,color:"#7c4d26",marginBottom:18},
 heading:{fontSize:12,fontFamily:"Helvetica-Bold",color:"#126c6d",marginTop:15,marginBottom:6},
 para:{fontSize:9.5,lineHeight:1.5,marginBottom:8},
 footer:{position:"absolute",bottom:24,left:46,right:46,fontSize:8,color:"#637880",borderTop:"1 solid #d9e5e6",paddingTop:8}
});
function TermsPdf({source}:{source:string}){
 const blocks=source.split(/\n\s*\n/).filter(Boolean);
 return React.createElement(Document,null,React.createElement(Page,{size:"A4",style:s,wrap:true},
 ...blocks.map((block,i)=>{
 const lines=block.trim().split("\n");
 if(lines[0].startsWith("# "))return React.createElement(View,{key:i,wrap:false},React.createElement(Text,{style:s.title},lines[0].slice(2)),React.createElement(Text,{style:s.meta},lines.slice(1).join(" ")));
 if(lines[0].startsWith("## "))return React.createElement(View,{key:i},React.createElement(Text,{style:s.heading},lines[0].slice(3)),React.createElement(Text,{style:s.para},lines.slice(1).map(x=>x.replace(/^- /,"• ")).join("\n")));
 return React.createElement(Text,{key:i,style:s.para},block);
 }),
 React.createElement(Text,{style:s.footer,fixed:true},"TileSpec  |  Internal draft for review  |  Not approved for external issue")
 ));
}
export async function GET(){
 await requireFinancialActor();
 const source=await readFile(path.join(process.cwd(),"docs/commercial-terms-and-conditions-draft.md"),"utf8");
 const buffer=await renderToBuffer(TermsPdf({source}));
 return new Response(new Uint8Array(buffer),{headers:{"Content-Type":"application/pdf","Content-Disposition":'inline; filename="TileSpec-Commercial-Terms-DRAFT.pdf"',"Cache-Control":"private, no-store"}});
}
