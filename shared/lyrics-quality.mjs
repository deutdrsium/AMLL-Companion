// Compare parsed timing, not format names: TTML can contain only line timing.
import { bestMatch, normalize } from './matching.mjs';

const credit=/^\s*(?:作词|作曲|作詞|作編曲|编曲|編曲|词曲|詞曲|词|詞|曲|制作人|製作人|演唱|歌手|专辑|專輯|lyrics\s*(?:by)?|music\s*(?:by)?|written\s*by|composed\s*(?:by)?|produced\s*(?:by)?|arranged\s*(?:by)?)\s*[:：]/i;
const lineText=line=>line.words.map(w=>w.word).join('');
const mainLines=lines=>lines.filter(line=>!line.isBG&&line.words?.some(w=>w.word?.trim())&&!credit.test(lineText(line)));

export function amllCandidates(result, music) {
  if (!result.match) return [];
  const fields = ['appleMusicIds', 'isrcs', 'spotifyIds', 'ncmMusicIds', 'qqMusicIds'];
  return [result.match, ...result.items.filter(song => song.id !== result.match.id
    && bestMatch([song], music) && (fields.some(field =>
      result.match[field]?.some(id => song[field]?.includes(id)))
      || (!!normalize(music.albumName) && song.albumNames.some(a => normalize(a) === normalize(music.albumName)))))];
}
export function lyricDetails(lines) {
  const quality = lyricQuality(lines);
  return [quality[0] ? `逐词（${Math.round(quality[1] * 100)}%）` : '逐行',
    `翻译：${quality[2] ? `有（${Math.round(quality[2] * 100)}%）` : '无'}`,
    `音译：${quality[3] ? `有（${Math.round(quality[3] * 100)}%）` : '无'}`,
    `和声：${lines.some(l => l.isBG) ? '有' : '无'}`, `对唱：${lines.some(l => l.isDuet) ? '有' : '无'}`,
    `${lines.filter(l => !l.isBG && l.words?.some(w => w.word?.trim())).length} 行`].join(' · ');
}
export function lyricQuality(lines) {
  const main = mainLines(lines);
  if (!main.length) return [0, 0, 0, 0, 0];
  const timed = main.filter(l => {
    const words = l.words.filter(w => w.word?.trim());
    return words.length > 1 && words.every(w => Number.isFinite(w.startTime)
      && Number.isFinite(w.endTime) && w.endTime > w.startTime)
      && new Set(words.map(w => w.startTime)).size > 1;
  }).length;
  return [timed, timed / main.length,
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
export async function resolveBest(candidates, resolve, signal, onResolved) {
  // Keep the first three downloads immediate, then drain every compatible version.
  const unique=[...new Map(candidates.map(song=>[song.id,song])).values()];
  const results=new Array(unique.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,unique.length)},async()=>{
    while(cursor<unique.length){
      signal.throwIfAborted();const index=cursor++,song=unique[index];
      try { song.resolvedLyrics = await resolve(song, signal); signal.throwIfAborted(); onResolved?.(song); results[index]=song; }
      catch { signal.throwIfAborted(); }
    }
  }));
  signal.throwIfAborted();
  return results.filter(Boolean).sort(compareLyrics)[0] || null;
}

// Donors already passed recording matching; repeated lines use the closest unused occurrence.
export function supplementTranslations(song, donors) {
  const base=song.resolvedLyrics;
  if(!base||!lyricQuality(base.lines)[0])return song;
  const lines=base.lines.map(line=>({...line})), output=mainLines(lines),sources=new Set(),authors=new Set();
  for(const donor of [...donors].sort(compareLyrics)){
    if(donor.id===song.id||!donor.resolvedLyrics)continue;
    const byText=new Map();
    for(const line of mainLines(donor.resolvedLyrics.lines)){
      const key=normalize(lineText(line));if(!key)continue;
      if(!byText.has(key))byText.set(key,[]);byText.get(key).push(line);
    }
    let used=false;
    for(const line of output){
      const matches=byText.get(normalize(lineText(line)));if(!matches?.length)continue;
      let index=0;
      for(let i=1;i<matches.length;i++)if(Math.abs(matches[i].startTime-line.startTime)<Math.abs(matches[index].startTime-line.startTime))index=i;
      const [from]=matches.splice(index,1);
      if(!line.translatedLyric?.trim()&&from.translatedLyric?.trim()){line.translatedLyric=from.translatedLyric;used=true;}
    }
    if(used){sources.add(donor.resolvedLyrics.source||String(donor.id));authors.add(donor.resolvedLyrics.authors||donor.resolvedLyrics.source||String(donor.id));}
  }
  if(!sources.size)return song;
  return {...song,resolvedLyrics:{...base,lines,source:`${base.source} · 翻译补全：${[...sources].join('、')}`,
    authors:[base.authors,`翻译补全：${[...authors].join('、')}`].filter(Boolean).join(' · ')}};
}
