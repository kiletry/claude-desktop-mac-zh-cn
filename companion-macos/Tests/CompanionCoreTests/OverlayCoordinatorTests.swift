import CoreGraphics
import XCTest
@testable import ClaudeChineseCompanion
@testable import CompanionCore

@MainActor
final class OverlayCoordinatorTests: XCTestCase {
    func testRepeatedRendersReuseOnePanel() {
        let factory = RecordingOverlayPanelFactory()
        let coordinator = OverlayCoordinator(panelFactory: factory.make(surface:))
        coordinator.render(makeSurface(texts: ["首页", "项目"]))
        coordinator.render(makeSurface(texts: ["首页", "项目", "制品"]))

        XCTAssertEqual(factory.createdPanels.count, 1)
        XCTAssertEqual(factory.createdPanels[0].surfaces.count, 2)
    }

    func testSwitchingClaudeWindowsHidesThePreviousPanel() {
        let factory = RecordingOverlayPanelFactory()
        let coordinator = OverlayCoordinator(panelFactory: factory.make(surface:))
        coordinator.render(makeSurface(windowID: 42, texts: ["首页"]))
        coordinator.render(makeSurface(windowID: 84, texts: ["项目"]))

        XCTAssertEqual(factory.createdPanels.count, 2)
        XCTAssertEqual(factory.createdPanels[0].hideCount, 1)
        XCTAssertEqual(factory.createdPanels[1].showCount, 1)
    }

    func testPanelRemainsVisibleWhenCompanionDeactivates() {
        let panel = OverlayPanel(surface: makeSurface(texts: ["首页"]))

        XCTAssertFalse(panel.hidesOnDeactivate)
        XCTAssertTrue(panel.ignoresMouseEvents)
        XCTAssertFalse(panel.canBecomeKey)
    }

    private func makeSurface(windowID: CGWindowID = 42, texts: [String]) -> OverlaySurface {
        OverlaySurface(
            windowID: windowID,
            frame: CGRect(x: 100, y: 100, width: 600, height: 500),
            appearance: .light,
            patches: texts.enumerated().map { index, text in
                OverlayPatch(
                    text: text,
                    frame: CGRect(x: 40, y: 440 - index * 32, width: 120, height: 24),
                    isEnabled: true
                )
            }
        )
    }
}

@MainActor
private final class RecordingOverlayPanel: OverlayPanelManaging {
    private(set) var surfaces: [OverlaySurface] = []
    private(set) var showCount = 0
    private(set) var hideCount = 0

    init(surface: OverlaySurface) { surfaces = [surface] }
    func update(_ surface: OverlaySurface) { surfaces.append(surface) }
    func show() { showCount += 1 }
    func hide() { hideCount += 1 }
}

@MainActor
private final class RecordingOverlayPanelFactory {
    private(set) var createdPanels: [RecordingOverlayPanel] = []

    func make(surface: OverlaySurface) -> any OverlayPanelManaging {
        let panel = RecordingOverlayPanel(surface: surface)
        createdPanels.append(panel)
        return panel
    }
}
