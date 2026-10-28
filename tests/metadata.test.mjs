import test from 'node:test';
import assert from 'node:assert/strict';
import {metadataFromRecording,resolveMetadata,createMetadataLookup,saveCorrection,readCorrections,correctedMusic,releaseRegion} from '../shared/metadata.mjs';
import {catalogueIdentity,resolveCatalogueAliases} from '../shared/catalogue-metadata.mjs';
import {bestMatch} from '../shared/matching.mjs';
import {findLyrics} from '../shared/lyrics-search.mjs';
import {searchProvider} from '../shared/provider-lyrics.mjs';
import {webSong} from '../shared/web-lyrics.mjs';

const id='11111111-1111-4111-8111-111111111111', artistId='9a480ba9-4b92-4096-92de-534f644d2dcc';
const music={musicId:'current',musicName:'Starry Starry',artists:['hifumi'],albumName:'Starry Starry',duration:257301};
const record={id,title:music.musicName,length:music.duration,aliases:[],releases:[{title:music.albumName}],
 'artist-credit':[{name:'Hifumi',artist:{id:artistId,name:'一二三',aliases:[{name:'Hifumi',type:'Artist name',locale:'en',primary:true}]}}]};
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const signal=()=>new AbortController().signal;
const lookupFor=records=>createMetadataLookup(async url=>new URL(url).pathname.endsWith('/recording')
 ?{recordings:records}:records.find(r=>url.includes(r.id)),0);

