import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const host = spawn(process.env.NATIVE_EXECUTABLE || 'native/bin/Release/net10.0-windows10.0.19041.0/AMLL Companion.exe', ['--automation'], { windowsHide: true });
let browser, page, fixture;
try {
  for (let i=0;i<100;i++) { try { if ((await fetch('http://127.0.0.1:9223/json/version')).ok) break; } catch {} await new Promise(r=>setTimeout(r,200)); }
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  page = browser.contexts()[0].pages()[0]; await page.waitForURL('https://companion.local/index.html');
  await browser.contexts()[0].route('https://api.amll.dev/**', route => route.fulfill({json:{status:200,data:{items:[]}}}));
  await browser.contexts()[0].route('https://lrclib.net/**', route => route.fulfill({json:[]}));
  await page.evaluate(() => localStorage.removeItem('lrclib-search-cache-v1'));
  fixture = spawn('native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe', [path.resolve('test-results/native/artwork.bmp'), 'Web Test Song', 'Web Test Artist', 'Test Album', '120000'], { windowsHide:true });
  let id;
  for(let i=0;i<100;i++) { id=(await page.evaluate(()=>window.companion.snapshot())).sessions.find(s=>/SmtcFixture/.test(s.id))?.id; if(id)break; await page.waitForTimeout(100); }
  assert.ok(id);
  async function scenario(mode) {
    await page.reload();
    await page.evaluate(mode => {
      window.testCalls=[];
      window.nativeProviderQuery=window.companion.providerQuery;
      window.companion={...window.companion,providerQuery:async ({provider,operation,data}) => {
        window.testCalls.push({provider,operation});
        if(provider !== 'web') {
          if(mode==='main' && ['qq','kuwo'].includes(provider)) {
            if(operation==='search') return [{provider_name:provider,provider_id:'fixture',title:'Web Test Song',artists:[{name:'Web Test Artist'}],album:'Test Album',duration:120000}];
            return {lines:[1000,5000,10000].map(t=>({startTime:t,endTime:t+3000,translatedLyric:'',romanLyric:'',isBG:false,isDuet:false,
              words:provider==='qq'?[{word:'WORD ',startTime:t,endTime:t+1000},{word:'TIMED',startTime:t+1000,endTime:t+3000}]:[{word:'LINE TIMED',startTime:t,endTime:t+3000}]}))};
          }
          return [];
        }
        if(mode==='cancel') await new Promise(r=>setTimeout(r,1500));
        const text='[ti:Web Test Song]\n[ar:Web Test Artist]\n[00:01.00]WEB_FIRST\n[00:05.00]WEB_SECOND\n[00:10.00]WEB_THIRD';
        if(operation==='search') {
          if(mode==='relaxed' && !data.relaxed) return {url:'https://html.duckduckgo.com/html/',text:'<div class="no-results">No results found</div>',contentType:'text/html'};
          if(mode==='captcha') return {url:'https://html.duckduckgo.com/html/',text:'<form id="challenge-form" action="anomaly.js">captcha</form>',contentType:'text/html'};
          if(mode==='unknown') return {url:'https://html.duckduckgo.com/html/',text:'<html>Service unavailable</html>',contentType:'text/html'};
          return {url:'https://html.duckduckgo.com/html/',text:'<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Flyrics.example%2Fpage">Web Test Song lyrics</a>',contentType:'text/html'};
        }
        if(mode==='inline') return {url:data.url,contentType:'text/html',text:'<html><title>Web Test Song - Web Test Artist</title><script>window.untrustedScriptRan=true</script><img src="https://untrusted.invalid/pixel"><pre>'+text+'</pre></html>'};
        if(mode==='download' && data.url.endsWith('/page')) return {url:data.url,contentType:'text/html',text:'<title>Web Test Song - Web Test Artist</title><a href="/download?id=7" download="song.lrc">下载 LRC 歌词</a>'};
        return {url:data.url,contentType:'text/plain',text:mode==='wrong'?text.replace('Web Test Artist','Different Artist'):text};
      }};
    }, mode);
    await page.evaluate(id=>window.companion.selectSession(id),id);
  }
  for(const mode of ['direct','inline','relaxed','download']) {
    await scenario(mode);
    await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('WEB_FIRST'),null,{timeout:15000});
    assert.match(await page.locator('.lyrics-panel').getAttribute('data-source'), /网页 LRC/);
    assert.equal(await page.evaluate(()=>window.untrustedScriptRan), undefined);
    const calls=await page.evaluate(()=>window.testCalls);
    assert.equal(calls.filter(c=>c.provider==='web'&&c.operation==='get').length,mode==='download'?2:1);
    assert.equal(calls.filter(c=>c.provider==='web'&&c.operation==='search').length,mode==='relaxed'?2:1);
  }
  await page.getByRole('button',{name:'选择歌词版本'}).click();
  assert.match(await page.locator('.candidates').innerText(),/lyrics.example\/download\?id=7/);
  await page.screenshot({path:'test-results/native/web-lyrics-source.png'});
  await scenario('main');
  await page.waitForFunction(()=>document.querySelector('.lyrics-panel')?.getAttribute('data-source')?.includes('QQ 音乐'),null,{timeout:15000});
  assert.equal((await page.evaluate(()=>window.testCalls)).filter(c=>c.provider==='web').length,0);
  for(const [mode,message] of [['wrong','各来源未找到匹配的同步歌词'],['captcha','DuckDuckGo 需要验证码'],['unknown','DuckDuckGo 未返回可解析']]) {
    await scenario(mode); await page.getByText(message,{exact:false}).waitFor({timeout:15000});
    assert.equal(await page.locator('.lyric-player').count(),0);
  }
  await scenario('cancel');
  await page.waitForFunction(()=>window.testCalls.some(c=>c.provider==='web'));
  fixture.stdin.write('next\n');
  await page.getByRole('heading',{name:'夜色慢慢落下',exact:true}).waitFor();
  await page.waitForTimeout(3500);
  assert.equal(await page.locator('.lyric-player').count(),0);
  // Exercise the real native boundary separately from mocked search pages.
  const refused=await page.evaluate(async()=>{try{await window.nativeProviderQuery({requestId:crypto.randomUUID(),provider:'web',operation:'get',data:{url:'http://127.0.0.1/private.lrc'}});return false;}catch{return true;}});
  assert.equal(refused,true);
  console.log('PASS: direct LRC, inert inline HTML, download button, source provenance, main-source quality preference, final-only fallback, identity rejection, captcha/invalid response reporting, cancellation, native local URL rejection');
} catch(e) { if(page){console.log(await page.locator('body').innerText());await page.screenshot({path:'test-results/native/web-failure.png'});}throw e; }
finally { fixture?.stdin.end(); if(page)await page.evaluate(()=>window.companion.window('close')).catch(()=>{}); await browser?.close();host.kill();fixture?.kill(); }
