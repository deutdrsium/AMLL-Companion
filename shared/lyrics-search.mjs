import { artistNames, bestMatch, simplify, titleWithoutCredits } from "./matching.mjs";

export async function findLyrics(music, request, signal) {
  const items = new Map();
  const seen = new Set();
  const titles = [...new Set([music.musicName, simplify(music.musicName),
    titleWithoutCredits(music.musicName), simplify(titleWithoutCredits(music.musicName))])].filter(Boolean);
  const artists = [...new Set(artistNames(music.artists).flatMap(a => [a, simplify(a)]))];
  const queries = titles.flatMap(musicName => [
    ...artists.map(artistName => ({ musicName, artistName })), { musicName },
  ]);
  for (const query of queries) {
    const key = JSON.stringify(query);
    if (seen.has(key)) continue;
    seen.add(key);
    let page = 1;
    while (true) {
      signal.throwIfAborted();
      const result = await request("search", { ...query, pageSize: "100", page: String(page) }, signal);
      for (const item of Array.isArray(result.items) ? result.items : []) {
        if (Number.isSafeInteger(item.id) && [item.musicNames, item.artistNames, item.albumNames]
          .every(a => Array.isArray(a) && a.every(v => typeof v === "string"))) items.set(item.id, item);
      }
      const all = [...items.values()];
      const match = bestMatch(all, music);
      // Read every page for this query before deciding whether recordings are ambiguous.
      if (!result.pagination?.hasMore) {
        if (match) return { items: all, match };
        break;
      }
      page++;
    }
  }
  const all = [...items.values()];
  return { items: all, match: bestMatch(all, music) };
}
