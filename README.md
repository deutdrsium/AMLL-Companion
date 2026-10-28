# AMLL Companion

基于 [Apple Music-like Lyrics](https://github.com/amll-dev/applemusic-like-lyrics) 的 Windows 桌面音乐伴侣，为支持 Windows SMTC 的播放器提供 Apple Music 风格的歌词界面。

**音乐仍由 Apple Music 等源播放器播放。** 本项目不提供音乐库，也不捕获播放器音频。可选的逐字对齐功能会下载匹配录音并在本机解码，用于生成时间轴。

## 功能

- **连接 Windows 媒体会话**：内置 UniLyric 使用的 smtc-suite 引擎，读取曲名、歌手、专辑、封面和进度；默认优先连接 Apple Music，也可以手动选择其他会话。
- **同步歌词**：使用 AMLL 渲染逐词高亮、滚动、模糊与背景光效；支持逐行歌词、翻译及音译。在设置中可独立开关“显示翻译”和“显示音译”，选择在本机保存，对后续切歌和重启生效；隐藏不影响歌词版本评分。
- **应用图标**：沿用标题栏的白色音符，包含 EXE、窗口/任务栏和网页页签图标；Windows 图标覆盖 16–256 像素。`native/Assets/app.ico` 可用 `powershell -NoProfile -File scripts/build-icon.ps1` 重新生成。
- **悬浮窗**：封面与信息置顶，歌词居中，底部采用紧凑控制和细进度条；支持调整尺寸、置顶、全屏和减少动态效果。
- **窗口布局**：普通窗口采用上下布局时，歌词在上、封面与播放控制在下；在横向、上下和悬浮尺寸之间切换时平滑过渡，减少动态效果设置仍有效。内容铺满窗口，移除四周黑色留边，保留透明边缘缩放热区；窗口使用系统圆角。
- **播放控制**：播放/暂停、上一首/下一首、进度跳转、随机和循环。实际可用操作取决于源播放器的 SMTC 支持。
- **时间校正**：全局及单曲偏移各支持 ±10 秒，并在本机保存。点击歌词行可以跳转播放。

无需另外启动 UniLyric 或配置 WebSocket。本项目复用其引擎与部分歌词模块，不包含 UniLyric 完整 GUI。

## 歌词来源与默认选择

| 来源 | 当前接入能力 |
| --- | --- |
| [AMLL TTML DB / API](https://api.amll.dev) | TTML，包括逐词时间轴及附加信息 |
| 网易云音乐 | YRC 逐词、LRC 逐行及可用的翻译、音译 |
| 酷狗音乐 | 按歌曲标识查询同步 LRC |
| QQ 音乐 | QRC 逐词及可用的翻译、音译；不可用时尝试 LRC |
| 酷我音乐 | 同步歌词及接口提供的翻译 |
| 咪咕音乐 | 同步 LRC 及可用的翻译 |
| [LRCLIB](https://lrclib.net/docs) | 同步 LRC，含原生 HTTP 备用请求通道 |
| DuckDuckGo 网页兜底 | 搜索公开的 LRC 文件、页面内时间戳歌词与 LRC 下载链接 |

七个常规来源同时查询，单个来源失败不会阻断其他来源。先按歌名、歌手和录音版本筛选；有时长数据的候选还会校验时长。繁简体、联合歌手和 feat. 信息会做匹配处理，Live、Remix 等版本标记不会直接删除。只有歌曲署名、作词/作曲等信息的响应不视为有效歌词。

常规来源没有可自动匹配的同步歌词时，才会调用 DuckDuckGo，查询 `"歌名" "歌手" ("[00:" OR "filetype:lrc" OR ".lrc")`。最多检查前六个网页，每个网页最多跟进两个明确的 LRC 下载链接。支持纯文本 LRC、增强 LRC（逐词时间戳）、`pre` / `textarea` / 普通页面文本，以及有 `href` 的 LRC 下载按钮；下载结果直接解析到内存，不运行网页脚本，不下载音频或可执行文件。

网页歌词必须通过曲名、歌手核对：优先读取 LRC 的 `ti` / `ar` 标签，否则核对网页标题或文件名；显式不匹配的标签、不同录音版本、明显超出歌曲时长的时间戳与只有少量片段的结果会被排除。有 `length` 标签时还会校验时长。歌词版本列表保留原始来源 URL。成功结果在当前进程内缓存；不把验证码、错误或空结果缓存成“没有歌词”。**网页内容无法保证是同一录音或完整歌词**，可用单曲偏移或手动换版本核对。

DuckDuckGo [并不保证支持 `filetype:lrc`](https://duckduckgo.com/duckduckgo-help-pages/results/syntax)。原查询明确无结果时，会再试一次 `"歌名" "歌手" lrc`，歌曲身份检查不放宽。搜索也可能要求验证码或限流；出现这些情况会显示原因，不自动绕过验证。需要执行 JavaScript 才能生成的下载按钮、登录后可见的内容不在自动解析范围内。

**默认按实际解析出来的歌词质量优选，而非固定优先某个库：**

1. 是否具有真实逐词时间轴；仅有 TTML 格式或“逐词”标签不算。
2. 逐词时间轴覆盖率。
3. 翻译覆盖率。
4. 音译覆盖率。
5. 和声、对唱标注。

质量相同时保留原有匹配顺序。所有返回且通过录音匹配的候选都会参与后台比较；同曲名、同歌手且同专辑的多份提交会自动比较，不再仅因目录 ID 不同就要求手选。时长暂缺时可凭完整专辑匹配自动选择，SMTC 补齐时长后重新校验；已知时长明显不符的候选仍被排除。元数据不足时交由用户选择，也可以随时打开歌词区的搜索按钮手动切换。候选列表逐项显示逐词覆盖率、翻译及音译覆盖率、和声、对唱和主歌词行数；打开列表时自动检测尚未加载的版本，并显示检测失败状态。

从 0.6.5 起，名称补全与歌词来源同时查询，确认匹配的歌词会立即显示，不再等待最慢来源。其余名称和来源继续在后台检索，完成后只在发现更优版本时自动升级一次；手动选择会取消后台查询，避免覆盖用户选择。逐字对齐等待检索完成后再启动。切歌会取消旧查询，防止旧歌词覆盖新曲目。LRCLIB 查询成功后在本机缓存 7 天，失败或空结果不缓存。

每个来源的单批别名查询使用两个并发任务，同一次检索复用相同请求及歌词下载。无窗口模拟慢请求测试中，首次歌词显示从约 5.7 秒降至 0.9 秒，后台仍能选到更优逐词版本；实际耗时取决于网络与歌曲命中情况。

0.6.6 取消只比较前三个歌词版本的限制：每批候选保持三个下载任务并发，逐个补位，比较接口返回的全部匹配版本。已确认的首个结果仍立即显示，后台完成后统一优选，逐词及其覆盖率始终优先于翻译。接口未返回的版本不在比较范围内。

最终优选时，逐词版本缺少的翻译可由其他已匹配版本补全：正文行数必须完全相同，每行原文经过空白、标点和繁简归一化后也须对应一致。只填补缺失翻译，保留已有翻译、原文、逐词时间轴与和声；候选详情的来源记录翻译提供方。分句或顺序不一致时保留原样，不强行拼接。

## 发行地区、原文名称与别名（0.6.4）

Apple Music 的 SMTC 有时提供罗马音或英文名称。应用会先向 [MusicBrainz](https://musicbrainz.org) 查询当前作品及艺人别名，核对歌名、艺人和时长；没有时长时要求专辑匹配。确认身份后优先显示原文名称，并让歌词来源、候选筛选、网页兜底和对齐音频匹配共用已确认的别名。例如，确认对应作品后，`hifumi` 可以与 `一二三` 相互匹配；不会将这个名字全局强制替换。

歌名也会补全原文：例如 `Moonbath / Yorushika` 可还原为 `月光浴 / ヨルシカ`。当带歌手的查询未命中时，会独立查询录音的歌名别名，再读取完整作品核对艺人、时长和版本，避免大量其他艺人的同名歌曲挤占结果。不通过机器翻译猜测歌名，也不为个别歌曲硬编码替换。

MusicBrainz 无法识别时，还会查询 [Apple 官方 iTunes 目录](https://performance-partners.apple.com/search-api)。通过相同 `trackId`、`artistId` 和 `collectionId` 的跨地区响应建立名字关联，再核对歌名、歌手和时长；缺少时长时要求专辑匹配。例如 `Spica / 上白石萌音` 能自动关联 `スピカ / Mone Kamishiraishi`，不需要手动填写日文。

获得原文后再次核对录音及发行记录，优先采用当前专辑的正式发行信息；否则查看录音最早的正式发行记录。按可确认的发行地区和发行文字语言选择显示名称，并保留其他名称检索。`JP`、`KR` 等地区证据及全部检索名称可在设置的纠正入口中查看。艺人国籍、当前系统语言和 Apple 商店地区都不被当作歌曲原发行地。全球发行、多地区并列或缺失地区时不强行判断唯一原产地；确认过的名称仍参与查询。

歌词搜索会使用全部已确认歌名和歌手别名，去重后查询并合并候选，再按原有质量规则优选；不再只试前几个别名或找到第一批候选就停止。单个名称请求失败不会清空同来源其他名称的结果。网页兜底会依次尝试名称组合，找到有效歌词后停止。没有放宽不同艺人、Live、Remix 和时长的检查。

确认结果在本机缓存 30 天，最多 100 首；0.6.4 起缓存包含发行证据，手动纠正保留。MusicBrainz 每轮查询最多等待 10 秒、请求间隔至少 1.1 秒；800 毫秒仍未完成时并行启动 Apple 补全（最多 20 秒、请求间隔至少 3.1 秒）。已确认原文立即参与歌词查询，发行记录继续在后台核对，不阻塞可用歌词显示。切歌会取消旧任务。服务不可用、没有记录或存在多个无法区分的身份时，继续使用播放器信息。不会改变原始 SMTC 数据或播放控制。

在 **设置 → 纠正歌名与歌手** 中可以查看播放器原始信息，填写原文歌名、歌手后点击“保存并重新检索”。纠正只针对当前歌曲，重启后保留，最多保存 200 首；“清除手动纠正”恢复自动识别。多位歌手用 `；` 分隔。自动查询不会覆盖正在编辑的内容，已有手动纠正时跳过自动补全。

MusicBrainz 与 Apple 目录的地区、语言和别名覆盖有限，无法保证所有译名都能还原；同名艺人或录音信息不足时，可使用上述手动纠正入口。目前 Apple 探测 US、JP、TW、CN、KR 目录，其他发行地区仍使用 MusicBrainz 的记录和别名；Apple 音频预览及封面不用于这一功能。

## 本地逐字对齐（实验性，0.6.1）

设置中的“自动生成逐字时间轴”默认开启。只有逐行歌词时先正常显示，后台尝试从匹配的网易云或 QQ 目录取得录音，通过 Meting 聚合接口获取音频；核对歌名、歌手及整曲解码时长后，使用本机 MMS CTC 四位量化模型生成时间轴。已有逐词歌词不会被替换。0.6.1 已移除 Whisper、PyTorch、ASR 解码和语言识别模块；声学输出只作一次分块前向，再复用来做 CTC 路径搜索。

中文、日文等先做罗马化并保留原文映射，拉丁文字按词对齐；时间来自 CTC 声学路径，不按字符数量均分。未通过文本、概率、时长或行边界校验的句子继续显示逐行；翻译及音译保持原样。推理结果不是人工校准歌词，合成歌声、复杂伴奏和不准确的原始逐行时间轴可能造成失败或偏差。CTC 评分与旧 Whisper 不同，不能直接比较两者的校验通过数。

关闭开关、切歌或换歌词版本会取消旧任务。音频在任务结束后删除，成功时间轴缓存在 `%LOCALAPPDATA%/AMLL Companion/Alignment`，最多保留 100 首。音频不上传到识别服务；曲目 ID 会发给聚合接口，音频服务器会收到下载请求。网易云优先请求 128 kbps 完整录音，核对 ID、码率及试听标记；不可用时回退到聚合接口，后者可能固定返回 320 kbps。下载后仍检查解码时长，30 秒试听不会当作完整录音使用。

便携包包含 Python、约 241 MB 的 CTC 模型和依赖许可/源码材料，不要求另装 Python、FFmpeg 或 GPU 环境。请保留 EXE 旁的 `alignment` 文件夹。开发构建可运行 `powershell -NoProfile -File scripts/build-alignment.ps1` 准备精简运行时，`npm run pack` 会将其纳入便携包。**MMS 权重仅限非商业使用**，限制与应用代码的 AGPL 许可分别适用。详见 [对齐实现与验证说明](alignment/README.md)。

## 运行

系统要求：Windows 10 2004 或更新版本、Windows x64，以及 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

运行自行构建或已取得的便携包：

1. 将整个 ZIP 解压到同一文件夹。
2. 运行 `AMLL Companion.exe`，保留旁边的 `unilyric-bridge.exe` 和 `wwwroot`。
3. 在 Apple Music 或其他支持 SMTC 的播放器中播放歌曲。
4. 若未连接到预期播放器，在设置的“播放来源”中选择对应会话。

便携包自带 .NET 运行时，不需要用户安装 Rust、Node.js 或 .NET SDK。源码仓库不包含构建产物。

| 操作 | 快捷键 / 入口 |
| --- | --- |
| 播放 / 暂停 | 空格 |
| 切换全屏 | F11 |
| 退出全屏 | Esc |
| 悬浮窗 / 置顶 | 顶部窗口按钮 / 图钉 |
| 歌词偏移、播放来源 | 设置 |

## 从源码构建

需要：

- Windows x64、.NET 10 SDK、Node.js 22 或更新版本。
- 支持项目 Cargo.lock 的 Rust stable MSVC 工具链。
- Visual Studio C++ 构建工具及 Windows SDK。
- WebView2 Runtime。

```powershell
git clone https://github.com/deutdrsium/AMLL-Companion.git
cd AMLL-Companion
npm ci
npm start
```

`npm start` 会构建 Rust 桥接程序、前端和桌面宿主。Rust 依赖使用 `--locked` 构建；前端依赖由 `package-lock.json` 固定。

```powershell
npm run dev          # 浏览器界面预览；不连接原生 SMTC
npm run build        # TypeScript 检查和前端构建
npm run build:bridge # 构建内置 Rust 引擎
npm run pack         # 生成 release/ 下的 Windows x64 便携目录与 ZIP
```

## 测试

```powershell
npm test                         # 时钟、匹配、请求回退和歌词质量排序
npm run test:desktop              # 构建并运行 WebView2 + 真实 SMTC 测试发布端
node tests/lyrics-live.mjs        # AMLL 实际 API 查询
node tests/metadata-live.mjs      # 原生 HTTP 验证 hifumi、Moonbath、Spica 的原文及 JP 发行证据（先构建 NativeLyricsTests）
node tests/metadata-headless.mjs  # 无窗口验证别名、缓存、手动纠正保存/撤销与编辑竞态（先 npm run build）
node tests/search-headless.mjs    # 无窗口验证首次显示延迟、最终优选及手动选择保护（先 npm run build）
node tests/providers-live.mjs     # 跨曲风的网易云 / 酷狗查询与同步歌词下载
node tests/expanded-providers-live.mjs # QQ / 酷我 / 咪咕实际搜索、匹配与歌词下载
node tests/web-desktop.mjs        # 桌面网页兜底、优选顺序、验证码、切歌取消（先构建桌面）
dotnet run --project tests/NativeLyricsTests/NativeLyricsTests.csproj -c Release # 网页 URL / IP 边界测试
node tests/annotations-live.mjs   # more than words 完整翻译 / 音译保留验证
node tests/annotations-desktop.mjs # 桌面渲染和翻译 / 音译覆盖率（先构建桌面）
node tests/display-desktop.mjs     # 显示开关独立性、持久化及精简界面（先构建桌面）
cargo test --release --locked --manifest-path native/unilyric-bridge/Cargo.toml -p lyrics_helper_lite --lib # 网易云解析回归
node tests/providers-desktop.mjs  # 新来源在桌面中渲染；先完成桌面构建
node tests/fallback-live.mjs      # LRCLIB 请求通道回归；先完成桌面构建
node tests/auto-selection-desktop.mjs # 青花瓷自动选择、延迟时长与候选详情（联网）
```

在线测试需要网络，结果受第三方目录与服务状态影响。桌面测试使用不播放音频的 SMTC 测试会话，覆盖延迟封面更新、控制、暂停/恢复/跳转、切歌、偏移、不同窗口尺寸、置顶及全屏。测试输出位于被 Git 忽略的 `test-results/`。

`--automation` 仅用于测试，会开放本机 CDP 9223；正常启动不开放调试端口。请勿同时运行多个自动化测试。

## 数据与限制

- 查询歌词会向上述来源发送曲名、歌手等元数据，以及获取歌词需要的歌曲标识；自动补全还会向 MusicBrainz 及必要时向 Apple iTunes 查询这些元数据。网页兜底还会访问搜索命中的公开网站，不发送音频。网页下载仅允许公网 HTTP(S)，限制响应大小、超时与重定向。若系统 DNS 返回代理软件常用的 `198.18.0.0/15` Fake-IP，使用 Cloudflare DNS-over-HTTPS 核实公网地址后连接；此时目标域名会发送至 Cloudflare。
- 偏移设置与 LRCLIB 缓存保存在本机。应用不要求用户登录音乐平台。
- 无法保证每首歌曲、每个录音版本都有同步歌词。质量排序依据数据结构，不代表已逐首校验时间轴与实际音频；纯器乐曲不会生成歌词。
- 第三方接口可能变更、限流或暂时不可用。QQ 使用可用的公开搜索通道，避免旧桌面搜索返回空目录或错误 2001；某些平台可能没有特定曲目或版本。
- SMTC 信息和控制能力由源播放器决定；当前引擎以标准播放速率为前提，非 1 倍速不保证同步。音量请在源播放器或系统混音器中调整。
- 程序目前未签名。本项目不是 Apple 官方产品，也不包含商业音乐或封面资源。

## 项目结构

```text
src/                         React 界面、AMLL 渲染和歌词查询编排
shared/                      匹配、时钟、HTTP 回退与歌词质量排序
tests/                       单元测试、联网验证和桌面集成测试
native/                      WPF + WebView2 宿主
  unilyric-bridge/            Rust SMTC 桥接及歌词请求适配
  vendor/                    保留许可与修改说明的上游源码
  SmtcFixture/               真实 Windows SMTC 测试发布端
scripts/                     构建及打包脚本
licenses/                    第三方许可文本
```

## 许可与致谢

项目采用 **[AGPL-3.0-only](LICENSE)**，与使用的 AMLL 组件许可保持一致。第三方组件保留其各自许可，并不因本项目的许可声明而重新授权。

- [Apple Music-like Lyrics](https://github.com/amll-dev/applemusic-like-lyrics)：歌词渲染和背景组件，AGPL-3.0-only。
- [UniLyric](https://github.com/apoint123/Unilyric)：SMTC 集成参考、歌词查询与解析模块，MIT。
- [smtc-suite](https://github.com/apoint123/smtc-suite)：Windows 媒体会话引擎，MIT。包含本项目针对延迟封面和旧曲封面回写的补丁。
- [Lucide](https://github.com/lucide-icons/lucide)：界面音符及应用图标几何，ISC；保留 Feather 原始归属声明。
- [OpenCC JS](https://github.com/nk2028/opencc-js)：繁简转换，MIT；字典等附加声明见许可目录。

固定的上游版本、许可文本及本地修改说明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)、[SMTC 补丁说明](native/vendor/smtc-suite/PATCHES.md) 和 [歌词模块说明](native/vendor/LYRICS-PATCHES.md)。
