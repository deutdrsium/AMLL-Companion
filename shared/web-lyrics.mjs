import { parseLrc, parseLrcA2 } from '@applemusic-like-lyrics/lyric';
import { normalize, artistNames, simplify, musicTitles, musicArtists, artistQueries } from './matching.mjs';
import { compareLyrics, lyricQuality } from './lyrics-quality.mjs';
import { providerRequest, hasLyricContent } from './provider-lyrics.mjs';

const cache = new Map();
const timestamp = /\[\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?\]/;
export function publicLink(value, base) {
  try {
    if (typeof value !== 'string' || !value.trim()) return null;
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port
      || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)
      || url.hostname.endsWith('.local') || !url.hostname.includes('.')) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
function documentFragment(html) {
  // Template contents stay inert: no scripts, images or styles are attached to the app.
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script,style,iframe,object,embed,svg').forEach(n => n.remove());
  return template.content;
}
export function searchLinks(text, base) {
  if (/anomaly\.js|challenge-form|anomaly-modal/i.test(text))
    throw new Error('DuckDuckGo 需要验证码，网页歌词兜底暂不可用');
  const doc = documentFragment(text);
  const anchors = [...doc.querySelectorAll('a.result__a, a.result-link')];
  if (!anchors.length && !/no-results|no results found/i.test(text))
    throw new Error('DuckDuckGo 未返回可解析的搜索结果，请稍后重试');
  return [...new Set(anchors.map(a => {
    const href = a.getAttribute('href');
    try {
      const url = new URL(href, base);
      return publicLink(url.searchParams.get('uddg') || url.href, base);
    } catch { return null; }
  }).filter(Boolean))].slice(0, 6);
}
export function pageLyrics(text, url, contentType = '') {
  if (!/html/i.test(contentType) && !/<(?:!doctype|html|body|head|div|pre|textarea)\b/i.test(text))
    return { texts: [text], evidence: '', downloads: [] };
  const doc = documentFragment(text);
  const evidence = [...doc.querySelectorAll('title,h1')].map(n => n.textContent).join(' ');
  const downloads = [...new Set([...doc.querySelectorAll('a[href]')].filter(a =>
    /\.lrc(?:[?#]|$)/i.test(a.getAttribute('href')) || /\.lrc$/i.test(a.getAttribute('download') || '')
    || (/lrc/i.test(a.textContent) && /下载|download/i.test(a.textContent)))
    .map(a => publicLink(a.getAttribute('href'), url)).filter(Boolean))].slice(0, 2);
  const texts = [...doc.querySelectorAll('pre,textarea,code')].map(n => n.textContent);
  doc.querySelectorAll('br').forEach(n => n.replaceWith(document.createTextNode('\n')));
  doc.querySelectorAll('div,p,li,tr').forEach(n => n.append(document.createTextNode('\n')));
  texts.push(doc.textContent);
  return { texts, evidence, downloads };
}
export function webSong(text, evidence, music, url) {
  if (typeof text !== 'string' || text.length > 500_000) return null;
  const tags = name => [...text.matchAll(new RegExp(`\\[${name}:([^\\]\\r\\n]*)\\]`, 'gi'))].map(m => m[1].trim()).filter(Boolean);
  const titles = tags('ti'), artists = tags('ar');
  const allowedTitles = musicTitles(music).map(normalize), names = artistNames(musicArtists(music)).map(normalize);
  if (!allowedTitles.length || !names.length) return null;
  if (titles.length && titles.some(t => !allowedTitles.includes(normalize(t)))) return null;
  if (artists.length && artists.some(a => !artistNames([a]).some(n => names.includes(normalize(n))))) return null;
  let filename = '';
  try { filename = decodeURIComponent(new URL(url).pathname.split('/').at(-1)); } catch { }
  const page = normalize(evidence || filename);
  if ((!titles.length && !allowedTitles.some(title=>page.includes(title))) || (!artists.length && !names.some(n => page.includes(n)))) return null;
  const versions = s => (simplify(s).match(/live|remix|acoustic|instrumental|现场|演唱会|伴奏/gi) || []).map(s => s.toLowerCase()).sort().join();
  if (versions(titles.join(' ') || evidence) !== versions(`${music.musicName} ${music.albumName || ''}`)) return null;
  const length = tags('length')[0]?.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (length && music.duration > 0 && Math.abs((Number(length[1]) * 60 + Number(length[2])) * 1000 - music.duration) > 3000) return null;
  // Keep only LRC lines; prose, navigation, executable downloads and snippets are not lyrics.
  const lrc = text.replace(/\r/g, '').split('\n').map(s => s.trim())
    .filter(s => timestamp.test(s) && /^\[\d/.test(s) || /^\[(?:ti|ar|al|offset|length):[^\]]*\]$/i.test(s)).join('\n');
  let lines;
  try { lines = /<\d{1,3}:[0-5]\d[.:]\d+>/.test(lrc) ? parseLrcA2(lrc) : parseLrc(lrc); }
  catch { return null; }
  lines = lines.filter(l => l.words.some(w => w.word.trim()));
  if (!hasLyricContent(lines, { musicNames: musicTitles(music), artistNames: musicArtists(music) })) return null;
  if (lines.length < 3 || new Set(lines.map(l => l.startTime)).size < 3
    || lines.some(l => !Number.isFinite(l.startTime) || l.startTime < 0
      || (music.duration > 0 && l.startTime > music.duration + 3000))) return null;
  if (music.duration > 0) lines.forEach(l => { l.endTime = Math.max(l.startTime, Math.min(l.endTime, music.duration));
    l.words.forEach(w => { w.endTime = Math.max(w.startTime, Math.min(w.endTime, music.duration)); }); });
  const source = `网页 LRC · ${new URL(url).hostname} · ${lyricQuality(lines)[0] ? '逐词同步' : '逐行同步'}`;
  return { id: `web:${url}`, source: 'web', sourceUrl: url, musicNames: [music.musicName], artistNames: music.artists,
    albumNames: tags('al'), lyrics: lrc, resolvedLyrics: { lines, source, authors: source } };
}
export async function searchWebLyrics(music, signal, request = providerRequest) {
  signal.throwIfAborted();
  if (!music.artists?.length) return { items: [], match: null };
  const key = JSON.stringify([music.musicName, music.artists, music.albumName, music.duration, music.titleAliases, music.artistAliases]);
  if (cache.has(key)) return cache.get(key);
  const queries=[...new Map(musicTitles(music).flatMap(title=>artistQueries(music).map(artists=>({title,artist:artists.join(' ')})))
    .map(q=>[JSON.stringify(q),q])).values()];
  let failures = 0;
  const visited=new Set();
  for(const query of queries){
  const search = await request('web', 'search', query, signal);
  let links = searchLinks(search.text, search.url);
  if (!links.length) {
    const relaxed = await request('web', 'search', { ...query, relaxed: true }, signal);
    links = searchLinks(relaxed.text, relaxed.url);
  }
  const results = await Promise.all(links.filter(url=>!visited.has(url)).map(async url => {
    visited.add(url);
    try {
      const response = await request('web', 'get', { url }, signal);
      const page = pageLyrics(response.text, response.url, response.contentType);
      let song = page.texts.map(t => webSong(t, page.evidence, music, response.url)).filter(Boolean).sort(compareLyrics)[0];
      if (song) return song;
      for (const download of page.downloads) {
        try {
          const file = await request('web', 'get', { url: download }, signal);
          const content = pageLyrics(file.text, file.url, file.contentType);
          song = content.texts.map(t => webSong(t, content.evidence || page.evidence, music, file.url)).filter(Boolean).sort(compareLyrics)[0];
          if (song) return song;
        } catch { signal.throwIfAborted(); failures++; }
      }
      return null;
    } catch { signal.throwIfAborted(); failures++; return null; }
  }));
  signal.throwIfAborted();
  const items = [...new Map(results.filter(Boolean).map(s => [s.lyrics, s])).values()].sort(compareLyrics);
  const result = { items, match: items[0] || null };
  if (items.length) { if (cache.size >= 20) cache.delete(cache.keys().next().value); cache.set(key, result); return result; }
  }
  if (failures) throw new Error('未找到匹配的网页 LRC，部分歌词网页无法访问');
  return {items:[],match:null};
}
