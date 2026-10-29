import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {LyricLine} from '@applemusic-like-lyrics/core';
import {PlaybackClock} from '../shared/clock.mjs';

export function PillLyrics({clock,lines,offset,showTranslation,status}: {
  clock:PlaybackClock; lines:LyricLine[]; offset:number; showTranslation:boolean; status:string;
}) {
  const rows=useMemo(()=>lines.filter(line=>!line.isBG&&line.words.some(word=>word.word.trim())),[lines]);
  const indexAt=()=>{
    const time=clock.at()+offset;
    let index=-1;
    for(let i=0;i<rows.length&&rows[i].startTime<=time;i++)index=i;
    return index;
  };
  const [index,setIndex]=useState(indexAt);
  const current=rows[index],next=rows[index+1];
  const text=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let frame=0;
    let lastIndex=indexAt();
    setIndex(lastIndex);
    const render=()=>{
      const value=indexAt();
      if(value!==lastIndex){lastIndex=value;setIndex(value);}
      if(text.current&&current){
        const time=clock.at()+offset;
        current.words.forEach((word,i)=>{
          const progress=Math.max(0,Math.min(1,(time-word.startTime)/Math.max(1,word.endTime-word.startTime)));
          (text.current!.children[i] as HTMLElement)?.style.setProperty('--sung',`${progress*100}%`);
        });
      }
      frame=requestAnimationFrame(render);
    };
    render();return()=>cancelAnimationFrame(frame);
  },[clock,rows,offset,current]);
  useLayoutEffect(()=>{
    const element=text.current;
    if(!element)return;
    const fit=()=>{
      element.style.fontSize='';
      const size=parseFloat(getComputedStyle(element).fontSize);
      if(element.scrollWidth>element.clientWidth)
        element.style.fontSize=`${Math.max(16,size*element.clientWidth/element.scrollWidth)}px`;
    };
    fit();const observer=new ResizeObserver(fit);observer.observe(element);
    return()=>observer.disconnect();
  },[current,status]);
  return <div className="pill-lyrics" aria-label="悬浮同步歌词">
    <div key={current?.startTime??'waiting'} className="pill-current-block">
      <div className="pill-current" ref={text}>
        {current?current.words.map((word,i)=><span key={i}>{word.word}</span>):status}
      </div>
      {showTranslation&&current?.translatedLyric&&<div className="pill-translation">{current.translatedLyric}</div>}
    </div>
    <div className="pill-next" aria-label="下一句">{next?.words.map(word=>word.word).join('')||''}</div>
  </div>;
}
