# Wave roadmap

**Development: 0.3.0 · Latest public release: 0.2.2.** This is a prioritized plan,
not a release schedule. Features described here may still need real-device validation.
[Platform status](PLATFORMS.md) is the source of truth for differences between clients;
[the changelog](../CHANGELOG.md) records release history.

## The experience

Wave is a private home for the music people already own. The priorities are dependable
playback, a library that is easy to understand, and a coherent interface that feels at
home on every screen. Features should be understandable without technical knowledge.

## Playback and music

- [x] Local playback, queue, playlists, shuffle and repeat on the web and native projects.
- [x] Web Mix with local analysis and two decks. Automatic handovers preserve the
      recorded opening and ending unless the listener explicitly trims a song.
- [x] Local recommendations, Daily Mixes, listening history and Remix recaps, with
      differences between clients documented in the platform matrix.
- [ ] Listen to transitions on real devices with short tracks, quiet intros, live albums,
      different codecs, interruptions, slow storage and a next file that cannot be opened.
- [ ] Improve gapless playback and graceful recovery from unavailable or damaged files.
- [ ] Bring web Mix, Fix Volume, lyrics and catalogue capabilities to native clients.
- [ ] Investigate YouTube Mix without skipping the incoming beginning, respecting player policies
      and platform autoplay restrictions. It is currently disabled for embedded playback; see
      [the investigation](YOUTUBE_MIX.md).

## Library, privacy and safety

- [x] Local import, metadata editing, search and playlists; web backup restores only into
      an empty library and excludes settings, links and folder permissions.
- [x] Web reset asks for confirmation and clears Wave's local data before restarting.
      Closing other Wave tabs may be necessary; a failed reset can be partial and retried.
- [ ] Validate backup and reset with large libraries, interrupted writes, blocked tabs,
      limited storage and offline restarts. Design compatible native backups before claiming parity.
- [ ] Add import cancellation, richer organization and more accessible error recovery.
- [ ] Complete provider rights, privacy and distribution review before production release.

## One coherent interface

- [x] Step-by-step web setup, local preferences, reduced motion and a responsive player.
- [ ] Validate the two-way player morph and its live state during rapid track changes,
      resizing, rotation, interruption and reduced-motion settings on real browsers.
- [ ] Refine spacing, touch targets, keyboard and screen-reader behavior across every view.
- [ ] Bring setup, settings, interactions, animations and core functions to the native apps;
      use native conventions where needed without claiming parity prematurely.
- [ ] Profile large libraries, slow devices, memory and battery use.

## Shared experience across platforms

The goal is a coherent core for every listener, not a WebView wrapper or identical platform chrome.
Prioritize library and playback first, then YouTube, playlist migration, lyrics and catalogue,
Fix Volume, clips, mood-aware recommendations, and comparable settings and accessible motion.
Each native capability needs its own privacy and provider-rights review, resource limits and
platform-specific device tests. Keep storage and UI modules small, reuse contracts where practical,
and record gaps in the platform matrix rather than implying an unfinished feature exists.

## Platforms and delivery

- [x] Independent web, Android, Windows and iOS source projects; they keep separate libraries.
- [ ] Complete the [platform matrix](PLATFORMS.md) feature gaps and validate real-device playback,
      accessibility, background audio, OS integrations and mobile layouts.
- [ ] Verify installation and the offline shell in mobile browsers.
- [ ] Release Windows as the configured unsigned `Wave.exe`, with its warning clearly explained;
      Android updates require the same signing key. See [Windows release](WINDOWS_RELEASE.md).
- [ ] Decide on iOS distribution only when signing and provisioning are available; the present
      iOS project is source-only and does not publish an IPA.

## Possible later additions

Equalizer and playback speed, additional library filters, optional casting, portable
cross-platform backup, and better offline/import diagnostics are candidates, not promises.
Account-based streaming and social features require a separate privacy and product decision.

## Contributing

