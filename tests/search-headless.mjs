import {chromium} from 'playwright';
import {preview} from 'vite';
import assert from 'node:assert/strict';
const baseline=process.argv.includes('--baseline');
const server=await preview({build:{outDir:baseline?'release/AMLL-Companion-0.6.4-win-x64/wwwroot':'dist'},preview:{host:'127.0.0.1',port:5188,strictPort:true}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 await page.route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await page.route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.addInitScript(()=>{
  localStorage.clear();localStorage.setItem('automatic-alignment','false');
  const delay=ms=>new Promise(r=>setTimeout(r,ms));window.searchCalls=[];window.cancelCalls=0;
  const music={musicId:'latency',musicName:'Test Song',artists:['Artist'],albumName:'Album',duration:100000};
  const record={id:'11111111-1111-4111-8111-111111111111',title:music.musicName,length:100000,aliases:[],releases:[{title:'Album'}],
   'artist-credit':[{name:'Artist',artist:{id:'22222222-2222-4222-8222-222222222222',name:'Artist',aliases:[]}}]};
  window.companion={native:true,snapshot:async()=>({connected:true,error:'',music,cover:'',position:1000,clockAtSend:performance.now(),monotonicAt:1000,playing:false,rate:1,timelineRevision:1,repeat:'off',shuffle:false,controls:{},sessions:[]}),
   subscribe:()=>()=>{},windowState:async()=>({mode:'normal',topmost:false}),subscribeWindow:()=>()=>{},cancelProvider:async()=>{window.cancelCalls++;},alignmentStatus:async()=>({available:false}),
   providerQuery:async request=>{
    window.searchCalls.push({provider:request.provider,operation:request.operation,at:performance.now()});
    if(request.provider==='web'){
     const url=new URL(request.data.url);if(url.pathname.endsWith('/recording')){await delay(1500);return {text:JSON.stringify({recordings:[record]})};}
     return {text:JSON.stringify(record)};
    }
    if(request.operation==='search'){
     if(request.provider==='qq'){await delay(3500);window.slowFinished=true;return [];}
     if(request.provider==='kugou')await delay(1800);
     if(!['netease','kugou'].includes(request.provider))return [];
     return [{provider_name:request.provider,provider_id:request.provider,title:music.musicName,artists:[{name:'Artist'}],album:'Album',duration:100000}];
    }
    await delay(150);const word=request.provider==='kugou';
    return {lines:[0,1,2].map(i=>({startTime:1000+i*5000,endTime:4000+i*5000,isBG:false,isDuet:false,translatedLyric:'',romanLyric:'',words:word
     ?[{word:'Better ',startTime:1000+i*5000,endTime:2000+i*5000},{word:'lyric',startTime:2200+i*5000,endTime:4000+i*5000}]
     :[{word:'Fast line',startTime:1000+i*5000,endTime:4000+i*5000}]}))};
   }};
 });
 const began=Date.now();await page.goto('http://127.0.0.1:5188',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.match(/Fast line|Better/));
 const firstMs=Date.now()-began,firstText=await page.locator('.lyric-player').innerText();
 if(!baseline){assert.ok(firstMs<1800,`First lyric delayed ${firstMs}ms`);assert.ok(firstText.includes('Fast line'));
  await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('Better'));
 }
 const finalMs=Date.now()-began;
 console.log(JSON.stringify({mode:baseline?'0.6.4 baseline':'progressive',firstMs,finalMs,first: firstText.includes('Fast line')?'line':'word'}));
 if(!baseline){
  await page.reload();await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('Fast line'));
  await page.getByRole('button',{name:'选择歌词版本',exact:true}).click();
  const canceled=await page.evaluate(()=>window.cancelCalls);
  await page.locator('.candidates button').filter({hasText:'网易云'}).click();
  await page.waitForFunction(()=>window.slowFinished);
  assert.ok((await page.locator('.lyric-player').innerText()).includes('Fast line'),'Background word lyrics must not replace a manual selection');
  assert.ok(await page.evaluate(before=>window.cancelCalls>before,canceled));
  console.log('PASS manual selection cancels background search and survives late better lyrics');
 }
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
