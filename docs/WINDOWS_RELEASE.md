# Windows release preparation · 0.2.2

Prepared **16 November 2026**. Wave for Windows ships as a **single signed executable (`Wave.exe`)** with zero ZIP extraction, loose DLL sprawl, or technical sidecars exposed to listeners.

## What's verified in 0.2.2

- Links imported files and folders in-place by default without duplicating audio into `%LOCALAPPDATA%\Wave\audio` (Issue #14), with opt-in copy mode, custom storage folders and watched-folder rescanning in **Settings → Storage**.
- Uses lock-protected atomic JSON writes with rolling `.bak` backups and automatic `.corrupt` quarantine recovery, URI-safe `SafeFileUri` path encoding, missing-file `PrepareNext` guards, persisted complete-only Daily Mixes (`7–20`, max 3, day-locked covers + skeleton loader while building), Weekly/Monthly/Yearly Remix, strict non-duplicating `StickySectionDock`, draggable pill switches in Settings, click-only Shuffle/Repeat arrow animations, compressed expanded-player collapse and 100% local `NativeMood` AutoPlay.

## What the build does

- Builds a self-contained single-file .NET 10 / WPF executable (`Wave.exe`) with `<PublishSingleFile>true</PublishSingleFile>`, `<IncludeNativeLibrariesForSelfExtract>true</IncludeNativeLibrariesForSelfExtract>`, `<IncludeAllContentForSelfExtract>true</IncludeAllContentForSelfExtract>`, `<EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>`, `<DebugType>none</DebugType>`, and `<DebugSymbols>false</DebugSymbols>` in Release. Listeners double-click one file — no installer, no ZIP extraction, no .NET runtime install, and no extra files beside it.
- Uses the existing `asInvoker` manifest: no administrator permission request, service installation, antivirus exclusions or protection changes.
- Sets version, product, publisher and description metadata; enables deterministic compilation.
- Runs contracts, WPF UI smoke, single-file publish, Authenticode signing and a Defender scan when active Defender is present on the runner. The SHA-256 hash and scan summary are recorded in the GitHub Actions job summary for maintainers rather than cluttering the user-facing release assets.

## Signing

The CI workflow (`.github/workflows/native.yml`) Authenticode-signs `Wave.exe` with SHA-256 on every build:

- **Production / publicly trusted signing**: configure repository secrets `WINDOWS_SIGNING_CERT_BASE64`, `WINDOWS_SIGNING_CERT_PASSWORD`, and optional `WINDOWS_TIMESTAMP_URL` (defaults to `https://timestamp.digicert.com`). The workflow imports the PFX certificate into `Cert:\CurrentUser\My`, runs `platforms/windows/scripts/Sign-Release.ps1` with an HTTPS RFC 3161 timestamp, verifies `Valid` status, and deletes the temporary PFX immediately.
- **Branch-only fallback CI signing**: when no repository certificate secret is configured, CI generates a 4096-bit RSA Authenticode code-signing certificate and signs `Wave.exe` with SHA-256 for test artifacts. This certificate is not publicly trusted. Tagged release builds fail without a configured signing certificate; a signature alone does not guarantee SmartScreen reputation.

Manual signing on a release workstation uses the same script directly on `Wave.exe`:

```powershell
./platforms/windows/scripts/Sign-Release.ps1 `
  -ExecutablePath ./artifacts/windows/Wave.exe `
  -CertificateThumbprint YOUR_PUBLIC_CERTIFICATE_THUMBPRINT `
  -TimestampServer https://YOUR_CERTIFICATE_PROVIDER_TIMESTAMP_SERVICE
```
