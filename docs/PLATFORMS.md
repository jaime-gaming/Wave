# Wave platforms · 0.2.0

**Release date: 3 November 2026.** Wave has three independent implementations, not WebView/Electron wrappers. The web client is the most complete; Windows follows its structure with native C#/WPF controls, while Android uses Kotlin/Compose. Libraries are separate and never synchronized or silently migrated.

| Capability                                | Web                                      | Windows                                           | Android                                        |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Home, local library, favorites            | Yes                                      | Yes                                               | Yes                                            |
| Dedicated Search                          | Ranked, five kinds, recent searches      | Ranked, with artists/albums/playlists found first | Ranked, five kinds, recent searches            |
| Albums/artists                            | Profiles and artwork                     | Native group/details views                        | Group/details views                            |
| Browsable daily mixes and saved snapshots | Genre/artist tags                        | Genre/artist tags                                 | Genre tags, browsable                          |
| Ordered playlists                         | Yes                                      | Create/edit/membership/order                      | Create/edit/membership/order                   |
| Queue editing                             | Drag/buttons/keyboard                    | Native queue dialog; move/remove                  | Queue sheet; move/remove                       |
| Restored paused position                  | Yes                                      | Yes                                               | Yes                                            |
| Automatic Mix / local Autoplay            | Analyzed pair timing / weighted variety  | Bounded duration timing / local variety           | Two players, same staged gains, constant power |
| Lyrics                                    | Enhanced LRC, fill, optional lookup      | Line LRC/fill, sung line scrolled into view       | Line LRC, word stamps, optional lookup         |
| Settings                                  | Seven menus                              | Six menus                                         | Six menus                                      |
| Appearance                                | Dark/light/system, language, larger text | Dark/light, language, larger text, motion         | Dark/light/system, language                    |
| Interface language                        | Yes, Spanish and English                 | Yes, Spanish and English                          | Yes, Spanish and English                       |
| Cover editing                             | Song/playlist/artist                     | Song covers                                       | Embedded artwork only                          |
| System media controls                     | Browser-dependent                        | Not yet                                           | Media session, focus, widget, tile, shortcuts  |
| YouTube songs, video clips                | Yes                                      | Not yet                                           | Not yet                                        |
| Device linking (Settings → Devices)       | Yes, by QR, link or pasted code          | Not yet; the web client pairs on these devices    | Not yet; the web client pairs on these devices |
| Whole-folder import                       | Yes; remembered where the browser allows | Not yet                                           | Yes; document tree, any depth                  |
| Playlist migration (.m3u/.csv/text)       | Yes                                      | Not yet                                           | Not yet                                        |
| Hosted build checks                       | Passed                                   | Passed + contracts + WPF layout smoke             | Passed unit/lint/debug build                   |

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

The Worker entry is `src/worker/index.ts`. Static assets use the `ASSETS` binding and the SPA fallback. Only `/api/*` routes run the Worker first: `POST /api/import-playlist` reads bounded public Spotify/YouTube metadata after the user asks, never audio or accounts. Public lists may be partial; review locally before saving. No database or credentials are required. `npm run dev` includes this endpoint for local development; `npm run build && npm run dev:worker` tests the actual Worker runtime. `npm run deploy:check` bundles it without publishing. `npx wrangler deploy` publishes and is an explicit operator action, not a release/tag side effect.

## Windows

For development you need Windows and the .NET 10 SDK. To _use_ it you need neither: the published ZIP is self-contained, so it carries its own runtime. Download it, unzip it, run `Wave.Windows.exe`. No installer, no command, no elevation.

```powershell
dotnet run --project platforms/windows/Wave.Contracts.Tests -c Release
dotnet build platforms/windows/Wave.Windows -c Release
dotnet run --project platforms/windows/Wave.Windows
dotnet publish platforms/windows/Wave.Windows -c Release -r win-x64 --self-contained true -o artifacts/windows
```

The native app uses WPF, Windows MediaPlayer and standard file pickers. Originals live in `%LOCALAPPDATA%/Wave/audio`; library, playlists, preferences, the last session and the listening history (`history.json`) use atomically replaced JSON files. The sidebar carries a **Remix** page: this week's time, plays, songs and artists next to the week before, and Your Remix, the songs played most, which can be played or saved as an ordinary playlist. Clearing the history is the only action on it. Covers are separate local overrides. Existing library/preferences remain readable; the old disabled overlap preference migrates without silently enabling Mix.

