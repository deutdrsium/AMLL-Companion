import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const executable=process.env.NATIVE_EXECUTABLE||'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe';
const host=spawn(executable,['--automation'],{windowsHide:true});
let browser,page,fixture;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];await page.waitForURL('https://companion.local/index.html');
 await browser.contexts()[0].route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await browser.contexts()[0].route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.evaluate(()=>{localStorage.setItem('automatic-alignment','false');localStorage.setItem('reduce-motion','false');});await page.reload();
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{
  const lines=['夜色慢慢落下','让音乐陪你停留','在微光之间','听见此刻的声音','每一个音符','都有温柔的回声','把时间留在歌里','让心随旋律流淌'].map((word,i)=>({startTime:i*5000,endTime:(i+1)*5000,words:[{word,startTime:i*5000,endTime:(i+1)*5000}],translatedLyric:'',romanLyric:'',isBG:false,isDuet:false}));
  window.companion={...window.companion,providerQuery:async r=>r.provider!=='netease'?[]:r.operation==='search'?[{provider_name:'netease',provider_id:'layout',title:r.data.title,artists:[{name:'AMLL Studio'}],album:'窗口布局',duration:180000}]:{lines}};
 });
 fixture=spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe',[path.resolve('test-results/native/artwork.bmp'),'微光之间','AMLL Studio','窗口布局','180000'],{windowsHide:true});
 let id;for(let i=0;i<100;i++){id=(await page.evaluate(()=>window.companion.snapshot())).sessions.find(s=>/SmtcFixture/.test(s.id))?.id;if(id)break;await page.waitForTimeout(100);}assert.ok(id);await page.evaluate(id=>window.companion.selectSession(id),id);
 await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('夜色'));
 fixture.stdin.write('seek:18000\npause\n');
 await page.evaluate(()=>window.companion.automation({width:1100,height:820}));
 await page.waitForFunction(()=>innerWidth===1100);
 await page.waitForTimeout(450);
 await page.evaluate(()=>window.companion.automation({width:730,height:800}));
 await page.waitForFunction(()=>document.getAnimations().some(a=>a.effect?.target===document.querySelector('.lyrics-panel')));
 assert.notEqual(await page.locator('.lyrics-panel').evaluate(e=>getComputedStyle(e).transform),'none');
 await page.waitForTimeout(450);
 const lyrics=await page.locator('.lyrics-panel').boundingBox(),player=await page.locator('.player-panel').boundingBox();
 assert.ok(lyrics.y+lyrics.height<=player.y+1,'Stacked layout must put lyrics above playback');
 assert.equal(await page.evaluate(()=>innerWidth),730,'WebView must fill the window without a margin');
 await page.screenshot({path:'test-results/native/layout-stacked.png'});
 await page.evaluate(()=>window.companion.automation({width:420,height:680}));await page.waitForTimeout(450);
 assert.ok(await page.locator('.app').evaluate(e=>e.classList.contains('mini')));
 await page.screenshot({path:'test-results/native/layout-floating-size.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>window.companion.automation({width:730,height:800}));await page.waitForTimeout(50);
 assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.target===document.querySelector('.lyrics-panel')).length),0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 console.log('PASS: lyrics first in stacked layout, animated breakpoint changes, edge-to-edge content, reduced-motion respected');
 if(process.env.KEEP_LAYOUT_PREVIEW){console.log('Preview ready at 730 x 800; send any input to close');process.stdin.resume();await once(process.stdin,'data');console.log('Final viewport',await page.evaluate(()=>[innerWidth,innerHeight]));}
}finally{fixture?.stdin.end();if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{});await browser?.close();host.kill();fixture?.kill();}
