# Changelog

## Unreleased

### Remix, and the history behind it

- A play is written once a song has really been heard: half of it, or thirty seconds of
  a long one, and never less than five. The player samples its own clock, so pausing,
  seeking and a stall do not inflate the number, and a song skipped away leaves nothing.
- Web keeps the history in its own IndexedDB store as a version-4 upgrade over an existing
  library, with no row touched, pruned to the newest two thousand plays. Android and
  Windows keep the same list in `history.json` next to the library.
- **Remix** replaces the old Listening page. It shows one week: the time, the plays, the
  songs and the artists, how that compares with the week before, and **Your Remix** — the
  songs you played most, in order. Play Remix starts the list; Save as playlist keeps it as an
  ordinary playlist. The recent list and the artist tiles stay gone on purpose: a week is
  glanced at, not studied. Clearing the history is the only action near the numbers.
- Remix answers the week properly now, on all three platforms: the figure, three facts (top
  artist, busiest day, most played genre), seven bars for the seven days, a strip for the hour
  of the day you listen, then the list. The bars, the hour strip and the list rows settle into
  place once instead of appearing, and the counts are the same plays counted four ways.
- Home gains **Jump back in** on all three platforms: the songs that were actually played,
  newest first, rather than whatever was imported last.
- A deleted song keeps its seconds in the total — the time was still spent — but leaves
  every list.

### The look, tightened

- The sidebar wordmark is the Wave mark drawn as a word — one SVG path per letter, the same
  stroke as the old symbol — so the whole name uses Wave's own letterforms instead of a symbol
  next to type. It takes the current theme's accent and follows the song's colour with
  everything else.
- Page chrome no longer repeats "Wave" above every screen: the name lives in the sidebar.
- Every **Add music** button opens the same chooser, offering **Import local files** and **Add
  from YouTube**. Local files stay the default; nothing in the app picks a source for you.
- The song left playing while the app is idle keeps a real player bar — sleeve, title, transport
  and seek — instead of a faded caption. The bar never goes away on its own.
- Motion is springier and just as quiet: buttons press, rows lift, notices arrive with one small
  overshoot. It is all off under `prefers-reduced-motion`.
- Videoclips must come from the artist's own channel. A re-upload with the right title is no
  longer eligible, so the clip behind a song is never a stranger's video.
- No build label anywhere in the UI or the public pages; the privacy page states the version it
  applies to and nothing about how it was built.

### Android and Windows

- Both native builds now set type in **Nunito Sans**, the same typeface the web loads, shipped
  as four static instances under the SIL Open Font License.
- Both palettes are the web tokens verbatim: `#10141f` page, `#1d2230` card, `#b0c7ff` accent in
  the dark theme, and the light values beside them. A phone screenshot and a browser screenshot
  of the same screen are the same design, not two designs that agree in spirit.
- Remix on Android and Windows gains the same day bars and hour strip as the web page, drawn with
  the platform's own layout rather than an image.

### Documentation

- The README is rewritten for someone deciding whether to install Wave: what it plays, how to
  start it, and what it looks like, before any of the engineering.
- **Why Wave**, a new page, compares it honestly with Spotify, Apple Music and YouTube Music —
  including the four things those services do better.
- Screenshots of all three platforms. The web ones come from `npm run capture:docs`; the Windows
  and Android ones are drawn by the builds themselves and committed by the CI job that ran them,
  so they cannot drift from the code.

### Android

- The phone app was rebuilt around what Android already does well. Playback is a media
  playback foreground service with a media session, so the song appears on the lock screen,
  in the shade, on a watch and in a car, a headset pauses it, and a call takes the audio
  focus away and gives it back. Rotation no longer restarts playback.
- Two players instead of one: the next song is armed in silence while the current one
  plays, which is what makes the Mix blend possible on a phone.
- Five destinations — Home, Search, Library, Remix, Settings — with the mini player
  above the navigation and never hiding.
- The library screen is one collection with shelves for songs, albums, artists, playlists
  and favourites, and the same search across all of them. An album or a playlist opens on
  its own page with Play and Shuffle.
