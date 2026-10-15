# Wave Development Guide

## Requirements

| Tool    | Requirement                         |
| ------- | ----------------------------------- |
| Node.js | 22.12+ in Node 22, or Node 24       |
| npm     | Included with Node.js               |
| Git     | A recent supported version          |
| Browser | Modern Chromium, Firefox, or Safari |
| Editor  | Any editor with TypeScript support  |

JDK, Gradle, Android Studio, and an Android SDK are not required for the web client; they are needed for the independent Android project (see PLATFORMS.md).

## Initial setup

```bash
git clone https://github.com/jaime-gaming/Wave.git
cd Wave
npm ci
npm run dev
```

Vite prints the development URL, normally `http://localhost:5173`. The server binds to `0.0.0.0` so it can also be used in a proxied development environment. The configured host allowlist accepts `.e2b.app` preview hosts. Add other trusted preview hosts explicitly if needed; do not disable host validation globally.

No `.env` file, API key, account, or separate backend is needed. Bundled browser-facing resources use same-origin URLs; optional lyrics requests use the public LRCLIB HTTPS API. Do not hard-code another service's localhost URL in client code.

## Commands

| Command                | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Development server with hot reload            |
| `npm run build`        | Strict type checking and production bundle    |
| `npm run preview`      | Local preview of the production bundle        |
| `npm run lint`         | ESLint checks                                 |
| `npm run format`       | Format source and documentation with Prettier |
| `npm run format:check` | Check formatting without modifying files      |
| `npm test`             | Run unit and component tests once             |
| `npm run test:watch`   | Watch unit and component tests                |
| `npm run test:e2e`     | Playwright browser tests                      |

Build output is written to `dist/` and is ignored by Git. Do not commit `node_modules/`, browser binaries, test reports, audio collections, or generated artifacts. `package-lock.json` is committed for reproducible dependency installation.

## Browser tests

Install Chromium before the first Playwright run:

```bash
npx playwright install chromium
npm run test:e2e
```

Linux systems may also need `npx playwright install --with-deps chromium`. The Playwright configuration starts a local Vite server automatically unless one is already available. `CHROMIUM_EXECUTABLE_PATH` can point to a compatible preinstalled Chromium binary in constrained environments.

Browser tests generate small WAV files in memory. They do not download or commit copyrighted music. Inspect failures with the generated report or retained failure trace:

```bash
npx playwright show-report
```

## Developing with local music

1. Choose **Add your music**, or drag files onto the app.
2. Wait for the import notification.
3. Select a track to play it.
4. Search for title, artist, or album; try the grouping tabs and favorites.
5. Reload and confirm that the library is still present.
6. Create a playlist, add two songs, use song options to move one up, and reload to verify saved order.
7. Enable **Settings → Library editing**, edit metadata, choose a local JPEG/PNG/WebP cover, and save. Reload, then restore the original information.
8. Turn editing off and verify that saved values remain but the editing controls disappear.
9. Disable animations and test the system reduced-motion preference separately.
10. Remove a track and verify playlist references disappear while the original file is unchanged. Delete a playlist and verify library music remains.

Useful manual cases:

- Tagged and untagged files, Unicode names, and missing artwork.
- Duplicate imports and renamed copies.
- Corrupted media and files with unsupported codecs.
- Empty files, non-audio files, and files over 200 MB.
- Browser storage disabled or full.
- Removing the current, first, last, and only queue entries.
- Full-viewport player at 320/390/768/1024/1440 px, including opaque dark/light artwork palettes, short-height no-scroll fit, queue focus, and return to the initiating Home/bar button.
- Home counts/actions, card cover dimensions, and artist album ownership with same-named albums by different artists.
- Native 24-bit WAV import/playback, source-detail labels, and byte-for-byte Blob preservation.
- Volume persistence, mute/reload/unmute, and restoring selected order after shuffle.
- Repeat-off at the final track, repeat-one, repeat-all, and shuffle.
- Keyboard-only navigation and narrow viewports.
- Reloading after favorites change; switching origins or browser profiles.
- Dark, light, system theme, reduced motion, and the Animations switch.
- Version-1 database migration with existing audio/favorites.
- Playlist creation from song options, duplicate membership, reordering, and deleting referenced music.
- Invalid/oversized artwork, canceling edits, multiple edits then original restoration.
- Favorite and metadata changes while playing; elapsed time must not reset.

