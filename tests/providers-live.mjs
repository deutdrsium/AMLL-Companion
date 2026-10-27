import {compatibleSongs,canAutoSelect} from '../shared/provider-lyrics.mjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const query=(provider,operation,data)=>new Promise((resolve,reject)=>{const p=spawn('native/unilyric-bridge/target/release/unilyric-bridge.exe',['--lyrics'],{windowsHide:true});let out='';p.stdout.on('data',d=>out+=d);p.on('error',reject);p.on('exit',()=>{try{resolve(JSON.parse(out));}catch{reject(Error(out));}});p.stdin.end(JSON.stringify({provider,operation,data}));});
const samples=[['华语','七里香','周杰伦'],['日语 / 动画','MOON-VINE','夏背'],['摇滚','Hotel California','Eagles'],['金属','Numb','Linkin Park'],['爵士','Fly Me to the Moon','Frank Sinatra'],['蓝调 / 灵魂','Feeling Good','Nina Simone'],['电子','Wake Me Up','Avicii'],['嘻哈','Lose Yourself','Eminem'],['乡村','Take Me Home, Country Roads','John Denver'],['拉丁','Despacito','Luis Fonsi'],['韩语','Dynamite','BTS'],['古典声乐','Nessun Dorma','Luciano Pavarotti']];
const report=[];
const durations=[297000,239000,391000,187000,149000,173000,247000,326000,190000,230000,199000,185000];
for(const [index,[genre,title,artist]] of samples.entries()){
 const music={musicName:title,artists:[artist],albumName:'',duration:durations[index]};
 const results=await Promise.all(['kugou','netease'].map(async provider=>{const s=await query(provider,'search',{title,artists:[artist],album:null,duration:null});let found=null;for(const song of compatibleSongs(s.data || [],provider,music).filter(s=>canAutoSelect(s,music)).slice(0,3)){const row= song.providerData; const l=await query(provider,'get',row);if(l.ok&&l.data.lines.length>1&&l.data.lines.some(l=>l.startTime>0)){found={title:row.title,artists:row.artists.map(a=>a.name),duration:row.duration,lines:l.data.lines.length,lineTimed:l.data.lineTimed};break;}}return {provider,candidates:s.data?.length,error:s.error,found};}));
 report.push({genre,title,results});console.log(JSON.stringify(report.at(-1)));
}
await mkdir('test-results',{recursive:true});await writeFile('test-results/providers-live.json',JSON.stringify(report,null,2));