- Adding music asks where from: files from anywhere the phone can read, the music the
  system already indexes (no copy is made), or a whole folder at any depth. Files are
  hashed as they stream, so the same file cannot arrive twice, and the bytes are copied
  untouched.
- The home-screen widget shows what is playing with one button; a quick-settings tile
  plays or pauses; long-pressing the icon offers Search, Remix and Favourites. Every one of
  them, and the playback service itself, is declared in the manifest — which had lost the lot
  and has been put back.

## 0.1.1 — 27 October 2026

### Mix

- Mix replaces the old crossfade. Both songs are analysed off the main thread (tempo, beat grid
  and phase, phrases, silence at the ends, drops, vocal regions), and the handover is planned
  around the result.
- The overlap is 16 to 24 seconds, a whole number of phrases at the song's tempo, and it starts
  on a bar line instead of wherever the previous song happened to end.
- The new song arrives early and holds at level while the outgoing one leaves in the second
  half. The low end changes hands once, and the outgoing song loses its top through a low-pass
  as it goes.
- The new song is cued on its first full bar, not on its first second, so a beatless intro no
  longer fades in under the previous song.
- Tempo is matched within 8 % with pitch preserved, and the two songs are level matched for the
  length of the overlap. The louder one is turned down; the quieter one is never boosted.
- Everything happens on the playback graph. Files, sample rate, bit depth and bitrate are
  untouched, and the filter and the stretch are reverted when the overlap ends.
- A blend that playback reaches late moves forward by whole bars, and is abandoned rather than
  started crooked if too little of it is left.
- A song with no analysis (a YouTube song) still gets a timed handover instead of a bare fade.

### The announcement

- Eight seconds before a blend a small grey **Mixing** appears under the song title and stays for
  the whole handover. The cue is measured from the start of the blend, so it cannot appear after
  the songs have already met.
- The word is the whole animation: a soft highlight travels across the letters and a plain grey
  word stays behind it. Reduced motion keeps the word and drops the sweep.
- The text block around the cue opens and closes with it, so nothing jumps when a blend is
  announced. The same cue replaces the artist name in the compact bar for the length of the
  handover.

### Video clips

- Clips are discovered automatically through public YouTube front-ends. Twelve hosts are asked
  with a short hedge, the first convincing match ends the search, a dead host is skipped for ten
  minutes, and a search that finds nothing is retried a day later.
- Discovery looks for a music video. Auto-generated art tracks and lyric videos are rejected
  outright, uploads that call themselves a video are ranked first, and "official audio" steps
  back. When the plain search only returns songs, one more request asks for the video by name.
- The clip fills the screen in any aspect ratio and none of YouTube's interface shows on it: no
  title bar, no channel badge, no logo, no pause overlay. A paused song softens to a blurred
  still.
- The clip is placed where the music starts rather than where the upload begins, and follows the
  song's length: a shorter clip starts again instead of freezing on its last frame.
- The embedded player never reported anything until the page sent it a `listening` message, so
  the correction loop was comparing against a picture it had never seen. It now handshakes,
  retries, and corrects small drift by easing the playback rate instead of jumping the picture.
- A remembered clip that no longer passes the rules is searched again instead of replayed.
- The song's options show the chosen clip with its runners-up, a start offset, and a way to
  remove it.

### YouTube songs

- Add music asks where the song comes from. From this device imports files; from YouTube stores
  the link and plays the song in YouTube's own player, with no download, proxy or extraction.
- When the same song is also imported as a file, the file wins: it works offline and can be
  mixed. The YouTube entry stays in the library so the song is not lost.
- A YouTube song keeps playing at the same position while Now Playing is closed.

### Library, search and daily mixes

- Daily mixes group the library by genre tag, ordered by the tempo and energy Wave already
  measures, with no artist twice in a row. Play, shuffle, or save the selection as an ordinary
  playlist.
- Search ranks results: exact title, title prefix, a word in the title, artist, album. Enter
  plays the best match, Escape clears, and recent searches stay as chips.
- FLAC can be imported alongside MP3, WAV, M4A and OGG. Files are stored and played as they are.
- Offline controls read **Offline** and grey out instead of failing after a click.

