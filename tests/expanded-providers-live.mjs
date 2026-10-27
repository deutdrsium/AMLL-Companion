import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { searchProvider } from '../shared/provider-lyrics.mjs';
import { lyricQuality } from '../shared/lyrics-quality.mjs';
const request = (provider, operation, data) => new Promise((resolve, reject) => {
  const child = spawn('native/unilyric-bridge/target/release/unilyric-bridge.exe', ['--lyrics'], { windowsHide: true });
  let output = '';
  child.stdout.on('data', d => output += d); child.on('error', reject);
  child.on('exit', () => { try { const r = JSON.parse(output); r.ok ? resolve(r.data) : reject(Error(r.error)); } catch (e) { reject(e); } });
  child.stdin.end(JSON.stringify({ provider, operation, data }));
});
const samples = [
  { musicName: '七里香', artists: ['周杰伦'], albumName: '七里香', duration: 297000 },
  { musicName: 'Numb', artists: ['Linkin Park'], albumName: 'Meteora', duration: 187000 },
  { musicName: 'more than words', artists: ['羊文学'], albumName: '12 hugs (like butterflies)', duration: 289785 },
];
const report = [];
for (const music of samples) {
  const results = await Promise.all(['qq', 'kuwo', 'migu'].map(async provider => {
    try {
      const result = await searchProvider(provider, music, new AbortController().signal, request);
      return { provider, candidates: result.items.length, matched: !!result.match,
        source: result.match?.resolvedLyrics?.source, lines: result.match?.resolvedLyrics?.lines.length,
        quality: result.match ? lyricQuality(result.match.resolvedLyrics.lines) : null };
    } catch (e) { return { provider, error: e.message }; }
  }));
  report.push({ title: music.musicName, results }); console.log(JSON.stringify(report.at(-1)));
}
await mkdir('test-results', { recursive: true });
await writeFile('test-results/expanded-providers-live.json', JSON.stringify(report, null, 2));
if (['qq', 'kuwo', 'migu'].some(p => !report.some(r => r.results.some(s => s.provider === p && s.matched))))
  throw new Error('A new source did not yield any compatible synchronized lyric; inspect report.');
