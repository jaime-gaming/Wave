# Wave platforms · 0.2.2

**Release 0.2.2, prepared 16 November 2026.** Wave has three independent implementations, not WebView/Electron wrappers. The web client is the most complete; Windows 11 follows its structure with native C#/WPF controls, while Android uses Kotlin/Compose. Libraries are separate and never synchronized or silently migrated.

| Capability                          | Web                                                          | Windows 11                                                        | Android                                                         |
| ----------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Home, local library, favorites      | Yes, with borderless sticky section-heading handoff          | Yes, with borderless sticky section-heading handoff               | Yes, with borderless sticky section-heading handoff             |
| Dedicated Search                    | Ranked, five kinds, recent searches                          | Ranked, with artists/albums/playlists found first                 | Ranked, five kinds, recent searches                             |
| Albums/artists                      | Profiles and artwork                                         | Native group/details views                                        | Group/details views                                             |
| Daily mixes (7–20 tracks, max 3)    | Complete-only, day-locked covers, artist spacing, mood group | Complete-only, day-locked covers, artist spacing, mood group      | Complete-only, day-locked covers, artist spacing, mood group    |
| Remix recaps                        | Weekly, Monthly & Yearly (366-day history)                   | Weekly, Monthly & Yearly (366-day history)                        | Weekly, Monthly & Yearly (366-day history)                      |
| Ordered playlists                   | Yes                                                          | Create/edit/membership/order                                      | Create/edit/membership/order                                    |
| Queue editing                       | Drag/buttons/keyboard                                        | Native queue dialog; move/remove                                  | Queue sheet; move/remove                                        |
| Restored paused position            | Yes, plus opt-in Resume on reload                            | Yes                                                               | Yes                                                             |
| Automatic Mix & local Mood Autoplay | Harmonic Camelot key + 3-band EQ Mix + 100% local Mood       | Bounded blend + 100% local Mood Autoplay                          | Dual-`MediaPlayer` blend + 100% local Mood Autoplay             |
| Fix Volume (BS.1770 LUFS)           | Yes, local worker with soft-knee limiter                     | Not yet                                                           | Not yet                                                         |
| Lyrics                              | Enhanced LRC, fill, optional lookup                          | Line LRC/fill, sung line scrolled into view                       | Line LRC, word stamps, optional lookup                          |
| Settings                            | Seven menus                                                  | Six menus (incl. Storage link/copy & watched folders)             | Six menus                                                       |
| Appearance & Motion                 | Dark/light/system, language, larger text, Bezier Shuffle     | Dark/light, language, larger text, motion, Bezier Shuffle         | Dark/light/system, language, Compose Canvas Bezier Shuffle      |
| Interface language                  | Yes, Spanish and English                                     | Yes, Spanish and English                                          | Yes, Spanish and English                                        |
| Cover editing                       | Song/playlist/artist                                         | Song covers                                                       | Embedded artwork only                                           |
| Screen Wake Lock while playing      | Wake Lock API                                                | `SetThreadExecutionState`                                         | `keepScreenOn`                                                  |
| System media controls               | Media Session API                                            | Not yet                                                           | Media session, focus, Material 3 art widget, tile, shortcuts    |
| YouTube search, songs & video clips | Yes, with offline badges & guardrails                        | Not yet                                                           | Not yet                                                         |
| Device linking (Settings → Devices) | Yes, by QR, link or pasted code                              | Not yet; the web client pairs on these devices                    | Not yet; the web client pairs on these devices                  |
| Whole-folder import                 | Yes; remembered where the browser allows                     | Yes; linked in-place by default + watched-folder rescanning       | Yes; document tree, any depth + MediaStore (`GENRE` on API 30+) |
| Playlist migration (.m3u/.csv/text) | Yes                                                          | Not yet                                                           | Not yet                                                         |
| Crash-proof atomic storage          | IndexedDB + quota protection                                 | Lock-protected atomic JSON + rolling `.bak` / `.corrupt` recovery | Atomic JSON + resilient batched imports + `optString` parsing   |
| Hosted build checks                 | Passed                                                       | Contracts + WPF layout smoke in CI                                | Unit/lint/debug build in CI                                     |

