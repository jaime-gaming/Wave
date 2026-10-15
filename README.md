<p align="center">
  <img src="public/wave.svg" alt="Wave logo" width="144" height="116" />
</p>
<h1 align="center">Wave</h1>
<p align="center"><strong>A local-first music player for web, Android and Windows.</strong></p>
<p align="center">
  <a href="#getting-started">Get started</a> ·
  <a href="docs/PLATFORMS.md">Platforms</a> ·
  <a href="docs/DESIGN.md">Design</a> ·
  <a href="docs/VALIDATION.md">Validation</a>
</p>

---

Wave is a local-first music player for the web. Bring your own audio files, build a collection, and listen without an account or subscription. Your music stays in your browser; it is not uploaded to a server.

The project is an unreleased development build. The React/TypeScript web client is the most complete. Independent Kotlin/Compose Android and C#/WPF Windows source projects now exist, without web wrappers, but their builds and runtime behavior are not verified in this workspace and feature parity is incomplete. See the honest [platform matrix and build/deployment guide](docs/PLATFORMS.md).

## What works today — web

- Import multiple audio files through a file picker or drag and drop.
- Check embedded titles, artists, albums, durations, year/genre, track/disc numbers and cover art during import, with heavy tag parsing off the UI thread and a bounded worker-job deadline. When tags are missing, conservatively infer spaced “Artist — Title” filenames (including track/disc prefixes); valid embedded tags win.
- Persist audio files immediately on import, skip byte-identical copies, and retain favorites and ordered playlists across reloads.
- Opt into automatically downloading verified synchronized/plain lyrics from LRCLIB; keep manual/embedded lyrics and work with saved lyrics offline.
- Blend artwork during automatic Mix handovers without extra transition meters; fill synchronized lyric text and animate cards, navigation and press feedback.
- Browse songs, albums, artists, favorites, and your playlists.
- Create, rename, and delete playlists; select songs, reorder them, and add from song options.
- Enable library editing in Settings to change song titles, artists, albums, and covers without changing audio files.
- Restore original imported song information and artwork, or customize a playlist cover and description.
- Use the dedicated Search page for songs, artists, albums and playlists, with accent-insensitive, order-independent word matching and category filters. The composer appears only on Search; Home and Library have no repeated search/filter field. Sort songs by title, artist, or import date.
- Play, pause, seek, adjust volume, and move between tracks.
- Add, remove and reorder playback queue entries with drag handles, buttons or keyboard controls, without restarting the current song.
- Use contextual right-click menus for songs and playback, with native editing/selection menus preserved.
- Shuffle and repeat one track or the whole queue.
- Use media keys and system controls through Media Session where supported.
- Switch between dark, light, and system themes.
- Use Material 3-style library views, a compact playback bar, and mobile bottom navigation.
- Browse a dedicated artist collection with local initials, album covers, song/album counts, and direct artist playback.
- Use Home for collection shortcuts, recent albums/songs, playlists, artists, and local daily mixes.
- Open a viewport-filling now-playing view from the compact player on desktop, tablet, and mobile.
- Retain original audio bytes without transcoding or added effects; source technical metadata remains stored without verbose Now Playing status blocks.
- Remember volume and the pre-mute level across reloads; restore the selected queue order after shuffle.
- Adapt the player palette to local album artwork.
- Use spring-based navigation, view and dialog transitions, animated selection, playback shape changes, and playing indicators.
- Disable animations in Settings or follow the system reduced-motion preference.
- Use keyboard controls and accessible dialogs, with **Settings → Appearance → Larger text**, visible focus and mobile form text sized to avoid automatic input zoom.

Gapless playback, equalization, listening history, and streaming account connections are not implemented. See the [roadmap](docs/ROADMAP.md).

## Requirements

- Node.js 22.12 or later in the Node 22 line (Node 24 is also suitable).
- npm and Git.
- A modern browser with IndexedDB, Web Crypto, and HTML audio support.
- HTTPS for deployment; localhost is suitable for development.

The importer accepts MP3, FLAC, WAV, OGG, M4A, AAC, Opus, AIFF, and WebM files, up to 200 MB per file. **Actual playback depends on the browser's codec support.** Recognizing a file extension or reading its metadata does not guarantee that the browser can play it.

