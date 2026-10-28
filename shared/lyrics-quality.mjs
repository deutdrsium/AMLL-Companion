// Compare parsed timing, not format names: TTML can contain only line timing.
import { bestMatch, normalize } from './matching.mjs';
import {cleanLyricLines} from './lyric-metadata.mjs';

const lineText=line=>line.words.map(w=>w.word).join('');
const mainLines=(lines,context={})=>cleanLyricLines(lines,context).filter(line=>!line.isBG&&line.words?.some(w=>w.word?.trim()));

export function amllCandidates(result, music) {
  if (!result.match) return [];
  const fields = ['appleMusicIds', 'isrcs', 'spotifyIds', 'ncmMusicIds', 'qqMusicIds'];
  return [result.match, ...result.items.filter(song => song.id !== result.match.id
    && bestMatch([song], music) && (fields.some(field =>
      result.match[field]?.some(id => song[field]?.includes(id)))
      || (!!normalize(music.albumName) && song.albumNames.some(a => normalize(a) === normalize(music.albumName)))))];
}
export function lyricDetails(lines,context={}) {
  const quality = lyricQuality(lines,context);
  return [quality[0] ? `逐词（${Math.round(quality[1] * 100)}%）` : '逐行',
    quality[2]?'翻译':null,quality[3]?'音译':null,
    lines.some(l=>l.isBG)?'和声':null,lines.some(l=>l.isDuet&&!l.isBG)?'对唱':null,
    `${mainLines(lines,context).length} 行`].filter(Boolean).join(' · ');
}
export function lyricQuality(lines,context={}) {
  const main = mainLines(lines,context);
  if (!main.length) return [0, 0, 0, 0, 0];
  const timed = main.filter(l => {
    const words = l.words.filter(w => w.word?.trim());
    return words.length > 1 && words.every(w => Number.isFinite(w.startTime)
      && Number.isFinite(w.endTime) && w.endTime > w.startTime)
      && new Set(words.map(w => w.startTime)).size > 1;
  }).length;
  return [timed, timed / main.length,
    main.filter(l => l.translatedLyric?.trim()).length / main.length,
    main.filter(l => l.romanLyric?.trim()).length / main.length,
    Number(lines.some(l => l.isBG)) + Number(lines.some(l => l.isDuet))];
}
export function compareLyrics(a, b) {
  const qa = lyricQuality(a.resolvedLyrics?.lines || [],a);
  const qb = lyricQuality(b.resolvedLyrics?.lines || [],b);
  // Regrouping a translated sentence must not penalize the original word-timing coverage.
  qa.splice(0,2,...(a.resolvedLyrics?.selectionTiming||qa.slice(0,2)));
  qb.splice(0,2,...(b.resolvedLyrics?.selectionTiming||qb.slice(0,2)));
  for (let i = 0; i < qa.length; i++) if (qa[i] !== qb[i]) return qb[i] - qa[i];
  return 0; // Stable order preserves metadata preference when quality is equal.
}
export async function resolveBest(candidates, resolve, signal, onResolved) {
  // Keep the first three downloads immediate, then drain every compatible version.
  const unique=[...new Map(candidates.map(song=>[song.id,song])).values()];
  const results=new Array(unique.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,unique.length)},async()=>{
    while(cursor<unique.length){
      signal.throwIfAborted();const index=cursor++,song=unique[index];
      try { song.resolvedLyrics = await resolve(song, signal); signal.throwIfAborted(); onResolved?.(song); results[index]=song; }
      catch { signal.throwIfAborted(); }
    }
  }));
  signal.throwIfAborted();
  return results.filter(Boolean).sort(compareLyrics)[0] || null;
}

function textDistance(a,b){
  if(a===b)return 0;
  const limit=Math.min(2,Math.floor(Math.min(a.length,b.length)/10));
  if(!limit||Math.abs(a.length-b.length)>limit)return null;
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const next=[i];
    for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));
    if(Math.min(...next)>limit)return null;row=next;
  }
  return row[b.length]<=limit?row[b.length]:null;
}

