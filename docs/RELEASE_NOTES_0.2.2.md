# Wave 0.2.2

Prepared 16 November 2026.

## Audio, Mix and Fix Volume

- **Fix Volume v2**: Replaced peak-limited linear scaling with K-weighted BS.1770 LUFS loudness measurement (`-11.0 LUFS` target), a balanced deadband (`-13.0` to `-7.5 LUFS`) that leaves well-mastered songs untouched, sustained-peak headroom with a soft-knee dynamics limiter for boosting quiet recordings up to +14 dB, and gentle trim only for overly hot masters. Settings now show how many recordings were adjusted versus left untouched.
- **Mix engine & planner fixes**: Capped incoming cue points on short and rubato tracks so songs never jump partway in, fixed scheduler fall-through so bar-aligned plans wait for their cue instead of firing premature fallback crossfades, preloaded next tracks earlier (`<= 45s`), added `HAVE_METADATA` transition readiness + post-play cue re-assertion + wall-clock blend progress fallback, and wired spectral bass-swap timing and stereo pan spread.

## Automatic Mood Engine, Recommendations and Daily Mixes

- **100% local automatic mood matching**: Analyzes each song's audio features (tempo, brightness, energy, dynamic range), genres and English/Spanish title/lyric themes completely on-device to infer the listener's active session mood in the background and steer AutoPlay and Home recommendations smoothly without adding manual picker clutter.
- **Overhauled Daily Mixes (Web, Android, Windows)**: Enforces per-artist caps and a 4-slot artist cooldown window so mixes never burn out a single artist with back-to-back repeats, rotates daily energy/tempo contours (rising, wind-down, arch, wave) and extra genre groups, and builds multi-artist mixes when libraries have no genre tags.

## YouTube Import and Metadata Management

- **100% compatible YouTube import**: Added same-origin Worker endpoints (`/api/youtube-meta`, `/api/youtube-playlist`) with EU consent headers and zero CORS issues, full support for single videos, public playlists, mobile share text and `attribution_link` URLs, automatic artwork thumbnails, `- Topic` artist cleanup, public mirror fallbacks and the official YouTube IFrame `listening` handshake so playback state, time and track end stay synchronized.
- **Better metadata detection, search and alignment**: Infers missing artist, album, year and track numbers from imported folder hierarchies (`Artist/Album/01 - Track`), cleans rip noise from catalogue queries with automatic fallback queries, penalizes karaoke/tribute/mismatched live editions, rewards studio-master duration alignment, and adds an inline **Find song details** search-and-align matcher right inside **Edit song**.

## Navigation, Idle Listening, Wake Lock and Performance

- **Deep routes & Resume on reload**: Supports direct URLs for `/Current`, `/Queue`, `/Library/Songs|Albums|Artists|Playlists|Favorites[/<id>]`, `/Settings/<Section>` and `/Search?q=...`, plus an opt-in **Resume playback on reload** switch under **Settings → Playback**.
- **Idle listening persistence**: Fixed track changes and Mix transitions prematurely dismissing the 30-second idle immersive listening screen.
- **Screen Wake Lock**: Prevents screen sleep while Wave is open and playing on Web (`navigator.wakeLock`), Windows (`SetThreadExecutionState`) and Android (`keepScreenOn`).
- **Performance**: Reduced the initial web JS bundle by over 200 kB via lazy-split editors/pages, O(1) track lookup maps in `usePlayer`, `content-visibility` list optimizations and cleaned module imports while preserving every feature and animation.

## Native Apps (Windows 11 & Android)

- **Windows Library Storage ([Issue #14](https://github.com/jaime-gaming/Wave/issues/14))**: Imported files and folders now link in-place by default without copying into `%LOCALAPPDATA%\Wave\audio`. **Settings → Storage** adds an optional copy-to-storage toggle, custom storage folder chooser, remembered music folders with one-click rescan, and safe removal that never deletes original user files.
- **Android Home-Screen Widget & Motion**: Replaced the minimal text widget with a resizable Material 3 home-screen widget featuring rounded embedded album artwork, artist/album details, and Previous / Play-Pause / Next controls synchronized live from `PlaybackService`, plus animated Now Playing transitions.
