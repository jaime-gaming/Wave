# Windows notices

Wave source is MIT-licensed; preserve the root LICENSE. WPF and .NET use MIT with upstream copyright and third-party notices. Native playback delegates to operating-system components; no FFmpeg/codec binaries are included.

CI publishes an unsigned **framework-dependent** test archive, requiring a separately installed .NET 10 Windows Desktop runtime. It does not bundle that runtime. The .NET runtime v10.0.0 upstream LICENSE and THIRD-PARTY-NOTICES are preserved in this directory and copied to the archive as a baseline for SDK-generated host components. Sources: https://github.com/dotnet/runtime/tree/v10.0.0.

Before public production distribution, verify notices against the exact SDK/runtime artifacts. Any future self-contained archive bundles a runtime and must include its resolved pack's license/third-party files; the baseline here is not a release SBOM or proof of completeness. No signed installer is claimed.
