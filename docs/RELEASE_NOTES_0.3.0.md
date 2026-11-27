# Wave 0.3.0

**In development; not yet published.** The public website and releases may contain an older
version. Check [Releases](https://github.com/jaime-gaming/Wave/releases) for actual assets.

## Highlights in the development source

- A cleaner web Home, a brief personal greeting and compact mobile collection shortcuts.
- Web playlist migration with review, progress, duplicate handling and manual YouTube match
  correction. Public lists and online results may be incomplete or unavailable.
- YouTube search requires an explicit result selection; player and interrupted-navigation
  safeguards improve reliability without downloading YouTube audio.
- Password-encrypted, device-signed web backups with fingerprint review and an empty-library
  restore. Legacy backups are readable but unencrypted. Native apps cannot yet restore these
  backups. See [backup safety](BACKUP_FORMAT.md).
- More consistent native Home and library browsing, improved LRC support and listening cards on
  Android and iOS that share artwork and details, not audio.
- Source-only iOS support and simulator captures. Future Windows release builds are configured
  to produce an unsigned standalone `Wave.exe`; neither configuration nor CI creates a public
  release by itself.

Features and libraries remain different across platforms. Provider uptime, physical-device
playback, native backup interoperability and release signing are not established by these notes.
See [Platforms](PLATFORMS.md), [Privacy](../PRIVACY.md) and [Validation](VALIDATION.md).
