# Wave for iOS

A SwiftUI app for iPhone and iPad, iOS 17 and newer. It is **source-only for now**:
open `Wave.xcodeproj` in Xcode or build it for the simulator in CI. There is no
signing identity, no development team, no `.ipa` in the Release assets and no
App Store upload.

## What it does

- Imports the listener's own audio files with the system document picker and
  keeps them in the app's Documents folder. Tags, embedded artwork and duration
  are read locally with AVFoundation.
- Stores the library, playlists and listening history as three atomically
  written JSON files. A single bad file never discards the other two.
- Plays a queue with Play/Pause, Previous/Next, seeking, volume, shuffle, repeat,
  favorites and local AutoPlay when the queue ends.
- Reads synced LRC or plain-text lyrics from a file the listener chooses, and
  follows the playback clock. Optional manual LRCLIB search sends the title and artist.
- Shares a visual card with song details, artwork and the Wave website; no audio is shared.
- Offers local Daily Mix selections and explicit iTunes catalogue and YouTube searches.
- Lets listeners name playlists, add songs from a song's context menu, reorder or
  remove entries, and delete a playlist without deleting its audio. Album, artist
  and playlist playback keeps the selected collection in the queue.
- Keeps the mini-player in the tab's safe area so scrollable content remains reachable.
  Full library, local search and Remix lists are no longer capped by the performance profile.
- Plays or saves the weekly, monthly or yearly Remix currently selected on screen.
- Mixes two songs with two `AVAudioPlayer` decks. When optional tempo tags and
  the listener's LRC timings are present, `WaveMix` puts both instrumental
  edges on a downbeat of their own pulse and bounds the overlap so they do not
  drift. Neither file is time-stretched or rewritten. Otherwise it uses a short
  constant-power crossfade.
- Keeps playing with the screen off and answers Play, Pause, Next, Previous and
  seek from the lock screen, Control Center, headphones and CarPlay through
  `AVAudioSession`, `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter`.
- Chooses `lite`, `balanced` or `full` automatically from memory, CPU count,
  Low Power Mode, Reduce Motion, screen scale and size. Only decorative motion
  and list/analysis budgets change; there is no new Settings control.
- Uses the same Spanish dictionary as the web, Android and Windows clients.
  `npm run build:i18n` regenerates `Wave/es.lproj/Localizable.strings`.
- Adds an adaptive Remix tab: Weekly/Monthly/Yearly recaps built from the local
  history, full-width columns, clamped type/artwork/padding and an automatic
  row budget. No centred design cap is left to create a right-side empty strip.
- Shows an immersive listening room after thirty seconds of quiet playback,
  with artwork, credits, the active sung line, Mix and a progress line. The
  automatic lite profile keeps it still.

## System presence

WidgetKit home/lock-screen widgets, ActivityKit Live Activities with Dynamic
Island and a `.small` CarPlay/watch family, `AppIntents` with Siri, Shortcuts,
Spotlight and the Action button, an iOS 18 Control Center `ControlWidget`,
background audio, Now Playing, audio interruptions/audio focus, headset route
changes, CarPlay remote commands, Handoff with `NSUserActivity`, `wave://` deep
links and the system Share sheet. `WaveSystemCenter` connects them to the same
`WaveState`; the widget extension is source-only and unsigned, with no
entitlements or capability file. On request, lyrics searches contact LRCLIB, catalogue searches
contact iTunes, and YouTube searches contact Wave and YouTube. Each search displays a notice
before sending a query; audio is never uploaded. There is no account or analytics.

## Liquid Glass, iOS only

`Wave/App/Views/LiquidGlass.swift` uses the real SwiftUI `GlassEffectContainer`
and `.glassEffect(.regular, in:)` behind `#available(iOS 26, *)`. iOS 17–25 get
a `.ultraThinMaterial` fallback; Reduce Transparency gets an opaque Wave
surface. Related controls share one container and `.buttonStyle(.glass)` so
glass never samples glass. Web CSS, Android and Windows do not use Liquid Glass.

## Requirements

Xcode 26 or newer on macOS 26 (or another macOS host with the iOS 26 SDK). The
app and widget-extension targets have `CODE_SIGNING_ALLOWED = NO`, so a
simulator build needs no team or certificate. A real device needs signing
configured separately; that is deliberately not part of this change.

## Build and test

The dependency-free logical core is also a Swift package, so the library,
search, LRC, Mix and performance contracts can be tested without a simulator:

```sh
swift test --package-path platforms/ios
xcodebuild -project platforms/ios/Wave.xcodeproj \
  -scheme Wave \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/WaveDerivedData \
  CODE_SIGNING_ALLOWED=NO build
node --test scripts/ios-release.test.mjs
```

The `ios` job in `.github/workflows/ci.yml` selects Xcode 26 on `macos-26` and
runs these commands. It does not archive, sign, notarize or publish an app.

## Native screenshots

The `ios-captures` job in `.github/workflows/native.yml` installs the unsigned app on an iPhone
simulator with `WAVE_CAPTURE_PAGE` set to each page to seed an in-memory demo library.
The capture fixture is simulator-only and is never persisted. It then uses `xcrun simctl io` to photograph the real SwiftUI screens and publishes
`docs/media/ios-*.png` on branch pushes. These are layout captures, not a signed distribution.

## Scope

This is a native iOS client, not a claim of pixel-identical parity with the web,
Android or Windows builds. Daily Mixes are simple local daily selections, not the web mood engine.
The online YouTube search opens the official embedded video player; it does not yet add YouTube
tracks to the library or queue. Native device linking, video clips and waveform/beat analysis
are not in this target yet. Catalogue and LRCLIB searches are explicit and opt-in.
Real-device playback, accessibility and performance passes still need to happen
before any signed distribution.
