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

    func testRefreshRendersKnownSidebarControlsAndRejectsConversationContent() {
        let window = CGRect(x: 0, y: 0, width: 1_200, height: 900)
        let snapshot = AccessibilitySnapshot(
            windowID: 42,
            windowFrame: window,
            display: DisplayGeometry(
                accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
                appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
            ),
            appearance: .light,
            elements: [
                AccessibilityElement(
                    role: "AXButton", title: "Projects", value: nil,
                    identifier: "sidebar-projects", isEnabled: true,
                    parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
                    frame: CGRect(x: 20, y: 200, width: 200, height: 28)
                ),
                AccessibilityElement(
                    role: "AXButton", title: "New", value: nil,
                    identifier: "sidebar-new", isEnabled: true,
                    parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
                    frame: CGRect(x: 20, y: 240, width: 200, height: 28)
                ),
                AccessibilityElement(
                    role: "AXTextArea", title: nil, value: "private prompt",
                    identifier: "prompt", isEnabled: true,
                    parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea"],
                    frame: CGRect(x: 360, y: 760, width: 700, height: 90)
                ),
                AccessibilityElement(
                    role: "AXButton", title: "Projects", value: nil,
                    identifier: nil, isEnabled: true,
                    parentRole: "AXList", ancestorRoles: ["AXWindow", "AXWebArea", "AXList"],
                    frame: CGRect(x: 20, y: 400, width: 200, height: 28)
                ),
                AccessibilityElement(
                    role: "AXButton", title: "My private project", value: nil,
                    identifier: "sidebar-projects", isEnabled: true,
                    parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
                    frame: CGRect(x: 20, y: 280, width: 200, height: 28)
                ),
                AccessibilityElement(
                    role: "AXButton", title: "Projects", value: "private prompt",
                    identifier: "sidebar-projects", isEnabled: true,
                    parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
                    frame: CGRect(x: 20, y: 320, width: 200, height: 28)
                ),
                AccessibilityElement(
                    role: "AXButton", title: "private prompt", value: "New",
                    identifier: "sidebar-new", isEnabled: true,
                    parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
                    frame: CGRect(x: 20, y: 360, width: 200, height: 28)
                ),
                AccessibilityElement(
                    role: "AXButton", title: "Projects", value: "New",
                    identifier: "sidebar-projects", isEnabled: true,
                    parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
                    frame: CGRect(x: 20, y: 400, width: 200, height: 28)
                )
            ]
        )
        let coordinator = RecordingCoordinator()
        let monitor = ClaudeAccessibilityMonitor(
            dictionary: fixtureDictionary,
            coordinator: coordinator,
            snapshotResolver: { snapshot },
            frontmostBundleIdentifier: { ClaudeAccessibilityMonitor.officialBundleIdentifier },
            permissionState: { .granted }
        )

        monitor.refresh()

        XCTAssertEqual(coordinator.surfaces.count, 1)
        XCTAssertEqual(coordinator.surfaces[0].windowID, 42)
        XCTAssertEqual(coordinator.surfaces[0].frame, CGRect(x: 0, y: 180, width: 1_200, height: 900))
        XCTAssertEqual(coordinator.surfaces[0].patches.map(\.text), ["项目", "新建", "项目", "新建"])
        XCTAssertEqual(
            coordinator.surfaces[0].patches.map(\.frame),
            [
                CGRect(x: 52, y: 674, width: 160, height: 24),
                CGRect(x: 52, y: 634, width: 160, height: 24),
                CGRect(x: 52, y: 554, width: 160, height: 24),
                CGRect(x: 52, y: 514, width: 160, height: 24)
            ]
        )
        XCTAssertEqual(coordinator.legacyLabelRenderCount, 0)
        XCTAssertEqual(coordinator.clearCount, 0)
    }

    func testRefreshClearsWithoutResolvingSnapshotWhenClaudeIsNotFrontmost() {
        let coordinator = RecordingCoordinator()
        var snapshotCallCount = 0
        let monitor = ClaudeAccessibilityMonitor(
            dictionary: fixtureDictionary,
            coordinator: coordinator,
            snapshotResolver: {
                snapshotCallCount += 1
                return self.emptySnapshot
            },
            frontmostBundleIdentifier: { "com.example.other" },
            permissionState: { .granted }
        )

        monitor.refresh()

        XCTAssertEqual(coordinator.clearCount, 1)
        XCTAssertEqual(coordinator.surfaces.count, 0)
        XCTAssertEqual(snapshotCallCount, 0)
    }

    func testRefreshClearsWithoutResolvingSnapshotWhenAccessibilityPermissionIsMissing() {
        let coordinator = RecordingCoordinator()
        var snapshotCallCount = 0
        let monitor = ClaudeAccessibilityMonitor(
            dictionary: fixtureDictionary,
            coordinator: coordinator,
            snapshotResolver: {
                snapshotCallCount += 1
                return self.emptySnapshot
            },
            frontmostBundleIdentifier: { ClaudeAccessibilityMonitor.officialBundleIdentifier },
            permissionState: { .missing }
        )

        monitor.refresh()

        XCTAssertEqual(coordinator.clearCount, 1)
        XCTAssertEqual(coordinator.surfaces.count, 0)
        XCTAssertEqual(snapshotCallCount, 0)
    }

    func testRefreshClearsWhenSnapshotContainsNoSafeControls() {
        let coordinator = RecordingCoordinator()
        let monitor = ClaudeAccessibilityMonitor(
            dictionary: fixtureDictionary,
            coordinator: coordinator,
            snapshotResolver: { self.emptySnapshot },
            frontmostBundleIdentifier: { ClaudeAccessibilityMonitor.officialBundleIdentifier },
            permissionState: { .granted }
        )

        monitor.refresh()

        XCTAssertEqual(coordinator.clearCount, 1)
        XCTAssertEqual(coordinator.surfaces.count, 0)
        XCTAssertEqual(coordinator.legacyLabelRenderCount, 0)
    }

    func testOverlayPanelRemainsVisibleWhenCompanionDeactivates() {
        let panel = OverlayPanel(
            surface: OverlaySurface(
                windowID: 42,
                frame: CGRect(x: 10, y: 10, width: 80, height: 24),
                appearance: .light,
                patches: [OverlayPatch(
                    text: "新建",
                    frame: CGRect(x: 0, y: 0, width: 80, height: 24),
                    isEnabled: true
                )]
            )
        )

        XCTAssertFalse(panel.hidesOnDeactivate)
    }

    private var emptySnapshot: AccessibilitySnapshot {
        AccessibilitySnapshot(
            windowID: 42,
            windowFrame: CGRect(x: 0, y: 0, width: 1_200, height: 900),
            display: DisplayGeometry(
                accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
                appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
            ),
            appearance: .light,
            elements: []
        )
    }
}

@MainActor
private final class RecordingCoordinator: OverlayRendering {
    private(set) var surfaces: [OverlaySurface] = []
    private(set) var legacyLabelRenderCount = 0
    private(set) var clearCount = 0

    func render(_ surface: OverlaySurface) {
        surfaces.append(surface)
    }

    func render(_ labels: [OverlayLabel]) {
        legacyLabelRenderCount += 1
    }

    func clear() {
        clearCount += 1
    }
}