### Lyrics

- Word-by-word highlighting is built in, with line-level timing as the fallback and a labelled
  estimate when a lyric carries no timings.
- The lyrics are not boxed. They are larger than in 0.1.0 in every view, and they keep following
  the sung line in the stage, the cinema view and on a phone.
- Optional word-level sources (NetEase, Kugou) are off by default. LRCLIB remains the default
  provider, and saved lyrics work offline.

### Devices

- Settings → Devices links two devices with a QR code, read by the app's own camera reader, or
  with a link. Nothing is typed or copied by hand.
- A device that has been linked before is recognised and re-confirmed without the six digits.
- The other device's library can be browsed and a song borrowed. The receiver verifies the
  SHA-256 before storing it, and nothing already saved is deleted to make room.
- No account and no server are involved.

### Interface

- The Wave mark and the browser tab take their colour from the cover of the song that is
  playing, with a half-second fade between songs. During a blend the two palettes are
  interpolated instead of dropping to the default blue.
- Settings is six sections instead of one long sheet, and each section mounts only when opened.
- Light and dark themes, larger text, reduced motion, and touch targets sized for a phone.
- The player bar stays where it is while a song plays; the long-idle cinema view still opens on
  its own and leaves on the first movement or key press.
- The web app installs to a home screen and opens offline.

### Android and Windows

- The Android app was redesigned: new navigation, a listening screen, the same six settings
  sections and Mix parity for the local path, on a smaller feature set than the web.
- Android phones that open the web client are offered the native app once, and never asked
  again. Settings → About can open the same sheet on purpose.
- The Windows app is a native C#/WPF shell with the web's layout. It remains an unsigned test
  build.

## 0.1.0 — 17 October 2026

- Keep both Mix covers full-size in expanded Now Playing, including narrow phones with lyrics collapsed, without changing compact-player artwork or the audio path.
- Check web/Android/Windows version identity and release notes before publication; pin web/Pages runners to Ubuntu 24.04 and use current checkout/Node action runtimes.
- Reduce lyric-service request bursts with a shared queue, cross-tab coordination and concurrent lookup deduplication; avoid custom-header preflight, honor short/date Retry-After deadlines and resume automatic eligibility without a fifteen-minute penalty.
- Align native request spacing; Windows honors HTTP-date/short Retry-After responses rather than imposing a minute, and Android no longer truncates longer provider deadlines.
- Expand the product film to 60 seconds with real UI, motion presentation and a soft acoustic-piano score.

- Make daily mixes browsable playlist views with explicit playback and atomic saved snapshots.
- Show every mobile collection shortcut in a balanced grid; reset detail-page scroll and reinforce narrow action layouts.
- Rebuild the independent Windows interface around web-like navigation, collections, playlists, a persistent editable queue, paused position restoration, six Settings sections and expanded Now Playing.
- Add native contracts and isolated WPF UI smoke captures, conventional package metadata, hashes, conditional Defender scan and opt-in trusted signing.
- Replace the technical-first README with a visual getting-started guide and an original captioned 1080p MP4 demo.

- Search LRCLIB from Edit lyrics without selecting/playing the song. Preview matched text, explicitly use/save it, retain drafts on failure/cancel and preserve provider attribution for unchanged results.
- Share provider cooldowns across callers, reject pre-aborted requests and cancel oversized advertised response bodies.
- Replace Home's duplicated current-session row with up to three deterministic local daily mixes after Your collection. Use real genre tags and explicit artist fallback; show fewer groups when metadata/library size is insufficient.
- Add Appearance Larger text, mobile sixteen-pixel form text, reinforced touch/focus targets and compact narrow-screen controls.
- Bound metadata-worker jobs, clear settled timers, handle message errors and allow recovery after a silent worker timeout.
- Keep lyric-editor dismissal/save actions visible while its body scrolls, including larger text at 320×360. Prevent padding clicks and selection drags from dismissing native dialogs.
- Reject punctuation-only artist labels when generating Daily mixes.
- Repair native build checks: import Windows I/O types and use the Android SDK provided by the pinned Ubuntu runner. Improve native diagnostics, Windows dark edit-field contrast, rounded controls, long-label containment and wrapping playback actions.
- Native feature parity and physical-device certification are not claimed.

