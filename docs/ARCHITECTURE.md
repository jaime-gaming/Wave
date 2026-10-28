# Wave Architecture

**Version: 0.1.1 · Release date: 27 October 2026.**

## Scope and platform decision

Wave's first implementation is a browser application built with React and TypeScript. It is now accompanied by independent Kotlin/Compose Android and C#/WPF Windows projects; see PLATFORMS.md for native architecture and verified build status and remaining parity differences. PixelPlayer remains a reference for local-library organization and playback interactions, not an implementation dependency.

The first milestone is a working vertical slice: import local music, persist it, browse and search it, then play it, organize playlists, and optionally edit local metadata. There is no backend or authentication. Optional automatic lyrics uses LRCLIB directly from the browser; audio remains local.

## Layers and responsibilities

```text
React interface
    ├── App: library views, filters, dialogs, import entry points
    └── components: artwork, player controls, accessible dialogs
            │
Application hooks
    ├── useLibrary: loading, import, favorites, removal, metadata overrides
    ├── usePlaylists: loading, ordered membership, CRUD, errors
    └── usePlayer: audio lifecycle, queue dispatch, Media Session
            │
Domain                        Data / browser adapters
    ├── Track / Playlist models               ├── IndexedDB repository
    ├── search / formatting       ├── metadata importer
    ├── pure playlist mutations    ├── artwork validation / crop
    └── pure queue reducer        └── HTMLAudioElement
```

The domain layer has no React or storage dependencies. Data modules do not render interface elements. Hooks coordinate side effects and expose state to components. For this initial milestone, screen navigation and grouping live in `App.tsx`; routing and feature-specific screens can be extracted when the application grows.

## Directory layout

```text
src/
├── components/
│   ├── Artwork.tsx
│   ├── ArtworkPicker.tsx
│   ├── TrackEditor.tsx
│   ├── PlaylistDialog.tsx
│   ├── PlaylistCollection.tsx
│   ├── AnimatedListItem.tsx
│   ├── LibraryContent.tsx
│   ├── Navigation.tsx
│   ├── Modal.tsx
│   └── PlayerBar.tsx
├── data/
│   ├── artwork.ts
│   ├── import.ts
│   └── library.ts
├── domain/
│   ├── playlists.ts
│   ├── player.ts
│   └── types.ts
├── hooks/
│   ├── usePlaylists.ts
│   ├── useLibrary.ts
│   └── usePlayer.ts
├── ui/               # shared motion preferences/tokens
├── test/
├── App.tsx
├── main.tsx
└── styles.css
```

## Data flow

1. A user explicitly selects or drops files. The browser cannot silently scan the device's music folders.
2. `useLibrary` validates extensions, size, and duplicate identity.
3. The importer reads embedded metadata locally, falling back to conservative two-part spaced-dash filename inference and unknown artist/album labels. Valid embedded tags take precedence; filename artist inference must agree with an embedded title. Explicit track/disc prefixes are stripped, not genuine numeric titles.
4. Each track and its audio Blob are saved in IndexedDB before being added to interface state.
5. The interface derives visible tracks from search, view, group, and sort settings.
6. Selecting a track loads a snapshot of visible track IDs into the queue reducer.
7. `usePlayer` resolves the active ID to a track, creates temporary Blob URLs, and controls the native decoder engine.
8. Browser events update duration and position or advance the queue. Audio errors pause playback and show an actionable message.

Import is sequential to limit concurrent parsing and storage pressure. Successful files are committed individually; if storage becomes full, earlier successful imports remain available. Import progress describes processed files, not transferred bytes.

## Models and persistence

`Track` includes an ID, title, artist, album, duration in seconds, filename, size, import timestamp, favorite flag, audio Blob, and optional artwork data URL. See the [API reference](API_REFERENCE.md) for exact fields.

The `wave-library` IndexedDB database is at schema version 3. `tracks`, `playlists`, and `albumOrders` are keyed by `id`; `artists` is keyed by exact `name`. The conditional upgrade adds `playlists` when migrating version 1, leaving existing tracks and favorites intact. Version 3 conditionally adds artist profiles and album orders to version-1/2 libraries; no audio record is recreated. Connections close on blocking/version changes so later upgrades can proceed. New IDs and optional `contentHash` are full-file SHA-256 digests. Renamed/redated exact byte copies are skipped; different file tags or encodings produce different hashes. Legacy IDs remain unchanged to preserve playlists. Same-size legacy candidates are hashed lazily and their hashes saved before deduplication. Hashing reads one complete file into memory, bounded by the 200 MB import limit; very large libraries still need worker profiling.

Audio Blobs are copied into storage so tracks survive reloads without asking for file access again. Embedded artwork is limited to 2 MB and JPEG, PNG, or WebP images. User-selected artwork is limited to 5 MB and 40 million decoded pixels, then center-cropped/downsampled to a JPEG of at most 512 square pixels per side, quality 0.8, without upscaling. Temporary image URLs are revoked on success and failure. The original audio file is never modified. Favorites are stored alongside each track. Theme, editor opt-in (default off), and animation preference (default on) use localStorage; settings remain usable for the current session if localStorage is unavailable.

Import commits original audio before updating the UI; playback is not required. Persistent storage is requested automatically and via Settings, with unsupported/denied cases handled. The storage panel distinguishes approximate library sizes from browser-reported origin usage/quota; audio still consumes its original size and database overhead varies. Stored music is origin- and profile-specific. Browser quota, eviction, private browsing, or clearing site data can remove it. There is no backup/export feature yet. Future database changes must increment the version and explicitly migrate existing records.

### Playlists and non-destructive edits

A `Playlist` has a UUID, name, description, optional artwork, ordered unique track IDs, and creation/update timestamps. Playlist mutations read the latest record in a transaction and validate membership against stored tracks. Deleting a library track and pruning all playlist references share one read/write transaction, also pruning saved album orders. The app prunes the in-memory collection and playback queue only after successful deletion. Deleting a playlist or membership never deletes the referenced audio.

