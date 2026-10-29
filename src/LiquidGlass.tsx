import {Fragment, useId, useLayoutEffect, useState} from 'react';
import {glassSample} from '../shared/glass-optics.mjs';

type Lens={id:string;map:string;scale:number;blur:number;width:number;height:number;dispersion:boolean};

// Edge-normal displacement, as used by the surveyed SVG glass implementations.
// Build only on geometry changes; Chromium composites the live backdrop itself.
function edgeMap(width:number,height:number,radius:number,power:number){
  const ratio=Math.min(devicePixelRatio,1.5,1280/width,960/height);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(2,Math.round(width*ratio));canvas.height=Math.max(2,Math.round(height*ratio));
  const context=canvas.getContext('2d')!;
  const pixels=context.createImageData(canvas.width,canvas.height);
  const rim=context.createImageData(canvas.width,canvas.height);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const sample=glassSample((x+.5)/ratio,(y+.5)/ratio,width,height,radius,power);
    const i=(y*canvas.width+x)*4;
    pixels.data[i]=Math.round(127.5+sample.dx*127.5);
    pixels.data[i+1]=Math.round(127.5+sample.dy*127.5);
    pixels.data[i+2]=128;pixels.data[i+3]=255;
    rim.data[i]=rim.data[i+1]=rim.data[i+2]=sample.light>0?255:0;
    rim.data[i+3]=Math.round(Math.abs(sample.light)*255*Math.max(0,Math.min(1,.5-sample.distance*ratio)));
  }
  context.putImageData(pixels,0,0);
  const map=canvas.toDataURL();
  context.putImageData(rim,0,0);
  return {map,rim:canvas.toDataURL()};
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
        const style=getComputedStyle(element),radius=parseFloat(style.borderTopLeftRadius)||24;
        const power=CSS.supports('corner-shape','superellipse(1.5)')?2**1.5:2;
        const size=`${width}:${height}:${radius}:${devicePixelRatio}`;
        if(known.get(element)?.size===size)return;
        const id=`glass-${prefix}-${index}`;
        const maps=edgeMap(width,height,radius,power);
        known.set(element,{size,lens:{id,map:maps.map,width,height,dispersion:height<100,scale:element.matches('dialog')?28:36,blur:parseFloat(style.getPropertyValue('--glass-blur'))||6}});
        element.style.setProperty('--glass-rim',`url("${maps.rim}")`);
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
      elements.forEach(element=>{element.style.removeProperty('--glass-refraction');element.style.removeProperty('--glass-rim');delete element.dataset.glassReady;});
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
    <filter key={lens.id} id={lens.id} filterUnits="userSpaceOnUse" x="0" y="0" width={lens.width} height={lens.height} colorInterpolationFilters="sRGB">
      <feImage href={lens.map} x="0" y="0" width={lens.width} height={lens.height} preserveAspectRatio="none" result="edge"/>
      {/* Blur before bending preserves the optical rim. Large surfaces avoid the RGB multipass cost. */}
      <feGaussianBlur in="SourceGraphic" stdDeviation={lens.blur} result="source"/>
      {lens.dispersion?<>
      {[0,1,2].map(channel=><Fragment key={channel}>
        <feDisplacementMap in="source" in2="edge" scale={lens.scale+channel*.6} xChannelSelector="R" yChannelSelector="G" result={`bend${channel}`}/>
        <feColorMatrix in={`bend${channel}`} type="matrix" values={`${channel===0?1:0} 0 0 0 0 0 ${channel===1?1:0} 0 0 0 0 0 ${channel===2?1:0} 0 0 0 0 0 1 0`} result={`channel${channel}`}/>
      </Fragment>)}
      <feBlend in="channel0" in2="channel1" mode="screen" result="rg"/>
      <feBlend in="rg" in2="channel2" mode="screen"/>
      </>:<feDisplacementMap in="source" in2="edge" scale={lens.scale} xChannelSelector="R" yChannelSelector="G"/>}
    </filter>)}</defs></svg>;
}
