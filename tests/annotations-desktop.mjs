import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const host=spawn(process.env.NATIVE_EXECUTABLE || 'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe',['--automation'],{windowsHide:true});
let browser,page,fixture;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];await page.waitForURL('https://companion.local/index.html');
 await browser.contexts()[0].route('https://api.amll.dev/**',route=>route.fulfill({json:{status:200,data:{items:[]}}}));
 await browser.contexts()[0].route('https://lrclib.net/**',route=>route.fulfill({status:404,body:'not found'}));
 fixture=spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe',[path.resolve('test-results/native/artwork.bmp'),'more than words','羊文学','12 hugs (like butterflies)','289785'],{windowsHide:true});
 let id;for(let i=0;i<100;i++){id=(await page.evaluate(()=>window.companion.snapshot())).sessions.find(s=>/SmtcFixture/.test(s.id))?.id;if(id)break;await page.waitForTimeout(100);}
 assert.ok(id);await page.evaluate(id=>window.companion.selectSession(id),id);
 await page.getByRole('heading',{name:'more than words',exact:true}).waitFor();
 await page.locator('.lyric-player').waitFor({timeout:60000});
 assert.match(await page.locator('.lyrics-footer').innerText(),/网易云音乐.*逐词/);
 fixture.stdin.write('seek:26000\n');await page.waitForTimeout(1800);
 await page.screenshot({path:'test-results/native/annotations-more-than-words.png'});
 await page.getByRole('button',{name:'选择歌词版本',exact:true}).click();
 const chosen=page.locator('.candidates button').filter({hasText:'当前使用'});
 assert.match(await chosen.locator('.lyric-details').innerText(),/翻译：有（100%）/);
 assert.match(await chosen.locator('.lyric-details').innerText(),/音译：有（100%）/);
 await page.screenshot({path:'test-results/native/annotations-coverage.png'});
 console.log('PASS: native 网易云 lyrics rendered; selected more than words has full translation and romanization coverage');
} catch(e){if(page)console.log(await page.locator('body').innerText());throw e;}
finally {fixture?.stdin.end();if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{});await browser?.close();host.kill();fixture?.kill();}
