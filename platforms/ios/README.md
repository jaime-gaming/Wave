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
  follows the playback clock.
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
entitlements or capability file. Nothing is uploaded: there is no
`URLSession`, no account, no analytics and no online metadata or lyric lookup.

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
simulator and opens `wave://capture?page=home` (and the other page names) to seed an in-memory
demo library. It then uses `xcrun simctl io` to photograph the real SwiftUI screens and publishes
`docs/media/ios-*.png` on branch pushes. These are layout captures, not a signed distribution.

## Scope

This is a native iOS client, not a claim of pixel-identical parity with the web,
Android or Windows builds. Daily Mixes, video clips, YouTube songs, device
linking, online metadata and waveform/beat analysis are not in this target yet.
Real-device playback, accessibility and performance passes still need to happen
before any signed distribution.
