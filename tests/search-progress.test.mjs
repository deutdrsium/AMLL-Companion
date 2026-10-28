import test from 'node:test';
import assert from 'node:assert/strict';
import {searchProgressively} from '../shared/lyrics-pipeline.mjs';
import {memoizeSearchRequest,eachSearchQuery} from '../shared/search-work.mjs';
import {searchProvider} from '../shared/provider-lyrics.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const music={musicName:'Song',artists:['Artist'],albumName:'Album',duration:100000};
const line={startTime:1000,endTime:3000,words:[{word:'First lyric',startTime:1000,endTime:3000}]};
const fast={id:'fast',resolvedLyrics:{lines:[line]}};
const best={id:'best',resolvedLyrics:{lines:[{...line,words:[{word:'Better',startTime:1000,endTime:1500},{word:'lyric',startTime:1600,endTime:3000}]}]}};
test('usable lyrics publish before metadata and slow sources, while final quality still wins',async()=>{
 const metadataGate=deferred(),slowGate=deferred(),first=deferred();let updates=0,webCalls=0;
 const pending=searchProgressively(music,new AbortController().signal,{
  metadata:async()=>{await metadataGate.promise;return {music,message:''};},
  sources:[async()=>({items:[fast],match:fast}),async()=>{await slowGate.promise;return {items:[best],match:best};}],
  web:async()=>{webCalls++;return {items:[],match:null};},onProgress:r=>{updates++;if(r.match)first.resolve(r);},
 });
 assert.equal((await first.promise).match.id,'fast');assert.equal(updates,1);
 metadataGate.resolve();slowGate.resolve();const final=await pending;
 assert.equal(final.match.id,'best');assert.equal(webCalls,0);
});
test('early verified names start searches before release enrichment and duplicate waves reuse requests',async()=>{
 const gate=deferred(),first=deferred(),queries=[];let requestCount=0;
 const request=memoizeSearchRequest(async(key,signal)=>{signal.throwIfAborted();requestCount++;return [fast];});
 const corrected={...music,musicName:'原文',titleAliases:['Song']};
 const pending=searchProgressively(music,new AbortController().signal,{
  metadata:async(_,s,update)=>{update({music:corrected,message:'names'});await gate.promise;return {music:{...corrected,metadataReleaseRegion:'JP'},message:'region'};},
  sources:[async(track,s)=>{queries.push(track.musicName);await request('shared',s);first.resolve();return {items:[fast],match:fast};}],
  web:async()=>{throw Error('unexpected web');},
 });
 await first.promise;assert.deepEqual(queries,['原文']);gate.resolve();await pending;assert.equal(requestCount,1);
});
test('cancelled track cannot publish a late metadata update or lyric result',async()=>{
 const gate=deferred(),started=deferred();const controller=new AbortController();let published=0;
 const pending=searchProgressively(music,controller.signal,{
  metadata:async()=>({music,message:''}),sources:[async()=>{started.resolve();await gate.promise;return {items:[fast],match:fast};}],
  web:async()=>({items:[],match:null}),onProgress:()=>published++,
 });
 await started.promise;controller.abort();gate.resolve();await assert.rejects(pending,{name:'AbortError'});assert.equal(published,0);
});
test('expanded metadata can revoke an earlier match and must still permit the web fallback',async()=>{
 const gate=deferred(),first=deferred();let webCalls=0;
 const pending=searchProgressively(music,new AbortController().signal,{
  metadata:async()=>{await gate.promise;return {music:{...music,titleAliases:['原文']},message:''};},
  sources:[async track=>({items:[fast],match:track.titleAliases?null:fast})],
  web:async()=>{webCalls++;return {items:[],match:null};},onProgress:r=>{if(r.match)first.resolve();},
 });
 await first.promise;gate.resolve();const result=await pending;assert.equal(result.match,null);assert.equal(webCalls,1);
});
test('alias concurrency is bounded and in-flight requests are shared',async()=>{
 let active=0,peak=0,calls=0;const seen=[];
 await eachSearchQuery([1,2,3,4,5],new AbortController().signal,async value=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));seen.push(value);active--;});
 assert.equal(peak,2);assert.deepEqual(seen.sort(),[1,2,3,4,5]);
 const request=memoizeSearchRequest(async()=>{calls++;return [1];});const signal=new AbortController().signal;
 await Promise.all([request('same',signal),request('same',signal)]);assert.equal(calls,1);
});
test('one slow candidate download does not delay another validated lyric from the same source',async()=>{
 const slow=deferred(),first=deferred();let calls=0;
 const pending=searchProvider('netease',music,new AbortController().signal,async(_,operation,data)=>{
  if(operation==='search')return ['fast','slow'].map(provider_id=>({provider_name:'netease',provider_id,title:'Song',artists:[{name:'Artist'}],album:'Album',duration:100000}));
  calls++;if(data.provider_id==='slow')await slow.promise;return {lines:[line,{...line,startTime:4000,endTime:5000}]};
 },result=>{if(result.match)first.resolve(result.match);});
 assert.equal((await first.promise).id,'netease:fast');slow.resolve();await pending;assert.equal(calls,2);
});

test('final selection combines translations from every eligible version, never unrelated items',async()=>{
 const word={id:'word',resolvedLyrics:{source:'word source',lines:[{...line,words:[{word:'First ',startTime:1000,endTime:2000},{word:'lyric',startTime:2000,endTime:3000}]}]}};
 const donor={id:'donor',resolvedLyrics:{source:'translation source',lines:[{...line,translatedLyric:'正确翻译'}]}};
 const unrelated={id:'unrelated',resolvedLyrics:{lines:[{...line,translatedLyric:'错误翻译'}]}};
 const result=await searchProgressively(music,new AbortController().signal,{
  metadata:async()=>({music}),sources:[async()=>({items:[word],eligible:[word],match:word}),async()=>({items:[unrelated,donor],eligible:[donor],match:donor})],web:async()=>{throw Error('unexpected');},
 });
 assert.equal(result.match.id,'word');assert.equal(result.match.resolvedLyrics.lines[0].translatedLyric,'正确翻译');
 assert.match(result.match.resolvedLyrics.source,/translation source/);assert.equal(word.resolvedLyrics.lines[0].translatedLyric,undefined);
 assert.equal(result.items.find(s=>s.id==='word').resolvedLyrics.lines[0].translatedLyric,'正确翻译');
});
