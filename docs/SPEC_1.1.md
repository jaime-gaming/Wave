# Wave 1.1 — Device sync, YouTube links and playlist import

Status: **technical foundation implemented; not yet connected to the interface.**
Scope decisions recorded on 27 October 2026. Release 0.1.0 remains the published version.

This document is the contract for Wave 1.1. It records what was decided, what is
implemented in the source tree, what still has to be built, and which parts of the
product cannot be promised because a provider or a browser forbids them.

## 0. Audio integrity: the invariant that outranks every feature

**No Wave feature may reduce audio quality.** Nothing in 1.1 re-encodes,
resamples, changes bit depth, changes bitrate, normalises, or rewrites tags of a
copied file. A song that reaches another device is bit-identical to the one it
came from, and the code refuses anything else.

Enforced by [`src/sync/integrity.ts`](../src/sync/integrity.ts) and proven by
[`src/sync/roundTrip.test.ts`](../src/sync/roundTrip.test.ts):

- The byte buffer produced by a transfer is authoritative. It is never run
  through a decoder and re-saved; no "quality" option exists to choose.
- **Whole-file SHA-256** is compared before anything is persisted. A single
  altered byte fails the check and the copy is discarded, even when the size
  matches.
- The received size must equal the announced size exactly. A truncated or padded
  transfer is rejected, never repaired or padded.
- Lossless sources (FLAC, WAV, AIFF) keep their exact sample rate, bit depth and
  channel layout. A 24-bit/96 kHz original stays 24-bit/96 kHz.
- M4A is never _claimed_ to be lossless, because the container may hold AAC.
  Wave does not guess about quality in either direction.
- Artwork and lyrics never travel inside the audio payload, so nothing can be
  re-compressed into the file being copied.
- The loan record is written only after verification succeeds, and the store
  re-verifies when a caller passes an expected digest.
- The user-facing note for every loan says exactly what happened
  (`loanQualityNote`): a lossless original copied byte for byte, or the original
  file with no bitrate change.

Transfer cost is bytes, not quality: a 60 MB FLAC loan uses 60 MB on the phone
and takes proportionally longer. There is **no** "compress to save space" path,
and there will not be one.

## 1. Decisions

| Topic              | Decision                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sync model         | **Hybrid**: direct peer-to-peer while the computer is on, plus **temporary loans** so the phone keeps playing when the computer is off.                                                                                                           |
| Loan lifetime      | **Bounded by space, not time.** The borrowing device can delete one loan or every loan of a device from an "Offline devices" list. Least-recently-used unpinned loans are evicted when a new loan does not fit, and the interface must report it. |
| Linking            | Must work on the same network **and** across networks. Pairing itself never depends on the computer's IP address.                                                                                                                                 |
| Phone target       | **Native Android app** (`platforms/android`), protocol shared with the web client. iOS is out of scope for 1.1.                                                                                                                                   |
| YouTube            | **Official embedded player only.** No audio extraction, no proxying, no downloads.                                                                                                                                                                |
| Playlist import    | **Match against the local collection.** Wave builds the playlist with what you already own and reports the gaps. It never fetches audio.                                                                                                          |
| Accounts / backend | Still none. There is no Wave account, no cloud library and no upload of a user's music.                                                                                                                                                           |

## 2. What "sync" means here

Wave does not become a streaming service. Three separate behaviours share one
pairing:

1. **Mirror (metadata only).** Both devices exchange their library index
   (`library-index`: title, artist, album, duration, size). No audio and no
   artwork are sent by this step.
2. **Direct playback (computer on).** When the phone plays a song it does not
   own, it requests that file from the computer over the paired channel. The
   file is verified and played from local storage, then kept only while it fits
   in the borrowed-audio budget.
3. **Loan (computer off).** The user explicitly selects songs or playlists to
   "llevar" to the phone. Those files are copied, verified with SHA-256 and
   remain playable while the computer is off. They stay until the user deletes
   them, another loan needs the space, or the granting device revokes them.

Loans are complete files, not fragments: a partially transferred song is never
playable, and a verified loan can be played offline without asking the computer
for anything.

### Why the computer can stay off

A loan is stored on the borrowing device, so playback needs no connection. The
consequence is explicit: while borrowed songs exist, the phone holds a **temporary
copy** of those files. The interface must say so, show the exact size, and offer a
single action to delete them. Wave never hides this behind "cache".

## 3. Pairing

Implemented in [`src/sync/pairing.ts`](../src/sync/pairing.ts) and
[`src/sync/session.ts`](../src/sync/session.ts).

