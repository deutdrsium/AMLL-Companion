import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const host=spawn(process.env.NATIVE_EXECUTABLE || 'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe',['--automation'],{windowsHide:true});
let browser,page,fixture;
async function expectAnnotations(translation,roman){
 await page.waitForFunction(({translation,roman})=>{const text=document.querySelector('.lyric-player')?.textContent||'';return text.includes('ORIGINAL_')&&text.includes('TRANSLATION_')===translation&&text.includes('ROMANIZATION_')===roman;},{translation,roman},{timeout:15000});
}
async function setOptions(translation,roman){
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('checkbox',{name:'显示翻译',exact:true}).setChecked(translation);
 await page.getByRole('checkbox',{name:'显示音译',exact:true}).setChecked(roman);
 await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 await expectAnnotations(translation,roman);
}
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:9223/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.connectOverCDP('http://127.0.0.1:9223');page=browser.contexts()[0].pages()[0];await page.waitForURL('https://companion.local/index.html');
 const ttml='<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><body dur="00:40.000"><div>'+Array.from({length:8},(_,i)=>`<p itunes:key="L${i}" begin="00:${String(i*5).padStart(2,'0')}.000" end="00:${String(i*5+5).padStart(2,'0')}.000"><span begin="00:${String(i*5).padStart(2,'0')}.000" end="00:${String(i*5+2).padStart(2,'0')}.000">ORIGINAL_${i} </span><span begin="00:${String(i*5+2).padStart(2,'0')}.000" end="00:${String(i*5+5).padStart(2,'0')}.000">WORD</span><span ttm:role="x-translation" xml:lang="zh-CN">TRANSLATION_${i}</span><span ttm:role="x-roman">ROMANIZATION_${i}</span></p>`).join('')+'</div></body></tt>';
 await browser.contexts()[0].route('https://api.amll.dev/**',route=>{const u=new URL(route.request().url());const song={id:123,musicNames:[u.searchParams.get('musicName')||'Display fixture'],artistNames:['AMLL Studio'],albumNames:['Test Album'],lyrics:ttml};return route.fulfill({json:{status:200,data:u.pathname.endsWith('/search')?{items:[song]}:song}});});
 await browser.contexts()[0].route('https://lrclib.net/**',route=>route.fulfill({status:404,body:'not found'}));
 await page.evaluate(()=>{localStorage.removeItem('show-translation');localStorage.removeItem('show-romanization');});await page.reload();
 fixture=spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe',[path.resolve('test-results/native/artwork.bmp'),'Display fixture','AMLL Studio','Test Album','180000'],{windowsHide:true});
 let id;for(let i=0;i<100;i++){id=(await page.evaluate(()=>window.companion.snapshot())).sessions.find(s=>/SmtcFixture/.test(s.id))?.id;if(id)break;await page.waitForTimeout(100);}
 assert.ok(id);await page.evaluate(id=>window.companion.selectSession(id),id);
 await expectAnnotations(true,true);
 assert.equal(await page.locator('nav.topbar, footer.footer, .nav-title').count(),0);
 assert.equal((await page.locator('.lyrics-heading').innerText()).trim(),'');
 assert.equal((await page.locator('.lyrics-footer').innerText()).trim(),'');
 assert.equal((await page.locator('.source-label').innerText()).trim(),'UniLyric 引擎');
 const headerControls=await page.locator('.titlebar .top-actions').boundingBox();const header=await page.locator('.titlebar').boundingBox();assert.ok(headerControls&&header&&headerControls.y>=header.y&&headerControls.y+headerControls.height<=header.y+header.height);
 await setOptions(false,true);await setOptions(false,false);await setOptions(true,false);
 await page.reload();await expectAnnotations(true,false);
 await page.getByRole('button',{name:'设置',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:'显示翻译',exact:true}).isChecked(),true);assert.equal(await page.getByRole('checkbox',{name:'显示音译',exact:true}).isChecked(),false);
 await page.screenshot({path:'test-results/native/display-settings.png'});await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
 fixture.stdin.write('next\n');await page.getByRole('heading',{name:'夜色慢慢落下',exact:true}).waitFor();await expectAnnotations(true,false);
 await page.screenshot({path:'test-results/native/clean-desktop.png'});
 await page.evaluate(()=>window.companion.window('floating'));await expectAnnotations(true,false);await setOptions(false,false);
 await page.waitForTimeout(1800);
 await page.screenshot({path:'test-results/native/clean-floating.png'});
 console.log('PASS: independent translation/romanization toggles, reload/track persistence, clean chrome and floating controls');
} catch(e){if(page){console.log(await page.locator('body').innerText());await page.screenshot({path:'test-results/native/display-failure.png'});}throw e;}
finally{fixture?.stdin.end();if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{});await browser?.close();host.kill();fixture?.kill();}
