# Privacy and local storage

Updated: 6 November 2026. Applies to Wave's current development source. Deployment operators must provide their own legal identity and privacy contact before a public release; this file is not a completed GDPR operator notice.

## On your device

Wave does not implement accounts, advertising, analytics, telemetry, cloud library storage or audio uploads. Web stores imported audio, metadata, favorites, playlists, images, lyrics and the listening history in IndexedDB for the current origin/profile, with preferences and the current playback session in localStorage. Android copies originals into app-private storage and saves local JSON/preferences, including a `history.json` of what was played. Windows uses `%LOCALAPPDATA%/Wave` with the same `history.json`. Android also samples artwork locally in memory to tint the interface; the artwork is not uploaded. The listening history never leaves the device, is not sent anywhere, and can be cleared from the Remix page. Removing the Home shelf does not erase it. Choosing a folder stores the browser's own directory handle in the same local database, so the folder can be read again; the permission itself stays with the browser and is asked for explicitly, never silently. An exported playlist brought over from another app is read as text on the device: only the titles, artists, albums and durations in that text are compared with the local library, and nothing is uploaded or matched against a remote catalogue. There is no automatic cloud sync; the web client can explicitly pair devices and transfer selected music directly, as described below. Stored music remains original; edits change local database fields, not the original file tags.

Keep your originals: clearing website data, browser eviction, uninstalling Android, or removing Windows app data may erase Wave's copies. Removing a web song removes its saved copy/references, not the original on your disk. Android offers explicit removal after confirmation: it deletes Wave-owned copies only when they are inside its audio directory and are not referenced by another song. MediaStore originals and files outside that directory are not deleted. Windows data can also be cleared through the operating system after exiting. Disabling automatic lyrics does not erase saved text. Web song editing can remove saved lyrics.

## Optional song-detail lookups

Songs whose own tags are incomplete — no artist, no album, no year, no sleeve, or a title that is
really a filename — can have those gaps filled from a public catalogue. The switch is in Settings →
Library and is **off by default**: nothing is sent until it is switched on, and switching it off stops
every new request immediately.

Apple's iTunes Search API receives the artist and title already stored on the device (or, when the
artist is unknown, the title alone) and the storefront taken from the browser's language. It
returns the matching release and a cover image, which is fetched once and stored locally. Nothing
else is sent: no audio, no artwork from your files, no identifiers, no account, no listening
history. A song that is already complete is never sent anywhere, a song edited by hand is never
overwritten, and the running time always stays the decoder's own measurement.

The catalogue's servers necessarily see connection information such as an IP address; HTTPS does
not hide that from the recipient. Requests are spaced out, bounded, and skipped entirely while the
device reports no connection. Lookup history is a timestamp on the song record, kept on the device.

Silent edges measured at the start and end of a file are a local measurement. Removing them stores a
pair of playback bounds on the song record; the original audio is never rewritten and the editor can
give the whole file back.

**Fix volume** also runs entirely on the device. It decodes a bounded local recording, measures playback levels in a disposable worker and stores a reversible gain alongside the song. Neither the audio nor the measurements are sent anywhere; the original file is unchanged. It is not a noise-removal service.

## Optional online lyrics

Automatic lookup is **off initially**; the web also requires its consent preference. Enable it in Settings to request lyrics for eligible selected tracks. A manual **Search online** requests only that song even while automatic lookup is off. Turning the switch off prevents new automatic requests; an already in-flight network request may already have reached the provider.

LRCLIB receives title, artist, optional album/duration and the client identifier. Its servers necessarily receive connection information such as an IP address; HTTPS does not hide this from the recipient. Audio files and artwork are not sent. Saved text and lookup state are local; no account credentials are sent. A failed lookup can try structured/free-text searches, never upload music. Native implementations have a smaller search/cache feature set than web.

### Extra word-level sources (opt-in)

Word-by-word timing needs providers that publish it. The optional **Word-level lyric sources** switch (Settings → Lyrics, off by default) also asks NetEase and Kugou for the same song. Only the title and artist are sent; both services see connection information such as an IP address, and both are community endpoints without a published API contract. Responses are parsed on the device and saved locally as ordinary lyrics. Turning the switch off stops new requests; saved lyrics stay. If either service answers with word timing that does not fit the file's duration, it is discarded and LRCLIB is used instead.

### Video clips and YouTube songs

Clip discovery sends the song title and artist to public Piped or Invidious instances and keeps the chosen video id locally; no audio or image leaves the device. Adding a song from YouTube sends the video id and nothing else. Wave asks YouTube's oEmbed endpoint first, then noembed, then a public Piped instance, then a public Invidious instance, and stops at the first title. Those requests carry the video id and the usual connection information such as an IP address; nothing about your library is included. A YouTube song and any muted backdrop clip stream directly from YouTube: that traffic, and the fact that you watched a video, belongs to YouTube's own policy, not to Wave. Wave never downloads, proxies or extracts that audio.

Provider: https://lrclib.net/docs. Its terms/privacy endpoints were not available during this review; retention, operator identity, transfer location and a blanket lyrics license were **not verified**. A third-party API's availability is not a copyright clearance. Deployment maintainers must verify these before promoting the integration publicly. For maximal local privacy, leave automatic lyrics off and paste lawful local text/LRC instead.

## Local metadata checks (web)

Imported files are inspected on your device for title, artist, album, duration, source format, track/disc numbers, year/genre and supported embedded covers. A same-origin worker parses tags where supported. Original audio is saved unchanged; local checks do not identify recordings against an external catalogue.

