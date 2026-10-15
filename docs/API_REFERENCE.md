# Wave Internal API Reference

This document describes the implemented TypeScript modules. Wave has no HTTP API or backend. These interfaces are internal and may change during `0.x` development.

Earlier Kotlin examples for `MediaPlayerController`, `MusicLibrary`, playlists, and settings managers were proposals, not working APIs. Their relevant behavior is now represented by the modules below; unimplemented features remain on the [roadmap](ROADMAP.md).

## Track model

Defined in `src/domain/types.ts`:

```ts
interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileName: string;
  size: number;
  addedAt: number;
  favorite: boolean;
  blob: Blob;
  artwork?: string;
  audioInfo?: AudioInfo;
  contentHash?: string;
  lyricsLookup?: LyricsLookup;
  lyrics?: Lyrics;
  trackNumber?: number;
  discNumber?: number;
  originalMetadata?: TrackMetadata;
  editedAt?: number;
}

interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
}

interface AudioInfo {
  codec?: string;
  sampleRate?: number; // Hz
  bitsPerSample?: number;
  bitrate?: number; // bits per second
  lossless?: boolean;
}

type RepeatMode = 'off' | 'all' | 'one';
type LibraryView = 'songs' | 'albums' | 'artists' | 'favorites' | 'playlists';
```

`duration` is seconds; zero means unknown. `size` is bytes, `addedAt` is a Unix timestamp in milliseconds, and `artwork` is an optional locally generated image data URL. `blob` is the persisted audio file. Albums and artists are derived groups, not independently stored entities. `audioInfo` is optional imported source metadata; it does not describe or guarantee device output quality.

`originalMetadata` is captured once before the first local edit and removed on restoration. `editedAt` is milliseconds since the Unix epoch. Neither editing nor restoration changes the persisted audio Blob.

## Playlist model and mutations

Defined in `src/domain/types.ts` and `src/domain/playlists.ts`:

```ts
interface Playlist {
  id: string;
  name: string;
  description: string;
  artwork?: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

type PlaylistDetails = Pick<Playlist, 'name' | 'description' | 'artwork'>;
type PlaylistChange =
  | { type: 'details'; details: PlaylistDetails }
  | { type: 'add'; ids: string[] }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; direction: -1 | 1 }
  | { type: 'reorder'; ids: string[] };

validatePlaylist(playlist: Playlist): Playlist
applyPlaylistChange(playlist: Playlist, change: PlaylistChange): Playlist
```

Names are trimmed and must contain 1–100 characters. Descriptions are limited to 1,000 characters. IDs are unique and ordered; adding existing IDs is idempotent. Moves outside the list are no-ops. Mutations return new objects/arrays and update the modification timestamp. The repository additionally drops IDs that no longer exist in the library. Artwork is an optional local data URL; pass user-selected files through the artwork processor, not arbitrary remote URLs.

### Track utilities

```ts
formatTime(seconds: number): string
filterTracks(tracks: Track[], query: string): Track[]
```

`formatTime` returns `minutes:seconds` and safely handles negative or non-finite values. `filterTracks` normalizes Unicode accents/case/punctuation and requires every query word to occur in the combined title/artist/album text, in any order. It does not mutate the input and is not a fuzzy/full-text index. `musicIdentity.matchesSearch` applies the same rule to collection names. `inferFileMetadata` recognizes conservative two-part, spaced dash filenames after explicit track/disc prefixes; ambiguous multiple parts are not guessed. Import preserves valid embedded tags, falling back to artist-list/album-artist tags before compatible filename identity. Audio bytes are unchanged.

## Collection selectors

Defined in `src/domain/collections.ts`:

```ts
albumKey(track: Pick<Track, 'artist' | 'album'>): string
collectAlbums(tracks: Track[]): AlbumGroup[]
collectArtists(tracks: Track[]): ArtistGroup[]
initials(name: string): string
```

`AlbumGroup` includes the artist/album-pair ID, name, artist, tracks, cover track, and latest `addedAt`. `ArtistGroup` includes name, tracks, albums, and known finite duration. Album IDs are JSON-encoded pairs used in navigation, not persistent entities. Inputs are not mutated. Initials are a local fallback, not a remote portrait.

## Import API

Defined in `src/data/import.ts`:

