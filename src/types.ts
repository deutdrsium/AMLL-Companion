export interface Music {
  musicId: string;
  musicName: string;
  albumName: string;
  artists: string[];
  duration: number;
}
export interface Capabilities {
  play: boolean;
  pause: boolean;
  previous: boolean;
  next: boolean;
  seek: boolean;
  shuffle: boolean;
  repeat: boolean;
}
export interface PlayerState {
  connected: boolean;
  error: string;
  music: Music | null;
  cover: string;
  position: number;
  monotonicAt: number;
  clockAtSend: number;
  lastUpdatedTime: string;
  timelineRevision: number;
  playing: boolean;
  rate: number;
  repeat: "off" | "all" | "one";
  shuffle: boolean;
  controls: Capabilities;
  source: string;
  sessions: { id: string; name: string }[];
  selectedSession: string;
  selection: string;
}
export interface Song {
  source?: 'amll' | 'lrclib' | 'kugou' | 'netease';
  providerData?: unknown;
  resolvedLyrics?: { lines: import('@applemusic-like-lyrics/core').LyricLine[]; source: string; authors: string };
  duration?: number;
  id: number | string;
  musicNames: string[];
  artistNames: string[];
  albumNames: string[];
  authorUsernames?: string[];
  lyrics?: string;
}
export interface Command {
  command: string;
  progress?: number;
  mode?: string;
  enabled?: boolean;
}
export interface WindowState {
  mode: "normal" | "floating" | "fullscreen";
  topmost: boolean;
}
declare global {
  interface Window {
    companion?: {
      native: boolean;
      providerQuery(value: unknown): Promise<any>;
      cancelProvider(id: string): Promise<void>;
      lyricsSearch(title: string): Promise<{status: number; rows: unknown}>;
      snapshot(): Promise<PlayerState>;
      subscribe(callback: (state: PlayerState) => void): () => void;
      command(value: Command): Promise<void>;
      selectSession(id: string): Promise<void>;
      window(action: string): Promise<WindowState>;
      windowState(): Promise<WindowState>;
      subscribeWindow(callback: (state: WindowState) => void): () => void;
      automation(value: {
        width: number;
        height: number;
      }): Promise<WindowState>;
    };
  }
}
