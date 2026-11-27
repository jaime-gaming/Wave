# Security policy

## Report a vulnerability privately

Please **do not open a public issue or pull request with an exploitable security problem**.
Contact the maintainer at [jaimegamingpro@gmail.com](mailto:jaimegamingpro@gmail.com), the public
contact listed on the [maintainer's GitHub profile](https://github.com/jaime-gaming). This public
address has not been independently verified as a monitored security-specific channel. If GitHub's
private vulnerability reporting is available for this repository in the future, it may also be
used. Do not assume that the private reporting button is currently enabled.

Include the affected version or commit, platform, a concise description, reproduction steps and
potential impact. A minimal synthetic example is helpful. Do not send passwords, signing keys,
real music, private backups, personal library data or unredacted logs. Ask before sending sensitive
material or testing against someone else's installation. The maintainer can follow up privately;
no specific response or fix deadline is promised.

## Scope and versions

Reports about the latest public release and current development source are welcome. Older releases
may not receive fixes; check [Releases](https://github.com/jaime-gaming/Wave/releases) before
reporting. The source may be ahead of the published website and packages. This policy is not a
promise of long-term support, a security audit or a bug bounty.

Relevant areas include public metadata endpoints, external embeds, local storage, device pairing,
backup import/export, dependency and release integrity. Test only systems and data you own or are
explicitly authorized to test. Do not access other users' information, degrade the service, or
publish details before a reasonable opportunity to investigate and coordinate disclosure.

## Protecting your data

Keep your original audio files and use a long unique backup password. For signed web backups,
verify the device fingerprint through a separate trusted channel; signatures do not identify a
person on their own. Native apps cannot yet restore web backups. Third-party services and providers
have their own policies; do not put credentials or private data in public playlist links. See
[Privacy](PRIVACY.md), [backup safety](docs/BACKUP_FORMAT.md) and
[third-party notices](THIRD_PARTY_NOTICES.md).
