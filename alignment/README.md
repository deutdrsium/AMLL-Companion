# 本地逐字对齐（实验性）

0.6.0 使用 Stable-ts 2.19.1 的 Whisper small align_words 在 Windows CPU 上处理匹配录音。原播放器继续播放；逐行歌词先显示，后台完成后仅升级通过校验的句子。设置开关默认开启；已有逐词歌词不改写，失败时保留逐行。

## 音频与模型

从现有匹配结果中选择网易云和 QQ 目录，各最多两个候选。先通过 Meting 核对曲名和歌手；网易云再优先请求 128 kbps，并检查曲目 ID、码率、时长及试听标记。不可用时使用 Meting 返回的音频。解码后的整曲时长必须与播放器相差不超过 3 秒，不能用 30 秒试听冒充整首。音频仅在本机处理，任务结束删除；缓存最多 100 首时间轴。

PyAV 解码为 16 kHz 单声道，Whisper small 使用 CPU 动态量化和 4 个线程。连续歌词按最多 25 秒、200 字符分组保留上下文；遇到间奏、重叠行或已有逐词行则拆组。不按字符长度均分时间，只在模型真实词边界恢复原行。

校验保留原文、空格、翻译、音译、行序和声部；拒绝无效、过短或重叠的词时间戳、偏离原行超过 750 ms 的结果，以及概率不足的行。概率门槛是启发式，**不能证明歌唱时间戳准确**。模型产生的是估计时间轴；合成歌声、伴奏、原始逐行时间错误和不同录音版本可能导致失败或偏差。没有足够可靠的音频或结果时会保留逐行，不保证所有歌曲都能升级。

## 构建与接口

运行 powershell -NoProfile -File scripts/build-alignment.ps1 准备运行时，npm run pack 生成便携包。

构建脚本准备独立 CPython 3.12.10、依赖和 small 模型，首次准备需要联网。打包保留模型、各依赖的原始许可证和 FFmpeg 对应源码；具体版本见包内 alignment/DEPENDENCIES.json，源码见 alignment/sources。源码清单固定于 ffmpeg-sources.json；LAME 上游改名后使用同一发布标签对应的固定提交，并记录归档哈希变化原因。构建/补丁来自 PyAV 官方仓库，不改写上游许可证。

工作进程通过 stdin/stdout 交换 JSON，stderr 报告进度。输入为本地 audio 路径、language、歌曲 duration（毫秒）和 AMLL lines；输出包含 lines、alignedLines、engine。UI 通知通过 WPF Dispatcher 发送。切歌、换版本或关闭开关取消旧任务并终止其子进程，迟到结果不会覆盖当前歌曲。

## 已验证范围

- python tests/test_alignment.py：7 项，覆盖原文及附加信息保留、时间戳拒绝、前奏取样、上下文分组和行边界。
- npm test：38 项，包括音频匹配、取消及附加信息保护等回归检查。
- dotnet run --project tests/AlignmentTests -- --selection：低码率 ID、码率、时长与试听筛选。
- 原生真实下载、模型进程与缓存测试通过；实际模型报告进度后取消，子进程退出测试通过。
- tests/alignment-live-desktop.mjs：0.6.0 包内 EXE、真实音频下载和随包 small 模型，完整《普通DISCO》38 行中 19 行通过校验并自动更新界面。音频与模型响应未模拟，目录与 SMTC 使用测试夹具。
- tests/alignment-desktop.mjs：逐行等待显示、后台升级、设置状态、关闭取消和迟到结果拒绝通过；此测试使用确定性模型响应，不作为声学精度证据。

其他整曲 small 测试：《勾指起誓》30/45 行、《权御天下》0/66 行。这里的数字是校验通过数，不是人工标注的准确率；低码率重编码也可能改变模型输出。真实歌唱测试目前以中文为主，其他语言尚未完成声学准确率评估。模型支持多语言不等于对每种歌唱风格都有效。

实测脚本需要本地准备的 .reference/alignment 录音和目录夹具，录音不随仓库分发。设置 NATIVE_EXECUTABLE 为待测包的 EXE 后运行桌面脚本；它们使用独立测试 profile 和 SMTC 夹具，不操作用户播放器。

参考：[Stable-ts](https://github.com/jianfch/stable-ts)、[Whisper](https://github.com/openai/whisper)、[Meting-API](https://github.com/metowolf/Meting-API)。Stable-ts 上游已声明暂停开发，本项目固定其版本。