The development library belongs to the development origin. Switching between localhost and a preview URL does not share the same collection.

## Debugging

Use browser developer tools:

- **Console:** runtime failures and browser API support.
- **Application / Storage:** `wave-library` IndexedDB, `tracks`/`playlists`/`artists`/`albumOrders` stores (schema v3), and `wave-theme`, `wave-editor-enabled`, `wave-animations-enabled`, `wave-volume`, `wave-last-audible-volume`, `wave-crossfade`, `wave-mix-enabled`, `wave-auto-lyrics`, and `wave-playback-session-v1` localStorage.
- **Network:** confirm that importing and playing music does not upload files.
- **Performance:** import responsiveness and audio transitions.
- **Accessibility:** control names, focus order, and contrast.

Do not log audio contents or sensitive local filenames in production. Console and storage inspection can expose personal collection metadata; redact it before sharing a bug report.

## Troubleshooting

### Dependencies fail to install

Check the Node.js version and package registry access. Use `npm ci` with the committed lockfile. Do not delete or regenerate the lockfile merely to hide an installation error.

### The library will not open or imports stop

IndexedDB may be disabled, restricted in private mode, or out of space. Enable site storage or free space. Files committed before a failed import remain saved. Clearing Wave's site data resets the collection, favorites, playlists, and local edits, so keep the original files first.

### Editing controls are missing

Enable **Settings → Library editing**. Basic playlist naming and membership are available without it. Song editing and custom playlist artwork/descriptions are gated. Turning the setting off preserves saved values; it does not restore originals automatically.

### A custom image is rejected

Choose a readable JPEG, PNG, or WebP smaller than or equal to 5 MB and 40 million decoded pixels. SVG and remote URLs are unsupported. The picker displays a recoverable error and keeps the existing cover. Accepted images are square-cropped/resized in the browser; original image/audio files are never rewritten.

### Animations do not run

The Animations switch is on by default, but the operating system's reduced-motion preference takes precedence. Test both preferences. Do not bypass reduced motion to make a screenshot or test pass.

### A track imports but will not play

Extension recognition and metadata parsing do not imply codec support. Try a known-good WAV or MP3 file and check the browser's supported formats. Unsupported or damaged audio produces a message rather than being silently treated as playable.

### Audio quality and source details

Wave plays the original stored Blob with native browser decoding; no transcoding, EQ or normalization is added. Optional crossfade uses two native elements with equal-power volume ramps; it is disabled by default. New imports retain source codec/sample-rate/bit-depth metadata when reported. Older records can show only the filename format. Default volume is 100%; chosen level and pre-mute level are persisted. Device routing, browser/OS resampling, hardware, recording quality, and codec support still determine output. Do not claim bit-perfect audio or restoration of information already lost in a lossy file.

### Playback does not start automatically

Browsers restrict autoplay. Start playback through a user interaction. A rejected playback promise pauses the interface and prompts another attempt.

### A preview rejects its host

Keep the server bound to `0.0.0.0` and include the trusted proxy domain in Vite's allowlist. If adding a backend later, proxy it through the same origin instead of requesting browser-local `localhost`.

### Tests cannot find a browser

Install Playwright Chromium or set `CHROMIUM_EXECUTABLE_PATH`. Do not treat missing-browser failures as application test passes.

## Production deployment

```bash
npm ci
npm run lint
npm test
npm run build
```

Serve `dist/` from an HTTPS static host. No backend endpoints or secrets are required. Set appropriate cache headers for hashed assets; avoid caching `index.html` indefinitely. `vite preview` is for local verification, not a production server.

