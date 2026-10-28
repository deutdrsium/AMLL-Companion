import { bestMatch, normalize, musicTitles } from './matching.mjs';
import { lrclibRows } from './lyrics-http.mjs';
import { canAutoSelect } from './provider-lyrics.mjs';

export async function searchLrclib(music, signal, fetcher = fetch) {
  const items = new Map();
  let succeeded=false,failure;
  for (const title of musicTitles(music)) {
    signal.throwIfAborted();
    let rows;
    try{rows=await lrclibRows(title,signal,fetcher);succeeded=true;}catch(error){signal.throwIfAborted();failure=error;continue;}
    for (const row of rows) {
      if (!Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.syncedLyrics !== 'string' || !row.syncedLyrics.trim()
        || ![row.trackName, row.artistName, row.albumName].every(v => typeof v === 'string')
        || !Number.isFinite(row.duration) || row.duration <= 0) continue;
      const song = { id: -row.id, source: 'lrclib', musicNames: [row.trackName], artistNames: [row.artistName],
        albumNames: [row.albumName], duration: row.duration * 1000, lyrics: row.syncedLyrics };
      if (bestMatch([song], music)) items.set(song.id, song);
    }
  }
  const all = [...items.values()];
  if(!succeeded&&failure)throw failure;
  const albumKey = text => normalize(text.replace(/\s*[\[（(][^\]）)]*[\]）)]\s*$/, ''));
  const compatible = all.filter(s => canAutoSelect(s, music));
  compatible.sort((a,b) => Number(albumKey(b.albumNames[0]) === albumKey(music.albumName)) - Number(albumKey(a.albumNames[0]) === albumKey(music.albumName))
    || Math.abs(a.duration-music.duration)-Math.abs(b.duration-music.duration) || b.id-a.id);
  return { items: all, match: compatible[0] || null };
}