```ts
AUDIO_EXTENSIONS: string[]
AUDIO_ACCEPT: string
MAX_FILE_SIZE: number
isAudioFile(file: File): boolean
fileIdentity(file: File): Promise<string> // legacy helper; not used for new imports
contentIdentity(blob: Blob): Promise<string> // full-file SHA-256
readTrack(file: File, id: string): Promise<Track>
```

- `AUDIO_ACCEPT` is suitable for a multiple file input.
- `MAX_FILE_SIZE` is 200 MB in binary units.
- `isAudioFile` checks the extension, not the file's contents or browser decoder support.
- `fileIdentity` hashes filename, size, and last-modified time using Web Crypto. It is not a full-file content hash.
- `contentIdentity` hashes complete file bytes and uses a FileReader fallback when Blob.arrayBuffer is unavailable. New imports deduplicate these hashes, including renamed/redated files. Legacy IDs are never rewritten.
- `readTrack` reads local tags and optional cover art. Missing or malformed metadata falls back to the filename, `Unknown artist`, and `Unknown album`. It does not write to the database.

For the complete validated, duplicate-aware workflow, use `useLibrary().importFiles` rather than calling `readTrack` alone.

## Storage API

Defined in `src/data/library.ts`:

```ts
openLibrary(): Promise<IDBPDatabase<WaveDatabase>>
getTracks(): Promise<Track[]>
saveTrack(track: Track): Promise<void>
deleteTrack(id: string): Promise<void>
toggleTrackFavorite(id: string): Promise<Track>
editTrackMetadata(id: string, metadata: TrackMetadata): Promise<Track>
restoreTrackMetadata(id: string): Promise<Track>
getPlaylists(): Promise<Playlist[]>
createPlaylist(details: PlaylistDetails): Promise<Playlist>
updatePlaylist(id: string, change: PlaylistChange): Promise<Playlist>
deletePlaylist(id: string): Promise<void>
```

The repository uses database `wave-library`, schema version 3, stores `tracks`, `playlists`, `albumOrders` keyed by `id`, and `artists` keyed by `name`. Version-2 databases gain profiles/orders without replacing audio or playlists. Version-1 databases gain the playlist store without replacing tracks. `saveTrack` inserts or replaces a record. `deleteTrack` removes the stored track and prunes its references from every playlist and saved album order in one transaction, not the original device file or playback queue. Favorite/metadata updates mutate the latest stored record atomically and reject if the track no longer exists. Metadata title is required and limited to 200 characters; artist/album to 200 characters each. Empty artist/album use unknown labels. Restore is a no-op for an unedited track. Playlist deletion affects no audio.

Convenience methods close their database connection after each operation. A caller using `openLibrary` directly must close its connection. Storage errors reject the returned promise and must be handled by the caller.

## Artwork processor

Defined in `src/data/artwork.ts`:

```ts
MAX_ARTWORK_FILE_SIZE: number // 5 * 1024 * 1024
ARTWORK_ACCEPT: string // JPEG, PNG, WebP file input filter
readArtwork(file: File): Promise<string>
```

Accepts nonempty JPEG, PNG, or WebP files up to 5 MB. Decode errors and images above 40 million decoded pixels reject with an actionable error. Center-crops and downsamples to at most 512 × 512 without upscaling, returns a JPEG data URL at quality 0.8, and revokes temporary object URLs in a `finally` block. Source files are unchanged; SVG and remote artwork are not accepted by the picker.

## Library hook

Defined in `src/hooks/useLibrary.ts`:

```ts
const library = useLibrary();

library.tracks; // Track[]
library.loading; // boolean
library.progress; // { done: number; total: number } | null
library.message; // string
library.error; // string
library.importFiles(files); // Promise<void>
library.toggleFavorite(track); // Promise<void>
library.remove(id); // Promise<boolean>
library.editMetadata(id, metadata); // Promise<boolean>
library.restoreMetadata(id); // Promise<boolean>
library.setError(message);
```

Imports are ignored while initialization or another import is in progress. Invalid, empty, oversized, and duplicate files are counted in the result message. A storage failure stops the batch without discarding earlier successful files. Favorite updates only appear after a successful database write. `remove` returns whether deletion succeeded; the caller removes the ID from the player only on success.

The hook preserves in-memory audio Blob identity when applying favorite and metadata records, keeping the player's current source unchanged.

## Playlist hook

Defined in `src/hooks/usePlaylists.ts`:

