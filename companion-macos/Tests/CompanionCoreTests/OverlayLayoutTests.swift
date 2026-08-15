import CoreGraphics
import XCTest
@testable import CompanionCore

final class OverlayLayoutTests: XCTestCase {
    func testKeepsChineseLabelOnScreen() throws {
        let button = AccessibilityElement(
            role: "AXButton",
            title: "Settings",
            value: nil,
            parentRole: "AXToolbar",
            frame: CGRect(x: 8, y: 4, width: 80, height: 28)
        )

        let labels = OverlayLayout.labels(
            for: [(button, "设置")],
            screenFrame: CGRect(x: 0, y: 0, width: 320, height: 200)
        )
        let label = try XCTUnwrap(labels.first)

        XCTAssertGreaterThanOrEqual(label.frame.minX, 0)
        XCTAssertGreaterThanOrEqual(label.frame.minY, 0)
        XCTAssertLessThanOrEqual(label.frame.maxY, 200)
    }

    func testSkipsZeroSizeElement() {
        let element = AccessibilityElement(
            role: "AXButton",
            title: "Settings",
            value: nil,
            parentRole: "AXToolbar",
            frame: CGRect(x: 8, y: 4, width: 0, height: 0)
        )

        XCTAssertTrue(
            OverlayLayout.labels(
                for: [(element, "设置")],
                screenFrame: CGRect(x: 0, y: 0, width: 320, height: 200)
            ).isEmpty
        )
    }

    func testSkipsElementOutsideScreen() {
        let element = AccessibilityElement(
            role: "AXButton",
            title: "Settings",
            value: nil,
            parentRole: "AXToolbar",
            frame: CGRect(x: 400, y: 4, width: 80, height: 28)
        )

        XCTAssertTrue(
            OverlayLayout.labels(
                for: [(element, "设置")],
                screenFrame: CGRect(x: 0, y: 0, width: 320, height: 200)
            ).isEmpty
        )
    }
}
