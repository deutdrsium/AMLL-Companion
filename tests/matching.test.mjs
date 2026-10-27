import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestMatch } from '../shared/matching.mjs';
import { findLyrics } from '../shared/lyrics-search.mjs';
test('matching rejects wrong artists and ambiguous recordings', () => {
  const song = { id: 1, musicNames: ['A song'], artistNames: ['Artist'], albumNames: ['Album'] };
  const track = { musicName: 'A SONG', artists: ['Artist'], albumName: 'Album' };
  assert.equal(bestMatch([song], track), song);
  assert.equal(bestMatch([song], { ...track, artists: ['Different'] }), null);
  assert.equal(bestMatch([song, { ...song, id: 2 }], track), null);
});

const sunny = { id: 1, musicNames: ['晴天'], artistNames: ['周杰伦'], albumNames: ['叶惠美'] };
const track = { musicName: '晴天', artists: ['周杰倫'], albumName: '葉惠美' };
test('multiple lyric submissions for one catalogue recording select the newest', () => {
  const older = { ...sunny, appleMusicIds: ['535824738'], createdAt: 10 };
  const newer = { ...older, id: 3, createdAt: 20 };
  assert.equal(bestMatch([older, newer], track), newer);
  assert.equal(bestMatch([older, {...newer, appleMusicIds: ['another-recording']}], track), null);
});
test('traditional metadata matches simplified library without accepting a live recording', () => {
  assert.equal(bestMatch([sunny], track), sunny);
  assert.equal(bestMatch([sunny], {...track, musicName: '晴天 (Live)'}), null);
});
test('joint artist and featured credits match while preserving artist verification', () => {
  const song = { id: 2, musicNames: ['ME!'], artistNames: ['Taylor Swift', 'Brendon Urie'], albumNames: ['Lover'] };
  assert.equal(bestMatch([song], { musicName: 'ME! (feat. Brendon Urie)', artists: ['Taylor Swift & Brendon Urie'], albumName: 'Lover' }), song);
});
test('search retries converted metadata and searches past unrelated nonempty results', async () => {
  const calls = [];
  const result = await findLyrics(track, async (_, query) => {
    calls.push(query);
    return { items: query.artistName === '周杰伦' ? [sunny] : [{...sunny, id: 2, artistNames: ['其他歌手']}] };
  }, new AbortController().signal);
  assert.equal(result.match, sunny);
  assert.ok(calls.some(q => q.artistName === '周杰伦'));
});
test('search reads later pages and deduplicates results', async () => {
  const result = await findLyrics(track, async (_, query) => ({
    items: query.page === '1' ? [{...sunny, id: 2, artistNames: ['其他歌手']}] : [sunny],
    pagination: { hasMore: query.page === '1' },
  }), new AbortController().signal);
  assert.equal(result.match, sunny);
  assert.equal(result.items.length, 2);
});
test('search cancellation stops fallback requests', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(findLyrics(track, () => { throw new Error('must not fetch'); }, controller.signal), {name:'AbortError'});
});