```ts
const collections = usePlaylists();
collections.playlists; // Playlist[]
collections.loading; // boolean
collections.error; // string
collections.create(details); // Promise<Playlist | null>
collections.update(id, change); // Promise<boolean>
collections.remove(id); // Promise<boolean>
collections.pruneTrack(id); // void: in-memory synchronization only
collections.setError(message);
```

Writes are reflected in React state only after persistence succeeds. Failure returns `null`/`false`, sets an error, and does not optimistically alter the list. `pruneTrack` mirrors an already committed repository deletion; it must not be used instead of `deleteTrack`.

## Queue reducer

Defined in `src/domain/player.ts`:

```ts
interface PlayerState {
  queue: string[];
  orderedQueue: string[];
  index: number;
  playing: boolean;
  repeat: RepeatMode;
  shuffled: boolean;
}

playerReducer(state: PlayerState, action: PlayerAction): PlayerState
shuffleQueue(queue: string[], current: string, random?: () => number): string[]
```

The initial state has empty current/original-order queues, index `-1`, paused playback, repeat-off, and shuffle disabled.

| Action                        | Behavior                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| `{ type: 'load', queue, id }` | Deduplicate IDs, select a valid track, and request playback          |
| `{ type: 'toggle' }`          | Toggle playback only when a queue entry is selected                  |
| `{ type: 'pause' }`           | Set paused intent                                                    |
| `{ type: 'next' }`            | Advance; wrap only in repeat-all; pause at the end otherwise         |
| `{ type: 'previous' }`        | Select the previous entry; wrap at the start only in repeat-all      |
| `{ type: 'ended' }`           | Advance, stop, or retain the current repeat-one entry                |
| `{ type: 'repeat' }`          | Cycle off → all → one → off                                          |
| `{ type: 'shuffle', queue }`  | Accept a valid permutation, retain the active ID, and toggle shuffle |
| `{ type: 'remove', id }`      | Remove an entry and preserve a valid active index                    |

`load` with an ID not in the supplied queue leaves state unchanged. Invalid shuffle permutations are rejected. The reducer returns new state without mutating the previous queue. `shuffleQueue` returns a randomized copy with the current entry first; an injectable random source makes tests reproducible.

Repeating the same audio source and restarting at elapsed time zero are handled by the audio hook, not the reducer.

## Playback hook

Defined in `src/hooks/usePlayer.ts`:

```ts
const player = usePlayer(tracks);

player.state; // PlayerState
player.current; // Track | undefined
player.time; // Elapsed seconds
player.duration; // Browser-reported seconds, or zero
player.volume; // Persisted number from 0 to 1, default 1
player.buffering; // Browser waiting state
player.mixEnabled; // Single persisted automatic Mix switch, fresh default true
player.setMixEnabled(enabled); // Automatic window, staged handover and conservative cues
player.autoplay; // Persisted, default true; repeat takes priority
player.setAutoplay(enabled); // Local patterned continuation at queue completion
player.reorderQueue(ids); // Valid queue permutation; retain selected source/time, reset shuffle
player.enqueue(ids); // Append known unique library IDs without autoplay/replacement
player.error; // Playback error message
player.dispatch(action); // Queue state transition
player.play(visibleTracks, id); // Load a queue and start a track
player.seek(seconds); // Clamp and seek within actual duration
player.previous(); // Restart after 3 seconds; otherwise previous
player.shuffle(); // Toggle shuffle, retaining the current track
player.setVolume(volume); // Ignore non-finite input, clamp [0, 1]
player.toggleMute(); // Restore the last audible level
player.setError(message);
```

Pass the complete current library to the hook. `play` uses the provided list as a queue snapshot, so later search changes do not modify playback order. Seek requires a loaded duration. The interface restricts volume values to `[0, 1]`. Play intent can be reset to paused when the browser rejects playback.

The application mounts one player engine; Mix lazily adds a second native decoder to overlap transitions. It creates and revokes Blob URLs and installs Media Session actions when available. Queue state/order, selected song and per-track positions are restored locally after reload; playback resumes paused. `wave-volume`, `wave-last-audible-volume`, `wave-mix-v2` and `wave-autoplay` persist valid preferences; unavailable storage falls back to session state. Shuffle-off restores `orderedQueue`, not unrelated library order. Seek ignores unknown/non-finite duration. Guarded Media Session position reporting mirrors finite duration and elapsed time.

### Integration example

