# Vendored UniLyric lyrics helpers

Source: https://github.com/apoint123/Unilyric/tree/ab2adb98290f292b7a03412fef13dc44d6e9786a
Packages: lyrics_helper_lite 0.1.0 and lyrics_helper_core 0.2.1. MIT; original LICENSE files retained.

Local changes to lyrics_helper_lite:
- Reserve the AES block padding capacity before Netease EAPI encryption (upstream otherwise returns PadError).
- Expose parser module for the companion's Kugou LRC adapter.
- Add QQ request comm parameters during compatibility investigation. QQ is not enabled in the app: live probes returned empty results for known songs.

The companion uses the upstream Netease search, YRC/LRC parsers, translation merge, and core lyric model. The Kugou adapter lives in unilyric-bridge/src/lyrics.rs and uses public catalogue search and hash-linked LRC lookup. It does not download audio. SMTC code is unchanged by these additions.
