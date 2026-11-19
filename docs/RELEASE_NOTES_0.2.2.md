# Wave 0.2.2

Prepared 16 November 2026.

## Studio-Grade Mix Engine and Fix Volume

- **Harmonic & 3-band EQ Mix Engine**: Added 12-bin spectral chroma and Krumhansl-Schmuckler musical key estimation on the Camelot wheel (`harmonicCompatibility` and `transitionCompatibility`). During every blend, the Web Audio `MixGraph` shapes a 3-band handover (`bass` low-shelf swap, `1.4 kHz` peaking `mid` vocal pocket carve at `-3.6 dB` to `-6.0 dB`, outgoing `air` roll-off and an incoming `air` low-pass rising cleanly to `20 kHz`) alongside subtle stereo pan spread. Clashing keys automatically tighten transitions (`<= 4` bars) with an earlier bass swap; harmonically matched pairs sustain musical phrasing with bar-aligned `outroStart` exit anchors.
- **Scheduler & cue hardening**: Capped incoming cue points on short and rubato tracks so songs never jump partway in, fixed scheduler fall-through so bar-aligned plans wait for their cue instead of firing premature fallback crossfades, preloaded next tracks earlier (`<= 45s`), and added `HAVE_METADATA` transition readiness, post-play cue re-assertion and wall-clock blend progress fallback.
- **Fix Volume v2**: Replaced peak-limited linear scaling with K-weighted BS.1770 LUFS loudness measurement (`-11.0 LUFS` target), a balanced deadband (`-13.0` to `-7.5 LUFS`) that leaves well-mastered songs untouched, sustained-peak headroom with a soft-knee dynamics limiter for boosting quiet recordings up to +14 dB, and gentle trim only for overly hot masters. Settings now show how many recordings were adjusted versus left untouched.

## 100% Local Mood Engine, Daily Mixes and Remix (Weekly / Monthly / Yearly)

- **Local mood-aware recommendations**: The web combines local audio features, genres, text cues and listening-session signals for recommendations and AutoPlay. Windows and Android use local genre, title and album cues for their native mood selection; they do not perform the same audio-feature analysis as the web.
- **Complete-only persisted Daily Mixes (Web, Windows 11, Android)**: Enforces strict **7–20 tracks** per mix and **up to 3 mixes**, persisting completed mixes locally (`wave-daily-mixes-v2` on Web, `daily-mixes.json` on Windows 11, preferences cache on Android) so already-created mixes appear instantaneously on launch. While mixes are being built, Wave shows a calm skeleton loader with _"Your daily mix is on its way"_. Cover artwork stays locked per calendar day (`covers`) with per-artist caps, 4-slot artist cooldown spacing, daily flow contours and mood-grouped fallbacks for untagged libraries.
- **Weekly, Monthly & Yearly Remix (Web, Windows 11, Android)**: Extended local listening history to a full **366-day / 20,000-play** rolling window and added smoothly animated **Weekly / Monthly / Yearly** period switching across all three platforms.

## UI/UX Polish and Micro-Interactions

- **Strict header-cleared sticky section heading bar**: On Home and Library pages, the borderless sticky heading strip appears **only after** the top banner has completely scrolled out of view and hands the title over when the next section reaches the strip.
- **Draggable Settings switches**: All on/off toggles in Settings can be smoothly dragged horizontally as well as clicked, keeping a clean standard pointer cursor with no drag handle clutter.
- **Click-only inner glyph animations & player motion**:
  - **Shuffle**: Uncrosses into parallel tracks and rejoins strictly on click (never on hover).
  - **Repeat / Loop**: Rotates only the two arrows cleanly around the center while keeping the `1` badge upright and steady on `Repeat1`.
  - **Video clip**: Glides its inner filmstrip frames upward inside a steady frame like a movie reel.
  - **Expanded player**: Compresses smoothly downward into the mini-player bar when closed on Web, Windows 11 and Android.
- **Calm ambient artwork lighting**: Slowed the full-bleed ambient artwork lights behind the workspace so colors drift smoothly and unhurriedly with the music.
- **Unified icons**: Standardized the 6-tooth Settings gear across Web, Windows 11 and Android.

## YouTube Search, Import, Offline Handling and Metadata Management