## Getting started

```bash
git clone https://github.com/jaime-gaming/Wave.git
cd Wave
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. Choose **Add your music** or drop audio files into the page, then select a track to play it.

```bash
npm run lint       # Static analysis
npm test           # Unit and component tests
npm run build      # Type checking and production build
npm run preview    # Serve the production build locally
```

Browser tests require Playwright's Chromium installation:

```bash
npx playwright install chromium
npm run test:e2e
```

## Listening and browsing

The collapsed player is a compact 64 px bar with a small cover, title/artist and transport. It stays compact until clicked. Select a song, then click its information in the bottom player bar to open **Now playing**. It fills the application viewport on every screen size; close it with the collapse control or Escape. The album-first layout places credits below artwork, with a larger centered cover on tall phones and an independent bottom transport. Collapsing Lyrics gives the song the full stage instead of leaving an empty column. The layout fits without outer scrolling, with bounded artwork, transport and lyrics. Collapse/queue and essential controls remain reachable; short screens use a compact cover/header and keep the full transport, modes and volume controls in a separate bottom dock. This is a full-page application view, not an operating-system/browser fullscreen request.

**Search** has its own large composer, category chips and grouped results. Use **Ctrl / ⌘ K** from any main page to open it. Library contains browsing and sorting, without an extra filter field. Playing a Search result uses the matching song queue, not unrelated results.

**Home** starts with **Your collection**, followed by up to three **Daily mixes** generated entirely from your local tags. Each mix needs at least three songs in a disjoint genre group; songs without useful genre tags can form an explicitly artist-based group. Sparse libraries show fewer mixes, not fabricated styles. Groups contain up to thirty tracks; ordering is stable for the same library/day and refreshes on the next local calendar day. Playing a mix uses the normal native queue; ordinary repeat/Mix/Autoplay settings still apply. No audio analysis, account, recommendation API or network request is involved. Home then shows recent albums/songs, playlists and artists, without a duplicate current-session card; the compact player remains the listening entry point. **Artists** opens local profiles with albums, songs, known duration and Play/Shuffle. Initials and local covers are used, not invented portraits or biographies. Albums are grouped by both artist and album name.

Audio is decoded directly by the browser from the original stored Blob. The playback path does not transcode, boost, normalize, resample in application code, or add equalizer effects. A separate read-only `captureStream()`/analyser tap measures the selected native deck for soft background illumination where supported; bass/mid/high frequency energy drives three independent radial light falloffs, not wave shapes or actual voice/instrument separation; it is never connected to an audio destination. A bounded offline source-envelope decode is the fallback, not an output effect. Neither path accesses a microphone or system audio. Optional Mix applies only overlapping native volume ramps, never re-encoding audio. The default volume is 100%, and chosen volume/mute levels are remembered. Source technical metadata is retained internally, not rendered as a verbose Now Playing block; it is not measured device output. **The browser, operating system, hardware, codec, and source recording determine actual output quality.** Bit-perfect output, improved quality of already-lossy recordings, gapless playback, and universal codec support are not promised.

## Lyrics, artist photos, queue and ordering

- **Lyrics:** open Now playing: the Lyrics dropdown starts expanded and can be collapsed. Embedded millisecond-synchronized tags or LRC timestamps follow the actual active decoder clock, including pause, seek, repeat, and crossfade. Tap a line to jump to it. Plain text is displayed without fabricated timestamps. If no local lyrics exist, a friendly “¡Oh, oh!” empty state offers **Add lyrics**. Use **Edit lyrics** in song options without playing the song, or from the player. Its explicit **Search online** action previews a verified LRCLIB match without changing the draft. **Use found lyrics** replaces the draft; **Save lyrics** is required to persist it. Search can be canceled, honors shared provider cooldowns and never enables automatic lookup. You can also import `.lrc`/`.txt`, paste text, adjust timing by ±10 seconds, or remove it. Automatic lookup is off initially; opt in through Settings: LRCLIB receives the title/artist and known album/duration, never audio. Verified matching lyrics are downloaded and saved for offline use; manual/embedded lyrics take precedence. Disable it in **Settings → Lyrics → Automatic lyrics**. Missing, instrumental, loading and connection-error states are distinct, with an explicit retry. A network failure on the identified request retries a safelisted GET to the same provider, without weakening title/artist/duration checks or bypassing cooldowns. Pending requests show feedback immediately. Provider cooldowns remain visible and survive reload; failed network requests can be deliberately retried without silently waiting behind the automatic backoff. Reconnecting retries an eligible failed current song when automatic lookup is enabled. Untagged files can infer spaced “Artist - Title”, en-dash, em-dash and underscore-delimited “Artist_-_Title” filenames; ambiguous names stay unguessed. Numeric song titles such as “7 Rings” remain intact, and live/remix/acoustic editions stay distinct. A malformed provider candidate no longer stops other verified candidates; valid plain lyrics can be retained without unsafe timestamps. Album identity and common deluxe/reissue suffixes are checked before trusting timing. Conflicting performance albums are rejected; an ordinary compilation conflict can only supply plain text after better album candidates are exhausted. Otherwise edit missing metadata before lookup. The full lyric document stays available in its own reader (not an outer page scroll). The active verse is centered, complete and sharp; surrounding verses are softly blurred and can be focused or scrolled. Previous/next controls browse without seeking, with an icon-only follow action and ±100 ms timing controls inside **Adjust lyric timing**, including reset, recentering and recoverable save failures. Provider attribution remains a quiet LRCLIB link rather than a technical status block. Text fills progressively without bars. Enhanced LRC word stamps drive word fill; ordinary LRC interpolates line intervals and is not exact word-timed karaoke. Missing segment ends use line/native-duration fallbacks. Cleaned exact queries, conservative filename inference, recording-edition checks, decoder-duration reconciliation and timeline validation reduce false synchronized matches. Timing accuracy still depends on the source timestamps and browser clock precision. Positive manual offsets display lines later; a positive LRC `[offset:]` header advances timestamps according to the file format.
- **Saved listening session:** queue/order, selected song, repeat/shuffle and playback positions persist locally through reload/leaving. Restoration waits for the library and decoder, clamps to actual duration and stays paused until Play. Explicitly selecting a song starts it from the beginning. Missing/deleted queue IDs are pruned safely.
- **Immersive listening:** after 30 seconds of inactivity in the visible, focused Wave browser tab, controls disappear in favor of artwork and a complete current verse with softly blurred neighbors. If lyrics are absent, only the centered cover, song, artist and album are shown. Mouse, touch, keyboard or wheel activity restores the prior view without restarting audio. Editing dialogs, focused text editors, buffering and hidden tabs block entry.
- **Metadata navigation:** collection title/cover actions play songs; artist/album metadata opens the corresponding local page. In the compact bar, the cover, title, artist and unused bar space open Now Playing instead of navigating away. Independent transport/seek/volume/queue controls retain their own actions. Expanded player metadata links preserve the current audio session; its cover toggles playback.
- **Artwork palette:** the playing cover tones the entire interface, not just the player. Pausing restores the base Wave palette; resuming reapplies the cover palette. Supporting browsers reveal ordinary palette changes with a circle expanding from the bottom. During Mix, the outgoing and incoming palettes blend along the shortest hue arc, following actual overlap progress, with a restrained light bloom on the expanded stage instead of restarting a circle every frame; reduced motion uses an immediate change. Light has its own surface, text and accent luminance roles.
- **Audio-reactive background:** soft tonal light follows a locally measured source-amplitude envelope and the native playback clock, including seek and volume/mute. There is no invented beat or modification of the stored audio. It stops on pause, buffering, hidden/unfocused tabs, disabled animations or system reduced motion. Visual analysis is limited to supported sources up to 24 MB and 20 minutes; larger/unsupported sources retain a still background and play normally. Crossfade visuals follow the selected incoming recording, not a measured sum of device output.
- **Startup and motion:** the Wave W flattens into a line, moves like a volume wave and returns to W during initial loading. Press ripples, tonal state layers, shape transitions and record-position springs share the motion preference. System reduced-motion changes take effect without reloading.
- **Playlist identity:** without a custom cover, each playlist gets a deterministic local vector icon. Up to twelve distinct member covers contribute colors to its mixed artwork and tonal surfaces. Custom covers always take precedence; generated visuals are computed in memory, not stored as extra audio/images.
- **Artist photos:** open an artist profile → **Edit artist photo**. Upload, replace, or remove a local JPEG/PNG/WebP. Photos are separate from album artwork and appear in Home, the artist gallery and profile. They are keyed by the exact artist name; renaming metadata does not transfer a photo to a different name. These controls are always available independently of the song-metadata opt-in.
- **Queue:** choose **Add to queue** in a song's options, or **Add songs to queue** inside Queue. Additions append unique song IDs without replacing the playing selection, its elapsed time, shuffle state, or original queue order. An empty queue becomes ready to play but does not autoplay. Already-queued songs are identified; repeated occurrences of the same ID are not supported. Select **Reorder queue** to drag handles, use up/down buttons or Alt + ↑/↓. Changes apply immediately, preserve the current recording/time/play intent, become the new shuffle baseline and survive reload; they do not edit album or playlist orders.
- **Mix:** one Settings switch automatically chooses the handover for each pair. There is no duration slider or separate overlap mode. The shorter recording determines a bounded window (up to eight seconds), with conservative silence cues and staged complementary-power gains. Two native decoders overlap, while covers, palette and lyrics follow actual incoming media time. Missing analysis retains original boundaries; failed incoming playback falls back to ordinary song changes. No tempo/pitch change, beat matching, normalization or file rewriting is performed. Mix is on for fresh installations; prior disabled overlap preferences stay disabled. Browser/device audio policies can limit smoothness.
- **Autoplay:** enabled initially. At the queue boundary, continue with local songs chosen by weighted artist/album/genre/era/duration context, favorites and variety. Avoid the current recording, recent songs when alternatives exist and duplicates within a continuation batch. Repeat modes take priority; pause stays paused, one-song libraries stop unless repeat is on, and the switch can be disabled. No remote recommendation profile or streaming audio is involved.
- **Local import checks:** every file gets local completeness checks and validated embedded artwork, preferring a front cover. **Settings → Library management → Local metadata** lists missing details in eight-song pages. Catalogue verification and online cover downloads are removed; old verification preferences are ignored. Previously saved tags/covers remain intact. Original audio and file tags are untouched; use local editing to correct information. Local completeness does not identify or certify a recording.

- **Context menu:** right-click a song in Home, Library, Search, Queue or the player for playback, queue, favorites, playlist, lyrics and existing song options. Right-click elsewhere for playback, Queue, import and Settings. Arrow keys/Home/End navigate enabled actions; Enter activates, Escape/Tab dismiss and focus returns. Menus stay inside the viewport, including over the full-screen player. Shift + right-click, selected text, links and editable fields retain the browser menu; existing confirmation still protects library deletion.
- **Reordering:** open a playlist or album → **Reorder songs**. Drag a handle, use the up/down buttons, or focus a handle and press Alt + ↑/↓; **Save order** persists the whole collection, independently of any previous Search results. Playlist and album orders are independent and do not mutate the current playback queue or file tags. Choose **Playlist order**/**Album order** in sorting to see the saved order. Untouched albums start with embedded disc/track numbering when available, then import order; new songs append after saved entries.

These latest listening improvements are implemented and verified on the web; Android/Windows parity remains pending. Audio storage/conversion/deduplication behavior was left unchanged.

All these changes are stored locally. Database version 3 adds artist profiles and album orders without replacing songs, favorites, playlists or audio Blobs.

## Playlists and library editing

Open **Library → Playlists → Create playlist**, name it, then choose **Add songs**. Song options also offer **Add to playlist**, including creating a new playlist directly. **Move up in playlist** and **Move down in playlist** change the saved order; **Playlist order** uses it for browsing and playback. The **Reorder songs** dialog also supports dragging and Alt-arrow keyboard controls. Removing membership or deleting a playlist never deletes music. Removing a song from the library also removes its playlist references.

Open **Settings → Library management → Library editing** to unlock **Edit song** in song options, plus custom playlist artwork and descriptions. The setting is off by default. Change title, artist, album, or choose a local cover; save when ready. **Restore original information and cover** restores the first imported values. These edits live in Wave's database, not in file tags. Turning editing off hides the editing controls but keeps saved edits and covers.

Custom artwork accepts JPEG, PNG, or WebP up to 5 MB and 40 million decoded pixels. Wave center-crops it to a JPEG of at most 512 × 512 at quality 0.8, without upscaling small images; the source image is unchanged. Playlist names are limited to 100 characters, descriptions to 1,000. Without a custom cover, a playlist uses its first song's artwork or a neutral placeholder.

**Settings → Appearance → Animations** is on by default. System reduced motion takes precedence even when this switch is on. No account connection or Firebase configuration is needed for these local features; Spotify/Deezer integrations are deferred and no connection is simulated.

## Technology

| Area          | Implementation                                       |
| ------------- | ---------------------------------------------------- |
| Language      | TypeScript                                           |
| Interface     | React and responsive CSS                             |
| Build tooling | Vite                                                 |
| Audio         | HTMLAudioElement; optional Media Session integration |
| Storage       | IndexedDB with `idb`                                 |
| Metadata      | `music-metadata`, loaded when importing              |
| Motion        | Motion for React with shared spatial/effects tokens  |
| Icons         | Lucide                                               |
| Tests         | Vitest, Testing Library, Playwright                  |
| Code quality  | TypeScript strict mode and ESLint                    |

## Project structure

```text
src/
├── components/       # Artwork, dialogs, player controls
├── data/             # IndexedDB repository and file importer
├── domain/           # Tracks, ordered playlists, filtering, queue reducer
├── hooks/            # Library, playlist, and audio lifecycle management
├── ui/               # Shared motion preferences and transitions
├── test/             # Test setup and component tests
├── App.tsx           # Library views and application shell
├── main.tsx          # Application entry point
└── styles.css        # Themes and responsive layouts
tests/                # Real-browser integration tests
docs/                 # Technical documentation
public/               # Static assets
.github/workflows/    # Continuous integration
```

## Privacy and storage

Wave has no backend, accounts, analytics, or remote audio services. Automatic lyrics uses the public LRCLIB API, off initially and opt-in in Settings. It sends song metadata, while the provider also sees connection information such as an IP address; downloaded text remains local. Imported files are committed immediately to this site's browser storage, without needing to play or select them. Full-file SHA-256 deduplication skips identical bytes even when filenames/dates change; legacy IDs and playlist references are preserved. Audio is retained once at original quality. Covers are compact JPEGs; lyrics persist raw text once and reconstruct parsed lines on load. Originals are never changed or deleted. Removing a track removes only Wave's stored copy and its playlist references. Playlist deletion affects no audio files. Metadata edits and custom covers are local overrides; Wave does not rewrite or export file tags.

Storage is specific to a browser profile and site origin. Clearing site data, private browsing, quota limits, or automatic storage eviction can remove the collection, playlists, and edits. **Keep your original audio files.** Wave is a player, not a backup system. A different preview URL can have a different library.

Settings → Storage → **Browser storage** reports audio, cover and lyric size estimates and origin usage/quota when supported. Import automatically requests persistent storage; **Protect stored files** can request it again. The browser may deny protection. This does not compress audio below its original size or replace a backup.

Local playback and saved lyrics do not require network access once the app has loaded; optional lookup needs internet and LRCLIB availability. An installable PWA and reliable offline app startup are not implemented yet.

## Documentation

- [Interface design](docs/DESIGN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Internal API reference](docs/API_REFERENCE.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Reference and acknowledgments

[PixelPlayer](https://github.com/PixelPlayerHQ/PixelPlayer) is a reference for local music browsing and the player experience. Wave is an independent implementation; no PixelPlayer source code, artwork, or branding is included. PixelPlayer's current proprietary license does not grant general redistribution rights.

Wave is not affiliated with, sponsored by, or endorsed by PixelPlayer or Spotify AB. Wave's design uses rounded surfaces, clear hierarchy, and expressive color inspired by Material Design principles; it does not use Jetpack Compose or Android Material components.

## Contributing and license

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before submitting changes.

Wave is licensed under the [MIT License](LICENSE). Dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

Maintained by [Jaime Gaming](https://github.com/jaime-gaming).

## Latest interface and library changes

Home opens first. Settings is a dedicated responsive page with a Back action, not a modal. Wave uses an original curved W vector mark. Full-screen Now Playing keeps the cover visible, removes redundant playback/source status blocks, and opens its collapsible Lyrics section initially on each expansion/song change.

Mix uses media-clocked equal-power sine/cosine gains instead of a wall-clock smoothstep. It is optional, not gapless or guaranteed clipping-free for correlated recordings. Lyric lookup identifies its client, spaces requests, respects Retry-After and verifies metadata/duration across exact and search candidates. Filename “Artist - Title” is a fallback for untagged imports; live/edition differences are not discarded. A slightly different-duration match may supply plain text, never falsely synchronized text. Availability is not guaranteed.

Settings → Storage → Library cleanup hashes bytes on explicit scan. Same-name candidates are non-destructive review only. Confirmed byte-identical merges preserve favorites, local/embedded lyrics, playlist and album-order references. A matching title alone never deletes a recording.

## Platforms, privacy and rights

- [Platforms / GitHub Pages / native build commands](docs/PLATFORMS.md)
- [Privacy and data flow](PRIVACY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Public/free/open-source describes the client distribution, not permission to distribute music, lyrics or covers. No deployed Pages site, signed native package or legal clearance is claimed. Accounts/Spotify/Deezer/Firebase remain deferred.

### Listening refinements

The same curved native-range seek appears in both compact and expanded playback, including a slim phone-bar track. Queue uses a tonal side sheet on desktop and a bounded bottom sheet on phones; selecting the current queued song resumes without resetting its position. The absence stage hides navigation, workspace, the compact player and every normal-stage control visually as well as semantically, keeps a complete active verse with soft neighboring context, and preserves the selected source. Soft radial illumination responds independently to bass, mid and high frequency energy, without visible wave silhouettes; this is spectral visualization, **not isolated vocals or stems**. Silence, mute, pause, unfocused/hidden tabs and reduced motion stop the visual effect. Privacy & Rights shares Wave's background roles and follows theme/palette storage changes; its explanatory text is unchanged.

### Responsiveness and lookup refinements

Large imports use a dedicated same-origin metadata worker when available, with a direct-parser fallback. Files remain sequentially persisted and import UI updates yield/transition at low priority. Collections over 120 songs avoid per-row Motion layout measurements; off-screen rows use browser rendering containment, not list virtualization. Search uses deferred filtering and memoized destinations. Covers decode lazily/asynchronously, seek geometry is memoized, and root time updates are bounded while lyric text retains its native clock. Visual analysis stops its animation-frame loop when unfocused/hidden. Phone queue/menu targets are at least 44/48 px; metadata review is paged at eight rows. Short staggered list entrances and tonal hover states honor motion opt-out.

Lyrics matching now understands complete collaboration credits, Unicode dash prefixes and common official lyric/video/4K labels without discarding live/remix/acoustic edition identity. A full-credit fallback search helps provider indexing variations. Old negative-cache identities are retried; new misses expire after one day. Duration, album, edition checks, manual precedence, attribution and consent remain enforced. Provider outages or missing records can still leave lyrics unavailable.

### Compact settings and mobile library

Settings opens a six-item menu: Appearance, Playback, Lyrics, Library management, Storage and About Wave. Each opens only its own controls, with an All settings action and keyboard focus return. Theme/motion, Mix/Autoplay and lyric consent remain independent. Privacy is reachable from every submenu.

Library categories display their counts, with all five destinations visible in wrapping phone chips. Play/Shuffle and sorting fit narrow screens; song titles can use two lines, compact credits ellipsize and collection names/descriptions wrap. Cards clamp long names to two lines, retaining full names in collection details and accessible labels. The empty compact player is hidden until a song is selected. Content remains scrollable above the bottom navigation/player.

Default playlist covers use a consistent flat list-and-note glyph, restrained tones and a narrow member-color spine, without gradients or ornamental shapes. Local custom covers always take precedence. Member-color lookup is indexed; the glyph switches ink on pale palettes.

## 0.1.0 release candidate

The web feature set is frozen for a draft review, not a published release. Read the [0.1.0 candidate notes](docs/RELEASE_NOTES_0.1.0.md) and [validation record](docs/VALIDATION.md). Native Android/Windows build/parity review remains separate; no signed native package or production deployment is implied.
