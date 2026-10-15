# Platforms and build status

Wave now has three independent implementations. Web is the most complete; native source is an early development version, not feature parity or a verified release. Android uses Kotlin/Compose and Android MediaPlayer; Windows uses C#/WPF and Windows MediaPlayer. Neither uses a WebView, Electron or the web UI.

| Capability                                                      | Web / GitHub Pages | Android source         | Windows source           |
| --------------------------------------------------------------- | ------------------ | ---------------------- | ------------------------ |
| Home first, library, Settings page                              | Yes                | Yes                    | Yes                      |
| Original local audio, file picker, SHA-256 import deduplication | Yes                | Yes                    | Yes                      |
| Native playback / seek / two-deck equal-power overlap           | Yes                | Yes                    | Yes                      |
| Favorites / metadata and local lyric editing                    | Yes                | Basic                  | Basic                    |
| Optional LRCLIB / cached lyrics / timed lines                   | Yes                | Basic                  | Basic                    |
| Initially open, collapsible lyrics                              | Yes                | Yes                    | Yes                      |
| Playlist management and saved ordering                          | Yes                | Not yet                | Not yet                  |
| Artist portraits / album reordering / custom artwork            | Yes                | Not yet                | Not yet                  |
| Progressive glyph-clipped lyric fill                            | Yes                | Not yet                | Not yet                  |
| Existing duplicate review / reference-preserving merge          | Yes                | Import-time only       | Import-time only         |
| System media controls                                           | Browser-dependent  | No service/session yet | Not yet                  |
| Background playback guarantees                                  | Browser-dependent  | Not yet                | Requires desktop testing |
| Verified compiled build in this workspace                       | Web only           | No SDK available       | No SDK available         |

“Source” means code exists; it does not imply successful compilation or runtime testing. Native CI is provided but has not been run remotely. Native preference/theme, full-viewport behavior, codec support, interruptions and accessibility require device validation. Do not publish the test packages as stable releases.

## GitHub Pages

1. In repository Settings → Pages, choose **GitHub Actions** as the source. A maintainer must enable this; the workflow does not change account settings.
2. `.github/workflows/pages.yml` builds the web with `WAVE_BASE_PATH=/Wave/` on main and uploads/deploys only on main. A renamed repository or custom domain needs the correct base (usually `/` for a domain).
3. Run `WAVE_BASE_PATH=/Wave/ npm run build` to check a repository-path build. Serve dist under `/Wave/`, not a root-only development fallback. Ensure scripts, fonts and favicon resolve below that path.
4. No server/API keys, backend or rewrite rules are required. Navigation uses local state rather than history routes. HTTPS is needed for Web Crypto and persistence APIs.

This source change does not publish a site. Libraries are origin-specific: a Pages URL does not share a preview/browser or native library. There is no synchronization.

## Android

Requirements: Android Studio supporting AGP 8.13, JDK 17, SDK 36, Gradle 8.13. Minimum API 26. Open `platforms/android` as a separate project, install platform/build tools, and let the IDE create a machine-local `local.properties`. A Gradle wrapper is not checked in yet; CI explicitly installs the chosen Gradle version.

```sh
gradle -p platforms/android testDebugUnitTest lintDebug assembleDebug
```

APK: `platforms/android/app/build/outputs/apk/debug/app-debug.apk`. This is a debug artifact, not store signing. Native contract tests cover LRC offsets/repeated stamps and gain math. Test actual import/playback on API 26 and current devices. The document picker copies originals into app-private files; JSON uses AtomicFile. Uninstall removes this copy. No broad library permission, storage scanning, backend, analytics or account is used. Internet permission exists solely for optional lyric requests. Background service, audio focus, media session, rotation-safe playback lifecycle and production signing are outstanding.

## Windows

Requirements: Windows and .NET 10 SDK with desktop tooling; open `platforms/windows/Wave.Windows/Wave.Windows.csproj` in Visual Studio or use:

```powershell
dotnet build platforms/windows/Wave.Windows/Wave.Windows.csproj -c Release
dotnet run --project platforms/windows/Wave.Windows/Wave.Windows.csproj
dotnet publish platforms/windows/Wave.Windows/Wave.Windows.csproj -c Release -r win-x64 --self-contained false -o artifacts/windows
```

User files are copied to `%LOCALAPPDATA%/Wave`; JSON preferences/library use atomic replacement. Metadata support is intentionally limited to basic ID3/WAV plus filename fallbacks; it is not the web metadata parser. Operating-system decoder support governs playback. CI creates an unsigned framework-dependent test ZIP, not an installer: it requires the separately installed .NET 10 Windows Desktop runtime and does not bundle it. Upstream .NET 10.0.0 license/notices are included as a baseline for the generated app host. Validate Windows desktop playback, metadata, DPI, keyboard behavior, shutdown and interruption handling. A native unit suite, system integration and signed installer are outstanding. A future self-contained package must include notices for its exact resolved runtime pack, not assume the baseline inventory is complete.

## Release gate

Run all web checks and native CI; test on real target systems; complete the missing features or clearly state the reduced native scope; audit exact runtime/dependency notices; review lyrics rights and privacy disclosures; sign outside the repository. See [PRIVACY](../PRIVACY.md), and platform notice inventories. Never include personal music, signing keys or generated build trees in Git.

## Latest listening-stage update

Viewport-bounded Now Playing, saved queue/progress restoration, enhanced LRC word stamps, decoder-duration recording checks, separated metadata navigation and the 30-second immersive stage are currently **web-only**. Native Android and Windows sources were not compiled or runtime-tested for these additions. Native projects remain independent applications, not web wrappers. Their smaller existing feature sets must not be marketed as parity with the web.

The subsequent global palette, bottom-dock/blurred lyric-reader redesign, focused-tab cinema, generated playlist visuals and palette-aware privacy page are also web-only. Native UI/runtime validation is unchanged and remains pending.