`Track.originalMetadata` captures title, artist, album, and artwork at the first edit; subsequent edits retain that snapshot. `editedAt` records the last edit. Restore reapplies the snapshot and removes both fields. Favorites and metadata updates read fresh database records atomically, preventing a stale favorite click from overwriting saved edits. The hook merges returned records while retaining the existing audio Blob reference so these updates do not restart playback.

Playlist name/membership management is always available. Song edits and custom playlist descriptions/covers require the Settings opt-in. Disabling it retains saved values; no file tags are rewritten and no export is implemented. Changes become visible only after successful writes. Failed saves leave the form and stored data available for retry.

## Playback state

`playerReducer` owns:

- Queue IDs and the current index.
- Play/pause intent.
- Repeat mode: `off`, `all`, or `one`.
- Whether the queue is shuffled.

The hook owns transient browser state: elapsed time, actual duration, buffering, and playback errors. Volume and the last audible level use localStorage; queue and position are not persisted across reloads.

At the end of a queue, repeat-off stops, repeat-all wraps, and repeat-one restarts the current track. Manual next ignores repeat-one. Previous restarts the current track if more than three seconds have elapsed, otherwise it selects the previous track. Removing the active queue entry selects the next available position or the previous last entry; removing the final entry resets playback.

Shuffle preserves the current track while randomizing the rest. The reducer retains `orderedQueue`, the original filtered/sorted snapshot. Turning shuffle off restores that order for IDs still in the queue; queue removal also prunes the saved order. Shuffle is not a listening-history feature.

The audio engine revokes old object URLs, releases both native decoders and its timer on unmount, and ignores playback promises superseded by later state changes. React Strict Mode remains enabled to expose lifecycle problems during development.

## Browser integration

Media Session metadata and actions are registered only when supported. Supported system actions include play, pause, next, previous, and absolute seek. Unsupported actions are ignored. This does not guarantee uninterrupted background playback on every mobile browser; operating-system and browser policies still apply.

### Linking two devices

The sync layer (`src/sync`) was written before it had a door. It now has one, and the door is a settings page.

- **Signalling** (`signal.ts`). No relay exists, so the two browsers carry their own SDP: the host's offer is compacted (deflate through `CompressionStream`, base64url, `wave1.d.`/`wave1.p.` prefix) and pasted into the guest, whose answer comes back the same way. Both sides gather ICE candidates before the code is shown, so one exchange is enough.
- **Transport** (`transport.ts`). One ordered `RTCPeerConnection` data channel with a public STUN server. Same network: host candidates connect directly. Different networks: server-reflexive candidates usually do. Symmetric NAT is refused honestly rather than left hanging.
- **Link** (`link.ts`). The pairing session runs over that channel, so every frame after the six-digit confirmation is sealed with the derived AES-GCM key. A paired link immediately sends its library index in slices under the 96 KiB frame ceiling; a `loan-offer` makes the sender read its own file, announce a SHA-256 and chunk the bytes, and the receiver's `LoanInbox` reassembles, verifies and commits the loan and its audio in one transaction. Nothing is playable until it verifies.
- **Interface** (`hooks/useDevices.ts`, `components/DevicesPage.tsx`). Sequence, progress, errors and the borrowed-space budget; keys never cross into React state.

### The lead-in to a mix

`MixCueStore` (`src/ui/mixCue.ts`) is a tiny external store, subscribed by the two places that draw it, holding one cue: which song is leaving, which is arriving, the whole seconds left and a 0–1 progress. The engine's 20 Hz loop writes it only while the current song is playing, Mix is on, a next song exists and less than `MIX_CUE_SECONDS` (20) remains. It notifies once per whole second, because the picture moves by a fraction CSS interpolates and only the count changes. `MixCueVisual` renders one cover that takes a breath (scale and brightness driven by the same progress value) and nothing else; when the real handover starts, `MixVisual` takes over with no jump. `MixCueLabel` is one word whose highlight is a CSS gradient clipped to the text, with a grey fallback under reduced motion. Both places that draw it animate their own box, so the text around the cue closes as smoothly as it opened.

### Search ranking

`rankTracks` (`src/domain/searchRank.ts`) filters with the same accent-insensitive matcher the rest of the app uses, then orders by match kind — exact title, title prefix, word start, artist, album, anything else — keeping library order inside each rank. Recent searches live in `localStorage` as five trimmed phrases, written when a query settles rather than on every keystroke.

### Mix pipeline (analysis → planner → engine)

Mix is three separable stages so each one can be tested without audio hardware.

