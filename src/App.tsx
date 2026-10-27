import { useEffect, useRef, useState } from "react";
import { BackgroundRender } from "@applemusic-like-lyrics/react";
import type { LyricLine } from "@applemusic-like-lyrics/core";
import {
  AudioLines,
  Music2,
  Settings2,
  Minus,
  Square,
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Maximize2,
  Minimize2,
  ChevronLeft,
  Radio,
  Search,
  Check,
  RefreshCw,
  PictureInPicture2,
  Pin,
  PinOff,
} from "lucide-react";
import { getLyrics, searchLyrics } from "./lyrics";
import {
  PlaybackClock,
  readOffsets,
  safeOffset,
  songOffsetKey,
} from "../shared/clock.mjs";
import { LiveLyrics, Timeline } from "./Playback";
import type { PlayerState, Song, Command, WindowState } from "./types";

const initial: PlayerState = {
  connected: false,
  error: "",
  music: null,
  cover: "",
  position: 0,
  monotonicAt: 0,
  clockAtSend: 0,
  lastUpdatedTime: "",
  timelineRevision: 0,
  playing: false,
  rate: 1,
  repeat: "off",
  shuffle: false,
  controls: {
    play: false,
    pause: false,
    previous: false,
    next: false,
    seek: false,
    shuffle: false,
    repeat: false,
  },
  source: "",
  sessions: [],
  selectedSession: "",
  selection: "auto",
};

