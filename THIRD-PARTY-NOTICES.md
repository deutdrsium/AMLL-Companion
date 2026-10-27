# Third-party notices

- UniLyric: https://github.com/apoint123/Unilyric — MIT. Its Cargo.lock selects the SMTC engine revision below. The full UniLyric application is not redistributed.
- smtc-suite 2.6.1: https://github.com/apoint123/smtc-suite/tree/6d1ea54fd30a1861dbefb88c26cdf634d7a4432f — MIT, copyright apoint123 (2025). Compiled into unilyric-bridge.exe with a local patch for delayed cover notifications and stale async cover results; see native/vendor/smtc-suite/PATCHES.md. License: licenses/smtc-suite-MIT.txt. Rust dependencies are pinned in native/unilyric-bridge/Cargo.lock.
- opencc-js: https://github.com/nk2028/opencc-js — MIT. License: licenses/opencc-js-MIT.txt; bundled dictionary notices: licenses/opencc-js-third-party.md and licenses/Apache-2.0.txt.
- Apple Music-like Lyrics: https://github.com/amll-dev/applemusic-like-lyrics — AGPL-3.0-only. The application source is distributed under the same license (LICENSE).

The bridge transports upstream SMTC events and commands and runs lyric-provider requests and parsers. The application does not capture audio.

- UniLyric lyrics_helper_lite / lyrics_helper_core, revision ab2adb98290f292b7a03412fef13dc44d6e9786a — MIT. Source and local changes: native/vendor/LYRICS-PATCHES.md. License: licenses/UniLyric-lyrics-MIT.txt.
