import {chromium} from 'playwright';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const host=spawn(path.resolve(process.env.NATIVE_EXECUTABLE||'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe'),['--automation'],{windowsHide:true});
let browser;
try{
 for(let i=0;i<100;i++){
  assert.equal(host.exitCode,null);
  try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}
  await new Promise(r=>setTimeout(r,150));
 }
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
 const page=browser.contexts()[0].pages()[0],errors=[];
 page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.waitForURL('https://companion.local/**');
 await page.waitForFunction(()=>!!window.companion);
 await page.evaluate(()=>localStorage.removeItem('pill-background'));
 await page.route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await page.route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.addInitScript(()=>{
  localStorage.setItem('show-translation','true');
  localStorage.setItem('reduce-motion','false');
  const native=window.companion;
  const music={musicId:'pill-preview',musicName:'悬浮歌词预览',artists:['AMLL Companion'],albumName:'Preview',duration:120000};
  let state={connected:true,error:'',music,cover:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g"><stop stop-color="#bc6156"/><stop offset=".45" stop-color="#8a5698"/><stop offset="1" stop-color="#405e9e"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/></svg>'),position:2300,clockAtSend:0,monotonicAt:0,playing:false,rate:1,timelineRevision:1,repeat:'off',shuffle:false,controls:{},sessions:[],selection:'auto'};
  let listener;
  window.pillSeek=time=>{state={...state,position:time,timelineRevision:state.timelineRevision+1};listener?.(state);};
  window.pillPlay=()=>{state={...state,playing:true,monotonicAt:performance.now(),clockAtSend:performance.now()};listener?.(state);};
  window.companion={...native,snapshot:async()=>state,subscribe:fn=>{listener=fn;return()=>{};},
   providerQuery:async request=>{
    if(request.provider==='web')return {text:'{}'};
    if(request.operation==='search')return request.provider==='netease'?[{provider_name:'netease',provider_id:'demo',title:music.musicName,artists:[{name:'AMLL Companion'}],album:'Preview',duration:120000}]:[];
    const sentences=['把所有的温柔，都留给这一刻','让晚风轻轻，吹过你的耳边','愿每一个明天，都有光在等你'];
    return {lines:sentences.map((sentence,i)=>({startTime:i*8000,endTime:i*8000+7000,isBG:false,isDuet:false,translatedLyric:i===0?'Let this moment hold all our tenderness.':'',romanLyric:'',
      words:[...sentence].map((word,j)=>({word,startTime:i*8000+j*350,endTime:i*8000+(j+1)*350}))}))};
   }};
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('把所有'));
 await page.waitForSelector('.top-actions[data-glass-ready="true"]');
 await mkdir('test-results/glass',{recursive:true});
 await page.screenshot({path:'test-results/glass/main.png'});
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.waitForSelector('dialog[open][data-glass-ready="true"]');
 assert.equal(await page.locator('dialog .glass-surface').count(),0,'Menu rows share a single material rather than stacking glass');
 assert.match(await page.locator('dialog').evaluate(el=>getComputedStyle(el).backdropFilter),/url\(/,'Menus use live backdrop refraction');
 assert.equal(await page.locator('dialog').evaluate(el=>getComputedStyle(el,'::backdrop').backdropFilter),'none','Only the material scatters light; do not blur the entire scene before refraction');
 assert.ok(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),'Glass menu must not introduce a horizontal scrollbar');
 await page.waitForTimeout(300);
 await page.screenshot({path:'test-results/glass/settings.png'});
 await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 await page.getByRole('button',{name:'选择歌词版本',exact:true}).click();
 await page.waitForSelector('dialog[open][data-glass-ready="true"]');
 await page.waitForTimeout(300);
 await page.screenshot({path:'test-results/glass/versions.png'});
 await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 await page.getByRole('button',{name:'悬浮歌词',exact:true}).click();
 await page.waitForSelector('.pill .amll-lyric-player');
 await page.waitForTimeout(800);
 await page.waitForSelector('.pill-glass[data-glass-ready="true"]');
 const filterGeometry=await page.locator('.pill-glass').evaluate(el=>{
  const filter=document.querySelector('.glass-filters filter');
  return {units:filter.getAttribute('filterUnits'),width:+filter.getAttribute('width'),height:+filter.getAttribute('height'),surface:[el.clientWidth,el.clientHeight]};
 });
 assert.equal(filterGeometry.units,'userSpaceOnUse','Backdrops need explicit local coordinates to avoid shifted optical rims');
 assert.deepEqual([filterGeometry.width,filterGeometry.height],filterGeometry.surface);
 assert.equal(await page.locator('.pill .lyric-player').evaluate(el=>getComputedStyle(el).filter),'none','Foreground lyrics must stay outside optical distortion');
 assert.match(await page.locator('.pill-glass').evaluate(el=>getComputedStyle(el).backdropFilter),/url\(/,'Pill uses edge refraction over the live album background');
 const mapsBefore=await page.locator('.glass-filters feImage').evaluateAll(images=>images.map(el=>el.getAttribute('href')));
 await page.waitForTimeout(200);
 assert.deepEqual(await page.locator('.glass-filters feImage').evaluateAll(images=>images.map(el=>el.getAttribute('href'))),mapsBefore,'Refraction maps stay cached while geometry is unchanged');
 const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
 assert.equal(dimensions.height,168);assert.ok(dimensions.width>=520);
 const bounds=await page.locator('.app.pill').boundingBox();
 assert.equal(bounds.height,128);assert.equal(bounds.width,1040,'Keep visual pill size, with extra transparent space for shadow');
 assert.equal((await page.evaluate(()=>window.companion.windowState())).mode,'lyrics');
 assert.equal((await page.evaluate(()=>window.companion.windowState())).topmost,true);
 assert.equal(await page.locator('main').count(),0,'Only one AMLL renderer stays mounted in pill mode');
 const row=text=>page.locator('.pill [class*="lyricLineWrapper"]').filter({hasText:text});
 const shape=await page.locator('.pill').evaluate(el=>({
  supported:CSS.supports('corner-shape','superellipse(1.5)'),
  corner:getComputedStyle(el).getPropertyValue('corner-shape'),
  radius:getComputedStyle(el).borderTopLeftRadius,
 }));
 assert.ok(shape.supported,'Installed WebView supports continuous superellipse corners');
 assert.equal(shape.corner,'superellipse(1.5)');assert.equal(shape.radius,'40px');
 const alignment=await row('把所有').evaluate(el=>{
  const word=el.querySelector('[class*="lyricMainLine"] > span');
  const glyph=word.getBoundingClientRect(),pill=el.closest('.pill').getBoundingClientRect();
  return {glyphCenter:glyph.y+glyph.height/2,pillCenter:pill.y+pill.height/2};
 });
 console.log('current lyric alignment',alignment);
 assert.ok(Math.abs(alignment.glyphCenter-alignment.pillCenter)<12,'Current lyric is visually centered in the floating window');
 assert.match(await page.locator('.pill .lyric-player').innerText(),/tenderness/);
 assert.equal(await page.locator('.pill-current').count(),0,'No custom plain-text renderer remains');
 assert.ok(await page.locator('.pill .amll-lyric-player').evaluate(el=>el.getAnimations({subtree:true}).length>0),'AMLL word animations remain active');
 const next=await row('让晚风').boundingBox();
 assert.ok(next.y<148&&next.y+next.height>148,'Next AMLL row peeks below the current row');
 const {stdout:nativeShape}=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`
 Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class PillShapeTest { [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr h,int index); [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int attribute,out int value,int size); }';
 $pillHandle=(Get-Process -Id ${host.pid}).MainWindowHandle;
 $pillLayered=([PillShapeTest]::GetWindowLongPtr($pillHandle,-20).ToInt64() -band 0x80000) -ne 0;
 $pillDwm=0; [void][PillShapeTest]::DwmGetWindowAttribute($pillHandle,1,[ref]$pillDwm,4);
 Write-Output "$pillLayered $pillDwm";
 `],{windowsHide:true});
 assert.equal(nativeShape.trim(),'True 0','Native host uses per-pixel alpha and disables the rectangular DWM frame/shadow');
 await page.mouse.move(-20,-20);await page.waitForTimeout(250);
 await mkdir('test-results/pill',{recursive:true});
 await page.screenshot({path:'test-results/pill/preview.png',omitBackground:true});
 await page.screenshot({path:'test-results/glass/pill.png',omitBackground:true});
 await page.evaluate(()=>{
  const pattern=document.createElement('div');pattern.className='glass-test-pattern';
  Object.assign(pattern.style,{position:'absolute',inset:'0',zIndex:'-1',background:'repeating-linear-gradient(90deg,#172343 0px,#172343 10px,#f9dc98 10px,#f9dc98 20px)'});
  document.querySelector('.pill').append(pattern);
  document.querySelector('.pill-lyrics').style.visibility='hidden';
 });
 await page.waitForTimeout(100);
 await page.screenshot({path:'test-results/glass/refraction.png',omitBackground:true});
 await page.locator('.glass-test-pattern').evaluate(el=>el.style.background='repeating-linear-gradient(0deg,#172343 0px,#172343 10px,#f9dc98 10px,#f9dc98 20px)');
 await page.screenshot({path:'test-results/glass/refraction-horizontal.png',omitBackground:true});
 await page.locator('.glass-test-pattern').evaluate(el=>el.style.background='repeating-linear-gradient(90deg,#172343 0px,#172343 10px,#f9dc98 10px,#f9dc98 20px)');
 const originalFilter=await page.locator('.pill-glass').evaluate(el=>{
  const previous=el.style.getPropertyValue('--glass-refraction');el.style.setProperty('--glass-refraction','blur(0px)');return previous;
 });
 await page.screenshot({path:'test-results/glass/refraction-flat.png',omitBackground:true});
 await page.locator('.pill-glass').evaluate((el,value)=>el.style.setProperty('--glass-refraction',value),originalFilter);
 await page.evaluate(()=>{document.querySelector('.glass-test-pattern').remove();document.querySelector('.pill-lyrics').style.visibility='';});
 await page.evaluate(()=>window.pillPlay());
 const motion=await page.evaluate(async()=>{
  const el=document.querySelector('.pill .lyric-player');
  const samples=[];
  for(let i=0;i<8;i++){
   samples.push(el.getAnimations({subtree:true}).map(a=>[a.currentTime,a.effect.getKeyframes().length]));
   await new Promise(resolve=>setTimeout(resolve,80));
  }
  return {distinct:new Set(samples.map(JSON.stringify)).size,wordEffects:samples.some(s=>s.some(a=>a[1]>2))};
 });
 assert.ok(motion.distinct>3&&motion.wordEffects,'AMLL multi-keyframe word effects advance during playback');
 const frames=await page.evaluate(()=>new Promise(resolve=>{
  const times=[];let start=0,last=0;
  const sample=now=>{
   if(!start)start=now;else times.push(now-last);last=now;
   if(now-start<2000)requestAnimationFrame(sample);
   else{times.sort((a,b)=>a-b);resolve({fps:times.length*1000/(now-start),p95Ms:times[Math.floor(times.length*.95)],maxMs:Math.max(...times)});}
  };requestAnimationFrame(sample);
 }));
 console.log('Liquid Glass + AMLL frame sample',frames);
 assert.ok(frames.fps>30,'Liquid Glass preview must not stall the lyric animation');
 await writeFile('test-results/glass/performance.json',JSON.stringify(frames,null,2));
 const spring=await page.evaluate(async()=>{
  window.pillSeek(7500);
  await new Promise(resolve=>setTimeout(resolve,120));
  const next=[...document.querySelectorAll('.pill [class*="lyricLineWrapper"]')].find(el=>el.textContent.includes('让晚风'));
  const positions=[];
  for(let i=0;i<18;i++){
   positions.push(next.getBoundingClientRect().y);
   await new Promise(resolve=>setTimeout(resolve,70));
  }
  return {distance:Math.max(...positions)-Math.min(...positions),steps:new Set(positions.map(y=>y.toFixed(1))).size};
 });
 assert.ok(spring.distance>20&&spring.steps>4,'Normal line changes must use AMLL spring motion, rather than snapping text');
 await page.evaluate(()=>window.pillSeek(9500));
 await page.waitForTimeout(600);
 assert.ok((await row('让晚风').boundingBox()).y<80,'Seek positions the actual AMLL row');
 await page.evaluate(()=>window.pillSeek(2300));
 await page.waitForTimeout(600);
 assert.ok((await row('把所有').boundingBox()).y<80,'Backwards seek restores the actual AMLL row');
 await page.evaluate(()=>window.companion.automation({width:520,height:168}));
 await page.waitForTimeout(500);
 await page.screenshot({path:'test-results/pill/narrow.png',omitBackground:true});
 await page.keyboard.press('Escape');
 await page.waitForSelector('main');
 assert.equal((await page.evaluate(()=>window.companion.windowState())).mode,'normal');
 assert.ok((await page.evaluate(()=>innerHeight))>200,'Return restores normal window bounds');
 await page.evaluate(()=>window.companion.window('floating'));
 await page.getByRole('button',{name:'悬浮歌词',exact:true}).click();
 await page.waitForSelector('.pill .amll-lyric-player');
 await page.getByRole('button',{name:'返回主界面'}).focus();
 await page.getByRole('button',{name:'返回主界面'}).click();
 await page.waitForSelector('main');
 assert.equal((await page.evaluate(()=>window.companion.windowState())).mode,'normal');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const backgroundToggle=page.getByRole('checkbox',{name:'悬浮歌词背景',exact:true});
 assert.equal(await backgroundToggle.isChecked(),true,'Background defaults to enabled');
 await backgroundToggle.uncheck();
 assert.equal(await page.locator('.album-background').count(),1,'Normal interface keeps its background');
 await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 await page.getByRole('button',{name:'悬浮歌词',exact:true}).click();
 await page.waitForSelector('.pill.no-background .amll-lyric-player');
 assert.equal(await page.locator('.ambient,.album-background,.cover-glow,.light-bloom,.shade').count(),0,'Transparent mode unmounts all background layers');
 assert.equal(await page.locator('.pill').evaluate(el=>getComputedStyle(el).boxShadow),'none','No pill shadow remains');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('.pill.no-background .amll-lyric-player');
 assert.equal(await page.evaluate(()=>localStorage.getItem('pill-background')),'false','Background preference survives reload');
 await page.mouse.move(-20,-20);await page.waitForTimeout(800);
 await page.screenshot({path:'test-results/pill/transparent.png',omitBackground:true});
 assert.ok(await page.locator('.pill .amll-lyric-player').evaluate(el=>el.getAnimations({subtree:true}).length>0),'Transparent mode retains AMLL word animations');
 await page.keyboard.press('Escape');await page.waitForSelector('main');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 assert.equal(await backgroundToggle.isChecked(),false,'Settings reflect the saved choice');
 await backgroundToggle.check();
 await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 await page.getByRole('button',{name:'悬浮歌词',exact:true}).click();
 await page.waitForSelector('.pill .album-background');
 assert.equal(await page.locator('.pill.no-background').count(),0,'Re-enabling restores the pill background');
 assert.notEqual(await page.locator('.pill').evaluate(el=>getComputedStyle(el).boxShadow),'none');
 const media=await page.context().newCDPSession(page);
 await media.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
 await page.waitForFunction(()=>matchMedia('(prefers-reduced-transparency: reduce)').matches);
 assert.equal(await page.locator('.pill-glass').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
 await media.send('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]});
 await page.waitForFunction(()=>matchMedia('(forced-colors: active)').matches);
 assert.equal(await page.locator('.pill-glass').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
 await media.send('Emulation.setEmulatedMedia',{features:[]});await media.detach();
 assert.deepEqual(errors,[]);
 console.log('PASS native pill: alpha/shadow, AMLL word and spring motion, seek, resize, restore, background toggle, transparent text, saved preference, normal background preserved, re-enable, no page errors');
}finally{if(host.exitCode===null)host.kill();await browser?.close();}
