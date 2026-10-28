import {chromium} from 'playwright';
import {preview} from 'vite';
import assert from 'node:assert/strict';
const server=await preview({preview:{host:'127.0.0.1',port:5187,strictPort:true}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:850}});
 page.on('pageerror',error=>console.log('PAGE ERROR',error.message));
 await page.route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await page.route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.addInitScript(()=>{
  localStorage.setItem('automatic-alignment','false');
  const subscribers=new Set();window.fakeCalls=[];
  window.fakeState={connected:true,error:'',music:{musicId:'test',musicName:'Starry Starry',artists:['hifumi'],albumName:'Starry Starry',duration:257301},
   cover:'',position:1000,monotonicAt:1000,clockAtSend:performance.now(),lastUpdatedTime:'',timelineRevision:1,playing:false,rate:1,repeat:'off',shuffle:false,
   controls:{play:true,pause:true,seek:true,next:true,previous:true,shuffle:true,repeat:true},source:'Apple Music fixture',sessions:[],selectedSession:'fixture',selection:'auto'};
  window.changeTestTrack=()=>{window.fakeState={...window.fakeState,music:{...window.fakeState.music,musicName:'Another Track'},clockAtSend:performance.now()};subscribers.forEach(fn=>fn(window.fakeState));};
  const record=()=>({id:'11111111-1111-4111-8111-111111111111',title:window.fakeState.music.musicName,length:257301,aliases:[],releases:[{title:'Starry Starry'}],
    'artist-credit':[{name:'Hifumi',artist:{id:'9a480ba9-4b92-4096-92de-534f644d2dcc',name:'一二三',aliases:[{name:'Hifumi',type:'Artist name'}]}}]});
  window.companion={native:true,snapshot:async()=>window.fakeState,subscribe:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);},
   windowState:async()=>({mode:'normal',topmost:false}),subscribeWindow:()=>()=>{},window:async()=>({mode:'normal',topmost:false}),
   cancelProvider:async()=>{},alignmentStatus:async()=>({available:false}),command:async()=>{},selectSession:async()=>{},
   providerQuery:async request=>{
    window.fakeCalls.push(request);
    if(request.provider==='web'){
     const url=new URL(request.data.url||'https://example.org/');
     if(url.hostname==='musicbrainz.org'){
      const result={text:JSON.stringify(url.pathname.endsWith('/recording')?{recordings:[record()]}:record())};
      if(window.delayMetadata)return new Promise(resolve=>window.finishMetadata=()=>resolve(result));
      return result;
     }
     return {text:'no-results',url:'https://html.duckduckgo.com/'};
    }
    if(request.provider!=='netease')return [];
    if(request.operation==='search')return [{provider_name:'netease',provider_id:'test',title:request.data.title,
      artists:[{name:request.data.title==='手动歌名'?'手动歌手':'一二三'}],album:'Starry Starry',duration:257301}];
    return {lines:['First sung line','Second sung line','Third sung line'].map((word,i)=>({startTime:1000+i*5000,endTime:4000+i*5000,
      words:[{word,startTime:1000+i*5000,endTime:4000+i*5000}],translatedLyric:'',romanLyric:'',isBG:false,isDuet:false}))};
   }};
 });
 await page.goto('http://127.0.0.1:5187',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.track-info p')?.textContent==='一二三');
 await page.waitForFunction(()=>document.querySelector('.lyric-player')?.textContent.includes('First sung line'));
 assert.equal(await page.evaluate(()=>window.fakeState.music.artists[0]),'hifumi');
 await page.reload();await page.waitForFunction(()=>document.querySelector('.track-info p')?.textContent==='一二三');
 assert.equal(await page.evaluate(()=>window.fakeCalls.filter(r=>r.provider==='web').length),0,'Cache must avoid a second metadata lookup');
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('.metadata-editor summary').click();
 assert.equal(await page.getByRole('textbox',{name:'纠正歌手',exact:true}).inputValue(),'一二三');
 await page.getByRole('textbox',{name:'纠正歌名',exact:true}).fill('手动歌名');await page.getByRole('textbox',{name:'纠正歌手',exact:true}).fill('手动歌手');
 await page.getByRole('button',{name:'保存并重新检索',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='手动歌名');
 await page.reload();await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='手动歌名');
 assert.equal(await page.locator('.track-info p').innerText(),'手动歌手');
 assert.equal(await page.evaluate(()=>window.fakeCalls.filter(r=>r.provider==='web').length),0);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('.metadata-editor summary').click();
 await page.getByRole('button',{name:'清除手动纠正',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Starry Starry'&&document.querySelector('.track-info p')?.textContent==='一二三');
 await page.evaluate(()=>{window.delayMetadata=true;window.changeTestTrack();});
 await page.waitForFunction(()=>!!window.finishMetadata);
 await page.locator('.metadata-editor summary').click();
 await page.getByRole('textbox',{name:'纠正歌手',exact:true}).fill('正在编辑的歌手');
 await page.evaluate(()=>{window.delayMetadata=false;window.finishMetadata();});
 await page.waitForFunction(()=>document.querySelector('.track-info p')?.textContent==='一二三');
 assert.equal(await page.getByRole('textbox',{name:'纠正歌手',exact:true}).inputValue(),'正在编辑的歌手','Late metadata must not overwrite a user draft');
 await page.screenshot({path:'test-results/metadata-settings.png'});
 console.log('PASS headless: automatic aliases, matching lyric, raw SMTC intact, cached reload, manual save/reload/clear, late-metadata draft protection');
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
