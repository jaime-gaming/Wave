# Changelog

## 0.1.1 — 28 October 2026

- **The transport no longer hides itself.** The previous build faded the transport out after two still seconds in Now Playing and brought it back on the next mouse move; on a phone, where there is no pointer drift to wake it, that read as the player bar disappearing. The bar now stays where it is while a song plays. The long-idle cinema view (30 s of a playing song) still opens by itself and still leaves on the first movement or key press.
- **Mix stops sounding like a crossfade.** The overlap was a symmetric equal-power slide — both songs at half level for the whole overlap — and the low-end swap and filter only ran when a beat grid happened to be available, so most handovers were literally a crossfade. Now:
  - the incoming song arrives **early and holds** (it is at level by a quarter of the overlap) while the outgoing song leaves in the second half, which is what makes the join audible as a decision;
  - the **low end changes hands once**, on the incoming song's first bars, and the outgoing song **loses its top** through a playback-only low-pass (20 kHz → 1.6 kHz) as it leaves;
  - the overlap starts on a **bar line** and is now **long enough to mix in**: 16–24 s instead of about 12 (three phrases at 120 BPM, up from two), so there is a bar to arrive, a stretch where both songs play and a bar to leave;
  - the new song is **cued on its first full bar, not on its first second**. A record almost always opens with a beatless intro or a single held chord; fading that under the outgoing song is the reason a join had no arrival — there was nothing arriving. Mix now starts the new song where the drums are already playing, never more than twenty seconds in, and never at all past a voice, so a song that opens with a sung line still starts on its first beat;
  - the two records are **level-matched for the length of the overlap**. Two songs mastered years apart rarely meet at the same level, and a new song six decibels quieter sounds like the old one fading out however well the beats line up. Only the louder deck is turned down, never the quieter one up, by at most six decibels, and only while the two are playing together;
  - a handover that has no plan (a song the analysis could not read) is no longer an eight-second fade: it is timed like a mix, up to sixteen seconds;
  - every Mix handover gets these moves, planned or not, so a song with a poor analysis no longer sounds like a bare fade while the next one sounds mixed;
  - the audio graph is kept across a refused start instead of being discarded, which previously left a whole session without the bass swap or the filter.
    Files, sample rate, bit depth and bitrate are still untouched; the filter and the tempo match are reverted when the overlap ends.