Online catalogue verification and cover downloading have been removed. Imports and metadata review make no MusicBrainz or Cover Art Archive requests, even if an older verification preference remains in this browser. Previously saved details/covers remain local and are not automatically erased or reverted. Prior requests already received by a provider cannot be recalled. Use local editing/restoration or browser site-data controls to manage saved data. The separate optional LRCLIB lyric policy above is unchanged.

## Offline copy of the interface

The web edition registers a service worker that stores the interface — HTML, scripts, styles, fonts and icons — in the browser cache so the app opens without a connection. Audio, artwork, lyrics and video references are never added to that cache; they remain in the library storage described above and are removed by clearing site data. Unregistering the service worker or clearing site data removes the offline copy and the next visit needs a connection.

## Website host

The production website, https://wave.jaime-gaming.com, is served by Cloudflare Workers and static assets. Cloudflare processes connection/request information (including IP address) under https://www.cloudflare.com/privacypolicy/. Worker observability is enabled for operational requests/errors; application code does not log playlist URLs, answers, music or library contents. GitHub hosts the source and native release downloads, not the production player. Fonts are bundled locally; no font CDN is used.

## Mix never touches your files

Mix runs on the device. Wave analyses a downmixed copy of the two songs while they play and plans
the handover in memory; nothing is uploaded and no catalogue is consulted. During the overlap only
playback changes: the decks are faded against each other, the low end swaps, the outgoing song's
top is rolled off with a Web Audio low-pass and the incoming deck may be tempo-matched with pitch
preserved. Every one of those is reverted when the overlap ends. The stored file, its sample rate,
its bit depth and its bitrate are never modified, and no processed copy is kept.

## Video clips and YouTube songs

Clip discovery sends the song title and artist to public Piped or Invidious instances and stores
the chosen video id locally; no audio or image leaves the device, and only the song being played is
searched. A song added from YouTube stores the video id only: its title and length come from
YouTube's oEmbed endpoint, falling back to noembed, Piped or Invidious when the browser blocks that
request. A YouTube song and any muted backdrop clip stream from YouTube inside the browser, so that
traffic and the viewing record belong to YouTube's policy. Wave does not download, proxy, extract
or re-encode that audio; a song also imported as a file always plays from the local copy.

## Explicit device linking (web)

Two web clients can exchange pairing codes and, after confirmation, transfer selected tracks over a
WebRTC data channel. The transfer is encrypted and the receiving device verifies the file before
saving it; there is no account or automatic library upload. A public Google STUN service helps the
peers discover their network addresses and can see the requesting IP address and port. Depending
on the network, a direct connection may fail. Reading a code uses the device's camera, which is
opened only when the scan button is pressed, only while the panel is open, and is closed again as
soon as a code is read; no camera access happens on page load, and no frame is stored or sent
anywhere — the picture is examined in the page. Android and Windows do not implement this pairing
flow. Provider playlist import and a signalling relay remain future work.

## Contact and rights

Project maintenance: https://github.com/jaime-gaming/Wave. Public issues are visible to others; do not attach music, private metadata, logs with personal information or credentials. Before deployment, specify an appropriate private privacy contact and controller identity, legal bases, purposes, recipients, retention and applicable rights/complaint channels. GDPR access, erasure, objection, restriction, portability and consent withdrawal depend on the actual processing and legal basis; a device-only library is not a remotely accessible controller database.

No nonessential tracking cookies are implemented. Local-player storage is used to provide requested features; this does not mean every form of future device storage would be exempt from consent requirements. Any future analytics/accounts/cloud feature needs a separate review and notice before activation.

## Web listening and appearance details

Queue/order IDs, the current selection, repeat/shuffle and per-track playback positions are saved locally to restore a paused session. They are not sent to an account or remote listening-history service. The selected track IDs reference the local library; clearing site data removes both saved library data and the session. These data are scoped to the browser profile and website origin, not shared across deployments/devices.

Artwork colors are sampled on-device. Automatically composed playlist SVG icons and their mixed palettes are computed in memory from local artwork; no external image or color-analysis service is contacted. The selected theme and last hue/saturation can be remembered locally (`wave-theme`, `wave-palette`) so the standalone privacy page matches the application. No audio or artwork is copied into these appearance preferences. Existing online-lyrics consent, license and provider limitations are unchanged.

## Public playlist links and local feedback

Reading a Spotify/YouTube URL is an explicit action. Wave sends that URL to its same-origin Cloudflare Worker, which requests only the provider's public page metadata (with no account, cookies or access tokens). It returns a bounded public song list for matching on your device; nothing is saved until you confirm. The visible page can be incomplete, blocked, private or unavailable; export-file import remains available. No audio, local library, feedback or listening history is uploaded. Providers see the Worker connection; Cloudflare sees the request from your browser. The Worker does not implement storage or caching for these lists. It does not bypass logins or fetch audio. Service-worker caches exclude `/api/`.

After at least seven days and twelve relevant feature uses, a very occasional optional prompt may ask how a feature feels. One two-percent chance is considered per page session, with a thirty-day cooldown once shown. At most ten structured answers and the cooldown/opt-out are kept in `wave-local-feature-feedback-v1` in this browser's localStorage. They are never transmitted, used for analytics or used to silently change features. Dismiss it or choose “Do not ask again”; clearing site data removes these answers too.
