import XCTest
@testable import ClaudeChineseCompanion

@MainActor
final class TranslationActivationControllerTests: XCTestCase {
    func testMissingAccessibilityPermissionPromptsWithoutStartingMonitor() {
        let monitor = RecordingTranslationMonitor()
        var promptCount = 0
        var guidanceCount = 0
        var activationCount = 0
        let controller = TranslationActivationController(
            monitor: monitor,
            permissionState: { .missing },
            requestPrompt: { promptCount += 1 },
            showGuidance: { guidanceCount += 1 },
            activateClaude: { activationCount += 1 }
        )

        XCTAssertFalse(controller.enable())
        XCTAssertEqual(promptCount, 1)
        XCTAssertEqual(guidanceCount, 1)
        XCTAssertEqual(monitor.startCount, 0)
        XCTAssertEqual(activationCount, 0)
    }

    func testGrantedAccessibilityPermissionStartsMonitorAndActivatesClaude() {
        let monitor = RecordingTranslationMonitor()
        var promptCount = 0
        var guidanceCount = 0
        var activationCount = 0
        let controller = TranslationActivationController(
            monitor: monitor,
            permissionState: { .granted },
            requestPrompt: { promptCount += 1 },
            showGuidance: { guidanceCount += 1 },
            activateClaude: { activationCount += 1 }
        )

        XCTAssertTrue(controller.enable())
        XCTAssertEqual(promptCount, 0)
        XCTAssertEqual(guidanceCount, 0)
        XCTAssertEqual(monitor.startCount, 1)
        XCTAssertEqual(activationCount, 1)

        controller.disable()
        XCTAssertEqual(monitor.stopCount, 1)
    }
}

@MainActor
private final class RecordingTranslationMonitor: TranslationMonitoring {
    private(set) var startCount = 0
    private(set) var stopCount = 0

    func start() { startCount += 1 }
    func stop() { stopCount += 1 }
}
