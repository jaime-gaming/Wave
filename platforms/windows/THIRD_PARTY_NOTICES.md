# Windows notices

Wave source is MIT-licensed; preserve the root LICENSE. WPF and .NET use MIT with upstream copyright and third-party notices. Native playback delegates to operating-system components; no FFmpeg/codec binaries are included.

CI publishes an unsigned **self-contained** test archive: it bundles the .NET 10 Windows Desktop runtime, so nothing has to be installed to run it. That is why the license and notice files below travel inside the archive. The .NET runtime v10.0.0 upstream LICENSE and THIRD-PARTY-NOTICES are preserved in this directory and copied to the archive as a baseline for SDK-generated host components. Sources: https://github.com/dotnet/runtime/tree/v10.0.0.

Before public production distribution, verify notices against the exact SDK/runtime artifacts of the runtime pack the archive now carries. The baseline here is not a release SBOM or proof of completeness. No signed installer is claimed.

Nunito Sans is shipped as four static instances under `Wave.Windows/Assets` (SIL Open Font License 1.1, `NunitoSans-OFL.txt` beside them) so the desktop window sets the same type as the web build rather than Segoe UI.