There is no service worker or PWA manifest yet. Once loaded, imported tracks play locally, but a completely offline cold start is not guaranteed.

## Persistence and motion regressions

Keep migrations conditional on `oldVersion`; test with version-1 and version-2 databases before changing the schema. Never recreate `tracks` just to add a new store. Library-track deletion and playlist pruning belong in one transaction. Favorite and metadata writes must read the latest record; do not replace a record with stale component props. Preserve the in-memory Blob when merging metadata so the audio effect does not reload its source.

Use `src/ui/motion.ts` rather than inventing animation durations in every component. Animated exits retain DOM temporarily: scope text/label assertions to the active surface, or wait for actual removal. Exiting controls must remain inert. Native modal focus restoration happens after `dialog.close()`; the compact-player opener is supplied explicitly because expanding the player makes its footer inert. Browser tests exercise that focus path.

Wait for the committed visible state before reloading in persistence tests. A click starts an asynchronous database write; reloading immediately can interrupt it. Browser fixtures and generated image files belong in ignored test output, never the production library.

## Dependency and documentation maintenance

Check `npm outdated` and `npm audit`, review changes, and run the complete check suite after updates. Do not apply breaking upgrades blindly. Keep documentation in English and update API signatures, behavior, limitations, and roadmap status as implementation changes.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for review and licensing expectations.

## Lyrics/crossfade/reordering QA

Cover LRC boundary timestamps/fractions/offsets/repeated stamps, embedded millisecond vs MPEG-frame tags, plain/missing lyrics, reload, seek/pause and native progression. Reject oversized/invalid imports without replacing saved lyrics. Validate manual photo save/remove in gallery, Home and profile; song album artwork must remain independent.

Crossfade browser tests instrument actual native Audio constructors: two simultaneously unpaused elements, nonzero complementary gains, incoming identity before outgoing end, and pause stopping both. Engine tests also cover rejection/cancellation, outgoing-event isolation, mute, source URL cleanup, and guarded queue changes. Test repeat-one, single-entry repeat, manual skip, seek, removal and background/mobile restrictions separately; a mocked play promise is not evidence of real overlap.

Reorder full album/playlist memberships using pointer handles, buttons and keyboard; validate independent reload persistence, filtered browsing, current-queue preservation, 320 px fit and concurrent collection changes. Album orders must never include a different artist's homonymous album.

## Automatic-lyrics and immediate-storage QA

Playwright intercepts LRCLIB with realistic contract responses; the suite does not depend on live provider availability. Verify synchronized/plain matches, wrong title/artist/duration, 404 album fallback, instrumentation versus errors, response-size limits, timeout/abort, cache TTLs, local/embedded precedence, stale metadata and deleted-track rejection. Test opt-out across reload, deliberate retry, provider attribution, quick offsets and saved lyrics without another request. A production-browser smoke test against live LRCLIB is still required to validate current CORS/service availability; a fixture is not proof of provider coverage.

Import a tagged file without playing it, reload, and compare stored Blob hashes to the original. Import a renamed/redated byte copy and assert a single track/audio record. Keep legacy IDs and playlists stable when lazily recording a content hash. Check storage-write failure without corrupting previous successful imports, persistence grant/denial/unsupported cases, original-quality audio, compact cover output and raw-only lyric records. Native browser storage usage may differ from library estimates.

Crossfade QA also checks opacity-only cover overlap and absence of transition meters/banners, equal-power quarter-point gains, completion/cancellation cleanup, sum of squared gains, mute and system reduced-motion behavior. New card, lyric and navigation movement must respect both motion preferences.

## Text fill and compact-layout QA

Test line-fill start/midpoint/end, positive/negative offsets, final native duration, unknown duration, plain text, Unicode/whitespace preservation, wrapped text, seek reset and pause stability. Check the actual glyph-clipped gradients and assert no lyric progress bar. Enhanced LRC uses supplied word stamps; ordinary LRC follows line timing, not fabricated word timing. Keep its temporal feedback under reduced motion while disabling spatial/decorative movement.

