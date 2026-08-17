// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CompanionCore",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "CompanionCore", targets: ["CompanionCore"]),
        .executable(name: "ClaudeChineseCompanion", targets: ["ClaudeChineseCompanion"]),
    ],
    targets: [
        .target(name: "CompanionCore", resources: [.process("Resources")]),
        .executableTarget(name: "ClaudeChineseCompanion", dependencies: ["CompanionCore"]),
        .testTarget(name: "CompanionCoreTests", dependencies: ["CompanionCore", "ClaudeChineseCompanion"], resources: [.process("fixture.json"), .process("ocr-fixture.json")])
    ]
)
