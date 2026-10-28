import {normalize,titleWithoutCredits} from './matching.mjs';

const roles='作词|作詞|填词|填詞|作曲|词曲|詞曲|作編曲|编曲|編曲|词|詞|曲|原词|原詞|原曲|改编|改編|制作人|製作人|制作|製作|监制|監製|总监制|總監製|执行制作|執行製作|执行制作人|執行製作人|音乐总监|音樂總監|演唱|原唱|歌手|专辑|專輯|和声|和聲|和音|和声编写|和聲編寫|和声编配|和聲編配|配唱制作人|配唱製作人|人声编辑|人聲編輯|混音|混音师|混音師|混音工程师|混音工程師|录音|錄音|录音师|錄音師|录音室|錄音室|录音工程师|錄音工程師|母带|母帶|母带工程师|母帶工程師|母带处理|母帶處理|母带后期|母帶後期|吉他|贝斯|貝斯|鼓|鼓组|鼓組|钢琴|鋼琴|键盘|鍵盤|弦乐|弦樂|弦乐编写|弦樂編寫|弦乐编配|弦樂編配|乐团|樂團|指挥|指揮|出品|出品人|出品公司|发行|發行|发行公司|發行公司|发行方|發行方|唱片公司|版权|版權|版权提供|版權提供|OP|SP|作詩|歌唱|翻译|翻譯|译词|譯詞|音译|音譯|歌词制作|歌詞製作|歌词提供|歌詞提供|작사|작곡|편곡|노래|보컬|프로듀서|lyrics?|lyricist|music|composer|composition|arranger|arrangement|producer|production|executive producer|vocals?|vocal producer|vocal production|backing vocals?|background vocals?|guitars?|bass|drums?|piano|keyboards?|strings|recording|recorded by|recording engineer|recording studio|mix|mixing|mixing engineer|mastering|mastering engineer|publisher|publishing|copyright|label|album|artist|title|by';
const role=`(?:${roles})(?:\\s*[/&＆、+・·]\\s*(?:${roles}))*`;
const credit=new RegExp(`^${role}\\s*[:：]\\s*[^\\s:：][^\\r\\n]*$`,'i');
const byCredit=new RegExp(`^(?:${role}|written|composed|produced|arranged|mixed|mastered|recorded)\\s+by\\s*[:：]?\\s*[^\\s:：][^\\r\\n]*$`,'i');
const textOf=line=>(line.words||[]).map(word=>word.word||'').join('').trim();
const unbracket=text=>text.replace(/^[\[【]([\s\S]*)[\]】]$/,'$1').trim();
const artistKey=text=>normalize(text.replace(/\([^)]*\)|（[^）]*）/g,''));
const titleKey=text=>normalize(titleWithoutCredits(text).replace(/\([^)]*\)|（[^）]*）/g,''));
const headerKey=(text,key)=>key(text.replace(/[（(][^）)]*$/,''));

function titleCredit(text,context){
  const titles=[...(context.musicNames||[]),context.musicName,...(context.titleAliases||[])].filter(Boolean).map(titleKey);
  const artists=[...(context.artistNames||[]),...(context.artists||[]),...(context.artistAliases||[])].map(artistKey).filter(Boolean);
  if(!titles.length||!artists.length)return false;
  for(const separator of text.matchAll(/-{1,3}|[—–－]/g)){
    const left=text.slice(0,separator.index).trim(),right=text.slice(separator.index+separator[0].length).trim();
    for(const [title,artist] of [[left,right],[right,left]]){
      if(!titles.includes(headerKey(title,titleKey)))continue;
      if(artists.includes(headerKey(artist,artistKey)))return true;
      const parts=artist.replace(/\([^)]*\)|（[^）]*）/g,'').split(/[\/、，,;；&＆]/).map(artistKey).filter(Boolean);
      if(parts.length&&parts.every(name=>artists.includes(name)))return true;
    }
  }
  return false;
}

export function inspectLyricMetadata(lines,context={}){
  const duration=context.duration>0?context.duration:Math.max(0,...lines.map(l=>Math.max(l.startTime||0,l.endTime||0)));
  let prefix=true;
  const removed=[];
  const kept=lines.filter((line,index)=>{
    const raw=textOf(line).normalize('NFKC').replace(/[\u200b-\u200d\u2060\ufeff]/g,'').trim();
    const text=unbracket(raw);if(!text)return true;
    if(line.isBG||line.isDuet){prefix=false;return true;}
    const reason=credit.test(text)||byCredit.test(text)||/^\[(?:ti|ar|al|au|by|offset|length|re|ve):[^\r\n\]]+\]$/i.test(raw)?'credit':titleCredit(text,context)?'title-artist':null;
    const opening=prefix||index<8&&line.startTime<=20000;
    const ending=index>=lines.length-6&&line.startTime>=duration-20000;
    if(!reason)prefix=false;
    if(!opening&&!ending)return true;
    if(reason)removed.push({index,reason,text});
    return !reason;
  });
  return {lines:removed.length?kept:lines,removed};
}

export const cleanLyricLines=(lines,context={})=>inspectLyricMetadata(lines,context).lines;