Keyboard tests after an editor closes must wait for the actual native dialog element to detach, not just its accessibility role to disappear: an inert exiting dialog still holds the native modal layer and can prevent focus reaching the full player.

Validate 64 px collapsed-player geometry, explicit full-screen opening and focus return, Home collection/daily-mix controls without a duplicated session, desktop sidebar navigation, light/dark themes and no document overflow at 320/390/768/1024/1440 px. Keep stored music and existing queue/playback semantics intact.

## Three-platform update

Home is the initial web page; Settings is now a full page, not a dialog. Lyrics starts open in a collapsible section each time Now Playing expands or the song changes. Redundant source/playback status text is removed. The original curved W mark replaces generic waveform bars. Online automatic lyrics is optional/off initially, while manual one-song lookup remains available. Exact/search requests validate artist/title/duration, identify the client, and honor provider cooldowns; availability cannot be guaranteed. Crossfade uses incoming media time and equal-power gains, not elapsed wall time. Duplicate cleanup merges only confirmed byte-identical records, preserving references; same-name groups are reviewed non-destructively.

Separate native Android (Kotlin/Compose) and Windows (C#/WPF) source implementations exist; prior web-only scope statements apply to the web architecture, not the entire project. They are early, uncompiled in this workspace and lack full web parity. [PLATFORMS](PLATFORMS.md) is the authoritative build/status matrix. [Privacy](../PRIVACY.md) describes data flows, rights and unresolved public-release obligations.

## Listening-stage and restoration QA

Check viewport bounds **and actual lyric visibility/hit targets**, not only hidden overflow: 1440×900, 1024×768, 768×700, 390×844, 320×568 and 844×390. Cover enhanced LRC, plain/missing lyrics and long metadata/lines. Validate word-start/mid/end, repeated stamps, offsets, malformed word timing, provider timelines beyond recording duration and decoded-duration cache reconciliation.

Restore a nonzero native position after reload and delayed IndexedDB hydration with queue/order/shuffle/repeat intact and no autoplay. Test deleted references, selected-track removal, invalid/blocked localStorage and lifecycle saves.

For inactivity, settle actual native playback before advancing test time. Verify entry after 30 seconds, no focusable controls in cinema, and mouse/touch/keyboard wake to the previous compact/expanded view without a play/seek/source change. Editing dialogs, buffering and hidden tabs must block entry. Metadata artist/album actions must not activate the surrounding play row.

## Palette/reader redesign QA

Verify the actual native View Transition keyframes (bottom-centered circular reveal), not only a palette variable. Disabled/reduced motion and unsupported browsers must remain usable without animation. Check Light accents against white text across multiple artwork hues, plus dark text on tonal surfaces.

Keep the complete normal lyric document accessible in an internal reader, with blurred context and unblurred focus/hover. In cinema, verify current text has no line clamp or hidden ending, and missing lyrics show only centered music metadata. Check focused-tab gating with controlled focus signals; headless focus emulation is not a physical OS-switch test. Verify local generated playlist icons mix member colors consistently while explicit covers retain precedence.

## Discovery and filename regression checks

Search is intentionally absent from Home/Settings. Open the dedicated Search destination (or Ctrl/⌘ K), verify word-order/accent matching across categories, and confirm that artist/album/playlist actions navigate correctly. Library has no repeated filter. Playlist/album order remains a complete-collection operation, not global search.

Use RIFF INFO fixtures with the declared Latin-1 metadata encoding for accented browser-test names. Valid embedded tags must win over contradictory filenames; untagged two-part spaced-dash files can infer title/artist, but ambiguous filenames must not be guessed. Never modify source audio to test metadata inference.

After editing a module while Vite is serving, a write/transform race can leave a stale empty development transform. If fresh pages report a missing export despite a successful production build, restart the development server before the final complete browser run. Do not edit application sources during that run. Inactivity tests must wait for native playback to leave buffering before advancing the mocked 30-second clock; decoder readiness does not follow the mock timer.

## Expressive playback QA

Check the compact artist/cover/title actions separately from expanded metadata navigation. The large cover must toggle playback without changing selection; pause restores base tones and stops background motion. For visual-energy tests, use a generated waveform with silent and louder sections and seek the real decoder: CSS keyframes alone do not establish audio responsiveness. Check mute, app animation opt-out, native reduced-motion changes without reload, and large/unsupported visual-analysis fallback. The audio bytes and native output graph must stay unchanged.

Lyric tests mock exact 400/422 rejection, missing duration, service throttling with absent/inaccessible Retry-After, manual interrupted-import recovery, replaced request generations and local/embedded precedence. Live provider availability is not established. Do not bypass provider cooldowns to make retry tests pass; use controlled network errors for immediate manual retries and a separate persisted-throttle test.

## Stage clipping and network-recovery QA

`tests/player-stage.spec.ts` checks a 320–2560 px width matrix, including 700×360 and 1440×600, across empty/near-zero/mid/near-end progress. Assert actual SVG width/path coverage, an in-bounds thumb, square artwork, SVG-in-button bounds and Home/End/arrow seeking. Test a moving path and a flattened paused path separately; reduced motion may leave a static wavy shape while playing.

Do not count invisible native-details descendants as visible hit targets. Closed timing controls are explicitly removed from layout; opening the adjustment retains editing, ±100 ms persistence and idle protection. Keep the 30-second stage disabled while the timing editor is open.

The real-audio tests require `data-music-analysis="live"` and a perceptible computed light opacity, then verify that native time advances without source/volume changes and that pause releases live analysis. A separate unsupported-capture test requires the envelope fallback and mute/unmute response. Source fixtures are generated waveforms, not licensed music.

For lyric recovery, abort the headered request and inspect the next request: same URL, no custom preflight header, no credentials or audio payload. Reload must reuse the saved verified result without a new request. Keep separate tests for HTTP throttles and recording mismatches. Mock success does not demonstrate live service availability. The browser and command-line live checks in this restricted workspace both failed to connect to LRCLIB; neither establishes a provider outage or a CORS misconfiguration.

## Spectral, queue and native-command regression checks

Use a generated multi-section 100/1000/6000 Hz source at a sufficient sample rate to verify **actual** bass/body/air dominance after native seeks. Check independent transform changes and the absence of glow/filter styles. A fake band variable or a single RMS test cannot establish spectral behavior; frequency bands are still not vocal isolation.

Check compact seek visibility and hit behavior at 320/390/768/1440 px without opening the full player. Queue must fit desktop, phone and short landscape, preserve the current source/position on same-row selection and retain add/remove/restore semantics.

Test conflicting exact album responses before a matching deluxe search candidate, plain-only fallback for compilation conflicts and rejection of performance-album conflicts. Keep live-provider claims separate from mocks. Resolve/reject old native play promises after newer commands in unit tests; they must not pause or clear newer operations.

In cinema, assert computed visibility of the underlying normal view as well as ARIA/inert state. Inspect an actual 30-second native-timer entry, not just mocked timer assertions. Install a mocked clock before arming the idle timer, or generate activity afterward; preexisting native timers are not reliable fake-clock fixtures. Verify full active text, wake, timing reset and failed-write recovery. Privacy background roles must match Wave and update from another tab's appearance preference changes, without accessing media or changing legal content.

## Illumination, queue and mixing QA

Use owned low/mid/high tones to verify radial lights rather than wave silhouettes, independent band motion and all motion/mute/pause/focus guards. Keep the wavy seek separate from background rendering. Enter absence with native and controlled timers; check computed visibility of the workspace, navigation, compact player and every normal-stage control, then wake without changing native source/time.

Queue QA covers drag handles, arrow buttons, Alt-arrow moves, selected identity/time, announcements, narrow/short viewports and reload restoration. Context-menu QA covers actual right-click, Shift-F10, enabled-item arrow/Home/End navigation, Escape/Tab, focus restoration, edge/resize placement during entrance, dismissal, action execution and preservation of native editable/selection/Shift-right-click behavior.

Mix QA uses actual native decoders and owned silence-padded files to verify safe cue offsets, original lyric clock, complementary gains, no byte changes, stage color interpolation and completion/pause cleanup. Keep classic crossfade switch and saved preference checks. Unit tests cover staged curve continuity, conservative bounds, missing/short/silent analysis, no periodic-sample aliasing, shortest hue arcs, stale palettes, outgoing origin fallback, motion opt-out and final palette persistence. Do not claim tempo/beat matching or isolated stems.

## Automatic listening and import QA

Mix now has one switch and no duration slider. Test fresh on / migrated disabled preferences, pair-specific windows, cue offsets, native overlap, mute/pause/manual changes, unavailable preload and motion opt-out. Older standard-playback regression fixtures explicitly disable Mix and Autoplay; separate feature checks verify their fresh defaults and actual native behavior.

Inspect imports with absent/invalid text, multi-artist credits, front/back/corrupt pictures and year/genre. Verify a same-origin worker parses large phone imports, fallback behavior retains tags and original-byte hashes remain unchanged. Set a legacy metadata-consent flag to true and assert zero catalogue/cover requests on import/reload. Previously completed metadata must remain saved; local review must ignore old suggestions and derive current completeness. Automatic lyrics consent is tested separately.

Test Autoplay from a one-song Search queue into a larger local library, with Mix both on/off; check native ended progression, repeat priority, no immediate current-track duplicates and the no-alternative fallback. Pattern unit tests use deterministic weighted sampling, not a remote recommendation service.

Use a 150-track owned fixture at 320 px to exercise off-thread import, plain large-collection rows, viewport containment, eight-row metadata paging and reduced motion. No DOM virtualization or device-level benchmark is claimed. Root position updates are bounded near 10 Hz; lyric native clocks and mix gain timing remain independent.

Settings tests must navigate through the relevant menu, not query unmounted controls. Check all six sections, Back/focus return, persisted independent switches and both themes. Mobile regression fixtures include 400–500 character unbroken title/artist/album fields and 100-character playlist names. Check actual element bounds, not only document width: ellipsis/clamps are intentional but buttons and containers must stay inside the viewport. Verify the empty player is hidden, all library categories remain reachable and last rows scroll clear of the fixed dock. Keep native audio progression tests alongside layout tests.

### Candidate regression checks

Run `release-010.spec.ts` for offline daily genre groups and native queue coherence, explicit unplayed-song lyric preview/save, failure/cooldown/manual-draft preservation, and larger text on a 320 px viewport. Unit checks additionally cover deterministic day changes, input immutability, sparse libraries, worker timeouts/recovery and shared cooldown/oversized-body cancellation. Live lyric provider coverage and native builds require separate validation. The editor regressions also verify that dialog padding cannot discard a draft and that Close/Cancel/Remove/Save remain visible while the body scrolls at 320×360 with larger text.

## Merge-time 0.1.0 publication

The candidate stays in a draft pull request until merge is explicitly requested. Keep its description to Highlights; detailed QA belongs in this document and `VALIDATION.md`.

When proceeding with the approved merge:

1. Require successful web and native checks on the latest PR revision and review the remaining device/runtime limitations.
2. Merge PR #1 using its explicit number. Do not create a release from an unmerged candidate SHA.
3. Read the actual merge commit from the merged PR, create the annotated `v0.1.0` tag at that commit, and push that tag.
4. Create the GitHub Release for `v0.1.0` using the reviewed `RELEASE_NOTES_0.1.0.md`. Verify that the tag and release point to the merged revision.
5. Native debug/unsigned CI artifacts are test builds, not signed installers. Do not silently relabel or attach them as production-ready packages.

Tagging, publishing and deployment are not part of preparing or updating the draft PR. Successful compilation does not establish Android/Windows UI or playback parity with the web client.
