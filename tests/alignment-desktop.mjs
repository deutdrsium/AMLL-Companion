import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const host=spawn(process.env.NATIVE_EXECUTABLE||'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe',['--automation'],{windowsHide:true});
let browser,page,fixture;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];await page.waitForURL('https://companion.local/index.html');
 await browser.contexts()[0].route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await browser.contexts()[0].route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.evaluate(()=>{localStorage.setItem('automatic-alignment','true');localStorage.removeItem('lrclib-search-cache-v1');});await page.reload();
 await page.evaluate(()=>{
  window.alignmentEvents=new Set();window.alignmentCanceled=[];
  const lines=['ORIGINAL LINE','SECOND LINE'].map((word,i)=>({startTime:1000+i*5000,endTime:4000+i*5000,words:[{word,startTime:1000+i*5000,endTime:4000+i*5000}],translatedLyric:'TRANSLATION',romanLyric:'ROMAN',isBG:false,isDuet:false}));
  window.companion={...window.companion,alignmentStatus:async()=>({available:true}),subscribeAlignment:fn=>{window.alignmentEvents.add(fn);return()=>window.alignmentEvents.delete(fn);},
   cancelAlignment:async id=>{window.alignmentCanceled.push(id);},alignLyrics:payload=>new Promise(resolve=>{window.pendingAlignment={payload,resolve};}),
   providerQuery:async r=>r.provider!=='netease'?[]:r.operation==='search'?[{provider_name:'netease',provider_id:'fixture',title:r.data.title,artists:[{name:'AMLL Studio'}],album:'Test Album',duration:60000}]:{lines}};
 });
 fixture=spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe',[path.resolve('test-results/native/artwork.bmp'),'Alignment fixture','AMLL Studio','Test Album','60000'],{windowsHide:true});
 let id;for(let i=0;i<100;i++){id=(await page.evaluate(()=>window.companion.snapshot())).sessions.find(s=>/SmtcFixture/.test(s.id))?.id;if(id)break;await page.waitForTimeout(100);}assert.ok(id);await page.evaluate(id=>window.companion.selectSession(id),id);
 await page.waitForFunction(()=>!!window.pendingAlignment);
 await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('ORIGINAL LINE'));
 assert.match(await page.locator('.lyric-player').innerText(),/ORIGINAL LINE/);
 assert.doesNotMatch(await page.locator('.lyrics-panel').getAttribute('data-source'),/本地自动对齐/);
 await page.evaluate(()=>{const p=window.pendingAlignment;const lines=p.payload.lines.map(l=>({...l,words:l.words[0].word.split(' ').map((w,i)=>({word:i?' '+w:w,startTime:l.startTime+i*1000,endTime:l.startTime+(i+1)*1000}))}));p.resolve({lines,alignedLines:lines.length,engine:'test'});});
 await page.waitForFunction(()=>document.querySelector('.lyrics-panel')?.getAttribute('data-source')?.includes('本地自动对齐'));
 await page.getByRole('button',{name:'设置',exact:true}).click();assert.match(await page.locator('[role=status]').innerText(),/已对齐 2 行/);
 await page.screenshot({path:'test-results/native/alignment-settings.png'});
 await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 await page.evaluate(()=>{window.pendingAlignment=null;});fixture.stdin.write('next\n');await page.waitForFunction(()=>!!window.pendingAlignment);
 const requestId=await page.evaluate(()=>window.pendingAlignment.payload.requestId);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('checkbox',{name:'自动生成逐字时间轴',exact:true}).uncheck();
 await page.waitForFunction(id=>window.alignmentCanceled.includes(id),requestId);
 await page.evaluate(()=>{const p=window.pendingAlignment;p.resolve({lines:p.payload.lines,alignedLines:1});});
 await page.waitForTimeout(300);
 assert.doesNotMatch(await page.locator('.lyrics-panel').getAttribute('data-source'),/本地自动对齐/);
 assert.equal(await page.evaluate(()=>window.alignmentEvents.size),0);
 console.log('PASS: line lyrics visible during inference, background upgrade, settings status, cancel on disable, stale result rejection');
}catch(e){if(page)console.log(await page.locator('body').innerText());throw e;}
finally{fixture?.stdin.end();if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{});await browser?.close();host.kill();fixture?.kill();}