- **Privacy & rights is up to date.** The page now covers clip discovery and Piped/Invidious, songs added from YouTube and the oEmbed fallback chain, that video traffic belongs to YouTube, the optional NetEase/Kugou word-level sources, the offline interface cache, and that Mix only changes playback. `PRIVACY.md` gains the same two sections and both were re-dated.
- **Lyrics follow the song in the cinema view too.** The 30-second listening screen used to scroll once when it opened and then leave the first verse on screen; it now keeps the sung line centred for the whole song, at a size you can read from across the room.
- **The blend is drawn the way it is heard.** The sleeve used to swap by fading one cover over another, and the two covers were stacked as plain blocks rather than layered. Now the new cover **opens from its centre** while it is arriving and the old one **settles back and steps behind it**, driven by one progress value so the picture and the sound cannot drift apart. Under reduced motion the transform and the mask are dropped and only the plain cross-dissolve remains.
- **The listening screen has a transport of its own.** The 30-second cinema view was a picture of a song: artwork, credits, lyrics, no way to pause, move or skip without leaving it. It now carries a quiet bar at the bottom — previous, play/pause, next and the song's position — that sits at reduced weight until the pointer or the keyboard arrives and is part of the screen, never something that appears and disappears. The bar's own view stays hidden behind it, so there is still exactly one transport at any moment.
- **One transport, not two.** The video clip had a bar of its own — status line, offset slider, close and remove — sitting on top of the song's controls while the song was already driving the clip. The clip is now a muted backdrop and nothing else: no bar, no slider, no buttons, `aria-hidden`, pointer events off, and the correction loop keeps it in step from the song's clock. The YouTube link and "Remove video clip" moved into the song's options, where they cannot be mistaken for transport controls.
- **Lyrics have no frame.** The reader was a card around the words — a tinted panel with a 30 px radius, plus a gradient pill and a bar behind the sung line. All of it is gone. The sung line now _grows_ (scale, accent colour, heavier weight) and the other lines stay quiet; long lines wrap instead of being shrunk to fit, so the smallest lyric on screen is still a lyric you can read. Sizes were raised again in every view: 26–42 px in the stage, 30–64 px in the cinema view, 22–32 px on phones, and the lyric column takes a larger share of Now Playing.
- **Mix cannot skip a song any more.** The engine decided to hand over as soon as its analysis said the audible part was ending, so a track whose analysis put the end early could be cut in the middle — a mix that skipped most of the song. A handover is now only allowed inside the final seconds of the _file_, whatever the analysis reports, and the fallback overlap is measured the same way. Everything else about the mix (bar-aligned start, the incoming song entering at its own beginning, tempo match, bass swap) is unchanged.
- **Empty and error views are one shape.** Library, queue, lyric reader and clip search now use the same block: symbol, what happened, what to do next, actions. Empty views that appear because of an action announce themselves as a live status, and the clip search shows a single quiet note under the heading instead of a dark sheet over the whole player.
- **Lists are cheaper and calmer.** Library rows are one height, one corner and one hover, with tighter type and a 48 px cover; rows arrive in pages of 80 as the list is scrolled instead of all existing at once, rows off screen skip layout and paint, and only the first twelve rows get an entrance animation. The lyric fill samples at 12 Hz instead of 20.
- **Android is its own app now.** The phone build was one 100-line file of chained one-liners: a single screen with a text row for every song, a "Next" label instead of a control, and a now-playing view that was the same list with a slider on top. It is now laid out the way a phone app should be:
  - one package, one job per file — `Theme` (palette, type scale, shape), `Components` (mark, titles, rows, absence views), `Cover`, `PlayerBar`, `NowPlaying`, `Screens`, `EditSongDialog`, `WaveState`, `WaveApp`;
  - a real shell: three destinations in a bottom bar, a **mini player that sits above it and never hides**, a thin position line on the bar, and a full listening screen with large artwork, a transport, and lyrics that keep the sung line in view;
  - sleeves are read **from the file** — decoded off the main thread, cached, never copied — and a file without artwork gets a tile tinted from its own palette instead of a grey box;
  - light and dark themes follow the system instead of a single forced dark palette, rotation keeps playing instead of restarting the song, and the library, the player and the lyric lookups live in one state object rather than in every screen.
- **Android and Windows blend like the web.** Both platforms were still running a six-second equal-power fade — the thing this release exists to remove — so each now uses the staged handover and a sixteen-second window. Android also publishes the position ten times a second instead of on every 33 ms pulse (ramps still do), parses a lyric once per text instead of on every position change, and scrolls the sung line into view; Windows restyles only the two lines that change and marks the sung line with weight and colour instead of a blur. Both show 0.1.1 in their interfaces and user agents, and `npm run release:check` fails if any of those labels drifts from `package.json`.

- **Clip search reaches more hosts.** A single Piped or Invidious instance is regularly down, rate limited or behind a challenge, and Wave only knew two of them, so the backdrop usually reported that clip search was unreachable. There are now eight public front-ends, asked in order within a seven-second budget with 2.5 s per host; a host that fails is remembered and skipped for ten minutes, "Search again" retries every host, and a song that had no match is re-checked after a day instead of never.
- **The interface no longer re-renders with the clock.** Playback position lived in React state at the top of the tree, so every tick — twenty a second — re-rendered the whole app, including every row of the library. Position now lives in a small store that only the player bar subscribes to, the progress is repainted ten times a second instead of twenty, the blend reports a change every two percent, and OS media-session position is reported once a second instead of on every tick. Settings, a daily mix and the metadata review are downloaded only when opened, long libraries skip the layout and paint of rows that are off screen, the ambient light is smaller on phones and absent under reduced motion, and the startup mark is not replayed when the app is reopened in the same tab.
- **Mix stops skipping the song.** The incoming song used to start after its intro — up to 45 % into the track — so a handover often began near the middle of a song you had not heard yet. It started at its own beginning, nudged to the next downbeat within six seconds, and a vocal at the join shortened the overlap instead of moving the entry. (A later pass in this release moved the entry to the first full bar of the body, which is what a record being cued actually sounds like — see the top of this section.) The overlap is also shorter (about four bars, roughly 6–11 s, instead of sixteen), plans are memoised instead of being recomputed every tick, and a song always plays at least half of its own length before the next one begins, whatever the analysis says.
- **Lyrics stopped shrinking.** The three-line frame gives every line a third of the reader, and long lines were being shrunk to fit it, as far as 12 px. Neighbouring lines now sit at three quarters of the active size and a long line is clamped at no less than 18 px instead of being shrunk until it fits.

