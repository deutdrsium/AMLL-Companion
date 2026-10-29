import {useId, useLayoutEffect, useState} from 'react';

type Lens={id:string;map:string;scale:number};

// Edge-normal displacement, as used by the surveyed SVG glass implementations.
// Build only on geometry changes; Chromium composites the live backdrop itself.
function edgeMap(width:number,height:number,radius:number){
  const ratio=Math.min(1,640/width,384/height);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(2,Math.round(width*ratio));canvas.height=Math.max(2,Math.round(height*ratio));
  const context=canvas.getContext('2d')!;
  const pixels=context.createImageData(canvas.width,canvas.height);
  const r=Math.min(radius,width/2,height/2),rim=Math.min(22,height*.23);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const px=(x+.5)/ratio-width/2,py=(y+.5)/ratio-height/2;
    const qx=Math.abs(px)-(width/2-r),qy=Math.abs(py)-(height/2-r);
    const ox=Math.max(qx,0),oy=Math.max(qy,0),length=Math.hypot(ox,oy);
    const distance=length+Math.min(Math.max(qx,qy),0)-r;
    let nx=0,ny=0;
    if(length>0){nx=ox/length;ny=oy/length;}
    else if(qx>qy)nx=1;else ny=1;
    const bend=Math.pow(Math.max(0,1-Math.max(0,-distance)/rim),2);
    const i=(y*canvas.width+x)*4;
    pixels.data[i]=Math.round(128+Math.sign(px)*nx*bend*112);
    pixels.data[i+1]=Math.round(128+Math.sign(py)*ny*bend*112);
    pixels.data[i+2]=128;pixels.data[i+3]=255;
  }
  context.putImageData(pixels,0,0);
  return canvas.toDataURL();
}

export function LiquidGlass({layout,reduceMotion}:{layout:string;reduceMotion:boolean}){
  const prefix=useId().replace(/[^a-zA-Z0-9_-]/g,''),[lenses,setLenses]=useState<Lens[]>([]);
  useLayoutEffect(()=>{
    const elements=[...document.querySelectorAll<HTMLElement>('.glass-surface')];
    const known=new Map<HTMLElement,{size:string;lens:Lens}>();
    let frame=0;
    const refresh=()=>{
      frame=0;
      elements.forEach((element,index)=>{
        const width=element.clientWidth,height=element.clientHeight;
        if(!width||!height)return;
        const radius=parseFloat(getComputedStyle(element).borderTopLeftRadius)||24;
        const size=`${width}:${height}:${radius}`;
        if(known.get(element)?.size===size)return;
        const id=`glass-${prefix}-${index}`;
        known.set(element,{size,lens:{id,map:edgeMap(width,height,radius),scale:element.matches('dialog')?10:16}});
        element.style.setProperty('--glass-refraction',`url("#${id}")`);
        element.dataset.glassReady='true';
      });
      setLenses([...known.values()].map(item=>item.lens));
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(refresh);};
    const observer=new ResizeObserver(schedule);
    elements.forEach(element=>observer.observe(element));refresh();
    return()=>{
      cancelAnimationFrame(frame);observer.disconnect();
      elements.forEach(element=>{element.style.removeProperty('--glass-refraction');delete element.dataset.glassReady;});
    };
  },[layout,prefix]);
  useLayoutEffect(()=>{
    if(reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    let frame=0;
    let surface:HTMLElement|null=null,x=50,y=0;
    const move=(event:PointerEvent)=>{
      const target=event.target as HTMLElement;
      surface=target.closest<HTMLElement>('.glass-surface')||(target.closest('.pill:not(.no-background)')?.querySelector<HTMLElement>('.pill-glass')??null);
      if(!surface)return;
      const rect=surface.getBoundingClientRect();
      x=Math.max(0,Math.min(100,(event.clientX-rect.x)/rect.width*100));
      y=Math.max(0,Math.min(100,(event.clientY-rect.y)/rect.height*100));
      if(!frame)frame=requestAnimationFrame(()=>{
        frame=0;surface?.style.setProperty('--glass-light-x',`${x.toFixed(1)}%`);
        surface?.style.setProperty('--glass-light-y',`${y.toFixed(1)}%`);
      });
    };
    document.addEventListener('pointermove',move,{passive:true});
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointermove',move);};
  },[reduceMotion]);
  return <svg className="glass-filters" aria-hidden="true"><defs>{lenses.map(lens=>
    <filter key={lens.id} id={lens.id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feImage href={lens.map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="edge"/>
      <feDisplacementMap in="SourceGraphic" in2="edge" scale={lens.scale} xChannelSelector="R" yChannelSelector="G"/>
    </filter>)}</defs></svg>;
}
