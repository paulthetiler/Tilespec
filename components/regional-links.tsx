import Link from "next/link";
import { regionForLocation, regionalHubs, locationDisplayName, type RegionalHub } from "../lib/region-hubs";

const block = {background:"#102b38",color:"#fff",padding:"clamp(40px,5vw,70px) 0"} as const;
const width = {maxWidth:1180,width:"calc(100% - 40px)",margin:"0 auto"} as const;
const headings = {fontFamily:"Barlow Condensed, sans-serif",fontWeight:700,fontSize:"clamp(34px,4vw,54px)",lineHeight:1.05,margin:"12px 0 18px"} as const;
const links = {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:26} as const;
const item = {display:"block",border:"1px solid rgba(255,255,255,.24)",padding:"14px 16px",color:"#e7f4f2",textDecoration:"none",fontSize:16,lineHeight:1.35} as const;

export function RegionalConnections({slug}:{slug:string}) {
  const hub = regionForLocation(slug);
  if(!hub) return null;
  const siblings = hub.ids.filter(id => id+"-commercial-tiling" !== slug);
  return <section aria-label="Regional commercial tiling coverage" style={block}>
    <div style={width}>
      <div style={{color:"#98cdc4",fontSize:12,fontWeight:700,letterSpacing:2}}>EXPLORE COMMERCIAL COVERAGE</div>
      <h2 style={headings}>Commercial tiling across {hub.name}.</h2>
      <p style={{fontSize:16,lineHeight:1.7,maxWidth:760,color:"#d7e3e5"}}>TileSPEC is based in Warrington and reviews commercial projects nationally. Find other locations within this region or explore the full coverage directory.</p>
      <p style={{margin:"16px 0",fontSize:16}}><Link href={"/"+hub.path} style={{color:"#a7ddd3",fontWeight:700}}>View the {hub.name} regional hub →</Link></p>
      {siblings.length>0 && <nav aria-label={"Other locations in "+hub.name} style={links}>{siblings.map(id=><Link key={id} style={item} href={"/"+id+"-commercial-tiling"}>{locationDisplayName(id)} →</Link>)}</nav>}
      <p style={{marginTop:24}}><Link href="/coverage" style={{color:"#a7ddd3"}}>All UK commercial tiling locations →</Link></p>
    </div>
  </section>;
}

export function RegionCityLinks({hub}:{hub:RegionalHub}) {
  return <section id="regional-locations" aria-label={"Commercial tiling locations in "+hub.name} style={block}>
    <div style={width}>
      <div style={{color:"#98cdc4",fontSize:12,fontWeight:700,letterSpacing:2}}>LOCAL COVERAGE</div>
      <h2 style={headings}>Explore {hub.name} locations.</h2>
      <p style={{maxWidth:800,fontSize:16,lineHeight:1.7,color:"#d7e3e5"}}>{hub.detail} Choose a location to see the relevant commercial tiling scope and enquiry information.</p>
      <nav aria-label={hub.name+" location pages"} style={links}>
        {hub.ids.map(id=><Link key={id} style={item} href={"/"+id+"-commercial-tiling"}>{locationDisplayName(id)} →</Link>)}
      </nav>
      <p style={{marginTop:24}}><Link href="/coverage" style={{color:"#a7ddd3"}}>View all UK regions →</Link></p>
    </div>
  </section>;
}

export function AllRegionLinks(){
  return <nav aria-label="UK commercial tiling regions" style={links}>
    {regionalHubs.map(hub=><Link key={hub.id} href={"/"+hub.path} style={item}>{hub.name} →</Link>)}
  </nav>;
}

export function LondonConnections(){
  const nearby = [
    {name:"Watford",slug:"watford-commercial-tiling"},
    {name:"Slough",slug:"slough-commercial-tiling"},
    {name:"Crawley / Gatwick",slug:"crawley-commercial-tiling"},
    {name:"Stevenage",slug:"stevenage-commercial-tiling"},
    {name:"Reading",slug:"reading-commercial-tiling"},
  ];
  return <section id="regional-locations" aria-label="London commercial tiling coverage" style={block}>
    <div style={width}>
      <div style={{color:"#98cdc4",fontSize:12,fontWeight:700,letterSpacing:2}}>LONDON & SURROUNDING MARKETS</div>
      <h2 style={headings}>Commercial projects across London.</h2>
      <p style={{fontSize:16,lineHeight:1.7,maxWidth:770,color:"#d7e3e5"}}>This London page is our London regional hub. We consider suitable tenders across the capital and neighbouring business centres, assessing travel, labour, access, scope and programme from our Warrington base.</p>
      <nav aria-label="Nearby commercial tiling locations" style={links}>{nearby.map(place=><Link key={place.slug} href={"/"+place.slug} style={item}>{place.name} →</Link>)}</nav>
      <p style={{marginTop:24}}><Link href="/coverage" style={{color:"#a7ddd3"}}>Explore all UK commercial tiling regions →</Link></p>
    </div>
  </section>;
}
