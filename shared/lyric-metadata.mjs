import {normalize,titleWithoutCredits} from './matching.mjs';

const roles='作词|作詞|作曲|词曲|詞曲|作編曲|编曲|編曲|词|詞|曲|制作人|製作人|制作|製作|演唱|歌手|专辑|專輯|混音|混音师|混音師|录音|錄音|母带|母帶|作詩|歌唱|翻译|翻譯|音译|音譯|작사|작곡|편곡|lyrics?|lyricist|music|composer|composition|arranger|arrangement|producer|vocals?|mixing|mastering|by';
const credit=new RegExp(`^(?:${roles})\\s*[:：]\\s*\\S[^\\r\\n]{0,139}$`,'i');
const byCredit=/^(?:lyrics?|music|written|composed|produced|arranged|mixed|mastered)\s+by\s*[:：]?\s*\S[^\r\n]{0,139}$/i;
const textOf=line=>(line.words||[]).map(word=>word.word||'').join('').trim();
const unbracket=text=>text.replace(/^[\[【]([\s\S]*)[\]】]$/,'$1').trim();
const artistKey=text=>normalize(text.replace(/\([^)]*\)|（[^）]*）/g,''));
const titleKey=text=>normalize(titleWithoutCredits(text).replace(/\([^)]*\)|（[^）]*）/g,''));

function titleCredit(text,context){
  const titles=[...(context.musicNames||[]),context.musicName,...(context.titleAliases||[])].filter(Boolean).map(titleKey);
  const artists=[...(context.artistNames||[]),...(context.artists||[]),...(context.artistAliases||[])].map(artistKey).filter(Boolean);
  if(!titles.length||!artists.length)return false;
  for(const separator of text.matchAll(/-{1,3}|[—–－]/g)){
    const left=text.slice(0,separator.index).trim(),right=text.slice(separator.index+separator[0].length).trim();
    for(const [title,artist] of [[left,right],[right,left]]){
      if(!titles.includes(titleKey(title)))continue;
      if(artists.includes(artistKey(artist)))return true;
      const parts=artist.replace(/\([^)]*\)|（[^）]*）/g,'').split(/[\/、，,;；&＆]/).map(artistKey).filter(Boolean);
      if(parts.length&&parts.every(name=>artists.includes(name)))return true;
    }
  }
  return false;
}

export function inspectLyricMetadata(lines,context={}){
  const duration=context.duration>0?context.duration:Math.max(0,...lines.map(l=>Math.max(l.startTime||0,l.endTime||0)));
  const removed=[];
  const kept=lines.filter((line,index)=>{
    const text=unbracket(textOf(line));if(!text||line.isBG||line.isDuet)return true;
    const opening=index<8&&line.startTime<=20000;
    const ending=index>=lines.length-6&&line.startTime>=duration-20000;
    if(!opening&&!ending)return true;
    const reason=credit.test(text)||byCredit.test(text)?'credit':titleCredit(text,context)?'title-artist':null;
    if(reason)removed.push({index,reason,text});
    return !reason;
  });
  return {lines:removed.length?kept:lines,removed};
}

export const cleanLyricLines=(lines,context={})=>inspectLyricMetadata(lines,context).lines;
