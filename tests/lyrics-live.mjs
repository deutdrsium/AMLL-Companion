import { findLyrics } from '../shared/lyrics-search.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const rows = [];
for (const music of [
  { musicName: '晴天', artists: ['周杰倫'], albumName: '葉惠美' },
  { musicName: '告白氣球', artists: ['周杰倫'], albumName: '周杰倫的床邊故事' },
  { musicName: 'ME! (feat. Brendon Urie)', artists: ['Taylor Swift & Brendon Urie'], albumName: 'Lover' },
  { musicName: '七里香', artists: ['周杰倫'], albumName: '七里香' },
]) {
  const queries = [];
  const signal = AbortSignal.timeout(60000);
  const request = async (path, params) => {
    const response = await fetch(`https://api.amll.dev/v1/lyrics/${path}?${new URLSearchParams(params)}`, { signal });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.status, 200);
    return data.data;
  };
  const result = await findLyrics(music, async (path, params) => {
    queries.push(params);
    return request(path, params);
  }, signal);
  const full = result.match ? await request('get', { id: String(result.match.id) }) : null;
  if (full) assert.match(full.lyrics, /<tt[\s>]/);
  if (music.musicName === '晴天') assert.ok(full, 'Known simplified entry must match traditional SMTC metadata');
  const row = { music, match: result.match?.id ?? null, candidates: result.items.length, ttmlLength: full?.lyrics?.length ?? 0, queries };
  rows.push(row);
  console.log(JSON.stringify(row));
}
await mkdir('test-results', { recursive: true });
await writeFile('test-results/lyrics-live.json', JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2));
