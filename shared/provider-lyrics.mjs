import { bestMatch, normalize, simplify } from './matching.mjs';
import { lyricQuality, resolveBest } from './lyrics-quality.mjs';

export const providerNames = { kugou: '酷狗音乐', netease: '网易云音乐', lrclib: 'LRCLIB', amll: 'AMLL' };
export async function providerRequest(provider, operation, data, signal, bridge = globalThis.window?.companion) {
  signal.throwIfAborted();
  if (!bridge?.providerQuery) throw new Error('多源歌词需要新版 Windows 客户端');
  const requestId = crypto.randomUUID();
  const cancel = () => { bridge.cancelProvider(requestId).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await bridge.providerQuery({ requestId, provider, operation, data });
    signal.throwIfAborted();
    return result;
  } finally { signal.removeEventListener('abort', cancel); }
}

export function compatibleSongs(rows, provider, music) {
  return [...new Map(rows.map(row => [row.provider_id, row])).values()].filter(row => row.provider_name === provider && typeof row.provider_id === 'string'
    && typeof row.title === 'string' && Array.isArray(row.artists))
    .map(row => ({ id: `${provider}:${row.provider_id}`, source: provider, providerData: row,
      musicNames: [row.title], artistNames: row.artists.map(a => a.name).filter(n => typeof n === 'string'),
      albumNames: [row.album || ''], duration: row.duration }))
    .filter(song => bestMatch([song], music))
    .sort((a,b) => Number(normalize(b.albumNames[0]) === normalize(music.albumName))
      - Number(normalize(a.albumNames[0]) === normalize(music.albumName))
      || Math.abs((a.duration || 0)-music.duration)-Math.abs((b.duration || 0)-music.duration));
}
export function canAutoSelect(song, music) {
  const version = text => (text.match(/live|remix|acoustic|instrumental|演唱会|现场|伴奏/gi) || []).map(s=>s.toLowerCase()).sort().join();
  return music.duration > 0 && song.duration > 0 && Math.abs(song.duration-music.duration) <= 3000
    && version(simplify(song.albumNames.join(' '))) === version(simplify(music.albumName));
}
export async function getProviderLyrics(song, signal, request = providerRequest) {
  const data = await request(song.source, 'get', song.providerData, signal);
  if (!Array.isArray(data?.lines) || data.lines.length < 2 || !data.lines.some(l => l.startTime > 0)
    || data.lines.some(l => !Number.isFinite(l.startTime) || !Number.isFinite(l.endTime)
      || l.endTime < l.startTime || !Array.isArray(l.words)
      || l.words.some(w => typeof w.word !== 'string' || !Number.isFinite(w.startTime) || !Number.isFinite(w.endTime))))
    throw new Error(`${providerNames[song.source]} 此版本没有同步歌词`);
  const source = `${providerNames[song.source]} · ${lyricQuality(data.lines)[0] ? '逐词同步' : '逐行同步'}`;
  return { lines: data.lines, source, authors: source };
}
export async function searchProvider(provider, music, signal, request = providerRequest) {
  let items = [];
  for (const title of new Set([music.musicName, simplify(music.musicName)])) {
    const rows = await request(provider, 'search', { title, artists: music.artists.map(simplify),
      album: music.albumName || null, duration: music.duration || null }, signal);
    items = compatibleSongs(rows, provider, music);
    if (items.length) break;
  }
  const match = await resolveBest(items.filter(s => canAutoSelect(s, music)),
    (song, signal) => getProviderLyrics(song, signal, request), signal);
  return { items, match };
}
