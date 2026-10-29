# Validation record

Release 0.1.1 · 28 October 2026. Historical run dates are retained below.

## Web

### The wordmark, the corner and the closing player (latest run)

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .` and `npm run build`: passed.
- `npm test`: **538 tests across 86 files**, all passing. The new `WaveWordmark` suite proves the
  full wordmark is six stroked paths and no text, that the lone W is the first of those paths and
  not a second drawing, and that both are hidden from assistive technology because the name is
  announced once, in text, by the link that holds them.
- `Native builds` → run 40966623756: both jobs green. The published `windows-*.png` captures show
  the redrawn wordmark in the desktop sidebar and the two corner buttons level with the page
  title, so the Windows path data and the layout are confirmed by a real render, not only by a
  diff. The phone is unaffected: it has no sidebar.
- **Not verified here:** a browser in this sandbox. There is no Chromium the linker will load
  (`libnspr4` is missing and cannot be installed), so the wordmark was reviewed as a rendered SVG
  at 62 px, 84 px and rail size, and the header corner was reasoned about from the existing
  breakpoints rather than photographed. `npm run capture:docs` was not run: the web screenshots in
  `docs/media` still show the previous header.
- `Checks` → run 40967266137: release checks, package tests, format, lint, `npm test`,
  `build:pages` and the committed-Pages verification all pass. The Playwright job is **red with
  ten failing tests**, the same number and the same assertion shapes (three `toBeVisible`, two
  `toHaveAttribute`, `toHaveValue`, `toBeCloseTo`, a timeout, a `toBe` and a `toHaveCount`) as the
  revision before this round and the one before that. The job's result file cannot be downloaded
  from this environment, so the failing tests are identified by count and shape rather than by
  name; nothing here claims the suite is green.

### The look this round: wordmark, Remix charts, native typeface (previous run)

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .` and `npm run build`: passed.
- `npm test`: **535 tests across 85 files**, all passing. The new ones cover the recap's own
  charts: `weeklyRecap` returns seven days that add up to the week's seconds and plays, twenty-four
  hours that add up to its plays, and genre slices that ignore untagged files. The `RemixPage`
  suite was updated where the page changed and still proves the week figure, the delta, the Remix
  list, Play Remix and the empty state.
- Not run here, so not claimed: `npm run test:e2e` (this environment has no browser binaries to
  download) and `npm run capture:docs`. The Remix page has not been photographed at this
  revision; `docs/media/remix-*.png` still show the previous layout, and the two selector fixes in
  `listening-refinement.spec.ts` and `illumination-mix.spec.ts` have not been exercised by a run.
  CI will do both; until then treat the visual claims above as reviewed code, not as a verified
  screenshot.
- The full Playwright suite was already red before this round for measurement reasons unrelated to
  the pages touched here; that has not changed and is not claimed as green.

### Native typeface and charts (CI, run 40959131226)

- `Native builds` → **green**: both jobs. Android compiles, unit tests pass (including a new
  `weekRecap` check that the seven bars, the twenty-four hours and the genre slices add up to the
  week), lint passes, the debug APK assembles, and the Robolectric capture published fresh
  `docs/media/android-*.png`.
- Windows compiles, the contract runner passes (three new checks), and the smoke run photographed
  Home, a daily mix, a playlist, Remix, Settings and the narrow light Library, publishing
  `docs/media/windows-*.png`.
- Two faults were found by the first run and fixed in the commits after it: the bar springs
  overshoot on purpose, so a share above one asked Compose for a negative padding and threw; and WPF
  had frozen the palette brushes by the time the window applied its theme, so recolouring a frozen
  brush threw instead of repainting. Both are now avoided by construction rather than by tuning a
  constant.
- A third was found by looking at the published capture: shrinking the bar column from the bottom
  left every quiet day hanging at the ceiling of the chart. The bar is now simply as tall as its
  share, in a bottom-aligned row. `Native builds` → run 40964089358 is green on both jobs after the
  fix, and the phone's recap carries the same three facts the web page opens with.
- What the screenshots show: the same typeface as the web, the same colours, and the same week
  chart. What they also show, honestly: the phone keeps its bottom navigation and the desktop keeps
  its single scrolling collection panel, so the three builds share the design language and the
  Remix page but not a pixel-identical shell. That is the remaining gap, not a claim of parity.
- The font files are four static instances cut with `fontTools` from
  `@fontsource-variable/nunito-sans` (weights 400/500/600/700), renamed to one family so WPF
  resolves them as one face with four weights. The licence travels with them.

### Browser suite at this revision (CI, run 40959131235)

- The `web` job is **red**, with the same ten failing tests as the revision before this round and no
  new ones: the check-run annotations list eleven failure annotations, ten of them test failures,
  the same shape and the same count as `56f5710`. Nothing in the suite was disabled to get there.
- The two spec edits in this round — the listening screen's transport is `.immersive-bar`, and the
  context-menu check right-clicks `.workspace h1` instead of the removed `.app-name` — ran in that
  job. Neither added a failure; both live in specs that were already failing for measurement
  reasons.
- `remix.spec.ts` did not fail in that run, so the rewritten Remix page still passes its four
  browser tests.

### Remix and the weekly recap (previous run)

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .` and `npm run build`: passed.
- `npm test`: **531 tests across 85 files**. The new `RemixPage` suite proves the week card, the
  delta only when there is a previous week, the Remix list order and count, Play Remix handing
  the list to the player, the empty state, and that clearing asks before it forgets.
  `weeklyRecap`/`weekRange` add seven unit tests, including a padded list that never repeats a
  song and a play that falls outside the window.
- `npm run test:e2e`: `tests/remix.spec.ts` is four Chromium tests, all passing: the page in a
  real browser after a genuine five-second listen, Play Remix starting the list, the empty page,
  and clearing with confirmation. They play audio for real; a seek does not count as listening,
  which is why the spec imports eight-second files.
- `npm run capture:docs`: replaced the Listening capture with two new PNGs,
  `docs/media/remix-desktop.png` and `docs/media/remix-mobile.png`, taken against a seeded week
  of plays (1 h 9 min, 27 plays, 9 songs, 3 artists). Both were inspected: the sleeve pair reads
  as one card, nothing overlaps at 1440×900 or 390×844, and the empty delta is absent rather
  than shown as "+0 min".
- The full Playwright suite ran on CI at this revision and is **red**, as it was before this
  change: 105 tests, and the failing ones are in `automatic-library`, `design`, `expressive`,
  `illumination-mix`, `listening-refinement`, `mobile-library`, `player-stage` and `wave`. None
  of the new `tests/remix.spec.ts` tests failed, and none of those specs touch the Remix page.
  The suite asserts exact geometry and pixel-adjacent values under a headless renderer, so the
  failures are concentrated in measurement assertions (`toBeCloseTo`, viewport fit, palette
  values) rather than in behaviour. This record does not claim the suite passes; the CI
  annotations name each failure, which is what a reader needs in order to judge it.

### Native screenshots (latest run)

- `Native builds` → `windows`: the contract runner passes (including the four new week-recap
  checks), the app compiles, and the isolated smoke run photographs Home, a daily mix, a saved
  playlist, Remix, Settings and a narrow light-theme Library. Two faults it found were fixed: a
  theme switch left the window on the old colour until the brushes were recoloured in place, and
  every capture had a transparent background because `RenderTargetBitmap` only renders content.
- `Native builds` → `android`: unit tests and lint pass and the debug APK assembles. The new
  `ScreenshotTest` renders the real `WaveApp` on the Robolectric graphics stack and produced the
  three phone PNGs. Getting it green exposed a real defect the build had been hiding: the
  manifest declared no application class, no playback service, no receiver, no widget, no tile
  and no shortcuts, so the shipped app would have crashed on launch and never shown a lock
  screen control. That is fixed and is checked by the same run.
- The PNGs are published from both jobs into `docs/media/` by name. Known limit: these are
  layout captures from the app's own rendering, not photographs of a physical device; the
  device gates in this file (audio focus, lock screen, car, DPI) still stand.

### Earlier runs

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm test`: **500 tests passed across 81 files** (latest run; 200 tests across 42 files at the 0.1.0 release).
- `npm run test:e2e`: **89 Chromium browser tests passed** in the final complete run (7.6 minutes).
- `npm run build`: passed. Vite reports its advisory 500 KB chunk-size warning (main chunk approximately 547 KB, gzip 172 KB); this is not a build failure.
- `npm run build -- --base=/Wave/`: passed; a production static-server smoke test verified Home, Settings, fonts/assets, `/Wave/wave.svg`, the privacy page and its return link under the repository path without HTTP/page errors.
- `npm audit --omit=dev`: zero reported vulnerabilities at review time; this is not a security certification.
- `git diff --check`: passed.

