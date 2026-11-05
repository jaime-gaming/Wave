# Wave 0.2.1

Release date: 5 November 2026.

## Web quality improvements

- Navigable Home, Library, Search, Remix and Settings paths with browser back/forward support.
- Mix is a single on/off switch. Centred blending includes amplitude-sum headroom and preserves live deck gains to avoid bursts at the join.
- AutoPlay queues its continuation early enough for the next transition to prepare.
- Silence review opens an audio preview with the real decoded waveform, editable start/end bounds and separate previews of the removed edges. Edit song opens a dedicated themed trim submenu, with draggable edges, keyboard adjustments and hold-to-zoom. Original files remain unchanged.
- Custom YouTube clips no longer use an invalid nested form. Links without a URL scheme and bare video IDs work; timestamps are preserved.
- Remix leads with three highlights — listening time, top artist and top song — each with its own animated detail menu.
- Home recommendations balance favourites, artist affinity, daily discovery and recently played songs. Daily Mixes prioritise familiar artists while preserving coherent groups and show layered sleeves.
- Library imports publish tracks in batches with live file/progress feedback, without interrupting playback.
- Word-level lyric search tries several recording matches, has bounded timeouts, preserves word timestamps when saved and can upgrade the current LRCLIB lyric when opted in.
- Fluid trim controls, wrapping actions and bounded short-window dialogs.

## Metadata and presentation follow-up

- Resolve artist/title disagreements with a persisted swap or confirmation. Filenames are only a hint; automatic correction requires an exact independent catalogue match within three seconds of the recording duration.
- Use a restrained Remix layout with separators, remove the decorative sparkle icon and button glow.
- Keep browser favicons transparent while installed app and Windows icons retain their backgrounds.
- Make Android downloads and capabilities easier to find from Home and About; add honest cross-platform links in Android and Windows without claiming native library synchronization.
- Acknowledge successful repeats briefly and reduce held-edge trim zoom to at most 2.5×.
- Correct the privacy revision date and remove its obsolete hard-coded app version.
- Keep the Windows implementation in C#/WPF: use a hash set for duplicate detection, move metadata parsing off the UI thread, refresh stored rows before appending, and guard concurrent imports. No Rust migration or measured performance claim is made.

## Devices

ICE gathering now waits from local-description creation, rather than from opening the device screen. A second STUN endpoint helps when one is unreachable, and malformed signals are rejected before changing the connection. Direct connectivity still depends on network NAT/firewall policy; there is no TURN relay.

## Release packaging

The release workflow validates the tag and only publishes native packages; it does not build or upload a web bundle. It calls the native workflow and attaches the Android test APK and unsigned Windows portable ZIP after their tests complete. These are not production-signed installers. Native build execution requires GitHub's Android and Windows runners; it cannot be verified in the Linux web-development sandbox.

The new waveform editor, routing and redesigned music surfaces in this iteration apply to the web client; the separate native interfaces still need feature parity.
