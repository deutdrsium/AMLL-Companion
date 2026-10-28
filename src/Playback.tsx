import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LyricPlayer,
  type LyricPlayerRef,
} from "@applemusic-like-lyrics/react";
import type { LyricLine } from "@applemusic-like-lyrics/core";
import { PlaybackClock } from "../shared/clock.mjs";

const time = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function Timeline({
  clock,
  enabled,
  seek,
}: {
  clock: PlaybackClock;
  enabled: boolean;
  seek(value: number): void;
}) {
  const slider = useRef<HTMLInputElement>(null),
    elapsed = useRef<HTMLSpanElement>(null),
    remaining = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    let frame = 0,
      last = -Infinity;
    const render = (now: number) => {
      if (now - last >= 100 && !dragging.current && slider.current) {
        const value = clock.at();
        slider.current.value = String(value);
        slider.current.style.setProperty(
          "--progress",
          `${(value / (clock.duration || 1)) * 100}%`,
        );
        elapsed.current!.textContent = time(value);
        remaining.current!.textContent = `−${time(Math.max(0, clock.duration - value))}`;
        last = now;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [clock]);
  const commit = () => {
    if (dragging.current && slider.current) seek(Number(slider.current.value));
    dragging.current = false;
  };
  return (
    <div className="timeline">
      <input
        ref={slider}
        aria-label="播放进度"
        type="range"
        min={0}
        max={clock.duration || 1}
        defaultValue={0}
        disabled={!enabled || !clock.duration}
        onPointerDown={() => {
          dragging.current = true;
        }}
        onChange={(e) => {
          dragging.current = true;
          elapsed.current!.textContent = time(Number(e.target.value));
          e.target.style.setProperty(
            "--progress",
            `${(Number(e.target.value) / (clock.duration || 1)) * 100}%`,
          );
        }}
        onPointerUp={commit}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onBlur={commit}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            commit();
        }}
      />
      <div>
        <span ref={elapsed}>0:00</span>
        <span ref={remaining}>−0:00</span>
      </div>
    </div>
  );
}

export function LiveLyrics({
  clock,
  lines,
  offset,
  playing,
  reduceMotion,
  seek,
  authors,
  showTranslation,
  showRomanization,
}: {
  clock: PlaybackClock;
  lines: LyricLine[];
  offset: number;
  playing: boolean;
  reduceMotion: boolean;
  seek(value: number): void;
  authors: string;
  showTranslation: boolean;
  showRomanization: boolean;
}) {
  const player = useRef<LyricPlayerRef>(null);
  const displayLines = useMemo(() => lines.map(line => ({ ...line,
    translatedLyric: showTranslation ? line.translatedLyric : '',
    romanLyric: showRomanization ? line.romanLyric : '',
  })), [lines, showTranslation, showRomanization]);
  const [visibleLines,setVisibleLines]=useState(displayLines);
  const shown=useRef(displayLines),fadeOut=useRef<Animation|null>(null);
  useEffect(()=>{
    if(shown.current===displayLines)return;
    const element=player.current?.wrapperEl;
    if(reduceMotion||!element){setVisibleLines(displayLines);return;}
    let cancelled=false;
    const animation=element.animate([{opacity:getComputedStyle(element).opacity},{opacity:0}],{duration:120,easing:'ease-in',fill:'forwards'});
    fadeOut.current=animation;
    void animation.finished.then(()=>{if(!cancelled)setVisibleLines(displayLines);},()=>{});
    return ()=>{cancelled=true;animation.cancel();};
  },[displayLines,reduceMotion]);
  useLayoutEffect(()=>{
    // Rebuild at the live clock position while hidden, before the next paint.
    const core=player.current?.lyricPlayer;
    core?.setCurrentTime(Math.round(Math.max(0,clock.at()+offset)),true);
    core?.update(0);
    if(shown.current===visibleLines)return;
    shown.current=visibleLines;
    fadeOut.current?.cancel();
    fadeOut.current=null;
    if(reduceMotion)return;
    const animation=player.current?.wrapperEl?.animate([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});
    return ()=>animation?.cancel();
  },[visibleLines,clock,offset,reduceMotion]);
  useEffect(() => {
    let frame = 0,
      revision = -1;
    const render = () => {
      const isSeek = revision !== clock.seekRevision;
      player.current?.lyricPlayer?.setCurrentTime(
        Math.round(Math.max(0, clock.at() + offset)),
        isSeek,
      );
      revision = clock.seekRevision;
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [clock, offset]);
  return (
    <LyricPlayer
      ref={player}
      className="lyric-player"
      lyricLines={visibleLines}
      currentTime={Math.round(Math.max(0,clock.at()+offset))}
      playing={playing}
      enableSpring={!reduceMotion}
      enableBlur={!reduceMotion}
      enableScale={!reduceMotion}
      alignPosition={0.42}
      onLyricLineClick={(e) => seek(e.line.getLine().startTime - offset)}
      bottomLine={<small className="credits">歌词贡献 · {authors}</small>}
    />
  );
}
