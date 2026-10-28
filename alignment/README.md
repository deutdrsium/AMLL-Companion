# 本地逐字对齐（实验性，0.6.1）

采用 MMS-300M 强制对齐声学模型的四位 ONNX 导出，约 241 MB。运行时仅包含 ONNX Runtime、NumPy、PyAV、uroman 及其小型依赖，不再包含 PyTorch、torchaudio、Whisper 或 Stable-ts。

## 推理流程

逐行歌词先显示，后台匹配网易云 / QQ 录音，沿用 Meting 元数据核对、网易云 128 kbps 优先获取、整曲时长检查、缓存、取消与迟到结果保护。已有逐词歌词不改写。

音频解码为 16 kHz 单声道，声学模型对整首音频做一次分块前向：每块 15 秒，两端各取至多 1 秒上下文，重叠输出只保留一次。输出为每 20 ms 的字符后验，随后复用这些输出对所有行做 CTC Viterbi 路径搜索；不做 ASR 转写、语言识别或自回归解码，也不为每句重复运行模型。CPU 使用 4 个推理线程。

中文、日文、韩文按字符单元，其他文字按词单元处理。uroman 将原文转为模型的拉丁字母表，原文字段和单元边界保留；中文数字字形转成对应读音，不把原文替换为拼音。无法转为模型字符的行继续逐行。时间来自声学路径，不按字符数量均分。汉字多音、日文汉字读音及连读仍可能影响效果。

## 校验与限制

保留原文、空格、标点、翻译、音译、行序与声部。CTC 约束包含相同字母之间必须经过 blank，路径不可能时不产生结果。无效、过短、重叠、超出录音或偏离原行超过 750 ms 的时间戳均被拒绝。

CTC 与 Whisper 分数定义不同：当前按每个原文单元的目标字母路径后验评分，行均值门槛 0.30，低于 0.08 的单元最多占 20%。门槛仅为启发式，不能证明声学准确率。用《普通DISCO》的已有声学输出做初步校准：正确逐行文本有 15/38 行通过；故意换成下一行文本时仍有 1/38 行通过，说明相似音节会误匹配。元数据与时长核对不能取代人工校时，时间轴仍属估计值。未通过的句子保留逐行。

## 资源对照

同一 Windows 电脑、同一 206.3 秒完整录音、CPU 4 线程、独立进程测量：

| 项目 | 0.6.0 Whisper small | 0.6.1 MMS CTC Q4 |
| --- | ---: | ---: |
| 模型文件 | 483.6 MB | 241.5 MB |
| 进程峰值工作集 | 2022 MiB | 561 MiB |
| 一次整曲资源测试耗时 | 20.1 秒 | 69.9 秒 |

数字包含模型载入、音频解码和对齐，不含下载。CTC 资源测试在评分校准前完成，校准只影响后续轻量路径筛选；这些数字不是固定速度或准确率承诺。新版降低了包体与内存，但本机 CPU 整曲测试更慢。《权御天下》新模型整曲测试为 38/66 行通过、65.4 秒、峰值 567 MiB；旧版为 0/66。评分不同，通过数不可直接当作质量排名。

## 构建、许可与验证

运行 powershell -NoProfile -File scripts/build-alignment.ps1 准备独立运行时，npm run pack 生成便携包。新运行时位于 .tools/ctc-runtime，避免混入旧环境的重型依赖。模型与词表的固定版本、SHA-256 见 model.json；仅在构建阶段下载，工作进程不连接模型仓库。包内包含模型、原始许可证、依赖清单及 FFmpeg 对应源码。

**MMS 权重为 CC-BY-NC-4.0，仅限非商业使用。** 该限制与应用代码 AGPL-3.0-only 分别适用。署名与导出说明见 MODEL.md，全文见应用目录的 licenses/MMS-CC-BY-NC-4.0.txt。

验证入口：

- python tests/test_alignment.py：7 项，覆盖原文保护、无效时间拒绝、CTC 重复字符、不可行路径、原文单元映射及声学输出复用。
- npm test：38 项，包括音频匹配、取消和附加信息保护。
- tests/AlignmentTests：原生下载、模型工作进程、缓存、取消和低码率筛选。
- tests/alignment-live-desktop.mjs：指定 NATIVE_EXECUTABLE，以包内 EXE、真实下载和模型验证界面升级。
- tests/alignment-desktop.mjs：逐行等待、开关、取消及迟到结果的确定性桌面回归。

实测使用本地 .reference/alignment 音频与目录夹具，录音不随仓库分发。桌面测试使用独立 profile 和 SMTC 夹具，不操作用户播放器。歌唱验证目前以中文为主，未证明其他语言和所有曲风的准确率。

参考：[MMS_FA](https://docs.pytorch.org/audio/stable/generated/torchaudio.pipelines.MMS_FA.html)、[ctc-forced-aligner](https://github.com/MahmoudAshraf97/ctc-forced-aligner)、[固定 ONNX 模型](https://huggingface.co/onnx-community/mms-300m-1130-forced-aligner-ONNX/tree/2100fb247d8e43962eef24491597fbeb8b469531)、[uroman](https://github.com/isi-nlp/uroman)。