```text
Host                                        Guest
 │  generate ephemeral ECDH P-256 key pair    │
 │  show link/QR: wave://pair/1/<id>.<n>.<k>  │
 │ ───────────── scanned / opened ──────────▶ │
 │                                            │  generate own key pair
 │ ◀────────────── hello (publicKey) ─────────│
 │ ─────────────── hello (publicKey) ────────▶ │
 │  ECDH + HKDF-SHA-256 → AES-256-GCM key     │
 │  six-digit code derived from both keys     │
 │  user compares the code on both screens    │
 │ ◀────────────── pair-confirm ───────────── │
 │ ─────────────── pair-confirm ────────────▶ │
 │               paired: all frames sealed    │
```

- The invite carries a **public key, not a password**. A leaked or photographed
  QR code only allows an attempt to pair, which still needs the six-digit
  confirmation on the granting device.
- The six-digit code (SAS) is derived from both public keys. If a relay
  substituted its own key, the codes differ and the user rejects.
- Invites expire after **120 s**; the state machine reports `timeout`.
- Every frame after pairing is sealed with AES-256-GCM, with the protocol
  version bound as additional data. A tampered or foreign frame fails
  authentication and the session stops instead of applying partial data.
- The protocol version is part of `hello`; a mismatch fails with
  `unsupported-version` instead of best-effort parsing.
- Pairing requires a secure context (HTTPS or `localhost`) because Web Crypto is
  unavailable otherwise.

### Transport

The session only calls `send(text)` and receives text, so the same state machine
works over any channel:

| Situation                           | Transport                                                                                       | Status       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ------------ |
| Same Wi-Fi, host is a browser       | `RTCDataChannel`, SDP exchanged by QR or the local `wave` helper                                | to implement |
| Same Wi-Fi, host is Android/Windows | Direct HTTPS server on the host with a pinned certificate fingerprint in the QR                 | to implement |
| Different networks                  | `RTCDataChannel` plus a **signalling-only relay** (no audio) and TURN only when NAT requires it | to implement |
| Tests                               | In-memory channel                                                                               | implemented  |

The relay is the only new service Wave would need, and it must be designed to
carry no library data: it forwards encrypted SDP/ICE payloads during pairing and
is never in the audio path when a direct connection succeeds. A TURN server does
relay encrypted bytes when two symmetric NATs cannot connect; that limitation must
be documented in PRIVACY.md before release.

## 4. Protocol

Implemented in [`src/sync/protocol.ts`](../src/sync/protocol.ts). Version `1`,
JSON text frames, hard limit **96 KiB per frame**, **48 KiB** raw audio per chunk,
**200 MB** per file (same ceiling as a local import).

| Frame                          | Direction        | Purpose                                                           |
| ------------------------------ | ---------------- | ----------------------------------------------------------------- |
| `hello`                        | both             | Device identity, platform, protocol version, ephemeral public key |
| `pair-confirm`                 | both             | Echo of the six-digit code                                        |
| `pair-reject`                  | both             | Explicit refusal                                                  |
| `library-index`                | both             | Metadata of downloadable songs (paged, `complete` flag)           |
| `loan-offer`                   | borrower → owner | Requested songs with size, optional title/artist                  |
| `loan-accept` / `loan-decline` | owner → borrower | Which requests fit                                                |
| `transfer-start`               | owner → borrower | Size, SHA-256, chunk size and count                               |
| `transfer-chunk`               | owner → borrower | Base64 audio chunk with its index                                 |
| `transfer-complete`            | borrower → owner | Digest confirmation                                               |
| `transfer-abort`               | both             | Cancel with a reason                                              |
| `revoke-loan`                  | owner → borrower | Delete a loan remotely                                            |
| `ping` / `pong`                | both             | Liveness                                                          |
| `error`                        | both             | Machine code plus human message                                   |

Validation is total: unknown types are ignored, oversized frames are refused,
digests must be 64 hex characters, chunk counts must match
`ceil(size / chunkSize)`, base64 is checked before decoding, and transfer
metadata is re-validated inside the assembler. `TransferAssembler` rejects
duplicate, missing and oversized chunks and verifies the final SHA-256, so
corrupted audio is never stored.

Hardening added after the first review:

