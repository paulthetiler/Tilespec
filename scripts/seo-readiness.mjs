#!/usr/bin/env node
// Read-only pre-launch smoke test; never submits pages to a search engine.
const base = new URL(process.env.SEO_BASE_URL || "https://www.tilespec.uk");
const errors = [], checked = [];
const fetchPage = async url => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url,{signal:controller.signal,redirect:"follow",headers:{"User-Agent":"TileSPEC-SEO-Smoke-Test/1.0"}}); }
  finally {clearTimeout(timer);}
};
async function main() {
  const robots = await fetchPage(new URL("/robots.txt",base));
  const robotsBody = robots.ok ? await robots.text() : "";
  if (!robots.ok || !robotsBody.includes("Sitemap: "+new URL("/sitemap.xml",base).href)) errors.push("robots.txt or sitemap declaration missing");
  const sitemapResponse=await fetchPage(new URL("/sitemap.xml",base));
  if(!sitemapResponse.ok) throw Error("Sitemap returned "+sitemapResponse.status);
  const sitemap=await sitemapResponse.text();
  const urls=Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g),m=>m[1].replaceAll("&amp;","&"));
  if(urls.length<90)errors.push("Sitemap contains only "+urls.length+" URLs");
  if(new Set(urls).size!==urls.length)errors.push("Duplicate sitemap URLs");
  if(urls.some(url=>new URL(url).origin!==base.origin))errors.push("Sitemap links to another origin");
  let cursor=0;
  async function worker(){
    while(cursor<urls.length){
      const url=urls[cursor++];
      try{
        const response=await fetchPage(url);
        if(!response.ok){errors.push(response.status+" "+url);continue;}
        const html=await response.text();
        const canonical=(html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||[])[1];
        if(canonical!==url)errors.push("Canonical mismatch: "+url+" -> "+canonical);
        if(!/<title>[^<]+<\/title>/i.test(html))errors.push("Missing title: "+url);
        if(!/<h1[\s>]/i.test(html))errors.push("Missing H1: "+url);
        if(/<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html))errors.push("Unexpected noindex: "+url);
        checked.push(url);
      }catch(error){errors.push("Unable to fetch "+url+": "+String(error));}
    }
  }
  await Promise.all(Array.from({length:5},()=>worker()));
  console.log("TileSPEC SEO check: "+checked.length+"/"+urls.length+" pages inspected, "+errors.length+" issues");
  for(const error of errors)console.error("- "+error);
  if(errors.length)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
