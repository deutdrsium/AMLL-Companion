import {compareLyrics,supplementLyrics} from './lyrics-quality.mjs';
import {musicTitles,musicArtists} from './matching.mjs';

export async function searchProgressively(music,signal,{metadata,sources,web,onMetadata,onProgress,canPreview=()=>true}){
  const items=new Map(),matches=new Map(),waves=[],seen=new Set();
  let current=music,successful=0,failures=0;
  const snapshot=()=>({items:[...items.values()].sort(compareLyrics),match:[...matches.values()].sort(compareLyrics)[0]||null});
  const accept=result=>{
    signal.throwIfAborted();
    for(const song of result.items||[]){const old=items.get(song.id);items.set(song.id,old?.resolvedLyrics&&!song.resolvedLyrics?old:song);}
    if(result.match){items.set(result.match.id,result.match);matches.set(result.match.id,result.match);}
    onProgress?.({...snapshot(),match:[...matches.values()].filter(song=>canPreview(song,current)).sort(compareLyrics)[0]||null});
  };
  const start=track=>{
    signal.throwIfAborted();
    const key=JSON.stringify([musicTitles(track).sort(),musicArtists(track).sort(),track.albumName,track.duration]);
    if(seen.has(key))return;seen.add(key);
    waves.push(Promise.all(sources.map(async search=>{
      try{const result=await search(track,signal,accept);signal.throwIfAborted();successful++;accept(result);return result;}
      catch{signal.throwIfAborted();failures++;return null;}
    })));
    // Attach cancellation handling immediately, even while metadata is still pending.
    waves.at(-1).catch(()=>{});
  };
  const update=result=>{signal.throwIfAborted();current=result.music;onMetadata?.(result);start(current);};
  const enrichment=metadata(music,signal,update).then(update).catch(error=>{signal.throwIfAborted();return null;});
  enrichment.catch(()=>{});
  // A cached correction resolves in this microtask and prevents a redundant raw-name wave.
  await Promise.resolve();
  if(!waves.length)start(music);
  await enrichment;
  await Promise.all(waves);
  signal.throwIfAborted();
  // Expanded metadata is authoritative; an earlier provisional match cannot bypass its ambiguity check.
  const eligible=[...new Map((await waves.at(-1)).flatMap(r=>r?.eligible??(r?.match?[r.match]:[])).map(song=>[song.id,song])).values()];
  const finalMatches=eligible.map(song=>supplementLyrics(song,eligible)).sort(compareLyrics);
  for(const song of finalMatches)items.set(song.id,song);
  let result={...snapshot(),match:finalMatches[0]||null};
  if(!result.match){
    try{const fallback=await web(current,signal);accept(fallback);result={items:snapshot().items,match:fallback.match};}
    catch(error){signal.throwIfAborted();return {...result,warning:error instanceof Error?error.message:'网页歌词兜底暂不可用'};}
  }
  if(!result.items.length&&!successful)throw Error('歌词来源暂时均不可用，请稍后重试');
  if(!result.items.length&&failures)throw Error('未找到匹配歌词，且部分来源暂不可用，请稍后重试');
  return result;
}
