import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchLrclib } from '../shared/lrclib.mjs';
import { parseLrc } from '@applemusic-like-lyrics/lyric';
const music = { musicName: '七里香', artists: ['周杰倫'], albumName: '七里香', duration: 297000 };
const row = { id: 1, trackName: '七里香', artistName: '周杰伦', albumName: '七里香', duration: 297, syncedLyrics: '[00:01.00]第一句\n[00:03.00]第二句' };
test('fallback rejects short clips, wrong artists and live versions despite exact album names', async () => {
  const result = await searchLrclib(music, new AbortController().signal, async () => ({ok:true, json:async()=>[
    {...row, id:2, duration:50}, {...row, id:3, artistName:'其他歌手'}, {...row, id:4, albumName:'演唱会', duration:298}, row,
  ]}));
  assert.equal(result.match.id, -1);
  const lines = parseLrc(result.match.lyrics);
  assert.equal(lines[0].startTime, 1000);
  assert.equal(lines[1].startTime, 3000);
});
test('unknown duration can select a matching album; server errors remain errors', async () => {
  const result = await searchLrclib({...music, duration:0}, new AbortController().signal, async () => ({ok:true,json:async()=>[row]}));
  assert.equal(result.match.id, -1);
  const unknownAlbum = await searchLrclib({...music,duration:0,albumName:''},new AbortController().signal,async()=>({ok:true,json:async()=>[row]}));
  assert.equal(unknownAlbum.match,null);
  await assert.rejects(searchLrclib(music, new AbortController().signal, async()=>({ok:false,status:503})), /503/);
});
test('album edition beats unrelated compilations with the same duration', async () => {
  const result = await searchLrclib(music, new AbortController().signal, async () => ({ok:true,json:async()=>[
    {...row, id:2, albumName:'Compilation'}, {...row, id:3, albumName:'七里香 [台湾首版]'},
  ]}));
  assert.equal(result.match.id, -3);
});
