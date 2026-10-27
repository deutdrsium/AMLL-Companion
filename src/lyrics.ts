import { parseTTML, parseLrc } from "@applemusic-like-lyrics/lyric";
import type { Song, Music } from "./types";
import { findLyrics } from "../shared/lyrics-search.mjs";
import { searchLrclib } from "../shared/lrclib.mjs";
import { searchProvider, getProviderLyrics, canAutoSelect, catalogueProviders } from '../shared/provider-lyrics.mjs';
import { searchWebLyrics } from '../shared/web-lyrics.mjs';
import { compareLyrics, lyricQuality, resolveBest, amllCandidates } from '../shared/lyrics-quality.mjs';
const base = "https://api.amll.dev/v1/lyrics";
const cache = new Map<number | string, Song>();
async function request(
  path: string,
  params: Record<string, string>,
  signal: AbortSignal,
) {
  const response = await fetch(
    `${base}/${path}?${new URLSearchParams(params)}`,
    { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) },
  );
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "歌词服务请求过于频繁，请稍后重试"
        : `歌词服务暂不可用 (${response.status})`,
    );
  const json = await response.json();
  if (json.status !== 200 || !json.data)
    throw new Error("歌词服务返回了无效响应");
  return json.data;
}
export async function searchLyrics(
  music: Music,
  signal: AbortSignal,
): Promise<{ items: Song[]; match: Song | null; warning?: string }> {
  const results = await Promise.allSettled([
    (async () => {
      const result = await findLyrics(music, request, signal);
      // Preserve AMLL's recording ambiguity guard before ranking lyric quality.
      if (result.match) result.match = await resolveBest(amllCandidates(result, music), getLyrics, signal);
      return result;
    })(),
    ...catalogueProviders.map(provider => searchProvider(provider, music, signal)),
    (async () => {
      const result = await searchLrclib(music, signal);
      result.match = await resolveBest(result.items.filter(s => canAutoSelect(s, music)), getLyrics, signal);
      return result;
    })(),
  ]);
  signal.throwIfAborted();
  const successful = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  const items = successful.flatMap(r => r.items) as Song[];
  const matches = successful.flatMap(r => r.match ? [r.match] : []) as Song[];
  matches.sort(compareLyrics);
  items.sort(compareLyrics);
  if (!matches.length) {
    try {
      const web = await searchWebLyrics(music, signal);
      items.push(...web.items as Song[]);
      if (web.match) return { items, match: web.match as Song };
    } catch (e) {
      signal.throwIfAborted();
      return { items, match: null, warning: e instanceof Error ? e.message : '网页歌词兜底暂不可用' };
    }
  }
  if (!items.length && !successful.length)
    throw new Error('歌词来源暂时均不可用，请稍后重试');
  if (!items.length && results.some(r => r.status === 'rejected'))
    throw new Error('未找到匹配歌词，且部分来源暂不可用，请稍后重试');
  return { items, match: matches[0] || null };
}
export async function getLyrics(song: Song, signal: AbortSignal) {
  signal.throwIfAborted();
  if (song.resolvedLyrics) return song.resolvedLyrics;
  if (song.source && catalogueProviders.includes(song.source)) return getProviderLyrics(song, signal);
  if (song.source === 'lrclib') {
    signal.throwIfAborted();
    const lines = parseLrc(song.lyrics || '');
    if (!lines.length) throw new Error('此条目没有可显示的同步歌词');
    return { lines, authors: 'LRCLIB · 逐行同步', source: 'LRCLIB · 逐行同步' };
  }
  let full = cache.get(song.id);
  if (!full) {
    full = (await request("get", { id: String(song.id) }, signal)) as Song;
    if (typeof full.lyrics !== "string")
      throw new Error("此条目没有 TTML 歌词");
    if (cache.size >= 50) cache.delete(cache.keys().next().value!);
    cache.set(song.id, full);
  }
  const lines = parseTTML(full.lyrics!).lines;
  if (!lines.length) throw new Error("此条目没有可显示的歌词");
  return {
    lines,
    authors: full.authorUsernames?.join(" · ") || "AMLL TTML DB",
    source: `AMLL TTML DB · ${lyricQuality(lines)[0] ? '逐词同步' : '逐行同步'}`,
  };
}
