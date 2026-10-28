import {normalize, artistNames, titleWithoutCredits} from './matching.mjs';
import {providerRequest} from './provider-lyrics.mjs';

const cacheKey='metadata-alias-cache-v1', correctionsKey='metadata-corrections-v1';
const clean=value=>typeof value==='string'&&value.trim().length<=300?value.trim():'';
const names=value=>[...new Set((Array.isArray(value)?value:[]).map(clean).filter(Boolean))];
const version=text=>(String(text).match(/\blive\b|\bremix\b|\bacoustic\b|\binstrumental\b|现场|演唱会|伴奏/gi)||[]).map(normalize).sort().join();
const phrase=text=>'"'+String(text).replace(/[\\"]/g,'\\$&')+'"';
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
function read(storage,key){try{const value=JSON.parse(storage?.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
function write(storage,key,value){try{if(!storage)return false;storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export const correctionKey=music=>JSON.stringify([normalize(music.musicName),music.artists.map(normalize),normalize(music.albumName)]);
export function readCorrections(storage=globalThis.localStorage){
  return read(storage,correctionsKey).filter(r=>typeof r?.key==='string'&&clean(r.musicName)&&Array.isArray(r.artists)&&r.artists.length&&r.artists.every(a=>!!clean(a))).slice(-200)
    .map(r=>({key:r.key,musicName:clean(r.musicName),artists:names(r.artists)}));
}
export function saveCorrection(music,value,storage=globalThis.localStorage){
  const key=correctionKey(music), current=readCorrections(storage).filter(r=>r.key!==key);
  if(value){
    const title=clean(value.musicName), artists=names(value.artists);
    if(!title||!artists.length||!Array.isArray(value.artists)||!value.artists.every(a=>!!clean(a)))throw Error('请填写歌名和至少一位歌手，每项最多 300 字');
    current.push({key,musicName:title,artists});
  }
  if(!write(storage,correctionsKey,current.slice(-200)))throw Error('无法保存纠正：本地存储不可用或空间不足');
  return current.slice(-200);
}
export function correctedMusic(music,corrections){
  const rule=corrections.find(r=>r.key===correctionKey(music));
  return rule?{...music,musicName:rule.musicName,artists:[...rule.artists]}:music;
}
function pause(ms,signal){return new Promise((resolve,reject)=>{
  signal.throwIfAborted();const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
});}
export function createMetadataLookup(request=async(url,signal)=>{
  const result=await providerRequest('web','get',{url},signal);return JSON.parse(result.text);
},interval=1100){
  let queue=Promise.resolve(), last=0;
  return (url,signal)=>{
    const task=queue.then(async()=>{
      for(let attempt=0;attempt<2;attempt++){
        await pause(Math.max(0,last+interval-Date.now()),signal);last=Date.now();
        try{return await request(url,signal);}catch(error){
          signal.throwIfAborted();if(attempt||!/\b(?:429|503)\b/.test(String(error)))throw error;
        }
      }
    });
    queue=task.then(()=>undefined,()=>undefined);return task;
  };
}
const lookup=createMetadataLookup();
const aliasNames=entity=>names([entity?.name,entity?.title,...(Array.isArray(entity?.aliases)?entity.aliases:[]).filter(a=>a&&a.type!=='Search hint').map(a=>a.name)]);
const parts=artists=>artists.flatMap(a=>a.split(/\s+(?:&|and|feat\.?|ft\.?|featuring|\/|x)\s+|[、，,；;]/i))
  .map(a=>a.replace(/\s*[（(][^()（）]*[)）]\s*$/,'').trim()).filter(Boolean);
function preferred(entity,original){
  if(/[^\u0000-\u024f]/u.test(original))return original;
  const primary=entity.name||entity.title;
  if(/[^\u0000-\u024f]/u.test(primary||''))return primary;
  return entity.aliases?.find(a=>a.primary&&/^(ja|zh)(-|$)/.test(a.locale||'')&&a.type!=='Search hint')?.name||primary||original;
}
function albumMatches(record,music){return !!normalize(music.albumName)&&Array.isArray(record.releases)&&record.releases.some(r=>normalize(r.title)===normalize(music.albumName));}
function durationMatches(record,music){return !(music.duration>0&&record.length>0)||Math.abs(record.length-music.duration)<=3000;}
export function metadataFromRecording(record,music){
  if(!uuid.test(record?.id||'')||!clean(record.title)||!durationMatches(record,music))return null;
  const titles=aliasNames(record).filter(t=>version(t)===version(music.musicName));
  if(!titles.some(t=>normalize(titleWithoutCredits(t))===normalize(titleWithoutCredits(music.musicName))))return null;
  if(!(music.duration>0&&record.length>0)&&!albumMatches(record,music))return null;
  const credits=(Array.isArray(record['artist-credit'])?record['artist-credit']:[]).filter(c=>c?.artist&&clean(c.artist.name)&&uuid.test(c.artist.id||''));
  const matches=raw=>credits.filter(c=>names([c.name,...aliasNames(c.artist)]).some(n=>normalize(n)===normalize(raw)));
  const matched=music.artists.flatMap(raw=>{
    const whole=matches(raw);if(whole.length===1)return [{raw,credit:whole[0]}];
    return parts([raw]).map(part=>{const candidates=matches(part);return candidates.length===1?{raw:part,credit:candidates[0]}:null;});
  });
  if(!matched.length||matched.some(m=>!m))return null;
  const ids=names(matched.map(m=>m.credit.artist.id)).sort();
  const title=preferred({...record,aliases:record.aliases?.filter(a=>version(a.name)===version(music.musicName))},music.musicName);
  if(version(title)!==version(music.musicName))return null;
  const artists=names(matched.map(m=>preferred(m.credit.artist,m.raw)));
  const aliases=names([...music.artists,...matched.flatMap(m=>[m.raw,m.credit.name,...aliasNames(m.credit.artist)])])
    .filter((n,i,all)=>!artists.some(a=>normalize(a)===normalize(n))&&all.findIndex(a=>normalize(a)===normalize(n))===i);
  return {musicName:title,artists,
    titleAliases:names([music.musicName,...titles]).filter(t=>t!==title).slice(0,3),
    artistAliases:aliases.slice(0,6),
    metadataRecordingId:record.id,metadataArtistIds:ids};
}
export async function resolveMetadata(music,signal,options={}){
  signal.throwIfAborted();
  const storage=options.storage??globalThis.localStorage, request=options.lookup||lookup;
  const key=correctionKey(music)+':'+Math.round(music.duration||0);
  const cached=read(storage,cacheKey).filter(e=>typeof e?.key==='string'&&e.expires>Date.now()&&clean(e.metadata?.musicName)
    &&Array.isArray(e.metadata.artists)&&e.metadata.artists.length&&e.metadata.artists.every(a=>!!clean(a))
    &&['artistAliases','titleAliases','metadataArtistIds'].every(field=>Array.isArray(e.metadata[field])&&e.metadata[field].every(a=>typeof a==='string')));
  const hit=cached.find(e=>e.key===key);
  if(hit)return {music:{...music,...hit.metadata},message:'已使用缓存的原文别名'};
  if(!music.artists.length||!/[a-z]/i.test(music.musicName+music.artists.join(' ')))return {music,message:''};
  const taskSignal=AbortSignal.any([signal,AbortSignal.timeout(10000)]);
  try{
    // Artist names are resolved in a recording context, never by a global hifumi→name rule.
    const aliases=names(cached.flatMap(e=>music.artists.some(a=>e.metadata.artistAliases?.some(n=>normalize(n)===normalize(a)))
      ?[...e.metadata.artists,...e.metadata.artistAliases]:[])).slice(0,3);
    const artistQueries=names([...artistNames(music.artists),...aliases]).slice(0,6).map(a=>'artist:'+phrase(a));
    const base='https://musicbrainz.org/ws/2/recording';
    const titleQuery='(recording:'+phrase(titleWithoutCredits(music.musicName))+' OR alias:'+phrase(titleWithoutCredits(music.musicName))+')';
    let response=await request(base+'?'+new URLSearchParams({query:titleQuery+' AND ('+artistQueries.join(' OR ')+')',fmt:'json',limit:'10'}),taskSignal);
    if(!response.recordings?.length)response=await request(base+'?'+new URLSearchParams({query:titleQuery,fmt:'json',limit:'10'}),taskSignal);
    let candidates=[...new Map((response.recordings||[]).filter(r=>uuid.test(r.id||'')&&durationMatches(r,music)).map(r=>[r.id,r])).values()];
    const album=candidates.filter(r=>albumMatches(r,music));if(album.length)candidates=album;
    if(candidates.length>3)return {music,message:'同名作品较多，可手动纠正检索信息'};
    const resolved=[];
    for(const candidate of candidates){
      taskSignal.throwIfAborted();
      const full=await request(base+'/'+candidate.id+'?inc=aliases+artist-credits+releases&fmt=json',taskSignal);
      const metadata=metadataFromRecording(full,music);if(metadata)resolved.push(metadata);
    }
    signal.throwIfAborted();
    const identities=new Set(resolved.map(r=>JSON.stringify([r.metadataArtistIds,normalize(r.musicName)])));
    if(identities.size!==1)return {music,message:resolved.length?'同名艺人尚不能唯一确认，可手动纠正':'未确认其他原文别名，使用播放器信息'};
    const metadata={...resolved[0],titleAliases:names(resolved.flatMap(r=>r.titleAliases)).slice(0,3),artistAliases:names(resolved.flatMap(r=>r.artistAliases)).slice(0,6)};
    write(storage,cacheKey,[...cached.filter(e=>e.key!==key),{key,expires:Date.now()+30*86400000,metadata}].slice(-100));
    return {music:{...music,...metadata},message:'已核对作品并补全原文别名（MusicBrainz）'};
  }catch(error){signal.throwIfAborted();return {music,message:'别名查询暂不可用，使用播放器信息；也可手动纠正'};}
}
