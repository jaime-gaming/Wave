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
- Restore the dedicated 0.1.0-style inactivity scene after 30 seconds, with full artwork, credits and cinematic lyrics. Enabled videoclips fill the background, with compact bottom credits and transparent, shadowed lyrics; editors/text inputs and hidden or unfocused tabs block entry.
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
- Add **Fix volume** to **Settings → Playback** as a global opt-in for sequential library analysis, future imports, reversible playback gain and a safety ceiling. Turning it off cancels scanning and restores original playback levels without deleting measurements. No source rewrite, denoising or promised restoration of lost quality. The tool currently supports local files up to ten minutes / 48 MB; YouTube and native clients do not gain this tool in this pass.
- Repeat a local recording with a brief same-source mini-overlap and an icon-only animation, retaining safe restart fallback.
- Improve reversed-tag evidence across accents/typography, honor explicit keep decisions, and share corrected search identities with lyric and clip discovery. Request actual YRC data and correctly inflate compressed KRC word clocks. Provider availability remains best effort and optional word-level providers remain opt-in.
- Refresh ten web screenshots including the restored scene and the new volume action. No release tag or production deployment is created by this change.

### Motion refinement

- Directional route and Settings entrances, an edge-led Queue sheet, calmer navigation selection and natural-position Remix expansion.
- Keyboard/pointer press feedback, switch responses and accessible lazy-page skeletons; reduced-motion and the app animation preference disable spatial travel and shimmer.
- Idle video reuses its existing stage without restarting audio or mounting a second iframe. Existing video-off preferences remain respected.

### Consistent controls and native interaction polish

- Fix volume is now visually the same Settings switch as Mix, Clip and Autoplay, without a separate explanatory block.
- Local interaction animations for repeat, shuffle, favorite, clip and sound; shared library-favorite feedback, keyboard support and reduced-motion/app preference handling.
- Android gains full-player volume/mute and animated favorite/upcoming shuffle, a saved motion preference, directional pages and better short-wide record scrolling. Queue shuffle retains the current recording; focus ducking preserves master volume and mute rather than resetting to full volume.
- Windows gains icon responses, keyboard focus outlines, directional Settings/page travel and synchronized sound controls in the dock and expanded player. Same-page updates no longer fade the whole library.
- Native control tests are added to CI. No native clip/normalization capability, production deployment or release publication is implied.

### Shared animation refinement

- Calmer spring/easing families across pages, cards, controls and native artwork; quicker, shorter modal entrances without large zooms or text blur.
- Cleaner notices, phased loading highlights, no sticky touch-row hover, and no duplicate library-heart pulse.
- Faster, quieter press ripples with bounded concurrency and complete cancellation/cleanup on motion-off. Keyboard repeat and inert controls cannot build up effects.
- Android press/icon responses and Windows settling follow the same restrained direction; motion-off clears Windows animation state.

- Consistent card hover/press responses, with fine-pointer capability detection so touch interactions do not retain hover travel. Removed continuous floating Remix artwork; existing repeat/action feedback is retained.
