# Screenshots and demo data

[Project overview and gallery](../README.md#screenshots) · [Galería en español](README.es.md#capturas) · [Platform builds](PLATFORMS.md)

The gallery documents the **development source**, not necessarily the latest public release. The
fixtures use generated or in-memory demo libraries; never use personal music, account details or
private metadata. Captures prove that a view rendered, not that playback, accessibility, battery
life or physical-device behaviour have been validated.

## Web

The web captures come from the built app and are written to `docs/media/`. From the repository root,
install the dependencies and Playwright's Chromium headless shell, build the site and start a preview:

```sh
npm ci
npx playwright install chromium-headless-shell
npm run build
npx vite preview --host 127.0.0.1 --port 5173 --strictPort
```

In a second terminal, run:

```sh
WAVE_URL=http://127.0.0.1:5173 npm run capture:docs
```

The capture script creates a temporary browser context and imports generated audio, artwork,
lyrics and listening history into it. It does not need your own library. Inspect the resulting PNGs
and the log before using them. The [web workflow](../.github/workflows/ci.yml) runs this against a
built preview on branch pushes; capture publication is best effort and can lag the source.

## Android

The native Compose screenshot tests use a demo library in the Android test harness, not a physical
device. With the [Android toolchain](../platforms/android/README.md) installed, run:

```sh
gradle -p platforms/android testDebugUnitTest -Dwave.screenshots=app/build/wave-screenshots
```

The output is under `platforms/android/app/build/wave-screenshots/`. The
[Android CI job](../.github/workflows/native.yml) runs unit tests, lint, the build and captures;
branch-push publication copies successful images to `docs/media/`. A test-harness capture does
not replace a device pass.

## Windows

On Windows with the [.NET toolchain](../platforms/windows/README.md), build and run the WPF smoke
harness with a disposable library:

```powershell
dotnet build platforms/windows/Wave.Windows/Wave.Windows.csproj -c Release
New-Item artifacts/windows-ui -ItemType Directory -Force | Out-Null
$output = (Resolve-Path artifacts/windows-ui).Path
$process = Start-Process platforms/windows/Wave.Windows/bin/Release/net10.0-windows/Wave.exe -ArgumentList @('--smoke-test', $output) -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Windows UI smoke failed' }
```

Images appear in `artifacts/windows-ui/`. The [Windows CI job](../.github/workflows/native.yml)
publishes successful captures with the `windows-` prefix on branch pushes. Review the images as
well as the smoke result; a rendered window is not an audio-quality test.

## iOS and iPadOS

The [iOS capture job](../.github/workflows/native.yml) builds the unsigned SwiftUI app, installs it
on an iPhone simulator, and uses a simulator-only in-memory fixture for each page. `simctl` captures
are checked for blank launches and published as `docs/media/ios-*.png` on successful branch pushes.
See the [iOS guide](../platforms/ios/README.md) for Xcode requirements and build/test commands.
These iPhone screenshots do not establish how the app behaves on an iPad or a physical device.

## Publication and review

Native CI will not publish captures if the relevant native source has advanced since the job began;
the job artifacts can still be inspected. Automated screenshots can also lag after a failed or
skipped capture, or differ from public releases. Before updating the gallery, check that each image
matches its label, is legible at its displayed size, contains no private data and represents the
platform and build it claims. Keep meaningful alt text in both project introductions.

Run the local documentation checks after changing images or links:

```sh
node --test scripts/documentation.test.mjs
```
