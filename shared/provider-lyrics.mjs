import { bestMatch, normalize, simplify, musicTitles, artistQueries } from './matching.mjs';
import { lyricQuality, resolveBest } from './lyrics-quality.mjs';
import {eachSearchQuery,memoizeSearchRequest} from './search-work.mjs';

export const providerNames = { kugou: '酷狗音乐', netease: '网易云音乐', qq: 'QQ 音乐', kuwo: '酷我音乐', migu: '咪咕音乐', web: '网页 LRC', lrclib: 'LRCLIB', amll: 'AMLL' };
export const catalogueProviders = ['netease', 'kugou', 'qq', 'kuwo', 'migu'];
const recordingOrder=music=>(a,b)=>Number(normalize(b.albumNames[0])===normalize(music.albumName))
  -Number(normalize(a.albumNames[0])===normalize(music.albumName))
  ||Math.abs((a.duration||0)-music.duration)-Math.abs((b.duration||0)-music.duration);
const decode = s => String(s || '').replace(/&(?:nbsp|amp|quot|apos|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
  if (entity[1] !== '#') return ({'&nbsp;':' ', '&amp;':'&', '&quot;':'"', '&apos;':"'", '&lt;':'<', '&gt;':'>'})[entity.toLowerCase()];
  const n = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3),16) : parseInt(entity.slice(2),10);
  return n <= 0x10ffff ? String.fromCodePoint(n) : entity;
});
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
      musicNames: [decode(row.title)], artistNames: row.artists.map(a => a.name).filter(n => typeof n === 'string').map(decode),
      albumNames: [decode(row.album)], duration: row.duration }))
    .filter(song => bestMatch([song], music))
    .sort(recordingOrder(music));
}
export function canAutoSelect(song, music) {
  const version = text => (text.match(/live|remix|acoustic|instrumental|演唱会|现场|伴奏/gi) || []).map(s=>s.toLowerCase()).sort().join();
  const knownDuration = music.duration > 0 && song.duration > 0;
  const sameAlbum = !!normalize(music.albumName) && song.albumNames.some(a => normalize(a) === normalize(music.albumName));
  return (knownDuration ? Math.abs(song.duration-music.duration) <= 3000 : sameAlbum)
    && version(simplify(song.albumNames.join(' '))) === version(simplify(music.albumName));
}
export async function getProviderLyrics(song, signal, request = providerRequest) {
  const data = await request(song.source, 'get', song.providerData, signal);
  if (!Array.isArray(data?.lines) || data.lines.length < 2 || !data.lines.some(l => l.startTime > 0)
    || data.lines.some(l => !Number.isFinite(l.startTime) || !Number.isFinite(l.endTime)
      || l.endTime < l.startTime || !Array.isArray(l.words)
      || l.words.some(w => typeof w.word !== 'string' || !Number.isFinite(w.startTime) || !Number.isFinite(w.endTime))))
    throw new Error(`${providerNames[song.source]} 此版本没有同步歌词`);
  if (!hasLyricContent(data.lines, song)) throw new Error(`${providerNames[song.source]} 此版本仅有歌曲署名，没有歌词正文`);
  const source = `${providerNames[song.source]} · ${lyricQuality(data.lines)[0] ? '逐词同步' : '逐行同步'}`;
  return { lines: data.lines, source, authors: source };
}
export function hasLyricContent(lines, song) {
  return lines.some(line => {
    const text = line.words.map(w => w.word).join('').trim();
    if (!text || /^(?:作词|作曲|编曲|词|曲|制作人|演唱|歌手|专辑|lyrics\s*(?:by)?|written\s*by|composed\s*(?:by)?|produced\s*(?:by)?|arranged\s*(?:by)?)\s*[:：]/i.test(text)) return false;
    const titles = song.musicNames || [];
    const creditName = value => normalize(value.replace(/\([^)]*\)|（[^）]*）/g, ''));
    return !titles.some(title => normalize(text) === normalize(title)
      || (song.artistNames || []).some(artist => creditName(text) === creditName(`${title}${artist}`)));
  });
}
export async function searchProvider(provider, music, signal, request = providerRequest, onProgress) {
  request=memoizeSearchRequest(request);
  const found=new Map(),seen=new Set();let succeeded=false,failure;
  const queries=[];
  for (const title of musicTitles(music)) for (const artists of artistQueries(music)) {
    signal.throwIfAborted();
    const data={title,artists:artists.map(simplify),album:music.albumName||null,duration:music.duration||null};
    const key=JSON.stringify([title.normalize('NFKC').toLowerCase(),data.artists.map(a=>a.normalize('NFKC').toLowerCase())]);
    if(seen.has(key))continue;seen.add(key);
    queries.push(data);
  }
  await eachSearchQuery(queries,signal,async data=>{
    try{
      const rows=await request(provider,'search',data,signal);succeeded=true;
      for(const song of compatibleSongs(rows,provider,music))found.set(song.id,song);
      if(onProgress){
        const items=[...found.values()].sort(recordingOrder(music));
        onProgress({items,match:null});
        await resolveBest(items.filter(s=>canAutoSelect(s,music)),
          (song,s)=>getProviderLyrics(song,s,request),signal,match=>onProgress({items,match}));
      }
    }catch(error){signal.throwIfAborted();failure=error;}
  });
  if(!succeeded&&failure)throw failure;
  const items=[...found.values()].sort(recordingOrder(music));
  const match = await resolveBest(items.filter(s => canAutoSelect(s, music)),
    (song, signal) => getProviderLyrics(song, signal, request), signal);
  return { items, match };
}
