// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ClaudeChineseGenerator",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "ClaudeChineseGenerator", targets: ["ClaudeChineseGenerator"]),
    ],
    targets: [
        .executableTarget(name: "ClaudeChineseGenerator"),
        .testTarget(name: "ClaudeChineseGeneratorTests", dependencies: ["ClaudeChineseGenerator"], path: "Tests"),
    ]
)
