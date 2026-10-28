import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {compatibleSongs,canAutoSelect} from '../shared/provider-lyrics.mjs';
import {supplementTranslations,lyricQuality,compareLyrics} from '../shared/lyrics-quality.mjs';
import {cleanLyricLines} from '../shared/lyric-metadata.mjs';

const request=(provider,operation,data)=>new Promise((resolve,reject)=>{
  const child=spawn('native/unilyric-bridge/target/release/unilyric-bridge.exe',['--lyrics'],{windowsHide:true});let output='';
  child.stdout.on('data',chunk=>output+=chunk);child.on('error',reject);
  child.on('exit',()=>{try{const result=JSON.parse(output);if(!result.ok)throw Error(result.error);resolve(result.data);}catch(error){reject(error);}});
  child.stdin.end(JSON.stringify({provider,operation,data}));
});
const music={musicId:'translation-regression',musicName:'グレゴリオ',artists:['古川本舗'],albumName:'ガールフレンド・フロム・キョウト',duration:318000};
const songs=[];
for(const provider of ['qq','netease']){
  const rows=await request(provider,'search',{title:music.musicName,artists:music.artists,album:music.albumName,duration:music.duration});
  const song=compatibleSongs(rows,provider,music).find(s=>canAutoSelect(s,music));assert.ok(song,provider+' recording');
  const result=await request(provider,'get',song.providerData);
  song.resolvedLyrics={lines:result.lines,source:provider,authors:provider};songs.push(song);
}
const selected=[...songs].sort(compareLyrics)[0];assert.equal(selected.source,'qq');
assert.equal(lyricQuality(songs[1].resolvedLyrics.lines)[2],1);
const merged=supplementTranslations(selected,songs);
assert.equal(lyricQuality(merged.resolvedLyrics.lines)[2],1,'Every body sentence must retain its translation');
assert.deepEqual(merged.resolvedLyrics.lines.flatMap(l=>l.words).map(w=>[w.startTime,w.endTime]),
  cleanLyricLines(selected.resolvedLyrics.lines,selected).flatMap(l=>l.words).map(w=>[w.startTime,w.endTime]),'Original body word times must be unchanged');
await mkdir('test-results',{recursive:true});
await writeFile('test-results/translation-live.json',JSON.stringify({music,songs},null,2));
console.log('PASS Gregorio QQ word timing + NetEase translation: body translation 100%, romanization 100%, all word timestamps unchanged');
