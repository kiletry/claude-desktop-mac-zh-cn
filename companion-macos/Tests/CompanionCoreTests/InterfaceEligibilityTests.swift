import CoreGraphics
import XCTest
@testable import CompanionCore

final class InterfaceEligibilityTests: XCTestCase {
    func testAllowsSettingsButtonAndRejectsConversationContent() {
        XCTAssertTrue(InterfaceEligibility.allows(.init(role: "AXButton", title: "Settings", value: nil, parentRole: "AXToolbar", frame: .zero)))
        XCTAssertFalse(InterfaceEligibility.allows(.init(role: "AXTextArea", title: nil, value: "private prompt", parentRole: "AXWebArea", frame: .zero)))
        XCTAssertFalse(InterfaceEligibility.allows(.init(role: "AXStaticText", title: "chat message", value: nil, parentRole: "AXWebArea", frame: .zero)))
    }

    func testRejectsUnknownParentAndConversationLikeRoles() {
        XCTAssertFalse(InterfaceEligibility.allows(.init(role: "AXButton", title: "Unknown", value: nil, parentRole: "AXUnknown", frame: .zero)))
        XCTAssertFalse(InterfaceEligibility.allows(.init(role: "AXList", title: nil, value: nil, parentRole: "AXGroup", frame: .zero)))
        XCTAssertFalse(InterfaceEligibility.allows(.init(role: "AXMenuItem", title: "Settings", value: nil, parentRole: "AXWebArea", frame: .zero)))
    }
}