Browser coverage includes paused restoration of saved queue/native position, artist/album navigation without audio restart, enhanced word stamps, no-scroll lyric/control fit, 30-second cinema/wake and real native decoder overlap, media-clock lyric fill without bars, Settings page/Back focus, fresh Home, default-off lyric lookup, persistence, playlists, artwork, album/playlist order, source-byte preservation and explicit legacy duplicate merging with reference/favorite/local-lyric preservation. Visual QA checked Home/sidebar/compact playback at 320, 390, 768, 1024 and 1440 px, both themes, and lyric fill. Additional actual Chromium screenshots/geometry checks covered enhanced, plain, missing and long lyrics/metadata plus read-only cinema at 1440×900, 1024×768, 768×700, 390×844, 320×568 and 844×390. Controls stayed within the viewport, with no outer scroll; durable tests also verify actual hit targets and lyric text visibility. The compact bar remained 64 px without document overflow.

### Mix, clip discovery and YouTube songs (web, latest run)

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .` and `npm run build`: passed.
- Mix: `dsp` (14), `mixPlanner` (12), `mixGraph` (5) and `MixAudio` (12) tests cover tempo/phase estimation, silence trimming, energy segments, vocal regions, bar-aligned planning, the ±8 % stretch window, vocal-aware cue relocation, bass-swap curves, graph wiring and plan execution. These are synthetic-signal and engine tests: **no real recording was judged by ear**, and the analysis cost was measured on generated PCM, not on a large local library.
- Clip discovery: `clipSearch` domain (6) and service (4) tests cover ranking, rejection of karaoke/cover/reaction uploads, provider payload parsing, provider fallback, caching and offline failure. Providers are community services: availability, rate limits and terms were **not** verified against the live hosts from this workspace.
- YouTube songs: `youtubeTrack` (4), `YouTubeStage` (4), `AddMusicDialog` (3) and `useLibrary` (8) tests cover link validation, title splitting, records without local bytes, embed options, transport commands, message-source validation and duplicate refusal. **No live YouTube playback or oEmbed request was made**; browser autoplay policy on a real device is unverified.
- Video sync: 9 tests cover pause/play, the new rate nudging, hard-drift seeking, cooldown and offset clamping. Real embed drift on slow connections remains unmeasured.
- Import: FLAC now passes the whitelist (`import`/`useLibrary` tests). Browser FLAC decoding was not exercised here.
- Word-by-word lyrics: the panel test proves the built-in word view and the line-level fallback; the removed toggle is not a hidden setting.
- The Playwright suite and screenshot comparison were **not** run for this change: no browser engine is installed in this workspace. The dev server was started and serves the app (HTTP 200 for the entry point and the new components), but audible Mix quality, YouTube playback and the new layouts still need a real browser pass.

### YouTube playback, offline states, mixes and extra lyric sources (latest run)

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`: passed. `npm test`: 405 tests across 71 files.
- YouTube songs: `youtubeTrack` (8) covers record building, link validation and the local-twin rule; `resolvePlayable` prefers a file with the same title and artist and never treats a local song as a stream. `YouTubeStage` (4) covers embed options, transport commands, resumes and message-source validation.
- YouTube handovers: `edgeMix` (5) covers the window sizing, equal-power gains and remaining-time maths. **The fade was not heard**: the embed never loads in jsdom, so the audible result of a crossfade between a video and a local file still needs a browser pass.
- Offline states: `network` (3) covers the label swap, the accessible "offline" suffix and a disabled-but-visible control. `LyricsPanel`, `VideoBackdrop` and `AddMusicDialog` render the offline copy; none of them was exercised with a real captive network.
- Daily mixes: 6 tests cover grouping, day stability, input-order independence, the tempo/energy order, artist spreading and the descriptor. Features come from generated analysis fixtures, not from real songs.
- Extra lyric providers: `wordLyrics` (7) covers the YRC and KRC parsers, the Kugou decoder, the offset header and the timeline sanity check; `wordProviders`/`lyricsExtra` (6) cover candidate matching, live/remix rejection, provider fallback, timeout behaviour and the opt-in switch. **No request was made to NetEase or Kugou**: their availability, CORS policy and terms were not verified from this workspace, and the endpoints are unofficial.

### 0.1.1 corrections: bigger lyrics, automatic clips, honest playback (latest run)

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build` and `npm test` pass. The version shown in the interface now comes from `package.json` (`__WAVE_VERSION__`), so it cannot drift from the release.
- Embed refusals are parsed from the player's documented error codes and turned into a message plus a YouTube link; `YouTubeStage` covers the handling in jsdom, but **no real blocked video was tested**.
- A library row without stored audio now reports it. This is derived during render, not set from an effect, so it cannot race playback.
- Clip discovery no longer accepts a pasted link: `VideoBackdrop` renders search states only. Nothing verified the discovery result against live YouTube from this workspace.
- Lyric sizes were increased in every view; the visual result was **not** screenshotted (no browser engine in this workspace).

### 0.1.1 corrections: the bar stays, the mix is a mix, lyrics follow anywhere

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run release:check -- v0.1.1` and `npm test` (441 tests across 74 files) pass.
- The transport is no longer hidden by an idle timer: the hook that did it was removed together with its CSS, because a control that disappears on its own is a control that looks broken. `useIdleListening`'s 30-second cinema view is unchanged. A new Chromium test waits five still seconds with a song playing and asserts the Pause button and the seek slider are still visible; **it was not run** here (no browser binary in this workspace), so the claim rests on the code path and the DOM test for the removed hook being gone.
- Mix: `MixAudio` (15 tests) now proves that at the midpoint of a handover the outgoing deck is at least 10 dB down in the low shelf while the incoming one is not, that the outgoing deck's low-pass has closed while the incoming deck's stays at 20 kHz, and that both are restored when the overlap ends. `mixPlanner` proves the staged curve is monotonic, jump-free, at constant power and reaches level early, and that a bar line is used for the start. **Nothing was listened to**: the claims are about gain and filter values over time, not about how a join sounds on a device.
- The graph is no longer discarded when the audio context refuses to start; the engine retries from its timer and attaches then. This is covered indirectly (the EQ test routes through a running context); a refused-then-resumed context was **not** reproduced in a browser here.
- Lyrics follow in the cinema view: `LyricsPanel` proves the read-only cinema renderer scrolls as the song advances (a second time position produces a new scroll) while staying read-only. The stored-scroll assertion in the Chromium test is **unverified** here.
- Privacy: `public/privacy.html` and `PRIVACY.md` gained sections for clip discovery, YouTube songs, the optional word-level sources, the offline cache and Mix's playback-only processing, and were re-dated to 28 October 2026. The privacy page's palette test still passes the heading check; no test asserts the new wording.