test('verified recording links hifumi and 一二三 in both query and matching metadata',()=>{
 const result=metadataFromRecording(record,music);
 assert.deepEqual(result.artists,['一二三']);assert.ok(result.artistAliases.includes('hifumi'));
 const song={id:1,musicNames:[music.musicName],artistNames:['一二三'],albumNames:[music.albumName],duration:music.duration};
 assert.equal(bestMatch([song],music),null);
 assert.equal(bestMatch([song],{...music,...result}),song);
 assert.deepEqual(music.artists,['hifumi']);
});
test('title aliases recover original script without accepting another recording version',()=>{
 const original={...record,title:'原文の歌名',aliases:[{name:'Romanized Song',type:'Recording name'}]};
 const input={...music,musicName:'Romanized Song'};
 const result=metadataFromRecording(original,input);
 assert.equal(result.musicName,'原文の歌名');assert.ok(result.titleAliases.includes('Romanized Song'));
 assert.equal(metadataFromRecording({...original,title:'原文の歌名 (Live)'},input),null);
 assert.equal(metadataFromRecording({...record,length:30000},music),null);
 assert.equal(metadataFromRecording({...record,length:0,releases:[]},{...music,duration:0}),null);
});
test('all supplied collaborators must match; punctuation in a band name is preserved',()=>{
 assert.equal(metadataFromRecording(record,{...music,artists:['hifumi & Someone Else']}),null);
 const band={...record,'artist-credit':[{name:'Earth, Wind & Fire',artist:{id:artistId,name:'Earth, Wind & Fire',aliases:[]}}]};
 assert.deepEqual(metadataFromRecording(band,{...music,artists:['Earth, Wind & Fire']}).artists,['Earth, Wind & Fire']);
});
test('Moonbath resolves through an independent title alias query when credited artist search misses Yorushika',async()=>{
 const input={...music,musicName:'Moonbath',artists:['Yorushika'],albumName:'Moonbath - Single',duration:248000};
 const original={...record,title:'月光浴',length:248000,aliases:[{name:'Moonbath',type:'Recording name'},{name:'Gekkouyoku'}],
  'artist-credit':[{name:'ヨルシカ',artist:{id:artistId,name:'ヨルシカ',aliases:[{name:'Yorushika',type:'Artist name'}]}}]};
 const queries=[];
 const result=await resolveMetadata(input,signal(),{storage:storage(),lookup:async url=>{
  const query=new URL(url).searchParams.get('query');if(!query)return original;
  queries.push(query);return {recordings:query==='alias:"Moonbath"'?[original]:[]};
 }});
 assert.equal(result.music.musicName,'月光浴');assert.deepEqual(result.music.artists,['ヨルシカ']);
 assert.ok(result.music.titleAliases.includes('Moonbath'));assert.equal(queries.length,2);
 const candidate={id:1,musicNames:['月光浴'],artistNames:['ヨルシカ'],albumNames:[],duration:248000};
 assert.equal(bestMatch([candidate],result.music),candidate);
 assert.equal(metadataFromRecording({...original,'artist-credit':record['artist-credit']},input),null);
});
test('metadata cache reuses confirmed identity while keeping the current player ID',async()=>{
 const store=storage(), request=lookupFor([record]);
 const first=await resolveMetadata(music,signal(),{storage:store,lookup:request});
 assert.deepEqual(first.music.artists,['一二三']);
 const second=await resolveMetadata({...music,musicId:'new-session-id'},signal(),{storage:store,lookup:()=>{throw Error('cache missed');}});
 assert.equal(second.music.musicId,'new-session-id');assert.deepEqual(second.music.artists,['一二三']);
 const next={...music,musicName:'Another Song'},queries=[];
 const unresolved=await resolveMetadata(next,signal(),{storage:store,lookup:async url=>{queries.push(new URL(url).searchParams.get('query'));return {recordings:[]};}});
 assert.ok(queries[0].includes('一二三'));assert.equal(unresolved.music,next);
});
test('two same-name artists with matching title and duration do not become a global alias',async()=>{
 const other={...record,id:'22222222-2222-4222-8222-222222222222','artist-credit':[{name:'Hifumi',artist:{id:'33333333-3333-4333-8333-333333333333',name:'ひふみ',aliases:[{name:'hifumi'}]}}]};
 const result=await resolveMetadata(music,signal(),{storage:storage(),lookup:lookupFor([record,other])});
 assert.equal(result.music,music);assert.match(result.message,/不能唯一确认/);
});
test('temporary metadata failure remains retryable and abort cannot publish a stale identity',async()=>{
 const store=storage();const failed=await resolveMetadata(music,signal(),{storage:store,lookup:async()=>{throw Error('503');}});
 assert.equal(failed.music,music);
 assert.deepEqual((await resolveMetadata(music,signal(),{storage:store,lookup:lookupFor([record])})).music.artists,['一二三']);
 const controller=new AbortController();let finish;const pending=resolveMetadata(music,controller.signal,{storage:storage(),lookup:()=>new Promise(r=>finish=r)});
 controller.abort();finish({recordings:[record]});await assert.rejects(pending,{name:'AbortError'});
});
test('request queue serializes starts and a failed request does not poison the queue',async()=>{
 const starts=[];const lookup=createMetadataLookup(async url=>{starts.push(Date.now());if(url==='bad')throw Error('503');return {};},35);
 await assert.rejects(lookup('bad',signal()));await Promise.all([lookup('one',signal()),lookup('two',signal())]);
 assert.ok(starts[1]-starts[0]>=30&&starts[2]-starts[1]>=30);
});
test('manual corrections persist, affect only the current track and can be undone',()=>{
 const store=storage();const rules=saveCorrection(music,{musicName:'原文の歌名',artists:['一二三']},store);
 assert.deepEqual(readCorrections(store),rules);
 const changed=correctedMusic(music,rules);assert.equal(changed.musicName,'原文の歌名');assert.equal(changed.musicId,music.musicId);
 assert.equal(correctedMusic({...music,musicName:'Another Song'},rules).artists[0],'hifumi');
 assert.equal(correctedMusic(music,saveCorrection(music,null,store)),music);
 assert.throws(()=>saveCorrection(music,{musicName:'Valid',artists:['x'.repeat(301)]},store));
});
test('provider fallback searches aliases separately and accepts a verified alternate artist spelling',async()=>{
 const resolved={...music,...metadataFromRecording(record,music)};const calls=[];
 const result=await searchProvider('netease',resolved,signal(),async(_,operation,data)=>{
  if(operation==='search'){
   calls.push(data.artists);return data.artists[0].toLowerCase()==='hifumi'?[{provider_name:'netease',provider_id:'1',title:music.musicName,artists:[{name:'Hifumi'}],album:music.albumName,duration:music.duration}]:[];
  }
  return {lines:['Lyric one','Lyric two'].map((word,i)=>({startTime:1000+i*2000,endTime:2000+i*2000,words:[{word,startTime:1000+i*2000,endTime:2000+i*2000}]}))};
 });
 assert.ok(result.match);assert.ok(calls.some(a=>a[0].toLowerCase()==='hifumi'));assert.ok(calls.every(a=>a.length===1));
});
test('AMLL gathers alternate-name submissions rather than stopping on the first name',async()=>{
 const resolved={...music,...metadataFromRecording(record,music)};
 const result=await findLyrics(resolved,async(_,query)=>({items:[{id:query.artistName==='一二三'?1:2,musicNames:[music.musicName],artistNames:[query.artistName||'Hifumi'],albumNames:[music.albumName]}]}),signal());
 assert.equal(result.items.length,2);
});
test('web LRC identity validation recognizes verified title and artist aliases',()=>{
 const lyrics='[ti:原文の歌名]\n[ar:一二三]\n[00:01.00]First sung line\n[00:05.00]Second sung line\n[00:09.00]Third sung line';
 const resolved={...music,musicName:'Romanized Song',titleAliases:['原文の歌名'],artistAliases:['一二三']};
 assert.ok(webSong(lyrics,'',resolved,'https://example.org/test.lrc'));
 assert.equal(webSong(lyrics.replace('[ar:一二三]','[ar:Other Artist]'),'',resolved,'https://example.org/test.lrc'),null);
});