Home has collection shortcuts, daily mixes and album cards; the listening recap lives on Remix, not on a separate shelf. Search is its own destination; title/cover play, artist/album open their collections, and compact-player information opens Now Playing. A search also names the artists, albums and playlists whose names match, above the songs, each of them a row that opens its collection — the site's grouping, reached without leaving the page. Playlists can be created, renamed, populated, ordered and deleted without deleting audio. Queue edits preserve the active recording. Restored sessions remain paused. Settings separates Appearance, Playback, Lyrics, Library, Storage and About.

CI runs a dependency-free contract runner, compiles/publishes the application and executes an isolated WPF smoke mode that exercises Home, Search, daily mixes, saved playlists, Remix, six Settings sections and narrow light-theme layout. It captures PNGs in `wave-windows-ui-smoke`, and a push publishes them as `docs/media/windows-*.png`; this is not a physical-device or codec/playback matrix. The fixture library is temporary and does not touch a real user library.

Metadata reading remains limited to ID3/WAV. Automatic embedded artwork extraction, the site's search kind tabs and recent searches, artist photos, album ordering, word-stamped LRC, waveform analysis and system media integration are not complete. YouTube songs, video clips and device linking are web-only, as they are on the phone: the pairing
exchange is specified in [`PAIRING.md`](PAIRING.md) so that a native client can implement the same
one instead of a second, incompatible one. OS codecs govern playback. Do not call this complete web parity.

See [WINDOWS_RELEASE](WINDOWS_RELEASE.md) for checksums, signing and Defender limits. Test ZIPs are clearly labeled unsigned. Upstream .NET license/notices remain bundled; future self-contained packages must inventory their exact runtime pack.

## iOS

Not shipped yet, and deliberately not promised for a date: the iPhone and iPad app arrives shortly
after the Android one. It will be the same interface as the mobile website, with the system pieces —
media session, lock screen, share sheet — done natively, exactly as the Android build does. Until
then, Safari's **Add to Home Screen** gives a full-screen Wave that behaves like an app.

## Android

Requirements: JDK 17, SDK/build tools 36, Gradle 8.13 and Android Studio supporting AGP 8.13. Minimum API 26. Open `platforms/android`, let the IDE create local SDK configuration, then:

```sh
gradle -p platforms/android testDebugUnitTest lintDebug assembleDebug
```

Output: `platforms/android/app/build/outputs/apk/debug/app-debug.apk`, a debug test artifact. The pinned Ubuntu CI runner provides the SDK and runs the unit tests, lint and the assembly. Tests cover the LRC, search, mix and listening contracts. Actual device import/playback, audio focus, the media session on a lock screen, the widget, the tile and signing remain gates: none of them was exercised outside a build.

The web client does not promote Android on Home and no longer opens an automatic download sheet. Settings → About keeps quiet APK/Windows download links; `ANDROID_APP_URL` points to Releases. Android is improved as a native application, not through web advertising. APKs currently remain test builds.

The current source smooths tab indicator/tint changes, reduces button spring overshoot, reveals decoded artwork briefly, raises inactive lyric contrast and eases line focus. Lyric auto-follow pauses around a manual drag; the Now Playing slider previews position locally and performs one seek when released instead of repeated decoder seeks during the gesture. These are native-source changes, not a claim of device-verified performance or fresh Android screenshots. Compose animations follow the system animator duration scale.

The phone build is native, but its visual target is the mobile website rather than a different phone design. Its inset page, four-item dock, header actions, Home shortcuts, daily mixes, Remix and player have been brought closer to the web. `ui/Theme.kt` contains the palette and type; `ui/WaveChrome.kt` and `ui/WaveIcons.kt` contain the shared shell and the same line-art icons; `ui/Screens.kt` contains the pages; and `ui/WaveState.kt` connects them to the native library and player. Pickers, notifications and media-session controls remain Android features. Search carries the site's five kind tabs — All, Songs, Artists, Albums, Playlists — the artists, albums and playlists it finds, each opening its own collection, and the phrases searched lately, kept between launches and clearable in one tap. Both natives lay themselves out for the window they are in rather than for one reference size: the phone's Now Playing is two panes from 600 dp and one column below it, and the Windows rail turns into a column of icons under a thousand pixels of width. The icons are the web's own drawings: `WaveIcons.kt` and `App.xaml` carry the path data `Glyphs.tsx` produces, so the three clients draw one hand. This is not yet a claim of pixel-identical parity or a substitute for a device pass: YouTube songs, clip playback, device linking (and the Devices section of Settings that holds it) and the web's interpolated lyric fill are still web-only. Android highlights explicit enhanced-LRC word timestamps and falls back to synchronized lines when only line timings are available.

