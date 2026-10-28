import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {createMetadataLookup,resolveMetadata} from '../shared/metadata.mjs';
const run=promisify(execFile), calls=[];
const lookup=createMetadataLookup(async(url,signal)=>{
 calls.push(url);
 const result=await run('dotnet',['tests/NativeLyricsTests/bin/Release/net10.0/NativeLyricsTests.dll','--json',url],{windowsHide:true,signal,encoding:'utf8',maxBuffer:4*1024*1024});
 return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
});
const music={musicId:'live-test',musicName:'Starry Starry',artists:['hifumi'],albumName:'Starry Starry',duration:257301};
const result=await resolveMetadata(music,new AbortController().signal,{lookup});
assert.deepEqual(result.music.artists,['一二三'],result.message);
assert.ok(result.music.artistAliases.some(a=>a.toLowerCase()==='hifumi'));
assert.ok(result.music.metadataArtistIds.includes('9a480ba9-4b92-4096-92de-534f644d2dcc'));
console.log('PASS real MusicBrainz via native HTTP: hifumi → 一二三, recording identity checked; requests='+calls.length);