function translationPairs(target,from,allowSpeakerChanges=false){
  const groups=lines=>lines.map((_,i)=>Array.from({length:Math.min(3,lines.length-i)},(_,n)=>{
    const rows=lines.slice(i,i+n+1);
    return allowSpeakerChanges||rows.every(l=>!!l.isDuet===!!rows[0].isDuet)?normalize(rows.map(lineText).join('')):null;
  }));
  const a=groups(target),b=groups(from),width=from.length+1;
  const scores=new Float64Array((target.length+1)*width),steps=new Uint8Array(scores.length);
  for(let i=target.length;i>=0;i--)for(let j=from.length;j>=0;j--){
    if(i===target.length&&j===from.length)continue;
    const at=i*width+j;let score=-1,step=0;
    if(i<target.length){score=scores[at+width];step=1;}
    if(j<from.length&&scores[at+1]>score){score=scores[at+1];step=2;}
    if(i<target.length&&j<from.length&&Math.abs(target[i].startTime-from[j].startTime)<=12000){
      for(let x=1;x<=a[i].length;x++)for(let y=1;y<=b[j].length;y++){
        const left=a[i][x-1],right=b[j][y-1];if(!left||!right)continue;
        const distance=textDistance(left,right);if(distance===null)continue;
        const value=scores[(i+x)*width+j+y]+Math.max(left.length,right.length)-distance*3-(x+y-2)*0.1
          -Math.min(0.09,Math.abs(target[i].startTime-from[j].startTime)/1000000);
        if(value>score||(value===score&&step<3)){score=value;step=3+(x-1)*3+y-1;}
      }
    }
    scores[at]=score;steps[at]=step;
  }
  const pairs=[];let i=0,j=0;
  while(i<target.length||j<from.length){
    const step=steps[i*width+j];
    if(step===1)i++;else if(step===2)j++;else if(step>=3){
      const x=Math.floor((step-3)/3)+1,y=(step-3)%3+1;
      pairs.push({target:target.slice(i,i+x),from:from.slice(j,j+y)});i+=x;j+=y;
    }else break;
  }
  return pairs;
}

function duetParts(target,from){
  const flags=new Set(from.map(l=>!!l.isDuet));
  if(flags.size===1)return target.map(line=>({original:line,parts:[from[0].isDuet?{...line,isDuet:true}:line]}));
  // Different speakers need exact text boundaries; do not invent word times or split translations.
  if(normalize(target.map(lineText).join(''))!==normalize(from.map(lineText).join('')))return [];
  let offset=0;const spans=from.map(line=>{const start=offset;offset+=normalize(lineText(line)).length;return {start,end:offset,duet:!!line.isDuet};});
  offset=0;
  return target.map(line=>{
    const groups=[];let safe=true;
    for(const word of line.words){
      const length=normalize(word.word).length,start=offset;offset+=length;
      const overlaps=spans.filter(span=>length?span.start<offset&&span.end>start:span.start<=Math.max(0,start-1)&&span.end>Math.max(0,start-1));
      if(new Set(overlaps.map(span=>span.duet)).size>1)safe=false;
      const duet=overlaps[0]?.duet||false;
      if(groups.at(-1)?.duet===duet)groups.at(-1).words.push(word);else groups.push({duet,words:[word]});
    }
    if(!safe||(groups.length>1&&(line.translatedLyric?.trim()||line.romanLyric?.trim())))return {original:line,parts:[line]};
    return {original:line,parts:groups.map(group=>({...line,isDuet:group.duet,words:group.words,
      startTime:groups.length===1?line.startTime:group.words[0].startTime,
      endTime:groups.length===1?line.endTime:group.words.at(-1).endTime}))};
  });
}

