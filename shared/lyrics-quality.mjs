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
const qualityCache=new WeakMap();
const emptyQuality=[0,0,0,0,0];

// Parsed lines are immutable. Loads and supplementation replace the lines array.
function songQuality(song){
  const lyrics=song.resolvedLyrics;
  if(!lyrics)return emptyQuality;
  const context=JSON.stringify([song.duration,song.musicName,song.musicNames,song.titleAliases,
    song.artists,song.artistNames,song.artistAliases]);
  const cached=qualityCache.get(lyrics);
  if(cached?.lines===lyrics.lines&&cached.context===context)return cached.quality;
  const quality=lyricQuality(lyrics.lines,song);
  qualityCache.set(lyrics,{lines:lyrics.lines,context,quality});
  return quality;
}

export const lyricTiming=song=>song.resolvedLyrics?.selectionTiming||songQuality(song).slice(0,2);

export function compareLyrics(a, b) {
  const qa = songQuality(a),qb = songQuality(b);
  // Regrouping a translated sentence must not penalize the original word-timing coverage.
  for (let i = 0; i < qa.length; i++) {
    const left=i<2?(a.resolvedLyrics?.selectionTiming?.[i]??qa[i]):qa[i];
    const right=i<2?(b.resolvedLyrics?.selectionTiming?.[i]??qb[i]):qb[i];
    if(left!==right)return right-left;
  }
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
  const outside=limit+1;
  let row=new Uint16Array(b.length+1).fill(outside),next=new Uint16Array(b.length+1).fill(outside);
  for(let j=0;j<=Math.min(limit,b.length);j++)row[j]=j;
  for(let i=1;i<=a.length;i++){
    const low=Math.max(1,i-limit),high=Math.min(b.length,i+limit);
    next.fill(outside,low-1,Math.min(b.length+1,high+2));
    if(low===1)next[0]=Math.min(i,outside);
    let best=outside;
    for(let j=low;j<=high;j++){
      next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));
      best=Math.min(best,next[j]);
    }
    if(best>limit)return null;
    [row,next]=[next,row];
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
  const duetDonors=donors.filter(donor=>donor.id!==song.id&&donor.resolvedLyrics?.lines.some(line=>line.isDuet&&!line.isBG));
  for(const donor of duetDonors.sort(compareLyrics)){
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
  if(!base||!songQuality(song)[0])return song;
  const translatedDonors=donors.filter(donor=>donor.id!==song.id&&songQuality(donor)[2]>0);
  if(!translatedDonors.length)return song;
  if(mainLines(base.lines,song).every(l=>l.translatedLyric?.trim()))return song;
  let lines=cleanLyricLines(base.lines,song).map(line=>({...line}));const sources=new Set(),authors=new Set();
  let targetLines=mainLines(lines,song);
  for(const donor of translatedDonors.sort((a,b)=>songQuality(b)[2]-songQuality(a)[2]||compareLyrics(a,b))){
    if(targetLines.every(l=>l.translatedLyric?.trim()))break;
    if(donor.id===song.id||!donor.resolvedLyrics)continue;
    const fromLines=mainLines(donor.resolvedLyrics.lines,donor);
    let used=false;
    for(const pair of translationPairs(targetLines,fromLines)){
      const {target,from}=pair;
      if(target.some(l=>l.translatedLyric?.trim())||from.some(l=>!l.translatedLyric?.trim()))continue;
      // Do not match across a background line or another non-body annotation.
      const at=lines.indexOf(target[0]);if(target.some((l,i)=>lines[at+i]!==l))continue;
      const first=target[0];
      first.translatedLyric=from.map(l=>l.translatedLyric.trim()).join(' ');
      // Without source boundaries a sentence translation cannot be split faithfully.
      // Attach it once, keeping every original row, word, timestamp and romanization.
      used=true;
    }
    targetLines=mainLines(lines,song);
    if(used){sources.add(donor.resolvedLyrics.source||String(donor.id));authors.add(donor.resolvedLyrics.authors||donor.resolvedLyrics.source||String(donor.id));}
  }
  if(!sources.size)return song;
  return {...song,resolvedLyrics:{...base,lines,rawLines:base.rawLines||base.lines,selectionTiming:base.selectionTiming||lyricQuality(base.lines,song).slice(0,2),source:`${base.source} · 翻译补全：${[...sources].join('、')}`,
    authors:[base.authors,`翻译补全：${[...authors].join('、')}`].filter(Boolean).join(' · ')}};
}
