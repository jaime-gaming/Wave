# Wave 0.2.2

Prepared 16 November 2026.

## Studio-Grade Mix Engine and Fix Volume

- **Harmonic & 3-band EQ Mix Engine**: Added 12-bin spectral chroma and Krumhansl-Schmuckler musical key estimation on the Camelot wheel (`harmonicCompatibility` and `transitionCompatibility`). During every blend, the Web Audio `MixGraph` shapes a 3-band handover (`bass` low-shelf swap, `1.4 kHz` peaking `mid` vocal pocket carve at `-3.6 dB` to `-6.0 dB`, outgoing `air` roll-off and an incoming `air` low-pass rising cleanly to `20 kHz`) alongside subtle stereo pan spread. Clashing keys automatically tighten transitions (`<= 4` bars) with an earlier bass swap; harmonically matched pairs sustain musical phrasing with bar-aligned `outroStart` exit anchors.
- **Scheduler & cue hardening**: Capped incoming cue points on short and rubato tracks so songs never jump partway in, fixed scheduler fall-through so bar-aligned plans wait for their cue instead of firing premature fallback crossfades, preloaded next tracks earlier (`<= 45s`), and added `HAVE_METADATA` transition readiness, post-play cue re-assertion and wall-clock blend progress fallback.
- **Fix Volume v2**: Replaced peak-limited linear scaling with K-weighted BS.1770 LUFS loudness measurement (`-11.0 LUFS` target), a balanced deadband (`-13.0` to `-7.5 LUFS`) that leaves well-mastered songs untouched, sustained-peak headroom with a soft-knee dynamics limiter for boosting quiet recordings up to +14 dB, and gentle trim only for overly hot masters. Settings now show how many recordings were adjusted versus left untouched.

## 100% Local Mood Engine, Daily Mixes and Remix (Weekly / Monthly / Yearly)

- **100% local automatic mood detection (Web, Windows 11, Android)**: Analyzes each song's audio features (tempo, brightness, energy, dynamic range, major/minor key mode), genres and English/Spanish title/lyric cues completely on-device. Combines live session engagement (dwell depth, completion, intentional replays and consecutive quick-skip pivots) with a personalized local circadian listening prior to steer AutoPlay and Home recommendations silently without cloud calls or extra picker clutter.
- **Complete-only Daily Mixes (Web, Windows 11, Android)**: Enforces strict **7–20 tracks** per mix and **up to 3 mixes**, withholding display while the library is still loading or bulk-importing so incomplete mixes never flash. Cover artwork is locked per calendar day (`covers`) so sleeves stay rock-steady throughout the day, with per-artist caps, 4-slot artist cooldown spacing, daily flow contours and mood-grouped fallbacks for untagged libraries.
- **Weekly, Monthly & Yearly Remix (Web, Windows 11, Android)**: Extended local listening history to a full **366-day / 20,000-play** rolling window and added interactive **Weekly / Monthly / Yearly** period switching across all three platforms.

## UI/UX Polish and Micro-Interactions

- **Stationary banner & borderless live section heading handoff**: As you scroll down Home and Library pages, the top header stays cleanly anchored while the active section heading glides into a borderless top strip (`.section-scroll-dock` on Web, `StickySectionDock` on Windows 11, `LazyListState` overlay on Android) with zero double headers or overlapping action buttons.
- **Elevated artwork-tinted backdrop**: Lifted the ambient `.music-backdrop` color glow behind the entire workspace on Web so every screen breathes subtly with the playing album's palette.
- **Refined icons & Shuffle animation**: Unified the 6-tooth Settings gear across Web, Windows 11 and Android, and crafted a smooth cubic Bezier Shuffle animation where the two crossed lines physically separate into straight parallel tracks before smoothly rejoining.

## YouTube Search, Import, Offline Handling and Metadata Management

- **Unified YouTube search & link import**: Added same-origin Worker endpoints (`/api/youtube-meta`, `/api/youtube-playlist`, `/api/youtube-search`) with EU consent headers and zero CORS issues, full support for searching YouTube or pasting single videos, public playlists, mobile share text and `attribution_link` URLs, automatic artwork thumbnails, `- Topic` artist cleanup, public mirror fallbacks and the official YouTube IFrame `listening` handshake.
- **Offline clarity for YouTube tracks**: Tracks sourced from YouTube now show an explicit offline badge and skip/warn cleanly when offline without interrupting local playback.
- **Better metadata detection, search and alignment**: Infers missing artist, album, year and track numbers from imported folder hierarchies (`Artist/Album/01 - Track`), cleans rip noise from catalogue queries with automatic fallback queries, penalizes karaoke/tribute/mismatched live editions, rewards studio-master duration alignment, and adds an inline **Find song details** search-and-align matcher right inside **Edit song**.

## Navigation, Idle Listening, Wake Lock and Performance

- **Deep routes & Resume on reload**: Supports direct URLs for `/Current`, `/Queue`, `/Library/Songs|Albums|Artists|Playlists|Favorites[/<id>]`, `/Settings/<Section>` and `/Search?q=...`, plus an opt-in **Resume playback on reload** switch under **Settings → Playback**.
- **Idle listening persistence**: Fixed track changes and Mix transitions prematurely dismissing the 30-second idle immersive listening screen.
- **Screen Wake Lock**: Prevents screen sleep while Wave is open and playing on Web (`navigator.wakeLock`), Windows (`SetThreadExecutionState`) and Android (`keepScreenOn`).
- **Performance**: Reduced the initial web JS bundle by over 200 kB via lazy-split editors/pages, O(1) track lookup maps in `usePlayer`, `content-visibility` list optimizations and cleaned module imports while preserving every feature and animation.

## Native Apps (Windows 11 & Android)

- **Windows 11 Storage & Reliability ([Issue #14](https://github.com/jaime-gaming/Wave/issues/14))**: Imported files and folders now link in-place by default without copying into `%LOCALAPPDATA%\Wave\audio`. **Settings → Storage** adds an optional copy-to-storage toggle, custom storage folder chooser, remembered music folders with one-click rescan, and safe removal that never deletes original user files. Hardened persistence with lock-protected atomic `.bak` writes, automatic backup recovery & `.corrupt` quarantine, URI-safe file paths (`SafeFileUri`), missing-file `PrepareNext` guards, live Remix updates and local mood-aware AutoPlay.
- **Android Reliability, Storage & Material 3 Widget**: Hardened `Library.kt` with crash-proof JSON deserialization, batched `importFiles` with safe copy fallback & rollback, `MediaStore.Audio.Media.GENRE` extraction on Android 11+, and `SecurityException`-safe folder traversal. Added real `content://` `AssetFileDescriptor` playability checks and `MediaPlayer` teardown guards in `Player.kt`, wired 100% local mood-aware AutoPlay, and upgraded the home-screen widget to a resizable Material 3 player with rounded embedded album artwork and live Previous / Play-Pause / Next controls.
