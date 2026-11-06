# Wave 0.2.1

Release date: 5 November 2026.

## Web quality improvements

- Navigable Home, Library, Search, Remix and Settings paths with browser back/forward support.
- Mix is a single on/off switch. Centred blending includes amplitude-sum headroom and preserves live deck gains to avoid bursts at the join.
- AutoPlay queues its continuation early enough for the next transition to prepare.
- Silence review opens an audio preview with the real decoded waveform, editable start/end bounds and separate previews of the removed edges. Edit song opens a dedicated themed trim submenu, with draggable edges, keyboard adjustments and hold-to-zoom. Original files remain unchanged.
- Custom YouTube clips no longer use an invalid nested form. Links without a URL scheme and bare video IDs work; timestamps are preserved.
- Web Remix uses a responsive three-card grid with artist artwork and the top song cover. Each detail menu opens directly inside its card. Explore up to 52 weeks of retained history with complete statistics/rankings and correctly dated saved playlists.
- Home recommendations balance favourites, artist affinity, daily discovery and recently played songs. Daily Mixes prioritise familiar artists while preserving coherent groups and show layered sleeves.
- Library imports publish tracks in batches with live file/progress feedback, without interrupting playback.
- Word-level lyric search tries several recording matches, has bounded timeouts, preserves word timestamps when saved and can upgrade the current LRCLIB lyric when opted in.
- Fluid trim controls, wrapping actions and bounded short-window dialogs.

## Metadata and presentation follow-up

- Resolve artist/title disagreements with a persisted swap or confirmation. Filenames are only a hint; automatic correction requires an exact independent catalogue match within three seconds of the recording duration.
- Use a restrained Remix layout with separators, remove the decorative sparkle icon and button glow.
- Keep browser favicons transparent while installed app and Windows icons retain their backgrounds.
- Keep platform download links quietly in About, not Home. Remove automatic Android promotion in the web app; polish native Android presses, navigation, artwork, lyric focus and scrubbing instead. Native libraries remain independent.
- Smooth repeats with a short audio attack, without an on-screen notice. Reduce held-edge trim zoom to at most 2.5×.
- Correct the privacy revision date and remove its obsolete hard-coded app version.
- Keep the Windows implementation in C#/WPF: use a hash set for duplicate detection, move metadata parsing off the UI thread, refresh stored rows before appending, and guard concurrent imports. No Rust migration or measured performance claim is made.

## Latest interaction and hosting follow-up

- Remix retains line icons and detail chevrons within its three expandable highlights.
- Restore the dedicated 0.1.0-style inactivity scene after 30 seconds, with full artwork, credits and cinematic lyrics. Videoclips retain a high-contrast reading surface; editors/text inputs and hidden or unfocused tabs block entry.
- A deliberately rare, dismissible feature-opinion card stores only local structured answers, with a long cooldown and opt-out. Nothing is transmitted or used for automatic changes.
- Bring your playlists now tries public Spotify/YouTube URLs through the same-origin Worker before falling back to export files. Public lists can be partial; matching and confirmation remain local, with no audio download.
- Cloudflare Workers owns production hosting and the bounded metadata endpoint. Remove the old compiled `docs/` mirror and its CI drift check; validate the actual Worker bundle with `deploy:check` instead. Documentation and six web screenshots are refreshed.

## Release-candidate polish

- Opening Trim audio synchronously pauses the main native deck and pauses the playback state (including embeds). Preview volume follows the master; closing/back navigation stops and detaches the preview. Main playback stays paused until explicitly resumed.
- Daily Mixes are limited to three concurrent generated mixes and twenty songs each on web, Android and Windows. Add web/native contract coverage; saved playlists remain normal independent snapshots.
- Restore a consistent image geometry, separate editor menu titles from subtitles, and improve ranked song/artist rows. Android shared song and Daily Mix rows have more space; Windows song rows keep fixed sleeves, separated credits, bounded album columns and matching drawn placeholders.
- Improve the local opinion card with a privacy heading, distinct icon-led response choices, a clearer dismissal footer and Escape handling. Frequency, storage and opt-out remain local-only and unchanged.
- Refresh eight web screenshots, including expanded Remix and feedback. Native screenshots/build verification still require the native CI runners and device review.

## Devices

ICE gathering now waits from local-description creation, rather than from opening the device screen. A second STUN endpoint helps when one is unreachable, and malformed signals are rejected before changing the connection. Direct connectivity still depends on network NAT/firewall policy; there is no TURN relay.

## Release packaging

The release workflow validates the tag and only publishes native packages; it does not build or upload a web bundle. It calls the native workflow and attaches the Android test APK and unsigned Windows portable ZIP after their tests complete. These are not production-signed installers. Native build execution requires GitHub's Android and Windows runners; it cannot be verified in the Linux web-development sandbox.

The new waveform editor, routing and redesigned music surfaces in this iteration apply to the web client; the separate native interfaces still need feature parity.

## Listening refinements (web)

- Expand Remix details across the whole row, preserving the other cards above/below; show only weeks with actual listening information.
- Simplify import to a single progress/count indication, without filename/internal subprocess chatter.
- Add **Fix volume** to Edit song for bounded local audio analysis, reversible playback gain and a safety ceiling. No source rewrite, denoising or promised restoration of lost quality. The tool currently supports local files up to ten minutes / 48 MB; YouTube and native clients do not gain this tool in this pass.
- Repeat a local recording with a brief same-source mini-overlap and an icon-only animation, retaining safe restart fallback.
- Improve reversed-tag evidence across accents/typography, honor explicit keep decisions, and share corrected search identities with lyric and clip discovery. Request actual YRC data and correctly inflate compressed KRC word clocks. Provider availability remains best effort and optional word-level providers remain opt-in.
- Refresh ten web screenshots including the restored scene and the new volume action. No release tag or production deployment is created by this change.
