# Wave Roadmap

**Version: 0.1.0 · Release date: 16 October 2026.**

## Vision

Build a welcoming, private home for local music: quick browsing, reliable playback, and useful organization without requiring a streaming subscription. PixelPlayer informs the experience, while Wave remains an independent web implementation.

This is a prioritized plan, not a release schedule. Checked items describe the current implementation; unchecked items are not available yet. A completed code item does not imply universal browser compatibility or a stable release.

## Milestone 1 — Local web player

Implemented for the first development milestone:

- [x] React, TypeScript, and Vite project foundation.
- [x] Local multi-file picker and drag-and-drop import.
- [x] Import progress, file validation, and duplicate identity detection.
- [x] Embedded metadata and artwork, with untagged-file fallbacks.
- [x] IndexedDB persistence for files and favorites.
- [x] Songs, albums, artists, and favorites browsing.
- [x] Search by title, artist, and album.
- [x] Sorting by import date, title, and artist.
- [x] Play, pause, previous, next, seek, and volume controls.
- [x] Queue viewing and entry removal.
- [x] Shuffle, repeat-one, and repeat-all.
- [x] Media Session actions where the browser supports them.
- [x] Responsive interface and dark/light/system themes.
- [x] Keyboard shortcuts, labeled controls, and reduced-motion support.
- [x] English documentation reflecting the web stack.
- [x] Unit, component, and browser integration test suite.

Before declaring this milestone stable:

- [ ] Validate playback and import across current Firefox, Safari, Chromium, and mobile browsers.
- [ ] Profile importing large collections and memory use.
- [ ] Review keyboard interaction, screen readers, contrast, and touch targets.
- [ ] Validate real-device background interruption and media-key behavior.

## Milestone 2 — Essential organization and reliability

High priority after the initial player:

- [x] Custom playlists: create, rename, add/remove songs, reorder with buttons, and delete.
- [x] Settings-gated local metadata overrides and original restoration.
- [x] Local artwork replacement and custom playlist covers/descriptions.
- [x] Manual artist profile photos, independent from album covers.
- [x] Drag/button/keyboard song reordering in playlists and albums, persisted separately.
- [x] Version-1 library migration and atomic pruning of deleted playlist references.
- [x] Add unique tracks to the current queue without replacing it.
- [ ] Drag-and-drop queue reordering.
- [ ] Library/playlist backup and restore with clear file ownership.
- [ ] Storage usage, quota information, and persistence requests.
- [ ] Import cancellation and metadata work in a worker.
- [ ] Folder import with explicit permission and browser fallbacks.
- [ ] Additional filters and sorting options.
- [x] Remember volume and last audible level, including mute/reload/unmute.
- [ ] Optionally restore the queue/position.
- [ ] Better codec diagnostics and import failure details.
- [ ] Installable PWA and offline application-shell caching.

Automatic device-wide scanning is not possible through ordinary browser file access. Any folder workflow must remain user-initiated.

## Milestone 3 — Listening experience

Subject to feasibility and performance testing:

- [x] Full-viewport desktop/tablet/mobile now-playing view and local artwork-driven colors.
- [x] Dedicated Home overview and artist collection/detail with owned albums/songs.
- [x] Source codec/sample-rate/bit-depth details where available, native original-Blob playback, and selected-order shuffle restoration.
- [ ] Listening history and local statistics.
- [x] Embedded/local LRC and plain lyrics, native-clock line highlighting, seeking, timing offsets and a friendly missing-lyrics state.
- [ ] Equalizer and playback speed through browser audio APIs.
- [ ] Volume normalization.
- [x] Configurable 0–12-second native dual-decoder crossfade with cancellation/fallback.
- [x] One automatic Mix switch, per-pair bounded timing and silence-safe cues; no manual overlap duration or mode selector and no beat/tempo matching.
- [x] Local patterned Autoplay continuation with repeat/pause priority and recent-song alternatives.
- [x] Local import metadata validation with worker parsing and paged local review; no external catalogue or cover requests.
- [x] Reorder the playback queue with drag, buttons and keyboard, retaining source/time and saved order.
- [x] Contextual right-click actions, with keyboard support and native editing/selection escape hatches.
- [x] Soft spectral illumination, complete absence hiding and media-clocked palette blending.
- [ ] Investigation of gapless playback and additional real-device crossfade validation.
- [ ] Custom theme preferences.
- [ ] Better multi-artist and album-artist grouping.
- [x] Spring-based navigation/layout/dialog/card/lyric motion and opacity-only crossfade artwork, progressive lyric text fill and compact player, with Settings/system reduced motion.
- [ ] Export edited metadata into new audio files without overwriting originals.

These features must not upload audio or introduce undisclosed remote processing. Online lyrics sends metadata only and has a visible opt-out.

## Milestone 4 — Optional integrations and platforms

Ideas requiring separate product and technical decisions:

- [ ] Official Spotify/Deezer account authorization and playlist metadata import, if selected in a later milestone.
- [x] Automatic LRCLIB lyrics lookup/download with metadata-only disclosure, persistent opt-out, verified matches and offline caching (explicitly requested).
- [ ] Optional artist-artwork services, with explicit network consent.
- [ ] Casting where feasible on the web.
- [ ] Desktop packaging if browser limitations justify it.
- [ ] Native mobile applications if requested later.
- [ ] Optional portable collection synchronization with a reviewed privacy model.

