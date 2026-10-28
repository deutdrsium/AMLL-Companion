import { artistNames, bestMatch, simplify, musicTitles } from "./matching.mjs";
import {eachSearchQuery} from './search-work.mjs';

export async function findLyrics(music, request, signal, onProgress) {
  const items = new Map();
  const seen = new Set();
  const titles = musicTitles(music);
  const artists = [...new Set([...artistNames(music.artists),...artistNames(music.artistAliases||[])].flatMap(a => [a, simplify(a)]))];
  const queries = titles.flatMap(musicName => [
    ...artists.map(artistName => ({ musicName, artistName })), { musicName },
  ]);
  let succeeded=false, failure,complete=false;
  await eachSearchQuery(queries,signal,async query=>{
    if(complete)return;
    const key = JSON.stringify(query);
    if (seen.has(key)) return;
    seen.add(key);
    let page = 1;
    while (true) {
      signal.throwIfAborted();
      let result;
      try{result=await request("search", { ...query, pageSize: "100", page: String(page) }, signal);succeeded=true;}
      catch(error){signal.throwIfAborted();failure=error;break;}
      for (const item of Array.isArray(result.items) ? result.items : []) {
        if (item&&Number.isSafeInteger(item.id) && [item.musicNames, item.artistNames, item.albumNames]
          .every(a => Array.isArray(a) && a.every(v => typeof v === "string"))) items.set(item.id, item);
      }
      const all = [...items.values()];
      const match = bestMatch(all, music);
      // Read every page for this query before deciding whether recordings are ambiguous.
      if (!result.pagination?.hasMore) {
        if (match && !music.artistAliases?.length && !music.titleAliases?.length) complete=true;
        await onProgress?.({items:all,match});
        break;
      }
      page++;
    }
  });
  const all = [...items.values()];
  if(!succeeded&&failure)throw failure;
  return { items: all, match: bestMatch(all, music) };
}