- **A song is never silent.** Wave used to hand the audio element to a Web Audio graph as soon as Mix was on; if the browser kept the audio context suspended (it does until a gesture is trusted, and it can suspend it again later), the element's output went into a graph that was not running and nothing reached the speakers. A media element is now only attached once the context reports `running`, a graph that cannot run is dropped and the song plays natively, and resume is retried from the play gesture, from the first pointer or key press, and once a second while playing. The level, the samples and the file are untouched.
- **YouTube songs start and stay audible.** Play is commanded again every 500 ms with the volume alongside it, until the embed confirms it is playing, instead of giving up after one message; a leftover fade-out gain from a previous handover can no longer keep the next song at zero.
- **The lyric reader scrolls again.** Now Playing, the cinema view and the phone layout show the whole lyric as a page of text, fading at the top and bottom edges, with the sung line centred and highlighted. The three-row frame that showed one line at a time is gone: it hid the verses around the current line and made long songs feel like a slideshow.
- **Layers and spacing.** One z-index scale for the whole interface (ambient light behind content, then content, rail, player bar, menus, toasts, drop overlay, skip link) and the ambient backdrop no longer paints over text. The page title, header and workspace margins were reduced so the first songs are in view, with a shared 4/8/12/16/20/28 px spacing scale.

- **YouTube songs load reliably.** YouTube's own oEmbed endpoint sends no CORS headers to a browser, so reading a title there always failed. Title, channel and length now come from the first of four sources that answers (YouTube oEmbed, noembed, Piped, Invidious), with a 5 s timeout per source and a 9 s budget for the chain; the id is validated before any request. When the embed is slow, play is commanded again until the video confirms it instead of waiting for a message that may never arrive, and the embed URL now includes autoplay when the song was already playing at mount. Length from the provider is stored with the song, so Mix and the seek bar know it before playback starts.
- **The interface stops explaining itself.** Mix is one switch: Wave picks the overlap, the tempo match and the handover. The blend now chooses its own bar count from the tempo so it lasts about 18 seconds, instead of an 8/16-bar setting. Removed: the last-handover panel, the BPM readout, the daily-mix "about 124 BPM" line and its ordering sentence, the note about how word timings are interpolated, the provider link under the lyrics, the word-by-word explainer, the paste-a-link form for clips and the About paragraphs that were not options.
- **Notes that help stay.** Which formats can be imported, "Tap a line to seek", the queue's reorder hint, the timing-offset explanation, "only the link is sent" in Add music, that browser storage can be evicted, and that the word-level lyric sources are unofficial.
- **Settings contain settings.** Section cards are one word each; empty-state prose and the storage/privacy essay are gone. The only remaining note is the one the user asked for: the word-level lyric sources are unofficial.
- **Lyrics are larger.** Every lyric size moved up a step: the panel (24–36 px), Now Playing (28–44 px), cinematic (30–62 px) and phones (23–32 px), with the small-screen and landscape rules raised to match.
- **A video that refuses to be embedded now says so**, with a link to open it on YouTube, instead of staying silent; a library row whose audio is no longer stored says so too. Clips are only ever found automatically now: the paste-a-link form is gone, and a miss offers another search.
- **Mobile web and installability.** Web app manifest, maskable and Apple touch icons generated from the same wave mark (`node scripts/make-icons.mjs`), standalone display, safe-area padding, 44 px targets for coarse pointers, no hover-only affordances, momentum scrolling in lyric and queue panes, and an offline shell service worker that caches the interface only — never audio.
- **Design pass.** One elevation scale and one hairline border for raised surfaces, a gradient on the library header, calmer scrollbars, a consistent hover pill on text buttons, and hover lifts that are disabled under reduced motion.
- **Android shell.** Edge-to-edge layout with drawing-safe insets, and Mix as a single switch in place of the crossfade-length slider.

