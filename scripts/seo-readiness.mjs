#!/usr/bin/env node
// Read-only pre-launch SEO smoke test. Does not submit, index, or modify pages.
// Run: npm run seo:check  (optionally SEO_BASE_URL=https://www.tilespec.uk)
const base = new URL(process.env.SEO_BASE_URL || "https://www.tilespec.uk");
const timeoutMs = 15000;
const problems = [];
const successes = [];
const request = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { signal:controller.signal, redirect:"follow", headers:{"User-Agent":"TileSPEC-Prelaunch-SEO-Check/1.0"} }); }
  finally { clearTimeout(timeout); }
};
function attribute(html,name) {
  const match=html.match(new RegExp('<link\\b[^>]*\\brel=["\\']canonical["\\'][^>]*>','i'));
  if(!match)return null;
  return (match[0].match(/href=["']([^"']+)["']/i)||[])[1]||null;
}
async function main(){
  const robots = await request(new URL("/robots.txt",base));
  const robotsBody = robots.ok ? await robots.text() : "";
  if(!robots.ok || !robotsBody.includes("Sitemap: "+new URL("/sitemap.xml",base).href))problems.push("robots.txt missing or sitemap URL incorrect");
  const sitemapResponse=await request(new URL("/sitemap.xml",base));
  if(!sitemapResponse.ok)throw new Error("Cannot fetch sitemap ("+sitemapResponse.status+")");
  const sitemap=await sitemapResponse.text();
  const locations=Array.from(sitemap.matchAll(/<loc>([^<]+)<\\/loc>/g),m=>m[1].replaceAll("&amp;","&"));
  if(locations.length<90)problems.push("Too few sitemap entries: "+locations.length);
  const unique=new Set(locations);
  if(unique.size!==locations.length)problems.push("Duplicate sitemap URL(s)");
  const targetHost=base.host;
  const urls=locations.filter(url=>{try{return new URL(url).host===targetHost}catch{return false}});
  if(urls.length!==locations.length)problems.push("Sitemap includes URLs outside canonical host");
  let next=0;
  async function worker(){
    while(next<urls.length){
      const url=urls[next++];
      try {
        const res=await request(url);
        if(!res.ok){problems.push(res.status+" "+url);continue}
        const html=await res.text();
        const canonical=attribute(html);
        if(canonical!==url)problems.push("Canonical mismatch: "+url+" -> "+canonical);
        if(!/<title>[^<]+<\\/title>/i.test(html))problems.push("Missing title: "+url);
        if(!/<h1[\\s>]/i.test(html))problems.push("Missing H1: "+url);
        if(/<meta\\s+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html))problems.push("Unexpected noindex: "+url);
        successes.push(url);
      } catch(error){problems.push("Fetch failed: "+url+" "+String(error));}
    }
  }
  await Promise.all(Array.from({length:5},()=>worker()));
  console.log("TileSPEC SEO readiness: "+successes.length+"/"+urls.length+" URLs checked; "+problems.length+" issue(s).");
  for(const issue of problems)console.error("- "+issue);
  if(problems.length)process.exitCode=1;
}
main().catch(error=>{console.error("SEO check failed:",error);process.exitCode=1;});
