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
test('word line count, coverage, translations, then romanization rank alternatives',()=>{
 const sparse=song('sparse',[line(true),line(false)]);
 const full=song('full',[line(true),line(true)]);
 const translated=song('translated',[line(true,'translation')]);
 const roman=song('roman',[line(true,'translation','roman')]);
 assert.deepEqual([sparse,full,translated,roman].sort(compareLyrics).map(s=>s.id),['full','roman','translated','sparse']);
 const more=song('more',[line(true),line(true),line(false),line(false)]);
 assert.ok(compareLyrics(more,roman)<0,'Two word-timed lines beat one fully translated word line');
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

 test('all candidates are compared with bounded downloads and immediate first publication',async()=>{
 const candidates=Array.from({length:9},(_,id)=>({id}));let active=0,peak=0;const seen=[];
 const result=await resolveBest(candidates,async s=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return {lines:[line(s.id===8)]};},new AbortController().signal,s=>seen.push(s.id));
 assert.equal(result.id,8);assert.equal(seen.length,9);assert.equal(peak,3);
 });
 test('translation supplementation preserves timing, existing translations and original inputs',async()=>{
 const {supplementTranslations}=await import('../shared/lyrics-quality.mjs');
 const base=song('word',[line(true,'original'),line(true)]);base.resolvedLyrics.source='Words';base.resolvedLyrics.authors='Author';
 const donor=song('translation',[line(false,'other'),line(false,'second')]);donor.resolvedLyrics.source='Lines';
 const merged=supplementTranslations(base,[donor]);
 assert.deepEqual(merged.resolvedLyrics.lines.map(l=>l.translatedLyric),['original','second']);
 assert.deepEqual(merged.resolvedLyrics.lines.map(l=>l.words),base.resolvedLyrics.lines.map(l=>l.words));
 assert.equal(base.resolvedLyrics.lines[1].translatedLyric,'');assert.match(merged.resolvedLyrics.source,/翻译补全：Lines/);
 assert.equal(supplementTranslations(base,[song('short',[line(false,'x')])]),base);
 const wrong=song('wrong',[line(false,'x'),{...line(false,'y'),words:[{word:'different'}]}]);
 assert.equal(supplementTranslations(base,[wrong]),base);
 });

test('partial translations match by text across credits, extra lines and repeated choruses',async()=>{
 const {supplementTranslations}=await import('../shared/lyrics-quality.mjs');
 const make=(text,time,translation='',word=false)=>({...line(word,translation),startTime:time,
  words:word?[{word:text.slice(0,1),startTime:time,endTime:time+100},{word:text.slice(1),startTime:time+100,endTime:time+200}]:[{word:text,startTime:time,endTime:time+200}]});
 const base=song('word',[make('第一句',1000,'',true),make('副歌',5000,'已有',true),make('副歌',15000,'',true),make('没有匹配',20000,'',true)]);
 const donor=song('donor',[make('词：某某 曲：某某',0,'署名'),make('额外一句',500),make('第一句！',1100,'first'),make('副歌',5100,'early'),make('副歌',15100,'late')]);
 const result=supplementTranslations(base,[donor]);
 assert.deepEqual(result.resolvedLyrics.lines.map(l=>l.translatedLyric),['first','已有','late','']);
 assert.deepEqual(result.resolvedLyrics.lines.map(l=>l.words),base.resolvedLyrics.lines.map(l=>l.words));
 assert.equal(base.resolvedLyrics.lines[0].translatedLyric,'');
 const credit=make('作词：署名',0,'',true);
 assert.equal(lyricQuality([credit,make('正文',1000,'',true)])[0],1,'Credits cannot inflate word line count');
});

test('sentence alignment fills split and merged translations without consuming a later chorus',async()=>{
 const {supplementTranslations}=await import('../shared/lyrics-quality.mjs');
 const make=(text,time,translation='',word=false)=>({...line(word,translation),startTime:time,endTime:time+1000,
  words:word?[{word:text.slice(0,1),startTime:time,endTime:time+500},{word:text.slice(1),startTime:time+500,endTime:time+1000}]:[{word:text,startTime:time,endTime:time+1000}]});
 const original=song('word',[make('Song - Artist',0),make('词：Artist',20),make('青い光',1000,'',true),make('の中へ',3000,'',true),make('静かな夜を歩こう',7000,'',true),make('青い光',30000,'',true),make('長い道で星を見つけたんだ',35000,'',true)]);
 original.musicNames=['Song'];original.artistNames=['Artist'];
 const donor=song('translated',[make('青い光の中へ',900,'第一句'),make('静かな',6900,'安静的'),make('夜を歩こう',7800,'夜晚'),make('青い光',29900,'后面的副歌'),make('長い道で星を見付けたんだ',34900,'小字差异也可对应')]);
 const result=supplementTranslations(original,[donor]);
 assert.deepEqual(result.resolvedLyrics.lines.map(l=>l.translatedLyric),['第一句','安静的 夜晚','后面的副歌','小字差异也可对应']);
 assert.deepEqual(result.resolvedLyrics.lines.flatMap(l=>l.words).map(w=>[w.startTime,w.endTime]),original.resolvedLyrics.lines.slice(2).flatMap(l=>l.words).map(w=>[w.startTime,w.endTime]));
 assert.equal(lyricQuality(result.resolvedLyrics.lines)[2],1);
 assert.equal(original.resolvedLyrics.lines.length,7);assert.equal(compareLyrics(result,original)<0,true);
 assert.deepEqual(result.resolvedLyrics.selectionTiming,lyricQuality(original.resolvedLyrics.lines,original).slice(0,2));
});
test('alignment leaves unrelated text untouched and never replaces an existing translation',async()=>{
 const {supplementTranslations}=await import('../shared/lyrics-quality.mjs');
 const base=song('base',[line(true,'existing'),{...line(true),startTime:30000}]);
 const far=song('far',[{...line(false,'far translation'),startTime:90000}]);
 assert.equal(supplementTranslations(base,[far]),base);
 const unrelated=song('other',[{...line(false,'wrong'),words:[{word:'entirely different lyrics'}]}]);
 assert.equal(supplementTranslations(base,[unrelated]),base);
});