### Pre-release implementation — focused settings and mobile library (web)

- Remove catalogue lookup, verification consent UI and online cover completion; keep local checks, original audio, prior saved data and independent lyric search. Update the metadata privacy section with approval.
- Replace the long Settings sheet with six focused menus, contextual Back and keyboard focus return.
- Rework phone Library headers, wrapping category counts, Play/Shuffle/sort layout and song rows; hide the empty player and preserve bottom-dock clearance.
- Contain long/unbroken text with shrinkable grid/flex children, safe wrapping, two-line song/card labels and compact-credit ellipsis, without changing stored strings.
- Replace ornamental playlist defaults with flat list/note labels, restrained tones, member-color spines and contrast-aware glyph ink. Resolve member artwork through a memoized ID map; retain custom covers.

### Pre-release implementation — verified imports and automatic listening (web)

- Inspect and normalize local metadata during import, validate embedded front covers, retain year/genre and report missing fields. Parse tags in a reusable same-origin worker, preserving immediate original-byte storage and duplicate rules.
- Replace manual overlap duration and mode controls with one **Mix** switch that chooses a bounded per-pair window automatically. Retain native decoders, staged gains, safe cue fallback and original pitch/tempo/bytes.
- Continue exhausted queues with local contextual weighted variety, avoid recent/current recordings when possible, preserve repeat/pause priority and offer an Autoplay switch.
- Improve collaboration and decorated-title lyric matching, search full credits, invalidate prior misses and shorten negative-cache expiry while retaining edition/duration/album checks.
- Bound root playback rerenders, memoize seek geometry/Search/artwork, defer search filtering, cancel hidden/unfocused visual RAF, avoid heavy row layout animation for large collections and add rendering containment.
- Add restrained row entrance staggering, tonal hover feedback, paged metadata review and larger phone queue/context targets. Native projects remain unchanged.

### Pre-release implementation — illumination, queue control and mixing (web)

- Replace background wave silhouettes with three soft radial light fields, preserving spectral response and motion/pause/mute safeguards. The curved seek remains a progress control, not background decoration.
- Reorder the active queue using drag handles, arrows or Alt-arrow keys; retain native playback position/identity, save the order and reset its shuffle baseline.
- Add optional staged equal-power mixing and conservative silence cues with a classic crossfade fallback; never change original files, tempo or pitch. Share bounded envelope analysis with visual fallback and avoid subsampling aliasing in cue detection.
- Add keyboard-accessible contextual right-click menus for songs and general playback, clamped to viewport edges even during entrance and resize, with focus return and native editing/selection escape hatches.
- Hide the entire underlying interface during absence, including bottom navigation, compact player and normal-stage descendants.
- Blend artwork palette colors along the actual audio overlap with a restrained stage light animation; honor motion opt-out, avoid stale updates and persist the final palette without a second reveal.
- Retain existing storage and legal notices; native projects are unchanged.

### Pre-release implementation — matte spectral listening and queue refinement (web)

- Replace bright tonal lights with three matte, independently moving frequency-driven fields; do not claim voice/instrument stem isolation or alter audio output.
- Share the curved seek across compact/full playback, including narrow phone bars, and smooth supported path-state changes.
- Redesign Queue as a tonal desktop side sheet/mobile bottom sheet, retaining independent scrolling, focus return and non-restarting current-track selection.
- Improve cinematic cover/lyric composition and entrance; hide the underlying normal view visually, not just through inert/ARIA state.
- Verify album/reissue identity, search beyond conflicting exact albums before plain fallback, and reject conflicting performance editions. Preserve duration/artist/title/timeline checks, consent and cooldowns.
- Guard stale native play rejections and crossfade resolutions from affecting newer commands; remove restoration listeners from their actual originating deck.
- Cancel stale palette callbacks, transition top-layer listening surfaces, respect animation opt-out, and follow Wave appearance changes on Privacy & Rights without editing its legal text.
- Fit/recenter active lyrics in one layout pass with bounded search, reduce unnecessary lyric-row redraws, reset timing and recover controls after save failure.