| Risk                                          | Control                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A recorded frame being replayed later         | Every sealed envelope carries a monotonic `n`; a repeated, missing or far-future sequence fails with `replay` |
| A forged envelope consuming a sequence number | The receive counter advances only **after** successful authentication                                         |
| Memory exhaustion from a huge ciphertext      | Sealed envelopes larger than 140 KB are refused before allocation or decryption                               |
| A 50 000-song index in one message            | `paginateLibraryIndex` pages it under the 96 KiB limit and marks only the final page `complete`               |
| A sender with inconsistent metadata           | `TransferSender` re-validates the header and that the payload matches the announced size                      |
| A corrupted transfer blocking a retry         | `LoanInbox.complete` always releases the transfer, on success or failure                                      |
| Undecodable chunk text                        | Base64 is validated and a decode failure raises `invalid-chunk` instead of a raw exception                    |

## 5. Loan accounting

Implemented in [`src/sync/loan.ts`](../src/sync/loan.ts).

- Default budget: **2 GB** and **2 000 songs**, both configurable. A 200 MB file
  is the per-song ceiling.
- A loan stores: `loanId`, `trackId`, `deviceId`, size, `grantedAt`,
  `lastUsedAt`, `pinned`, optional title/artist.
- **Pinned** loans are never evicted automatically. Everything else is evicted
  **least recently used first**, with `grantedAt` and `loanId` as deterministic
  tie-breakers.
- A request that cannot fit next to pinned loans is rejected (`too-large`), as is
  one above the 200 MB ceiling (`invalid`). Rejections are reported per song; a
  playlist import fails per item, not as a whole.
- `expiresAt` exists in the model but is only honoured when a caller sets it.
  1.1 has **no automatic expiry**.
- `summarizeDevices` produces the "Offline devices" list: per device, bytes,
  number of songs and last use.

## 6. Local persistence

Implemented in [`src/sync/store.ts`](../src/sync/store.ts).

```text
IndexedDB "wave-sync" (version 1)
├── devices   { deviceId, name, platform, pairedAt, lastSeenAt }
├── loans     { loanId, trackId, deviceId, size, grantedAt, lastUsedAt, pinned }
└── audio     { loanId, bytes: ArrayBuffer, type }
```

- The music library database (`wave-library`, schema 3) is **not modified**, so its
  migration path and existing tests stay valid.
- Loan record and audio bytes are written in **one transaction**. Evictions happen
  in the same transaction as the write that needs the space, so a crash cannot
  leave a record without bytes or bytes without a record.
- Audio is stored as a verified byte buffer rather than a `Blob`. Structured
  cloning of `Blob` is unreliable in some IndexedDB implementations; the buffer is
  authoritative because the digest has already been checked, and a `Blob` is
  rebuilt on read for playback.
- Deleting a loan, deleting a device, or forgetting a paired device removes its
  audio in the same operation.

## 7. Songs from YouTube

Implemented in [`src/domain/youtube.ts`](../src/domain/youtube.ts).

- Accepted links: `watch?v=`, `youtu.be`, `/shorts/`, `/embed/`, `/live/`,
  `music.youtube.com`, `youtube.com/playlist?list=` and a bare 11-character ID.
  Playlist context (`list=`) and start time (`t=`, `start=`, `1h2m3s`) are kept.
- Playback uses the privacy-enhanced host `www.youtube-nocookie.com` with
  `rel=0`, `playsinline=1` and `enablejsapi=1`. The page origin is only forwarded
  when it is a valid `http(s)` origin.
- Player messages are treated as untrusted: only documented
  `infoDelivery` events for the expected `videoId` are applied.
- What this cannot do, and the interface must state:
  - the song requires an internet connection and is **never available offline**;
  - it cannot be included in a loan or a device sync;
  - YouTube's own ads and restrictions apply, and autoplay may be blocked until
    the user interacts;
  - Wave cannot read the real duration, artist or album without a provider call,
    so entries imported from a link are marked as such instead of being invented.

### Embedding rules that must be respected

- One iframe per active player; the iframe is replaced (not reused) when the
  video changes.
- The embedded player is paused by Wave before another song plays; Wave's audio
  element and the iframe must never sound at the same time.
- The Now Playing screen needs an explicit "YouTube" affordance, because media
  keys and Media Session cannot control the embedded player reliably.
- No CSP currently blocks third-party frames, but any future CSP must allow
  `frame-src https://www.youtube-nocookie.com`.

## 8. Importing a Spotify or YouTube playlist

Implemented in [`src/domain/linkImport.ts`](../src/domain/linkImport.ts) and
[`src/domain/playlistImport.ts`](../src/domain/playlistImport.ts).

### Links understood

- Spotify: `open.spotify.com/playlist|album|track|artist/…`, locale prefixes
  (`/intl-es/…`), `spotify:playlist:…` and `spotify:user:…:playlist:…` URIs.
  `spotify.link` short links are rejected with an instruction to copy the full
  address, because resolving them needs a redirect request.
