import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const host=spawn(process.env.NATIVE_EXECUTABLE || 'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe',['--automation'],{windowsHide:true});
let browser,page,fixture;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];
 await page.waitForURL('https://companion.local/index.html');
 await page.evaluate(()=>{const original=window.companion.providerQuery;window.companion={...window.companion,providerQuery:r=>['qq','kuwo','migu','web'].includes(r.provider)?Promise.resolve([]):original(r)};});
 await browser.contexts()[0].route('https://api.amll.dev/**',route=>{
  if(!process.env.TEST_QUALITY) return route.fulfill({status:503,body:'source unavailable'});
  const url=new URL(route.request().url());
  const song={id:90001,musicNames:['MOON-VINE'],artistNames:['夏背','Orangestar'],albumNames:['Light in the Distance'],
    lyrics:'<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="00:01.000" end="00:03.000">Line timing fixture one</p><p begin="00:03.000" end="00:05.000">Line timing fixture two</p></div></body></tt>'};
  return route.fulfill({json:{status:200,data:url.pathname.endsWith('/search')?{items:[song]}:song}});
 });
 await browser.contexts()[0].route('https://lrclib.net/**',route=>route.fulfill({status:404,body:'not found'}));
 for(const [title,artist,album,duration,source] of [['MOON-VINE','夏背 & Orangestar','Light in the Distance','239000','网易云音乐'],['七里香','周杰倫','七里香','297000','酷狗音乐']]) {
  fixture=spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe',[path.resolve('test-results/native/artwork.bmp'),title,artist,album,duration],{windowsHide:true});
  let fixtureId;
  for(let i=0;i<100;i++){const snapshot=await page.evaluate(()=>window.companion.snapshot());fixtureId=snapshot.sessions.find(s=>/SmtcFixture/.test(s.id))?.id;if(fixtureId)break;await page.waitForTimeout(100);}
  assert.ok(fixtureId);await page.evaluate(id=>window.companion.selectSession(id),fixtureId);
  await page.getByRole('heading',{name:title,exact:true}).waitFor();
  await page.waitForFunction(source=>document.querySelector('.lyrics-panel')?.getAttribute('data-source')?.includes(source),source,{timeout:60000});
  await page.locator('.lyric-player').waitFor();
  fixture.stdin.write('seek:60000\n');
  await page.waitForTimeout(2000);
  assert.ok((await page.locator('.lyric-player').innerText()).trim().length > 20, 'lyric text must actually render');
  await page.screenshot({path:`test-results/native/provider-${source}.png`});
  console.log(`PASS: ${title} rendered from ${source}; quality comparison=${!!process.env.TEST_QUALITY}`);
  fixture.stdin.end();await new Promise(r=>fixture.once('exit',r));fixture=undefined;
  await page.waitForTimeout(800);
 }
} catch(e){if(page)console.log(await page.locator('body').innerText());throw e;}
finally {fixture?.stdin.end();if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{});await browser?.close();host.kill();fixture?.kill();}