```tsx
const library = useLibrary();
const player = usePlayer(library.tracks);
const visible = filterTracks(library.tracks, search);

return visible.map((track) => (
  <button key={track.id} onClick={() => player.play(visible, track.id)}>
    {track.title} — {track.artist}
  </button>
));
```

### Removing a track safely

```ts
if (await library.remove(track.id)) {
  collections.pruneTrack(track.id); // when usePlaylists is mounted
  player.dispatch({ type: 'remove', id: track.id });
}
```

## Components and theme

- `Artwork`: renders local cover art or a neutral music-note placeholder.
- `PlayerBar`: compact playback at every width; controlled `expanded` state opens a full-viewport dialog. `onOpen` receives the initiating button and `returnFocusRef` restores it after exit.
- `Navigation`: renders Home, Search, and Library as a desktop rail or mobile bottom navigation.
- `LibraryContent`: renders songs, album/artist groups, and empty states.
- `useArtworkColor`: derives a tonal player palette from local cover artwork, with a neutral fallback.
- `Modal`: animated native dialog with focus containment, Escape handling, inert exit, and optional `returnFocusRef` for an explicit opener.
- `PlaylistCollection` / `PlaylistHeader`: collection cards and ordered playlist detail.
- `PlaylistDialog` / `AddSongsDialog` / `AddToPlaylistDialog`: creation/details and membership flows.
- `TrackEditor` / `ArtworkPicker`: gated local metadata/cover editing and original restoration.
- `AnimatedListItem`: layout/entry/exit motion; exiting rows are inert.
- `useWaveMotion`: shared springs/effects, combined Settings and live native system motion preferences.
- `HomePage`: collection shortcuts, recent local imports, playlists, artists, and local daily mixes; the compact player owns listening access.
- `Artists` / `ArtistHeader`: local artist collection/detail, album shelf and direct playback.
- `AlbumCard`: shared local album entry and press/hover feedback.
- `LibrarySurface`: staged view transitions with inert exits.
- `App`: coordinates browse views, search, sorting, file selection, queue display, and settings.

Theme values are `dark`, `light`, and `system`. `App` stores the preference under `wave-theme` and sets the root `data-theme` attribute. CSS variables resolve the visual palette. `wave-editor-enabled` defaults to `false`; `wave-animations-enabled` defaults to `true`. `MotionPreference` and root `data-motion` coordinate JavaScript and CSS motion, while system reduced motion always suppresses spatial/decorative animation.

## Events, extensions, and future APIs

There is no public event bus or plugin interface. Browser audio events are encapsulated by `usePlayer`; library changes use React state. Equalizer configuration, file-tag rewriting/export, cloud synchronization, and Spotify/Deezer account connection APIs do not exist yet.

When introducing persistent entities, document their schema, error handling, ownership, and migrations alongside the implementation. Do not publish speculative API signatures as stable contracts.

## Lyrics and local personalization

```ts
interface LyricLine { text: string; time?: number } // seconds; absent = plain text
interface Lyrics { raw: string; lines: LyricLine[]; offsetMs: number; source: 'local' | 'embedded' | 'lrclib'; providerId?: number }
interface ArtistProfile { name: string; artwork?: string }
interface AlbumOrder { id: string; trackIds: string[] }
parseLyrics(raw: string, offsetMs?: number, source?: Lyrics['source']): Lyrics
activeLyricIndex(lyrics: Lyrics, seconds: number): number // -1 before the first line / plain text
lyricFillProgress(lyrics: Lyrics, seconds: number, duration?: number): number // bounded visual line fraction
lyricFillTokens(text: string): {text: string; start: number; end: number}[] // reading-order fractions
saveTrackLyrics(id: string, lyrics?: Lyrics): Promise<Track> // undefined removes lyrics
getCustomizations(): Promise<{artists: ArtistProfile[]; albums: AlbumOrder[]}>
saveArtistProfile(profile: ArtistProfile): Promise<ArtistProfile>
saveAlbumOrder(id: string, trackIds: string[]): Promise<AlbumOrder>
orderedTracks(tracks: Track[], ids?: string[]): Track[]
```

Lyrics are limited to 100,000 characters/2,000 parsed lines. User and LRC header offsets accept ±10,000 ms. Editor files must be LRC/TXT up to 300 KB and also pass character/line limits. No timestamps are fabricated for text or MPEG-frame tags. Album/playlist permutations reject duplicate, missing or foreign IDs. Artist photos use the existing raster processing/size limits and are independent of Settings-gated track-tag editing.

