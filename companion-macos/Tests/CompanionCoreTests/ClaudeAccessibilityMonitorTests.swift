import CoreGraphics
import XCTest
@testable import ClaudeChineseCompanion
@testable import CompanionCore

@MainActor
final class ClaudeAccessibilityMonitorTests: XCTestCase {
    private var fixtureDictionary: TranslationDictionary {
        let fixtureURL = Bundle.module.url(forResource: "fixture", withExtension: "json")!
        return try! TranslationDictionary(resourceURL: fixtureURL)
    }

    func testRefreshClearsOverlaysWhenClaudeIsNotRunning() {
        let coordinator = RecordingCoordinator()
        let monitor = ClaudeAccessibilityMonitor(
            bundleIdentifier: "com.anthropic.claudefordesktop",
            dictionary: fixtureDictionary,
            coordinator: coordinator,
            targetResolver: { nil }
        )

        monitor.refresh()

        XCTAssertEqual(coordinator.clearCount, 1)
    }

    func testOverlayPanelRemainsVisibleWhenCompanionDeactivates() {
        let panel = OverlayPanel(overlayLabel: .init(text: "新建", frame: CGRect(x: 10, y: 10, width: 80, height: 24)))

        XCTAssertFalse(panel.hidesOnDeactivate)
    }
}

@MainActor
private final class RecordingCoordinator: OverlayRendering {
    private(set) var clearCount = 0

    func render(_ labels: [OverlayLabel]) {}

    func clear() {
        clearCount += 1
    }
}
