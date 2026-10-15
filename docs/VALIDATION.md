# Validation record

15 October 2026 · unreleased development source.

## Web

- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm test`: **200 tests passed across 42 files**.
- `npm run test:e2e`: **89 Chromium browser tests passed** in the final complete run (7.6 minutes).
- `npm run build`: passed. Vite reports its advisory 500 KB chunk-size warning (main chunk approximately 547 KB, gzip 172 KB); this is not a build failure.
- `npm run build -- --base=/Wave/`: passed; a production static-server smoke test verified Home, Settings, fonts/assets, `/Wave/wave.svg`, the privacy page and its return link under the repository path without HTTP/page errors.
- `npm audit --omit=dev`: zero reported vulnerabilities at review time; this is not a security certification.
- `git diff --check`: passed.

Browser coverage includes paused restoration of saved queue/native position, artist/album navigation without audio restart, enhanced word stamps, no-scroll lyric/control fit, 30-second cinema/wake and real native decoder overlap, media-clock lyric fill without bars, Settings page/Back focus, fresh Home, default-off lyric lookup, persistence, playlists, artwork, album/playlist order, source-byte preservation and explicit legacy duplicate merging with reference/favorite/local-lyric preservation. Visual QA checked Home/sidebar/compact playback at 320, 390, 768, 1024 and 1440 px, both themes, and lyric fill. Additional actual Chromium screenshots/geometry checks covered enhanced, plain, missing and long lyrics/metadata plus read-only cinema at 1440×900, 1024×768, 768×700, 390×844, 320×568 and 844×390. Controls stayed within the viewport, with no outer scroll; durable tests also verify actual hit targets and lyric text visibility. The compact bar remained 64 px without document overflow.

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

## Release 0.1.0 · 16 October 2026 — playlist/mobile/Windows/media

The release date identifies the documentation set, not a completed publication. Tag/Release creation remains tied to the approved merge.

- Web: **203 unit/component tests across 43 files** passed after atomic daily-mix snapshot creation was added. The focused release suite passed **10 Chromium tests**, including unplayed mix browsing, saved order after reload and 320/390/430 px Larger text layouts. **The complete 95-test Chromium suite also passed in one 8.0-minute run.** Final unit run: 203/43 files. A compiled `/Wave/` smoke also passed: ten metadata-worker imports, three mixes, explicit editor preview/save, native lyric playback, local assets and Privacy return, without page/asset errors. ESLint, Prettier, TypeScript and root plus `/Wave/` builds passed; the existing main-chunk size advisory remains.
- Hosted [native run 38816714860](https://github.com/jaime-gaming/Wave/actions/runs/38816714860) passed Android unit/lint/debug assembly and Windows contracts, build, WPF UI smoke, publish and conditional Defender scan. Windows contracts cover playlist resolution, stable queue mutation, old disabled preferences, bounded Mix timing, persistence and genre-group rules. The smoke uses an isolated temporary library and captures Home, mix, playlist, Settings and a narrow light layout; it is not an interactive physical-device playback test.
- Visual review covered actual web screenshots and extracted promotional-video frames. The silent MP4 is 1920×1080 H.264/yuv420p, 30 fps, approximately 39 seconds, with fast-start metadata; a full decode reported no errors. It shows real web interactions with original demo assets, not native parity footage.
- The README and release notes use **0.1.0 · 16 October 2026**. Original audio storage and legal notices remain unchanged. Signed Windows publication, complete native parity, physical-device audio/accessibility checks and live provider coverage remain explicit limits. Antivirus results are a snapshot, not a zero-false-positive guarantee.
