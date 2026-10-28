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
test('青花瓷 can auto-select while SMTC duration is still missing',()=>{
 const track={musicName:'青花瓷',artists:['周杰倫'],albumName:'我很忙',duration:0};
 const [song]=compatibleSongs([{...row,provider_name:'kugou',title:'青花瓷',album:'我很忙',duration:239000}],'kugou',track);
 assert.equal(canAutoSelect(song,track),true);
 assert.equal(canAutoSelect(song,{...track,albumName:''}),false);
 assert.equal(canAutoSelect(song,{...track,duration:180000}),false);
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
test('credit-only QRC is not preferred over a complete lyric',async()=>{
 const song={source:'qq',musicNames:['Test Song'],artistNames:['Test Artist']};
 const lines=['Test Song - Test Artist','Lyrics by：Writer','Composed by：Composer','Produced by：Producer'].map((word,i)=>({startTime:i*1000,endTime:(i+1)*1000,words:[{word,startTime:i*1000,endTime:(i+1)*1000}]}));
 await assert.rejects(getProviderLyrics(song,new AbortController().signal,async()=>({lines})),/没有歌词正文/);
});
test('track change cancels native work and rejects stale results',async()=>{
 const c=new AbortController();let canceled=false,resolve;
 const pending=providerRequest('netease','search',{},c.signal,{providerQuery:()=>new Promise(r=>resolve=r),cancelProvider:async()=>{canceled=true;}});
 c.abort();resolve([]);await assert.rejects(pending,{name:'AbortError'});assert.equal(canceled,true);
});

test('malformed catalogue rows do not discard valid results; malformed payloads remain errors',async()=>{
 const rows=[null,{}, {...row,provider_id:''}, {...row,artists:[null,{name:'周杰伦'}]}];
 assert.equal(compatibleSongs(rows,'netease',music).length,1);
 await assert.rejects(searchProvider('netease',music,new AbortController().signal,async()=>({error:'bad payload'})),/无效搜索结果/);
});

test('loaded catalogue versions are reused across aliases and the final comparison',async()=>{
 let reads=0;const lineData={...data,lines:data.lines.map(line=>({...line,words:line.words.map(word=>({...word}))}))};
 for(const line of lineData.lines){const words=line.words;Object.defineProperty(line,'words',{get(){reads++;return words;}});}
 const track={...music,titleAliases:['七里香别名']};let firstReads=0,emitted=0;
 const result=await searchProvider('netease',track,new AbortController().signal,async(_p,op)=>op==='search'?[row]:lineData,
  update=>{if(update.match&&++emitted===1)firstReads=reads;});
 assert.ok(result.match);assert.ok(emitted>=2);
 assert.equal(reads,firstReads,'Final comparison must reuse the parsed candidate and its score');
});

test('negative and reversed word times are rejected before reaching the lyric renderer',async()=>{
 for(const changes of [{startTime:-1,endTime:2000},{startTime:1800,endTime:1500}]){
  const lines=data.lines.map(line=>({...line,words:line.words.map(word=>({...word}))}));
  Object.assign(lines[0].words[0],changes);
  await assert.rejects(getProviderLyrics({source:'netease'},new AbortController().signal,async()=>({lines})),/没有同步歌词/);
 }
});