const spica={...music,musicName:'Spica',artists:['上白石萌音'],albumName:'kibi',duration:316240};
const appleJP={kind:'song',trackId:1775580978,artistId:968420440,collectionId:1775580587,trackName:'スピカ',artistName:'上白石萌音',collectionName:'kibi',trackTimeMillis:316240,country:'JPN'};
const appleUS={...appleJP,trackName:'Spica',artistName:'Mone Kamishiraishi',collectionName:'Kibi',country:'USA'};
test('Apple regional names require the same track, artist and album IDs, not merely a similar duration',()=>{
 const result=catalogueIdentity([appleJP,appleUS],spica);
 assert.equal(result.musicName,'スピカ');assert.ok(result.titleAliases.includes('Spica'));
 assert.ok(result.artistAliases.includes('Mone Kamishiraishi'));
 assert.equal(result.metadataReleaseRegion,undefined);
 assert.equal(catalogueIdentity([appleJP,{...appleUS,trackId:99}],spica),null);
 assert.equal(catalogueIdentity([appleJP,{...appleUS,artistId:99}],spica),null);
 assert.equal(catalogueIdentity([appleJP,appleUS],{...spica,artists:['Other']}),null);
 assert.equal(catalogueIdentity([appleJP,appleUS],{...spica,artists:['上白石萌音','Other']}),null);
 assert.equal(catalogueIdentity([appleJP,appleUS],{...spica,duration:100000}),null);
 assert.equal(catalogueIdentity([appleJP,appleUS],{...spica,duration:0,albumName:'Other'}),null);
});
test('release language wins over the current script, without substituting an artist nationality for release evidence',()=>{
 const regional={...record,title:'English Title',aliases:[{name:'原文曲名',locale:'ja',primary:true}],
  releases:[{title:music.albumName,status:'Official',country:'JP',date:'2024-01-01','text-representation':{language:'jpn'}},
   {title:music.albumName,status:'Pseudo-Release',country:'US',date:'2023-01-01'}]};
 const result=metadataFromRecording(regional,{...music,musicName:'English Title'});
 assert.equal(result.musicName,'原文曲名');assert.equal(result.metadataReleaseRegion,'JP');
 assert.equal(result.metadataRegionBasis,'matched-release');
 const worldwide=releaseRegion({...regional,releases:[{title:music.albumName,country:'XW'}]},music);
 assert.equal(worldwide.metadataReleaseRegion,'');assert.equal(worldwide.metadataReleaseLocale,'');
 const uncertain=releaseRegion({...regional,releases:[{title:music.albumName,country:'CA'},{title:music.albumName,country:'FR'}]},music);
 assert.equal(uncertain.metadataReleaseRegion,'');
});
test('Spica is automatically corrected and rechecked against the local recording before caching release evidence',async()=>{
 const original={...record,title:'スピカ',length:316240,aliases:[],releases:[{title:'kibi',country:'JP',status:'Official','text-representation':{language:'jpn'}}],
  'artist-credit':[{name:'上白石萌音',artist:{id:artistId,name:'上白石萌音',aliases:[{name:'Mone Kamishiraishi',locale:'en',primary:true}]}}]};
 const store=storage();
 const lookup=async url=>{
  const query=new URL(url).searchParams.get('query');
  return query?{recordings:query.includes('スピカ')?[original]:[]}:original;
 };
 const catalogueLookup=async url=>new URL(url).pathname==='/search'?{results:[appleJP]}:{results:[appleUS]};
 const result=await resolveMetadata(spica,signal(),{storage:store,lookup,catalogueLookup});
 assert.equal(result.music.musicName,'スピカ');assert.equal(result.music.metadataReleaseRegion,'JP');
 assert.ok(result.music.titleAliases.includes('Spica'));assert.equal(result.music.metadataAppleTrackId,1775580978);
 const cached=await resolveMetadata(spica,signal(),{storage:store,lookup:()=>{throw Error('cache missed');}});
 assert.equal(cached.music.metadataReleaseRegion,'JP');
 const controller=new AbortController();controller.abort();
 await assert.rejects(resolveCatalogueAliases(spica,controller.signal,catalogueLookup),{name:'AbortError'});
});
test('every confirmed title and artist name is queried and later query failures preserve earlier lyrics',async()=>{
 const track={...music,titleAliases:['Title 2','Title 3','Title 4','Title 5'],artistAliases:['Alias 1','Alias 2','Alias 3','Alias 4']};
 const queries=[];
 const result=await searchProvider('netease',track,signal(),async(_,operation,data)=>{
  if(operation==='search'){
   queries.push([data.title,...data.artists]);
   if(data.title==='Title 5')throw Error('503');
   return [{provider_name:'netease',provider_id:'valid',title:music.musicName,artists:[{name:'hifumi'}],album:music.albumName,duration:music.duration}];
  }
  return {lines:[1,2].map(i=>({startTime:i*1000,endTime:i*1000+500,words:[{word:'Sung lyric',startTime:i*1000,endTime:i*1000+500}]}))};
 });
 assert.equal(queries.length,25);assert.ok(queries.some(q=>q.includes('Alias 4')));assert.ok(result.match);
});
