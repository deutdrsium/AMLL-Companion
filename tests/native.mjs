import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

await mkdir("test-results/native", { recursive: true });
const base = path.resolve("native/bin/Release/net10.0-windows10.0.19041.0");
const executable =
  process.env.NATIVE_EXECUTABLE || path.join(base, "AMLL Companion.exe");
const clockTest = spawn(executable, ["--self-test"], { windowsHide: true });
assert.equal((await once(clockTest, "exit"))[0], 0);
assert.match(
  await readFile(
    path.join(path.dirname(executable), "clock-tests.txt"),
    "utf8",
  ),
  /^PASS/,
);
const host = spawn(executable, ["--automation"], { windowsHide: true });
let browser, page, fixture;
let fixtureOutput = "";
async function waitState(predicate) {
  for (let i = 0; i < 150; i++) {
    const state = await page.evaluate(() => window.companion.snapshot());
    if (predicate(state)) return state;
    await page.waitForTimeout(100);
  }
  throw new Error('Timed out waiting for native state');
}
try {
  for (let i = 0; i < 100; i++) {
    if (host.exitCode !== null)
      throw new Error(`Native host exited: ${host.exitCode}`);
    try {
      const response = await fetch("http://127.0.0.1:9223/json/version");
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const context = browser.contexts()[0];
  page =
    context.pages().find((p) => p.url().includes("companion.local")) ||
    context.pages()[0];
  page.setDefaultTimeout(15000);
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 400));
  });
  console.log("WebView initial URL:", page.url());
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  const ttml =
    '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><body dur="03:00.000"><div><p itunes:key="L1" begin="00:00.000" end="00:05.000"><span begin="00:00.000" end="00:02.000">夜色</span><span begin="00:02.000" end="00:05.000">慢慢落下</span></p><p itunes:key="L2" begin="00:05.000" end="00:10.000"><span begin="00:05.000" end="00:07.000">让音乐</span><span begin="00:07.000" end="00:10.000">陪你停留</span></p><p itunes:key="L3" begin="00:10.000" end="00:16.000"><span begin="00:10.000" end="00:13.000">在微光之间</span><span begin="00:13.000" end="00:16.000">听见此刻</span></p><p itunes:key="L4" begin="00:16.000" end="00:23.000"><span begin="00:16.000" end="00:20.000">每一个音符</span><span begin="00:20.000" end="00:23.000">都有回声</span></p></div></body></tt>';
  await context.route("https://api.amll.dev/v1/lyrics/**", (route) => {
    const url = new URL(route.request().url());
    const name = url.searchParams.get("musicName") || "微光之间";
    const song = {
      id: name === "微光之间" ? 42 : 43,
      musicNames: [name],
      artistNames: ["AMLL Studio"],
      albumNames: ["夜色来信"],
      authorUsernames: ["Integration fixture"],
      lyrics: ttml,
    };
    return route.fulfill({
      json: {
        status: 200,
        data: url.pathname.endsWith("/search") ? { items: [song] } : song,
      },
    });
  });
  await page.waitForURL("https://companion.local/index.html", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.companion?.native);
  await page.evaluate(() => {
    localStorage.removeItem("lyric-offsets-v2");
    localStorage.removeItem("lyric-offset");
  });
  await page.reload();
  const artwork = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 800, 800);
    gradient.addColorStop(0, "#e9ad8c");
    gradient.addColorStop(0.5, "#986d85");
    gradient.addColorStop(1, "#282f52");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 800);
    ctx.fillStyle = "#f6d1ac";
    ctx.beginPath();
    ctx.arc(545, 230, 100, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(30,34,61,${0.08 + i * 0.015})`;
      ctx.beginPath();
      ctx.ellipse(380, 750 + i * 35, 700, 320, -0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff0de";
    ctx.font = "28px sans-serif";
    ctx.fillText("AMLL STUDIO", 64, 85);
    ctx.font = "58px sans-serif";
    ctx.fillText("夜色来信", 64, 685);
    ctx.font = "15px sans-serif";
    ctx.fillText("ORIGINAL TEST ARTWORK", 68, 730);
    // BMP was excluded by the old SMTC MIME allowlist.
    const rgba = ctx.getImageData(0, 0, 800, 800).data;
    const bmp = new Uint8Array(54 + 800 * 800 * 4);
    const view = new DataView(bmp.buffer);
    bmp[0] = 0x42; bmp[1] = 0x4d;
    view.setUint32(2, bmp.length, true); view.setUint32(10, 54, true);
    view.setUint32(14, 40, true); view.setInt32(18, 800, true);
    view.setInt32(22, -800, true); view.setUint16(26, 1, true);
    view.setUint16(28, 32, true); view.setUint32(34, rgba.length, true);
    for (let i = 0; i < rgba.length; i += 4) {
      bmp[54+i] = rgba[i+2]; bmp[55+i] = rgba[i+1];
      bmp[56+i] = rgba[i]; bmp[57+i] = rgba[i+3];
    }
    let binary = '';
    for (let i = 0; i < bmp.length; i += 8192) binary += String.fromCharCode(...bmp.subarray(i, i+8192));
    return { png: canvas.toDataURL("image/png").split(",")[1], bmp: btoa(binary) };
  });
  await writeFile(
    "test-results/native/artwork.png",
    Buffer.from(artwork.png, "base64"),
  );
  await writeFile('test-results/native/artwork.bmp', Buffer.from(artwork.bmp, 'base64'));
  fixture = spawn(
    path.resolve(
      "native/SmtcFixture/bin/Release/net10.0-windows10.0.19041.0/SmtcFixture.exe",
    ),
    [path.resolve("test-results/native/artwork.bmp")],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  fixture.stdout.on("data", (data) => {
    fixtureOutput += data.toString();
  });
  fixture.stderr.on("data", (data) => console.log("FIXTURE", data.toString()));
  for (let i = 0; i < 50 && !fixtureOutput.includes("READY"); i++)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.match(fixtureOutput, /READY/);
  assert.match(fixtureOutput, /"imageMime":"image\/bmp"/, 'Fixture must test the old unsupported BMP cover format');
  await waitState(state =>
    state.sessions.some((s) =>
      /SmtcFixture/i.test(s.id),
    ),
  );
  await page.evaluate(async () => {
    const state = await window.companion.snapshot();
    const session = state.sessions.find((s) => /SmtcFixture/i.test(s.id));
    await window.companion.selectSession(session.id);
  });
  await page.getByRole("heading", { name: "微光之间", exact: true }).waitFor();
  await page.locator(".lyric-player").waitFor();
  await page.waitForFunction(
    () => document.querySelector(".artwork img")?.naturalWidth > 0,
  );
  console.log("Real Windows SMTC discovery and metadata passed.");
  const diagnostics = () =>
    page.evaluate(() => window.companion.automation({ diagnostics: true }));
  const before = await diagnostics();
  const position = Number(
    await page
      .getByRole("slider", { name: "播放进度", exact: true })
      .inputValue(),
  );
  await page.waitForTimeout(2000);
  const advanced = Number(
    await page
      .getByRole("slider", { name: "播放进度", exact: true })
      .inputValue(),
  );
  const after = await diagnostics();
  assert.ok(
    advanced - position > 1700,
    `Clock advanced ${advanced - position}ms`,
  );
  assert.equal(
    after.trackUpdates,
    before.trackUpdates,
    "UI animation must not request high-frequency bridge updates",
  );
  assert.match(after.engine, /UniLyric smtc-suite/);
  assert.equal(after.highFrequencyUpdates, false);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).waitFor();
  assert.match(fixtureOutput, /"command":"pause"/);
  const paused = Number(
    await page
      .getByRole("slider", { name: "播放进度", exact: true })
      .inputValue(),
  );
  await page.waitForTimeout(500);
  assert.ok(
    Math.abs(
      Number(
        await page
          .getByRole("slider", { name: "播放进度", exact: true })
          .inputValue(),
      ) - paused,
    ) < 150,
  );
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByRole("button", { name: "暂停", exact: true }).waitFor();
  await page.evaluate(()=>Promise.all(Array.from({length:20},(_,i)=>window.companion.command({command:i%2?'resume':'pause'}))));
  await waitState(state=>state.playing);
  console.log('Concurrent bridge commands serialized without StreamWriter failures.');
  fixture.stdin.write("seek:12000\n");
  await page.waitForFunction(
    () =>
      Number(document.querySelector('[aria-label="播放进度"]').value) >= 12000,
  );
  const seekAllowed = await page.evaluate(
    async () => (await window.companion.snapshot()).controls.seek,
  );
  assert.equal(seekAllowed, true, 'The SMTC fixture must expose seeking');
  const timeline = page.getByRole('slider', {name:'播放进度',exact:true});
  const timelineBounds = await timeline.boundingBox();
  await timeline.click({position:{x:Math.floor(timelineBounds.width*.4),y:Math.max(1,timelineBounds.height/2)}});
  await page.waitForTimeout(250);
  assert.match(fixtureOutput, /"command":"seek"/);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("slider", { name: "全局歌词偏移", exact: true })
    .fill("200");
  await page
    .getByRole("slider", { name: "当前歌曲偏移", exact: true })
    .fill("-100");
  await page.getByText("合计偏移：+100 ms。", { exact: false }).waitFor();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.reload();
  await page.getByRole("heading", { name: "微光之间", exact: true }).waitFor();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  assert.equal(
    await page
      .getByRole("slider", { name: "全局歌词偏移", exact: true })
      .inputValue(),
    "200",
  );
  assert.equal(
    await page
      .getByRole("slider", { name: "当前歌曲偏移", exact: true })
      .inputValue(),
    "-100",
  );
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  const previousCover = (await page.evaluate(() => window.companion.snapshot())).cover;
  fixture.stdin.write("next\n");
  await page
    .getByRole("heading", { name: "夜色慢慢落下", exact: true })
    .waitFor();
  // Apple Music can announce the title first and deliver the replacement thumbnail later.
  await page.waitForTimeout(600);
  const nextCover = await readFile('test-results/native/artwork.bmp');
  for (let i = 54; i < nextCover.length; i += 4) nextCover[i] = 255-nextCover[i];
  await writeFile('test-results/native/next-artwork.bmp', nextCover);
  fixture.stdin.write(`cover:${path.resolve('test-results/native/next-artwork.bmp')}\n`);
  const coverState = await waitState(s => !!s.cover && s.cover !== previousCover);
  assert.equal(coverState.cover, `data:image/bmp;base64,${nextCover.toString('base64')}`);
  console.log('Delayed cover update on the same track replaced the previous cover.');
  await page.getByRole("button", { name: "设置", exact: true }).click();
  assert.equal(
    await page
      .getByRole("slider", { name: "当前歌曲偏移", exact: true })
      .inputValue(),
    "0",
  );
  assert.equal(
    await page
      .getByRole("slider", { name: "全局歌词偏移", exact: true })
      .inputValue(),
    "200",
  );
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  const sizes = [
    [1280, 820],
    [700, 900],
    [850, 480],
    [380, 300],
    [380, 620],
    [320, 200],
    [1000, 300],
  ];
  await page.locator(".lyric-player").waitFor();
  fixture.stdin.write("seek:6500\n");
  await page.waitForTimeout(1200);
  for (const [width, height] of sizes) {
    await page.evaluate(
      ({ width, height }) => window.companion.automation({ width, height }),
      { width, height },
    );
    await page.waitForTimeout(700);
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
      ),
      false,
      `${width}x${height} overflow`,
    );
    const bounds = await page
      .getByRole("button", { name: "暂停", exact: true })
      .boundingBox();
    assert.ok(
      bounds &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= (await page.evaluate(() => innerHeight)),
      `${width}x${height} controls not visible`,
    );
    if(width < 521) {
      const order=await page.evaluate(()=>{
        const art=document.querySelector('.artwork').getBoundingClientRect();
        const lyrics=document.querySelector('.lyrics-panel').getBoundingClientRect();
        const timeline=document.querySelector('.timeline').getBoundingClientRect();
        return art.bottom<=lyrics.top && lyrics.bottom<=timeline.top;
      });
      assert.equal(order,true,`${width}x${height} must place cover above lyrics and progress below lyrics`);
    }
    await page.screenshot({
      path: `test-results/native/${width}x${height}.png`,
    });
  }
  const floating = await page.evaluate(() =>
    window.companion.window("floating"),
  );
  assert.equal(floating.mode, "floating");
  assert.equal(floating.topmost, true);
  await page.waitForTimeout(800);
  await page.screenshot({path:'test-results/native/floating.png'});
  assert.equal(
    (await page.evaluate(() => window.companion.window("pin"))).topmost,
    false,
  );
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("slider", { name: "当前歌曲偏移", exact: true })
    .waitFor();
  await page.screenshot({ path: "test-results/native/floating-settings.png" });
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.evaluate(() => window.companion.window("floating"));
  await page.evaluate(() =>
    window.companion.automation({ width: 1280, height: 820 }),
  );
  await page.keyboard.press("F11");
  await page.waitForFunction(
    () => document.querySelector(".app").dataset.windowMode === "fullscreen",
  );
  await page.screenshot({ path: "test-results/native/fullscreen.png" });
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector(".app").dataset.windowMode === "normal",
  );
  fixture.stdin.write("quit\n");
  await once(fixture, "exit");
  fixture = null;
  await waitState(
    state =>
      !state.sessions.some((s) =>
        /SmtcFixture/i.test(s.id),
      ),
  );
  assert.equal(
    await page.getByRole("button", { name: "播放", exact: true }).isDisabled(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Native desktop passed: real SMTC events/control, no polling, pause/resume/seek/track, persisted offsets, 7 window sizes, phone-style floating layout, pin, fullscreen, disconnect.",
  );
} catch (error) {
  if (page) {
    console.log(await page.locator("body").innerText());
    await page.screenshot({ path: "test-results/native/failure.png" });
  }
  console.log("Fixture output:", fixtureOutput);
  throw error;
} finally {
  fixture?.stdin.write("quit\n");
  fixture?.kill();
  if (page)
    await page.evaluate(() => window.companion.window("close")).catch(() => {});
  await browser?.close();
  host.kill();
}
