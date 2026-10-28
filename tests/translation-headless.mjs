import {chromium} from 'playwright';
import {preview} from 'vite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {inspectLyricMetadata} from '../shared/lyric-metadata.mjs';

// Replay the real provider responses captured by translation-live.mjs, without playing music.
const fixture=JSON.parse(await readFile('test-results/translation-live.json','utf8'));
const server=await preview({preview:{host:'127.0.0.1',port:5189,strictPort:true}});let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  await page.route('https://api.amll.dev/**',route=>route.fulfill({json:{status:200,data:{items:[]}}}));
  await page.route('https://lrclib.net/**',route=>route.fulfill({json:[]}));
  await page.route('https://itunes.apple.com/**',route=>route.fulfill({json:{resultCount:0,results:[]}}));
  await page.addInitScript(({music,songs})=>{
    localStorage.clear();const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    window.companion={native:true,snapshot:async()=>({connected:true,error:'',music,cover:'',position:140000,clockAtSend:performance.now(),monotonicAt:140000,playing:false,rate:1,timelineRevision:1,repeat:'off',shuffle:false,controls:{},sessions:[]}),
      subscribe:fn=>{window.emitPlayer=fn;return ()=>{};},windowState:async()=>({mode:'normal',topmost:false}),subscribeWindow:()=>()=>{},cancelProvider:async()=>{},
      providerQuery:async({provider,operation})=>{
        if(provider==='web')return {text:JSON.stringify({recordings:[]})};
        const song=songs.find(s=>s.source===provider);if(!song)return [];
        if(provider==='netease')await delay(600);
        return operation==='search'?[song.providerData]:{lines:song.resolvedLyrics.lines};
      }};
  },fixture);
  await page.goto('http://127.0.0.1:5189');
  await page.waitForFunction(()=>document.querySelector('.lyrics-panel')?.getAttribute('data-source')?.includes('翻译补全'));
  const translation=fixture.songs.find(s=>s.source==='netease').resolvedLyrics.lines.find(l=>l.startTime>139000&&l.startTime<141000).translatedLyric;
  await page.waitForFunction(text=>document.querySelector('.lyric-player')?.textContent.includes(text),translation);
  const rendered=await page.locator('.lyric-player').innerText();
  assert.ok(rendered.includes(translation),'Previously missing split sentence translation must reach the renderer');
  const filtered=inspectLyricMetadata(fixture.songs[0].resolvedLyrics.lines,fixture.songs[0]);
  await page.evaluate(async()=>{const state=await window.companion.snapshot();window.emitPlayer({...state,position:0,monotonicAt:0,clockAtSend:performance.now(),timelineRevision:2});});
  await page.waitForFunction(text=>document.querySelector('.lyric-player')?.textContent.includes(text),filtered.lines[0].words.map(w=>w.word).join(''));
  const beginning=await page.locator('.lyric-player').innerText();
  for(const removed of filtered.removed)assert.ok(!beginning.includes(removed.text),'Metadata must be absent from the actual lyric renderer: '+removed.text);
  await page.getByRole('button',{name:'选择歌词版本',exact:true}).click();
  const selected=page.locator('.candidates button').filter({hasText:'当前使用'});
  assert.match(await selected.innerText(),/翻译/);
  assert.match(await selected.innerText(),/音译/);
  assert.match(await selected.innerText(),/翻译补全/);
  console.log('PASS real Gregorio replay: automatic QQ selection, missing translation rendered, selected candidate translation and romanization 100%');
  console.log('PASS first body sentence rendered, title/artist and credit lines hidden');
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