function OffsetControl({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
  disabled?: boolean;
}) {
  return (
    <div className="offset-control">
      <div className="setting">
        <strong>{label}</strong>
        <span>
          {value > 0 ? "+" : ""}
          {value} ms
        </span>
      </div>
      <div className="offset-row">
        <button
          aria-label={`${label}减少100毫秒`}
          disabled={disabled}
          onClick={() => onChange(value - 100)}
        >
          −
        </button>
        <input
          aria-label={label}
          type="range"
          min={-10000}
          max={10000}
          step={50}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          aria-label={`${label}增加100毫秒`}
          disabled={disabled}
          onClick={() => onChange(value + 100)}
        >
          +
        </button>
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => onChange(0)}
        >
          重置
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(initial);
  const [settings, setSettings] = useState(false);
  const [picker, setPicker] = useState(false);
  const [focus, setFocus] = useState(false);
  const [windowState, setWindowState] = useState<WindowState>({
    mode: "normal",
    topmost: false,
  });
  const [viewport, setViewport] = useState({
    width: innerWidth,
    height: innerHeight,
  });
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [candidates, setCandidates] = useState<Song[]>([]);
  const [lyricStatus, setLyricStatus] = useState("等待音乐响起");
  const [authors, setAuthors] = useState("");
  const [lyricSource, setLyricSource] = useState("");
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [offsets, setOffsets] = useState(() => readOffsets(localStorage));
  const [reduceMotion, setReduceMotion] = useState(
    () => localStorage.getItem("reduce-motion") === "true",
  );
  const clock = useRef(new PlaybackClock()).current;
  const activeRequest = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const key = state.music
    ? JSON.stringify([
        state.source,
        state.music.musicName,
        state.music.artists,
        state.music.albumName,
      ])
    : "";
  const offsetKey = songOffsetKey(state.music);
  const songOffset = offsets.songs[offsetKey] || 0;
  const offset = offsets.global + songOffset;
  const mini =
    windowState.mode === "floating" ||
    viewport.width <= 520 ||
    viewport.height <= 360;
  const ready = !!state.music?.musicName && state.connected;

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: innerWidth, height: innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    const api = window.companion;
    if (!api) return;
    let updated = false,
      alive = true;
    const update = (s: PlayerState) => {
      clock.sync(s);
      setState(s);
    };
    const off = api.subscribe((s) => {
      updated = true;
      update(s);
    });
    const offWindow = api.subscribeWindow(setWindowState);
    api
      .snapshot()
      .then((s) => {
        if (alive && !updated) update(s);
      })
      .catch((e) => setError(String(e)));
    api
      .windowState()
      .then((s) => {
        if (alive) setWindowState(s);
      })
      .catch((e) => setError(String(e)));
    return () => {
      alive = false;
      off();
      offWindow();
    };
  }, [clock]);
  useEffect(() => {
    localStorage.setItem("lyric-offsets-v2", JSON.stringify(offsets));
  }, [offsets]);
  useEffect(() => {
    localStorage.setItem("reduce-motion", String(reduceMotion));
  }, [reduceMotion]);
  useEffect(() => {
    if (settings || picker) dialog.current?.showModal();
    else dialog.current?.close();
  }, [settings, picker]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLines([]);
    setCandidates([]);
    setAuthors("");
    setLyricSource("");
    setPicker(false);
    if (!state.music?.musicName) {
      setLyricStatus("等待音乐响起");
      return;
    }
    setLyricStatus("正在搜索 AMLL、网易云、酷狗音乐及 LRCLIB…");
    const music = state.music;
    const timer = setTimeout(async () => {
      try {
        const { items, match } = await searchLyrics(music, controller.signal);
        if (controller.signal.aborted) return;
        setCandidates(items);
        if (!match) {
          setLyricStatus(
            items.length ? "找到相关歌词，请确认歌曲版本" : "各来源未找到匹配的同步歌词",
          );
          return;
        }
        const result = await getLyrics(match, controller.signal);
        if (!controller.signal.aborted) {
          setLines(result.lines);
          setAuthors(result.authors);
          setLyricSource(result.source);
          setLyricStatus("逐词歌词");
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setLyricStatus(e instanceof Error ? e.message : "歌词加载失败");
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [key, retry]);

  async function selectSong(song: Song) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPicker(false);
    setLines([]);
    setLyricStatus("正在加载歌词…");
    try {
      const result = await getLyrics(song, controller.signal);
      if (!controller.signal.aborted) {
        setLines(result.lines);
        setAuthors(result.authors);
        setLyricSource(result.source);
        setLyricStatus("逐词歌词");
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setLyricStatus(e instanceof Error ? e.message : "歌词加载失败");
    }
  }
  async function command(value: Command) {
    try {
      await window.companion?.command(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "播放控制失败");
    }
  }
  async function windowAction(action: string) {
    try {
      if (window.companion)
        setWindowState(await window.companion.window(action));
      else if (action === "fullscreen")
        document.fullscreenElement
          ? await document.exitFullscreen()
          : await document.documentElement.requestFullscreen();
    } catch (e) {
      setError(e instanceof Error ? e.message : "窗口操作失败");
    }
  }
  const seek = (value: number) => {
    if (ready && state.controls.seek)
      void command({
        command: "seekPlayProgress",
        progress: Math.round(
          Math.max(0, Math.min(state.music!.duration, value)),
        ),
      });
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        void windowAction("fullscreen");
        return;
      }
      if (event.key === "Escape" && windowState.mode === "fullscreen") {
        void windowAction("exitFullscreen");
        return;
      }
      if (
        event.code !== "Space" ||
        (event.target as HTMLElement).closest("button,input,select,dialog") ||
        !ready
      )
        return;
      if (state.playing ? !state.controls.pause : !state.controls.play) return;
      event.preventDefault();
      void command({ command: state.playing ? "pause" : "resume" });
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [ready, state.playing, state.controls, windowState.mode]);
  const closeDialog = () => {
    setSettings(false);
    setPicker(false);
  };
  const updateSongOffset = (value: number) =>
    setOffsets((previous) => ({
      ...previous,
      songs: { ...previous.songs, [offsetKey]: safeOffset(value) },
    }));

  return (
    <div
      className={`app ${focus ? "focus" : ""} ${mini ? "mini" : ""} ${reduceMotion ? "reduced-motion" : ""}`}
      data-window-mode={windowState.mode}
    >
      <div className="ambient" />
      {state.cover && (
        <BackgroundRender
          className="album-background"
          style={{ display: "block" }}
          album={state.cover}
          playing={state.playing}
          staticMode={reduceMotion}
          fps={mini ? 18 : 24}
          renderScale={mini ? 0.35 : 0.5}
        />
      )}
      {state.cover && <div className="cover-glow" style={{backgroundImage: `url("${state.cover}")`}}/>}
      <div className="light-bloom"/>
      <div className="shade" />
      <header
        className="titlebar"
        onPointerDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest("button"))
            void windowAction("drag");
        }}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest("button"))
            void windowAction("maximize");
        }}
      >
        <span className="brand">
          <Music2 size={18} fill="currentColor" /> AMLL <span>Companion 0.5.1</span>
        </span>
        <div className="window-actions">
          {mini && (
            <>
              <button
                aria-label="设置"
                title="设置"
                onClick={() => setSettings(true)}
              >
                <Settings2 size={15} />
              </button>
              <button
                aria-label={windowState.topmost ? "取消置顶" : "窗口置顶"}
                title="窗口置顶"
                onClick={() => windowAction("pin")}
              >
                {windowState.topmost ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              <button
                aria-label="退出悬浮窗"
                title="退出悬浮窗"
                onClick={() =>
                  windowAction(
                    windowState.mode === "floating" ? "floating" : "maximize",
                  )
                }
              >
                <Maximize2 size={14} />
              </button>
            </>
          )}
          <button aria-label="最小化" onClick={() => windowAction("minimize")}>
            <Minus size={15} />
          </button>
          {!mini && (
            <button
              aria-label="最大化或还原"
              onClick={() => windowAction("maximize")}
            >
              <Square size={12} />
            </button>
          )}
          <button
            className="close"
            aria-label="关闭"
            onClick={() => windowAction("close")}
          >
            <X size={17} />
          </button>
        </div>
      </header>
      <nav className="topbar">
        <div className="nav-title">
          <span className="app-icon">
            <AudioLines size={20} />
          </span>
          <div>
            <strong>正在播放</strong>
            <span>让音乐，留在此刻。</span>
          </div>
        </div>
        <div className="top-actions">
          <button
            className={`connection ${state.connected ? "online" : ""}`}
            onClick={() => setSettings(true)}
          >
            <i />
            {state.connected ? "SMTC 已连接" : "等待播放"}
          </button>
          <button
            className="icon"
            title="悬浮窗"
            aria-label="切换悬浮窗"
            onClick={() => windowAction("floating")}
          >
            <PictureInPicture2 size={20} />
          </button>
          <button
            className="icon"
            title="全屏 F11"
            aria-label={windowState.mode === "fullscreen" ? "退出全屏" : "全屏"}
            onClick={() => windowAction("fullscreen")}
          >
            {windowState.mode === "fullscreen" ? (
              <Minimize2 size={19} />
            ) : (
              <Maximize2 size={19} />
            )}
          </button>
          <button
            className="icon"
            title="连接与显示设置"
            aria-label="设置"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </nav>
      <main>
        <section className="player-panel" aria-label="正在播放的歌曲">
          <div className={`artwork ${state.playing ? "playing" : ""}`}>
            {state.cover ? (
              <img
                src={state.cover}
                alt={`${state.music?.albumName || "当前歌曲"} 专辑封面`}
              />
            ) : (
              <div className="empty-art">
                <div className="vinyl">
                  <div>
                    <Music2 size={44} strokeWidth={1.1} />
                  </div>
                </div>
                <span>YOUR MUSIC. IN FOCUS.</span>
              </div>
            )}
          </div>
          <div className="track-info">
            <div>
              <h1>{state.music?.musicName || "每一首，都值得沉浸"}</h1>
              <p>
                {state.music?.artists.join(" / ") ||
                  "在 Apple Music 中播放一首歌曲"}
              </p>
              <span>
                {state.music?.albumName || "自动连接 Windows 媒体会话"}
              </span>
            </div>
            <span className={`equalizer ${state.playing ? "active" : ""}`}>
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          <Timeline
            clock={clock}
            enabled={ready && state.controls.seek}
            seek={seek}
          />
          <div className="transport">
            <button
              className={`icon ${state.shuffle ? "selected" : ""}`}
              aria-label="随机播放"
              aria-pressed={state.shuffle}
              disabled={!ready || !state.controls.shuffle}
              onClick={() =>
                command({ command: "setShuffleMode", enabled: !state.shuffle })
              }
            >
              <Shuffle size={19} />
            </button>
            <button
              className="icon skip"
              aria-label="上一首"
              disabled={!ready || !state.controls.previous}
              onClick={() => command({ command: "backwardSong" })}
            >
              <SkipBack size={27} fill="currentColor" />
            </button>
            <button
              className="play"
              aria-label={state.playing ? "暂停" : "播放"}
              disabled={
                !ready ||
                (state.playing ? !state.controls.pause : !state.controls.play)
              }
              onClick={() =>
                command({ command: state.playing ? "pause" : "resume" })
              }
            >
              {state.playing ? (
                <Pause size={31} fill="currentColor" />
              ) : (
                <Play size={31} fill="currentColor" />
              )}
            </button>
            <button
              className="icon skip"
              aria-label="下一首"
              disabled={!ready || !state.controls.next}
              onClick={() => command({ command: "forwardSong" })}
            >
              <SkipForward size={27} fill="currentColor" />
            </button>
            <button
              className={`icon ${state.repeat !== "off" ? "selected" : ""}`}
              aria-label={`循环播放：${state.repeat}`}
              disabled={!ready || !state.controls.repeat}
              onClick={() =>
                command({
                  command: "setRepeatMode",
                  mode:
                    state.repeat === "off"
                      ? "all"
                      : state.repeat === "all"
                        ? "one"
                        : "off",
                })
              }
            >
              {state.repeat === "one" ? (
                <Repeat1 size={19} />
              ) : (
                <Repeat size={19} />
              )}
            </button>
          </div>
          <div className="source-label">
            <Radio size={13} />
            <span>UniLyric 引擎 · 音乐由原播放器播放</span>
          </div>
        </section>
        <section className="lyrics-panel" aria-label="同步歌词">
          <div className="lyrics-heading">
            <span>
              <AudioLines size={16} />
              {lines.length ? "实时歌词" : "歌词"}
            </span>
            <button
              className="icon"
              title="选择歌词版本"
              aria-label="选择歌词版本"
              disabled={!candidates.length}
              onClick={() => setPicker(true)}
            >
              <Search size={17} />
            </button>
          </div>
          {lines.length ? (
            <LiveLyrics
              clock={clock}
              lines={lines}
              offset={offset}
              playing={state.playing && state.connected}
            reduceMotion={reduceMotion}
              seek={seek}
              authors={authors}
            />
          ) : (
            <div className="empty-lyrics">
              <span className="lyric-symbol">
                <AudioLines size={34} strokeWidth={1.3} />
              </span>
              <h2>{state.music ? lyricStatus : "听见音乐\n看见每一句"}</h2>
              <p>
                {state.music
                  ? "自动优选：逐词时间轴 → 翻译 → 音译"
                  : "打开 Apple Music，播放即可自动连接。"}
              </p>
              {!state.connected ? (
                <button className="primary" onClick={() => setSettings(true)}>
                  选择播放器 <Radio size={16} />
                </button>
              ) : state.music ? (
                <div className="inline-actions">
                  <button onClick={() => setRetry((n) => n + 1)}>
                    <RefreshCw size={15} />
                    重新查询
                  </button>
                  {!!candidates.length && (
                    <button onClick={() => setPicker(true)}>选择版本</button>
                  )}
                </div>
              ) : (
                <span className="waiting">连接就绪，等待播放信息</span>
              )}
            </div>
          )}
          <div className="lyrics-footer">
            <span>
              {lines.length
                ? `${lyricSource}${offset ? ` · ${offset > 0 ? "+" : ""}${offset} ms` : ""}`
                : "APPLE MUSIC–LIKE LYRICS"}
            </span>
            <button
              className="icon"
              aria-label={focus ? "退出专注模式" : "专注模式"}
              title="专注模式"
              onClick={() => setFocus((v) => !v)}
            >
              {focus ? <ChevronLeft size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>
        </section>
      </main>
      <footer className="footer">
        <span>
          <i className={state.connected ? "green" : ""} />
          {state.error ||
            (!window.companion
              ? "浏览器预览 · 启动桌面版即可自动连接"
              : state.connected
                ? "已连接 Windows 媒体会话"
                : "等待 Apple Music 开始播放")}
        </span>
        <span>
          AMLL <b>COMPANION</b>
        </span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={closeDialog}
        onClick={(e) => {
          if (e.target === dialog.current) closeDialog();
        }}
      >
        <div className="dialog-body">
          <div className="dialog-title">
            <h2>{settings ? "连接与显示" : "选择歌词版本"}</h2>
            <button
              className="icon"
              aria-label="关闭弹窗"
              onClick={closeDialog}
            >
              <X size={20} />
            </button>
          </div>
          {settings ? (
            <>
              <div className="connection-card">
                <Radio size={24} />
                <div>
                  <strong>
                    {state.connected ? "已连接 Windows SMTC" : "等待音乐播放器"}
                  </strong>
                  <p>内置 UniLyric SMTC 引擎，无需额外启动连接器。</p>
                </div>
                {state.connected && <Check size={20} />}
              </div>
              <label className="session-setting">
                <span>播放来源</span>
                <select
                  aria-label="播放来源"
                  value={state.selection}
                  onChange={(e) =>
                    window.companion
                      ?.selectSession(e.target.value)
                      .catch((error) => setError(String(error)))
                  }
                >
                  <option value="auto">自动选择（优先 Apple Music）</option>
                  {state.sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {state.selection !== "auto" &&
                    !state.sessions.some((s) => s.id === state.selection) && (
                      <option value={state.selection}>所选播放器未运行</option>
                    )}
                </select>
              </label>
              <p className="hint">
                播放时间由系统媒体事件更新，在两次事件之间本地推算。播放控制以源播放器实际支持的功能为准。
              </p>
              <OffsetControl
                label="全局歌词偏移"
                value={offsets.global}
                onChange={(value) =>
                  setOffsets((previous) => ({
                    ...previous,
                    global: safeOffset(value),
                  }))
                }
              />
              <OffsetControl
                label="当前歌曲偏移"
                value={songOffset}
                disabled={!state.music?.musicName}
                onChange={updateSongOffset}
              />
              <p className="hint offset-summary">
                合计偏移：{offset > 0 ? "+" : ""}
                {offset}{" "}
                ms。正值让歌词提前，负值让歌词延后。单曲设置按曲名、歌手和专辑保存。
              </p>
              <label className="setting">
                <div>
                  <strong>减少动态效果</strong>
                  <p>静态背景与更轻量的歌词动画。</p>
                </div>
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(e) => setReduceMotion(e.target.checked)}
                />
              </label>
              <p className="hint">
                F11 切换全屏，Esc
                退出全屏。悬浮窗默认置顶，可通过图钉切换。自动歌词查询会将曲名和歌手发送至
                AMLL、网易云、酷狗音乐及 LRCLIB，发送曲名、歌手等元数据并比较歌词质量。
              </p>
            </>
          ) : (
            <>
              <p className="hint">
                选择与当前录音一致的版本。点击歌词行可跳转播放。
              </p>
              <div className="candidates">
                {candidates.map((s) => (
                  <button key={s.id} onClick={() => selectSong(s)}>
                    <strong>{s.musicNames.join(" / ")}</strong>
                    <span>
                      {s.artistNames.join(" / ")} · {s.albumNames.join(" / ")} · {s.resolvedLyrics?.source || (s.source === 'netease' ? '网易云音乐' : s.source === 'kugou' ? '酷狗音乐' : s.source === 'lrclib' ? 'LRCLIB · 逐行' : 'AMLL')}
                      {s.resolvedLyrics?.lines.some(l => l.translatedLyric?.trim()) ? ' · 含翻译' : ''}
                      {s.resolvedLyrics?.lines.some(l => l.romanLyric?.trim()) ? ' · 含音译' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </dialog>
      {error && (
        <div className="toast" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
