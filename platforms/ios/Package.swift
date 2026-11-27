// swift-tools-version:5.9
import PackageDescription







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
