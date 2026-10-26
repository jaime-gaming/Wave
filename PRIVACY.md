# Privacy and local storage

Updated: 17 October 2026. Applies to Wave's current development source. Deployment operators must provide their own legal identity and privacy contact before a public release; this file is not a completed GDPR operator notice.

## On your device

Wave does not implement accounts, advertising, analytics, telemetry, cloud library storage or audio uploads. Web stores imported audio, metadata, favorites, playlists, images and lyrics in IndexedDB for the current origin/profile, with preferences and the current playback session in localStorage. Android copies originals into app-private storage and saves local JSON/preferences. Windows uses `%LOCALAPPDATA%/Wave`. No cross-device synchronization exists. Stored music remains original; edits change local database fields, not the original file tags.

Keep your originals: clearing website data, browser eviction, uninstalling Android, or removing Windows app data may erase Wave's copies. Removing a web song removes its saved copy/references, not the original on your disk. Native builds currently have no library-delete UI: clear app-private data through the OS or remove the Windows data folder after exiting. Disabling automatic lyrics does not erase saved text. Web song editing can remove saved lyrics.

## Optional online lyrics

Automatic lookup is **off initially**; the web also requires its consent preference. Enable it in Settings to request lyrics for eligible selected tracks. A manual **Search online** requests only that song even while automatic lookup is off. Turning the switch off prevents new automatic requests; an already in-flight network request may already have reached the provider.

LRCLIB receives title, artist, optional album/duration and the client identifier. Its servers necessarily receive connection information such as an IP address; HTTPS does not hide this from the recipient. Audio files and artwork are not sent. Saved text and lookup state are local; no account credentials are sent. A failed lookup can try structured/free-text searches, never upload music. Native implementations have a smaller search/cache feature set than web.

Provider: https://lrclib.net/docs. Its terms/privacy endpoints were not available during this review; retention, operator identity, transfer location and a blanket lyrics license were **not verified**. A third-party API's availability is not a copyright clearance. Deployment maintainers must verify these before promoting the integration publicly. For maximal local privacy, leave automatic lyrics off and paste lawful local text/LRC instead.

## Local metadata checks (web)

Imported files are inspected on your device for title, artist, album, duration, source format, track/disc numbers, year/genre and supported embedded covers. A same-origin worker parses tags where supported. Original audio is saved unchanged; local checks do not identify recordings against an external catalogue.

Online catalogue verification and cover downloading have been removed. Imports and metadata review make no MusicBrainz or Cover Art Archive requests, even if an older verification preference remains in this browser. Previously saved details/covers remain local and are not automatically erased or reverted. Prior requests already received by a provider cannot be recalled. Use local editing/restoration or browser site-data controls to manage saved data. The separate optional LRCLIB lyric policy above is unchanged.

## Website host

Opening a GitHub Pages deployment downloads the app from GitHub and may disclose IP/device/request information to GitHub. See https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement. “Local-first” describes the library, not an assertion that hosts/providers collect no information. A different host has its own processing and notice. Fonts are bundled locally; no font CDN is used.

## Wave 1.1 (planned, not active)

Release 0.1.0 has no sync, no accounts and no provider playlist import. The 1.1
foundation in the source tree is not connected to the interface, so none of the
following data flows is active yet. Before any of it ships, this file must list
each one explicitly: borrowed audio copies on a second device and how to delete
them; the signalling relay (encrypted pairing messages and connection metadata,
never audio); a TURN relay, which does forward encrypted audio; and the Spotify
and YouTube playlist requests, with their scopes, provider identity and
retention. See [SPEC_1.1](docs/SPEC_1.1.md) for the threat model and the open
questions.

## Contact and rights

Project maintenance: https://github.com/jaime-gaming/Wave. Public issues are visible to others; do not attach music, private metadata, logs with personal information or credentials. Before deployment, specify an appropriate private privacy contact and controller identity, legal bases, purposes, recipients, retention and applicable rights/complaint channels. GDPR access, erasure, objection, restriction, portability and consent withdrawal depend on the actual processing and legal basis; a device-only library is not a remotely accessible controller database.

No nonessential tracking cookies are implemented. Local-player storage is used to provide requested features; this does not mean every form of future device storage would be exempt from consent requirements. Any future analytics/accounts/cloud feature needs a separate review and notice before activation.

## Web listening and appearance details

Queue/order IDs, the current selection, repeat/shuffle and per-track playback positions are saved locally to restore a paused session. They are not sent to an account or remote listening-history service. The selected track IDs reference the local library; clearing site data removes both saved library data and the session. These data are scoped to the browser profile and website origin, not shared across deployments/devices.

Artwork colors are sampled on-device. Automatically composed playlist SVG icons and their mixed palettes are computed in memory from local artwork; no external image or color-analysis service is contacted. The selected theme and last hue/saturation can be remembered locally (`wave-theme`, `wave-palette`) so the standalone privacy page matches the application. No audio or artwork is copied into these appearance preferences. Existing online-lyrics consent, license and provider limitations are unchanged.