### Pre-release implementation — bounded player stage and measured light (web)

- Replace fixed-width seek art with a full-width responsive Material-style wavy track, separated bounded thumb, continuous travel and native keyboard seeking.
- Isolate the record/reader/transport layout, remove obsolete competing player rules and bound cover/icon geometry across narrow, short, landscape and wide viewports.
- Tuck lyric timing into a deliberate adjustment popover; retain linked attribution, plain-text distinction, follow, paging, editing and retry without technical status captions.
- Read source amplitude through a disposable native-element capture/analyser where supported, with bounded offline fallback, visible tonal light and no rerouting of audible playback or changes to audio storage.
- Retry browser network failures with a safelisted GET to LRCLIB, normalize apostrophe/music-video identities and underscore-delimited filenames, and invalidate pre-fix cached misses without replacing saved lyrics.
- Preserve consent, local/embedded precedence, recording/duration checks and provider cooldowns. Live LRCLIB access remains unverified from this restricted workspace.

### Pre-release implementation — expressive playback and lyric recovery (web)

- Open Now Playing from all compact song information, including the artist; retain independent bar controls and expanded-only metadata navigation.
- Group enlarged-player cover/credits into a centered responsive record surface beside a rounded tonal lyric reader and separate transport. Make the large cover a playback action; animate record positioning and preserve short-screen control fit.
- Restore the base Wave palette when paused and reapply artwork tones on resume. Add bounded offline source-amplitude background motion, without modifying stored audio or the native playback graph.
- Remove the repeated Library filter; keep search exclusively on Search.
- Animate the original W through a line/volume-wave/W loading cycle. Add clipped press ripples, tonal state layers and shape changes; respond immediately to system reduced-motion changes.
- Fix stale/canceled lyric loading state, manual lookup interrupted by import, silent retry delays and inaccessible/missing Retry-After producing a non-finite cooldown. Persist provider cooldown behavior across reload and expose its countdown.
- Fall back from rejected exact lyric requests to structured search, search directly without known duration, improve featured-credit handling and accept additional common LRC formatting variants.
- Leave native source projects, audio storage and legal/consent documents unchanged. No native binaries or feature-parity claim.

### Pre-release implementation — discovery and album-first playback (web)

- Add a centered local Wave mark and repository documentation links to the README.
- Give Search its own composer, category chips, browse shortcuts and grouped songs/artists/albums/playlists. Remove search from Home and relocate desktop collection filters below the library header.
- Match accent-insensitive words in any order, including Unicode artist names; keep collection filtering scoped and preserve queue/reorder behavior.
- Put credits beneath artwork, enlarge covers on tall phones and reclaim the lyric column when collapsed. Add artwork spring entry, lyric disclosure fade, playback-state shape changes and search interactions, respecting reduced/disabled motion.
- Infer conservative filename artist/title identities on import without overriding valid tags or altering stored audio; retain genuine numeric titles and recording editions in lyric matching.
- Skip malformed lyric candidates, retain safe plain text and retry rejected album-specific exact results without album before search.
- Replace stacked-initial playlist covers with deterministic musical symbols, member-color gradients and a name signature; custom covers still win.
- These changes are web-only; native builds and feature parity remain pending.

### Pre-release implementation — visual listening redesign (web)

- Recompose Now Playing into artwork/metadata, a full lyric reader and a separate interactive bottom transport; keep the outer viewport fixed.
- Show complete active lyric text with soft-focus neighboring verses; improve short and narrow layouts.
- Restrict 30-second cinema to the visible/focused browser tab; center cover and metadata without a lyric panel when no lyrics exist.
- Tone the entire UI from artwork and reveal supported palette changes with a bottom-centered circle, respecting reduced motion. Refine Light surfaces and text roles.
- Generate deterministic playlist icons and mix local member-cover colors; preserve uploaded covers and original audio storage.
- Restyle and expand Privacy & Rights with owner-approved local session/appearance explanations, without new restrictions or consent/license changes.

### Pre-release implementation — listening stage and session restoration (web)

