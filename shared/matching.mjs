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
export function bestMatch(items, music) {
  const exact = items.filter(
    (item) =>
      item.musicNames.some(
        (name) => normalize(titleWithoutCredits(name)) === normalize(titleWithoutCredits(music.musicName)),
      ) &&
      music.artists.length > 0 &&
      artistNames(music.artists).some((artist) =>
        artistNames(item.artistNames).some((name) => normalize(name) === normalize(artist)),
      ),
  );
  const album = exact.filter(
    (item) =>
      music.albumName &&
      item.albumNames.some(
        (name) => normalize(name) === normalize(music.albumName),
      ),
  );
  const candidates = album.length ? album : exact;
  if (candidates.length === 1) return candidates[0];
  // Multiple submissions for one catalogue recording are not different recordings.
  const sameRecording = ["appleMusicIds", "isrcs", "spotifyIds", "ncmMusicIds", "qqMusicIds"].some(field =>
    candidates[0]?.[field]?.some(id => candidates.every(item => item[field]?.includes(id))));
  if (sameRecording) return [...candidates].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || b.id - a.id)[0];
  // shortcut: SMTC has no catalogue ID; genuinely ambiguous recordings need manual selection.
  return null;
}
