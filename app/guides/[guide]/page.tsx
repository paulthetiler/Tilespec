import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import LandingFooter from "../../../components/landing-footer";
import { guides, type GuideSlug } from "../../../lib/technical-guides";
import "../../north-west-commercial-tiling/north-west.css";
type Props = { params: Promise<{ guide: string }> };
export const dynamicParams = false;
export function generateStaticParams(){return Object.keys(guides).map(guide=>({guide}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {guide}=await params;
  if(!(guide in guides))return {};
  const data=guides[guide as GuideSlug];
  const url=`https://www.tilespec.uk/guides/${guide}`;
  return {title:`${data.title} | TileSPEC`,description:data.description,alternates:{canonical:url},openGraph:{title:data.title,description:data.description,url,type:"article"}};
}
export default async function GuidePage({params}:Props){
  const {guide}=await params;
  if(!(guide in guides))notFound();
  const data=guides[guide as GuideSlug];
  const related = Object.entries(guides)
    .filter(([slug,item]) => slug !== guide && (item.related === data.related || slug === "commercial-tiling-tender-checklist"))
    .slice(0,3);
  return <main className="nw-page" id="top">
    <header className="nw-header"><div className="nw-wrap nw-header-row">
      <Link className="nw-brand" href="/"><img src="/tilespec-logo-animated.svg" width={230} height={62} alt="TileSPEC"/></Link>
      <nav className="nw-nav"><Link href="/">Home</Link><Link href="/guides">All guidance</Link><Link href="/contact">Contact</Link></nav>
      <Link className="nw-header-cta" href="/contact">DISCUSS A PROJECT <ArrowUpRight size={16}/></Link>
    </div></header>
    <section className="nw-hero"><div className="nw-hero-photo" role="img" aria-label="Commercial tiling detail"/>
      <div className="nw-wrap nw-hero-content"><div className="nw-eyebrow"><span/> COMMERCIAL TILING GUIDANCE</div>
        <h1 style={{fontSize:"clamp(37px,5vw,76px)",maxWidth:900}}>{data.title.toUpperCase()}</h1>
        <p className="nw-lead">{data.intro}</p>
      </div>
    </section>
    <section className="nw-intro nw-space"><div className="nw-wrap" style={{maxWidth:960}}>
      <p style={{lineHeight:1.75,marginBottom:34}}><strong>Technical note:</strong> This is general project-planning guidance, not a specification or design approval. Check the current project documents, applicable standards and system manufacturers' instructions.</p>
      {data.sections.map((section,index)=><section key={section.heading} style={{margin:"0 0 36px",paddingBottom:26,borderBottom:"1px solid #ccd6d8"}}>
        <div className="nw-kicker">0{index+1} / PROJECT CONSIDERATIONS</div>
        <h2 style={{fontSize:"clamp(27px,3vw,40px)",margin:"10px 0 16px"}}>{section.heading}</h2>
        <p style={{fontSize:17,lineHeight:1.8,maxWidth:850}}>{section.text}</p>
      </section>)}
      <h2 style={{fontSize:30,margin:"30px 0 12px"}}>The key takeaway</h2><p style={{fontSize:18,lineHeight:1.75}}>{data.takeaway}</p>
      <p style={{marginTop:28}}><strong>Relevant service:</strong> <Link href={data.related}>{data.relatedLabel}</Link> · <Link href="/guides">All technical guidance</Link></p>
      <div style={{marginTop:34,paddingTop:22,borderTop:"1px solid #ccd6d8"}}>
        <h2 style={{fontSize:28,marginBottom:14}}>Related technical guidance</h2>
        <nav aria-label="Related articles" style={{display:"flex",flexDirection:"column",gap:12}}>
          {related.map(([slug,item])=><Link href={`/guides/${slug}`} key={slug}>{item.title} →</Link>)}
        </nav>
      </div>
    </div></section>
    <section className="nw-cta"><div className="nw-wrap nw-cta-inner"><div><h2>HAVE A PROJECT<br/><em>TO PRICE?</em></h2><p>Discuss the substrate, proposed system, specification and programme with TileSPEC.</p></div><div className="nw-cta-actions"><Link className="nw-button nw-button-accent" href="/contact">SEND A TENDER <ArrowUpRight size={18}/></Link></div></div></section>
    <LandingFooter/>
  </main>;
}