1. **Analysis** (`src/audio/dsp.ts`, `analysis.worker.ts`, `mixAnalysis.ts`). A song is decoded once into a mono 11 kHz copy through `OfflineAudioContext` (bounded by 60 MB and 15 minutes), transferred to a worker, and reduced to frames of RMS plus bass/low/mid/high energy. From those frames: an onset envelope, a tempo estimate (autocorrelation with a 120 BPM prior and parabolic refinement), beat phase, silence bounds for the intro/outro, up to 24 energy segments labelled intro/build/body/breakdown/outro, and vocal regions from the 500–4000 Hz share. Results are cached per `Blob`. The decoded copy is a _measurement_, never a playback source.
2. **Planner** (`src/domain/mixPlanner.ts`). A trusted grid needs confidence ≥ 0.35 and 60–200 BPM. The overlap is a whole number of bars at A's tempo (aimed at `TARGET_SECONDS`, so 8–16 bars depending on tempo, fewer when the tail is short), starts on a bar line inside A's audible tail, and enters B on the first full bar of its body (`introEnd`, capped at `MAX_ENTRY` = 20 s). The entry is never moved past a voice: if anything is sung in the part that would be skipped, B starts at its first beat. If the entry lands on a vocal, the planner looks ahead inside a six-second window for a clear bar; if none exists it halves the overlap. The tempo gap is closed with `bpmA/bpmB` only inside ±8 %. With no usable analysis it falls back to an equal-power overlap (`crossfade`) or to nothing (`cut`). At playback the engine waits for the plan's own `startAt`, not for "a second before the end": if it arrives late it asks `realignPlan` for a plan moved forward by whole bars (losing those bars from the overlap), and abandons the plan when fewer than two bars remain. The plan is descriptive data — no audio is written.
3. **Engine** (`src/audio/MixAudio.ts`, `mixGraph.ts`). A level match from `levelTrim` rides on top of the curve: the mean body level of each analysis is compared, the louder deck is pulled down by at most 6 dB for the overlap, and unity is restored when it ends. That is a playback gain on the element or the graph node, never a change to the file or to its loudness on disk. The spare native element starts at `plan.cue` with `preservesPitch` and the planned rate, gains follow `planGains`, and a 180 Hz lowshelf closes A's low band while opening B's around `bassSwapAt`. The rate returns to 1 and the shelf to 0 when the overlap ends, is cancelled or paused. Without Web Audio the engine still performs the equal-power overlap, just without the bass swap. A media element is only attached to `createMediaElementSource` when the context reports `running`; if it stays suspended or refuses to resume, the graph is dropped and the song plays through the native element, because an element routed into a suspended context is silent. Resume is attempted from the play gesture, from the first pointer or key press, and once a second while playing.

Entering on the first full bar is what makes a join audible as a mix: the outgoing song is handing over to drums that are already playing, not to a held chord that has no arrival. A handover without a plan is timed by `automaticMixSeconds` (up to 16 s, never more than half of either song) instead of the eight-second fade it used to be. Overlaps aim at `TARGET_SECONDS` (20 s, so 16–24 s once rounded to whole phrases; halved when both sides sing), plans are memoised per analysis pair, and the engine will not start a handover before half of the outgoing song has played — a rule that holds even when the measurement is wrong. Because `planTransitionCached` keys on the two analysis objects, the engine's 20 Hz decision loop costs a map lookup instead of a re-plan.

Because the rate is applied only to an `HTMLAudioElement` during one overlap, the stored bytes, sample rate, bit depth and bitrate are untouched; a time-stretched song is never the song that plays afterwards.

### Rendering cost

Playback position is not React state. `hooks/playbackClock.ts` holds it in a `PlaybackClock`, notifies subscribers at most every 100 ms (seeks immediately) and exposes `usePlaybackTime`. Only the player bar subscribes, so a playing song no longer re-renders the library, the home page or the search results twenty times a second; the OS media-session position is reported once a second from the same source. Lyrics sample the element clock themselves at ~20 Hz, the blend reports a step every 2 %, and the ambient light writes a CSS custom property only when its value actually changed.

The settings page and a daily mix are `React.lazy` chunks. Long song lists mark themselves `data-virtual` and use `content-visibility: auto`, so rows outside the viewport are not laid out or painted. The ambient light blobs are smaller under 700 px and removed under reduced motion, and the startup mark is skipped when the app is reopened in the same tab.

### Layers and spacing

One z-index scale (`--layer-base` 0, `--layer-content` 1, `--layer-nav` 20, `--layer-player` 30, `--layer-menu` 40, `--layer-toast` 60, `--layer-drop` 70, `--layer-skip` 80) and one spacing scale (`--space-1` … `--space-6` = 4/8/12/16/20/28 px) live in `src/styles.css`. Ambient light is the only thing below content; menus, add-music, song options and Now Playing are native `<dialog>` elements opened with `showModal()`, so they sit in the browser's top layer regardless of the scale.

### YouTube songs and clip discovery

`Track.source` is `'local'` (default) or `'youtube'`. A YouTube record has `videoId` and no `blob`, so the existing `tracks` store holds both kinds without a schema change, and playlist membership is unaffected. `useLibrary.addYouTube` reads the public oEmbed title, stores the record and refuses duplicates and playlist links. Playback releases the native decks and hands the transport to `YouTubeStage`: the official `youtube-nocookie` embed is the master clock, and Wave mirrors its `infoDelivery` events into `time`/`duration` while posting play, pause, seek and volume commands. Mix analysis, blending and byte comparisons skip YouTube songs by construction (`isYouTubeTrack`).

Clip discovery (`src/services/clipSearch.ts`) asks public Piped/Invidious instances for the song with a hedge — one host at a time, the next after 1.2 s, four in flight, nine-second budget and 4 s per host — and stops at the first convincing match, cancelling the rest. It ranks candidates in `src/domain/clipSearch.ts` (title similarity, artist in title or channel, length within 0.6–2.2× and a bonus inside 45 s, hard rejection of karaoke/cover/reaction/instrumental/slowed uploads) and stores the winner in `wave-video-clips-v1` together with the upload's length and a placement (`autoClipStart`) that starts the picture where the music is. Only title and artist are sent, both found and empty answers are cached, and `unavailable` leaves the link field in the song's options. Playback then targets `position + startAt`, wrapped inside the clip when it is shorter than the song (`fitClipTime`). The bridge to the player is plain `postMessage`: the page sends `{"event":"listening","id":…,"channel":"widget"}` — without it YouTube answers nothing at all and no correction can ever be issued — then reads the position from the periodic `infoDelivery` messages and sends `command` frames (`playVideo`, `pauseVideo`, `seekTo`, `setPlaybackRate`) back. The iframe has an id, `enablejsapi=1` and a matching `origin`, and every inbound message is checked against that frame and that video id.