The rows marked "Not yet" are the honest remainder: they need an embedded player inside WPF and an Android
WebView, or a signed release asset, and none of them is started. Device linking is the one row that is half
done rather than not started — the whole of it exists in the web client, and a phone or a desktop reached
through that client pairs like any other device; what the installed builds lack is the transport inside
them. Everything above those rows exists on all three platforms; where the wording differs, it is the
platform's own control for the same job, not a missing feature.

## Browser and Cloudflare

The published web client is **https://wave.jaime-gaming.com**, served by **Cloudflare** as a Worker with static assets and a bounded public-metadata endpoint: `wrangler.jsonc` points the `wave` Worker at `dist` with the single-page fallback (`not_found_handling`), and the production build runs `npm run build` followed by `npx wrangler deploy`. Use Node.js 22.12+ or 24 and `npm ci && npm run dev`. Production by hand: `npm run build`. For a repository path, use `WAVE_BASE_PATH=/Wave/ npm run build` and serve it below `/Wave/`.

Cloudflare builds the repository itself: **Build command** `npm run build`, **Build output directory** `dist`, Node 22 or newer, deploy `npx wrangler deploy`. The SPA fallback is `not_found_handling: "single-page-application"` in `wrangler.jsonc`, and on the Worker it cannot be anything else: wrangler reads `_redirects` from the build output whatever the configuration says, and Cloudflare's asset validator rejects the classic `/*` → `/index.html` rule unconditionally (error 100324 — the rewrite target is normalised back to `/`, which triggers the rule again; even `html_handling: "none"` does not lift the block). `public/_redirects` is therefore gone; Worker preview deployments use the same asset and API configuration. The custom domain is set once in the Cloudflare dashboard; there is no `CNAME` file to commit, because Cloudflare owns the record.

One file in `public/` carries the hosting rules and is copied into the build:

- `_headers` — `nosniff`, `no-referrer`, a camera-only `Permissions-Policy`, `SAMEORIGIN` framing, a year of immutable caching for the hashed `assets/`, and revalidation for `index.html` and `sw.js` so a new release is actually picked up.

The website is deployed only through Cloudflare Workers, not GitHub Pages. The repository's `docs/` directory now contains documentation and screenshots, not a second compiled app. Build output stays in ignored `dist/`.

The Worker entry is `src/worker/index.ts`. Static assets use the `ASSETS` binding and the SPA fallback. Only `/api/*` routes run the Worker first: `POST /api/import-playlist` reads bounded public Spotify/YouTube metadata after the user asks, and `/api/youtube-meta`, `/api/youtube-playlist` and `/api/youtube-search` fetch bounded public YouTube metadata with zero CORS failures — never audio or accounts. Public lists may be partial; review locally before saving. No database or credentials are required. `npm run dev` includes these endpoints for local development; `npm run build && npm run dev:worker` tests the actual Worker runtime. `npm run deploy:check` bundles it without publishing. `npx wrangler deploy` publishes and is an explicit operator action, not a release/tag side effect.

## Windows

For development you need Windows and the .NET 10 SDK. To _use_ it you need neither: the release deliverable is a single signed self-contained **`Wave.exe`**. Download it and open it directly — no ZIP, no loose DLLs, no installer, no elevation.

```powershell
dotnet run --project platforms/windows/Wave.Contracts.Tests -c Release
dotnet build platforms/windows/Wave.Windows -c Release
dotnet run --project platforms/windows/Wave.Windows
dotnet publish platforms/windows/Wave.Windows -c Release -r win-x64 --self-contained true -o artifacts/windows
```

