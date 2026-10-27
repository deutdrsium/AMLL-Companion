import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import path from 'node:path';
const host=spawn(process.env.NATIVE_EXECUTABLE || 'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe',['--automation'],{windowsHide:true});
let browser,page,fixture;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];
 await page.waitForURL('https://companion.local/index.html');
 // Isolate LRCLIB transport regression from the new native providers.
 await page.evaluate(()=>{window.companion.providerQuery=async()=>{throw Error('disabled in LRCLIB transport test');};});
 let lrclibRequests=0;
 if(process.env.TEST_RETRY) {
  await page.evaluate(()=>localStorage.removeItem('lrclib-search-cache-v1'));
  await browser.contexts()[0].route('https://lrclib.net/api/**', async route=>{
   lrclibRequests++;
   return route.fulfill({status:503,body:'persistent WebView path failure'});
  });
 }
 page.on('response',r=>{if(/lrclib|amll.dev/.test(r.url())) console.log(r.status(),r.url());});
 fixture=spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe',[path.resolve('test-results/native/artwork.bmp'),'七里香','周杰倫','七里香','297000'],{windowsHide:true});
 fixture.stderr.on('data',d=>console.log(d.toString()));
 let fixtureId;
 for(let i=0;i<100;i++) {
  const snapshot=await page.evaluate(()=>window.companion.snapshot());
  fixtureId=snapshot.sessions.find(s=>/SmtcFixture/.test(s.id))?.id;
  if(fixtureId) break;
  await page.waitForTimeout(100);
 }
 assert.ok(fixtureId);
 await page.evaluate(id=>window.companion.selectSession(id),fixtureId);
 assert.equal((await page.evaluate(()=>window.companion.snapshot())).selection,fixtureId);
 await page.getByRole('heading',{name:'七里香',exact:true}).waitFor();
 await page.locator('.lyric-player').waitFor({timeout:60000});
 assert.match(await page.locator('.lyrics-footer').innerText(),/LRCLIB/);
 await page.screenshot({path:'test-results/native/qilixiang-live.png'});
 console.log('PASS: real LRCLIB synchronized lyrics rendered in WebView2 for 七里香');
 if(process.env.TEST_RETRY) {
  assert.equal(lrclibRequests,1,'native HTTP must recover from the first browser 503');
  await browser.contexts()[0].unroute('https://lrclib.net/api/**');
  await browser.contexts()[0].route('https://lrclib.net/api/**',route=>{lrclibRequests++;return route.fulfill({status:503,body:'offline'});});
  await page.reload();
  await page.evaluate(()=>{window.companion.providerQuery=async()=>{throw Error('disabled in LRCLIB transport test');};});
  await page.locator('.lyric-player').waitFor({timeout:60000});
  assert.match(await page.locator('.lyrics-footer').innerText(),/LRCLIB/);
  assert.equal(lrclibRequests,1,'cached lyrics must survive reload without another failed request');
  console.log('PASS: persistent browser 503 recovered via native HTTP; cache survived reload');
 }
} catch(e){if(page){console.log(await page.locator('body').innerText());const s=await page.evaluate(()=>window.companion.snapshot());console.log(JSON.stringify({...s,cover:s.cover.slice(0,30)}));}throw e;}
finally {fixture?.stdin.end();if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{});await browser?.close();host.kill();fixture?.kill();}