Playback is `PlaybackService`, a media playback foreground service holding a `MediaSessionCompat`. That one thing is what puts the song on the lock screen, in the shade and in a car, what lets a headset pause it, and what survives the screen going off. The session also holds audio focus: a call or a navigation prompt pauses the music and, unless the listener paused it themselves, it comes back afterwards. Headphones out stops playback. Rotation and theme changes do not restart anything, because the activity declares the configuration changes it handles.

Two `MediaPlayer`s, never one: the spare is armed with the next song in silence while the current one plays, which is what makes a Mix blend possible on a phone. The handover uses the same staged, constant-power gains and the same twelve-to-twenty-four-second window as the web build, and nothing about the audio is altered — the blend is two files playing at once at changing levels. The window is placed on the seconds rather than on the bar, because the phone does no beat analysis.

The library is `Library.kt` over three atomically written files: `library.json`, `playlists.json` and `history.json`. Import takes three explicit routes — the document picker, `MediaStore` for music the system already indexes (no copy is made), and a document tree walked at any depth. Files read through the picker are hashed as they stream, so the same file cannot arrive twice, and copied byte for byte into app-private storage; uninstall removes that copy, so retain originals. The tags are read once, when the file arrives, which is where the genre that a mix groups by comes from.

System presence: a home-screen widget with the current song and one button, a quick-settings tile, app shortcuts for Search, Remix and Favourites, and a predictive-back callback that closes the open thing before it leaves. All of it is declared in `AndroidManifest.xml`; the widget, the tile and the shortcut list are invisible to a build that forgets them, so check the manifest when a system surface "disappears".

The phone screens in `docs/media/android-*.png` are rendered by `ScreenshotTest` from the real `WaveApp` on the Robolectric graphics stack, and published by the same CI job.

## Publication gates

Run checks at the latest revision, perform real target-device playback/accessibility/DPI checks, state the reduced native scope, review exact runtime notices and sign using credentials kept outside the repository. At the approved merge, tag its actual merged commit as `v0.2.0` and create the GitHub Release. Never include signing keys or personal music. [Privacy](../PRIVACY.md) and existing rights restrictions remain applicable.

### Lyric-service traffic

The clients retain LRCLIB as the only online lyric provider. Web requests use a shared 500 ms queue, same-origin Web Locks when supported, concurrent lookup sharing and safelisted headers. Native Windows serializes requests per client with bounded cancellation; Android retains its synchronized queue. Both native clients space request starts by 500 ms. Windows accepts short numeric and HTTP-date retry deadlines; Android preserves deadlines longer than one day. None of these measures removes provider-side/IP limits. Native retry-deadline contracts have been added; the latest local web validation does not certify a new native build.

## Native interaction refinement — 0.2.1

- Android: `LocalMotionChoice` persists the app animation preference and combines it with the platform animator setting. Page direction follows destination order; press, navigation, progress and lyric-following motion use that preference. `WaveActionButton` keeps feedback on the glyph with 48 dp targets. Favorite and upcoming-queue shuffle use it; shuffle no longer restarts the recording. The full player exposes reactive volume/mute, retaining the pre-mute level. A separate focus multiplier preserves volume through ducking and focus recovery. The wide record column can scroll instead of clipping its controls on short displays.
- Windows: `Motion.IconAction` animates only the glyph and uses non-accumulating, bounded keyframes; OS/app motion preferences gate it. Repeat, shuffle, favorite and volume respond locally. Dock/full-player sound controls synchronize without recursive feedback, and mute restores the previous level. Native directional page/Settings motion replaces whole-list flashes on same-page updates. Icon controls expose keyboard focus and localized sound/repeat/favorite names.
- New Android player control tests and extended Windows UI smoke checks are committed for native CI. They are not a claim of a local native build: this workspace lacks both SDKs. Clip and Fix volume processing remain web capabilities, not newly advertised native controls.
