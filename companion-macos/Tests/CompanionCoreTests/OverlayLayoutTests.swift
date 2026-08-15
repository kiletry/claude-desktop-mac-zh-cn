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
}
