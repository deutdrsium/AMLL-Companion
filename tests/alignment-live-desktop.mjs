// Real audio download and packaged Python inference; only catalog/SMTC are fixtures.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const sample=JSON.parse(await readFile('.reference/alignment/2617338135.json','utf8'));
const executable=process.env.NATIVE_EXECUTABLE;
assert.ok(executable,'Set NATIVE_EXECUTABLE to the packaged app');
const host=spawn(executable,['--automation'],{windowsHide:true});
let browser,page,fixture;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];await page.waitForURL('https://companion.local/index.html');
 await browser.contexts()[0].route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await browser.contexts()[0].route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.evaluate(()=>{localStorage.setItem('automatic-alignment','true');localStorage.removeItem('lrclib-search-cache-v1');});await page.reload();
 assert.equal((await page.evaluate(()=>window.companion.alignmentStatus())).available,true);
 await page.evaluate(sample=>{
  const align=window.companion.alignLyrics;
  window.companion={...window.companion,
   providerQuery:async r=>r.provider!=='netease'?[]:r.operation==='search'?[sample.song]:sample.lyric,
   alignLyrics:async payload=>{
    window.liveAlignmentStarted=true;
    // Avoid a result left by another test: exercise download + inference on this run.
    try {
     const result=await align({...payload,musicKey:payload.musicKey+':live-test:'+crypto.randomUUID()});
     window.liveAlignmentResult=result;return result;
    } catch(error) { window.liveAlignmentError=String(error);throw error; }
   }};
 },sample);
 fixture=spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe',
  [path.resolve('test-results/native/artwork.bmp'),sample.song.title,sample.song.artists.map(a=>a.name).join(' & '),sample.song.album,String(sample.song.duration)],{windowsHide:true});
 let id;for(let i=0;i<100;i++){id=(await page.evaluate(()=>window.companion.snapshot())).sessions.find(s=>/SmtcFixture/.test(s.id))?.id;if(id)break;await page.waitForTimeout(100);}assert.ok(id);
 await page.evaluate(id=>window.companion.selectSession(id),id);
 await page.waitForFunction(()=>window.liveAlignmentStarted,null,{timeout:30000});
 assert.doesNotMatch(await page.locator('.lyrics-panel').getAttribute('data-source'),/本地自动对齐/);
 await page.waitForFunction(()=>!!window.liveAlignmentResult||!!window.liveAlignmentError,null,{timeout:180000});
 assert.equal(await page.evaluate(()=>window.liveAlignmentError),undefined);
 const result=await page.evaluate(()=>window.liveAlignmentResult);
 assert.ok(result.alignedLines>0);
 assert.equal(result.engine,'mms-ctc-q4');
 for(let i=0;i<sample.lyric.lines.length;i++)assert.equal(result.lines[i].words.map(w=>w.word).join(''),sample.lyric.lines[i].words.map(w=>w.word).join(''));
 await page.waitForFunction(()=>document.querySelector('.lyrics-panel')?.getAttribute('data-source')?.includes('本地自动对齐'));
 await page.getByRole('button',{name:'设置',exact:true}).click();
 assert.match(await page.locator('[role=status]').innerText(),new RegExp(`已对齐 ${result.alignedLines} 行`));
 await page.screenshot({path:'test-results/native/alignment-live-packaged.png'});
 console.log(`PASS: packaged app, real audio download, local MMS CTC Q4, ${result.alignedLines} aligned lines, UI upgraded`);
}catch(e){if(page)console.log(await page.locator('body').innerText());throw e;}
finally{fixture?.stdin.end();if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{});await browser?.close();host.kill();fixture?.kill();}
