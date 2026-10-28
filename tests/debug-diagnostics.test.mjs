import test from 'node:test';
import assert from 'node:assert/strict';
import {debugEvent,debugSpan,startRendererDiagnostics} from '../shared/debug-diagnostics.mjs';

test('normal mode installs no observers, timers or listeners and sends no diagnostics',()=>{
 const host=new Proxy({companion:{debug:false}}, {get(target,key){if(key==='companion')return target.companion;throw Error(`Unexpected normal-mode access: ${String(key)}`);}});
 startRendererDiagnostics(host)();
 globalThis.window={companion:{debug:false,diagnosticLog:()=>assert.fail('Normal mode must not send logs')}};
 try{debugEvent('test');debugSpan('test')();}finally{delete globalThis.window;}
});

test('debug spans record paired operation timing and results',()=>{
 const events=[];globalThis.window={companion:{debug:true,diagnosticLog:event=>events.push(event)}};
 try{const finish=debugSpan('lyrics.test',{id:1});finish({status:'cancelled'});}
 finally{delete globalThis.window;}
 assert.deepEqual(events.map(e=>e.event),['lyrics.test.start','lyrics.test.end']);
 assert.equal(events[1].data.status,'cancelled');assert.equal(events[1].data.id,1);
 assert.ok(events[1].data.durationMs>=0);
});

test('debug sampler reports stalls, long tasks and memory, excludes hidden time and cleans up',()=>{
 const events=[],listeners=new Map(),docListeners=new Map();let now=0,frame,interval,observe,disconnected=false,cleared=false,cancelled=false;
 const host={companion:{debug:true,diagnosticLog:e=>events.push(e)},performance:{now:()=>now,memory:{usedJSHeapSize:20*1048576}},
  navigator:{userAgent:'fixture'},document:{hidden:false,addEventListener:(k,v)=>docListeners.set(k,v),removeEventListener:k=>docListeners.delete(k)},
  innerWidth:1200,innerHeight:850,devicePixelRatio:1,
  requestAnimationFrame:fn=>{frame=fn;return 1;},cancelAnimationFrame:()=>{cancelled=true;},
  setInterval:(fn,ms)=>{assert.equal(ms,5000);interval=fn;return 1;},clearInterval:()=>{cleared=true;},
  addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),
  PerformanceObserver:class{static supportedEntryTypes=['longtask'];constructor(fn){observe=fn;}observe(){}disconnect(){disconnected=true;}}
 };
 const stop=startRendererDiagnostics(host);
 frame(10);frame(26);frame(200);
 observe({getEntries:()=>Array.from({length:15},(_,i)=>({startTime:i*50,duration:50+i}))});
 now=5000;interval();
 const sample=events.find(e=>e.event==='renderer.sample').data;
 assert.equal(sample.slowFramesOver50Ms,1);assert.equal(sample.maxFrameMs,174);assert.equal(sample.heapMiB,20);
 assert.equal(sample.longTasks.length,10);assert.equal(sample.longTasks[0].durationMs,64);
 // A stall crossing a report boundary must still be visible in the following report.
 frame(10000);now=10000;interval();
 assert.equal(events.at(-1).data.maxFrameMs,9800);
 host.document.hidden=true;docListeners.get('visibilitychange')();frame(15000);now=15000;interval();
 assert.equal(events.at(-1).data.fps,null);assert.equal(events.at(-1).data.maxFrameMs,0);
 listeners.get('error')({message:'fixture error',error:{stack:'stack'}});
 listeners.get('unhandledrejection')({reason:Error('rejected')});
 assert.equal(events.at(-2).event,'renderer.error');assert.match(events.at(-1).data.message,/rejected/);
 stop();assert.ok(disconnected&&cleared&&cancelled);assert.equal(listeners.size,0);assert.equal(docListeners.size,0);
});
