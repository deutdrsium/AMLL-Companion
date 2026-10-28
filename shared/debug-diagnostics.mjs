const api=()=>globalThis.window?.companion;

export function debugEvent(event,data={}){
  const bridge=api();
  if(bridge?.debug)bridge.diagnosticLog?.({event,atMs:Math.round(performance.now()),data});
}

export function debugSpan(event,data={}){
  if(!api()?.debug)return ()=>{};
  const started=performance.now();
  debugEvent(`${event}.start`,data);
  return (result={})=>debugEvent(`${event}.end`,{...data,...result,durationMs:Math.round((performance.now()-started)*10)/10});
}

export function startRendererDiagnostics(host=window){
  if(!host.companion?.debug)return ()=>{};
  const perf=host.performance,doc=host.document;
  const send=(event,data)=>host.companion.diagnosticLog({event,atMs:Math.round(perf.now()),data});
  let frames=0,slowFrames=0,maxFrameMs=0,lastFrame=0,started=perf.now(),longTasks=[];
  const reset=()=>{frames=0;slowFrames=0;maxFrameMs=0;lastFrame=0;started=perf.now();longTasks=[];};
  const frame=now=>{
    if(!doc.hidden){
      if(lastFrame){const gap=now-lastFrame;frames++;maxFrameMs=Math.max(maxFrameMs,gap);if(gap>50)slowFrames++;}
      lastFrame=now;
    }
    raf=host.requestAnimationFrame(frame);
  };
  let raf=host.requestAnimationFrame(frame);
  let observer;
  if(host.PerformanceObserver?.supportedEntryTypes.includes('longtask')){
    observer=new host.PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        // Keep the longest ten tasks in this interval, rather than logging every frame.
        longTasks.push({startMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration)});
        longTasks.sort((a,b)=>b.durationMs-a.durationMs);longTasks.length=Math.min(10,longTasks.length);
      }
    });
    observer.observe({entryTypes:['longtask']});
  }
  const report=()=>{
    const elapsed=perf.now()-started;
    send('renderer.sample',{windowMs:Math.round(elapsed),hidden:doc.hidden,
      fps:doc.hidden?null:Math.round(frames/Math.max(1,elapsed)*10000)/10,
      slowFramesOver50Ms:slowFrames,maxFrameMs:Math.round(maxFrameMs),longTasks,
      heapMiB:perf.memory?Math.round(perf.memory.usedJSHeapSize/1048576):null,
      width:host.innerWidth,height:host.innerHeight,devicePixelRatio:host.devicePixelRatio});
    // Keep lastFrame across reports so a stall spanning two windows is still measured.
    frames=0;slowFrames=0;maxFrameMs=0;longTasks=[];started=perf.now();
  };
  const interval=host.setInterval(report,5000);
  const visibility=()=>{send('renderer.visibility',{hidden:doc.hidden});reset();};
  const error=e=>send('renderer.error',{message:String(e.message||''),stack:String(e.error?.stack||'').slice(0,8000)});
  const rejection=e=>send('renderer.rejection',{message:String(e.reason?.stack||e.reason||'').slice(0,8000)});
  doc.addEventListener('visibilitychange',visibility);
  host.addEventListener('error',error);host.addEventListener('unhandledrejection',rejection);
  const stop=()=>{
    host.clearInterval(interval);host.cancelAnimationFrame(raf);observer?.disconnect();
    doc.removeEventListener('visibilitychange',visibility);
    host.removeEventListener('error',error);host.removeEventListener('unhandledrejection',rejection);
    host.removeEventListener('pagehide',stop);
  };
  host.addEventListener('pagehide',stop,{once:true});
  send('renderer.start',{userAgent:host.navigator.userAgent,longTaskObserver:!!observer});
  return stop;
}