## Unreleased — YouTube playback, offline states, listening-order mixes

- **A YouTube song sounds like YouTube.** The embed is the source and the clock, muted only when it is a backdrop. When the same song is imported as a file, the file wins: it plays offline, it is analysed for Mix and it is the copy the user owns. The YouTube row stays in the library so the song is not lost if the file disappears.
- **Mix works across YouTube songs too.** A song with no local bytes cannot be beat matched, so Wave crossfades instead: the embed and the local deck ramp in opposite directions with the same equal-power curve, inside a window sized from the two durations. The outgoing deck fades through `MixAudio.fadeOut/fadeIn`; the embed ramps its own volume, so both ends of the handover move together. The player stays mounted while Now Playing is collapsed, so a song never restarts because a view opened.
- **Offline is visible, not surprising.** Controls that need the network read **Offline** and grey out instead of failing on click: lyric search, clip discovery and "from YouTube". Icon-only controls keep their name and gain an accessible "offline" suffix. Everything cached (saved lyrics, remembered clips, local files) keeps working.
- **Daily mixes are built for listening.** Groups still come from tags, but the order uses the tempo and energy Wave already measures for Mix: slowest first, energy as the tie-breaker, and never the same artist twice in a row. A card now says what it is ("about 124 BPM · 1975–1985 · 18 songs") and there can be four mixes instead of three.
- **Cinematic motion.** New tokens separate springs (things you open or move) from eased fades (things that only change appearance); artwork settles with a short blur, cards rise in sequence and headers fade in behind them. Reduced motion collapses every token to zero.
- **Word-level lyrics from more sources (opt-in).** NetEase YRC and Kugou KRC are parsed into real per-word timings, with a decoder for Kugou's obfuscated payload, provider matching that refuses live/remix/karaoke rows, and a duration sanity check. Off by default and documented in PRIVACY; LRCLIB remains the default and the fallback when either side falls back to line timing.
- **Copy pass.** Lyric empty states were still partly Spanish and now read as English throughout, with shorter sentences and fewer template phrases in the interface, the docs and the code comments.

## Unreleased before 0.1.1 — Mix as a real mix, YouTube songs, discovered clips

