# Wave architecture

**Development target: 0.3.0 · Updated 19 November 2026.** This describes the current source, not a promise of feature parity or release readiness. [Platforms](PLATFORMS.md) is the capability matrix; [Validation](VALIDATION.md) records evidence. Older design notes are [archived](history/ARCHITECTURE_2026.md).

## Product boundaries

Wave is local-first, with independent clients. The React/TypeScript web app is the most complete implementation; Kotlin/Compose Android, C#/WPF Windows, and SwiftUI iOS have their own native views, decoders and local persistence. No installation silently transfers its library to another. iOS is source-only and unsigned. Web-compatible Device Linking and backup restore are not implemented by native clients. YouTube search/playback exists as a separate preview on Android and iOS; Windows does not have it. See [Platforms](PLATFORMS.md) and [YouTube Mix](YOUTUBE_MIX.md) for the exact limitations.

## Repository map

```text
.github/              workflows and GitHub community guidance
README.md             product entry point
LICENSE, PRIVACY.md   legal and privacy entry points
package*.json         web dependencies and commands
index.html, vite.config.ts, wrangler.jsonc, tsconfig.json
                       web app, build and Worker entry points
src/
  components/         React controls, screens and accessible dialogs
  hooks/              UI state, playback and persistence orchestration
  domain/             music, lyrics, library and collection rules
  data/               IndexedDB, import and backup adapters
  data/backup/        legacy archive, encryption, identity and tests
  audio/              web audio analysis and Mix playback
  sync/               WebRTC linking, pairing and transfer protocol
  services/, worker/  opt-in provider clients and bounded Worker endpoints
  styles/, styles.css Wave tokens, responsive UI and motion
  i18n/, ui/          localization and shared interaction helpers
platforms/            independent Android, Windows and iOS applications
public/               web static assets, privacy page and offline shell
scripts/              build, release and capture tooling
infrastructure: docs/ guides and historical snapshots, tests/ browser tests
```

Root-level configuration and standard discovery files remain there deliberately: npm, TypeScript, Vite, Cloudflare, GitHub and contributors expect them. GitHub's community files live in `.github/`; media, release notes and guides live in `docs/`. Generated build output, dependencies, reports and personal music are not source files.

## Data and playback

The web library is IndexedDB `wave-library` schema 5: tracks and original Blobs, playlists, artists, album ordering, listening history and remembered folders. Settings and playback preferences use localStorage. Import validates size/format and computes a full-file SHA-256 identity; original audio is not rewritten. UI components render state, hooks own effects and lifecycle, and domain modules provide reusable decisions. `usePlayer` coordinates the media clock, queue and browser media session; audio analysis, Mix planning and gain/EQ control live under `src/audio/`. Native clients use their own OS decoders and persistence; inspect their platform folders rather than assuming web behavior.

Motion and responsive composition are part of the interface contract. Wave's motion helpers, `prefers-reduced-motion`, the app's animation preference and native performance profiles govern decorative transitions. The player handoff retains a single visible owner of controls and artwork; animation must not affect playback ownership. Test keyboard, screen readers, small viewports, interruption and rapid reversals as well as appearance. See [Design](DESIGN.md).

## Backups and identity

`src/data/backup/legacy.ts` owns the original WAVEBK1 archive and atomic restore. `secure.ts` wraps it in WAVEBK2: password-derived AES-256-GCM encrypted chunks and a signed manifest of ciphertext hashes. A separate non-extractable ECDSA P-256 private key in IndexedDB signs the archive; its public-key SHA-256 fingerprint is shown on export and restore. Compare it through a trusted independent channel: a signature alone verifies possession of a key, not a person's identity. Reset removes the key; a new browser/profile has a different fingerprint. Passwords are never persisted by Wave and cannot be recovered.

Restore validates signatures, chunk hashes, decryption, bounds and archive structure before a review. Exact audio duplicates are detected from bytes, not declared hashes; optionally skipping them keeps the first metadata and remaps playlist, album and history references. Conflicting record IDs are rejected. Restore rechecks **all** library stores inside one IndexedDB transaction and refuses a nonempty library; it does not merge libraries. Legacy WAVEBK1 imports remain possible but have no cryptographic integrity, device verification or encryption. Cross-platform import, selective restore, streaming-to-disk and independent security review remain future work. Full format and memory limits: [Backup format](BACKUP_FORMAT.md).

## Optional network boundaries

No account or telemetry is required. Public metadata lookups are opt-in or explicit as described in [Privacy](../PRIVACY.md): LRCLIB and iTunes can see the song query and connection details; the Worker provides bounded public playlist and YouTube search metadata. Web YouTube uses the official embedded player; it does not extract audio. Local-only Mix cannot guarantee handovers involving YouTube. Linking uses encrypted direct WebRTC with a user-compared code and public STUN; it is browser-only, requires explicit pairing, and has no TURN relay. [Pairing](PAIRING.md) documents the protocol and threat boundaries.

The web service worker caches the interface, not the user's audio, artwork or lyrics. The production Worker serves static assets and selected metadata endpoints; deploy is separate from build and tests.

## Validation and changes

Keep the EN/ES dictionary and generated native localization tables in sync with `npm run build:i18n`. Use the commands and native toolchains in [Development](DEVELOPMENT.md). Unit tests cannot establish audible quality, mobile performance, route changes or device safety; validate native playback, backgrounds, Bluetooth, interruptions and reduced motion on real devices. Never claim a signature, CI build or simulator test independently proves ownership, compatibility or actual output.