Queue actions additionally include `{type:'enqueue', ids}` and `{type:'jump', id}`. Appending to an empty queue selects the first ID with paused intent. Jump preserves queue/shuffle/original order. Lyrics/profile/reorder dialogs provide source-safe local changes; the current queue remains a snapshot until explicitly changed.

## Automatic lyrics and storage protection

```ts
interface LyricsLookup {
  key: string;
  status: 'found' | 'not-found' | 'instrumental' | 'error';
  checkedAt: number;
  retryAt?: number; // provider cooldown deadline (epoch milliseconds)
}
interface LyricsResult { lookup: LyricsLookup; lyrics?: Lyrics }
lyricsKey(track: Pick<Track, 'title' | 'artist' | 'album' | 'duration'>): string
needsLyrics(track: Track, now?: number): boolean
lookupLyrics(track: Track, signal: AbortSignal): Promise<LyricsResult>
saveLyricsResult(id: string, result: LyricsResult): Promise<Track>
recordContentHash(id: string, contentHash: string): Promise<Track>
useAutomaticLyrics(tracks: Track[], enabled: boolean, busy: boolean,
  onResult: (id: string, result: LyricsResult) => Promise<void>, priority?: string)
requestPersistentStorage(): Promise<boolean>
libraryFootprint(tracks: Track[]): {audio: number; artwork: number; lyrics: number}
formatBytes(value: number): string
```

`lookupLyrics` calls `https://lrclib.net/api/get` with required `track_name`/`artist_name` and optional known album/duration. No key/account/backend is needed. Credentials/referrer are omitted; no audio or artwork is transmitted. It identifies the client with Lrclib-Client and verifies normalized artist/title, including diacritics and limited title decorations. Filename Artist - Title inference is conservative. After exact/album fallback it searches structured then free-text candidates (maximum twenty), ranked by album/duration/text. Known duration differences above eight seconds are rejected; LRC synchronization requires at most three seconds, otherwise only plain text is eligible. JSON is bounded to 600 KB and the whole lookup times out after fifteen seconds. Subrequests are spaced 250 ms; 429/503 Retry-After can set lookup.retryAt. Manual retries still respect that deadline. Cancellation rejects and must not save a result. Not-found results cache one day, instrumental results seven days and failures fifteen minutes. API availability/CORS and provider coverage remain external dependencies.

`saveLyricsResult` atomically rejects stale metadata matches or manual/embedded overrides and never recreates deleted tracks. Repository records persist raw lyric text without parsed lines; public reads rehydrate them. Hooks preserve active Blob identity on merges. `player.blend` exposes progress, actual seconds, outgoing/incoming Blobs and optional resolved `from`/`to` tracks; null means no overlap. This remains internal transition state for fading covers; the UI does not expose a mix progress meter or banner.

Storage estimates are approximate and exclude general database overhead; cover estimates include original-cover metadata retained for restoration. Persistent storage is browser-controlled eviction protection, not a backup or protection against clearing site data.

## Three-platform update

Home is the initial web page; Settings is now a full page, not a dialog. Lyrics starts open in a collapsible section each time Now Playing expands or the song changes. Redundant source/playback status text is removed. The original curved W mark replaces generic waveform bars. Online automatic lyrics is optional/off initially, while manual one-song lookup remains available. Exact/search requests validate artist/title/duration, identify the client, and honor provider cooldowns; availability cannot be guaranteed. Crossfade uses incoming media time and equal-power gains, not elapsed wall time. Duplicate cleanup merges only confirmed byte-identical records, preserving references; same-name groups are reviewed non-destructively.

