import Foundation
import XCTest
@testable import ClaudeChineseGenerator

@MainActor
final class GeneratorUpdateModelTests: XCTestCase {
    func testStartupChecksOnceAndNeverInstallsWithoutExplicitAction() async throws {
        let checker = UpdateCountingChecker(release: try exampleRelease())
        let installer = UpdateCountingInstaller()
        let model = GeneratorUpdateModel(checker: checker, installer: installer, currentVersion: "0.1.9", target: URL(fileURLWithPath: "/Applications/Claude 中文生成器.app"))
        await model.checkOnLaunch()
        await model.checkOnLaunch()
        XCTAssertEqual(checker.calls, 1)
        XCTAssertEqual(installer.calls, 0)
        guard case let .available(release) = model.state else { return XCTFail("Missing update prompt") }
        XCTAssertEqual(release.version.description, "0.1.10")
        await model.checkManually()
        XCTAssertEqual(checker.calls, 2)
    }

    func testInstallRequiresAvailableReleaseAndExclusiveGenerationLock() async throws {
        let installer = UpdateCountingInstaller()
        let model = GeneratorUpdateModel(checker: UpdateCountingChecker(release: try exampleRelease()), installer: installer, currentVersion: "0.1.9")
        await model.checkOnLaunch()
        await model.install(acquire: { false }, release: {}, terminate: { XCTFail("Must not terminate") })
        XCTAssertEqual(installer.calls, 0)
        var unlocked = false
        await model.install(acquire: { true }, release: { unlocked = true }, terminate: { XCTFail("Failed install must not terminate") })
        XCTAssertEqual(installer.calls, 1)
        XCTAssertTrue(unlocked)
        guard case .failed = model.state else { return XCTFail("Expected visible recoverable error") }
    }

    func testSuccessfulExplicitInstallHandsOffAndTerminatesOnce() async throws {
        let installer = UpdateCountingInstaller()
        installer.shouldFail = false
        let model = GeneratorUpdateModel(checker: UpdateCountingChecker(release: try exampleRelease()), installer: installer, currentVersion: "0.1.9")
        await model.checkOnLaunch()
        var terminations = 0
        await model.install(acquire: { true }, release: { XCTFail("Keep lock until exit") }, terminate: { terminations += 1 })
        await model.install(acquire: { XCTFail("Must not install twice"); return true }, release: {}, terminate: { terminations += 1 })
        XCTAssertEqual(installer.calls, 1)
        XCTAssertEqual(installer.handoffs, 1)
        XCTAssertEqual(terminations, 1)
        XCTAssertEqual(model.state, .restarting)
    }

    func testCheckFailureDoesNotStartInstallationAndCanBeRetried() async {
        let checker = UpdateCountingChecker(release: nil)
        checker.shouldFail = true
        let installer = UpdateCountingInstaller()
        let model = GeneratorUpdateModel(checker: checker, installer: installer, currentVersion: "0.1.9")
        await model.checkOnLaunch()
        guard case .failed = model.state else { return XCTFail("Expected error") }
        checker.shouldFail = false
        await model.checkManually()
        XCTAssertEqual(model.state, .upToDate)
        XCTAssertEqual(installer.calls, 0)
    }

    func testHandoffFailureKeepsAppRunningAndReleasesOperationLock() async throws {
        let installer = UpdateCountingInstaller()
        installer.shouldFail = false
        installer.handoffFails = true
        let model = GeneratorUpdateModel(checker: UpdateCountingChecker(release: try exampleRelease()), installer: installer, currentVersion: "0.1.9")
        await model.checkOnLaunch()
        var unlocked = false
        await model.install(acquire: { true }, release: { unlocked = true }, terminate: { XCTFail("Helper not ready") })
        XCTAssertTrue(unlocked)
        guard case .failed = model.state else { return XCTFail("Expected visible helper error") }
    }
}

func exampleRelease() throws -> GeneratorRelease {
    GeneratorRelease(version: try GeneratorVersion("0.1.10"), tag: "v0.1.10", pageURL: URL(string: "https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/tag/v0.1.10")!, notes: "新版", dmgURL: URL(string: "https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/download/v0.1.10/Claude-v0.1.10-macOS.dmg")!, checksumURL: URL(string: "https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/download/v0.1.10/SHA256SUMS")!, size: 100)
}

final class UpdateCountingChecker: GeneratorUpdateChecking, @unchecked Sendable {
    var calls = 0
    var shouldFail = false
    let release: GeneratorRelease?
    init(release: GeneratorRelease?) { self.release = release }
    func check(currentVersion: String) async throws -> GeneratorRelease? {
        calls += 1
        if shouldFail { throw UpdateError("网络不可用") }
        return release
    }
}

final class UpdateCountingInstaller: GeneratorUpdateInstalling, @unchecked Sendable {
    var calls = 0
    var handoffs = 0
    var shouldFail = true
    var handoffFails = false
    func prepare(release: GeneratorRelease, target: URL) async throws -> PreparedGeneratorUpdate {
        calls += 1
        if shouldFail { throw UpdateError("下载失败") }
        return PreparedGeneratorUpdate(target: target, staged: target, helper: target, receipt: target, previousVersion: "0.1.9", version: "0.1.10")
    }
    func handoff(_ update: PreparedGeneratorUpdate) throws {
        handoffs += 1
        if handoffFails { throw UpdateError("助手未就绪") }
    }
}