The native app uses WPF, Windows MediaPlayer and standard file/folder pickers. Imported files and folders link in-place by default without copying to `%LOCALAPPDATA%/Wave/audio` (resolving Issue #14); **Settings → Storage** adds an opt-in copy mode, a custom storage folder chooser, remembered watched folders with one-click rescanning, and safe removal that never deletes original user files. Library, playlists, preferences, the last session and the 366-day listening history (`history.json`) use lock-protected, atomically replaced JSON files with rolling `.bak` backups and automatic `.corrupt` quarantine on recovery. File paths are URI-escaped via `SafeFileUri`, `PrepareNext` guards against missing files, and `NativeMood` powers 100% local mood-aware AutoPlay when a queue ends. The sidebar carries a **Remix** page with **Weekly, Monthly and Yearly** recaps and playable/saveable playlists. Daily Mixes require 7–20 tracks (max 3), withhold display during active imports, lock distinct covers per calendar day and group untagged libraries by mood. Home features a borderless sticky section-heading handoff (`StickySectionDock`), and the Shuffle button animates its crossed cubic Bezier ribbons into parallel lines and back.

Home has collection shortcuts, daily mixes and album cards; the listening recap lives on Remix, not on a separate shelf. Search is its own destination; title/cover play, artist/album open their collections, and compact-player information opens Now Playing. A search also names the artists, albums and playlists whose names match, above the songs, each of them a row that opens its collection — the site's grouping, reached without leaving the page. Playlists can be created, renamed, populated, ordered and deleted without deleting audio. Queue edits preserve the active recording. Restored sessions remain paused. Settings separates Appearance, Playback, Lyrics, Library, Storage and About.

CI runs a dependency-free contract runner, compiles/publishes the application and executes an isolated WPF smoke mode that exercises Home, Search, daily mixes, saved playlists, Remix, six Settings sections and narrow light-theme layout. It captures PNGs in `wave-windows-ui-smoke`, and a push publishes them as `docs/media/windows-*.png`; this is not a physical-device or codec/playback matrix. The fixture library is temporary and does not touch a real user library.

Metadata reading remains limited to ID3/WAV. New MP3 imports can extract bounded ID3 APIC JPEG/PNG artwork; folder images named cover, folder or front are used when embedded art is unavailable, including for older linked tracks. Other embedded formats, the site's search kind tabs and recent searches, artist photos, album ordering, word-stamped LRC, waveform analysis and system media integration are not complete. YouTube songs, video clips and device linking are web-only, as they are on the phone: the pairing
exchange is specified in [`PAIRING.md`](PAIRING.md) so that a native client can implement the same
one instead of a second, incompatible one. OS codecs govern playback. Do not call this complete web parity.

See [WINDOWS_RELEASE](WINDOWS_RELEASE.md) for single-file packaging, Authenticode signing and Defender scanning. Upstream notices live in the repository (`THIRD_PARTY_NOTICES.md` and `platforms/windows/`) rather than cluttering the user's download folder beside `Wave.exe`.

## iOS

A SwiftUI app for iPhone and iPad now lives in [`platforms/ios`](../platforms/ios/README.md). It
deploys to iOS 17, compiles against the iOS 26 SDK in Xcode 26, opens with `Wave.xcodeproj` and
builds for the simulator without a signing team. It is **source-only for now**: no signing identity,
no `.ipa` in the Release assets and no App Store
upload. Safari's **Add to Home Screen** remains the installed web option.

The native client imports local audio and LRC files, reads tags and embedded artwork with
AVFoundation, and keeps the library, playlists and 366-day history in atomically written JSON.
Home, Library, Search, a queue, Now Playing, favorites, shuffle, repeat and local AutoPlay are
SwiftUI screens. Playback uses two `AVAudioPlayer` decks. `WaveMix` places instrumental endings
and beginnings on a downbeat of each song's own grid when optional tempo tags and LRC timings are
available, bounded so the pulses cannot drift; otherwise it uses a short constant-power crossfade.
Nothing is time-stretched, and no audio file is rewritten. Mix detects whether the outgoing
tail fades to zero or rings like an echo; the latter is cut at 75 % of the fade before it reaches
zero. The `Native builds` workflow also publishes real iOS screenshots from the running SwiftUI
app on a simulator, alongside the Android and Windows captures; it publishes no distribution build.

An `AVAudioSession` with the `audio` background mode keeps music playing with the screen off.
`MPNowPlayingInfoCenter` and `MPRemoteCommandCenter` publish artwork, title, artist, album and the
playback clock to the lock screen, Control Center, headphones and CarPlay, and accept Play, Pause,
Previous, Next and seek there. Automatic `lite`, `balanced` and `full` profiles reduce decorative
motion and list/analysis budgets on modest devices without adding a visible Settings control.
`npm run build:i18n` generates `Wave/es.lproj/Localizable.strings` from the same `i18n/es.json` as
the other clients. No `URLSession`, account, analytics or online lookup exists in this target.

System presence follows Android's idea, with iOS frameworks: WidgetKit home/lock-screen widgets,
ActivityKit Live Activities with Dynamic Island and a `.small` CarPlay/watch family, App Intents
and `AppShortcutsProvider` for Siri, Shortcuts, Spotlight and the Action button, an iOS 18
`ControlWidget`, background audio, Now Playing, interruption and headset-route handling,
CarPlay remote commands, Handoff with `NSUserActivity`, `wave://` deep links and the system Share
sheet. `WaveSystemCenter` joins those surfaces to the same `WaveState`; the widget extension is
source-only and unsigned, with no entitlements or capability file.

**Liquid Glass is iOS-only.** `Wave/App/Views/LiquidGlass.swift` uses the real SwiftUI
`GlassEffectContainer` and `.glassEffect(.regular, in:)` behind `#available(iOS 26, *)`, keeps a
`.ultraThinMaterial` fallback for iOS 17–25, respects Reduce Transparency, groups controls so glass
never samples glass, and applies `.buttonStyle(.glass)` to grouped buttons. Web CSS, Android and
Windows are deliberately untouched. `WaveLayout` fills the whole safe width from 320 points to 4K,
`WaveRecap` builds Weekly/Monthly/Yearly Remix from local history, and `ImmersiveIdleView` replaces
the controls after thirty quiet seconds; all three live in the pure `WaveCore` package or the iOS
app, never in another client.

The logical core is also a dependency-free Swift package, so its LRC, search, library, Mix and
performance contracts run as XCTest on a Mac without a simulator:

```sh
swift test --package-path platforms/ios
xcodebuild -project platforms/ios/Wave.xcodeproj \
  -scheme Wave \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/WaveDerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

The `ios` job in `.github/workflows/ci.yml` selects Xcode 26 on `macos-26`, then runs those
commands plus `node --test scripts/ios-release.test.mjs`. It neither signs nor publishes an app.
Daily Mixes, video clips, YouTube songs, device linking, online metadata and waveform/beat analysis
are not in this client, and a real-device playback/accessibility/performance pass is still required
before any signed distribution. See the [iOS README](../platforms/ios/README.md) for the complete
build and scope notes.

## Android

Requirements: JDK 17, SDK/build tools 36, Gradle 8.13 and Android Studio supporting AGP 8.13. Minimum API 26. Open `platforms/android`, let the IDE create local SDK configuration, then:

```sh
gradle -p platforms/android testDebugUnitTest lintDebug assembleRelease
```

Output: a single signed **`Wave.apk`** verified via `apksigner verify` in CI (using the repository keystore when `ANDROID_KEYSTORE_BASE64` is configured, or a generated 4096-bit PKCS12 signing key for branch-only test builds; tagged releases require the persistent keystore). The pinned Ubuntu CI runner provides the SDK and runs unit tests, lint, Compose screenshot verification and release APK signing. Tests cover the LRC, search, mix and listening contracts.

The web client does not promote Android on Home and no longer opens an automatic download sheet. Settings → About keeps quiet **Wave for Android** and **Wave for Windows** links; `ANDROID_APP_URL` points to Releases.

The current source smooths tab indicator/tint changes, reduces button spring overshoot, reveals decoded artwork briefly, raises inactive lyric contrast and eases line focus. Lyric auto-follow pauses around a manual drag; the Now Playing slider previews position locally and performs one seek when released instead of repeated decoder seeks during the gesture. These are native-source changes, not a claim of device-verified performance or fresh Android screenshots. Compose animations follow the system animator duration scale.

Android reads embedded artwork off the main thread and can also use MediaStore album artwork when available. The phone build is native, but its visual target is the mobile website rather than a different phone design. Its inset page, four-item dock, header actions, Home shortcuts, daily mixes, Remix and player have been brought closer to the web. `ui/Theme.kt` contains the palette and type; `ui/WaveChrome.kt` and `ui/WaveIcons.kt` contain the shared shell and the same line-art icons; `ui/Screens.kt` contains the pages; and `ui/WaveState.kt` connects them to the native library and player. Pickers, notifications and media-session controls remain Android features. Search carries the site's five kind tabs — All, Songs, Artists, Albums, Playlists — the artists, albums and playlists it finds, each opening its own collection, and the phrases searched lately, kept between launches and clearable in one tap. Both natives lay themselves out for the window they are in rather than for one reference size: the phone's Now Playing is two panes from 600 dp and one column below it, and the Windows rail turns into a column of icons under a thousand pixels of width. The icons are the web's own drawings: `WaveIcons.kt` and `App.xaml` carry the path data `Glyphs.tsx` produces, so the three clients draw one hand. This is not yet a claim of pixel-identical parity or a substitute for a device pass: YouTube songs, clip playback, device linking (and the Devices section of Settings that holds it) and the web's interpolated lyric fill are still web-only. Android highlights explicit enhanced-LRC word timestamps and falls back to synchronized lines when only line timings are available.

Playback is `PlaybackService`, a media playback foreground service holding a `MediaSessionCompat`. That one thing is what puts the song on the lock screen, in the shade and in a car, what lets a headset pause it, and what survives the screen going off. The session also holds audio focus: a call or a navigation prompt pauses the music and, unless the listener paused it themselves, it comes back afterwards. Headphones out stops playback. Rotation and theme changes do not restart anything, because the activity declares the configuration changes it handles.

Two `MediaPlayer`s, never one: the spare is armed with the next song in silence while the current one plays, which is what makes a Mix blend possible on a phone. The handover uses the same staged, constant-power gains and the same twelve-to-twenty-four-second window as the web build, and nothing about the audio is altered — the blend is two files playing at once at changing levels. The window is placed on the seconds rather than on the bar, because the phone does no beat analysis.

The library is `Library.kt` over three atomically written JSON files (`library.json`, `playlists.json` and 366-day `history.json`) with resilient `optString` deserialization so a single malformed entry never breaks loading. Import takes three explicit routes — the document picker (batched single-save imports with safe copy fallback and rollback), `MediaStore` for music the system already indexes without copying a byte (reading `MediaStore.Audio.Media.GENRE` on Android 11+), and a `SecurityException`-safe document tree walked at any depth. `Player.kt` validates `content://` URIs via `AssetFileDescriptor`, guards `MediaPlayer` teardown races in `step()`, and triggers 100% local mood-aware AutoPlay (`pickAutoplayNext`) when a queue ends. Daily Mixes require 7–20 tracks (max 3), withhold display during active imports, lock covers per calendar day and group untagged libraries by mood; Remix supports **Weekly, Monthly and Yearly** recaps; `HomeScreen` docks the active section heading cleanly at the top while scrolling; and `WaveShuffleIcon` draws a smooth Compose `Canvas` cubic Bezier uncross-to-parallel animation.

System presence: a resizable Material 3 home-screen widget with rounded embedded album artwork and live Previous / Play-Pause / Next controls, a quick-settings tile, app shortcuts for Search, Remix and Favourites, screen wake lock (`keepScreenOn`) during playback, and a predictive-back callback that closes the open thing before it leaves. All of it is declared in `AndroidManifest.xml`; the widget, the tile and the shortcut list are invisible to a build that forgets them, so check the manifest when a system surface "disappears".

The phone screens in `docs/media/android-*.png` are rendered by `ScreenshotTest` from the real `WaveApp` on the Robolectric graphics stack, and published by the same CI job.

## Publication gates

Run checks at the latest revision, perform real target-device playback/accessibility/DPI checks, state the reduced native scope, review exact runtime notices and sign using credentials kept outside the repository. At the approved merge, tag its actual merged commit with the approved release version and create the GitHub Release. Never include signing keys or personal music. [Privacy](../PRIVACY.md) and existing rights restrictions remain applicable.

### Lyric-service traffic

LRCLIB is the primary online lyric provider on all clients; the web also offers opt-in NetEase and Kugou word-timing sources. Web requests use a shared 500 ms queue, same-origin Web Locks when supported, concurrent lookup sharing and safelisted headers. Native Windows serializes requests per client with bounded cancellation; Android retains its synchronized queue. Both native clients space request starts by 500 ms. Windows accepts short numeric and HTTP-date retry deadlines; Android preserves deadlines longer than one day. None of these measures removes provider-side/IP limits. Native retry-deadline contracts have been added; the latest local web validation does not certify a new native build.

## Native interaction refinement — 0.2.1

- Android: `LocalMotionChoice` persists the app animation preference and combines it with the platform animator setting. Page direction follows destination order; press, navigation, progress and lyric-following motion use that preference. `WaveActionButton` keeps feedback on the glyph with 48 dp targets. Favorite and upcoming-queue shuffle use it; shuffle no longer restarts the recording. The full player exposes reactive volume/mute, retaining the pre-mute level. A separate focus multiplier preserves volume through ducking and focus recovery. The wide record column can scroll instead of clipping its controls on short displays.
- Windows: `Motion.IconAction` animates only the glyph and uses non-accumulating, bounded keyframes; OS/app motion preferences gate it. Repeat, shuffle, favorite and volume respond locally. Dock/full-player sound controls synchronize without recursive feedback, and mute restores the previous level. Native directional page/Settings motion replaces whole-list flashes on same-page updates. Icon controls expose keyboard focus and localized sound/repeat/favorite names.
- New Android player control tests and extended Windows UI smoke checks are committed for native CI. They are not a claim of a local native build: this workspace lacks both SDKs. Clip and Fix volume processing remain web capabilities, not newly advertised native controls.

Candidate native CI (`6e57af4`) completed successfully for Android and Windows after correcting screenshot publication from detached checkouts. This verifies the automated native build/test/package steps, not manual headphone/device/signing checks. That run was for 0.2.1; check the latest 0.2.2 native CI and device results before launch.

## Native updates

Both apps make an advisory HTTPS request to GitHub's latest-release API on launch (no more than once a day after a successful check) and may remind you about a newer stable version after a successful daily check. No download or install occurs without the user. The Android package must have the same application ID and signing key to update in place; otherwise Android refuses it. The Windows executable is portable: close Wave and replace the existing executable rather than keeping duplicate copies. User data is stored separately. Published test/unsigned packages may not be suitable as upgrades; check release notes and keep a backup. Offline or failed checks do not block playback.

### Daily Mix loading and sleep timers

While a mix is being prepared, web, Android and Windows show one quiet loading card. The visual motion follows the app and system animation preferences. Windows Playback settings offer a session-only sleep timer (15, 30 or 60 minutes), alongside Android's existing timer. Both pause playback rather than altering files. Android tracks elapsed time while its app state remains alive; neither platform promises an alarm after the app is closed or the process is killed.
