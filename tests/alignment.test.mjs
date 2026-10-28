import test from 'node:test';
import assert from 'node:assert/strict';
import {audioCandidates,lyricLanguage,alignInBackground} from '../shared/alignment.mjs';
const music={musicName:'Test',artists:['Artist'],albumName:'Album',duration:100000};
const song={source:'netease',providerData:{provider_id:'1'},musicNames:['Test'],artistNames:['Artist'],albumNames:['Album'],duration:100000};
const lines=[{startTime:1000,endTime:3000,words:[{word:'Hello world',startTime:1000,endTime:3000}],translatedLyric:'翻译',romanLyric:'',isBG:false,isDuet:false}];
test('audio matching rejects a different artist or recording and unsupported sources',()=>{
 assert.equal(audioCandidates([song,{...song,duration:30000},{...song,artistNames:['Other']},{...song,source:'web'}],music).length,1);
 assert.equal(lyricLanguage([{words:[{word:'こんにちは'}]}]),'ja');
 assert.equal(lyricLanguage([{words:[{word:'普通歌词'}]}]),'zh');
 assert.equal(lyricLanguage([{words:[{word:'Hello'}]}]),'auto');
});
test('verified aliases reach the final audio metadata check without accepting unrelated artists',()=>{
 const track={...music,musicName:'原文歌名',artists:['一二三'],titleAliases:['Test'],artistAliases:['hifumi']};
 const [candidate]=audioCandidates([{...song,artistNames:['hifumi']},{...song,artistNames:['Other']}],track);
 assert.ok(candidate.titles.includes('原文歌名')&&candidate.titles.includes('Test'));
 assert.ok(candidate.artists.includes('一二三')&&candidate.artists.includes('hifumi'));
 assert.equal(audioCandidates([{...song,artistNames:['Other']}],track).length,0);
});
test('cancellation rejects a late alignment and unsubscribes progress',async()=>{
 let resolve,started;const ready=new Promise(r=>started=r);let canceled=false,removed=false;
 const bridge={alignmentStatus:async()=>({available:true}),subscribeAlignment:()=>()=>{removed=true;},cancelAlignment:async()=>{canceled=true;},alignLyrics:()=>{started();return new Promise(r=>resolve=r);}};
 const controller=new AbortController();const pending=alignInBackground(music,lines,[song],controller.signal,()=>{},bridge);
 await ready;controller.abort();resolve({lines,alignedLines:1});await assert.rejects(pending,{name:'AbortError'});assert.ok(canceled&&removed);
});
test('alignment cannot silently change lyrics or annotations',async()=>{
 const bridge={alignmentStatus:async()=>({available:true}),subscribeAlignment:()=>()=>{},cancelAlignment:async()=>{},alignLyrics:async()=>({alignedLines:1,lines:[{...lines[0],translatedLyric:'changed'}]})};
 await assert.rejects(alignInBackground(music,lines,[song],new AbortController().signal,()=>{},bridge),/文本不一致/);
});
