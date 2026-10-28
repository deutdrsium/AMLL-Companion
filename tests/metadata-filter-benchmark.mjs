import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {inspectLyricMetadata} from '../shared/lyric-metadata.mjs';
import {metadataContext,metadataExamples,protectedExamples} from './fixtures/lyric-metadata.mjs';
import {spawn} from 'node:child_process';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {compatibleSongs} from '../shared/provider-lyrics.mjs';
const query=(provider,operation,data)=>new Promise((resolve,reject)=>{const p=spawn('native/unilyric-bridge/target/release/unilyric-bridge.exe',['--lyrics'],{windowsHide:true});let out='';p.stdout.on('data',d=>out+=d);p.on('error',reject);p.on('exit',()=>{try{const r=JSON.parse(out);if(!r.ok)throw Error(r.error);resolve(r.data);}catch(e){reject(e);}});p.stdin.end(JSON.stringify({provider,operation,data}));});
const samples=[['华语','七里香','周杰伦'],['日语','グレゴリオ','古川本舗'],['动画','more than words','羊文学'],['摇滚','Hotel California','Eagles'],['金属','Numb','Linkin Park'],['爵士','Fly Me to the Moon','Frank Sinatra'],['灵魂','Feeling Good','Nina Simone'],['电子','Wake Me Up','Avicii'],['嘻哈','Lose Yourself','Eminem'],['乡村','Take Me Home, Country Roads','John Denver'],['拉丁','Despacito','Luis Fonsi'],['韩语','Dynamite','BTS']];
if(process.argv.includes('--collect')){
const collected=[],failures=[];let cursor=0;
await Promise.all(Array.from({length:2},async()=>{while(cursor<samples.length){const [genre,title,artist]=samples[cursor++];for(const provider of ['qq','netease']){try{const music={musicName:title,artists:[artist],albumName:'',duration:0};const rows=await query(provider,'search',{title,artists:[artist],album:null,duration:null});const song=compatibleSongs(rows,provider,music)[0];if(!song)throw Error('no matching catalogue entry');const raw=await query(provider,'get',song.providerData);collected.push({genre,title,artist,song,lines:raw.lines});console.log(title,provider,raw.lines.length);}catch(e){failures.push({title,provider,error:e.message});}}}}));
await mkdir('test-results',{recursive:true});await writeFile('test-results/metadata-corpus.json',JSON.stringify({samples,collected,failures},null,2));console.log('collected',collected.length,'failed',failures.length);

}
const dataset=JSON.parse(await readFile('test-results/metadata-corpus.json','utf8'));
// Gold labels were reviewed independently from detector output. Singer section labels stay as body.
const gold={
 'qq:002mKYuI37UbwX':[0,1,2,3], 'qq:001QmHeG32Bm5N':[0,1,2], 'netease:31546851':[],
 'qq:0014AXGx1Sp8aH':[0,1,2,3], 'netease:2100653087':[], 'qq:003O2Em20BhXrs':[0],
 'netease:4153366':[], 'netease:31517840':[0], 'qq:0017XI2t2TkpMW':[0,1], 'qq:003QJMY81FINdb':[0],
 'netease:521786182':[], 'netease:27680985':[], 'qq:001bBBy00o53FS':[0,1], 'qq:004QBhzt4KgsWC':[0,1],
 'netease:26936683':[], 'netease:1477101':[], 'qq:002mEmdw4TIGen':[0], 'netease:456370734':[0,1],
};
const count=()=>({tp:0,fp:0,fn:0,tn:0});const natural=count(),clean=count(),dirty=count(),curated=count();const records=[];
const accumulate=(counter,lines,truth,context)=>{
 const result=inspectLyricMetadata(lines,context),predicted=new Set(result.removed.map(r=>r.index)),expected=new Set(truth);
 for(let i=0;i<lines.length;i++)counter[expected.has(i)?predicted.has(i)?'tp':'fn':predicted.has(i)?'fp':'tn']++;
 return result;
};
const make=(text,time)=>({startTime:time,endTime:time+100,words:[{word:text,startTime:time,endTime:time+100}],translatedLyric:'',romanLyric:''});
for(const time of [0,35000,179000]){
 for(const text of metadataExamples){
  const body=make('The first real lyric',50000),sample=make(text,time);
  const lines=time===179000?[body,sample]:[sample,body];
  const result=accumulate(curated,lines,[time===179000?1:0],metadataContext);
  assert.deepEqual(result.lines,[body],text);
 }
 for(const text of protectedExamples){
  const sample=make(text,time),body=make('The first real lyric',50000);
  const lines=time===179000?[body,sample]:[sample,body];
  assert.equal(accumulate(curated,lines,[],metadataContext).lines,lines,text);
 }
}
for(const entry of dataset.collected){
 if(entry.lines.length<2)continue;
 const truth=gold[entry.song.id];if(!truth)throw Error('Unreviewed catalogue version: '+entry.song.id);
 const source=entry.lines,context=entry.song,detected=accumulate(natural,source,truth,context);
 const cleanLines=source.filter((_,i)=>!truth.includes(i));accumulate(clean,cleanLines,[],context);
 const title=context.musicNames[0],artist=context.artistNames[0];
 const end=Math.max(context.duration||0,...cleanLines.map(l=>l.endTime))+5000;
 const headers=[`${title}--${artist}`,`作词：${artist}`,`作曲：${artist}`,`編曲：${artist}`,`Lyrics by: ${artist}`,`작사：${artist}`,`Written by ${artist}`,
  `监制：${artist}`,`总监制：${artist}`,`执行制作人：${artist}`,`配唱制作人：${artist}`,`和声编写：${artist}`,
  `录音工程师：${artist}`,`混音工程师：${artist}`,`母带后期：${artist}`,`吉他：${artist}`,`钢琴：${artist}`,
  `弦乐编配：${artist}`,`出品公司：Studio A`,`发行公司：Studio A`,`OP/SP：Studio A / Studio B`,
  `作词/作曲：${artist}`,`Lyrics & Music by ${artist}`,`Recording Engineer: ${artist}`,`[ar:${artist}]`];
 const trailers=[`演唱：${artist}`,`混音：${artist}`,`制作人：${artist}`,`Composed by: ${artist}`,`【母带：${artist}】`,`${artist} — ${title}`];
 const injected=[...headers.map((t,i)=>make(t,i*100)),...cleanLines,...trailers.map((t,i)=>make(t,end-1000+i*100))];
 const expected=[...headers.map((_,i)=>i),...trailers.map((_,i)=>headers.length+cleanLines.length+i)];
 const pair=accumulate(dirty,injected,expected,{...context,duration:end});
 const exact=pair.lines.length===cleanLines.length&&pair.lines.every((l,i)=>l===cleanLines[i]);
 records.push({title:entry.title,provider:entry.song.source,id:entry.song.id,rawLines:source.length,metadataIndices:truth,
   detected:detected.removed.map(r=>r.index),missed:truth.filter(i=>!detected.removed.some(r=>r.index===i)),pairedBodyUnchanged:exact,
   sha256:createHash('sha256').update(JSON.stringify(source)).digest('hex')});
}
const metrics=c=>({...c,precision:c.tp+c.fp?c.tp/(c.tp+c.fp):null,recall:c.tp+c.fn?c.tp/(c.tp+c.fn):null,
 missRate:c.tp+c.fn?c.fn/(c.tp+c.fn):null,falsePositiveRate:c.fp+c.tn?c.fp/(c.fp+c.tn):null});
const report={method:'Cached convenience sample with manual raw-line labels, paired deterministic metadata injection, and reviewed format/negative examples at three edge placements. Not a held-out benchmark.',
 attemptedSongs:dataset.samples.length,validVersions:records.length,excludedUntimedVersions:dataset.collected.length-records.length,songs:new Set(records.map(r=>r.title)).size,
 natural:metrics(natural),clean:metrics(clean),injected:metrics(dirty),
 curated:{metadataExamples:metadataExamples.length,protectedExamples:protectedExamples.length,placements:3,...metrics(curated)},records,failures:dataset.failures};
await mkdir('docs',{recursive:true});await writeFile('docs/metadata-filter-evaluation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,records:undefined,failures:undefined},null,2));
for(const counter of [natural,clean,dirty,curated]){
 assert.equal(counter.fn,0,'All reviewed metadata must be detected');
 assert.equal(counter.fp,0,'No reviewed body line may be removed');
}
assert.ok(records.length>0,'A real-lyrics corpus is required');
assert.ok(records.every(r=>r.pairedBodyUnchanged),'Body objects and word times must be preserved');
