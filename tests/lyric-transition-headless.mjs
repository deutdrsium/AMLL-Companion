import {chromium} from 'playwright';
import {build,preview} from 'vite';
import assert from 'node:assert/strict';

const outDir='test-results/lyric-transition';
await build({build:{outDir,rollupOptions:{input:'tests/fixtures/lyric-transition.html'}}});
const server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:5193,strictPort:true}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const {enabled,scale} of [false,true].flatMap(enabled=>[1,1.5].map(scale=>({enabled,scale})))){
 const page=await browser.newPage({viewport:{width:1200,height:850},deviceScaleFactor:scale}),errors=[];
 page.setDefaultTimeout(10000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:5193/tests/fixtures/lyric-transition.html${enabled?'?debug':''}`,{waitUntil:'domcontentloaded'});
 const waitFor=version=>page.waitForFunction(v=>window.transitionTest?.current().first===`${v} line 0`,version);
 const settled=()=>page.waitForFunction(()=>{
  const el=document.querySelector('.lyric-player');
  return el&&Number(getComputedStyle(el).opacity)>0.999&&el.getAnimations().every(a=>a.playState==='finished');
 });
 await waitFor('original');
 await page.evaluate(()=>window.transitionTest.replace('better'));
 assert.equal(await page.evaluate(()=>window.transitionTest.current().first),'original line 0','Keep old lyrics during fade-out');
 await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.lyric-player')).opacity)<0.95);
 await waitFor('better');await settled();
 assert.equal(await page.evaluate(()=>window.transitionTest.current().time),65000,'Paused upgrade stays at current position');
 // Advance the clock without a React render: the wrapper's old time prop is now stale.
 await page.evaluate(()=>{
  window.latePositions=[];
  const sample=()=>{
   const root=document.querySelector('.lyric-player');
   const row=[...root.querySelectorAll('[class*="lyricLineWrapper"]')].find(el=>el.textContent.startsWith('late line 25'));
   if(row&&Number(getComputedStyle(root).opacity)>0.05){
    const rect=row.getBoundingClientRect();if(rect.height)window.latePositions.push(rect.top);
   }
   window.sampleFrame=requestAnimationFrame(sample);
  };
  window.sampleFrame=requestAnimationFrame(sample);
  window.transitionTest.seek(125000);window.transitionTest.replace('late');
 });
 await waitFor('late');await settled();
 await page.waitForTimeout(250);
 const positions=await page.evaluate(()=>{cancelAnimationFrame(window.sampleFrame);return window.latePositions;});
 assert.ok(positions.length>3,'Measure visible positions during fade-in');
 assert.ok(Math.max(...positions)-Math.min(...positions)<8,`New active row must not scroll from the old position: ${Math.max(...positions)-Math.min(...positions)}px`);
 assert.equal(await page.evaluate(()=>window.transitionTest.current().time),125000);
 const rebuild=await page.evaluate(()=>window.rebuilds.at(-1));
 assert.equal(rebuild.initialTime,rebuild.expected,'Rebuild must start at the live clock, not the previous React timestamp');
 await page.evaluate(()=>{window.transitionTest.seek(80000);window.transitionTest.offset(500);});
 await page.waitForFunction(()=>window.transitionTest.current().time===80500);
 await page.evaluate(()=>{window.transitionTest.play();window.transitionTest.replace('playing');});
 await waitFor('playing');await settled();
 const position=await page.evaluate(()=>window.transitionTest.current());
 assert.ok(Math.abs(position.time-position.clock-500)<80,'Playing upgrade follows live clock and offset');
 await page.evaluate(()=>window.transitionTest.replace('superseded'));
 await page.evaluate(()=>window.transitionTest.replace('latest'));
 await waitFor('latest');await settled();
 await page.evaluate(()=>window.transitionTest.motion(true));
 await page.evaluate(()=>window.transitionTest.replace('reduced'));
 await waitFor('reduced');
 assert.equal(await page.locator('.lyric-player').evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length),0,'Reduced motion skips the fade');
 await page.evaluate(()=>window.transitionTest.translation(false));
 await page.waitForFunction(()=>!document.querySelector('.lyric-player')?.textContent.includes('译文'));
 await page.evaluate(()=>{window.transitionTest.motion(false);window.transitionTest.replace('cancelled');});
 await page.evaluate(()=>window.transitionTest.unmount());
 await page.waitForTimeout(400);
 assert.equal(await page.locator('.lyric-player').count(),0);
 assert.deepEqual(errors,[]);
 const rebuilds=await page.evaluate(()=>window.rebuilds);
 assert.ok(rebuilds.every(r=>Math.abs(r.initialTime-r.expected)<80),'All rebuilds must use the current position, including playing and offset changes');
 if(enabled){
  const events=await page.evaluate(()=>window.diagnosticEvents);
  assert.ok(events.some(e=>e.event==='lyrics.rebuild.start'));
  assert.ok(events.some(e=>e.event==='lyrics.rebuild.end'&&e.data.durationMs>=0));
  assert.ok(events.some(e=>e.event==='lyrics.render'));
 }
 console.log(`PASS lyric transition (${enabled?'debug':'normal'}, DPR ${scale}): fade, current position, playback, offset, superseded updates, reduced motion, translation and unmount`);
 await page.close();
 }
}catch(error){console.error(error);throw error;}
finally{await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