`AudioInfo` optionally stores codec, sample rate, bits per sample, bitrate, and lossless metadata read during import. Legacy records remain valid without it; no schema version change is required. Source technical metadata is retained internally but no verbose source/state block is rendered in Now Playing. The audio Blob is neither re-encoded nor processed when importing or editing. Native audio decoding is used. No codec conversion, FFmpeg, Android service or Web Audio output processing is included. Visual amplitude analysis first reads a `captureStream()` of the selected native element through a disposable `MusicAnalyzer`. Its MediaStream source connects only to an analyser, never to a destination; the original element remains the sole audible output. No microphone, system-audio capture or media-element source rerouting is used. Unsupported capture falls back to a bounded OfflineAudioContext envelope. Native volume is clamped to [0, 1], defaults to 1, and remembers the pre-mute level. Seeking requires a positive finite browser duration. Waiting/playing/canplay events expose buffering; Media Session position reporting is guarded for optional support. Sequential track transitions and opt-in crossfade are supported; universal gapless playback is not promised.

## Interface and accessibility

The approved visual direction is documented in [Interface Design](DESIGN.md): Material 3-style tonal surfaces, category pills, and a compact playback bar on all screens. Now playing is a full-viewport modal with a two-column desktop layout and stacked mobile layout. Home shows collection shortcuts, recent albums/songs, playlists, artists, and local daily mixes; Search exposes collection-wide search; Library handles category browsing.

CSS custom properties define dark and light palettes. Nunito Sans is self-hosted. `useArtworkColor` samples a small local canvas to derive the player hue, with fixed tonal lightness and a neutral fallback. Artwork sampling does not modify the library or send image data to a service. System theme observes `prefers-color-scheme`. Layouts adapt the navigation rail to a mobile bottom bar. The compact player opens a full-viewport dialog at every width; app-shell padding reserves scrollable space behind fixed controls, and notifications sit above playback. Controls use semantic buttons, accessible labels, and visible focus indicators. Dialogs use native modal focus handling. Motion for React provides reusable spatial springs for position, layout, selection, press feedback, and playback-control shape; short non-spring effects control opacity. `useWaveMotion` combines the Settings preference with system reduced motion. CSS playing/favorite indicators obey both preferences. Exiting list rows and dialogs are inert and hidden from accessibility queries. Dialog cleanup closes the native modal before restoring focus; the full player explicitly supplies its initiating Home/bar button. If that button has been deleted, disabled, or made inert, focus returns to the main workspace without scrolling. Full-player collapse/queue actions sit in a sticky header.

Play/pause shortcuts avoid editable controls, buttons, and open dialogs. The search shortcut also works from focused controls and opens Search when needed. Search and library views are stateful sections rather than separate URLs in this milestone.

### Collection views and rendering

`collectAlbums` keys groups by the artist/album pair, chooses available local artwork, and records the latest import date. `collectArtists` derives alphabetical groups, album counts, and the sum of known finite durations. Neither invents remote artist data nor mutates inputs. Home memoizes grouping/recent-song derivation; collection views are memoized with stable navigation/import/favorite callbacks so elapsed-time updates do not redraw unrelated library rows.

`LibrarySurface` coordinates old/new views under AnimatePresence with a short effect exit and spatial entry. Exiting surfaces are inert and hidden from accessibility queries. Artist cards use bounded stagger/layout/press feedback. Playback glyphs animate separately from control shape; seek progress uses non-overshooting effects. Reduced motion disables spatial/decorative movement.

## Privacy and security

There are no music uploads, analytics requests, API keys, or accounts. Dependencies and assets are bundled locally. Automatic lyrics sends only title/artist and known album/duration to LRCLIB with omitted credentials and referrer; it can be disabled in Settings. Network failures never masquerade as a confirmed missing result. Metadata is rendered as text through React, never inserted as HTML. Only supported raster artwork formats are displayed. Deployment should use HTTPS to provide Web Crypto and a secure origin.

Malformed media is treated as untrusted input: metadata failure uses a fallback and decoding failure reports an error. The 200 MB per-file import limit is a resource safeguard, not a guarantee against every expensive parser input. Very large libraries and parsing off the main thread need further profiling.

### Collection views

`collectAlbums` keys groups by the artist/album pair, chooses an available local cover, and records the latest import date. `collectArtists` derives alphabetical groups, album counts, and the sum of known finite durations. These selectors never invent remote artist data or mutate tracks. Home and artist/detail components are separate from the app shell; Home limits recent song rows to six and memoizes group derivation.

`LibrarySurface` coordinates old/new view transitions under AnimatePresence with a short effect exit and spatial entry. Exiting surfaces, rows, and dialogs are inert. Artist cards have bounded staggered entry and spring layout/press feedback. Playback symbols crossfade/move separately from control shape; progress uses non-overshooting linear effects rather than a spring. Reduced motion disables spatial/decorative movement.

## Testing and future boundaries

Unit tests exercise pure queue/playlist transitions, filtering, formatting, validation, version-1 migration, atomic pruning, original restoration, concurrent metadata/favorite writes, and persistence. Component tests cover browsing, search, and settings. Real-browser tests import generated audio, play it, reload the page, and check narrow-screen layout, editor gating, cover processing/errors, playlist ordering/persistence, playback continuity during editing, motion preferences, fullscreen bounds/opaque surfaces, artist ownership, Home navigation, pre-mute persistence, selected queue-order restoration, and byte-for-byte preservation of a 24-bit WAV fixture.

Next boundaries to extract are feature-specific screens, import workers, backup/export, and an offline application shell. Spotify/Deezer connections and Firebase remain deferred; no authentication or remote-import code is included. New abstractions should follow concrete needs, not duplicate the original Android interfaces.

## Lyrics, profiles and collection customization

