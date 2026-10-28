import {chromium} from 'playwright';
import {preview} from 'vite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {normalize} from '../shared/matching.mjs';
import {correctionKey} from '../shared/metadata.mjs';
const fixture=JSON.parse(await readFile('test-results/journey-fixed.json','utf8'));
const server=await preview({preview:{host:'127.0.0.1',port:5191,strictPort:true}});let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 await page.route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await page.route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.route('https://itunes.apple.com/**',r=>r.fulfill({json:{resultCount:0,results:[]}}));
 await page.addInitScript(({music,songs,cacheEntryKey})=>{
  localStorage.clear();localStorage.setItem('metadata-alias-cache-v2',JSON.stringify([{key:cacheEntryKey,expires:Date.now()+86400000,
   metadata:{musicName:'ドント・ストップ・ビリーヴィン',artists:['ジャーニー'],titleAliases:[music.musicName],artistAliases:['Journey'],metadataReleaseRegion:'JP'}}]));
  const record={id:'93036a0a-0513-4d27-b384-4a5d9b674a37',title:music.musicName,length:250000,
   aliases:[{name:'ドント・ストップ・ビリーヴィン',locale:'ja',primary:true}],
   releases:[{title:'Escape',country:'US',date:'1981-07-17'},{title:music.albumName,country:'JP',date:'2022-01-01','text-representation':{language:'jpn'}}],
   'artist-credit':[{name:'Journey',artist:{id:'abd506e1-6f2b-4d6f-b937-92c267f6f88b',name:'Journey',aliases:[{name:'ジャーニー',locale:'ja',primary:true}]}}]};
  window.companion={native:true,snapshot:async()=>({connected:true,error:'',music,cover:'',position:24000,clockAtSend:performance.now(),monotonicAt:24000,playing:false,rate:1,timelineRevision:1,repeat:'off',shuffle:false,controls:{},sessions:[]}),
   subscribe:()=>()=>{},windowState:async()=>({mode:'normal',topmost:false}),subscribeWindow:()=>()=>{},cancelProvider:async()=>{},
   providerQuery:async({provider,operation,data})=>{
    if(provider==='web'){const url=new URL(data.url);return {text:JSON.stringify(url.pathname.endsWith('/recording')?{recordings:[record]}:record)};}
    const song=songs.find(s=>s.source===provider);if(!song)return [];
    if(provider==='qq')await new Promise(r=>setTimeout(r,200));
    if(provider==='netease')await new Promise(r=>setTimeout(r,500));
    return operation==='search'?[song.providerData]:{lines:song.resolvedLyrics.lines};
   }};
 },{...fixture,cacheEntryKey:correctionKey(fixture.music)+':248000'});
 await page.goto('http://127.0.0.1:5191');
 await page.waitForFunction(()=>document.querySelector('.lyrics-panel')?.getAttribute('data-source')?.includes('网易云音乐'));
 await page.waitForFunction(()=>[...document.querySelectorAll('[class*="lyricMainLine"]')].some(n=>n.textContent.includes('Just')));
 assert.equal(normalize(await page.locator('h1').innerText()),normalize(fixture.music.musicName));
 assert.equal(await page.locator('.track-info p').innerText(),'Journey');
 const main=await page.locator('[class*="lyricMainLine"]').allTextContents();
 assert.ok(main.length>0&&main.every(text=>!/[\u3400-\u9fff]/u.test(text)),'Chinese translations must not become main lyric rows');
 assert.match(await page.locator('.lyric-player').innerText(),/[\u3400-\u9fff]/u,'Chinese translation must still be visible');
 await page.getByRole('button',{name:'选择歌词版本',exact:true}).click();
 const current=await page.locator('.candidates button').filter({hasText:'当前使用'}).innerText();
 assert.match(current,/网易云音乐/);assert.match(current,/逐词.*翻译/);
 console.log('PASS Journey replay: poisoned old cache ignored, Japanese alias does not override English names, translated word version selected, English main and Chinese translation rendered separately');
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
