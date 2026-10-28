import {chromium} from 'playwright';
import {preview} from 'vite';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const baseline=process.argv.includes('--baseline');
const server=await preview({build:{outDir:baseline?'release/AMLL-Companion-0.6.11-win-x64/wwwroot':'dist'},preview:{host:'127.0.0.1',port:5192,strictPort:true}});let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('test-results/wrapping',{recursive:true});
 for(const size of [{width:380,height:620,deviceScaleFactor:1.5,floating:true},{width:320,height:580,floating:true},{width:520,height:720,floating:true},{width:730,height:800,floating:false},{width:1280,height:820,floating:false}].flatMap(s=>s.width===1280?[s]:[s,{...s,floating:false,resize:true}])){
  const page=await browser.newPage({viewport:size.resize?{width:1280,height:820}:{width:size.width,height:size.height},deviceScaleFactor:size.deviceScaleFactor||1});
  await page.route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
  await page.route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
  await page.addInitScript(({floating,resize})=>{
   localStorage.clear();localStorage.setItem('reduce-motion',resize?'false':'true');
   const music={musicId:'wrap',musicName:'Window layout',artists:['AMLL Studio'],albumName:'Layout',duration:60000};
   const record={id:'11111111-1111-4111-8111-111111111111',title:music.musicName,length:60000,aliases:[],releases:[{title:music.albumName}],
    'artist-credit':[{name:'AMLL Studio',artist:{id:'22222222-2222-4222-8222-222222222222',name:'AMLL Studio',aliases:[]}}]};
   window.companion={native:true,snapshot:async()=>({connected:true,error:'',music,cover:'',position:1200,clockAtSend:performance.now(),monotonicAt:1200,playing:false,rate:1,timelineRevision:1,repeat:'off',shuffle:false,controls:{},sessions:[]}),
    subscribe:()=>()=>{},windowState:async()=>({mode:floating?'floating':'normal',topmost:false}),subscribeWindow:()=>()=>{},cancelProvider:async()=>{},
    providerQuery:async({provider,operation})=>{
     if(provider==='web')return {text:JSON.stringify({recordings:[record]})};if(provider!=='netease')return [];
     if(operation==='search')return [{provider_name:provider,provider_id:'wrap',title:music.musicName,artists:[{name:'AMLL Studio'}],album:'Layout',duration:60000}];
     return {lines:['Living just to find emotion','Hiding somewhere in the night','微光之间 让音乐陪你停留','小さな窓で 音楽を楽しもう'].map((text,i)=>({startTime:1000+i*6000,endTime:6000+i*6000,isBG:false,isDuet:i===1,translatedLyric:i<2?'活着只为寻找情感':'',romanLyric:'',
      words:text.split(' ').map((word,j,all)=>({word:word+(j<all.length-1?' ':''),startTime:1000+i*6000+j*500,endTime:1450+i*6000+j*500}))}))};
    }};
  },size);
  await page.goto('http://127.0.0.1:5192');
  await page.waitForFunction(()=>[...document.querySelectorAll('[class*="lyricMainLine"]')].some(e=>e.textContent==='Living just to find emotion'));
  if(size.resize){
   await page.setViewportSize({width:size.width,height:size.height});
   await page.waitForFunction(()=>document.getAnimations().some(a=>a.effect?.target===document.querySelector('.lyrics-panel')));
   if(!baseline){
    const scale=await page.evaluate(()=>{
     const animation=document.getAnimations().find(a=>a.effect?.target===document.querySelector('.lyrics-panel'));
     const matrix=new DOMMatrix(animation.effect.getKeyframes()[0].transform);return [matrix.a,matrix.d];
    });
    assert.deepEqual(scale,[1,1],'Lyrics must still animate without distorting glyph measurement');
   }
  }
  await page.waitForTimeout(500);
  const info=await page.evaluate(()=>{
   const line=[...document.querySelectorAll('[class*="lyricMainLine"]')].find(e=>e.textContent==='Living just to find emotion');
   const walker=document.createTreeWalker(line,NodeFilter.SHOW_TEXT);const tops=[];
   while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);for(const rect of range.getClientRects())if(rect.width>0&&!tops.some(top=>Math.abs(top-rect.top)<3))tops.push(rect.top);}
   const player=document.querySelector('.lyric-player'),style=getComputedStyle(line);
   return {rows:tops.length,window:innerWidth,player:player.clientWidth,lineWidth:line.clientWidth,font:style.fontSize,padding:style.padding,
    wrapper:line.parentElement.parentElement.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  console.log(JSON.stringify({mode:baseline?'baseline':'fixed',...size,...info}));
  if(!baseline){assert.ok(info.rows<=2,`Phrase wraps into ${info.rows} rows at width ${size.width}`);assert.ok(!info.overflow);}
  if(size.width===380)await page.screenshot({path:`test-results/wrapping/${baseline?'before':'after'}-380${size.resize?'-resize':''}.png`});
  await page.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
