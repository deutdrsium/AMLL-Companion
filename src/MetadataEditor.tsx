import {useEffect,useState} from 'react';
import type {Music} from './types';

export function MetadataEditor({raw,music,message,saved,onSave,onClear}:{
  raw:Music;music:Music;message:string;saved:boolean;
  onSave(value:{musicName:string;artists:string[]}):void;onClear():void;
}){
  const [title,setTitle]=useState(music.musicName),[artists,setArtists]=useState(music.artists.join('；'));
  const [notice,setNotice]=useState('');
  const [dirty,setDirty]=useState(false);
  const artistKey=music.artists.join('；');
  useEffect(()=>{if(!dirty){setTitle(music.musicName);setArtists(artistKey);}},[music.musicName,artistKey,dirty]);
  return <details className="metadata-editor">
    <summary>纠正歌名与歌手</summary>
    <p className="hint">播放器信息：{raw.musicName} · {raw.artists.join(' / ')}</p>
    {message&&<p className="hint" aria-live="polite">{message}</p>}
    {!!music.titleAliases?.length&&<p className="hint">检索歌名：{[music.musicName,...music.titleAliases].join(' / ')}</p>}
    {!!music.artistAliases?.length&&<p className="hint">检索歌手：{[...music.artists,...music.artistAliases].join(' / ')}</p>}
    <form onSubmit={event=>{event.preventDefault();try{
      onSave({musicName:title.trim(),artists:artists.split(/[;；]/).map(a=>a.trim()).filter(Boolean)});
      setDirty(false);setNotice('已保存，正在重新检索歌词');
    }catch(error){setNotice(error instanceof Error?error.message:'保存失败');}}}>
      <label>检索歌名<input aria-label="纠正歌名" value={title} onChange={e=>{setDirty(true);setTitle(e.target.value);}} required maxLength={300}/></label>
      <label>检索歌手（多位用“；”分隔）<input aria-label="纠正歌手" value={artists} onChange={e=>{setDirty(true);setArtists(e.target.value);}} required maxLength={1000}/></label>
      <p className="hint">为当前歌曲保存显示与检索名称，重新播放时沿用。</p>
      <div className="inline-actions"><button type="submit">保存并重新检索</button>
        <button type="button" disabled={!saved} onClick={()=>{try{onClear();setDirty(false);setTitle(raw.musicName);setArtists(raw.artists.join('；'));setNotice('已清除手动纠正，恢复自动识别');}catch(error){setNotice(error instanceof Error?error.message:'清除失败');}}}>清除手动纠正</button></div>
      {notice&&<p className="hint" aria-live="polite">{notice}</p>}
    </form>
  </details>;
}
