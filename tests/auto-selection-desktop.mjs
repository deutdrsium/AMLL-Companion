import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const host=spawn(process.env.NATIVE_EXECUTABLE || 'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe',['--automation'],{windowsHide:true});
let browser,page,fixture;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];await page.waitForURL('https://companion.local/index.html');
 let searches=0;
 await browser.contexts()[0].route('https://api.amll.dev/**',route=>{searches++;return route.fulfill({json:{status:200,data:{items:[]}}});});
 await browser.contexts()[0].route('https://lrclib.net/**',route=>route.fulfill({status:404,body:'not found'}));
 fixture=spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe',[path.resolve('test-results/native/artwork.bmp'),'青花瓷','周杰倫','我很忙','0'],{windowsHide:true});
 let id;
 for(let i=0;i<100;i++){id=(await page.evaluate(()=>window.companion.snapshot())).sessions.find(s=>/SmtcFixture/.test(s.id))?.id;if(id)break;await page.waitForTimeout(100);}
 assert.ok(id);await page.evaluate(id=>window.companion.selectSession(id),id);
 await page.getByRole('heading',{name:'青花瓷',exact:true}).waitFor();
 await page.locator('.lyric-player').waitFor({timeout:60000});
 assert.match(await page.locator('.lyrics-panel').getAttribute('data-source'),/酷狗音乐/);
 const before=searches;fixture.stdin.write('duration:239000\n');
 for(let i=0;i<100 && searches<=before;i++)await page.waitForTimeout(100);
 assert.ok(searches>before,'late SMTC duration must trigger automatic re-evaluation');
 await page.locator('.lyric-player').waitFor({timeout:60000});
 fixture.stdin.write('seek:60000\n');await page.waitForTimeout(1000);
 await page.getByRole('button',{name:'选择歌词版本',exact:true}).click();
 await page.waitForFunction(()=>{const details=[...document.querySelectorAll('.lyric-details')];return details.length>0&&details.every(d=>!d.textContent.includes('正在检测'));},null,{timeout:60000});
 const details=await page.locator('.lyric-details').allTextContents();
 assert.ok(details.some(d=>/逐行|逐词/.test(d)&&/翻译：[有无]/.test(d)&&/音译：[有无]/.test(d)&&/和声：[有无]/.test(d)&&/对唱：[有无]/.test(d)&&/\d+ 行/.test(d)));
 assert.match(await page.locator('.candidates').innerText(),/当前使用/);
 await page.screenshot({path:'test-results/native/qinghuaci-candidate-details.png'});
 console.log('PASS: 青花瓷 auto-selected with missing duration, rechecked on delayed duration, and candidate capabilities rendered',JSON.stringify(details));
} catch(e){if(page)console.log(await page.locator('body').innerText());throw e;}
finally {fixture?.stdin.end();if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{});await browser?.close();host.kill();fixture?.kill();}
