import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createMetadataLookup,resolveMetadata} from '../shared/metadata.mjs';
import {normalize} from '../shared/matching.mjs';
import {cleanLyricLines} from '../shared/lyric-metadata.mjs';
import {compareLyrics,supplementLyrics,lyricQuality} from '../shared/lyrics-quality.mjs';
const exec=promisify(execFile);
const request=async(url,signal)=>JSON.parse((await exec('dotnet',['tests/NativeLyricsTests/bin/Release/net10.0/NativeLyricsTests.dll','--json',url],
 {windowsHide:true,signal,encoding:'utf8',maxBuffer:6*1024*1024})).stdout.replace(/^\uFEFF/,''));
const get=(provider,providerData,operation='get')=>new Promise((resolve,reject)=>{
 const child=spawn('native/unilyric-bridge/target/release/unilyric-bridge.exe',['--lyrics'],{windowsHide:true});let output='';
 child.stdout.on('data',d=>output+=d);child.on('error',reject);child.on('exit',()=>{try{const r=JSON.parse(output);if(!r.ok)throw Error(r.error);resolve(r.data);}catch(e){reject(e);}});
 child.stdin.end(JSON.stringify({provider,operation,data:providerData}));
});
const music={musicId:'journey-test',musicName:"Don't Stop Believin'",artists:['Journey'],albumName:'Escape (2022 Remaster)',duration:248000};
const metadata=await resolveMetadata(music,new AbortController().signal,{lookup:createMetadataLookup(request),catalogueLookup:createMetadataLookup(request,3100),storage:{getItem:()=>null,setItem:()=>{}}});
assert.equal(normalize(metadata.music.musicName),normalize(music.musicName));assert.deepEqual(metadata.music.artists,['Journey']);
assert.notEqual(metadata.music.metadataReleaseRegion,'JP');
const songs=await Promise.all([['qq','0021gVpi3qDavc',248000,'Rock: The Train Kept A Rollin\' (Explicit)'],['netease','26163053',250000,'Escape'],['kuwo','29213550',248000,'Ultimate... Voices']].map(async([source,id,duration,album])=>{
 const rows=await get(source,{title:music.musicName,artists:music.artists,album:music.albumName,duration:music.duration},'search');
 const providerData=rows.find(row=>row.provider_id===id);assert.ok(providerData,'Expected catalogue entry: '+source+':'+id);
 const data=await get(source,providerData);
 const song={id:source+':'+id,source,providerData,musicNames:[music.musicName],artistNames:['Journey'],albumNames:[album],duration};
 return {...song,resolvedLyrics:{lines:cleanLyricLines(data.lines,song),source,authors:source}};
}));
for(const song of songs)assert.ok(song.resolvedLyrics.lines.every(l=>!/[\u3400-\u9fff]/u.test(l.words.map(w=>w.word).join(''))),'Original English must remain the main lyric: '+song.source);
const kuwo=songs.find(s=>s.source==='kuwo');assert.equal(lyricQuality(kuwo.resolvedLyrics.lines)[2],1);
const selected=songs.map(s=>supplementLyrics(s,songs)).sort(compareLyrics)[0];
assert.equal(selected.source,'netease');assert.equal(lyricQuality(selected.resolvedLyrics.lines)[2],1);
await mkdir('test-results',{recursive:true});await writeFile('test-results/journey-fixed.json',JSON.stringify({music,metadata,songs},null,2));
console.log('PASS real Journey: canonical English name, no JP origin claim; Kuwo English/Chinese pairs corrected; complete translated word-timed version selected');
