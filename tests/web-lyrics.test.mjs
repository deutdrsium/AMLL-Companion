import test from 'node:test';
import assert from 'node:assert/strict';
import { webSong, publicLink, searchWebLyrics } from '../shared/web-lyrics.mjs';
import { lyricQuality } from '../shared/lyrics-quality.mjs';
const music = { musicName: 'Test Song', artists: ['Test Artist'], albumName: 'Album', duration: 120000 };
const lrc = '[ti:Test Song]\n[ar:Test Artist]\n[00:01.00]First\n[00:04.00]Second\n[00:08.00]Third';
const url = 'https://lyrics.example/song.lrc';
test('web LRC requires matching title and artist, not merely a search hit', () => {
  assert.ok(webSong(lrc, '', music, url));
  assert.equal(webSong(lrc.replace('Test Artist', 'Other Artist'), 'Test Song Test Artist', music, url), null);
  assert.equal(webSong(lrc.replace('Test Song', 'Other Song'), 'Test Song Test Artist', music, url), null);
  const noTags = lrc.split('\n').slice(2).join('\n');
  assert.equal(webSong(noTags, '', music, url), null);
  assert.ok(webSong(noTags, 'Test Song - Test Artist LRC 下载', music, url));
  assert.equal(webSong(noTags, 'Test Song - Test Artist Live LRC', music, url), null);
});
test('web LRC rejects snippets, wrong duration and ordinary text', () => {
  assert.equal(webSong('[ti:Test Song]\n[ar:Test Artist]\n[00:01]Only a snippet', '', music, url), null);
  assert.equal(webSong(lrc + '\n[length:03:00]', '', music, url), null);
  assert.equal(webSong(lrc.replace('[00:08.00]', '[03:08.00]'), '', music, url), null);
  assert.equal(webSong('Download now', 'Test Song Test Artist', music, url), null);
  assert.equal(webSong(lrc + '\n[ti:Another Song]', '', music, url), null);
});
test('web LRC preserves enhanced word timestamps and bounds final line', () => {
  const enhanced = '[ti:Test Song]\n[ar:Test Artist]\n' + [1, 4, 8].map(t => `[00:0${t}.00]<00:0${t}.00>First <00:0${t+1}.00>word<00:0${t+2}.00>`).join('\n');
  const song = webSong(enhanced, '', music, url);
  assert.ok(song);
  assert.equal(lyricQuality(song.resolvedLyrics.lines)[0], 1);
  assert.equal(webSong(lrc, '', music, url).resolvedLyrics.lines.at(-1).endTime, music.duration);
});
test('web links reject active content, credentials, local hosts and nondefault ports', () => {
  for (const u of ['javascript:alert(1)', 'file:///c:/lyrics.lrc', 'https://user:pass@example.com/a', 'http://127.0.0.1/a', 'http://host.local/a', 'https://example.com:999/a'])
    assert.equal(publicLink(u, url), null);
  assert.equal(publicLink('../song.lrc', 'https://lyrics.example/download/page'), url);
});
test('web lookup honors track cancellation before making requests', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchWebLyrics(music, controller.signal, () => assert.fail('request after abort')), { name: 'AbortError' });
});
