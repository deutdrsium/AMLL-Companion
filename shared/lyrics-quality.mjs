// Compare parsed timing, not format names: TTML can contain only line timing.
import { bestMatch } from './matching.mjs';

export function amllCandidates(result, music) {
  if (!result.match) return [];
  const fields = ['appleMusicIds', 'isrcs', 'spotifyIds', 'ncmMusicIds', 'qqMusicIds'];
  return [result.match, ...result.items.filter(song => song.id !== result.match.id
    && bestMatch([song], music) && fields.some(field =>
      result.match[field]?.some(id => song[field]?.includes(id))))];
}
export function lyricQuality(lines) {
  const main = lines.filter(l => !l.isBG && l.words?.some(w => w.word?.trim()));
  if (!main.length) return [0, 0, 0, 0, 0];
  const timed = main.filter(l => {
    const words = l.words.filter(w => w.word?.trim());
    return words.length > 1 && words.every(w => Number.isFinite(w.startTime)
      && Number.isFinite(w.endTime) && w.endTime > w.startTime)
      && new Set(words.map(w => w.startTime)).size > 1;
  }).length;
  return [Number(timed > 0), timed / main.length,
    main.filter(l => l.translatedLyric?.trim()).length / main.length,
    main.filter(l => l.romanLyric?.trim()).length / main.length,
    Number(lines.some(l => l.isBG)) + Number(lines.some(l => l.isDuet))];
}
export function compareLyrics(a, b) {
  const qa = lyricQuality(a.resolvedLyrics?.lines || []);
  const qb = lyricQuality(b.resolvedLyrics?.lines || []);
  for (let i = 0; i < qa.length; i++) if (qa[i] !== qb[i]) return qb[i] - qa[i];
  return 0; // Stable order preserves metadata preference when quality is equal.
}
export async function resolveBest(candidates, resolve, signal) {
  // Bound downloads to the three closest compatible catalogue entries per source.
  const results = await Promise.all(candidates.slice(0, 3).map(async song => {
    try { song.resolvedLyrics = await resolve(song, signal); return song; }
    catch { signal.throwIfAborted(); return null; }
  }));
  signal.throwIfAborted();
  return results.filter(Boolean).sort(compareLyrics)[0] || null;
}
