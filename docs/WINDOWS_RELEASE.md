# Windows release preparation · 0.1.0

Release date: **17 October 2026**. This is a publication checklist, not a claim that an unsigned test ZIP is trusted or already released.

## What the build does

- Builds a normal framework-dependent .NET/WPF application, without packers, obfuscation, self-extracting payloads, runtime downloads or code injection.
- Uses the existing `asInvoker` manifest: no administrator permission request, service installation, antivirus exclusions or protection changes.
- Sets version, product, publisher and description metadata; enables deterministic compilation.
- Leaves executable and DLL files separate. Does not trim or compress them into a single executable.
- Runs contracts, WPF UI smoke, build/publish and a Defender scan **when the runner has active Defender**. The artifact's `security-scan.json` states whether scanning actually happened and the definitions used. An unavailable scanner is a visible warning, not a clean verdict.
- Includes upstream notices and per-file `SHA256SUMS.txt`; reports the ZIP hash in the CI summary. Hashes detect changes, not trustworthiness.

These measures improve transparency. They cannot guarantee zero false positives or establish SmartScreen/publisher reputation. Never tell users to disable Defender or add an exclusion. Investigate any detection before publication; genuine false positives can be submitted to the affected vendor for review.

## Signing

No signing certificate was provided, and no self-signed certificate is created or presented as trusted. CI test packages remain explicitly unsigned.

On a protected Windows release machine, obtain a trusted code-signing certificate through the normal publisher verification process. Keep its private key outside Git and chat. If the certificate is already available in the current user's certificate store, the opt-in script signs **only Wave's own EXE/DLL** and verifies the result:

```powershell
./platforms/windows/scripts/Sign-Release.ps1 `
  -Directory ./artifacts/windows `
  -CertificateThumbprint YOUR_PUBLIC_CERTIFICATE_THUMBPRINT `
  -TimestampServer https://YOUR_CERTIFICATE_PROVIDER_TIMESTAMP_SERVICE
```

Use the actual HTTPS timestamp service supplied by your certificate provider. A thumbprint is a certificate identifier, not a private key. The script fails for missing/expired/non-code-signing certificates or an invalid signature. It refreshes checksums after signing. Build the ZIP **after** signing; do not reuse an unsigned ZIP hash or label it signed.

Validate signatures on a clean target Windows system, scan the final signed files/archive, exercise playback/codecs/DPI/keyboard/shutdown and then publish exact hashes beside the release. Signing reduces ambiguity but does not guarantee that every security product will accept a new application.
