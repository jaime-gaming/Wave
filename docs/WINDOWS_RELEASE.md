# Windows release preparation · 0.2.2

Prepared **16 November 2026**. This document describes the release pipeline for an unsigned single-file build; it is not proof that a new build has been published. As of 19 November 2026, the latest public Windows asset is an older unsigned ZIP from v0.2.1. The v0.2.2 release has an Android APK but no Windows asset.

## What's verified in 0.2.2

- Links imported files and folders in-place by default without duplicating audio into `%LOCALAPPDATA%\Wave\audio` (Issue #14), with opt-in copy mode, custom storage folders and watched-folder rescanning in **Settings → Storage**.
- Uses lock-protected atomic JSON writes with rolling `.bak` backups and automatic `.corrupt` quarantine recovery, URI-safe `SafeFileUri` path encoding, missing-file `PrepareNext` guards, persisted complete-only Daily Mixes (`7–20`, max 3, day-locked covers + skeleton loader while building), Weekly/Monthly/Yearly Remix, strict non-duplicating `StickySectionDock`, draggable pill switches in Settings, click-only Shuffle/Repeat arrow animations, compressed expanded-player collapse and 100% local `NativeMood` AutoPlay.

## What the build does

- Builds a self-contained single-file .NET 10 / WPF executable (`Wave.exe`) with `<PublishSingleFile>true</PublishSingleFile>`, `<IncludeNativeLibrariesForSelfExtract>true</IncludeNativeLibrariesForSelfExtract>`, `<IncludeAllContentForSelfExtract>true</IncludeAllContentForSelfExtract>`, `<EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>`, `<DebugType>none</DebugType>`, and `<DebugSymbols>false</DebugSymbols>` in Release. Listeners double-click one file — no installer, no ZIP extraction, no .NET runtime install, and no extra files beside it.
- Uses the existing `asInvoker` manifest: no administrator permission request, service installation, antivirus exclusions or protection changes.
- Sets version, product, publisher and description metadata; enables deterministic compilation.
- Runs contracts, WPF UI smoke, single-file publish and a Defender scan when active Defender is present on the runner. The SHA-256 hash and scan summary are recorded in the GitHub Actions job summary for maintainers rather than cluttering the user-facing release assets.

## Windows signing and publication

The workflow does **not** sign `Wave.exe` and does not require a Windows certificate or Windows signing secrets. It records the SHA-256 hash and uploads the executable as a CI artifact. When called for a release tag, it attaches the same executable to that release after the checks pass. Android signing remains unchanged.

The executable is unsigned, so Windows SmartScreen or antivirus software may show a warning. A Defender scan is only a snapshot and does not establish publisher identity or guarantee that other security software will accept the file. Do not disable security protections to use Wave.

Updating this workflow alone does not publish or replace an existing release. The release workflow validates the tagged source and requires the tag to be on `main`; then it runs the native build and uploads its assets. Review the checks and the release before publication.

## Release Assets troubleshooting

The recent `Release assets` run 45074936015 completed validation and Android, then failed in Windows at the old **Sign single-file Wave.exe** step. The updated workflow on this branch removes that signing step; it does not require a Windows certificate. The existing v0.2.2 release still has only `Wave.apk`, so nothing has yet fixed its public Windows download.

To publish these changes, merge the reviewed branch into `main`, create a new version tag and corresponding GitHub release from that merged commit, and let **Release assets** run (or dispatch it for that existing release tag). The workflow validates that the tagged source is on `main` before building. Check both Android and Windows jobs and the release assets afterwards. A rerun for an older tag builds the **old tagged source**, not this branch; do not present it as a build containing these changes. Android needs the same persistent signing key as earlier installs; the latest inspected Android release job succeeded, but this does not verify future secret availability. Windows is unsigned and may trigger SmartScreen. iOS does not currently produce a signed IPA.
