import test from 'node:test';
import assert from 'node:assert/strict';
import {compatibleSongs,canAutoSelect,searchProvider,getProviderLyrics,providerRequest} from '../shared/provider-lyrics.mjs';
const music={musicName:'七里香',artists:['周杰倫'],albumName:'七里香',duration:297000};
const row={provider_name:'netease',provider_id:'1',title:'七里香',artists:[{name:'周杰伦'}],album:'七里香',duration:297500};
const data={lineTimed:false,lines:[1000,2000].map(startTime=>({startTime,endTime:startTime+1000,words:[{word:'sample',startTime,endTime:startTime+1000}]}))};
test('cross-source matching excludes covers and incompatible recordings',()=>{
 const items=compatibleSongs([row,{...row,provider_id:'2',artists:[{name:'Cover Artist'}]}],'netease',music);
 assert.equal(items.length,1); assert.equal(canAutoSelect(items[0],music),true);
 assert.equal(canAutoSelect({...items[0],albumNames:['Live']},music),false);
 assert.equal(canAutoSelect({...items[0],duration:330000},music),false);
});
test('a missing lyric entry does not block another recording in the same source',async()=>{
 let count=0; const r=await searchProvider('netease',music,new AbortController().signal,async(p,op)=>{
 if(op==='search')return [row,{...row,provider_id:'2'}];
 if(++count===1)throw Error('no lyrics');return data;});
 assert.equal(r.match.id,'netease:2'); assert.match(r.match.resolvedLyrics.source,/逐行/);
});
test('untimed and malformed responses cannot become synchronized lyrics',async()=>{
 for(const payload of [{lines:[]},{lines:[{startTime:0,endTime:0,words:[]}]},{lines:[{startTime:1000,endTime:500,words:[]}]}]){
 await assert.rejects(getProviderLyrics({source:'netease'},new AbortController().signal,async()=>payload));}
});
test('track change cancels native work and rejects stale results',async()=>{
 const c=new AbortController();let canceled=false,resolve;
 const pending=providerRequest('netease','search',{},c.signal,{providerQuery:()=>new Promise(r=>resolve=r),cancelProvider:async()=>{canceled=true;}});
 c.abort();resolve([]);await assert.rejects(pending,{name:'AbortError'});assert.equal(canceled,true);
});
