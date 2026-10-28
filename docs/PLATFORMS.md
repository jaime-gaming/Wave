# Wave platforms · 0.1.1

**Release date: 28 October 2026.** Wave has three independent implementations, not WebView/Electron wrappers. The web client is the most complete; Windows follows its structure with native C#/WPF controls, while Android uses Kotlin/Compose. Libraries are separate and never synchronized or silently migrated.

| Capability                                | Web                                     | Windows                                     | Android                                       |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------- | --------------------------------------------- |
| Home, local library, favorites            | Yes                                     | Yes                                         | Home, library and favorites                   |
| Dedicated Search                          | Yes                                     | Song search                                 | Library filter                                |
| Albums/artists                            | Profiles and artwork                    | Native group/details views                  | Basic list                                    |
| Browsable daily mixes and saved snapshots | Genre/artist tags                       | Genre/artist tags                           | Not yet                                       |
| Ordered playlists                         | Yes                                     | Create/edit/membership/order                | Not yet                                       |
| Queue editing                             | Drag/buttons/keyboard                   | Native queue dialog; move/remove            | Basic progression                             |
| Restored paused position                  | Yes                                     | Yes                                         | Not yet                                       |
| Automatic Mix / local Autoplay            | Analyzed pair timing / weighted variety | Bounded duration timing / local variety     | Manual overlap only                           |
| Lyrics                                    | Enhanced LRC, fill, optional lookup     | Line LRC/fill, sung line scrolled into view | Line LRC/lookup, sung line scrolled into view |
| Settings                                  | Six menus                               | Six menus                                   | Basic page                                    |
| Appearance                                | Dark/light/system, artwork palettes     | Dark/light, larger text, motion             | Dark                                          |
| Cover editing                             | Song/playlist/artist                    | Song covers                                 | Not yet                                       |
| System media controls / idle stage        | Browser-dependent / yes                 | Not yet                                     | No foreground service yet                     |
| Hosted build checks                       | Passed                                  | Passed + contracts + WPF layout smoke       | Passed unit/lint/debug build                  |

## Browser and GitHub Pages

Use Node.js 22.12+ or 24 and `npm ci && npm run dev`. Production: `npm run build`. For a repository path, use `WAVE_BASE_PATH=/Wave/ npm run build` and serve it below `/Wave/`.

To deploy **without a custom Actions workflow**, select **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then **Branch: main**, **Folder: /docs**, and Save after merging the PR. The compiled site is committed in `docs/index.html` and `docs/site-assets/`; `.nojekyll` disables Jekyll processing. Do not select the repository root: its index is Vite source, not the production site. GitHub may show its built-in Pages deployment job; no Wave deployment workflow or `PAGES_ENABLED` variable is needed.

After any web source or public asset change, run `npm ci && npm run build:pages` and commit the generated `docs` changes alongside the source. This cross-platform command uses relative URLs (repository paths and custom domains both work), replaces generated site assets, and preserves Markdown documentation. Preview with `npx vite preview --host 0.0.0.0` after building. CI checks that the committed site matches a fresh build. No repository setting, visibility, tag or release is changed by the build command. Browser libraries are specific to a site origin and profile. HTTPS is needed for Web Crypto/persistence. No backend or API keys are needed.

## Windows

Requirements: Windows and the .NET 10 SDK for development. The framework-dependent test ZIP requires the **.NET 10 Windows Desktop Runtime** to run; it does not bundle that runtime or require elevation.

```powershell
dotnet run --project platforms/windows/Wave.Contracts.Tests -c Release
dotnet build platforms/windows/Wave.Windows -c Release
dotnet run --project platforms/windows/Wave.Windows
dotnet publish platforms/windows/Wave.Windows -c Release -r win-x64 --self-contained false -o artifacts/windows
```

The native app uses WPF, Windows MediaPlayer and standard file pickers. Originals live in `%LOCALAPPDATA%/Wave/audio`; library, playlists, preferences and listening state use atomically replaced JSON files. Covers are separate local overrides. Existing library/preferences remain readable; the old disabled overlap preference migrates without silently enabling Mix.

Home has collection shortcuts, daily mixes and album cards. Search is its own destination; title/cover play, artist/album open their collections, and compact-player information opens Now Playing. Playlists can be created, renamed, populated, ordered and deleted without deleting audio. Queue edits preserve the active recording. Restored sessions remain paused. Settings separates Appearance, Playback, Lyrics, Library, Storage and About.

CI runs a dependency-free contract runner, compiles/publishes the application and executes an isolated WPF smoke mode that exercises Home, Search, daily mixes, saved playlists, six Settings sections and narrow light-theme layout. It captures PNGs in `wave-windows-ui-smoke`; this is not a physical-device or codec/playback matrix. The fixture library is temporary and does not touch a real user library.

Metadata reading remains limited to ID3/WAV. Automatic embedded artwork extraction, web-identical search grouping, artist photos, album ordering, word-stamped LRC, waveform analysis, immersive idle mode and system media integration are not complete. OS codecs govern playback. Do not call this complete web parity.

See [WINDOWS_RELEASE](WINDOWS_RELEASE.md) for checksums, signing and Defender limits. Test ZIPs are clearly labeled unsigned. Upstream .NET license/notices remain bundled; future self-contained packages must inventory their exact runtime pack.

## Android

Requirements: JDK 17, SDK/build tools 36, Gradle 8.13 and Android Studio supporting AGP 8.13. Minimum API 26. Open `platforms/android`, let the IDE create local SDK configuration, then:

```sh
gradle -p platforms/android testDebugUnitTest lintDebug assembleDebug
```

Output: `platforms/android/app/build/outputs/apk/debug/app-debug.apk`, a debug test artifact. The pinned Ubuntu CI runner provides the SDK. Tests cover LRC/gain contracts; hosted unit/lint/assembly passed. Actual device import/playback, audio focus, foreground service/media session and signing remain gates.

The phone build is structured as its own application rather than a compressed copy of the web: `ui/Theme.kt` (palette, type scale, shapes), `ui/Components.kt` (mark, titles, rows, absence views), `ui/Cover.kt` (sleeves read from the file, decoded off the main thread with a small cache), `ui/PlayerBar.kt`, `ui/NowPlaying.kt`, `ui/Screens.kt`, `ui/EditSongDialog.kt`, `ui/WaveState.kt` (library, player, imports and lyric lookups in one place) and `ui/WaveApp.kt` (destinations, mini player, overlay). Three destinations, a mini player that sits above the navigation and never hides, and a full listening screen with the lyric following the song replace the single scrolling screen. The activity declares its configuration changes, so rotation no longer restarts playback. Document picker imports copy original bytes into app-private storage; uninstall removes this copy, so retain originals.

## Publication gates

Run checks at the latest revision, perform real target-device playback/accessibility/DPI checks, state the reduced native scope, review exact runtime notices and sign using credentials kept outside the repository. At the approved merge, tag its actual merged commit as `v0.1.0` and create the GitHub Release. Never include signing keys or personal music. [Privacy](../PRIVACY.md) and existing rights restrictions remain applicable.

### Lyric-service traffic

The clients retain LRCLIB as the only online lyric provider. Web requests use a shared 500 ms queue, same-origin Web Locks when supported, concurrent lookup sharing and safelisted headers. Native Windows serializes requests per client with bounded cancellation; Android retains its synchronized queue. Both native clients space request starts by 500 ms. Windows accepts short numeric and HTTP-date retry deadlines; Android preserves deadlines longer than one day. None of these measures removes provider-side/IP limits. Native retry-deadline contracts have been added; the latest local web validation does not certify a new native build.
