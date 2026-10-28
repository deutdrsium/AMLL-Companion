import {normalize, musicTitles, musicArtists, artistNames} from './matching.mjs';

const unique=values=>[...new Set(values.filter(v=>typeof v==='string'&&v.trim()&&v.length<=300).map(v=>v.trim()))];
const version=s=>(s.match(/\blive\b|\bremix\b|\bacoustic\b|\binstrumental\b|现场|演唱会|伴奏/gi)||[]).map(normalize).sort().join();
const same=(a,b)=>normalize(a)===normalize(b);
const id=value=>Number.isSafeInteger(value)&&value>0;
const song=row=>row?.kind==='song'&&id(row.trackId)&&id(row.artistId)&&id(row.collectionId)
  &&typeof row.trackName==='string'&&typeof row.artistName==='string'&&typeof row.collectionName==='string';
export function catalogueIdentity(rows,music){
  const valid=rows.filter(song);
  if(!valid.length||new Set(valid.map(r=>`${r.trackId}:${r.artistId}:${r.collectionId}`)).size!==1)return null;
  const credited=artistNames(valid.map(r=>r.artistName));
  const artistMatches=music.artists.every(raw=>credited.some(a=>same(a,raw))
    ||artistNames([raw]).every(part=>credited.some(a=>same(a,part))))
    ||(music.artists.length===1&&credited.some(a=>musicArtists(music).some(n=>same(a,n))));
  if(!valid.some(r=>musicTitles(music).some(t=>same(t,r.trackName)))||!artistMatches)return null;
  if(valid.some(r=>version(r.trackName)!==version(music.musicName)))return null;
  if(music.duration>0){if(valid.some(r=>!(r.trackTimeMillis>0)||Math.abs(r.trackTimeMillis-music.duration)>3000))return null;}
  else if(!music.albumName||!valid.some(r=>same(r.collectionName,music.albumName)))return null;
  // Storefront country is availability, not evidence of the recording's original release region.
  return {...music,
    titleAliases:unique([...musicTitles(music),...valid.map(r=>r.trackName)]).filter(t=>t!==music.musicName),
    artistAliases:unique([...musicArtists(music),...valid.map(r=>r.artistName)]).filter(a=>!music.artists.includes(a)),
    metadataAppleTrackId:valid[0].trackId};
}
export async function resolveCatalogueAliases(music,signal,request){
  const text=music.musicName+music.artists.join(' ');
  const countries=/[\u3040-\u30ff]/u.test(text)?['jp','us','tw','kr','cn']
    :/[\uac00-\ud7af]/u.test(text)?['kr','us','jp','tw','cn']
    :/[\u3400-\u9fff]/u.test(text)?['jp','tw','cn','us','kr']:['us','jp','tw','kr','cn'];
  const entries=new Map();
  for(const country of countries){
    signal.throwIfAborted();
    let search;
    try{search=await request('https://itunes.apple.com/search?'+new URLSearchParams({term:music.musicName+' '+music.artists.join(' '),entity:'song',media:'music',country,lang:country==='jp'?'ja_jp':'en_us',limit:'10'}),signal);}
    catch{signal.throwIfAborted();continue;}
    for(const row of (Array.isArray(search.results)?search.results:[]).filter(song)){
      if(music.duration>0&&Math.abs(row.trackTimeMillis-music.duration)>3000)continue;
      if(!music.duration&&(!music.albumName||!same(row.collectionName,music.albumName)))continue;
      if(!entries.has(row.trackId))entries.set(row.trackId,[row]);
      else entries.get(row.trackId).push(row);
    }
    // Read local and English names of the same IDs; never equate two search hits by duration alone.
    if(entries.size>3)return null;
    for(const [trackId,rows] of entries){
      if(rows.lookedUp)continue;rows.lookedUp=true;
      for(const store of [country==='us'?'jp':'us']){
        try{
          const data=await request('https://itunes.apple.com/lookup?'+new URLSearchParams({id:String(trackId),country:store,lang:store==='jp'?'ja_jp':'en_us'}),signal);
          rows.push(...(Array.isArray(data.results)?data.results:[]).filter(r=>song(r)&&r.trackId===trackId));
        }catch{signal.throwIfAborted();}
      }
    }
    let matched=[...entries.values()].map(rows=>({music:catalogueIdentity(rows,music),rows})).filter(r=>r.music);
    const album=matched.filter(r=>r.rows.some(row=>same(row.collectionName,music.albumName)));if(album.length)matched=album;
    if(matched.length===1)return matched[0].music;
    if(matched.length>1)return null;
  }
  return null;
}