- YouTube: playlist and video links as above.

### Metadata retrieval (to implement)

Wave needs the track list without audio. Neither provider allows a durable
client secret in a browser, so:

| Provider | Mechanism                                                                                                                  | Consequence                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spotify  | Authorization Code **PKCE** with `playlist-read-private` and `playlist-read-collaborative`; `GET /v1/playlists/{id}/items` | Only playlists the user owns or collaborates on. Playlists owned by other accounts return `403` for new applications. A development-mode app is limited to five allow-listed users, so a public deployment needs Spotify's approval. |
| YouTube  | `playlistItems.list` (1 quota unit, 50 per page) plus `videos.list` for durations, with a referrer-restricted API key      | Public playlists only. Default quota is 10 000 units/day, so this is enough for personal use and must be rate-limited per user.                                                                                                      |

Both calls are **opt-in, metadata-only, and user-initiated**. They send the
playlist identifier and the app's credentials, never the user's library. Wave
must show what will be sent before the first request and keep the feature usable
without it (pasting a track list is the fallback).

### Matching

Performance: the first implementation compared every entry with every local song.
Measured on 300 provider songs against 5 000 local songs it took **13.8 s** on the
main thread, which would freeze the page. Matching now builds an inverted index
over canonical title tokens, so only candidates sharing a token are scored: the
same workload takes **~0.7 s** and produces byte-identical results, which a test
asserts against the exhaustive implementation. Playlists above 5 000 entries are
refused instead of exhausting memory.

For each provider entry, every local song receives a score:

1. Title and artist canonicalised with the existing lyric-matching helpers;
   decorations such as `(Official Video)`, `[Lyrics]`, `- Topic`, `feat.` and
   remaster markers are removed.
2. A duration difference beyond **5 s** rejects the pair; beyond **20 s** is
   treated as a different recording even with the same name.
3. Exact title + matching artist = `1.0`; exact title + partial artist = `0.9`;
   token overlap ≥ 0.9 + artist = `0.86`; weaker evidence scores lower.
4. Album agreement adds a small bonus; duration within 2 s adds another;
   disagreement alone never rejects.
5. Pairs are assigned strongest-first so a distinctive song cannot be taken by a
   generic entry; **a local song is used once**.
6. Result per entry: `matched` (≥ 0.82), `ambiguous` (a proposal exists but needs
   confirmation, including ties between two local copies), or `missing`.
7. The user can assign any candidate manually; accepting a song already used
   frees the previous entry instead of duplicating it.

The report is deterministic and is only a proposal: nothing is written to the
library or to a playlist until the user confirms. `suggestedPlaylistName` clamps
provider names to the domain limit.

### Explicit limits

- Spotify audio is never downloaded; there is no supported way to do it, and Wave
  will not attempt it.
- YouTube audio is not extracted either (see §7). A gap stays a gap, visible in
  the imported playlist.
- If the provider cannot be read (private playlist, missing approval, quota
  exhausted), Wave reports the provider's reason instead of pretending the
  playlist is empty.

## 9. Interface work still required

Nothing in this section exists yet; the modules above are pure logic.

1. **Settings → Devices**: pairing QR/code, paired device list, "Offline devices"
   with per-device size and a delete action, borrowed-space budget, and the
   privacy explanation.
2. **Library**: a "Borrowed" section showing which songs are loans and when the
   space will be needed.
3. **Add from YouTube**: paste a link, preview title/thumbnail, confirm; the row
   is stored separately from local files and marked as online-only.
4. **Import playlist**: paste a link, review matched/ambiguous/missing entries,
   resolve ambiguities, then create the playlist.
5. **Player**: an embedded-player mode that pauses the native element, exposes
   its own controls and disables crossfade, lyrics fill and loans for those rows.
6. **Android**: mirror protocol, loan store (app-private storage with the same
   capacity rules), WebRTC channel, foreground playback service and screens.

### Data model additions required for the interface phase

- `Track` gains `source?: { kind: 'youtube'; videoId: string; playlistId?: string }`
  and `blob` becomes optional for provider rows. Playlist membership must accept
  provider IDs, which means the library repository's `createPlaylist`/`updatePlaylist`
  membership filter has to validate both stores. This is a **schema v4** change
  with explicit migration tests, and it must not silently drop existing memberships.
- Music-library schema v4 migration must add the source field without touching
  bytes, and `deleteTrack` must not attempt to delete audio that does not exist.

## 10. Android implementation plan

The Android client is the "phone" target, so the protocol is implemented twice.
Contracts must stay byte-compatible: the same frame names, the same limits, the
same rejection reasons.

