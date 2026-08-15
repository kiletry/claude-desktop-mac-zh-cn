// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CompanionCore",
    platforms: [.macOS(.v13)],
    products: [.library(name: "CompanionCore", targets: ["CompanionCore"])],
    targets: [
        .target(name: "CompanionCore", resources: [.process("Resources")]),
        .testTarget(name: "CompanionCoreTests", dependencies: ["CompanionCore"], resources: [.process("fixture.json")])
    ]
)
