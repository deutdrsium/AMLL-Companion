import test from 'node:test';
import assert from 'node:assert/strict';
import {supplementDuet,supplementLyrics,lyricDetails,compareLyrics} from '../shared/lyrics-quality.mjs';
const line=(text,time,duet=false)=>({startTime:time,endTime:time+1000,isBG:false,isDuet:duet,translatedLyric:'',romanLyric:'',
  words:[{word:text.slice(0,2),startTime:time,endTime:time+400},{word:text.slice(2),startTime:time+500,endTime:time+1000}]});
const song=(id,lines)=>({id,resolvedLyrics:{lines,source:id,authors:id}});

test('duet marks and translations supplement the word-timed base without changing word times',()=>{
 const base=song('base',[line('第一句歌词',1000),line('第二句歌词',4000)]);
 const donor=song('donor',[{...line('第一句歌词',1100),translatedLyric:'first'},{...line('第二句歌词',4100,true),translatedLyric:'second'}]);
 const result=supplementLyrics(base,[donor]);
 assert.deepEqual(result.resolvedLyrics.lines.map(l=>l.isDuet),[false,true]);
 assert.deepEqual(result.resolvedLyrics.lines.map(l=>l.translatedLyric),['first','second']);
 assert.deepEqual(result.resolvedLyrics.lines.flatMap(l=>l.words),base.resolvedLyrics.lines.flatMap(l=>l.words));
 assert.match(result.resolvedLyrics.source,/对唱补全：donor/);assert.match(result.resolvedLyrics.source,/翻译补全/);
 assert.equal(base.resolvedLyrics.lines[1].isDuet,false);assert.ok(compareLyrics(result,base)<0);
 assert.match(lyricDetails(result.resolvedLyrics.lines),/翻译.*对唱/);
 assert.doesNotMatch(lyricDetails(result.resolvedLyrics.lines),/音译|和声|：无/);
});
test('repeated verses stay in order and a single authoritative duet donor avoids mixing reversed roles',()=>{
 const base=song('base',[line('同样的一句歌词',1000),line('同样的一句歌词',30000)]);
 const correct=song('full',[line('同样的一句歌词',1000),line('同样的一句歌词',30000,true)]);
 const partial=song('partial',[line('同样的一句歌词',1000,true)]);
 assert.deepEqual(supplementDuet(base,[partial,correct]).resolvedLyrics.lines.map(l=>l.isDuet),[false,true]);
 const native=song('native',[line('第一句歌词',1000,true),line('第二句歌词',4000)]);
 assert.equal(supplementDuet(native,[correct]),native,'Existing duet labels remain authoritative');
});
test('duet boundaries can split a joined sentence only at existing word times',()=>{
 const first=line('第一句歌词',1000),second=line('第二句歌词',4000);
 const base=song('base',[{...first,endTime:second.endTime,words:[...first.words,...second.words]}]);
 const donor=song('duet',[first,{...second,isDuet:true}]);
 const result=supplementDuet(base,[donor]);
 assert.equal(result.resolvedLyrics.lines.length,2);assert.deepEqual(result.resolvedLyrics.lines.map(l=>l.isDuet),[false,true]);
 assert.deepEqual(result.resolvedLyrics.lines.flatMap(l=>l.words),base.resolvedLyrics.lines[0].words);
 assert.deepEqual(result.resolvedLyrics.selectionTiming,[1,1]);
 const translated=song('translated',[{...base.resolvedLyrics.lines[0],translatedLyric:'An indivisible translation'}]);
 assert.equal(supplementDuet(translated,[donor]),translated,'Do not split or duplicate an existing translation');
});
test('unmatched text, distant repetitions and background vocals never manufacture duet marks',()=>{
 const base=song('base',[line('第一句歌词',1000)]);
 for(const donor of [song('wrong',[line('完全不同的歌词',1000,true)]),song('late',[line('第一句歌词',60000,true)]),song('bg',[{...line('第一句歌词',1000,true),isBG:true}])]){
  assert.equal(supplementDuet(base,[donor]),base);
 }
});
