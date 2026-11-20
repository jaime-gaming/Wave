// swift-tools-version:5.9
import PackageDescription

/// The dependency-free heart of Wave for iOS.
///
/// The Xcode project builds the app from these same source files; this package
/// exists so the library, lyrics, Mix and performance contracts can be tested
/// with `swift test --package-path platforms/ios` on any Mac, including CI,
/// without a simulator or a signing identity.
let package = Package(
    name: "WaveCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v13)
    ],
    products: [
        .library(name: "WaveCore", targets: ["WaveCore"])
    ],
    targets: [
        .target(name: "WaveCore", path: "Wave/Core"),
        .testTarget(name: "WaveCoreTests", dependencies: ["WaveCore"], path: "WaveCoreTests")
    ]
)
