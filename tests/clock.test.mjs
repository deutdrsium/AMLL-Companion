import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaybackClock, readOffsets, songOffsetKey } from "../shared/clock.mjs";

const music = {
  musicName: "Song",
  albumName: "Album",
  artists: ["Artist"],
  duration: 180000,
};
const sample = {
  music,
  position: 10000,
  monotonicAt: 1000,
  clockAtSend: 3000,
  playing: true,
  connected: true,
  rate: 1,
  timelineRevision: 1,
  source: "test",
};
test("renderer advances without SMTC calls or wall clock, including host sample age", () => {
  let now = 500;
  const clock = new PlaybackClock(() => now);
  clock.sync(sample);
  assert.equal(clock.at(), 12000);
  now += 60000;
  assert.equal(clock.at(), 72000);
  const originalDateNow = Date.now;
  try {
    Date.now = () => -99999999999;
    assert.equal(clock.at(), 72000);
  } finally {
    Date.now = originalDateNow;
  }
});
test("duplicate timeline and cover notifications do not jitter or reset clock", () => {
  let now = 0;
  const clock = new PlaybackClock(() => now);
  clock.sync(sample);
  const revision = clock.seekRevision;
  now = 1000;
  clock.sync({ ...sample, clockAtSend: 4000 });
  assert.equal(clock.at(), 13000);
  assert.equal(clock.seekRevision, revision);
  clock.sync({ ...sample, position: 10020, clockAtSend: 4000 });
  assert.equal(clock.at(), 13000);
});
test('ten minutes of quantized timeline samples never rewind or trigger seeking', () => {
  let now = 0;
  const clock = new PlaybackClock(() => now);
  const state = { ...sample, music: {...music, duration: 900000}, position: 10000, monotonicAt: 0, clockAtSend: 0 };
  clock.sync(state);
  const revision = clock.seekRevision;
  let previous = clock.at();
  for (now = 16; now < 600000; now += 16) {
    if (now % 1008 === 0) clock.sync({...state, position: 10000 + now + (now % 2016 ? -850 : 450), monotonicAt: now, clockAtSend: now});
    const next = clock.at();
    assert.ok(next >= previous, `rewound at ${now}`);
    assert.ok(next - previous <= 18, `jump at ${now}: ${next-previous}`);
    previous = next;
  }
  assert.equal(clock.seekRevision, revision);
  clock.sync({...state, position: 20000, monotonicAt: now, clockAtSend: now, timelineRevision: 2});
  assert.equal(clock.at(), 20000, 'real seek must remain immediate');
  assert.equal(clock.seekRevision, revision + 1);
});
test("pause, resume, seek, track switch, disconnect and playback rate reset correctly", () => {
  let now = 0;
  const clock = new PlaybackClock(() => now);
  clock.sync(sample);
  now = 500;
  clock.sync({
    ...sample,
    position: 12500,
    monotonicAt: 3500,
    clockAtSend: 3500,
    playing: false,
    timelineRevision: 2,
  });
  now = 10000;
  assert.equal(clock.at(), 12500);
  clock.sync({
    ...sample,
    position: 60000,
    monotonicAt: 5000,
    clockAtSend: 5000,
    timelineRevision: 3,
  });
  now += 1000;
  assert.equal(clock.at(), 61000);
  clock.sync({
    ...sample,
    music: { ...music, musicName: "Next" },
    position: 0,
    monotonicAt: 6000,
    clockAtSend: 6000,
    timelineRevision: 4,
    rate: 2,
  });
  now += 1000;
  assert.equal(clock.at(), 2000);
  clock.sync({
    ...sample,
    position: 2000,
    monotonicAt: 7000,
    clockAtSend: 7000,
    connected: false,
    timelineRevision: 5,
  });
  now += 99999;
  assert.equal(clock.at(), 2000);
});
test("global and per-song offsets persist independently and migrate old global value", () => {
  const storage = { getItem: (key) => (key === "lyric-offset" ? "200" : null) };
  assert.deepEqual(readOffsets(storage), { global: 200, songs: {} });
  const key = songOffsetKey(music);
  const saved = { global: -100, songs: { [key]: 350 } };
  assert.deepEqual(
    readOffsets({ getItem: () => JSON.stringify(saved) }),
    saved,
  );
  assert.notEqual(songOffsetKey({ ...music, albumName: "Live" }), key);
  assert.deepEqual(readOffsets({ getItem: () => "broken" }), {
    global: 0,
    songs: {},
  });
});
