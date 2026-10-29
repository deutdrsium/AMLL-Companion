import {chromium} from 'playwright';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir} from 'node:fs/promises';
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
 page.on('pageerror',e=>errors.push(e.message));
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
  window.companion={...native,snapshot:async()=>state,subscribe:fn=>{listener=fn;return()=>{};},
   providerQuery:async request=>{
    if(request.provider==='web')return {text:'{}'};
    if(request.operation==='search')return request.provider==='netease'?[{provider_name:'netease',provider_id:'demo',title:music.musicName,artists:[{name:'AMLL Companion'}],album:'Preview',duration:120000}]:[];
    const sentences=['把所有的温柔，都留给这一刻','让晚风轻轻，吹过你的耳边','愿每一个明天，都有光在等你'];
    return {lines:sentences.map((sentence,i)=>({startTime:i*8000,endTime:i*8000+7000,isBG:false,isDuet:false,translatedLyric:i===0?'Let this moment hold all our tenderness.':'',romanLyric:'',
      words:[...sentence].map((word,j)=>({word,startTime:i*8000+j*350,endTime:i*8000+(j+1)*350}))}))};
   }};
 });
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('把所有'));
 await page.getByRole('button',{name:'悬浮歌词',exact:true}).click();
 await page.waitForSelector('.pill-current');
 await page.waitForTimeout(800);
 const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
 assert.equal(dimensions.height,128);assert.ok(dimensions.width>=480);
 assert.ok(dimensions.width/dimensions.height>=7,'Default pill is wide and flat');
 const {stdout:region}=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`
 Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class PillRegionTest { [DllImport("user32.dll")] public static extern int GetWindowRgn(IntPtr h, IntPtr r); [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int a,int b,int c,int d); [DllImport("gdi32.dll")] public static extern bool PtInRegion(IntPtr r,int x,int y); [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr r); }';
 $pillHandle=(Get-Process -Id ${host.pid}).MainWindowHandle;
 $pillRegion=[PillRegionTest]::CreateRectRgn(0,0,0,0);
 try { $pillKind=[PillRegionTest]::GetWindowRgn($pillHandle,$pillRegion); Write-Output "$pillKind $([PillRegionTest]::PtInRegion($pillRegion,0,0)) $([PillRegionTest]::PtInRegion($pillRegion,240,78))" } finally { [void][PillRegionTest]::DeleteObject($pillRegion) }
 `],{windowsHide:true});
 assert.match(region.trim(),/^3 False True$/,'Native window has a real rounded region, with empty corners');
 assert.equal((await page.evaluate(()=>window.companion.windowState())).mode,'lyrics');
 assert.equal((await page.evaluate(()=>window.companion.windowState())).topmost,true);
 assert.equal(await page.locator('main').count(),0,'Full lyric renderer and timeline unmount in pill mode');
 assert.match(await page.locator('.pill-current').innerText(),/把所有/);
 assert.match(await page.locator('.pill-next').innerText(),/让晚风/);
 assert.match(await page.locator('.pill-translation').innerText(),/tenderness/);
 assert.ok(await page.locator('.pill-current span').first().evaluate(el=>parseFloat(el.style.getPropertyValue('--sung'))>99),'Word highlight reads playback clock');
 const peek=await page.locator('.pill-next').boundingBox();assert.ok(peek.y<128&&peek.y+peek.height>128,'Only the top of the next sentence peeks out');
 await page.mouse.move(-20,-20);await page.waitForTimeout(250);
 await mkdir('test-results/pill',{recursive:true});
 await page.screenshot({path:'test-results/pill/preview.png'});
 await page.evaluate(()=>window.pillSeek(9500));
 await page.waitForFunction(()=>document.querySelector('.pill-current')?.textContent.includes('让晚风'));
 await page.evaluate(()=>window.pillSeek(2300));
 await page.waitForFunction(()=>document.querySelector('.pill-current')?.textContent.includes('把所有'));
 await page.evaluate(()=>window.companion.automation({width:480,height:128}));
 await page.waitForTimeout(500);
 assert.ok(await page.locator('.pill-current').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'Current sentence fits a narrow pill');
 await page.screenshot({path:'test-results/pill/narrow.png'});
 await page.keyboard.press('Escape');
 await page.waitForSelector('main');
 assert.equal((await page.evaluate(()=>window.companion.windowState())).mode,'normal');
 assert.ok((await page.evaluate(()=>innerHeight))>200,'Return restores normal window bounds');
 await page.evaluate(()=>window.companion.window('floating'));
 await page.getByRole('button',{name:'悬浮歌词',exact:true}).click();
 await page.waitForSelector('.pill-current');
 await page.getByRole('button',{name:'返回主界面'}).focus();
 await page.getByRole('button',{name:'返回主界面'}).click();
 await page.waitForSelector('main');
 assert.equal((await page.evaluate(()=>window.companion.windowState())).mode,'normal');
 assert.deepEqual(errors,[]);
 console.log('PASS native pill: dimensions, automatic topmost, current/next/translation, word highlight, seek backwards/forwards, narrow fit, Escape, floating entry, restore, no page errors');
}finally{if(host.exitCode===null)host.kill();await browser?.close();}