`Lyrics` stores bounded raw text, parsed lines, a manual millisecond offset, and local/embedded/LRCLIB provenance. LRC timestamps (including repeated timestamps and fractional seconds) are sorted. The file-header offset is applied during parsing; the user offset is applied during playback. Millisecond SYLT tags are supported; MPEG-frame tags and unsynchronized text are not presented as synchronized. A binary search finds the active timestamp from the active HTMLAudioElement clock; duplicate timestamps highlight together. General player state samples the native clock at 50 ms while playing; lyric panels additionally read that clock per animation frame without a synthetic timer, subject to browser scheduling/precision. `lyricFillProgress` derives visual fill from the active native time, offsets, next distinct timestamp or final native duration. `lyricFillTokens` preserves Unicode text/whitespace and apportions the fill across word spans, allowing natural wrapping. CSS clips the bright/muted gradient to glyphs rather than drawing an auxiliary bar; plain text stays unsynchronized and forced-colors mode uses readable system text. Enhanced LRC retains supplied word timestamps and optional ends, including repeated line/header offsets. Ordinary LRC remains visual line interpolation, not invented word timestamps. The normal reader keeps all lyrics with internal scrolling and follows the active native timestamp. ResizeObserver fits the active verse; cinema keeps neighboring context without ellipsizing the current text. Outer Now Playing never scrolls. Parsed lines are reconstructed from bounded raw text on load, rather than stored twice. `useAutomaticLyrics` serializes delayed LRCLIB metadata lookups, defers during import, prioritizes the current song, cancels on opt-out/metadata changes, and schedules throttled tracks at the provider deadline; ordinary network failures still back off conservatively. The persisted `wave-auto-lyrics` preference defaults off and also requires the web `wave-lyrics-consent-v1` flag for automatic requests. Manual one-track lookup is independent of automatic activation. The API is bounded to 600 KB and a 15-second overall timeout; normalized title/artist must match. Known duration differences above eight seconds are rejected; synchronized text requires a known duration, a difference of at most three seconds and a valid in-recording timeline. Smaller non-synchronized matches can supply plain text. An album-specific exact miss retries without album, then structured/free-text search examines up to twenty validated candidates, ranked by album/duration/text. Requests use safelisted GET headers from the start, avoiding custom-header preflight and duplicate network retries. A provider-wide queue spaces all request starts by 500 ms and holds the slot through response parsing. Web Locks share it across same-origin tabs when supported; otherwise it remains tab-local. Identical concurrent lookups share work with independent cancellation. All queued requests recheck the persisted provider cooldown. Valid numeric/HTTP-date Retry-After values are honored with a one-second minimum rather than an artificial minute; missing/invalid headers retain a conservative 60-second fallback. In browsers the provider must expose Retry-After through Access-Control-Expose-Headers; an unexposed header is unavailable to application code and uses that same fallback. Apostrophes normalize consistently with provider identity, official music-video decorations are removed conservatively, and versioned lookup keys invalidate pre-fix misses without touching saved lyrics. Manual/embedded lyrics always win in atomic repository writes; metadata edits invalidate downloaded lyrics. Misses cache one day, instrumental statuses seven days and ordinary errors fifteen minutes; provider-throttled tracks instead become eligible at retryAt, with an automatic wake-up when enabled. General eligibility is checked on relevant library/selection changes, with explicit retry available. Cached lyrics stay usable indefinitely offline. Lyrics writes read the latest track atomically and retain in-memory audio Blob identity.

Manual artist profiles store separately processed raster artwork. `useCustomizations` loads/saves profiles and album orders; gallery, Home and artist detail share the photo map. Album order writes validate a full permutation against current owned artist/album-pair tracks in a transaction. Stale deleted/moved IDs are ignored during derivation; new tracks append by disc/track number then import date. Playlist reorder uses the same permutation check. Reorder dialogs work from complete collections rather than filtered lists; drafts save only on confirmation. Motion Reorder handles pointer drag, with buttons and Alt-arrow keyboard alternatives.

## Native Mix engine

`MixAudio` owns a primary native Audio deck and lazily creates one spare when crossfade is enabled. It preloads only the next eligible queue entry. With finite durations, a decoded incoming source and remaining time within the fade window, it starts the incoming element, validates that the playing queue target is still current, promotes its identity, and applies media-clocked equal-power gains (`cos(pπ/2)` / `sin(pπ/2)`) over at most the automatically selected pair window, remaining outgoing duration and half incoming duration. A 20 ms timer updates gains, with native-position/blend reporting approximately every 50–60 ms; volume and mute affect both decks. Blend state exposes the original outgoing/incoming Blobs, elapsed fraction and actual fade duration for opacity-only artwork fades in the full and compact players. No transition meters or banners are rendered. Cancellation/completion clears that state; the transition has no spatial cover movement, including under reduced motion. Outgoing media events cannot advance or error the new current song. Preparation/play rejection retains the outgoing song and falls back to normal transitions. Generation tokens discard stale pending starts; pause/seek/source replacement cancel overlap. Removed outgoing queue/library entries cancel their tail. Repeat-one and single-entry repeat bypass crossfade. Blob bytes are not processed or re-encoded. Browser restrictions and throttled background timers can limit ramp smoothness.

`MixGraph` builds `source → low shelf → gain → low-pass → destination` per deck, and a handover uses all of it: `handoverGains` is staged rather than symmetric (the incoming deck is at level a quarter of the way in, the outgoing one holds, then leaves), the shelf swaps the low end at `bassShelfDb`, and `filterOutHz` closes the outgoing deck's top from 20 kHz to 1.6 kHz over the second half. The EQ is applied whenever the graph is running, planned or not, and `cancelTransition` plus the end of every overlap return both decks to `OPEN_AIR_HZ` and 0 dB. The graph object is kept when the context refuses to start so the timer can retry and attach later; previously it was discarded, which left a session with no EQ at all.

