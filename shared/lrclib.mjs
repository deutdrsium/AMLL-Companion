import { bestMatch, normalize, simplify, titleWithoutCredits } from './matching.mjs';
import { lrclibRows } from './lyrics-http.mjs';

export async function searchLrclib(music, signal, fetcher = fetch) {
  const items = new Map();
  for (const title of new Set([music.musicName, simplify(music.musicName), titleWithoutCredits(music.musicName)])) {
    signal.throwIfAborted();
    const rows = await lrclibRows(title, signal, fetcher);
    for (const row of rows) {
      if (!Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.syncedLyrics !== 'string' || !row.syncedLyrics.trim()
        || ![row.trackName, row.artistName, row.albumName].every(v => typeof v === 'string')
        || !Number.isFinite(row.duration) || row.duration <= 0) continue;
      const song = { id: -row.id, source: 'lrclib', musicNames: [row.trackName], artistNames: [row.artistName],
        albumNames: [row.albumName], duration: row.duration * 1000, lyrics: row.syncedLyrics };
      if (bestMatch([song], music)) items.set(song.id, song);
    }
    if (items.size) break;
  }
  const all = [...items.values()];
  const albumKey = text => normalize(text.replace(/\s*[\[（(][^\]）)]*[\]）)]\s*$/, ''));
  const compatible = all.filter(s => music.duration > 0 && Math.abs(s.duration - music.duration) <= 3000
    && (!/(live|演唱会|演唱會|现场|現場)/i.test(s.albumNames[0]) || /(live|演唱会|演唱會|现场|現場)/i.test(music.albumName)));
  compatible.sort((a,b) => Number(albumKey(b.albumNames[0]) === albumKey(music.albumName)) - Number(albumKey(a.albumNames[0]) === albumKey(music.albumName))
    || Math.abs(a.duration-music.duration)-Math.abs(b.duration-music.duration) || b.id-a.id);
  return { items: all, match: compatible[0] || null };
}
