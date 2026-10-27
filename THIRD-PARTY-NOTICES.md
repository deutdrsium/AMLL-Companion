# Third-party notices

- UniLyric: https://github.com/apoint123/Unilyric — MIT. Its Cargo.lock selects the SMTC engine revision below. The full UniLyric application is not redistributed.
- smtc-suite 2.6.1: https://github.com/apoint123/smtc-suite/tree/6d1ea54fd30a1861dbefb88c26cdf634d7a4432f — MIT, copyright apoint123 (2025). Compiled into unilyric-bridge.exe with a local patch for delayed cover notifications and stale async cover results; see native/vendor/smtc-suite/PATCHES.md. License: licenses/smtc-suite-MIT.txt. Rust dependencies are pinned in native/unilyric-bridge/Cargo.lock.
- opencc-js: https://github.com/nk2028/opencc-js — MIT. License: licenses/opencc-js-MIT.txt; bundled dictionary notices: licenses/opencc-js-third-party.md and licenses/Apache-2.0.txt.
- Apple Music-like Lyrics: https://github.com/amll-dev/applemusic-like-lyrics — AGPL-3.0-only. The application source is distributed under the same license (LICENSE).

The bridge transports upstream SMTC events and commands and runs lyric-provider requests and parsers. The application does not capture audio.

- UniLyric lyrics_helper_lite / lyrics_helper_core, revision ab2adb98290f292b7a03412fef13dc44d6e9786a — MIT. Source and local changes: native/vendor/LYRICS-PATCHES.md. License: licenses/UniLyric-lyrics-MIT.txt.

- Lucide / lucide-react: https://github.com/lucide-icons/lucide — ISC (with original Feather MIT attribution). Title-bar Music2 geometry is also used in public/app-icon.svg and native/Assets/app.ico; icon background and rasterization are local adaptations. License: licenses/Lucide-ISC.txt.

## Local alignment runtime (0.6.0)

The portable distribution includes an unmodified CPython 3.12.10 embedded runtime (PSF license, `alignment/python/LICENSE.txt`), Stable-ts 2.19.1 and OpenAI Whisper code/model weights (MIT), PyTorch and its dependencies, and PyAV 19.0.2 (BSD-3-Clause). Exact installed versions and upstream license-file paths are recorded in `alignment/DEPENDENCIES.json`. Original package license files and third-party notices remain inside `alignment/python/Lib/site-packages`, including each package's `.dist-info/licenses` directory. The Whisper small weights are unmodified; https://github.com/openai/whisper provides the MIT license covering code and weights.

PyAV dynamically loads FFmpeg 9.0.2 libraries from `alignment/python/Lib/site-packages/av.libs`. The upstream build is https://github.com/PyAV-Org/pyav-ffmpeg/tree/9.0.2-1. Its FFmpeg library reports LGPL-3.0-or-later, but the build also includes x264 and x265 (GPL-2.0-or-later); those dependencies retain their own licenses, regardless of the FFmpeg library's runtime label. Corresponding source archives, build scripts and upstream patches are included in `alignment/sources`, with archive URLs and SHA-256 hashes in `manifest.json`. Consult the COPYING/LICENSE files in those sources for their full terms. This application remains AGPL-3.0-only. The FFmpeg DLLs are replaceable; no restriction on modifying or debugging these libraries is imposed.

Stable-ts: https://github.com/jianfch/stable-ts. PyAV: https://github.com/PyAV-Org/PyAV. PyTorch: https://github.com/pytorch/pytorch. Python: https://www.python.org. No audio recording is bundled; downloaded audio is used only for local alignment and removed after the task.
