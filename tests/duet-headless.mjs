import {chromium} from 'playwright';
import {preview} from 'vite';
import assert from 'node:assert/strict';
const server=await preview({preview:{host:'127.0.0.1',port:5190,strictPort:true}});let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 await page.route('https://api.amll.dev/**',r=>r.fulfill({json:{status:200,data:{items:[]}}}));
 await page.route('https://lrclib.net/**',r=>r.fulfill({json:[]}));
 await page.route('https://itunes.apple.com/**',r=>r.fulfill({json:{resultCount:0,results:[]}}));
 await page.addInitScript(()=>{
  localStorage.clear();const music={musicId:'duet-test',musicName:'Duet Test',artists:['Singer A','Singer B'],albumName:'Album',duration:30000};
  const record={id:'11111111-1111-4111-8111-111111111111',title:music.musicName,length:30000,aliases:[],releases:[{title:'Album'}],
   'artist-credit':music.artists.map((name,i)=>({name,artist:{id:`22222222-2222-4222-8222-22222222222${i}`,name,aliases:[]}}))};
  window.companion={native:true,snapshot:async()=>({connected:true,error:'',music,cover:'',position:5000,clockAtSend:performance.now(),monotonicAt:5000,playing:false,rate:1,timelineRevision:1,repeat:'off',shuffle:false,controls:{},sessions:[]}),
   subscribe:()=>()=>{},windowState:async()=>({mode:'normal',topmost:false}),subscribeWindow:()=>()=>{},cancelProvider:async()=>{},
   providerQuery:async({provider,operation})=>{
    if(provider==='web')return {text:JSON.stringify({recordings:[record]})};
    if(!['qq','netease'].includes(provider))return [];
    if(provider==='netease')await new Promise(r=>setTimeout(r,700));
    if(operation==='search')return [{provider_name:provider,provider_id:provider,title:music.musicName,artists:music.artists.map(name=>({name})),album:'Album',duration:30000}];
    return {lines:['alpha one','beta two','gamma three'].map((text,i)=>({startTime:1000+i*4000,endTime:3500+i*4000,isBG:false,isDuet:provider==='netease'&&i===1,translatedLyric:'',romanLyric:'',
     words:provider==='qq'?text.split(' ').map((word,j)=>({word:word+(j?'':' '),startTime:1000+i*4000+j*1200,endTime:2000+i*4000+j*1200})):[{word:text,startTime:1000+i*4000,endTime:3500+i*4000}]}))};
   }};
 });
 await page.goto('http://127.0.0.1:5190');
 await page.waitForFunction(()=>document.querySelector('.lyrics-panel')?.getAttribute('data-source')?.includes('对唱补全'));
 await page.waitForFunction(()=>[...document.querySelectorAll('[class*="isDuetWrapper"]')].some(node=>node.textContent.includes('beta')));
 await page.getByRole('button',{name:'选择歌词版本',exact:true}).click();
 const selected=page.locator('.candidates button').filter({hasText:'当前使用'});
 assert.match(await selected.innerText(),/QQ 音乐.*对唱补全/);
 const details=await selected.locator('.lyric-details').innerText();
 assert.match(details,/逐词（100%）.*对唱/);assert.doesNotMatch(details,/翻译|音译|和声|：无|：有/);
 console.log('PASS automatic QQ word timing + NetEase duet marks reach the renderer; candidate capabilities contain only present features');
}finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
