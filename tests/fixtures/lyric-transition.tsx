import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LyricPlayer} from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';
import '../../src/style.css';
import {LiveLyrics} from '../../src/Playback';
import {PlaybackClock} from '../../shared/clock.mjs';

const diagnosticEvents:unknown[]=[];
if(new URLSearchParams(location.search).has('debug'))Object.assign(window,{
 diagnosticEvents,companion:{debug:true,diagnosticLog:(event:unknown)=>diagnosticEvents.push(event)},
});

const clock=new PlaybackClock();
clock.duration=180000;clock.base=65000;
let core:LyricPlayer;
const sync=LyricPlayer.prototype.setCurrentTime;
LyricPlayer.prototype.setCurrentTime=function(...args){core=this;return sync.apply(this,args);};
const make=(version:string)=>Array.from({length:30},(_,i)=>({startTime:i*5000,endTime:i*5000+4900,
 words:[{word:`${version} line ${i}`,startTime:i*5000,endTime:i*5000+4900}],translatedLyric:`译文 ${i}`,romanLyric:''}));
function Fixture(){
 const [lines,setLines]=useState(make('original'));
 const [reduceMotion,setReduceMotion]=useState(false),[mounted,setMounted]=useState(true);
 const [offset,setOffset]=useState(0),[translation,setTranslation]=useState(true);
 Object.assign(window,{transitionTest:{
  replace:(version:string)=>setLines(make(version)),motion:setReduceMotion,translation:setTranslation,
  unmount:()=>setMounted(false),offset:setOffset,
  seek:(time:number)=>{clock.base=time;clock.seekRevision++;},
  play:()=>{clock.anchor=performance.now();clock.playing=true;},
  current:()=>({time:core.getCurrentTime(),clock:clock.at(),first:core.getLyricLines()[0]?.words[0].word}),
 }});
 return <div style={{height:720,width:800,display:'flex'}}>{mounted&&<LiveLyrics clock={clock} lines={lines}
  offset={offset} playing={true} reduceMotion={reduceMotion} seek={()=>{}} authors="fixture"
  showTranslation={translation} showRomanization={true}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
