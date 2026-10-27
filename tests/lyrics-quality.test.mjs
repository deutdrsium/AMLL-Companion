import test from 'node:test';
import assert from 'node:assert/strict';
import {lyricQuality,lyricDetails,compareLyrics,resolveBest,amllCandidates} from '../shared/lyrics-quality.mjs';
const line=(word=false,translation='',roman='')=>({startTime:1000,endTime:3000,translatedLyric:translation,romanLyric:roman,words:word?[{word:'a',startTime:1000,endTime:2000},{word:'b',startTime:2000,endTime:3000}]:[{word:'a b',startTime:1000,endTime:3000}]});
const song=(id,lines)=>({id,resolvedLyrics:{lines}});
test('real word times beat line timing regardless of source or line count',()=>{
 const plain=song('amll',Array.from({length:100},()=>line(false,'translation')));
 const words=song('netease',[line(true)]);
 assert.ok(compareLyrics(words,plain)<0);
 const fake=line(true);fake.words[1].startTime=1000;
 assert.equal(lyricQuality([fake])[0],0);
});
test('word coverage, translations, then romanization rank complete alternatives',()=>{
 const sparse=song('sparse',[line(true),line(false)]);
 const full=song('full',[line(true),line(true)]);
 const translated=song('translated',[line(true,'translation')]);
 const roman=song('roman',[line(true,'translation','roman')]);
 assert.deepEqual([sparse,full,translated,roman].sort(compareLyrics).map(s=>s.id),['roman','translated','full','sparse']);
});
test('later better candidate wins; failed downloads do not block selection',async()=>{
 const c=new AbortController();
 const best=await resolveBest([{id:1},{id:2},{id:3}],async s=>{if(s.id===1)throw Error('offline');return {lines:[line(s.id===3)]};},c.signal);
 assert.equal(best.id,3);
 c.abort();await assert.rejects(resolveBest([],async()=>{},c.signal),{name:'AbortError'});
});
test('AMLL quality ranking includes matching album variants and preserves unresolved cases',()=>{
 const music={musicName:'Song',artists:['Artist'],albumName:'Album'};
 const a={id:1,musicNames:['Song'],artistNames:['Artist'],albumNames:['Album'],appleMusicIds:['same']};
 const b={...a,id:2};const wrong={...a,id:3,appleMusicIds:['other']};
 assert.deepEqual(amllCandidates({match:a,items:[a,b,wrong]},music).map(s=>s.id),[1,2,3]);
 assert.deepEqual(amllCandidates({match:null,items:[a,b]},music),[]);
});
test('candidate details explicitly report present and absent lyric features',()=>{
 const description=lyricDetails([line(true,'translation'),line(false)]);
 assert.match(description,/逐词（50%）/);assert.match(description,/翻译：有（50%）/);
 assert.match(description,/音译：无/);assert.match(description,/和声：无/);
 assert.match(description,/对唱：无/);assert.match(description,/2 行/);
 assert.match(lyricDetails([line(false)]),/^逐行/);
});
