# Third-party notices

- liquidglass: https://github.com/shayann07/liquidglass, revision 0cbd5e24058d2fb3fffe45b72cd07915d4dcea6f — Apache-2.0, Copyright 2026 Shayan. `shared/glass-optics.mjs` adapts the superellipse normal, Snell bevel and directional rim lighting from `ports/skia/shaders/material.sksl` to CPU-generated SVG maps. This is a subset with local parameters, not the complete upstream renderer. License: licenses/Apache-2.0.txt; retained upstream notice and idea attributions: licenses/liquidglass-NOTICE.txt.
- liquid-glass-react: https://github.com/rdev/liquid-glass-react, revision ac48eab18d1f7f444ae30002d240cae29c863a21 — MIT, Copyright 2025 MAX ROVENSKY. The RGB displacement/channel-combination approach in `src/LiquidGlass.tsx` is adapted from its `GlassFilter`, with geometry-based displacement, a smaller channel split on compact controls, and blur before refraction. License: licenses/liquid-glass-react-MIT.txt. No upstream React wrapper, utility CSS or embedded displacement assets are bundled.

- UniLyric: https://github.com/apoint123/Unilyric — MIT. Its Cargo.lock selects the SMTC engine revision below. The full UniLyric application is not redistributed.
- smtc-suite 2.6.1: https://github.com/apoint123/smtc-suite/tree/6d1ea54fd30a1861dbefb88c26cdf634d7a4432f — MIT, copyright apoint123 (2025). Compiled into unilyric-bridge.exe with a local patch for delayed cover notifications and stale async cover results; see native/vendor/smtc-suite/PATCHES.md. License: licenses/smtc-suite-MIT.txt. Rust dependencies are pinned in native/unilyric-bridge/Cargo.lock.
- opencc-js: https://github.com/nk2028/opencc-js — MIT. License: licenses/opencc-js-MIT.txt; bundled dictionary notices: licenses/opencc-js-third-party.md and licenses/Apache-2.0.txt.
- Apple Music-like Lyrics: https://github.com/amll-dev/applemusic-like-lyrics — AGPL-3.0-only. The application source is distributed under the same license (LICENSE).

The bridge transports upstream SMTC events and commands and runs lyric-provider requests and parsers. The application does not capture audio.

- UniLyric lyrics_helper_lite / lyrics_helper_core, revision ab2adb98290f292b7a03412fef13dc44d6e9786a — MIT. Source and local changes: native/vendor/LYRICS-PATCHES.md. License: licenses/UniLyric-lyrics-MIT.txt.

- Lucide / lucide-react: https://github.com/lucide-icons/lucide — ISC (with original Feather MIT attribution). Title-bar Music2 geometry is also used in public/app-icon.svg and native/Assets/app.ico; icon background and rasterization are local adaptations. License: licenses/Lucide-ISC.txt.

## Experimental local alignment sources (not shipped since 0.6.7)

Current portable packages omit the alignment model and runtime. The following notices document the retained experimental source and older 0.6.1–0.6.6 packages. Those packages include an unmodified CPython 3.12.10 embedded runtime (PSF license, `alignment/python/LICENSE.txt`), ONNX Runtime (MIT), NumPy (BSD and bundled notices), uroman (MIT with acknowledgement requirement), and PyAV 19.0.2 (BSD-3-Clause). Exact versions and upstream license-file paths are recorded in `alignment/DEPENDENCIES.json`. Original package license files and notices remain inside `alignment/python/Lib/site-packages`. PyTorch, torchaudio, Whisper and Stable-ts are no longer included.

The MMS acoustic weights are **CC-BY-NC-4.0 (non-commercial)**, separately from the application's AGPL code license. Attribution and export/quantization details: `alignment/models/MODEL.md`; pinned revision and hashes: `alignment/models/model.json`; full license: `licenses/MMS-CC-BY-NC-4.0.txt`. Source: https://huggingface.co/onnx-community/mms-300m-1130-forced-aligner-ONNX, based on Mahmoud Ashraf's forced-aligner fine-tune of Meta MMS. The application uses the four-bit ONNX export without additional weight changes.

This project uses the universal romanizer software 'uroman' written by Ulf Hermjakob, USC Information Sciences Institute (2015-2020). Ulf Hermjakob, Jonathan May, and Kevin Knight. 2018. Out-of-the-box universal romanization tool uroman. Proceedings of ACL, Demo Track. https://github.com/isi-nlp/uroman .

PyAV dynamically loads FFmpeg 9.0.2 libraries from `alignment/python/Lib/site-packages/av.libs`. The upstream build is https://github.com/PyAV-Org/pyav-ffmpeg/tree/9.0.2-1. Its FFmpeg library reports LGPL-3.0-or-later, but the build also includes x264 and x265 (GPL-2.0-or-later); those dependencies retain their own licenses, regardless of the FFmpeg library's runtime label. Corresponding source archives, build scripts and upstream patches are included in `alignment/sources`, with archive URLs and SHA-256 hashes in `manifest.json`. Consult the COPYING/LICENSE files in those sources for their full terms. This application remains AGPL-3.0-only. The FFmpeg DLLs are replaceable; no restriction on modifying or debugging these libraries is imposed.

ONNX Runtime: https://github.com/microsoft/onnxruntime. PyAV: https://github.com/PyAV-Org/PyAV. Python: https://www.python.org. No audio recording is bundled; downloaded audio is used only for local alignment and removed after the task.