Android Auto, Wear OS, native widgets, and Android music services are not part of the current web architecture. Streaming integrations and Firebase are explicitly deferred while local features are developed. Account authorization requires provider-approved OAuth/application setup; a backend such as Firebase does not replace it. Playlist metadata must not be described as downloadable streaming audio. No account connection or login is simulated in the current app.

## Longer-term ideas

Local smart mixes and advanced search may be explored after library and playback reliability are established. Public profiles, social sharing, collaborative playlists, accounts, and following artists are not initial priorities and require a separate scope decision.

## Technical principles

- Keep local use account-free and functional without remote music services.
- Preserve the originals and make storage limitations explicit.
- Prefer proven browser APIs and small, testable boundaries.
- Add migration tests before changing persistent schemas.
- Keep dependencies reviewed, lockfiles committed, and build artifacts ignored.
- Keep all documentation in English and update it with each relevant change.
- Measure performance and accessibility before claiming broad support.

## Contributing and status updates

Use the [issue tracker](https://github.com/jaime-gaming/Wave/issues) to propose or discuss work. Include the user benefit, browser constraints, privacy impact, and a test plan. See [CONTRIBUTING.md](../CONTRIBUTING.md).

Release 0.1.0 is dated 16 October 2026; publication awaits approved merge/tag/Release. There is no released 1.0.0 or completed Android parity.

Immediate import persistence, exact-byte renamed-file deduplication, compact covers/lyrics and browser-controlled eviction protection are implemented. Portable backup/export and lossless reduction of original audio storage are not implemented; original bytes necessarily occupy their original size.

## Three-platform update

Home is the initial web page; Settings is now a full page, not a dialog. Lyrics starts open in a collapsible section each time Now Playing expands or the song changes. Redundant source/playback status text is removed. The original curved W mark replaces generic waveform bars. Online automatic lyrics is optional/off initially, while manual one-song lookup remains available. Exact/search requests validate artist/title/duration, identify the client, and honor provider cooldowns; availability cannot be guaranteed. Crossfade uses incoming media time and equal-power gains, not elapsed wall time. Duplicate cleanup merges only confirmed byte-identical records, preserving references; same-name groups are reviewed non-destructively.

Separate native Android (Kotlin/Compose) and Windows (C#/WPF) source implementations exist; prior web-only scope statements apply to the web architecture, not the entire project. Hosted compilation now passes. Windows has additional contract and isolated WPF layout smoke tests, but native device/audio validation and full parity remain outstanding. [PLATFORMS](PLATFORMS.md) is the authoritative build/status matrix. [Privacy](../PRIVACY.md) describes data flows, rights and unresolved public-release obligations.

## Native delivery gates

- [x] Independent Android Kotlin/Compose and Windows C#/WPF source projects (no web wrappers).
- [x] Explicit SDK build workflows and reduced-functionality platform matrix.
- [x] Run native build/unit/lint checks remotely.
- [ ] Complete real Android/Windows target-device playback and accessibility checks.
- [ ] Bring playlists, ordering, artwork/profile editing, queue operations and lyric glyph fill to native parity.
- [ ] Add Android foreground service/audio focus/media session and rotation-safe playback lifecycle.
- [x] Add Windows contract tests, playlists/queue/session persistence and WPF layout smoke tests.
- [ ] Complete Windows system integration and trusted release signing/installer.
- [ ] Complete runtime/dependency notices, controller identity/contact, provider terms/rights and distribution/signing review before production releases.

## Listening follow-up

- [x] Web: bounded Now Playing, paused queue/progress restoration, enhanced LRC word stamps, metadata navigation and 30-second activity-controlled immersion.
- [ ] Port and validate these listening/session features independently on Android and Windows.
- [ ] Evaluate synchronized lyric accuracy across real recording editions and providers; word timestamps cannot be inferred exactly from ordinary LRC.

## Release 0.1.0 · 16 October 2026

- [x] Explicit lyric search in the editor without playback; preview and save remain separate.
- [x] Your collection followed by up to three coherent, fully local daily mixes; sparse libraries show fewer.
- [x] Remove duplicated Home session; retain the compact player.
- [x] Larger-text preference and narrow-screen input/touch/focus refinements.
- [x] Worker deadline/recovery and provider-cooldown/body-cancellation review.
- [ ] Complete draft PR review and hosted checks before merging or publishing a release.
- [x] Verify native compilation separately from the web suite.
- [ ] Complete remaining native parity and physical-device verification.

- [x] Daily mixes open browsable playlist views and save independent ordered snapshots.
- [x] Mobile Home shows all collection destinations without hidden horizontal shortcuts.
- [x] Windows native navigation, collections, six Settings menus and expanded/compact player redesign.
- [x] User-oriented README, actual screenshots and captioned MP4 promotion.
- [ ] Publish the approved merged revision as tag/Release v0.1.0; documentation/media alone do not publish it.