Where a handover may start is bounded twice. The planner works from the analyses (bar-aligned overlap ending at the audible end, the incoming song entering at its own beginning, within `MAX_CUE_LEAD`). The player then asks `mixWindowReached(currentTime, duration, lastMixSeconds)` before it reads any plan: the _file's_ remaining time must be inside the final seconds, so an analysis that reports the audible end early can no longer cut a song in the middle. Both the planned overlap and the length-based fallback go through that gate. The clip backdrop has no control surface at all: `ClipPlayer` renders an iframe and a veil marked `aria-hidden`, `pointer-events: none`, driven every 500 ms from the song's clock; removing a clip from the song's options writes storage and dispatches `wave:clips-changed`, which is what closes the video.

## Compact chrome and Home composition

Navigation receives existing derived album/artist/playlist/favorite counts and the same `browse` callback as Home; no duplicate data loading or simulated collections are introduced. Desktop collection shortcuts preserve the established clearing of stale group/search state. The main navigation stays a single accessible landmark; collection actions are a labeled group with distinct accessible names.

Home memoizes real groups/recent tracks, uses local daily mixes and a responsive song/secondary-panel dashboard. Album shelves and mobile shortcuts scroll within their containers rather than overflowing the document. The 64 px collapsed player preserves all desktop actions and the explicit full-screen opener/focus-return behavior.

## Three-platform update

Home is the initial web page; Settings is now a full page, not a dialog. Lyrics starts open in a collapsible section each time Now Playing expands or the song changes. Redundant source/playback status text is removed. The original curved W mark replaces generic waveform bars. Online automatic lyrics is optional/off initially, while manual one-song lookup remains available. Exact/search requests validate artist/title/duration, identify the client, and honor provider cooldowns; availability cannot be guaranteed. Crossfade uses incoming media time and equal-power gains, not elapsed wall time. Duplicate cleanup merges only confirmed byte-identical records, preserving references; same-name groups are reviewed non-destructively.