- **Mix replaces crossfade.** Three stages now run in order. _(1) Analysis_, in a worker on a downmixed 11 kHz copy: tempo (autocorrelation with a 120 BPM prior and parabolic refinement), beat phase, 8/16-bar phrase structure, silence trimming of intro and outro, energy segments for drops and breakdowns, and a spectral vocal estimate. _(2) Planner_: the overlap is a whole number of bars (8 or 16, configurable), starts on A's beat grid and enters B on a bar after its intro, relocating to a clear bar when B starts with a vocal; the tempo gap is closed with at most ±8 % time-stretching (`playbackRate` with pitch preserved, playback-only and reset afterwards). _(3) Engine_: equal-power `cos/sin` gains, a −22 dB lowshelf bass swap at 180 Hz around the middle of the overlap, and a shortened overlap when both sides have vocals. Files, sample rate, bit depth and bitrate are never touched.
- **Add music now asks where it comes from.** _From this device_ imports files; _From YouTube_ stores a video reference, reads its title through YouTube's oEmbed endpoint and plays the song through the official embed, with its video, Wave's transport and no download, proxy or extraction. YouTube songs are labelled in the library and excluded from byte comparisons, Mix analysis and sync.
- **Video clips are found automatically.** Wave searches public YouTube front-ends, ranks candidates by title similarity, the artist's own channel and length agreement, rejects karaoke/cover/reaction/instrumental uploads, and remembers the choice locally. Pasting a link remains as a fallback when no search provider answers.
- **YouTube songs keep playing while Now Playing is collapsed**, in a one-pixel host, and resume at the same position when the view opens again.
- **Better video sync.** Small drift is now closed by easing the muted clip's playback rate (0.9×/1.1×) instead of seeking; only drift of 1.1 s or more, or a lost clip, triggers a seek, still bounded by a cooldown.
- **FLAC import.** MP3, WAV, M4A, OGG and FLAC are accepted; FLAC is stored and played untouched.
- **Word-by-word lyrics are built in.** The Settings toggle is gone; the line-level view remains as the fallback when a lyric has no timings.
- **Settings and UI.** Playback now shows the detected tempo and the handover Wave has planned (bars, stretch, bass swap and the planner's reasons); the obsolete Mix style and crossfade-length controls are removed, and the header action is a single **Add music** button that opens the source chooser.

## Unreleased — Mix, karaoke lyrics, video clip and import formats

- Add an Apple Music style Mix: an equal-power crossfade with a 1–12 s length the user chooses, started inside audible audio and never longer than half of either song. Wave's staged blend remains available as a second style. Only `volume` is scheduled: files, sample rate, bit depth and bitrate are untouched.
- Add word-by-word lyric highlighting. Enhanced LRC/SYLT word timestamps are used exactly; ordinary synced lyrics get a deterministic estimate from syllables and punctuation, labelled `derived` in the DOM and explained in Settings.
- Add a video clip backdrop for Now Playing: a muted `youtube-nocookie` embed with its own chrome hidden, driven by Wave's transport, with drift detection, a ±10 s sync offset, local per-song clip storage and an explicit YouTube link. YouTube's watermark, ads and overlay cannot be removed by Wave and the clip is never used for audio.
- Restrict importing to **MP3, WAV, M4A and OGG** as requested; previously imported FLAC/AIFF/Opus/WebM/AAC songs keep playing, and the import summary now names the accepted formats.
- New UI: Mix style and length in Settings → Playback, word-by-word toggle in Settings → Lyrics, video clip switch in Settings → Playback and a Film button in Now Playing.

## Unreleased — Wave 1.1 foundation

- Establish audio integrity as a non-negotiable invariant: copies are compared with whole-file SHA-256 before storage, sizes must match exactly, lossless sources keep their sample rate and bit depth, and no transfer path can re-encode or resample. Verified with a 24-bit WAV round trip.
- Fix a 13.8 s main-thread stall when matching a 300-song playlist against 5 000 local songs; inverted-index matching now takes ~0.7 s with results proven identical to the exhaustive comparison.
- Harden the sync channel: monotonic sequence numbers detect replayed frames, the receive counter advances only after authentication, sealed envelopes are size-bounded before decryption, and corrupt transfers are always released for retry.
- Page library indexes under the 96 KiB frame limit, validate sender metadata, and cap imports at 5 000 entries.

- Add the versioned sync protocol: total frame validation, 96 KiB frame ceiling, 48 KiB audio chunks, SHA-256 verification and rejection of duplicate, missing or oversized chunks before anything is stored.
- Add ECDH P-256 + HKDF pairing with a six-digit confirmation code, 120 s invite expiry, AES-GCM sealed frames and a transport-agnostic state machine that never applies data from a mismatched or tampered peer.
- Add temporary device loans bounded by space rather than time, with least-recently-used eviction of unpinned loans, per-device summaries, manual deletion and revocation.
- Persist loans and their verified audio atomically in a separate `wave-sync` database; the `wave-library` schema is unchanged and audio is stored as checked bytes.
- Add YouTube link parsing (watch, youtu.be, shorts, embed, live, music, playlists, start times), privacy-enhanced embed URLs and validated player events. Audio is never extracted.
- Add Spotify/YouTube playlist link parsing and deterministic matching against the local collection, reporting matched, ambiguous and missing songs without writing anything until confirmation.
- Document scope, provider limits, threat model and remaining phases in [SPEC_1.1](docs/SPEC_1.1.md). No interface, provider client or Android port is wired yet.

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
