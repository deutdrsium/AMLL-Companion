export interface Music {
  musicId: string;
  musicName: string;
  albumName: string;
  artists: string[];
  duration: number;
  titleAliases?: string[];
  artistAliases?: string[];
  metadataReleaseRegion?: string;
  metadataReleaseCountries?: string[];
  metadataReleaseLocale?: string;
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
  source?: 'amll' | 'lrclib' | 'kugou' | 'netease' | 'qq' | 'kuwo' | 'migu' | 'web';
  sourceUrl?: string;
  providerData?: unknown;
  inspectionError?: string;
  resolvedLyrics?: { lines: import('@applemusic-like-lyrics/core').LyricLine[]; rawLines?: import('@applemusic-like-lyrics/core').LyricLine[]; source: string; authors: string; selectionTiming?: [number,number] };
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
  maximized?: boolean;
  mode: "normal" | "floating" | "fullscreen";
  topmost: boolean;
}
declare global {
  interface Window {
    companion?: {
      native: boolean;
      debug?: boolean;
      diagnosticLog?(value: {event:string;atMs:number;data:unknown}): void;
      alignmentStatus(): Promise<{available:boolean}>;
      alignLyrics(value:unknown): Promise<any>;
      cancelAlignment(id:string): Promise<void>;
      subscribeAlignment(callback:(value:{requestId:string;message:string})=>void):()=>void;
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
