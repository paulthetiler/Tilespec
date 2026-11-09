import { requireFinancialActor } from "@/lib/auth";
import { readFile } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { Document, Page, Text, View, Svg, Polygon, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export const dynamic = "force-dynamic";
const ink="#0F2A3A",teal="#2F7773",muted="#596671";
const s=StyleSheet.create({
 page:{paddingTop:48,paddingBottom:62,paddingLeft:58,paddingRight:58,fontFamily:"Helvetica",fontSize:9.5,color:ink,backgroundColor:"#FFFFFF"},
 header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1.5,borderBottomColor:"#7FB8B0",paddingBottom:14,marginBottom:25},
 logo:{flexDirection:"row",alignItems:"center"},
 wordmark:{marginLeft:10},
 word:{fontFamily:"Helvetica-Bold",fontSize:22,color:ink,letterSpacing:-0.7},
 tagline:{fontFamily:"Helvetica-Bold",fontSize:6.1,color:muted,letterSpacing:1.05,marginTop:3},
 headerRight:{fontSize:8,color:teal,textAlign:"right",fontFamily:"Helvetica-Bold"},
 title:{fontFamily:"Helvetica-Bold",fontSize:18,lineHeight:1.2,color:ink,marginBottom:9},
 meta:{fontSize:8.5,color:muted,lineHeight:1.4,marginBottom:20},
 heading:{fontFamily:"Helvetica-Bold",fontSize:11.5,lineHeight:1.35,color:teal,marginBottom:7},
 section:{marginBottom:14,paddingRight:4},
 para:{fontSize:9.3,lineHeight:1.45,color:ink,textAlign:"left"},
 item:{fontSize:9.3,lineHeight:1.45,marginBottom:5,paddingLeft:10},
 footer:{position:"absolute",bottom:24,left:58,right:58,paddingTop:9,borderTopWidth:0.7,borderTopColor:"#D9E1E4",flexDirection:"row",justifyContent:"space-between"},
 footerText:{fontSize:7,color:muted},
 note:{backgroundColor:"#F2F6F6",padding:12,marginTop:10,marginBottom:18,borderLeftWidth:3,borderLeftColor:"#7FB8B0"},
 noteText:{fontSize:8.5,lineHeight:1.4,color:muted}
});
function Brand(){
 return React.createElement(View,{style:s.logo},
 React.createElement(Svg,{width:43,height:43,viewBox:"0 0 500 500"},
 React.createElement(Polygon,{points:"250,20 465,125 250,230 35,125",fill:"#0F2A3A"}),
 React.createElement(Polygon,{points:"35,190 250,295 465,190 465,250 250,355 35,250",fill:"#7B8790"}),
 React.createElement(Polygon,{points:"35,320 250,425 465,320 465,380 250,485 35,380",fill:"#7FB8B0"})),
 React.createElement(View,{style:s.wordmark},
 React.createElement(Text,{style:s.word},"TileSPEC"),
 React.createElement(Text,{style:s.tagline},"WALL & FLOOR TILING CONTRACTORS")));
}
function TermsPdf({source}:{source:string}){
 const blocks=source.replace(/\r/g,"").split(/\n\s*\n/).filter(Boolean);
 return React.createElement(Document,{title:"TileSpec COSHH Assessment — Draft",author:"TileSpec"},
 React.createElement(Page,{size:"A4",style:s,wrap:true},
 React.createElement(View,{style:s.header,wrap:false},React.createElement(Brand),React.createElement(Text,{style:s.headerRight},"COSHH DOCUMENTS")),
 ...blocks.map((block,i)=>{
 const lines=block.trim().split("\n");
 if(lines[0].startsWith("# "))return React.createElement(View,{key:i,wrap:false},
 React.createElement(Text,{style:s.title},"COSHH Assessment"),
 React.createElement(Text,{style:s.meta},lines.slice(1).join(" ").replace("Version:","Version:")));
 if(lines[0].startsWith("## ")){
 const title=lines[0].slice(3);
 const checklist=title.startsWith("Internal review checklist");
 return React.createElement(View,{key:i,style:s.section,wrap:true},
 React.createElement(Text,{style:s.heading},title),
 ...lines.slice(1).filter(Boolean).map((line,j)=>React.createElement(Text,{key:j,style:line.startsWith("- ")?s.item:s.para},line.replace(/^- /,"• "))));
 }
 return React.createElement(Text,{key:i,style:s.para},block);
 }),
 React.createElement(View,{style:s.footer,fixed:true},
 React.createElement(Text,{style:s.footerText},"TILESPEC  |  INTERNAL DRAFT — NOT YET APPROVED"),
 React.createElement(Text,{style:s.footerText,render:({pageNumber,totalPages})=>`${pageNumber} / ${totalPages}`}))
 ));
}
export async function GET(){
 await requireFinancialActor();
 const source=await readFile(path.join(process.cwd(),"docs/coshh-assessment-template.md"),"utf8");
 const buffer=await renderToBuffer(TermsPdf({source}));
 return new Response(new Uint8Array(buffer),{headers:{"Content-Type":"application/pdf","Content-Disposition":'inline; filename="TileSpec-coshh-assessment-TEMPLATE-DRAFT.pdf"',"Cache-Control":"private, no-store"}});
}
