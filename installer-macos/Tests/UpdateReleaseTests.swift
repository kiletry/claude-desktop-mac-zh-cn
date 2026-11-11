import Foundation
import XCTest
@testable import ClaudeChineseGenerator

final class UpdateReleaseTests: XCTestCase {
    func testVersionsCompareNumericallyAndRejectPrereleaseOrMalformedVersions() throws {
        XCTAssertGreaterThan(try GeneratorVersion("0.1.10"), try GeneratorVersion("0.1.9"))
        XCTAssertEqual(try GeneratorVersion("v1.2.3"), try GeneratorVersion("1.2.3"))
        for value in ["1.2", "v1.2.3-beta", "1.2.3.4", "../1.2.3", "1.02.3"] {
            XCTAssertThrowsError(try GeneratorVersion(value))
        }
    }

    func testCheckFetchesOnlyMetadataAndSelectsNewStableRelease() async throws {
        let client = UpdateFixtureHTTP(data: releaseJSON())
        let release = try await GitHubUpdateService(http: client).check(currentVersion: "0.1.9")
        XCTAssertEqual(release?.version.description, "0.1.10")
        XCTAssertEqual(client.requests, [GitHubUpdateService.latestReleaseURL])
        XCTAssertEqual(client.downloads, 0)
    }

    func testEqualOlderDraftAndPrereleaseAreNotOffered() async throws {
        for json in [releaseJSON(tag: "v0.1.9"), releaseJSON(tag: "v0.1.8"), releaseJSON(draft: true), releaseJSON(prerelease: true)] {
            let release = try await GitHubUpdateService(http: UpdateFixtureHTTP(data: json)).check(currentVersion: "0.1.9")
            XCTAssertNil(release)
        }
    }

    func testMissingDuplicateOrForeignAssetsAndForeignReleaseLinksAreRejected() async throws {
        for json in [releaseJSON(assetHost: "evil.example"), releaseJSON(checksums: false), releaseJSON(duplicateDMG: true), releaseJSON(link: "https://example.com/release")] {
            do { _ = try await GitHubUpdateService(http: UpdateFixtureHTTP(data: json)).check(currentVersion: "0.1.9"); XCTFail("Accepted invalid release") }
            catch { }
        }
    }

    func testChecksumsRequireOneExactFilenameAndMatchingDigest() throws {
        let digest = String(repeating: "a", count: 64)
        XCTAssertEqual(try UpdateVerification.expectedDigest(in: "\(digest)  Claude-v0.1.10-macOS.dmg\n", filename: "Claude-v0.1.10-macOS.dmg"), digest)
        for text in ["\(digest)  other.dmg", "bad  Claude-v0.1.10-macOS.dmg", "\(digest)  Claude-v0.1.10-macOS.dmg\n\(digest)  Claude-v0.1.10-macOS.dmg"] {
            XCTAssertThrowsError(try UpdateVerification.expectedDigest(in: text, filename: "Claude-v0.1.10-macOS.dmg"))
        }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        try Data("abc".utf8).write(to: file)
        try UpdateVerification.verifySHA256(file: file, expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertThrowsError(try UpdateVerification.verifySHA256(file: file, expected: digest))
    }
}

func releaseJSON(tag: String = "v0.1.10", draft: Bool = false, prerelease: Bool = false, assetHost: String = "github.com", checksums: Bool = true, duplicateDMG: Bool = false, link: String? = nil) -> Data {
    let base = "https://\(assetHost)/kiletry/claude-desktop-mac-zh-cn/releases/download/\(tag)/"
    let dmg: [String: Any] = ["name": "Claude-\(tag)-macOS.dmg", "browser_download_url": base + "Claude-\(tag)-macOS.dmg", "size": 100]
    var assets = [dmg]
    if checksums { assets.append(["name": "SHA256SUMS", "browser_download_url": base + "SHA256SUMS", "size": 287]) }
    if duplicateDMG { assets.append(dmg) }
    return try! JSONSerialization.data(withJSONObject: ["tag_name": tag, "draft": draft, "prerelease": prerelease, "html_url": link ?? "https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/tag/\(tag)", "body": "新版说明", "assets": assets])
}

final class UpdateFixtureHTTP: UpdateHTTPFetching, @unchecked Sendable {
    let fixture: Data
    private(set) var requests: [URL] = []
    private(set) var downloads = 0
    init(data: Data) { fixture = data }
    func data(from url: URL) async throws -> Data { requests.append(url); return fixture }
    func download(from url: URL, to destination: URL) async throws { downloads += 1; try fixture.write(to: destination) }
}