Propose work in the [issue tracker](https://github.com/jaime-gaming/Wave/issues), including
its user benefit, privacy impact, platform limitations and test plan. See
[CONTRIBUTING](../.github/CONTRIBUTING.md).

## Earlier roadmap and release history

The following is the complete earlier roadmap, retained for historical context. Its version, completion claims, future plans and links reflect the time it was written and do not describe current platform parity. The current plan and platform matrix above take precedence.

# Wave Roadmap

**Working version: 0.3.0 · Latest public release: 0.2.2.**

Wave includes local Mix and mood features, Daily Mixes, Remix recaps, optional YouTube lookup and native app projects. Native parity, real-device behavior and cross-platform interoperability are not complete; see [PLATFORMS](PLATFORMS.md).

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
- [x] Drag-and-drop queue reordering on web.
- [x] Web library backup and restore into an empty library, including original local audio, playlists and history; settings, device links and folder permissions are excluded. Native backup compatibility remains open.
- [x] Web storage usage, quota information, and persistence requests (subject to browser support).
- [ ] Import cancellation and metadata work in a worker.
- [x] Folder import with explicit permission and browser fallbacks: directory picker first,
      directory input next, remembered handles stored locally and re-requested only from a click.
- [ ] Additional filters and sorting options.
- [x] Remember volume and last audible level, including mute/reload/unmute.
- [x] Optionally restore the web queue and position.
- [ ] Better codec diagnostics and import failure details.
- [x] Installable web app: manifest, maskable and Apple icons, standalone display, and an offline cache of the interface (never audio).
- [ ] Verify installation and the offline shell on real Android and iOS devices.

Automatic device-wide scanning is not possible through ordinary browser file access. Any folder workflow must remain user-initiated.

## Milestone 3 — Listening experience

Subject to feasibility and performance testing:

- [x] Full-viewport desktop/tablet/mobile now-playing view and local artwork-driven colors.
- [x] Dedicated Home overview and artist collection/detail with owned albums/songs.
- [x] Source codec/sample-rate/bit-depth details where available, native original-Blob playback, and selected-order shuffle restoration.
- [x] Web listening history and local statistics; real-device validation remains open.
- [x] Embedded/local LRC and plain lyrics, native-clock line highlighting, seeking, timing offsets and a friendly missing-lyrics state.
- [ ] Equalizer and playback speed through browser audio APIs.
- [x] Web Fix Volume with local analysis and reversible playback gain; native parity and real-device validation remain open.
- [x] A dual-decoder overlap of twelve to twenty-four seconds, chosen per pair and cancelled back to the plain next song when a deck will not start; nothing about its length is configurable.
- [x] One automatic Mix switch with bounded timing, silence-safe cues and local tempo-aware planning where analysis is available.
- [x] Local patterned Autoplay continuation with repeat/pause priority and recent-song alternatives.
- [x] Local import metadata validation and review; optional online catalogue and cover lookup is separately disclosed.
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

Release 0.2.0 is dated 3 November 2026; published assets and tag identity are recorded on the GitHub Release. There is no released 1.0.0 or completed Android parity.

Immediate import persistence, exact-byte renamed-file deduplication, compact covers/lyrics and browser-controlled eviction protection are implemented. Web backup/export is implemented for an empty-library restore; lossless reduction of original audio storage is not implemented and original bytes occupy their original size.

## Three-platform update

Home is the initial web page; Settings is now a full page, not a dialog. Lyrics starts open in a collapsible section each time Now Playing expands or the song changes. Redundant source/playback status text is removed. The original curved W mark replaces generic waveform bars. Online automatic lyrics is optional/off initially, while manual one-song lookup remains available. Exact/search requests validate artist/title/duration, identify the client, and honor provider cooldowns; availability cannot be guaranteed. Crossfade uses incoming media time and equal-power gains, not elapsed wall time. Duplicate cleanup merges only confirmed byte-identical records, preserving references; same-name groups are reviewed non-destructively.

Separate native Android (Kotlin/Compose) and Windows (C#/WPF) source implementations exist; prior web-only scope statements apply to the web architecture, not the entire project. Hosted compilation now passes. Windows has additional contract and isolated WPF layout smoke tests, but native device/audio validation and full parity remain outstanding. [PLATFORMS](PLATFORMS.md) is the authoritative build/status matrix. [Privacy](../PRIVACY.md) describes data flows, rights and unresolved public-release obligations.

## Native delivery gates

- [x] Independent Android Kotlin/Compose and Windows C#/WPF source projects (no web wrappers).
- [x] Explicit SDK build workflows and reduced-functionality platform matrix.
- [x] Run native build/unit/lint checks remotely.
- [ ] Complete real Android/Windows target-device playback and accessibility checks.
- [x] Search parity on both native builds: the site's five kind tabs and its collection groups on Android, the
      artists/albums/playlists matches on Windows, and recent searches kept on the phone.
- [ ] Bring artwork/profile editing and lyric glyph fill to native parity (playlists, ordering and queue operations are done on both).
- [ ] Bring the remaining web-only features to the native builds: YouTube songs, video clips and device linking.
      The first two need an embedded player inside WPF and an Android WebView respectively, plus the same drift
      correction the web uses; linking needs a camera reader and a transport on both. None is started yet, and
      nothing in the app pretends otherwise.
- [x] Add Android foreground service/audio focus/media session and rotation-safe playback lifecycle.
- [x] Add Windows contract tests, playlists/queue/session persistence and WPF layout smoke tests.
- [ ] Complete Windows system integration and trusted release signing/installer.
- [ ] Complete runtime/dependency notices, controller identity/contact, provider terms/rights and distribution/signing review before production releases.

## Listening follow-up

- [x] Web: bounded Now Playing, paused queue/progress restoration, enhanced LRC word stamps and metadata navigation. The 30-second immersion that took the screen over was removed in 0.1.1: the player opens only when asked.
- [x] Port these listening/session features to Android and Windows (paused restoration, per-platform session persistence).
- [ ] Validate them on real target devices: an Android phone with headphones and a car, and a Windows machine with a real codec matrix.
- [ ] Evaluate synchronized lyric accuracy across real recording editions and providers; word timestamps cannot be inferred exactly from ordinary LRC.

## Listening history and local statistics

- [x] Web: a `plays` store as a version-4 upgrade, a play written at half the song or thirty
      seconds, the newest two thousand kept, a Listening page and a Home shelf.
- [x] Android and Windows: the same rule over `history.json`, the same page, the same shelf.
- [x] Four weeks kept: every play from the last five weeks survives the count on all three
      clients, Remix shows this week plus the three before it, and each week is bounded at both ends.
- [ ] Statistics over longer windows (months, a year) once a real library has been listened to
      for long enough for the numbers to mean something.

## Milestone 5 — Wave 1.1: sync, YouTube and playlist import

Planned scope agreed on 2 November 2026 and specified in
[SPEC_1.1](SPEC_1.1.md). Foundation modules, protocol and tests are implemented;
no interface, provider client or Android port exists yet.

**Listening, lyrics and clips (Wave 1.1 UI)**

- [x] **Mix** (formerly crossfade): background DSP analysis, an adaptive beat/frase-aligned planner, equal-power gains, a mid-transition bass swap and a stereo spread; since 0.2.0 no deck is ever re-rated.
- [x] Word-by-word lyric highlighting built in (no toggle), from provider word stamps or a deterministic, labelled estimate; the line-level view remains as the fallback.
- [x] Automatic clip discovery (Piped/Invidious), ranked by title, channel and length; muted embed with hidden chrome, rate-based drift correction and local per-song storage. Manual link entry stays as a fallback.
- [x] Import MP3, WAV, M4A, OGG and FLAC; FLAC is stored and played untouched.
- [x] Add music asks **From this device** or **From YouTube**; YouTube songs play through the official embed with Wave's transport.
- [x] Mix across YouTube songs: equal-power crossfade between the embed and a local deck, with the local file preferred when the same song is imported.
- [x] Offline states on controls that need the network (text replaced by **Offline**, icon controls keep their name).
- [x] Daily mixes ordered by measured tempo and energy, with artist spreading and a one-line descriptor.
- [x] Opt-in word-level lyric sources (NetEase YRC, Kugou KRC) behind a Settings switch and a PRIVACY note.
- [ ] Real-device drift measurement for the clip on slow connections, and a screenshot-level review of the backdrop on small phones.
- [ ] Real-device check of a YouTube crossfade: embed volumes, autoplay policy and the handover window on a slow connection.
- [ ] Mix against real DJ material with long intros, rubato sections and half/double-time false positives.
- [ ] Review the clip-search providers' availability and terms, and allow a user-supplied instance.

**Device sync (hybrid)**

- [x] Versioned sync protocol with total frame validation and 96 KiB frame ceiling.
- [x] ECDH P-256 + HKDF pairing with a six-digit confirmation code and 120 s expiry.
- [x] AES-GCM sealed frames, chunked transfer and SHA-256 verification before storage.
- [x] Temporary loans bounded by **space** (default 2 GB / 2 000 songs), least-recently-used eviction of unpinned loans and per-device summaries.
- [x] Separate `wave-sync` IndexedDB store; library schema untouched.
- [x] WebRTC data channel with hand-exchanged signalling codes (compressed, single paste each way, STUN for cross-network), so no relay and no server are needed.
- [x] Settings → Devices: make or join a code, six-digit confirmation, the peer's library as a browsable list, per-song requests, live transfer progress, remembered devices, borrowed-space budget and removal.
- [ ] On-demand streaming of a song that stays on a paired device instead of copying it.
- [ ] A signalling relay for the networks that cannot connect peer to peer (symmetric NAT), carrying SDP and never audio.
- [ ] Resuming an interrupted transfer instead of restarting it.
- [ ] Android port of the protocol, loan store and foreground transfer.
- [ ] Real two-device transfer, interrupted-transfer recovery and TURN/privacy review.

**Songs from YouTube (official embed only)**

- [x] Link parsing for watch/youtu.be/shorts/embed/live/music, playlists and start times.
- [x] Privacy-enhanced embed URL and validated player-event handling.
- [x] Provider row type (`source: youtube`) stored in the existing `tracks` store — no schema change, `blob` is simply absent, so existing playlist membership is untouched.
- [x] Embedded playback mode: the native element is released, Mix analysis and blending are skipped, and lyrics keep working against the embed clock.
- [x] Explicit provider labelling and an "open on YouTube" link; no extraction, proxying or downloading of audio.
- [ ] Offline-unavailable messaging for a YouTube song played without a connection.
- [ ] Loan/sync exclusion for YouTube songs on the paired-device path.

**Playlist import (match only)**

- [x] Spotify and YouTube link parsing, including URIs, locale prefixes and short-link refusal.
- [x] Deterministic title/artist/duration matching with ambiguity, ties, manual reassignment and gap reporting.
- [ ] Spotify PKCE client with `playlist-read-private`/`playlist-read-collaborative` (own or collaborative playlists only) and YouTube Data API playlist reads with a restricted key.
- [x] Review screen that writes nothing until the user confirms: folder import, `.m3u`/`.csv`/text
      reading and the staged matched/ambiguous/missing preview, all local.
- [ ] Provider privacy text, consent and quota/backoff handling.

Provider limits are part of the scope, not an implementation detail: new Spotify
applications cannot read playlists owned by other accounts, and Wave never
downloads Spotify audio. YouTube audio is never extracted.

## Release 0.2.0 · 3 November 2026

- [x] A mix whose level arrives with the file, is measured at the join and is released over four
      seconds instead of a frame.
- [x] **No deck is ever given a playback rate.** The old tempo split is gone: the songs meet on the
      bar and each plays as recorded, and the overlap is cut to however long the two pulses can share
      a room.
- [x] The new song enters on a bar where it is already playing, never in the held chord an intro ends
      on, and the two records separate in the stereo field while they meet without touching the level.
- [x] A song can end when the music does: in its last ten seconds, nothing left to hear means the
      next song comes in.
- [x] **Mixing** drawn as one light travelling across the word.
- [x] Silent edges measured against the loudest tenth of the song, holding for a third of a second,
      capped at twenty seconds a side, offered from two and a half seconds at the front and four at
      the back, over the bar and inside the open player.
- [x] An artist tag naming two acts gives each act a profile; names with a real comma stay whole.
- [x] Titles holding the whole line give up their artist, album positions leave the name, and song
      details say what is missing in words.
- [x] Online lookups off until switched on, and better at what they accept when they are on, down to
      finding where a song sits on its album.
- [x] Search ranked everywhere: exact, prefix, word, letters, artist, album, file name — plus one
      letter in the wrong place still finding the song, on the web, the phone and the Windows window.
- [x] Lyrics matched across edition words a file did not keep, with live and acoustic takes still
      refused.
- [x] An error screen written for a person, with the exception kept in the console.
- [x] A break offered after an hour and a half of actual listening.
- [x] Linking another device is the first card on a phone.
- [x] Wave's own icons, drawn with the wordmark's pen, and the same paths on Android and Windows.
- [x] The clip view drawn **over** the picture: sleeve and text top-left, words bottom-right, one
      glass transport at the foot, and the video reaching every edge of the window.
- [x] A still is not a clip: audio uploads, art tracks, lyric videos and cover-art uploads skipped.
- [x] A clip placed before the song as well as after the start of its intro.
- [x] Bringing a library over reachable from Settings → Library as well as the playlists shelf.
- [x] Served by Cloudflare Workers with an `ASSETS` binding, SPA fallback and metadata-only public playlist endpoint. No GitHub Pages mirror.
- [x] The product film for this version, recorded from the app by a workflow instead of assembled by
      hand: the join, the search that forgives a wrong letter and the offer to skip dead air.
- [x] Android and Windows use the same twelve-to-twenty-four-second window and the same hand-over
      curve as the web client, so a join lasts as long and arrives as early on every screen.
- [x] Missing artwork is drawn, not typed: the phone, the desktop window and the browser show the
      same note instead of a font character that some devices render as an empty box.
- [ ] The offer to skip dead air and the break card after ninety minutes exist on the web only; the
      phone and the Windows window still play a lead-in in silence and never interrupt a long
      session. Neither player analyses the file it is playing yet.
- [ ] Real-device pass on the blend, the overhead clip layout and the break card on a phone.
- [ ] A film that shows the phone and the Windows window, once those builds have the same blend.

## Release 0.1.1 · 2 November 2026

- [x] Match the screen to the music: one accent colour taken from the cover, applied to the mark and the browser tab.
- [x] Mix announced a few seconds ahead, with the cue timed to the actual blend instead of a fixed countdown.
- [x] Video clips fitted to the song's own length, and discovery restricted to real music videos.
- [x] QR device linking, with nothing saved removed to make room.
- [x] Mix against real material: folded tempo comparison, a gentle blend for rubato songs, and a cue
      that enters a long intro instead of skipping it.
- [x] Online song details: artist, album, year, genre and cover filled in for songs with gaps,
      one at a time, only ever over a hole.
- [x] Whole-folder import and a playlist migration sheet that only writes the confirmed matches.
- [x] The web client published at wave.jaime-gaming.com.
- [ ] Real-device pass on the clip backdrop, the blend and the animation timings.

## Release 0.1.0 · 17 October 2026

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
- [x] Publish the merged revision as tag/Release v0.1.0; documentation/media alone do not publish it.

## Mobile design parity

- [x] Use the mobile web shell, four navigation destinations, collection shortcuts and Remix
      layout as the direction for Android while keeping Android's system picker and playback service.
- [ ] Compare every Android screen, both themes and large text against the corresponding mobile
      web screen on real devices. Bring remaining functionality (including YouTube songs, clips,
      device linking and the web's interpolated lyric fill) across without losing local playback or
      stored data.
- [ ] iOS is a future port, not part of this change.