export function supplementDuet(song,donors){
  const base=song.resolvedLyrics;if(!base)return song;
  const target=mainLines(base.lines,song);
  if(target.some(l=>l.isDuet))return song;
  let best=null;
  for(const donor of [...donors].sort(compareLyrics)){
    if(donor.id===song.id||!donor.resolvedLyrics)continue;
    const from=mainLines(donor.resolvedLyrics.lines,donor);if(!from.some(l=>l.isDuet))continue;
    const replacements=new Map();let coverage=0;
    for(const pair of translationPairs(target,from,true)){
      for(const {original,parts} of duetParts(pair.target,pair.from)){
        replacements.set(original,parts);coverage+=normalize(lineText(original)).length;
      }
    }
    const changed=[...replacements.values()].some(parts=>parts.some(l=>l.isDuet));
    if(changed&&(!best||coverage>best.coverage))best={donor,replacements,coverage};
  }
  if(!best)return song;
  const source=best.donor.resolvedLyrics;
  return {...song,resolvedLyrics:{...base,rawLines:base.rawLines||base.lines,
    lines:base.lines.flatMap(line=>best.replacements.get(line)||[line]),
    selectionTiming:base.selectionTiming||lyricQuality(base.lines,song).slice(0,2),
    source:`${base.source} · 对唱补全：${source.source||best.donor.id}`,
    authors:[base.authors,`对唱补全：${source.authors||source.source||best.donor.id}`].filter(Boolean).join(' · ')}};
}

export const supplementLyrics=(song,donors)=>supplementTranslations(supplementDuet(song,donors),donors);

// Recording identity is checked before donors reach here; align sentences in order, including split lines.
export function supplementTranslations(song, donors) {
  const base=song.resolvedLyrics;
  if(!base||!lyricQuality(base.lines,song)[0])return song;
  let lines=cleanLyricLines(base.lines,song).map(line=>({...line}));const sources=new Set(),authors=new Set();
  for(const donor of [...donors].sort((a,b)=>lyricQuality(b.resolvedLyrics?.lines||[])[2]-lyricQuality(a.resolvedLyrics?.lines||[])[2]||compareLyrics(a,b))){
    if(mainLines(lines).every(l=>l.translatedLyric?.trim()))break;
    if(donor.id===song.id||!donor.resolvedLyrics)continue;
    if(!mainLines(donor.resolvedLyrics.lines).some(l=>l.translatedLyric?.trim()))continue;
    let used=false;const remove=new Set();
    for(const pair of translationPairs(mainLines(lines,song),mainLines(donor.resolvedLyrics.lines,donor))){
      const {target,from}=pair;
      if(target.some(l=>l.translatedLyric?.trim())||from.some(l=>!l.translatedLyric?.trim()))continue;
      // Do not regroup across a background line or another non-body annotation.
      const at=lines.indexOf(target[0]);if(target.some((l,i)=>lines[at+i]!==l))continue;
      const first=target[0];
      first.translatedLyric=from.map(l=>l.translatedLyric.trim()).join(' ');
      if(target.length>1){
        first.words=target.flatMap((l,i)=>i&&/[a-z0-9]$/i.test(lineText(target[i-1]))&&/^[a-z0-9]/i.test(lineText(l))
          ?l.words.map((w,j)=>j?w:{...w,word:' '+w.word}):l.words);
        first.endTime=Math.max(...target.map(l=>l.endTime));
        first.romanLyric=target.map(l=>l.romanLyric?.trim()).filter(Boolean).join(' ');
        target.slice(1).forEach(l=>remove.add(l));
      }
      used=true;
    }
    lines=lines.filter(l=>!remove.has(l));
    if(used){sources.add(donor.resolvedLyrics.source||String(donor.id));authors.add(donor.resolvedLyrics.authors||donor.resolvedLyrics.source||String(donor.id));}
  }
  if(!sources.size)return song;
  return {...song,resolvedLyrics:{...base,lines,rawLines:base.rawLines||base.lines,selectionTiming:base.selectionTiming||lyricQuality(base.lines,song).slice(0,2),source:`${base.source} · 翻译补全：${[...sources].join('、')}`,
    authors:[base.authors,`翻译补全：${[...authors].join('、')}`].filter(Boolean).join(' · ')}};
}
