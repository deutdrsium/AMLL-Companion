// Host Stopwatch ticks are translated once into the renderer's performance.now() domain.
export class PlaybackClock {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.base = 0;
    this.anchor = now();
    this.duration = 0;
    this.rate = 1;
    this.playing = false;
    this.key = "";
    this.revision = -1;
    this.seekRevision = 0;
    this.correction = 0;
  }
  at(now = this.now()) {
    return Math.max(
      0,
      Math.min(
        this.duration,
        this.base + this.slew(now) +
          (this.playing ? Math.max(0, now - this.anchor) * this.rate : 0),
      ),
    );
  }
  slew(now) {
    return Math.sign(this.correction) * Math.min(Math.abs(this.correction), Math.max(0, now - this.anchor) * 0.08);
  }
  sync(state) {
    const now = this.now();
    const key = state.music
      ? JSON.stringify([
          state.source,
          state.music.musicName,
          state.music.artists,
          state.music.albumName,
        ])
      : "";
    const duration = Math.max(0, state.music?.duration || 0);
    const playing = !!(state.playing && state.connected);
    const rate = state.rate > 0 && Number.isFinite(state.rate) ? state.rate : 1;
    const age = Math.max(0, state.clockAtSend - state.monotonicAt);
    const target = Math.min(
      duration,
      Math.max(0, state.position + (playing ? age * rate : 0)),
    );
    const discontinuity =
      key !== this.key || state.timelineRevision !== this.revision;
    const current = this.at(now);
    const error = target - current;
    if (
      discontinuity ||
      playing !== this.playing ||
      rate !== this.rate
    ) {
      this.base = !discontinuity && rate === this.rate && Math.abs(error) <= 2000 ? current : target;
      this.anchor = now;
      this.correction = !discontinuity && playing ? target - this.base : 0;
      if (discontinuity) this.seekRevision++;
    } else if (playing && Math.abs(error) > 50) {
      // Correct drift at at most 8% speed, never by moving the lyric clock backwards.
      this.base = current;
      this.anchor = now;
      this.correction = error;
    }
    this.duration = duration;
    this.playing = playing;
    this.rate = rate;
    this.key = key;
    this.revision = state.timelineRevision;
  }
}
export function songOffsetKey(music) {
  return music
    ? JSON.stringify([
        music.musicName.normalize("NFKC"),
        music.artists,
        music.albumName.normalize("NFKC"),
      ])
    : "";
}
export function readOffsets(storage) {
  try {
    const saved = JSON.parse(storage.getItem("lyric-offsets-v2") || "{}");
    return {
      global: safeOffset(
        saved.global ?? Number(storage.getItem("lyric-offset") || 0),
      ),
      songs: Object.fromEntries(
        Object.entries(saved.songs || {})
          .filter(
            ([key, value]) =>
              key.length < 4096 &&
              typeof value === "number" &&
              Number.isFinite(value),
          )
          .map(([key, value]) => [key, safeOffset(value)]),
      ),
    };
  } catch {
    return { global: 0, songs: {} };
  }
}
export function safeOffset(value) {
  return Number.isFinite(value)
    ? Math.round(Math.max(-10000, Math.min(10000, value)))
    : 0;
}
