import {chromium} from 'playwright';
import {preview} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const server=await preview({preview:{host:'127.0.0.1',port:5195,strictPort:true}});let browser;
const {version}=JSON.parse(await readFile('package.json','utf8'));
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:820},deviceScaleFactor:1.5}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await page.route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.addInitScript(()=>{
  localStorage.clear();window.diagnosticEvents=[];window.getCalls=0;
  const music={musicId:'performance',musicName:'Performance Song',artists:['Artist'],albumName:'Album',duration:180000};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  window.companion={native:true,debug:true,diagnosticLog:e=>window.diagnosticEvents.push(e),
   snapshot:async()=>({connected:true,error:'',music,cover:'',position:83500,clockAtSend:performance.now(),monotonicAt:83500,
    playing:true,rate:1,timelineRevision:1,repeat:'off',shuffle:false,controls:{},sessions:[]}),
   subscribe:()=>()=>{},windowState:async()=>({mode:'normal',topmost:false}),subscribeWindow:()=>()=>{},cancelProvider:async()=>{},
   providerQuery:async({provider,operation,data})=>{
    if(provider==='web')return {text:JSON.stringify({recordings:[],results:[]})};
    if(!['netease','qq'].includes(provider))return [];
    if(operation==='search')return Array.from({length:40},(_,i)=>({provider_name:provider,provider_id:String(i),title:music.musicName,
     artists:[{name:'Artist'}],album:'Album',duration:180000}));
    window.getCalls++;await delay(20);
    return {lines:Array.from({length:55},(_,i)=>({startTime:i*3000,endTime:i*3000+2900,translatedLyric:'',romanLyric:'',
     words:[{word:'First ',startTime:i*3000,endTime:i*3000+1000},{word:`lyric ${i}`,startTime:i*3000+1000,endTime:i*3000+2900}]}))};
   }};
 });
 await page.goto('http://127.0.0.1:5195',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('First'));
 await page.evaluate(()=>{
  window.frameGaps=[];window.measureAt=performance.now();let previous=window.measureAt;
  const frame=now=>{window.frameGaps.push(now-previous);previous=now;window.frameRequest=requestAnimationFrame(frame);};
  window.frameRequest=requestAnimationFrame(frame);
 });
 await page.waitForFunction(()=>window.diagnosticEvents.some(e=>e.event==='lyrics.search.end'),{},{timeout:20000});
 await page.waitForTimeout(1000);
 const report=await page.evaluate(()=>{
  cancelAnimationFrame(window.frameRequest);
  const elapsed=performance.now()-window.measureAt;
  const gaps=window.frameGaps.slice(1),ordered=[...gaps].sort((a,b)=>a-b);
  return {scenario:'80 matching candidates / 55 word-timed lines / 1280x820 / DPR 1.5 / no album background',
   getCalls:window.getCalls,frames:gaps.length,durationMs:Math.round(elapsed),fps:Math.round(gaps.length/elapsed*10000)/10,
   maxFrameMs:Math.round(Math.max(...gaps)*10)/10,p95FrameMs:Math.round(ordered[Math.floor(ordered.length*0.95)]*10)/10,
   search:window.diagnosticEvents.find(e=>e.event==='lyrics.search.end')?.data,
   selected:document.querySelector('.lyrics-panel')?.getAttribute('data-source')};
 });
 console.log(JSON.stringify(report,null,2));
 assert.equal(report.getCalls,80,'Each provider version is downloaded only once');
 assert.ok(report.fps>=30,`Frame rate fell to ${report.fps}`);
 assert.ok(report.maxFrameMs<200,`Main-thread stall ${report.maxFrameMs}ms`);
 assert.deepEqual(errors,[]);
 await writeFile(`docs/browser-performance-${version}.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
