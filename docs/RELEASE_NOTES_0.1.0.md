# Wave 0.1.0

**Release date: 16 October 2026.** These are the release notes for 0.1.0. Publication is pending the approved merge, `v0.1.0` tag and GitHub Release; a date in documentation does not publish a package.

## Highlights

- Bring your own audio, keep the original quality, and browse a local collection without an account or subscription.
- Daily mixes are now browsable playlist views. See all songs before playback, choose Play/Shuffle, or save an independent, editable playlist snapshot.
- Mobile Home shows every collection shortcut in a balanced grid. Narrow layouts, larger text, dialogs and playback controls have additional regression coverage.
- Search for lyrics from the editor without starting the song. Preview a match, explicitly use it, and save it for offline listening. Drafts survive failures and incidental clicks.
- Native Windows now follows the web's navigation and surface hierarchy: Home, Search, albums/artists, playlists, favorites, six Settings sections, a compact player and expanded Now Playing.
- Windows adds saved playlist ordering, editable queue, restored paused listening position, Mix/Autoplay controls, local cover overrides and explicit unplayed-song lyric search.
- Windows packaging includes version/publisher metadata, normal unpacked binaries, SHA-256 checksums, conditional Defender scanning and an opt-in trusted-certificate signing script. No antivirus bypasses or guaranteed false-positive claims.
- A shorter README with real screenshots and a captioned, animated 1080p demo video.

## Using a daily mix

Open a card on Home to browse its songs. No playback starts until you choose a song, Play mix or Shuffle. Save as playlist preserves the current order; daily refreshes will not change that saved copy. Groups use local genre/artist tags, need at least three songs and contain up to thirty. Fewer appear when the library cannot support three.

## Platform status

The web client remains the most complete. Windows is independent C#/WPF, not a web wrapper: hosted contracts, build/publish and automated WPF layout smoke checks pass. Android unit/lint/debug assembly checks pass. Native artifacts are unsigned/debug test packages, not signed installers. Windows still lacks several web-specific features, including word-stamped LRC, spectral illumination, automatic artwork extraction, system media controls and immersive idle mode. Android has a smaller feature set. See [PLATFORMS](PLATFORMS.md).

## Validation and known limits

See [VALIDATION](VALIDATION.md) for the latest measured runs. Browser codecs/storage vary. Mix does not promise beat matching, gapless playback or bit-perfect device output. Local Autoplay can be disabled. Live LRCLIB availability and coverage remain provider-dependent and unverified in this workspace. Original audio/storage and legal notices are unchanged.

Unsigned Windows downloads can still receive warnings. A successful Defender scan is only one engine/definition snapshot, not universal antivirus approval or publisher reputation. Signing requires a real trusted certificate and remains a publication gate. The existing main JavaScript bundle-size advisory remains.