- `SyncProtocol.kt`: frame parsing/validation, `TransferAssembler`, chunking.
  Kotlin mirrors of `src/sync/protocol.ts`; unit tests use the JSON fixtures
  generated by the web suite.
- `PairedDevice.kt` / `LoanStore.kt`: app-private storage with the same capacity
  policy, plus a MediaStore-independent path so a loan never appears in the
  user's music folder.
- Transport: `org.webrtc` data channel, foreground service for the transfer, and
  an explicit "keep screen on" state so a 200 MB loan is not killed mid-transfer.
- Playback of a loan uses the existing `Player.kt` with a file URI; revocation
  deletes the file and stops playback if that loan is current.
- The Android app must remain usable without pairing; sync is additive.

## 11. Privacy, security and legal consequences

PRIVACY.md must be updated **before** release, not after:

- Loans are copies of the user's files on a second device. The document must say
  where they live, how to see them and how to delete them.
- The signalling relay, if deployed, must be described: what it receives
  (encrypted SDP/ICE and connection metadata), what it does not receive (audio,
  library metadata), and for how long it keeps anything.
- TURN, if deployed, relays encrypted audio. That is a materially different claim
  from "audio never leaves your devices" and must be stated plainly.
- Spotify and YouTube calls send the playlist identifier and app credentials;
  privacy documentation must list both integrations, their scopes and their
  retention, and remain off by default.
- The Spotify Developer Policy and YouTube Terms must be reviewed by the
  maintainer. Wave's current public claims ("no accounts, no backend, no music
  uploads") stay true for release 0.1.0 but will need qualification for 1.1:
  there is no Wave account and no Wave cloud, but paired devices can copy files,
  and a relay can be involved.
- This is not legal advice, and provider approval is not implied by the code.

### Threat model

| Threat                            | Mitigation                                                                 |
| --------------------------------- | -------------------------------------------------------------------------- |
| Someone scans the pairing QR      | Six-digit confirmation on the granting device; 120 s expiry                |
| Relay impersonates a device       | Keys are derived from both public keys; mismatched SAS stops pairing       |
| Tampered frames or audio          | AES-GCM on every frame; SHA-256 on every file before storage               |
| Malicious peer claims a huge file | Size ceilings, chunk-count validation, capacity policy                     |
| Stolen phone keeps playing loans  | Loans are deletable from the owner; revocation frame deletes them remotely |
| Orphaned data after a crash       | Single transaction for record + bytes; explicit cleanup API                |

## 12. Test status

Implemented and passing:

| Area                                                             | Tests                               |
| ---------------------------------------------------------------- | ----------------------------------- |
| YouTube links, embed URL, player events                          | `src/domain/youtube.test.ts`        |
| Spotify/YouTube link parsing and provider limits                 | `src/domain/linkImport.test.ts`     |
| Playlist matching, ambiguity, manual choice, determinism         | `src/domain/playlistImport.test.ts` |
| Frame validation, chunking, digest verification                  | `src/sync/protocol.test.ts`         |
| Key agreement, invite links, SAS, sealed frames                  | `src/sync/pairing.test.ts`          |
| Capacity policy, eviction, revocation, device summaries          | `src/sync/loan.test.ts`             |
| Pairing state machine, rejection, timeout, tampering, loan inbox | `src/sync/session.test.ts`          |
| Persistence, transactional eviction, cascade deletion            | `src/sync/store.test.ts`            |

Not yet covered, and required before the feature can be called finished: a real
WebRTC transfer on two devices, a transfer interrupted by a network change, the
Android Kotlin port, provider responses with pagination and rate limits, and a
screen-reader pass over the new dialogs.

## 13. Phased plan

1. **Foundation** (this change): domain, protocol, pairing, loans, persistence,
   tests, and this specification.
2. **Interface for imports**: "Add from YouTube" and "Import playlist" with
   matching review, plus schema v4 for provider tracks.
3. **Provider clients**: Spotify PKCE and YouTube Data API with consent, caching,
   pagination, quota/backoff and clear failures.
4. **Web transport**: WebRTC data channel, LAN pairing, on-demand playback of a
   remote song.
5. **Loan interface**: offline devices, borrowed-space budget, revocation, the
   warnings that make the model honest.
6. **Android port**: protocol, loan store, foreground transfer, playback, and the
   same privacy text.
7. **Relay and TURN**, only if cross-network pairing is required in practice, with
   the privacy review completed first.

Each phase keeps the library usable without the new feature, and no phase may
weaken an existing guarantee about originals, deduplication or local storage.