### 0.1.1 corrections: lyric videos, the light in the word, the version sweep

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run build:pages`, `npm run release:check` and `npm test` (**500 tests across 81 files**) pass.
- Lyric videos are rejected rather than penalised. `isLyricVideo` matches whole words only, so a title containing "Letters" or a "Video Oficial" mark is untouched, while "Lyric Video", "Lyrics", "Letra", "Paroles" and their translations score 0 and are never returned as a clip. Service tests cover a remembered clip that the new rules reject: the cache entry is re-scored instead of replayed, and a search that only returns a lyric video ends as `empty`. **No live host was queried**: the words are the whole rule, and what YouTube titles actually say was not measured.
- The cue: the light moved from a rule under the word to the letters themselves, through a `background-clip: text` gradient with a plain grey word painted underneath. The line, its keyframes and the sheen over the cover were deleted, and `MixCueVisual.test` asserts the sheen and the rule are gone. **No browser was available to look at it**, so the sweep and the `text-fill-color` fallback are unverified visually; a browser without text clipping shows a still word, which is the intended failure.
- The interface around the cue now opens and closes with it: the stage cue animates its height alongside its fade, and the compact bar hands the artist line over to the word and back. Asserted only through the rendered DOM (`MixCueVisual`, `PlayerBar`); the motion itself was not watched.
- Documentation: README rewritten, release notes and changelog rewritten to describe the release that actually shipped, and every remaining 0.1.0 reference outside the historical changelog sections moved to 0.1.1 (`PRIVACY.md`, `ROADMAP.md`, `DEVELOPMENT.md`, `PLATFORMS.md`, `SPEC_1.1.md`, `WINDOWS_RELEASE.md`, the release workflow default). `docs/media/wave-0.1.0-promo.mp4` is now `wave-promo.mp4`.
- Screenshots: recaptured from the running app with `scripts/capture-docs.ts` (`npm run capture:docs`) in a headless Chromium, using a disposable demo library and the same generated covers as the film. Home, a daily mix, Now Playing and the phone Home were replaced and each one was looked at: the colour is the song's, the lyrics follow the sung line, and nothing is stretched or clipped at 1440×900 or 390×844. The capture runs against the dev server here; the `Documentation images` workflow does the same against a production build on demand and uploads the PNGs.
- The cue's shimmer was checked frame by frame in the same headless browser by sampling the brightness of each letter over time: the highlight travels across the word and the letters behind it return to grey. The layout around it (the stage block opening, the compact line handing over) was **not** photographed mid-transition, so its timing is unverified.

### 0.1.1 corrections: the clip on screen, the video that is a video, the mix

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run release:check` and `npm test` (**496 tests across 81 files**) pass.
- Clip framing: the frame is sized with container query units, with the old viewport rule kept behind `@supports not (width: 1cqw)`. **No browser was available to look at it**: the zoom that pushes YouTube's chrome out of frame, the reveal-on-play, and the blurred still while paused are all unverified visually. Whether 1.24 is enough to hide the title bar depends on the player's current layout, which changes without notice; it is a crop, not an API.
- Clip choice: `clipSearch` domain tests cover the rejection of `- Topic` channels and auto-generated titles, the ordering of a music video above the official audio of the same song, acceptance of the audio when it is the only result, and that a neutral title is not mistaken for a still picture. Service tests still cover the hedge, the fallback, the cache and the offline path; the extra "official video" request is **not asserted by a test** — it runs only when the first answer has no video in it, and the live hosts were not reached from this workspace.
- Mix: `MixVisual` (4 tests) and `MixCueVisual` (4 tests) still pass, with new assertions that the cue renders one cover and no halves, and that the label has one word and one line and no bars. `usePlayerColors` (4 tests) proves the tint is interpolated between the two covers, that it follows the short way round the hue wheel, that an unsampled cover falls back to the current tint, and that a stray progress is clamped. **Nothing was watched or listened to**: whether the new blend looks calmer is a judgement for a screen.
- The pairing, Android and Windows notes from the previous section are unchanged.

