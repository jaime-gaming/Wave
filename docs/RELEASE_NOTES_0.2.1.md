# Wave 0.2.1

Release candidate prepared 6 November 2026. Publication date is not yet confirmed.

## Listening and library

- Fix volume lives in **Settings → Playback**, using the same switch row as Mix, Clip and Autoplay. It balances eligible local recordings sequentially, including future imports. Turning it off cancels scanning and restores original playback levels without deleting measurements or changing the files.
- The listening view enters its artwork/lyrics scene after thirty seconds of focused inactivity. When an enabled videoclip is available, the existing video fills the background with compact credits and readable lyrics; waking the controls does not restart it.
- Repeat retains a brief same-recording audio overlap when ready, with a bounded restart fallback. Only the repeat icon responds visually; the whole screen never flashes.
- Trim opens a dedicated waveform editor, pauses the main player and owns its preview exclusively. Source audio remains unchanged.

## Remix

- Selecting a highlight keeps its detail full-width at that card's natural position. Unselected highlights become compact summaries, including on mobile.
- Artist/song artwork, populated-week selection, statistics and saved weekly playlists remain locally browsable.

## Search, Mix and AutoPlay

- Search ranks titles, artists, albums and playlists with accent-insensitive matching and conservative typo tolerance. Local genre/year metadata is searchable; a weak index and stable ranking buckets reduce repeated work.
- Enter respects the selected search category and the current typed query. Composition input does not accidentally start playback.
- Mix remains a single on/off setting, keeps the original tempo and uses bounded transition windows. Short clips cannot mix immediately at playback start; invalid or incomplete silence measurements cannot trim their boundaries.
- AutoPlay excludes missing/empty local recordings and invalid remote IDs, avoids duplicate IDs, caps each extension at twenty entries and adds recent-artist variety. Disabling it prevents new automatic extensions; already queued songs remain in the queue.
- Daily Mixes remain limited to three simultaneous groups and twenty songs per group on web, Android and Windows.

## Controls and native polish

- Directional pages and Settings entrances, restrained card presses, fine-pointer-only hover, stable player-action targets and bounded ripple feedback. System reduced motion and app motion preferences are respected.
- No decorative magic icons, model-service branding or model-service client dependencies. Search, Mix and AutoPlay use local rules and bounded audio analysis, not a remote recommendation service. Optional lyric/clip metadata services remain explicitly separate.
- Android: full-player volume/mute, current-recording-preserving queue shuffle, animated favorite/actions, persistent motion preference and improved short-wide layouts. Audio-focus ducking preserves the listener's volume and mute.
- Windows: synchronized dock/full-player sound controls, pre-mute restoration, localized control names, keyboard focus outlines and directional page/Settings motion without whole-list flashes.
- Native artwork captures publish from exact-SHA checkouts to an explicit source branch, with stale-source guards and bounded retries.

## Privacy and compatibility

- Audio, listening history, volume measurements and feedback stay on the device. Original audio files are not rewritten.
- External lyric/video searches remain optional and subject to their providers' availability. YouTube embeds are not processed by local Mix or Fix volume.
- Fix volume is currently a web local-file feature: approximate RMS/sample-peak balancing, not denoising, exact LUFS mastering or recovery of missing detail. Analysis limits are ten minutes / 48 MiB per recording, with bounded gain and a safety ceiling.
- Native clip playback and native volume-analysis parity are not introduced by this release.

## Distribution and publication gates

- No web portable bundle is attached to Releases. The website is built and deployed separately through Cloudflare Workers.
- Android artifacts are clearly labelled **test APKs**. Windows portable ZIPs contain the EXE and are labelled **unsigned**. Checksums and third-party notices accompany the native packages; signing/store distribution is not claimed.
- The tagged source must pass metadata/packaging checks, lint, unit tests, build and the required browser smoke suite before native packaging. The wider historical browser suite is reported separately, not represented as fully green.
- See [release readiness](RELEASE_READINESS_0.2.1.md) for the current validation, remaining manual/device checks and operator publication sequence. Preparing these notes does not create a tag, publish a Release or deploy production.
