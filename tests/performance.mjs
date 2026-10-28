import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {compareLyrics,lyricQuality} from '../shared/lyrics-quality.mjs';
import {searchProgressively} from '../shared/lyrics-pipeline.mjs';

await mkdir('test-results/performance',{recursive:true});
const {version}=JSON.parse(await readFile('package.json','utf8'));
let reference=(a,b)=>{
 const left=lyricQuality(a.resolvedLyrics.lines,a),right=lyricQuality(b.resolvedLyrics.lines,b);
 for(let i=0;i<left.length;i++)if(left[i]!==right[i])return right[i]-left[i];return 0;
};
let baseline='uncached current scoring';
try{
 const matching=JSON.stringify(pathToFileURL(path.resolve('shared/matching.mjs')).href);
 const legacyMetadata=path.resolve('test-results/performance/legacy-metadata.mjs');
 const source=file=>execFileSync('git',['show',`e46eae0:${file}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
 await writeFile(legacyMetadata,source('shared/lyric-metadata.mjs').replace("'./matching.mjs'",matching));
 await writeFile('test-results/performance/legacy-quality.mjs',source('shared/lyrics-quality.mjs')
  .replace("'./matching.mjs'",matching).replace("'./lyric-metadata.mjs'",JSON.stringify(pathToFileURL(legacyMetadata).href)));
 reference=(await import(pathToFileURL(path.resolve('test-results/performance/legacy-quality.mjs')).href)).compareLyrics;
 baseline='0.6.14 source (e46eae0)';
}catch{ /* Shallow clones can still compare cached and uncached scoring. */ }
const synthetic=Array.from({length:18},(_,n)=>({song:{musicNames:['Test Song'],artistNames:['Artist'],duration:180000},
 lines:Array.from({length:55},(_,i)=>({startTime:i*3000,endTime:i*3000+2900,translatedLyric:n%3?'':`Translation ${i}`,
 words:n%2?[{word:`Lyric line ${i}`,startTime:i*3000,endTime:i*3000+2900}]:[
  {word:'Lyric ',startTime:i*3000,endTime:i*3000+1000},{word:`line ${i}`,startTime:i*3000+1000,endTime:i*3000+2900}]}))}));
let rows=synthetic,corpus='synthetic';
try{rows=JSON.parse(await readFile('test-results/metadata-corpus.json','utf8')).collected.filter(e=>e.lines.length>1);corpus='cached real lyrics';}catch{}
assert.ok(rows.length);
const candidates=Array.from({length:80},(_,i)=>({...rows[i%rows.length].song,id:`benchmark:${i}`,resolvedLyrics:{lines:rows[i%rows.length].lines}}));
const measure=compare=>{
 const timings=[],orders=[],start=performance.now();
 for(let n=1;n<=candidates.length;n++){
  const before=performance.now();orders.push(candidates.slice(0,n).sort(compare).map(song=>song.id));timings.push(performance.now()-before);
 }
 return {orders,totalMs:performance.now()-start,maxSortMs:Math.max(...timings),p95SortMs:[...timings].sort((a,b)=>a-b)[Math.floor(timings.length*0.95)]};
};
const old=measure(reference),current=measure(compareLyrics);
assert.deepEqual(current.orders,old.orders,'All progressive ranking results must be unchanged');
assert.ok(current.totalMs<old.totalMs/4,'Ranking must improve by at least 4x');
const progressCosts=[];let updates=0;
const result=await searchProgressively({musicName:'Test',artists:['Artist'],albumName:'Album',duration:180000},new AbortController().signal,{
 metadata:async music=>({music}),sources:[async(_music,_signal,emit)=>{
  const items=[];
  for(const song of candidates){
   items.push(song);const before=performance.now();emit({items:[...items],match:song});progressCosts.push(performance.now()-before);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {items,eligible:items,match:items[0]};
 }],web:async()=>assert.fail('Unexpected web fallback'),onProgress:()=>updates++,
});
assert.ok(result.match);assert.ok(updates>=80);
const stats=({orders,...rest})=>Object.fromEntries(Object.entries(rest).map(([k,v])=>[k,Math.round(v*10)/10]));
const report={baseline,corpus,candidates:80,snapshots:80,previous:stats(old),current:stats(current),
 speedup:Math.round(old.totalMs/current.totalMs*10)/10,rankingIdentical:true,
 maxProgressCallbackMs:Math.round(Math.max(...progressCosts)*10)/10,updates};
await writeFile(`docs/performance-${version}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
