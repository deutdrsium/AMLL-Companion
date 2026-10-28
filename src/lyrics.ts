import { parseTTML, parseLrc } from "@applemusic-like-lyrics/lyric";
import type { Song, Music } from "./types";
import type {LyricLine} from '@applemusic-like-lyrics/core';
import { findLyrics } from "../shared/lyrics-search.mjs";
import { searchLrclib } from "../shared/lrclib.mjs";
import { searchProvider, getProviderLyrics, canAutoSelect, catalogueProviders, providerRequest } from '../shared/provider-lyrics.mjs';
import { searchWebLyrics } from '../shared/web-lyrics.mjs';
import { lyricQuality, resolveBest, amllCandidates } from '../shared/lyrics-quality.mjs';
import {resolveMetadata} from '../shared/metadata.mjs';
import {searchProgressively} from '../shared/lyrics-pipeline.mjs';
import {memoizeSearchRequest} from '../shared/search-work.mjs';
import {lrclibRows} from '../shared/lyrics-http.mjs';
import {cleanLyricLines} from '../shared/lyric-metadata.mjs';
import {debugSpan} from '../shared/debug-diagnostics.mjs';
export type SearchResult={items:Song[];match:Song|null;warning?:string};
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
  options: {manual?: boolean; onMetadata?: (result:{music:Music;message:string})=>void;onProgress?:(result:SearchResult)=>void} = {},
): Promise<{ items: Song[]; match: Song | null; warning?: string }> {
  const native=memoizeSearchRequest(providerRequest),amll=memoizeSearchRequest(request),load=memoizeSearchRequest(getLyrics);
  const rows=memoizeSearchRequest((title:string,s:AbortSignal)=>lrclibRows(title,s));
  const end=debugSpan('lyrics.search',{musicId:music.musicId});
  try {
  const result=await searchProgressively(music,signal,{
    metadata:(track:Music,s:AbortSignal,update:(result:{music:Music;message:string})=>void)=>options.manual
      ?Promise.resolve({music:track,message:'已使用手动纠正的检索信息'})
      :resolveMetadata(track,s,{onUpdate:update}),
    onMetadata:options.onMetadata,onProgress:options.onProgress,
    canPreview:canAutoSelect,
    sources:[
      async(track:Music,s:AbortSignal,emit:(result:SearchResult)=>void)=>{
        const publish=async(result:SearchResult)=>{
          emit({items:result.items,match:null});
          // Publish only candidates allowed by the existing AMLL recording ambiguity check.
          return resolveBest(amllCandidates(result,track),load,s,(match:Song)=>emit({items:result.items,match}));
        };
        const result=await findLyrics(track,amll,s,publish);
        const eligible=amllCandidates(result,track);
        result.match=await publish(result);return {...result,eligible:eligible.filter((song:Song)=>song.resolvedLyrics)};
      },
      ...catalogueProviders.map(provider=>(track:Music,s:AbortSignal,emit:(result:SearchResult)=>void)=>searchProvider(provider,track,s,native,emit)),
      async(track:Music,s:AbortSignal,emit:(result:SearchResult)=>void)=>{
        const publish=async(result:SearchResult)=>resolveBest(result.items.filter(song=>canAutoSelect(song,track)),load,s,(match:Song)=>emit({items:result.items,match}));
        const result=await searchLrclib(track,s,fetch,{rows,onProgress:publish});
        result.match=await publish(result);return {...result,eligible:result.items.filter((song:Song)=>canAutoSelect(song,track)&&song.resolvedLyrics)};
      },
    ],
    web:searchWebLyrics,
  });
  end({status:'ok',candidates:result.items.length,selectedId:result.match?.id??null});
  return result;
  }catch(error){end({status:signal.aborted?'cancelled':'error',message:String(error)});throw error;}
}
export async function getLyrics(song: Song, signal: AbortSignal) {
  const end=debugSpan('lyrics.load',{id:song.id,source:song.source});
  try {
  const result=await loadLyrics(song,signal);
  const lines=cleanLyricLines(result.lines,song);
  if(window.companion?.debug)end({status:'ok',lines:lines.length,words:lines.reduce((sum:number,line:LyricLine)=>sum+line.words.length,0)});
  return lines===result.lines?result:{...result,rawLines:('rawLines' in result?result.rawLines:undefined)||result.lines,lines};
  }catch(error){end({status:signal.aborted?'cancelled':'error',message:String(error)});throw error;}
}
async function loadLyrics(song: Song, signal: AbortSignal) {
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