Separate native Android (Kotlin/Compose) and Windows (C#/WPF) source implementations exist; prior web-only scope statements apply to the web architecture, not the entire project. They are early, uncompiled in this workspace and lack full web parity. [PLATFORMS](PLATFORMS.md) is the authoritative build/status matrix. [Privacy](../PRIVACY.md) describes data flows, rights and unresolved public-release obligations.

## Reload restoration and listening stage

`playbackSession` validates versioned localStorage session data before reducer restoration. Library hydration prunes missing IDs and reconstructs queue/order before audio loading. Restored playback is always paused; `loadedmetadata` applies the selected position, clamped to the native duration. Periodic and page lifecycle saves include the decoder clock rather than a fabricated timer. Queue reconciliation preserves play intent for surviving tracks.

The decoder reports duration with its source track ID, so late metadata cannot overwrite another song. Significant corrections update metadata and invalidate only stale online-lyric caches, never local lyrics or the stored audio bytes. Exact lookup uses cleaned/inferred title and artist; recording editions, duration and the resulting timeline constrain synchronization.

`PlayerBar` owns the open lyric disclosure and `useIdleListening` owns the 30-second activity timer. The bounded listening grid is separate from the read-only cinematic stage. Activity clears immersion without changing the player reducer or engine source. No second audio element/clock is introduced by cinema.

Lyric rows use size-container typography and whole-line clamping instead of clipping half-glyphs. The missing-lyrics state removes redundant controls/hints on short screens so import/retry remain reachable. Focused text editors outside dialogs also block immersive entry.

## Global tones and playlist identity

`useAppPalette` samples the playing local artwork (or restores neutral roles on pause) and updates root tonal variables. `document.startViewTransition` snapshots the CSS change; the new root clips from a bottom-centered circle. The initial neutral state, reduced motion, unavailable API and hidden documents avoid animation. `wave-palette` stores only hue/saturation for consistent standalone privacy-page appearance.

`playlistIcon` creates escaped deterministic SVG data URIs. `usePlaylistVisual` samples up to twelve distinct member artworks locally, shares a bounded 64-entry promise cache and computes a multicolor icon in memory. Explicit artwork bypasses generation. `useArtworkColor` tones the resulting playlist surfaces independently from the global current-song palette. No database migration or audio-storage change is needed.

## Discovery refinement (web)

`SearchPage` owns a composer, local result-category state and grouped derived song/artist/album/playlist results. The App retains query/navigation state and clears stale collection state when changing destinations. Only Search has a composer; Home, Settings and Library have no repeated search/filter field. `musicIdentity` centralizes accent/case/punctuation normalization and order-independent token matching; songs and playlist filters share it. No schema, audio-storage migration or remote search service is introduced.

Import and lyric lookup share conservative filename identity parsing. Metadata-only inference is not acoustic fingerprinting. Existing saved metadata is not silently migrated or overwritten. Lyric query cleaning preserves numeric titles and edition descriptors while removing presentation/featured-credit decorations. Each provider candidate is parsed in isolation; malformed timing falls back to valid plain text, or is skipped so the next verified candidate can be tried. A rejected album-specific exact response retries without album, with the existing request spacing, bounds and recording guards.

## Motion, energy and lookup lifecycle

`StartupAnimation` is a short initial W/line/wave/W morph, bounded by library hydration and one initial presentation. Reduced/disabled motion removes the artificial dwell. `useInteractionRipples` attaches one delegated pointer listener, creates only short-lived noninteractive spans inside eligible controls, and cancels active effects during cleanup. `useWaveMotion` subscribes to native reduced-motion changes via `useSyncExternalStore` in addition to the application preference.

`amplitudeEnvelope` reduces decoded channel samples to ten RMS-amplitude bins per second without phase cancellation. `useMusicEnergy` analyzes supported source Blobs separately with OfflineAudioContext at 22,050 Hz, caches compact envelopes in a Blob-keyed WeakMap and reads the active native clock. Sources over 24 MB or a known 20-minute duration are skipped; decoding failures are silent visual fallbacks. The extra decode is never connected to playback and never stored or uploaded. At most 25 visual updates per second smooth attack/release and update root CSS variables; pause, hidden/unfocused state, buffering, volume/mute and both motion preferences gate the effect. Visuals represent the selected source, not microphone/device output or the sum of crossfading decoders.

The lyric hook now uses request generations and abort checks so a canceled request cannot clear a newer request's loading state. Manual requests survive interrupted imports; pending work is visible immediately. Explicit retries bypass generic automatic-error backoff but not persisted provider Retry-After. Automatic reconnect retries only an eligible failed current song. Missing/inaccessible/invalid Retry-After receives a finite minimum 60-second cooldown rather than NaN. The UI exposes the remaining pause. Unknown-duration lookup starts at structured search; exact 400/422 responses fall through instead of ending the whole lookup. Featured-credit parentheses and common LRC single-second/comma/offset-whitespace/line-ending variants are accepted without relaxing recording identity or duration/timeline guards.

## Bounded player stage and measured light

`src/styles/player.css` owns the expanded stage/transport namespace, replacing obsolete competing player selectors. Record/reader/transport have explicit grid areas; the artwork size is bounded by its actual record container, including short landscape. `PlaySymbol` has a fixed icon slot during presence transitions. The seek component observes its rendered width: the full SVG path extends beyond both edges and travels by exactly one 32 px period inside a progress clip. The thumb is outside that clip, stays inside the SVG and retains a transparent native range hit target with standard keyboard behavior. Pause flattens the path; reduced motion stops translation.

`useMusicEnergy` samples live RMS every 40 ms, compresses dynamic range for quiet passages and smooths attack/release. Capture initialization has bounded retries; unavailable/suspended analysis can use the existing envelope fallback (24 MiB / 20-minute advertised-duration bound). Capture tracks, source/analyser connections and context are disposed on pause, source replacement, unmount or motion opt-out. Blur/visibility suspends visual analysis. Root variables drive a tonal modal light layer above its background paint and below interactive content; silence/mute/pause make it transparent. This is source-amplitude visualization, not device-output measurement or BPM detection.

Lyric text stays primary. Synchronized precision is available through accessible descriptions/tooltips, plain text is labeled **Text lyrics**, and LRCLIB attribution remains linked. Editing/follow/paging use compact controls. Native details reveal timing adjustments deliberately and block idle immersion while open.

## Spectral listening, album verification and asynchronous ownership

`MusicAnalyzer.readBands()` measures a 2048-point spectrum alongside RMS. `spectrumBands` sums finite spectral power in 35–250 Hz, 250–2500 Hz and 2500–12000 Hz bands and bounds the visual result. These bands do not identify instruments or separate vocal stems. Independent phases advance from measured band energy, moving three soft radial light falloffs in `MusicLighting`, without SVG wave silhouettes, filters, synthetic BPM or an audio destination connection. The envelope fallback has only amplitude information and makes no spectral-separation claim. A resume grace period avoids eagerly decoding fallback audio while live capture is starting.

`WaveSeek` is shared with the compact player. Small screens expose a slim, in-bar track while preserving the 64 px bar and independent transport. Queue is a separate `QueuePanel` in a themed modal sheet; it keeps a scrolling list, marks the selected row, shows real total duration, and dispatches a current-row jump without seeking to zero.

Album comparison preserves the original request metadata but canonicalizes common bracketed deluxe/reissue suffixes for ranking. An album match outranks duration-only candidates. A conflicting performance edition is rejected; other conflicting albums cannot authorize timestamps, and their otherwise verified plain text is deferred until album-free exact and structured/free-text searches have been examined. Unknown album metadata is not invented. Cache identity v3 retries old misses without replacing local/embedded or already saved lyrics. Actual live provider availability remains outside controlled-response test coverage.

Native playback has a play-intent token distinct from crossfade generation. Old play rejections cannot stop a newer play intent; stale transition promises cannot pause a deck now owned by a newer command or clear its pending state. Restore cleanup captures its original element rather than querying a later active deck. Native output, gain policy and source bytes remain unchanged.

Palette transitions cancel obsolete reveals and generation-guard update callbacks. Named listening snapshots and tonal surface transitions cover the full player; motion opt-out disables the added transitions. Privacy reads only appearance preferences, shares the exact Wave background roles and listens for system/storage appearance changes. No legal text, permission or provider was added.

Lyric-clock rendering is limited to about 30 updates per second; unchanged neighboring rows avoid time-driven rerenders. Active-line fitting resets prior fitted sizes, uses bounded binary search and recenters once after sizing, rather than starting a smooth scroll then immediately snapping it. Offset writes resume following, support reset and recover after false/rejected saves. Cinema pauses the hidden reader's extra clock, explicitly hides the normal view and keeps source playback independent.

## Media-clocked mix and contextual interaction

`wave-mix-v2` is the single automatic Mix switch, enabled for fresh installations; legacy disabled overlap preferences remain disabled. There is no duration slider or classic/staged mode selector. `mixGains` applies a smooth staged phase to complementary sine/cosine gains: entrance, central overlap and tail release. The public Mix path always uses the staged phase. The mode is captured at overlap start so changing the setting cannot jump an existing fade's gains.

`sourceEnvelope` shares one bounded decode Promise per original Blob with visual fallback (24 MiB / 20 minutes). `amplitudeEnvelope` includes all decoded samples so a periodic tone cannot alias into apparent silence. `mixCues` considers only very low source RMS, recordings at least eight seconds long, skips at most four seconds of leading/trailing silence with safety margins, and requires at least 350 ms of savings. Missing/unsupported analysis keeps 0–duration. The active source's effective tail controls handover timing; incoming progress subtracts its cue, while lyrics, seeking and session positions continue using the original recording clock. No output audio graph, tempo/pitch modification, beat matching or Blob rewrite is introduced.

The queue reducer validates permutations, preserves selected ID and play intent, writes the new `orderedQueue` and exits shuffle. `QueuePanel` uses a controlled Motion reorder group plus non-drag alternatives. Existing session persistence saves the result. A target guard rejects a pending handover if queue edits changed its destination.

App-level context delegation resolves `data-track-id` on song rows, Queue and player surfaces. `ContextMenu` uses a native modal dialog for top-layer placement and focus containment, viewport-clamped pointer/keyboard placement, enabled-item keyboard navigation and focus return. Selected text, edit fields, links, Shift-right-click and other editing dialogs retain native behavior. Library deletion is available only through the existing options/confirmation flow.

`useAppPalette` consumes actual blend progress, caches the displayed outgoing origin until artwork is decoded and interpolates the shortest hue arc plus saturation without per-frame snapshots or storage writes. It persists the final palette and cancels stale reveals. Reduced motion applies the target directly. Root `data-immersive` hides workspace, navigation, compact player and toast while the normal-stage subtree is explicitly hidden; audio ownership and clock are unaffected.

## Import verification, continuous listening and rendering budget

A reusable same-origin module worker parses embedded metadata off the UI thread; unavailable workers retain the direct parser. File-level bad tags do not disable workers for later files. Import still saves each original Blob immediately and sequentially, preserves content-hash deduplication and yields low-priority UI updates. Supported embedded front covers are preferred; bad artwork cannot discard good tags. Local checks report completeness without claiming recording identity.

Catalogue verification and external cover completion have been removed from the service, hooks, Settings and library mutation API. Legacy verification preferences/check suggestions are inert. Previously stored user data stays intact; no deletion or re-import migration is run. The local review derives completeness from current fields. LRCLIB remains an independent opt-in lyric service.

Autoplay prepares a continuation at the final recording's boundary, retaining its source/time for Mix preloading. Native ended also has an ordinary-transition fallback. The reducer replaces exhausted queue history with current plus unique next IDs, avoiding repeated-ID ambiguity; original per-track positions remain local. Context weights favor artist/album, genre, era, duration and favorites, with randomness and recent alternatives. Repeat and pause cannot trigger continuation. A library containing only the current song stops unless repeat applies.

Playback root time updates are bounded near 10 Hz, while actual gain/overlap reporting and local lyric clocks remain independent. Seek paths rebuild only on geometry/play-state changes, artwork decodes lazily/asynchronously, Search is memoized with deferred filtering, and queue ID resolution is indexed. Collections over 120 entries use plain rows rather than per-row layout animation; CSS off-screen containment reduces painting but does not virtualize the DOM. Visual RAF is canceled on blur/hidden state and resumed on focus. Phone touch targets and paged metadata review bound the new controls; short entrance staggering respects reduced motion.

## Settings hub and bounded collection labels

`SettingsPage` keeps a local selected-section state and mounts only that section's controls; expensive storage/audit work is deferred until Storage opens. Six keyboard-accessible cards replace the long options sheet. Opening a submenu focuses its heading; returning focuses the originating card. The existing app-level Back still restores the original Settings opener. Player ownership is unchanged.

Phone Library categories wrap instead of requiring horizontal discovery; counts are derived from the actual collections. Flex/grid children explicitly shrink, long prose breaks safely and two-line card/song clamps coexist with single-line compact credits. Original strings are never shortened in storage; full metadata stays in accessible labels, detail pages and Song options. With no selected song, the empty fixed player is hidden and bottom clearance adapts, retaining navigation access. Playback-stage viewport bounds remain independent.

Playlist defaults are flat local SVG labels with a consistent glyph, restrained deterministic tones and a member-color spine; no gradient, randomized decorative mark or rotation is used. Custom artwork wins. A memoized ID map replaces repeated whole-library scans while resolving member artwork.

## Local daily mixes and editor lookup

Home no longer duplicates the selected session. `dailyMixes` partitions unique local songs by their first useful genre tag, then by main artist only when no genre is available. Generic/unknown tags are excluded. It chooses up to three sufficiently populated groups, limits each to thirty songs, rotates the first track daily and seeds the rest from group/day. No guessed mood/style, audio upload or persistent generated playlist is created. The component refreshes at local midnight and on return to the tab; existing queues stay intact.

The lyric editor owns a separate abortable search and result preview. Automatic lookup defers while editing so a background request cannot silently replace a draft. Only explicit Use/Save actions change text/storage, and source attribution survives an unchanged downloaded draft. All LRCLIB callers consult the same persisted provider cooldown. Editing does not depend on a selected/playing decoder.

Import-worker jobs now time out after thirty seconds, clear settled timers, dispose idle workers and handle message transport failure. Timeout fallback retains the importer's filename/source-Blob path without repeating the same potentially stuck parse on the UI thread; later imports can create a fresh worker.

## Independent Windows structure

The Windows client keeps WPF and OS decoders, not the React bundle. `MainWindow` owns native playback/session state, `MainWindow.Browse` builds collections/search/playlists/queue views, and `MainWindow.Settings` owns the six settings destinations and editor. `Collections.cs` contains dependency-free playlist resolution, queue movement, bounded Mix windows, tag-based daily groups and atomic JSON helpers. A separate console contracts runner exercises these rules; an isolated WPF smoke entry point captures real native layouts without accessing the user's library. Optional lyrics remains the only provider flow.

Web daily mix views retain an explicit selection snapshot, resolve it against current tracks and persist saved copies through one IndexedDB transaction. The Home card is navigation, not an implicit play action. Promotional captures use an isolated demo browser context and original assets, never a real user library.

Provider coordination relies on the same origin and available browser capabilities. Without Web Locks, scheduling is tab-local. If storage is denied, the client retains its own spacing/cooldown in memory, but cannot promise a shared deadline across tabs. No cross-origin or other-application coordination is claimed. Existing cached lookup keys are preserved to avoid a full-library re-fetch after this change.
