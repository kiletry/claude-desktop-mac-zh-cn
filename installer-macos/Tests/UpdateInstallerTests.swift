import Foundation
import XCTest
@testable import ClaudeChineseGenerator

final class UpdateInstallerTests: XCTestCase {
    func testRealPublishedDMGPreparationOnIsolatedSignedTarget() async throws {
        guard let path = ProcessInfo.processInfo.environment["UPDATE_TEST_DMG_PATH"] else {
            throw XCTSkip("Set UPDATE_TEST_DMG_PATH to verify a downloaded v0.1.25 release without changing installed apps")
        }
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("updater-integration-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: root) }
        let target = root.appendingPathComponent("Claude 中文生成器.app")
        try fm.createDirectory(at: target.appendingPathComponent("Contents/MacOS"), withIntermediateDirectories: true)
        try fm.copyItem(atPath: "/usr/bin/true", toPath: target.appendingPathComponent("Contents/MacOS/Generator").path)
        let info: [String: String] = ["CFBundleIdentifier": "com.kiletry.claude-desktop-mac-zh-cn-generator", "CFBundleShortVersionString": "0.1.24", "CFBundleExecutable": "Generator", "CFBundlePackageType": "APPL"]
        try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: target.appendingPathComponent("Contents/Info.plist"))
        let signer = Process()
        signer.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        signer.arguments = ["--force", "--sign", "-", target.path]
        try signer.run()
        signer.waitUntilExit()
        XCTAssertEqual(signer.terminationStatus, 0)
        let dmg = URL(fileURLWithPath: path)
        let release = GeneratorRelease(version: try GeneratorVersion("0.1.25"), tag: "v0.1.25", pageURL: URL(string: "https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/tag/v0.1.25")!, notes: "integration", dmgURL: dmg, checksumURL: dmg.deletingLastPathComponent().appendingPathComponent("SHA256SUMS"), size: Int64(try dmg.resourceValues(forKeys: [.fileSizeKey]).fileSize!))
        let helper = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/install-update.sh")
        let installer = GeneratorUpdateInstaller(http: LocalReleaseHTTP(), helperURL: helper)
        let prepared = try await installer.prepareValidatedTarget(release: release, target: target)
        defer { try? fm.removeItem(at: prepared.helper.deletingLastPathComponent()) }
        try GeneratorUpdateInstaller.validateIdentity(prepared.staged, expectedVersion: "0.1.25")
        try GeneratorUpdateInstaller.validateIdentity(target, expectedVersion: "0.1.24")
        XCTAssertTrue(fm.fileExists(atPath: prepared.helper.path))
        XCTAssertFalse(fm.fileExists(atPath: prepared.helper.deletingLastPathComponent().appendingPathComponent(release.filename).path))
    }

    func testTargetPolicyAllowsOnlyInstalledGeneratorAndRejectsSymlinks() throws {
        let home = FileManager.default.homeDirectoryForCurrentUser
        XCTAssertNoThrow(try GeneratorUpdateInstaller.validateTargetLocation(URL(fileURLWithPath: "/Applications/Claude 中文生成器.app")))
        XCTAssertNoThrow(try GeneratorUpdateInstaller.validateTargetLocation(home.appendingPathComponent("Applications/Claude 中文生成器.app")))
        for path in ["/Applications/Claude.app", "/Applications/Claude 中文.app", "/Volumes/Claude 中文生成器/Claude 中文生成器.app", "/tmp/Claude 中文生成器.app"] {
            XCTAssertThrowsError(try GeneratorUpdateInstaller.validateTargetLocation(URL(fileURLWithPath: path)))
        }
    }

    func testCandidateValidationRejectsWrongIdentityVersionAndLinkedBundles() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let app = root.appendingPathComponent("Claude 中文生成器.app")
        try FileManager.default.createDirectory(at: app.appendingPathComponent("Contents"), withIntermediateDirectories: true)
        func write(_ id: String, _ version: String) throws {
            let data = try PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": id, "CFBundleShortVersionString": version], format: .xml, options: 0)
            try data.write(to: app.appendingPathComponent("Contents/Info.plist"))
        }
        try write("com.anthropic.claudefordesktop", "0.1.10")
        XCTAssertThrowsError(try GeneratorUpdateInstaller.validateIdentity(app, expectedVersion: "0.1.10"))
        try write("com.kiletry.claude-desktop-mac-zh-cn-generator", "0.1.9")
        XCTAssertThrowsError(try GeneratorUpdateInstaller.validateIdentity(app, expectedVersion: "0.1.10"))
        try write("com.kiletry.claude-desktop-mac-zh-cn-generator", "0.1.10")
        XCTAssertNoThrow(try GeneratorUpdateInstaller.validateIdentity(app, expectedVersion: "0.1.10"))
        let link = root.appendingPathComponent("linked.app")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: app)
        XCTAssertThrowsError(try GeneratorUpdateInstaller.validateIdentity(link, expectedVersion: "0.1.10"))
    }

    func testWrongDownloadDigestAbortsBeforeMountingOrStaging() async throws {
        let release = try exampleRelease()
        let http = InstallerFixtureHTTP()
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        // Use the production verification boundary without touching installed apps.
        let file = root.appendingPathComponent(release.filename)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try await http.download(from: release.dmgURL, to: file)
        let sums = String(data: try await http.data(from: release.checksumURL), encoding: .utf8)!
        let expected = try UpdateVerification.expectedDigest(in: sums, filename: release.filename)
        XCTAssertThrowsError(try UpdateVerification.verifySHA256(file: file, expected: expected))
    }
}

private struct LocalReleaseHTTP: UpdateHTTPFetching {
    func data(from url: URL) async throws -> Data { try Data(contentsOf: url) }
    func download(from url: URL, to destination: URL) async throws { try FileManager.default.copyItem(at: url, to: destination) }
}

private struct InstallerFixtureHTTP: UpdateHTTPFetching {
    func data(from url: URL) async throws -> Data { Data((String(repeating: "0", count: 64) + "  Claude-v0.1.10-macOS.dmg\n").utf8) }
    func download(from url: URL, to destination: URL) async throws { try Data("corrupt image".utf8).write(to: destination) }
}