- **Unified YouTube search & link import**: Added same-origin Worker endpoints (`/api/youtube-meta`, `/api/youtube-playlist`, `/api/youtube-search`) with EU consent headers and zero CORS issues, full support for searching YouTube or pasting single videos, public playlists, mobile share text and `attribution_link` URLs, automatic artwork thumbnails, `- Topic` artist cleanup, public mirror fallbacks and the official YouTube IFrame `listening` handshake.
- **Offline clarity for YouTube tracks**: Tracks sourced from YouTube now show an explicit offline badge and skip/warn cleanly when offline without interrupting local playback.
- **Better metadata detection, search and alignment**: Infers missing artist, album, year and track numbers from imported folder hierarchies (`Artist/Album/01 - Track`), cleans rip noise from catalogue queries with automatic fallback queries, penalizes karaoke/tribute/mismatched live editions, rewards studio-master duration alignment, and adds an inline **Find song details** search-and-align matcher right inside **Edit song**.

## Navigation, Idle Listening, Wake Lock and Performance

- **Deep routes & Resume on reload**: Supports direct URLs for `/Current`, `/Queue`, `/Library/Songs|Albums|Artists|Playlists|Favorites[/<id>]`, `/Settings/<Section>` and `/Search?q=...`, plus an opt-in **Resume playback on reload** switch under **Settings → Playback**.
- **Idle listening persistence**: Fixed track changes and Mix transitions prematurely dismissing the 30-second idle immersive listening screen.
- **Screen Wake Lock**: Prevents screen sleep while Wave is open and playing on Web (`navigator.wakeLock`), Windows (`SetThreadExecutionState`) and Android (`keepScreenOn`).
- **Performance**: Reduced the initial web JS bundle by over 200 kB via lazy-split editors/pages, O(1) track lookup maps in `usePlayer`, `content-visibility` list optimizations and cleaned module imports while preserving every feature and animation.

## Native Apps & Signed Single-File Releases (Windows 11 & Android)

- **Native playback**: Android exposes local Autoplay in Playback settings; Windows adds a sleep timer, and Android's timer shows remaining time and accounts for elapsed device sleep while app state remains alive. Both timers are session-only.
- **Artwork and updates**: Android can use embedded and MediaStore artwork; Windows supports ID3 APIC and nearby folder artwork. Both apps check for newer releases and notify without silently installing them. Android updates require the same signing identity; close Windows Wave before replacing its executable.
- **Listening controls**: The web expanded player supports keyboard shortcuts and a per-song Fix Volume request. Its Mix can use existing synchronized lyric timestamps as a cue hint; timing remains best-effort.

- **Clean single-file signed builds**: The release workflow is configured to attach **one signed file per native platform**, subject to passing checks and configured signing credentials — **`Wave.exe`** for Windows 11 (self-contained single-file WPF executable with Authenticode SHA-256 signing, zero ZIPs or loose DLL/checksum files) and **`Wave.apk`** for Android (signed release APK verified with `apksigner`, zero sidecar technical clutter).
- **Windows 11 Storage & Reliability ([Issue #14](https://github.com/jaime-gaming/Wave/issues/14))**: Imported files and folders now link in-place by default without copying into `%LOCALAPPDATA%\Wave\audio`. **Settings → Storage** adds an optional copy-to-storage toggle, custom storage folder chooser, remembered music folders with one-click rescan, and safe removal that never deletes original user files. Hardened persistence with lock-protected atomic `.bak` writes, automatic backup recovery & `.corrupt` quarantine, URI-safe file paths (`SafeFileUri`), missing-file `PrepareNext` guards, live Remix updates, persisted Daily Mixes with skeleton loading, draggable Settings switches and local mood-aware AutoPlay.
- **Android Reliability, Storage & Material 3 Widget**: Hardened `Library.kt` with crash-proof JSON deserialization, batched `importFiles` with safe copy fallback & rollback, `MediaStore.Audio.Media.GENRE` extraction on Android 11+, and `SecurityException`-safe folder traversal. Added real `content://` `AssetFileDescriptor` playability checks and `MediaPlayer` teardown guards in `Player.kt`, persisted Daily Mixes with skeleton loading, animated Weekly/Monthly/Yearly Remix transitions, expanded-player mini-bar compression, 100% local mood-aware AutoPlay, and a resizable Material 3 home-screen widget with rounded embedded album artwork and live Previous / Play-Pause / Next controls.