- Bound Now Playing to the viewport, including narrow phones and landscape; keep essential controls reachable without outer scrolling.
- Persist selected song, queue/order, repeat/shuffle and playback positions, restoring paused after library hydration.
- Add enhanced-LRC word timestamps, native-clock lyric sampling, cleaned exact queries, decoder-duration reconciliation and invalid-timeline fallback.
- Separate song play actions from artist/album navigation in rows, Home and the player.
- Add a control-free immersive artwork/title/lyric stage after 30 seconds of listening inactivity, with immediate activity wake and editor/hidden-tab protection.
- Remove the standalone legal-analysis document and dangling links as requested. Leave existing privacy/license/lookup-consent behavior in place; new legally motivated changes require owner approval.
- Leave audio storage, conversion and deduplication behavior unchanged. Native feature parity remains pending.

### Pre-release implementation — three-platform update

- Open Home initially; replace Settings modal with a responsive page and focus-restoring Back action.
- Replace generic waveform branding with an original curved W vector mark.
- Open a collapsible Lyrics section initially on Now Playing expansion/song change; keep artwork visible and remove redundant source/state blocks.
- Drive equal-power crossfade gains from incoming media time; retain cancellation, volume/mute and native-byte playback.
- Broaden verified LRCLIB exact/search matching with client identification, sequential spacing, filename inference and Retry-After cooldowns. Automatic lookup is off initially; manual lookup remains available.
- Add explicit byte-verified duplicate cleanup preserving favorites/local lyrics/playlist and album-order references; never remove recordings by name alone.
- Add repository-path GitHub Pages workflow and independent Kotlin/Compose Android and C#/WPF Windows source projects plus native CI. Native builds/runtime and feature parity remain unverified/incomplete; no release packages are claimed.
- Add platform build/status matrix, privacy notice and native dependency-notice inventories.

All notable changes to Wave are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases will follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- React, TypeScript, and Vite application foundation with strict type checking.
- Local audio import through a file picker and drag and drop, with duplicate detection, progress, and error reporting.
- Embedded metadata and artwork reading with filename fallbacks.
- IndexedDB persistence for imported music and favorites.
- Songs, albums, artists, and favorites views with search and sorting.
- HTML audio playback, seeking, volume, previous/next controls, shuffle, and repeat modes.
- Queue inspection and entry removal.
- Persistent ordered playlists with creation, renaming, confirmation-based deletion, song selection, add-from-options, and move-up/down ordering.
- Settings-gated song title/artist/album overrides, local cover replacement, and restoration of original imported information without rewriting files.
- Custom playlist descriptions/artwork, JPEG/PNG/WebP validation, and compact JPEG processing.
- Shared spatial/effects motion tokens, spring selection/layout/dialog transitions, animated playback shape/artwork/indicators, and a persistent Animations switch respecting system reduced motion.
- Version-1 to version-2 database migration and atomic pruning of deleted tracks from playlists.
- Regression coverage for playlist persistence/order, original restoration, simultaneous favorite/metadata writes, editor gating, cover errors, motion preferences, and playback continuity.
- Optional Media Session controls for supporting browsers.
- Responsive layouts, dark/light/system themes, keyboard controls, and reduced-motion support.
- Unit, component, and browser integration tests, plus a continuous integration workflow.

- Local/embedded LRC and plain-text lyrics with active decoder-clock synchronization, seekable lines, timing offsets, follow/scroll control, import/paste/remove editing and a friendly missing-lyrics state.
- Manual artist profile photos shared by gallery, profile and Home, independent of album artwork.
- Append unique songs to active/empty queues via song options or a multi-song queue picker without replacing playback.
- Configurable persisted 0–12-second crossfade using two native decoders and complementary gains, with pause/seek/skip/removal cancellation and normal-transition fallback.
- Drag/button/Alt-arrow song ordering in playlists and albums; saved complete permutations and embedded disc/track-number defaults.
- Non-destructive database v3 migration adding artist profiles and album orders to v1/v2 libraries.

### Changed

