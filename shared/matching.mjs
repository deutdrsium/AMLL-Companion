import { Converter } from "opencc-js/t2cn";
export const simplify = Converter({ from: "tw", to: "cn" });
export const normalize = (text) =>
  simplify(String(text))
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
// Featured credits are metadata; live/remix/acoustic qualifiers identify different recordings.
export const titleWithoutCredits = (text) => String(text)
  .replace(/\s*[（(](?:feat\.?|ft\.?|featuring)\s+[^)）]*[)）]/gi, "")
  .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/gi, "").trim();
export function artistNames(artists) {
  return artists.flatMap((artist) => [artist, ...artist.split(/\s+(?:&|and|feat\.?|ft\.?|featuring|\/|x)\s+|[、，,；;]/i)])
    .flatMap(name => [name.trim(), name.replace(/\s*[（(][^()（）]+[)）]\s*$/, '').trim()]).filter(Boolean);
}
export const musicArtists=music=>[...new Set([...music.artists,...(music.artistAliases||[])])];
export const musicTitles=music=>[...new Set([music.musicName,...(music.titleAliases||[])].flatMap(t=>[t,simplify(t),titleWithoutCredits(t),simplify(titleWithoutCredits(t))]))].filter(Boolean);
export const artistQueries=music=>[...new Map([music.artists,...(music.artistAliases||[]).map(a=>[a])].map(a=>[JSON.stringify(a.map(n=>n.normalize('NFKC').toLocaleLowerCase())),a])).values()];
export function matchesArtists(credited,music){
  const available=new Set(artistNames(credited).map(normalize));
  const matches=raw=>{
    const whole=normalize(raw);
    if(available.has(whole))return true;
    const parts=artistNames([raw]).map(normalize).filter(name=>name!==whole);
    return parts.length>0&&parts.every(name=>available.has(name));
  };
  if(!music.artists.length)return false;
  if(music.artists.every(matches))return true;
  // Flat aliases cannot establish which of several distinct artists a name belongs to.
  return music.artists.length===1&&(music.artistAliases||[]).some(matches);
}
export function bestMatch(items, music) {
  const titles=new Set(musicTitles(music).map(title=>normalize(titleWithoutCredits(title))));
  const albumName=normalize(music.albumName);
  const exact = items.filter(
    (item) =>
      item.musicNames.some(
        (name) => titles.has(normalize(titleWithoutCredits(name))),
      ) &&
      matchesArtists(item.artistNames,music),
  );
  const album = exact.filter(
    (item) =>
      music.albumName &&
      item.albumNames.some(name=>normalize(name)===albumName),
  );
  const candidates = album.length ? album : exact;
  const durationMatches = candidates.filter(s => !(music.duration > 0 && s.duration > 0)
    || Math.abs(s.duration - music.duration) <= 3000);
  if (!durationMatches.length) return null;
  if (durationMatches.length === 1) return durationMatches[0];
  // Multiple submissions for one catalogue recording are not different recordings.
  const sameRecording = ["appleMusicIds", "isrcs", "spotifyIds", "ncmMusicIds", "qqMusicIds"].some(field =>
    durationMatches[0]?.[field]?.some(id => durationMatches.every(item => item[field]?.includes(id))));
  // Matching title, artist and album are enough to compare lyric submissions automatically.
  const sameDuration = music.duration > 0 && durationMatches.every(s => s.duration > 0);
  if (sameRecording || album.length || sameDuration) return [...durationMatches].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    || String(b.id).localeCompare(String(a.id), undefined, {numeric:true}))[0];
  return null;
}
