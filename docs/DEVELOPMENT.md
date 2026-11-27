# Wave development guide

**Development target: 0.3.0 · Updated 19 November 2026.** This is the current workflow; the earlier narrative and dated investigations are [archived](history/DEVELOPMENT_2026.md). For platform capabilities and limitations use [Platforms](PLATFORMS.md); for actual results use [Validation](VALIDATION.md).

## Setup and repository

Use Node 22.12+ or Node 24, npm and Git. Native work also needs the platform SDKs below. Clone the repository, then:

```bash
npm ci
npm run dev
```

Vite listens on `0.0.0.0` and permits configured `.e2b.app` preview hosts. Use relative URLs for browser requests. No account, `.env` or API key is needed for the local web player. The main repository map is in [Architecture](ARCHITECTURE.md). Configuration and standard entry points remain at the root; GitHub contribution guidance is in [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md). Do not commit downloaded music, secrets, SDKs, build artifacts or test reports.

## Checks

```bash
npm run build:i18n       # after changing i18n/es.json
npm run format:check
npm run lint
npm test
npm run build
npm run test:release
npm run release:check
python3 -m unittest discover -s scripts -p test_package_release.py
npx playwright install chromium
npm run test:smoke
npx playwright test tests/backup-v2.spec.ts --workers=1
```

`npm run test:e2e` is the larger historical diagnostic suite, not a claim that every historical case passes. Linux may need Playwright's system dependencies; `CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium. Browser tests generate synthetic audio. `npm run deploy:check` is a dry run, not a release; deployment and publication require separate authorization. Vite writes ignored `dist/`; Playwright reports and traces may contain local metadata and should be reviewed before sharing.

## Native toolchains

- **Android:** Android Studio/JDK/SDK and Gradle; source and tests in `platforms/android/`. Hosted workflows exercise unit tests, lint, signed CI APK and captures; CI signing is not a public distribution identity. Recheck install/update signing, focus, background and actual audio on a device.
- **Windows:** .NET SDK and Windows/WPF; source in `platforms/windows/`. Run the contracts and WPF smoke on Windows. The package is not proof of publisher trust or audio quality.
- **iOS:** Xcode 26 with the iOS SDK, on macOS. Run `swift test --package-path platforms/ios`, then `xcodebuild -project platforms/ios/Wave.xcodeproj -scheme Wave -destination 'platform=iOS Simulator,name=<installed iPhone>' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES ENABLE_TESTABILITY=YES CODE_SIGNING_ALLOWED=NO test`. The Xcode target includes generated PCM playback tests. Simulator builds are unsigned and do not produce a distributable IPA. Physical device signing is a separate operation.

The CI iOS screenshots use an in-memory simulator-only demo fixture; native captures are layout evidence, not real-device audio tests. Use [Platforms](PLATFORMS.md) and each platform's README for current feature gaps.

## Backup and storage testing

[Backup format](BACKUP_FORMAT.md) specifies WAVEBK1 and WAVEBK2. Test wrong passwords, tampered signatures and chunks, truncated files, foreign fingerprints, duplicate IDs and audio, full storage, reset and concurrent tabs. The fingerprint must be checked against a separately trusted value, not merely read from the backup. The browser creates a distinct non-extractable signing key; clearing site data or resetting Wave changes its identity. Never add private keys, real music, passwords or personal backups to fixtures.

A restore is reviewed before it writes, and only succeeds atomically into an empty library. It does not currently merge into an existing library. Legacy archives are unsigned and unencrypted; warn rather than inventing verification. Native clients do not yet implement this format. Compare designs and test vectors before claiming cross-platform compatibility.

## Manual QA

Check desktop and mobile widths; keyboard and assistive technology; dark/light themes; reduced motion and animations off; opening/closing the player rapidly without duplicate controls; offline and permission-denied flows; large libraries, low storage and malformed files. For playback use varied local recordings and physically test seek, pause, repeat, Mix, Bluetooth, headphones, interruptions and background/lock-screen controls. Test YouTube separately without extracting audio; see [YouTube Mix](YOUTUBE_MIX.md). Do not report simulated or mocked providers as live verification.

## Storage and debugging

`wave-library` is IndexedDB schema 5; `wave-sync`, `wave-sync-identity` and `wave-backup-identity` are separate databases. Preferences are localStorage. Browser devtools can expose private titles, lyrics and history: redact diagnostics before sharing. Imported originals and exports remain the user's responsibility; uninstalling or clearing site data can remove Wave's data. See [Privacy](../PRIVACY.md).