- Remove crossfade transition banners and progress meters; retain only audio fading, cover opacity and source-information changes.
- Fill synchronized lyric text in reading order using line timing instead of separate elapsed bars; support wrapping, seek/pause and final native duration without claiming exact word timestamps.
- Redesign Home with compact counts/session access, album shelves and a responsive recent-song/playlist/artist dashboard.
- Add a labeled desktop sidebar with real collection shortcuts/counts, while retaining tablet rail and mobile bottom navigation.
- Reduce collapsed playback to a 64 px bar with small artwork; keep the full-screen player an explicit user action and adjust fixed-control scroll clearance.

- Download verified LRCLIB lyrics automatically using metadata only, with persistent opt-out, cached results/failures, cancellation, source attribution and manual/embedded precedence.
- Animate focused lyric lines and follow scrolling, distinguish loading/instrumental/connection errors, and add quick ±100 ms offset controls.
- Smooth crossfade endpoints with complementary smoothstep gains, tighter gain updates and real opacity-only artwork fades without transition banners/meters.
- Add expressive navigation/card/row/mini-player movement while retaining both reduced-motion preferences.
- Deduplicate full audio bytes with SHA-256 across renamed/redated imports, preserving legacy IDs and playlist references.
- Save files immediately without playback, request persistent storage and show library/origin storage estimates with eviction/backup caveats.
- Process new embedded/custom covers to at most 512-square JPEGs at quality 0.8 without upscaling, and store raw lyrics once with parsed-line rehydration.

- Replace the desktop side player with compact playback and an opaque full-viewport Now playing view on every screen size, including two-column desktop/stacked mobile layouts.
- Expand Home with real collection shortcuts/counts, recent imports, playlists, artists, and current-session access.
- Introduce dedicated artist profiles with local initials/album covers, ownership-correct albums, counts, known duration, and direct Play/Shuffle.
- Add staged view exits/entries, capped artist-card stagger/layout, album lift/press feedback, playback-symbol transitions, and non-overshooting seek effects.
- Store optional source audio metadata and report codec/sample rate/bit depth without re-encoding or adding effects; default native level is 100%.
- Persist volume and pre-mute level, including muted-session reloads; expose buffering and guarded Media Session position updates.

- Replace the promotional layout with the approved PixelPlayer / Material 3 visual direction: tonal library header, category pills, rounded song rows, desktop now-playing panel, and mobile bottom navigation.
- Add Home and Search destinations, a full-screen mobile player, locally artwork-derived player colors, and self-hosted typography.
- Remove decorative record illustrations, gradients, and promotional interface copy.

- Set the first implementation target to the web, replacing the initial Android/Kotlin proposal.
- Translate all project documentation into English and update technical instructions to match the implementation.
- Separate working features from future plans in the README and roadmap.
- Remove the placeholder `1.0.0` release entry: no stable version has been released.

### Fixed

- Keep same-named albums from different artists separate and restore the original selected queue order after shuffle.
- Position notifications above compact playback rather than intercepting its controls.
- Keep current-session cover dimensions square and full-player surfaces opaque at all widths.
- Ignore non-finite seek/volume inputs and invalid saved levels.
- Preserve the active audio Blob when applying favorite/metadata changes so playback does not restart.
- Restore focus to the compact-player opener after its animated full-player dialog closes.
- Make animated exiting rows and dialogs inert and hidden from accessibility queries.
- Reserve scrollable space below mobile/tablet content so fixed playback/navigation cannot trap the last playlist card.
- Keep the selected category in view when the pill strip scrolls or the viewport changes.
- Abort and settle failed multi-step transactions so validation/storage failures roll back track deletion and playlist pruning together.

## Versioning

- **Major:** incompatible changes.
- **Minor:** new backwards-compatible features.
- **Patch:** backwards-compatible fixes.

During the initial `0.x` development period, APIs and storage formats may change. Storage changes still require an explicit migration plan; users' libraries must not be silently discarded.

Use Added, Changed, Deprecated, Removed, Fixed, and Security sections as needed. Record dependency changes when they affect behavior or support requirements. Do not record planned work as released functionality.

See the [commit history](https://github.com/jaime-gaming/Wave/commits/main) for the complete history.