### 0.1.1 corrections: a clip that follows, a coloured mark, a cue that shows

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run release:check` and `npm test` (**487 tests across 80 files**) pass, twice in a row. The intermittent failure recorded in the previous section is explained below and fixed.
- Clip playback: `readEmbedProgress` (2 tests) covers a position delivered without a player state, the state when it is there, and rejection of foreign payloads. `VideoBackdrop` (3 new tests) covers the `listening` handshake the player requires before it answers anything, the seek that follows the first report when the picture is behind the song, the absence of a correction when the picture is already there, and that a message from another window is ignored. **The user's report was reproduced by reading the protocol, not by watching a browser**: this workspace has no browser binary, so the embed itself was never loaded, YouTube's current message shapes were not observed, and a clip on a real song is still unverified. If the player changes its protocol the clip will drift again; the handshake is the mechanism, not a guarantee.
- Favicon and mark: `favicon` (4 tests) covers the hue in the generated SVG, clamping (including `NaN`), replacing the tab icon, not touching it when the hue is unchanged, and creating the link when the page has none. The mark's colour is CSS only. **No browser was observed to re-render its tab icon**, and Safari does not support SVG favicons at all — it keeps the static `apple-touch-icon`.
- Mix cue: `cueTiming` (2 tests) proves the lead-in starts eight seconds before the blend rather than eight seconds before the end, that it is pinned at the end of the lead-in once the blend starts, and that nothing is announced without a clock or a window; `cueForTrack` (1 test) proves the cue survives the moment the bar switches to the incoming song. The engine loop that produces it is still **not unit-tested**, and the Chromium assertion for the cue was **not run**.
- Pairing: the failure seen in earlier runs was a genuine race, not a slow machine. A `pair-confirm` arriving while the other side is still in `inviting` was treated as a protocol error. It is now buffered, and `confirm()` pressed during the handshake is honoured afterwards; the new session test drives exactly that order. The `settleUntil` budget was also raised, which is a test-only change.
- Android and Windows were not rebuilt; their clip, cue and colour behaviour is unchanged by this round.

### 0.1.1 corrections: QR device linking, a fitted clip, an Android offer

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run release:check` and `npm test` (**474 tests across 79 files**) pass. One full run reported a single failure that did not name itself in the captured output and **did not reproduce in two later full runs**; it is treated as flaky and unexplained, not as fixed.
- Devices: `identity` (stable key pair, fingerprint), `store` (a saved `publicKey`, the first `pairedAt` kept), `link` (auto-confirm when the peer's key is known) and `loan` (no eviction; `capacity`/`limit` rejections instead) are covered by the `src/sync` suites — **56 tests**. `QrScanner` (camera, `BarcodeDetector`/jsQR decoding) is **not covered**: jsdom has no camera and the component is never mounted in tests. **No QR code was scanned by a real camera, no two devices were linked and no loan was transferred** in this workspace. The loan-budget tests prove nothing is evicted; they cannot prove the interface is pleasant when it refuses.
- Mix announcement: `mixCue` and `MixCueVisual` (6 tests) still pass with the eight-second lead-in; the timing that produces the cue lives in the engine loop and is **not unit-tested**, and the Chromium assertion was **not run** (no browser binary here).
- Clip fitting: `autoClipStart` (2 tests) proves the split of the extra length, the two-second floor and the upper bound; `fitClipTime` and the `startAt`/`clipLength` options of `planVideoSync` (4 tests) prove the placement is not mistaken for drift, that a placement is not clamped like a manual nudge, and that a short clip is wrapped instead of being seeked past its end. The embed was **not loaded**, so whether YouTube honours the seeks on a real device remains unverified, and the placement is a guess from length alone: no audio fingerprinting, no thumbnails read.
- Clip search: service tests cover the hedge (a slow first host, a second host answering), the first good answer ending the search, provider fallback, cooldowns, caching and offline failure. All host URLs are community services that were **not reached from this workspace**; their availability, rate limits and terms remain unverified, and the hedge is a mitigation, not a guarantee.
- Mix on the phrase: `realignPlan` (4 tests) proves a plan is untouched on time, that a late blend moves by whole bars and loses those bars, that it is abandoned when fewer than two bars remain, and that fallbacks and cuts are left alone. **Nothing was listened to**: these are plan values, and moving a blend four seconds later than the analysis expected is exactly the kind of change that needs ears.
- Android offer: `androidApp` (3 tests) covers phone/tablet detection, the installed-app exclusion and the remembered answer; `AndroidAppSheet` (2 tests) covers the dialog name, the download link (external, `noreferrer`) and both buttons. The sheet was **not seen on a real phone**, the 4 s delay was not timed on a slow device, and the download destination is the releases page — **no signed APK is published as a release asset yet**, so the button does not deliver a file today.
- Android and Windows were not rebuilt this round; the earlier "not compiled" notes still stand.

### 0.1.1 corrections: a mix cue, linked devices, ranked search

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run build:pages`, `npm run release:check -- v0.1.1` and `npm test` (**458 tests across 77 files**) pass.
- Mix cue: `mixCue` (3 tests) proves the store announces a cue once, ignores a fraction change under two per cent, announces a visible one, and starts a new cue when the leaving song changes; `MixCueVisual` (3 tests) proves the split renders, that progress outside 0–1 is clamped, and that the label carries the destination in words. The timing that produces the cue lives in the engine's loop and is **not covered by a unit test**; the Chromium assertion for it was **not run** (no browser binary here).
- Devices: `signal` encoding, `transport` and `link` are **untested by design in this workspace** — they need a second peer and a real `RTCPeerConnection`. The existing `src/sync` suites (pairing, session, protocol, loans, store) still pass unchanged, which proves the layer under the new page, not the page itself. **No two-device connection, no transfer and no NAT traversal was attempted.**
- search ranking: `searchRank` (6 tests) covers the ladder, accent handling, stable ties, the limit and the recent-search list including a refusing store.
- Clip shortlist: `rankClips` is covered indirectly by the clip tests; `findClip` now stops at the first host with a good match (proven by the existing "called once" assertion), and the shortlist path that asks every host is **not exercised by a test**.
- Android and Windows were not touched this round; the earlier "not compiled" note still stands.

### 0.1.1 corrections: cued entries, a drawn blend, an Android app

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run build:pages`, `npm run release:check -- v0.1.1` and `npm test` (**446 tests across 74 files**) pass.
- Level match: `levelTrim` (2 tests) proves only the louder deck is attenuated, that -6 dB is the floor, and that songs that already match or cannot be measured are left alone. Whether a real pair actually meets by ear was **not tested**. the new song is cued on the first bar of its body (16.05 s in the fixture instead of 1.05), that a 45-second intro is entered at `MAX_ENTRY` and no deeper, that a song without segments still starts at its first beat, and that a vocal in the intro cancels the skip entirely. **Nothing was listened to**: these are plan values, not a judgement of how a join sounds.
- Unplanned handovers: `automaticMixSeconds` now returns up to 16 s (16 s for a three-minute song instead of about 7.4 s). The mix tests assert the new bounds; the audible difference on a device is **unmeasured**.
- Blend picture: `MixVisual` (4 tests) proves both covers are drawn from one progress value, that the arrival finishes before the departure starts, that values outside 0–1 are clamped, and that the seam exists. The e2e cover-geometry assertion was rewritten to measure each layer against its own transform; it was **not run** (no browser binary in this workspace).
- Android: the app was reorganised into `ui/` (theme, components, cover loader, player bar, now playing, screens, editor, state, shell) and the activity now carries the version and the theme. Sleeves are read from the file through `MediaMetadataRetriever` with an LRU cache. **None of it was compiled, linted or run**: this workspace has no JDK, no Android SDK and no Gradle, so the Kotlin is unverified beyond review. Rotation keeping playback is a manifest declaration (`configChanges`), not something observed on a device.
- Windows: `MixWindow` now returns 6–16 s instead of 1–8 s and `HandoverGains` replaces the inline equal-power curve. The contract runner was updated but **not executed** (no .NET here).

### 0.1.1 corrections: longer blends, a transport in the listening screen

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run release:check -- v0.1.1` and `npm test` (441 tests across 74 files) pass.
- Blend length: `TARGET_SECONDS` is 20 and the bar count is still rounded to whole phrases, so at 120 BPM Mix uses 12 bars (24 s) instead of 8 (16 s), at 174 BPM 16 bars (22 s), at 60 BPM 4 bars (16 s); when both sides sing the overlap is halved. `mixPlanner` asserts the new counts and that an explicit request is clamped to 16 bars. **Nothing was listened to**: the numbers describe planned overlap, not the feel of a join.
- Android and Windows now blend with `handoverGains` (same curve as the web build) over a 16-second window. Their contract tests were updated but **neither platform was compiled, linted or run** here: no Kotlin/Gradle or .NET toolchain is installed in this workspace.
- The listening screen now renders its own transport (previous, play/pause, next, position and times) inside the 30-second cinema view. There is **no component test for `PlayerBar`** — it needs the full player context — and the added Chromium assertion was **not run** (no browser binary in this workspace). The claim rests on the rendered structure and on the CSS: the bar sits at reduced opacity until the pointer or the keyboard reaches it and has no timer that removes it.

### 0.1.1 corrections: one transport, frameless lyrics, cheaper lists

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build`, `npm run release:check -- v0.1.1` and `npm test` (438 tests across 75 files) pass.
- One transport: `VideoBackdrop` proves the found clip is an embed with `controls=0`, `mute=1`, `disablekb=1` and **no button, no link and no status inside the clip itself**, and that removing the clip from the song's options closes the video through the `wave:clips-changed` event. `YouTubeStage` proves the same for a YouTube song, whose link now lives in the song's options. **No clip and no embed was played**: the front-ends were never reachable from this workspace.
- Frameless lyrics: the CSS no longer draws a panel, a gradient pill or a bar behind a line; the sung line is marked with scale, weight and the accent colour, and the shrink-to-fit binary search is gone, so a lyric is never rendered smaller than its type size. The visual result was **not screenshotted** and was not compared with 0.1.0 on a device; the claim is about the rules in the stylesheet and the removal of the shrinking code.
- Transport idle: `useControlsIdle` (3 tests) proves the transport hides after two still seconds while a song plays, never hides while paused, comes back on the first pointer move, and stays on screen while a control inside it has focus.
- Mix tail: `mix` (3 new tests) proves a handover is only allowed inside the final seconds of the file — a three-minute song is not mixed at two minutes, a 30-second song is not mixed at three seconds, and a song with no known duration is never mixed. The engine now asks that question before it looks at any plan. **Nothing was listened to**: this bounds where a mix may start, it does not prove the blend sounds good.
- Lists: `useIncrementalRows` (2 tests) proves one page is rendered first and the next page arrives when the sentinel is intersected, and that a short list is rendered whole. `content-visibility` and the removed row animations are CSS/render changes that were **not profiled on a device**; there is no performance trace in this workspace.
- Release labels: `npm run test:release` (7 node tests) proves a stale version shown in a Windows or Android interface fails the release check.
- Flaky pairing helper: the sealed-frame helper now waits for the paired state instead of guessing six ticks, which failed once in a full parallel run.

### 0.1.1 corrections: performance, the mix point and lyric size

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build` and `npm test` (430 tests across 73 files) pass.
- Clip search: `clipSearch` (6 tests) proves the first matching host is used, another host is asked when one fails, a host that failed is skipped on the next search, an explicit retry clears that memory, an empty answer is remembered for a day and the whole search stops at its budget when no host answers. **No request was made to Piped or Invidious**: whether each of the eight instances is alive, allows cross-origin reads and still returns the documented shape is unverified from this workspace, and community instances change without notice.
- Mix: `mixPlanner` proves the incoming song enters within six seconds of its own start even when it has a 45 s intro or starts with a vocal, that the overlap is four bars at 120 BPM (two when both sides sing), and that a plan is reused for the same pair. A generated-signal run through the real analyser put the cue at 0.3 s and the overlap inside the last 8 s of a three-minute song. **Nothing was listened to**: no browser engine and no audio device here, so "the mix sounds better" is not verified, only that the entry is no longer deep inside the song and that it cannot start before half of the track has played.
- Performance: `playbackClock` (4 tests) proves the position is delivered at most ten times a second and that a seek is immediate; `usePlayer` proves that six consecutive engine ticks while a song plays cause **zero** re-renders of the hook's owner. The change itself is architectural — the position is no longer React state at the app root — and was not profiled on a real phone; there is no performance trace in this workspace. The settings page and daily-mix page are now separate chunks; the initial JavaScript is about 188 KiB gzipped instead of 190 KiB, so the size win is small and the real win is that playback no longer re-renders the library.
- Lyrics: the reader went back to the 0.1.0 shape (one scrolling page of text, centred on the sung line) at larger sizes than 0.1.0 used: 22–34 px in the stage, 24–52 px in the cinema view and 19–28 px on phones. `LyricsPanel` proves that every line is rendered, that exactly one line is current, that the list is not windowed and that the reader scrolls the sung line into the middle. The visual result was **not** screenshotted and was not compared side by side with 0.1.0 on a device.

### 0.1.1 corrections: sound on every song, lyric framing, layering

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build` and `npm test` (421 tests across 72 files) pass.
- Silence: `mixGraph` proves the context reports whether it can run and that a refused resume is reported; `MixAudio` proves a song stays on the native element — no `createMediaElementSource`, volume untouched, unmuted — when the context cannot run, and that routing only happens once the context is running. **Nothing was heard**: there is no browser engine here, so the claim is that the code cannot produce a muted graph, not that a device was listened to.
- YouTube: the play retry is now persistent and re-sends the volume until the embed confirms, and a stale outgoing gain is reset on track change. `YouTubeStage` covers the command sequence in jsdom; **no live embed was played or heard** from this workspace, and browser autoplay blocking on a real device remains unverified.
- Lyrics: `LyricsPanel` now proves exactly three `.lyric-line` rows in the stage reader, with the sung line in the middle, at two different playback times. The visual framing was **not** screenshotted.
- Two sync suites (`session`, `roundTrip`) each flaked once in a full parallel run: their helpers waited a single 20 ms macrotask for asynchronous encryption. Both now wait six short ticks and the full suite passed twice afterwards. Nothing in sync behaviour changed, and no test was weakened: the helpers only wait longer.
- Layering and spacing: the scale (`base 0 < content 1 < nav 20 < player 30 < menu 40 < toast 60 < drop 70 < skip 80`) and the tightened header/workspace spacing are CSS only; their real geometry was **not measured here**. Menus and dialogs use the native top layer.

### YouTube metadata, one-switch Mix, phones and installability

- `npx tsc -b`, `npx eslint .`, `npx prettier --check .`, `npm run build` and `npm test` (416 tests across 72 files) passed.
- `videoMeta` (9 tests) covers the four-source chain, a source that fails like a CORS-blocked fetch, an unusable body, a hanging request, the per-source timeout, the whole-chain budget, id validation and an already-aborted signal. **No live request was made to YouTube, noembed, Piped or Invidious**: which of them answer from a given network, and whether each still allows cross-origin reads, is unverified and is exactly why there are four.
- Mix: `mixPlanner` (14) now also proves `automaticBars` picks a bar count that keeps a blend near 18 s at 72–190 BPM, and that a slow pair gets a longer overlap than a fast one without being configured.
- YouTube playback: `YouTubeStage` (4) still passes with the play retry and the autoplay-at-mount behaviour; the iframe URL is captured once so a react re-render cannot restart the video. **Audible playback through the embed was not exercised**: no browser engine and no network to YouTube here.
- Mobile and installability: the manifest, icons and service worker were generated and are present in `dist`, and `index.html` links them. The Playwright suite and any screenshot comparison were **not** run: no Chromium is installed in this workspace. Touch target sizes for coarse pointers, safe-area padding and the offline shell therefore still need a real-device pass (Android Chrome and iOS Safari), and the service worker's cache behaviour after a redeploy is unverified.
- Android shell: edge-to-edge with safe-drawing insets and a single Mix switch. The Kotlin change was **not compiled**; there is no Android SDK in this workspace.

LRCLIB tests use controlled responses to verify exact/search matching, client identification, size/time bounds and Retry-After. They do **not** establish current live provider availability, coverage, latency or a copyright license. Rendering tests are not a substitute for audible crossfade assessment across browsers/recordings; correlated audio can peak during equal-power mixing. No bit-perfect/gapless claim is made.

## Android and Windows

Ten Kotlin/C# source files passed syntax parsing. Seven native XML/XAML/project/manifest files parsed, and WPF event handler names were checked against code. These are static checks only: **native SDK compilation, native unit/lint workflows and actual runtime/device testing were not performed**. The required SDKs are not installed in this workspace. No APK, EXE, installer or signed production package was produced here.

Native CI jobs and source projects exist, but no remote workflow was dispatched. Feature parity is incomplete; [PLATFORMS](PLATFORMS.md) and [ROADMAP](ROADMAP.md) list the outstanding functionality and release gates. Windows CI is framework-dependent and requires the separate .NET Desktop runtime. Native dependency inventories are preliminary, not a cleared release SBOM.

## Publication and legal status

No GitHub Pages deployment, release or remote publication was performed. Publishing requires maintainer Pages configuration and merging/pushing the source changes through the normal repository process. The legal-analysis document was removed at the project owner’s request. New legally motivated product changes require owner approval.

## Visual listening redesign follow-up

The new browser checks cover whole-UI cover tones, native bottom-circle View Transition keyframes, light-theme accent/white-label contrast across six hues, privacy-page palette/theme and narrow-width fit, deterministic mixed-color playlist identity across detail/Home/reload, complete cinematic active text in both themes, and real bottom-dock seek/volume/mode/favorite/track actions at phone width. Normal lyric context is intentionally scrollable internally and softly blurred; visible control hit targets and the fixed outer viewport are checked separately from offscreen lyric rows.

Focus policy is covered by unit tests and controlled browser focus/blur signals. Headless Chromium keeps focus emulation enabled across its pages, so this does not establish physical OS/window-switch behavior on every browser. The implementation uses native document visibility/hasFocus and window blur/focus, not device-wide activity monitoring.

## Discovery and album-first playback follow-up

The final complete Chromium run passed all **56 tests** (approximately 3.7 minutes). It includes dedicated grouped Search, accent-insensitive/reordered tokens, category navigation, true playlist creation from search, absence of the global composer on Home, scoped relocated collection filtering, and filename/tag precedence. A new geometry check proves credits below artwork, a larger square phone cover and an enlarged square cover when lyrics collapse. Existing source-byte, crossfade, offline lyric, editing, reorder, focus/idle and viewport regressions passed.

All **134 unit/component tests across 28 files** passed after the identity/lyrics changes. Additional cases cover dash/prefix filename inference, genuine numeric titles, recording-edition separation, Unicode token matching, unchanged Blob identity and malformed synchronized-candidate fallback/continuation. Format, lint, production root build and repository-path build passed; the `/Wave/` Chromium smoke again verified navigation, fonts/assets, logo and privacy return. These are web checks, not native compilation or a live LRCLIB availability test.

Development-server transform caching and asynchronous decoder readiness affected intermediate runs. The final run used a restarted Vite server, stable sources, paused seeks for exact word-fill assertions, and a decoder-ready precondition before advancing mocked inactivity time. No production functionality was disabled to satisfy those checks.

## Expressive playback and lyric recovery follow-up

The final full Chromium run passed **62 tests in 4.8 minutes**, including six new expressive-playback checks. These verify a changing startup W path and nonblocking completion; compact artist expansion rather than profile navigation; large-cover pause and root palette reset; real source-energy changes after seeking between silent/loud waveform sections; stop-on-pause and dynamic system reduced-motion behavior; transient press-ripple cleanup; exact-query rejection falling through to verified lyrics; and visible provider cooldown surviving reload without an early request. Existing no-scroll controls, complete cinematic lyrics, focus/idle behavior, crossfade, original 24-bit bytes, edits, queue and playlist/album ordering all passed.

The final unit/component run passed **147 tests across 30 files**. New cases cover channel-amplitude envelopes and interpolation, stale canceled request cleanup, manual requests interrupted by import, queued provider cooldown, finite fallback when Retry-After is missing/invalid, exact-query fallback/unknown duration, featured credits, LRC format variants and live system/app motion settings.

Format, lint, root production build and `/Wave/` production build passed. The repository-path Chromium smoke exercised Search, compact/full playback, artwork pause/palette reset, Settings, self-hosted font, Wave icon and privacy return without page/asset errors. Browser fixtures are generated owned waveforms and controlled provider responses; they do not establish live LRCLIB availability or audible/perceptual output quality. Visual amplitude analysis is bounded to supported sources up to 24 MB and a known 20-minute duration and never touches the native playback graph. Native builds remain unperformed. No Git history rewrite, commit, push or publication was performed in this iteration.

## Bounded stage, lyric recovery and measured-light follow-up

The latest complete run passed **67 Chromium tests in 5.2 minutes** after the final caption/layout changes. All **156 unit/component tests across 32 files** passed. Format, lint, root/`/Wave/` production builds, production repository-path smoke, dependency audit (zero reported vulnerabilities) and whitespace checks passed. The main production chunk still has Vite's advisory 500 KB size warning.

Five added browser checks verify responsive wave coverage/clip/thumb at zero, near-zero, middle and near-end positions; Home/End/arrow seeking; native play and reduced-motion wave states; square cover geometry and SVG-in-button containment at widths 320–2560, including 700×360 and 1440×600; genuinely screen-reader-only descriptions; deliberately opened timing controls and persistence; headered-request failure falling back to the identical URL with simple headers; and offline reuse without another lookup. Audio checks require actual native captured-source analysis and perceptible computed light opacity, preserve advancing native time/source/volume, release capture on pause, and separately exercise bounded envelope fallback with mute/unmute. Earlier silent/loud waveform seeking, original source bytes and actual two-deck crossfade tests remain passing.

Production smoke exercised Home/Search/Settings, playback/wave/light, cover pause/palette reset, self-hosted font/logo, and Privacy & Rights return under `/Wave/`, without page/asset errors. Screenshots were inspected at desktop, narrow phone and short landscape sizes. The first visual inspection caught a missing screen-reader-only utility; it was fixed and given a geometric regression assertion before the final full run. An intermediate browser run also exposed an import-readiness race in the one-second track-end test: it could start the first row before the second track had joined the collection. The test now waits for the full two-track import before asserting queue advancement; production playback was not disabled or bypassed.

**Live LRCLIB remains unverified.** An actual browser request failed with `ERR_CONNECTION_CLOSED`/`TypeError: Failed to fetch`, both with the client header and with a safelisted GET; the command-line request also failed during TLS setup. This restricted workspace cannot establish provider availability or diagnose the user's network. Upstream router source explicitly allows `Lrclib-Client`; it is not documented here as an inherently invalid CORS header. Controlled-response tests demonstrate recovery/matching/storage behavior, not a successful live lookup, provider coverage, licensing or availability.

No native build, Git history rewrite, commit, push, remote workflow or deployment was performed. Audio storage, source bytes and legal/consent documents were left unchanged in this follow-up.

## Matte spectral listening and queue refinement follow-up

The latest complete source passed **167 unit/component tests across 34 files** and **73 Chromium browser tests in 4.8 minutes**, with no retries in the final full run. Lint, format, root and `/Wave/` production builds, dependency audit (zero reported vulnerabilities) and whitespace checks passed. Vite retains its advisory main-chunk size warning (approximately 524 KB, gzip 165 KB).

Six new browser tests verify actual low/mid/high spectral dominance using an owned 100/1000/6000 Hz source, independent matte-field transforms/no filter or glow, curved compact seek on phones/tablets/desktop without expansion, bounded tonal Queue and non-restarting current-row selection, album verification beyond a conflicting exact compilation toward a matching deluxe recording, timing reset/follow/idle protection, and exact shared Wave/Privacy background plus cross-tab appearance updates. Existing no-scroll, focus, queue editing/restoration, byte preservation, native repeat/track-end and actual two-deck crossfade tests all remained passing.

Additional units cover band classification/invalid bins, album/reissue/performance conflicts, plain-only compilation fallback, stale native play rejection and transition resolution ownership, obsolete palette callbacks and failed timing-save recovery. These are not claims of universal browser or recording compatibility.

Visual inspection covered desktop/phone player, compact wave, desktop/phone Queue and actual **30-second native-timer** cinema entry with motion enabled, plus wake and short-screen geometry. Inspection caught a prior visual/ARIA mismatch: normal controls could remain visually present under cinema despite being inert. Both computed visibility and accessibility state are now protected. Screenshots use generated owned artwork/audio, not third-party music or covers. Frequency bands are not separated vocal/instrument stems.

A repository-path production Chromium smoke verified Home/Search, import/native playback and live spectral analysis, compact/full wave, Queue, cover pause, Settings, font/logo assets and Privacy return with no page/asset errors. The renewed direct LRCLIB request still failed during TLS setup (`SSL_ERROR_SYSCALL`) in this restricted workspace; real provider access/coverage remains unverified. Mocked matching/recovery tests do not establish live service availability.

Only Privacy appearance CSS/script changed in this refinement, not its explanatory/legal text, permissions or consent. Native project foundations and audio storage remain unchanged. No native compilation, Git history rewrite, commit/push, workflow dispatch or deployment was performed.

## Illumination, queue reordering and mixing follow-up

Validated on 2026-10-15:

- **179 unit/component tests across 36 files passed**, including staged gain continuity/power, conservative silence bounds, periodic-source aliasing, original cue/lyric clock, queue permutations/native time, palette origin/shortest arc, motion opt-out, persistence and stale callback guards. The concurrent full run completed in 95.2 seconds.
- **78 Chromium browser tests passed** in 5.8 minutes. Five added checks cover actual drag/Alt-arrow queue editing and reload restoration; contextual right-click/Shift-F10, keyboard actions, focus return and viewport/native-menu escape hatches; full lower-UI absence hiding/wake; silence-padded native two-deck mixing and media-clocked palette colors; and persisted classic-crossfade fallback without introduction skipping.
- ESLint, Prettier, TypeScript and production builds for both `/` and `/Wave/` passed. Production dependency audit reported **0 vulnerabilities**. The existing main-chunk size advisory remains; it is not a build error.
- A production `/Wave/` browser smoke verified Home/Search, imports/native playback and spectral analysis, compact/full seek and illumination, queue reordering, artwork pause, contextual menu, Mix setting, self-hosted fonts/logo and Privacy return, with no page or asset errors.

Visual review covered desktop/phone radial illumination, queue editing on a 320 px phone, settled contextual menu, light-mode stage and **real native-timer 30-second** desktop/phone absence. The absence screenshot has no lower controls or navigation. Initial testing caught transformed-dimension/entrance edge overflow in the context menu; positioning now uses untransformed dimensions, reclamps on resize and animates inside its final bounds. The corrected behavior passed the complete run.

All audio/artwork fixtures are locally owned synthetic test material. Original audio storage, file bytes and legal text are unchanged. Mix is a staged volume handover with conservative silence cues, not beat matching, tempo/pitch processing or stem separation. Live LRCLIB availability and native Android/Windows builds remain outside this validation.

## Historical: verified imports and automatic listening follow-up (before catalogue removal)

Validated on 2026-10-15:

- **193 unit/component tests across 41 files passed**. New coverage includes normalized import fields, front-cover preference, corrupt-image isolation, conservative catalogue matching/ambiguous releases, missing-only atomic completion with concurrent favorites and stale manual edits, automatic Mix windows, legacy preference migration, weighted local continuation and expanded lyric credit/title matching.
- **83 Chromium browser tests passed** in a complete 6.0-minute run. Added checks verify opt-in metadata-only catalogue requests, no cover download before explicit completion, validated saved covers and retained original tags/bytes after reload, provider-failure states, native queue continuation and repeat priority, 150-track worker import at 320 px with eight-row review, and recovered collaborative lyrics. Existing playback, original 24-bit bytes, idle/focus, storage, queue editing, mobile geometry and two-decoder overlap tests remained passing. Prior ordinary-playback fixtures explicitly disable new default Mix/Autoplay features; their feature checks separately verify defaults and behavior.
- ESLint, Prettier, TypeScript, `/` and `/Wave/` production builds passed. Production dependency audit reported **0 vulnerabilities**. The existing main-chunk advisory remains (approximately 547 kB minified); this is not a claim of a smaller initial application bundle or an OS/device benchmark.
- Production `/Wave/` smoke exercised the compiled **ES-module metadata worker**, asserted successful replies for both imported files, verified native playback/light/seek, queue editing, contextual menu, Mix setting, self-hosted assets and Privacy return without page/asset errors. Worker code splitting reduced its entry from the initial bundled implementation's roughly 259 kB to roughly 88 kB, with codec parsers loaded separately; that comparison is worker output size, not an end-to-end speed benchmark.

Visual review covered desktop/320 px Settings and metadata review. Controlled tests also retain reduced-motion, narrow/short-player, touch-target/overflow and focus checks. Rendering changes bound work rather than virtualize lists: low-priority import updates, deferred Search, plain rows above 120 entries, off-screen containment, lazy artwork, memoized seek paths, bounded root time updates and canceled unfocused visual RAF. Lyric clocks and gain timing remain independent.

Catalogue and lyric recovery were exercised with controlled owned responses/fixtures. **Live MusicBrainz/Cover Art Archive/LRCLIB availability and catalogue coverage remain unverified from this restricted workspace.** Browser/provider policies can reject direct requests; Wave reports unavailable/no match rather than claiming verification. Artwork rights are not certified. Privacy additions for optional metadata requests were approved before implementation; existing rights restrictions and license notices remain. Native Android/Windows feature parity and builds are unchanged/unverified.

## Focused Settings and mobile Library follow-up

Validated on 2026-10-15 after removing the catalogue feature:

- Complete runs: **190 unit/component tests in 39 files**, **85 Chromium browser tests** (5.9 minutes), all passing. Removed catalogue-specific unit/browser cases were replaced with no-request/data-retention regressions; the earlier counts describe the earlier implementation, not the current source.
- Verified six isolated Settings menus, relevant controls only, theme/Autoplay persistence, heading/card/opener focus return, and narrow layouts. A pre-existing cross-tab Privacy test now waits for the other app's initial palette application before writing its later simulated preference; this avoids racing startup palette writes.
- Set the legacy metadata consent flag to true, imported/reloaded songs and asserted **zero catalogue/cover requests**, no online verification control and preserved previously saved album data. Local review derives missing fields from actual current tags. Separate lyric opt-in/download tests still pass.
- Used 400–500-character unbroken title/artist/album tags, 100-character playlist names and a long unbroken description. Checked actual container/control bounds at 320, 360, 390, 768 and 1440 px; exercised album/artist detail, song options, full player, queue, Search and Home. Horizontal album shelves intentionally scroll; their labels must fit their own cards. Stored strings remain unchanged; wrapping, clamping and ellipsis handle display.
- Verified flat playlist labels have stable geometry, member colors, no gradient/rotation/filter decoration and dark glyph ink for pale colors; custom covers and Home/detail consistency remain covered. Empty-player and bottom-dock clearance tests match the revised mobile layout.
- ESLint, Prettier, TypeScript and root/Pages production builds passed. Production `/Wave/` smoke verified compiled worker replies, import/native playback, illumination/seek, queue reorder, artwork pause, contextual menu, Playback submenu/Mix, self-hosted assets and Privacy return without page/asset errors. Production dependency audit reported zero vulnerabilities; the existing main-chunk advisory remains.

Privacy metadata text was updated with explicit approval. Local data was not erased or reverted. Lyrics provider availability and native Android/Windows builds/parity remain outside this validation; native sources were not modified.

## 0.1.0 web candidate — final feature freeze

Validated on 2026-10-15:

- **200 unit/component tests across 42 files passed** (135.3 seconds while browser checks ran concurrently). Coverage adds deterministic/disjoint genre groups, sparse artist fallback, no input mutation, day-to-day changes, explicit editor preview/save/provenance, draft retention/cancellation/cooldown, worker deadline/recovery/idle release and oversized-body cancellation.
- **89 Chromium browser tests passed in one complete 7.6-minute run**. New cases cover editor search on an unplayed song with no implicit request/save/playback, reload persistence, failed-provider cooldown with preserved manual draft, three fully local genre mixes and coherent native queue, no Home session duplication, and Larger text/form/control bounds at 320 px. Existing real-decoder, overlap, cue/lyric clocks, original bytes, queue/order/storage, inactivity, reduced-motion and mobile tests stayed passing.
- ESLint, Prettier, TypeScript and root/Pages production builds passed. Production dependency audit reported zero vulnerabilities. The existing main-bundle advisory remains, approximately 547 kB minified / 172 kB gzip.
- Compiled `/Wave/` smoke asserted successful replies from the production ES-module metadata worker for ten imports, three genre mixes, no duplicated session, larger text, explicit editor preview/save, actual synchronized native playback, local assets and Privacy return, with no page/asset errors. Visual review covered desktop Home, 390 px Home and 320 px larger-text editor; modal content intentionally scrolls within its bounds.

The web candidate is suitable for **draft review**, not an assertion of defect-free software or a published release. Actual LRCLIB coverage remains unverified here; controlled fixtures validate the flow. Native Android/Windows build/runtime/parity checks and hosted CI remain separate release gates. See [candidate release notes](RELEASE_NOTES_0.1.0.md). No legal text was changed in this follow-up.

## Native-build and UI correction follow-up — 2026-10-15

- Hosted [Native builds run 38809461099](https://github.com/jaime-gaming/Wave/actions/runs/38809461099) passed both Android and Windows at `e13718d`. Android executed `testDebugUnitTest lintDebug assembleDebug` and uploaded its debug test APK. Windows built/published and uploaded its unsigned test ZIP. The original failures were Android's redundant SDK bootstrap and missing `System.IO` types in the Windows lyric client.
- The web suite passed **202 unit/component tests across 43 files** and **91 Chromium browser tests** in a complete run. Focused regressions additionally verify native-dialog padding versus real backdrop clicks, inside-to-outside/canceled pointer gestures, and all lyric-editor actions remaining inside the viewport while its body scrolls at **320×360 with Larger text**. Cancel preserves previously saved lyrics. Punctuation-only artist tags do not become Daily mixes.
- ESLint, Prettier, TypeScript and the production build passed. The existing roughly 547 kB main-chunk advisory remains. Visual review covered the editor at 320×360 and 390×844 with larger text.
- Windows source refinements add readable dark edit-field text/caret colors, rounded 44 px minimum controls, constrained long labels, wrapping playback actions and enough compact-player height. Hosted compilation of native build fixes is not a physical Android/Windows UI/playback test; device checks and feature parity remain separate gates.

Original audio/storage and legal notices were not changed. The PR remains draft with Highlights only. The annotated `v0.1.0` tag and GitHub Release are deferred until the approved merge, and must target its actual merged commit; see `DEVELOPMENT.md`.

## Release 0.1.0 · 17 October 2026 — playlist/mobile/Windows/media

The release date identifies the documentation set, not a completed publication. Tag/Release creation remains tied to the approved merge.

- Web: **203 unit/component tests across 43 files** passed after atomic daily-mix snapshot creation was added. The focused release suite passed **10 Chromium tests**, including unplayed mix browsing, saved order after reload and 320/390/430 px Larger text layouts. **The complete 95-test Chromium suite also passed in one 8.0-minute run.** Final unit run: 203/43 files. A compiled `/Wave/` smoke also passed: ten metadata-worker imports, three mixes, explicit editor preview/save, native lyric playback, local assets and Privacy return, without page/asset errors. ESLint, Prettier, TypeScript and root plus `/Wave/` builds passed; the existing main-chunk size advisory remains.
- Hosted [native run 38816714860](https://github.com/jaime-gaming/Wave/actions/runs/38816714860) passed Android unit/lint/debug assembly and Windows contracts, build, WPF UI smoke, publish and conditional Defender scan. Windows contracts cover playlist resolution, stable queue mutation, old disabled preferences, bounded Mix timing, persistence and genre-group rules. The smoke uses an isolated temporary library and captures Home, mix, playlist, Settings and a narrow light layout; it is not an interactive physical-device playback test.
- Visual review covered actual web screenshots and extracted promotional-video frames. The silent MP4 is 1920×1080 H.264/yuv420p, 30 fps, approximately 39 seconds, with fast-start metadata; a full decode reported no errors. It shows real web interactions with original demo assets, not native parity footage.
- The README and release notes use **0.1.0 · 17 October 2026**. Original audio storage and legal notices remain unchanged. Signed Windows publication, complete native parity, physical-device audio/accessibility checks and live provider coverage remain explicit limits. Antivirus results are a snapshot, not a zero-false-positive guarantee.

## Revised product film for release 0.1.0

This replaces the earlier 39-second silent promotional MP4 described above; it does not change application behavior or replace the application test results.

- All twelve real-UI capture scenes completed in an isolated browser context: collection/import, daily mixes, search/metadata, playlist ordering, expanded playback, queue, Mix/Autoplay, lyrics, lyric editor, appearance and two mobile viewports.
- The revised file is **60.000 seconds**, **1920×1080**, **30 fps / 1,800 frames**, **H.264/yuv420p**, with **stereo AAC at 48 kHz**, and is **7,309,815 bytes**. Its `moov` atom precedes `mdat` for progressive playback.
- A complete FFmpeg audio/video decode reported **no errors**. Post-encode audio measurement reported **−17.12 LUFS integrated** and **−1.76 dBTP**; the soundtrack is a soft acoustic-piano arrangement using recorded CC0 samples, with no narration or chiptune oscillators.
- Representative final decoded frames were visually reviewed for collection, editing, playback, queue focus, lyric close-up, mobile composition and the closing repository address. This is web/mobile-viewport footage, not native-parity certification; the lyric-search response is a controlled original demo fixture.
- ESLint and Prettier passed for the new capture script; the three Python production tools passed Ruff lint/format and bytecode compilation. Sample downloads were verified against their pinned Git blob identities.
- Reproduction and source provenance are in [promo production](media/PROMO_PRODUCTION.md). Raw takes, samples, tooling and intermediate renders remain ignored. No social post, merge, tag or release was performed.

## Lyric request coordination for release 0.1.0 · 17 October 2026

Checks below were executed on 16 October 2026 against the upcoming release; older run timestamps above are historical, not release dates.

- Full unit suite: **216 tests in 44 files passed**. Coverage includes global request spacing, already-queued throttles, independent cancellation and result isolation for shared lookups, short numeric and HTTP-date retry deadlines, invalid/missing header fallback, storage-quota fallback, and automatic retry eligibility at the actual deadline.
- Four new real-Chromium regressions passed: two same-origin tabs observe shared request spacing; an exposed two-second Retry-After reenables manual search without a minute-long penalty; a throttle blocks the other tab's queued request; and a CORS-unexposed header retains the conservative fallback without a retry loop. Provider responses were controlled fixtures, not live-service certification.
- Complete Chromium suite: **98 of 99 passed**. The remaining existing `crossfade really overlaps two native decoders…` test fails its `.mix-artwork` visibility assertion. Two isolated retries reproduced it; the same failure was then reproduced with the four modified lyric implementation files temporarily restored to their committed baseline. Current changes were restored afterward. The unrelated player/visual code and its assertion were deliberately left unchanged.
- Root production build, ESLint, full Prettier check and diff whitespace check passed. The pre-existing JavaScript chunk-size advisory remains.
- Windows now serializes bounded lyric requests and honors short/date Retry-After values. Android maintains 500 ms spacing without truncating longer provider deadlines. Four Windows retry-deadline contracts and four Android retry tests were added. **Native SDKs are unavailable in this sandbox, so these new native changes/contracts were not compiled or run locally**; earlier native CI results do not certify this revision.
- Release/documentation/About dates are 17 October 2026. Privacy notice edits are date-only; legal policy text, providers, consent and original audio storage are unchanged. The improved 60-second film and reproducible production tools are included in this revision. No merge, tag, release or social publication is performed.

## Final merge candidate · 17 October 2026

- Expanded Mix had a separate, reproducible sizing defect in Chromium 153: both covers were 56×56 inside a 287×287 stage. `MixVisual` now accepts the appropriate artwork style for each context; expanded playback uses the responsive stage style, while compact playback retains its thumbnail style. A stage-specific override removes the legacy mobile thumbnail cap. No decoder, original audio storage, queue or lyric-provider policy was changed by this correction.
- The native-decoder overlap regression now measures both artwork layers, their Mix frame and the outer stage cover at 1280×720, 390×844 and 320×568. Both phone cases collapse lyrics to exercise the larger cover. All three passed with motion enabled, while retaining actual simultaneous decoder/gain checks, pause and persisted Mix settings. Two additional component tests protect expanded and compact artwork classes.
- The historical 98/99 result above used the sandbox's Chromium 143 build. Its visibility failure was not reproduced with Chromium 153 before the sizing correction. This distinction does not certify every older browser or erase the historical result.
- Six release-metadata tests cover matching versions, Windows line endings and rejection of wrong tags, stale lockfiles, divergent native versions and mismatched notes. CI and Pages run this guard before building; it has no publishing side effects.
- GitHub web, Android and Windows checks all passed on `0ada8a0` (web runs 38972387409/38972382762; native runs 38972387783/38972382724). That includes the native lyric changes previously unverified locally. New candidate checks must pass again before merge. SDK/device/signing limitations remain as documented; successful CI is not physical-device certification.
- Full candidate verification: **218 unit tests in 45 files**, **101 Chromium 153 browser tests** (7.3 minutes, two workers), and **6 release-metadata tests** passed. Production build, ESLint, Prettier and whitespace checks passed. The existing >500 kB bundle advisory remains; it is not a build failure.
- Release preparation preserves the feature branch, matches the validated PR head at merge, and targets the annotated tag and release at the actual merge commit. GitHub Pages has a separate deployment result; the repository reports private visibility and `has_pages=false`. Detailed Pages configuration could not be inspected through the session integration (HTTP 403). Deployment now requires explicit `PAGES_ENABLED=true` after Pages is configured, rather than failing an unconfigured main-branch deployment. Build artifacts remain available without publishing a site or changing visibility.

### Release asset preparation

- A clean archived-source web build with `WAVE_BASE_PATH=./` passed production-browser smoke checks at both `/` and `/nested/wave/`: actual audio import, metadata-worker loading, native playback and reload persistence, with no page errors.
- Direct attachment upload from this sandbox ended with a transport EOF and the draft retained no assets. The `Release assets` workflow therefore builds the actual published tag on GitHub, verifies version identity and main ancestry, and uploads the web ZIP, existing MP4 and SHA-256 manifest without relying on that upload connection. It can be retried explicitly with the same tag. No native test binaries, signing keys or library data are included.
- Four isolated Python packaging contracts check archive contents/checksums, byte-identical repeated packaging, missing-build rejection and prevention of output inside the input tree. ZIP timestamps derive from the source commit rather than runner checkout time. Hashes identify files; they are not signatures or antivirus certification.

## Listening history and the Android rebuild

The web rules are tested: `src/data/listening.test.ts` covers the threshold, the accumulator
that ignores a jump, and the prune to two thousand; `ListeningPage.test.tsx` covers the page
reading a history and an empty one. The web gate at the listening commit was clean compile,
lint and formatting, with 527 tests over 85 files.

Android carries the same rules as unit tests — `LibraryContractsTest` covers search ranking,
accent folding, the mix grouping and its daily rotation, the play threshold, the summary with a
deleted song in it, listening time in words and position formatting — and the native workflow
now compiles and runs them. **This workspace has no JDK, Gradle or Android SDK**, so the build
was only ever checked by CI, and it took several rounds: the media session, the notification
permission, a shadowed `Canvas` size and two of the older contracts each had to be corrected
from a compile error. The current commit passes `testDebugUnitTest`, `lintDebug` and
`assembleDebug` on the hosted runner.

Passing a build is not the same as working. There was no emulator and no phone here, so the
service, the media session, the lock screen, the widget, the tile, the shortcuts, the folder
walk, the `MediaStore` import and the audio-focus behaviour have not been exercised at all;
the blend has never been heard on a phone speaker. Those remain device checks, not test
coverage.

Windows gained `Listening.cs` and its contract lines in `Wave.Contracts.Tests`, a Listening page
in the sidebar and a Jump back in shelf on Home. The contract runner, the build, the WPF layout
smoke mode and the publish step all pass on the hosted runner; the app was not clicked here,
and the listening clock is driven from the same timer as the position, which no test exercises.

What remains unverifiable from this workspace, on every platform: real audio through real
headphones, a car, a call interrupting playback, and whether the blend sounds like a blend.

## The browser suite is red, and was red before this round

`npm run test:e2e` has failed on every commit since `8f5d52d`; the last green browser run is
older than the Devices settings page. It was run here for the first time in this workspace, with
a headless Chromium built from `@sparticuz/chromium` and NSS stubs: **77 passed, 28 failed** in
14.7 minutes. The failures are not all one thing.

- Stale counts: `mobile-library.spec.ts` expects six Settings menu items and the app has seven,
  because **Devices** was added in `79d243c` without changing the test. This is the test being
  out of date, not the app being wrong.
- Mix and playback timing (`wave.spec.ts` "Mix keeps full-size covers", `listening-refinement`
  "a mix is announced before it happens", several lyric-follow tests) wait on real playback
  position in a headless browser on two shared cores; they time out rather than assert a wrong
  value. Whether they fail on a normal machine is unknown from here.
- Lyric lookups (`wave.spec.ts` "downloads matching lyrics", "reports lookup errors") expect a
  provider response; this sandbox cannot reach the lyric service, so those are environment
  failures and prove nothing either way.

Nobody should read this round as having fixed or caused the browser gate. It needs its own
pass: re-baseline the counts against the current interface, run the timing tests on a machine
with a real audio clock, and keep the network-dependent ones behind an intercept.
