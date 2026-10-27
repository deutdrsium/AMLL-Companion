# Local changes to UniLyric's SMTC engine

Base: apoint123/smtc-suite 2.6.1, commit `6d1ea54fd30a1861dbefb88c26cdf634d7a4432f`, as selected by UniLyric's Cargo.lock. Upstream MIT license is preserved in LICENSE.

`src/smtc_handler.rs`:

- Fetch the thumbnail on each media-properties event, including events for the same title. Apple Music can publish a new title with the previous thumbnail and publish the actual new thumbnail later. The old `is_new_track || cover_data_hash.is_none()` gate ignored that later event.
- Carry title/artist/album with every asynchronous cover task. Before applying success, clearing a cover, or processing an error, verify that these still identify the current track.

No periodic SMTC polling was added. Playback, metadata, timeline and media controls continue to use the upstream implementation.

Regression: `tests/native.mjs` publishes a new title while retaining the old BMP thumbnail, then publishes a different thumbnail for that same title and verifies the received image bytes.
