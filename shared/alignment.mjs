import { bestMatch } from './matching.mjs';
import { canAutoSelect } from './provider-lyrics.mjs';
import { lyricQuality } from './lyrics-quality.mjs';

export function audioCandidates(songs, music) {
  const compatible=songs.filter(s => ['netease','qq'].includes(s.source) && bestMatch([s],music) && canAutoSelect(s,music));
  return ['netease','qq'].flatMap(provider=>compatible.filter(s=>s.source===provider).slice(0,2))
    .map(s => ({ server:s.source==='qq'?'tencent':'netease', id:s.providerData.provider_id,
      title:s.musicNames[0], artists:s.artistNames }));
}
export function lyricLanguage(lines) {
  const text=lines.map(l=>l.words.map(w=>w.word).join('')).join('');
  if (/[\u3040-\u30ff]/u.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(text)) return 'ko';
  if (/[\u3400-\u9fff]/u.test(text)) return 'zh';
  return 'auto';
}
export async function alignInBackground(music, lines, songs, signal, onProgress, bridge=globalThis.window?.companion) {
  if (!bridge?.alignLyrics || lyricQuality(lines)[0] || !(music.duration>0)) return null;
  signal.throwIfAborted();
  const status=await bridge.alignmentStatus();
  signal.throwIfAborted();
  if (!status.available) throw Error('逐字对齐引擎尚未安装，继续显示逐行歌词');
  const candidates=audioCandidates(songs,music);
  if (!candidates.length) throw Error('没有可匹配的音频目录，继续显示逐行歌词');
  const requestId=crypto.randomUUID();
  const cancel=()=>{bridge.cancelAlignment(requestId).catch(()=>{});};
  const unsubscribe=bridge.subscribeAlignment(p=>{if(p.requestId===requestId&&!signal.aborted)onProgress(p.message);});
  signal.addEventListener('abort',cancel,{once:true});
  try {
    onProgress('正在准备本地逐字对齐…');
    const result=await bridge.alignLyrics({requestId,musicKey:JSON.stringify(music),duration:music.duration,
      language:lyricLanguage(lines),lines,candidates});
    signal.throwIfAborted();
    if (!result.alignedLines || !Array.isArray(result.lines) || result.lines.length!==lines.length) return null;
    // A worker result can change timings, never lyrics, annotations, order or voice roles.
    if (result.lines.some((line,i)=>line.words.map(w=>w.word).join('')!==lines[i].words.map(w=>w.word).join('')
      || line.translatedLyric!==lines[i].translatedLyric || line.romanLyric!==lines[i].romanLyric
      || line.isBG!==lines[i].isBG || line.isDuet!==lines[i].isDuet)) throw Error('对齐结果文本不一致，保留逐行歌词');
    return result;
  } finally { signal.removeEventListener('abort',cancel);unsubscribe(); }
}