Separate native Android (Kotlin/Compose) and Windows (C#/WPF) source implementations exist; prior web-only scope statements apply to the web architecture, not the entire project. They are early, uncompiled in this workspace and lack full web parity. [PLATFORMS](PLATFORMS.md) is the authoritative build/status matrix. [Privacy](../PRIVACY.md) describes data flows, rights and unresolved public-release obligations.

## Verified duplicate maintenance (web)

`mergeExactDuplicates(keepId: string, ids: string[]): Promise<void>` independently hashes every selected Blob, rejects missing/duplicate IDs or different bytes, and performs track/reference changes in one IndexedDB transaction. It retains the chosen identity, ORs favorite flags and prefers local then embedded lyrics. Playlist/album-order IDs are remapped and deduplicated. Only explicit user review invokes it; `duplicateNames(tracks)` groups title + artist for non-destructive edition review. The maintenance UI selects the currently playing ID as keeper when present; hook reloads preserve surviving audio Blob identity.

### Playback-session storage

`wave-playback-session-v1` holds versioned queue/order IDs, selected index, repeat/shuffle and finite per-song positions. No audio or artwork is copied into localStorage. Invalid/unavailable storage falls back to a fresh paused session. Restoring a session never autoplays; Play resumes the restored selection/position. Explicit song selection starts that song from the beginning.

### Decoded recording duration

`recordDecodedDuration(id, duration)` updates a track’s metadata after the actual decoder duration is known. Audio blobs/quality and manually imported lyrics are unchanged. Incompatible online lookup caches are invalidated through the existing metadata cache-key rules. Source IDs guard against late events from a different track.

### Listening activity

`useIdleListening(playing)` returns the current immersive state and a wake action. Entry requires 30 seconds of inactivity, a visible page and no non-player dialog; `PlayerBar` also requires a non-buffering selected track. Pointer, touch, keyboard, wheel or visibility changes clear immersion. The hook never starts, pauses, seeks or changes audio.

### Visual identity

`useAppPalette(artwork?)` updates root palette roles from playing local artwork (pass no artwork to restore the base roles on pause), with optional native View Transition reveal and a small local appearance preference. It does not alter audio or enable online lookup.

`playlistIcon(id, name, colors?)` returns an escaped deterministic SVG data URI. `usePlaylistVisual(playlist, tracks)` returns the explicit or generated artwork and sampled colors; custom artwork wins. Default labels use a flat list/note glyph, contrast-aware ink and up to four member-color bands, with up to twelve distinct member-cover samples cached in memory, and does not mutate playlist/audio records.

Idle entry now additionally requires `document.hasFocus()`. `blur` wakes the player; normal lyric navigation scrolls the internal document without seeking. Cinema is read-only and displays complete current text, or centered metadata when lyrics are absent.

## Expressive listening utilities

- `StartupAnimation({loading})`: initial accessible loading mark; one W/line/wave/W presentation, without extra dwell under reduced motion.
- `useInteractionRipples()`: transient control-local pointer feedback; no semantic controls or persistent user data.
- `amplitudeEnvelope(channels, sampleRate): EnergyEnvelope`: ten amplitude bins per second derived from source-channel RMS.
- `energyAt(envelope, time): number`: interpolates bounded visual energy; missing/out-of-range/invalid time yields zero.
- `useMusicEnergy(player)`: optional read-only native-deck capture/analyser, with bounded offline-envelope fallback, using `readElement()`/`readTime()`/volume and root `--music-energy`/`data-music-active`. Large files are not excluded from live capture; sources beyond fallback bounds remain still if capture is unavailable. No stored audio bytes or native output nodes are changed.

`useAutomaticLyrics` exposes pending as well as active lookup IDs through `loading`; generation/abort checks protect replacement requests. Manual retries obey persisted service cooldowns but bypass generic background backoff. `LyricsPanel` displays and disables lookup during provider cooldown; it never fabricates lyric availability or synchronization.

- `WaveSeek({time, duration, playing, onSeek})`: width-observed SVG seek path/clip/thumb over a native accessible range. Unknown duration disables input; position is clamped to recording bounds, and system/app reduced motion suppresses travel.
- `MusicAnalyzer(element)`: reads the element's captured source through an unconnected-to-output analyser. `read()` returns bounded RMS amplitude or `undefined` when unavailable; `setVisible()` suspends/resumes the analysis context, and `dispose()` releases only captured tracks/context, never playback.
- `usePlayer().readElement()`: reads the currently active native deck for visualization without allocating or replacing an audio element.
- `lyricsKey(track)`: versioned metadata cache identity. Matcher revisions may invalidate old misses; manual/embedded and already-saved lyrics retain precedence.

### Spectral and listening refinements

- `MusicAnalyzer.readBands(): MusicBands | undefined` reads bass/body/air spectral energy, not isolated sources. `spectrumBands(decibels, sampleRate, fftSize)` classifies finite bins without changing output.
- `MusicLighting({className})` renders noninteractive radial illumination, not wave silhouettes; root band/phase variables control movement and motion preferences suppress it.
- `albumIdentity(value)` canonicalizes supported reissue suffixes. `albumMatch(local, remote)` returns `match`, `unknown` or `conflict`; recording matching uses this alongside title/artist/duration and edition safety.
- `QueuePanel({player, tracks, onAdd})` renders a bounded themed queue, scrolls the current row into view and never seeks merely because the current row was selected.
- Lyric timing reset uses the existing atomic `onOffset` callback; failed saves leave controls reusable and report a friendly error, without changing the stored offset optimistically.

### Mix and context surfaces

- `mixCues(envelope, duration): {start, end}` returns conservative original-recording cue times or full boundaries when unavailable; does not rewrite audio.
- `mixGains(progress, mix): {outgoing, incoming}` provides bounded complementary equal-power gains with staged or classic phase.
- `MixAudio.setMixEnabled(enabled)` opts into staged curves and cue analysis; `mixRemaining` reads the effective outgoing duration minus original media time.
- `useAppPalette(artwork?, blend?)` follows actual overlap colors; blend accepts `{from: {artwork?}, progress, seconds}` or null. Reduced motion applies the incoming target directly.
- `ContextMenu({x, y, title, actions, onClose, returnFocus?})` provides top-layer, edge-clamped keyboard-accessible actions. Each action contains `label`, `icon`, optional `disabled` and `run`.
- Queue reorder is independent of saved playlist/album order. Permutations with missing, foreign or duplicate IDs are rejected. Native source/time are retained for the selected song.

### Automatic Mix, continuation and metadata checks

- `automaticMixSeconds(outgoingDuration, incomingDuration)` returns the automatic finite handover window, bounded by the shorter recording and eight seconds. No manual duration control remains.
- `continuationQueue(tracks, current, recent, random?, limit?)` selects unique local IDs by contextual weighted variety, preferring alternatives outside the last twelve recent IDs. A single-song library yields no continuation. Reducer `continue` is accepted only at a playing, repeat-off queue boundary.
- `parseLocalMetadata(file)` uses one reusable module worker, disposed after idle, and falls back to direct parsing when workers are unavailable. `readTrack` records `genres`, `year` and local `metadataCheck` alongside existing tags and audio Blob.
- `metadataIssues(track)` identifies incomplete local title/artist/album/duration/artwork. Completeness is not authoritative recording identification.
- Legacy `wave-metadata-consent-v1` is ignored: no catalogue service or online cover completion remains. `wave-mix-v2` migrates an older disabled/positive overlap preference without retaining a duration UI. `wave-autoplay` is local and can be switched off.

### Settings and local review

- `SettingsPage({onBack, appearance, playback, lyrics, library, storage, about})` owns a nullable selected submenu and renders only the selected React-node content. Back restores menu-card focus; leaving Settings returns focus to its opener. No preference modal or external metadata service is created.
- `LocalMetadataReview({tracks})` recomputes `metadataIssues` from current fields, not old online suggestions, and pages eight incomplete songs at a time. No field is remotely completed or silently reverted.
- Settings preferences retain their existing storage keys. The six menu IDs are component-local navigation, not new server routes.

### 0.1.0 candidate additions

- `dailyMixes(tracks, localDayKey): DailyMix[]` returns at most three disjoint genre-tag groups, with explicit artist-tag fallback for songs without useful genres. A group needs three unique song IDs; results cap at thirty per group, retain original Track objects and never mutate saved playlists. Stable ID ordering and a day/group seed make selection deterministic for an unchanged library/day; the first song rotates daily.
- `localDayKey(date?)` uses the browser's local calendar, not UTC midnight. `DailyMixes` refreshes at the next local midnight and on focus/visibility changes; current playback is not replaced when the displayed mixes refresh.
- `LyricsEditor({track, retryAt?, onSave, onClose})` offers explicit one-song search independently of playback and automatic consent. Results are preview-only until applied to the draft and saved. Closing/canceling aborts requests; failures retain draft content. Unmodified applied results preserve LRCLIB provenance/provider ID; edited/imported text is local.
- `wave-lyrics-provider-retry-at` shares provider Retry-After across editor/player/background callers. Pre-aborted lookups reject; oversized advertised bodies are canceled. Existing recording/version/timeline verification remains unchanged.
- `wave-large-text` persists the Appearance larger-label preference. It neither changes stored metadata nor adds any external request.
- Metadata-worker requests have a thirty-second deadline, clear completed timers, release idle workers and recover on a later file without retrying a timed-out parse on the UI thread.
