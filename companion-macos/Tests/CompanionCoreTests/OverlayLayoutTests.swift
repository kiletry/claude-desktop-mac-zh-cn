import CoreGraphics
import XCTest
@testable import CompanionCore

final class OverlayLayoutTests: XCTestCase {
    func testConvertsTopLeftAccessibilityFrameToAppKitCoordinates() {
        let result = AccessibilityCoordinateMapper.appKitFrame(
            CGRect(x: 20, y: 100, width: 180, height: 28),
            on: DisplayGeometry(
                accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
                appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
            )
        )

        XCTAssertEqual(result, CGRect(x: 20, y: 952, width: 180, height: 28))
    }

    func testChinesePatchFitsInsideControlAndAvoidsIcon() throws {
        let patch = try XCTUnwrap(OverlayLayout.patch(
            controlFrame: CGRect(x: 12, y: 20, width: 210, height: 28),
            text: "项目",
            isEnabled: true
        ))

        XCTAssertEqual(patch.frame.minX, 44)
        XCTAssertLessThanOrEqual(patch.frame.maxX, 214)
        XCTAssertGreaterThanOrEqual(patch.frame.width, 40)
        XCTAssertGreaterThan(patch.frame.height, 0)
    }

    func testPatchRejectsTextThatWouldClip() {
        XCTAssertNil(OverlayLayout.patch(
            controlFrame: CGRect(x: 12, y: 20, width: 90, height: 28),
            text: "筛选并分组最近记录",
            isEnabled: true
        ))
    }

    func testPatchRejectsControlTooShortForMediumText() {
        XCTAssertNil(OverlayLayout.patch(
            controlFrame: CGRect(x: 12, y: 20, width: 210, height: 16),
            text: "项目",
            isEnabled: true
        ))
    }

    func testPatchRejectsNegativeHeightControl() {
        XCTAssertNil(OverlayLayout.patch(
            controlFrame: CGRect(x: 12, y: 20, width: 210, height: -28),
            text: "项目",
            isEnabled: true
        ))
    }

    func testConvertsScaledSecondaryDisplayCoordinates() {
        let result = AccessibilityCoordinateMapper.appKitFrame(
            CGRect(x: 2_020, y: 50, width: 200, height: 40),
            on: DisplayGeometry(
                accessibilityFrame: CGRect(x: 1_920, y: 0, width: 1_280, height: 720),
                appKitFrame: CGRect(x: 1_920, y: 0, width: 2_560, height: 1_440)
            )
        )

        XCTAssertEqual(result, CGRect(x: 2_120, y: 1_260, width: 400, height: 80))
    }

    func testSurfaceProducesPanelLocalPatchForControlInsideWindow() throws {
        let element = AccessibilityElement(
            role: "AXButton",
            title: "Projects",
            value: nil,
            identifier: "sidebar-projects",
            isEnabled: true,
            parentRole: "AXGroup",
            ancestorRoles: ["AXWindow", "AXGroup"],
            frame: CGRect(x: 120, y: 230, width: 210, height: 28)
        )
        let surface = try XCTUnwrap(OverlayLayout.surface(
            windowID: 42,
            windowFrame: CGRect(x: 100, y: 200, width: 400, height: 300),
            display: DisplayGeometry(
                accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
                appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
            ),
            appearance: .dark,
            translations: [(element, "项目")]
        ))

        XCTAssertEqual(surface.frame, CGRect(x: 100, y: 580, width: 400, height: 300))
        XCTAssertEqual(surface.patches.first?.frame.minX, 52)
        XCTAssertEqual(surface.patches.first?.frame.minY, 244)
    }

    func testSurfaceRejectsControlOutsideWindow() {
        let element = AccessibilityElement(
            role: "AXButton",
            title: "Projects",
            value: nil,
            identifier: "sidebar-projects",
            isEnabled: true,
            parentRole: "AXGroup",
            ancestorRoles: ["AXWindow", "AXGroup"],
            frame: CGRect(x: 20, y: 230, width: 210, height: 28)
        )

        XCTAssertNil(OverlayLayout.surface(
            windowID: 42,
            windowFrame: CGRect(x: 100, y: 200, width: 400, height: 300),
            display: DisplayGeometry(
                accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
                appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
            ),
            appearance: .dark,
            translations: [(element, "项目")]
        ))
    }

    func testSurfaceReturnsNilForEmptyPatchList() {
        XCTAssertNil(OverlayLayout.surface(
            windowID: 42,
            windowFrame: CGRect(x: 100, y: 200, width: 400, height: 300),
            display: DisplayGeometry(
                accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
                appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
            ),
            appearance: .dark,
            translations: []
        ))
    }
}
