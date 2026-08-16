import CoreGraphics
import XCTest
@testable import CompanionCore

final class StaticInterfacePolicyTests: XCTestCase {
    private let window = CGRect(x: 0, y: 0, width: 1_200, height: 900)

    func testAllowsSafeSidebarControl() {
        let projects = AccessibilityElement(
            role: "AXButton",
            title: "Projects",
            value: nil,
            identifier: "sidebar-projects",
            isEnabled: true,
            parentRole: "AXGroup",
            ancestorRoles: ["AXWindow", "AXGroup", "AXWebArea", "AXGroup"],
            frame: CGRect(x: 20, y: 200, width: 180, height: 28)
        )

        XCTAssertTrue(StaticInterfacePolicy.allows(projects, windowFrame: window))
    }

    func testRejectsConversationTitleInsideList() {
        let conversationTitle = AccessibilityElement(
            role: "AXButton",
            title: "Projects",
            value: nil,
            identifier: nil,
            isEnabled: true,
            parentRole: "AXList",
            ancestorRoles: ["AXWindow", "AXWebArea", "AXList"],
            frame: CGRect(x: 20, y: 400, width: 180, height: 28)
        )

        XCTAssertFalse(StaticInterfacePolicy.allows(conversationTitle, windowFrame: window))
    }

    func testRejectsUserSuppliedTitleOutsideSafeCopyAllowlist() {
        let userTitle = AccessibilityElement(
            role: "AXButton",
            title: "A private user conversation",
            value: nil,
            identifier: nil,
            isEnabled: true,
            parentRole: "AXGroup",
            ancestorRoles: ["AXWindow", "AXGroup"],
            frame: CGRect(x: 20, y: 300, width: 180, height: 28)
        )

        XCTAssertFalse(StaticInterfacePolicy.allows(userTitle, windowFrame: window))
    }

    func testRejectsAllowlistedCopyWhenStableIdentifierDoesNotMatchControl() {
        let collidingConversationTitle = AccessibilityElement(
            role: "AXButton",
            title: "Projects",
            value: nil,
            identifier: "conversation-title",
            isEnabled: true,
            parentRole: "AXGroup",
            ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
            frame: CGRect(x: 20, y: 300, width: 180, height: 28)
        )

        XCTAssertFalse(StaticInterfacePolicy.allows(collidingConversationTitle, windowFrame: window))
    }

    func testRejectsIncompleteCompatibilityMetadata() {
        let incomplete = AccessibilityElement(
            role: "AXButton",
            title: "Settings",
            value: nil,
            parentRole: "AXToolbar",
            frame: CGRect(x: 500, y: 100, width: 120, height: 30)
        )

        XCTAssertFalse(StaticInterfacePolicy.allows(incomplete, windowFrame: window))
    }

    func testRejectsEditableAndListContentBeforeTextRead() {
        XCTAssertFalse(StaticInterfacePolicy.mayReadText(role: "AXTextField", ancestorRoles: ["AXWindow"]))
        XCTAssertFalse(StaticInterfacePolicy.mayReadText(role: "AXButton", ancestorRoles: ["AXWindow", "AXList"]))
        XCTAssertTrue(StaticInterfacePolicy.mayReadText(role: "AXButton", ancestorRoles: ["AXWindow", "AXGroup"]))
    }

    func testAllowsToolbarRegionAndRejectsCentralRegion() {
        XCTAssertTrue(AccessibilityZonePolicy.permits(
            frame: CGRect(x: 500, y: 100, width: 120, height: 30),
            in: window
        ))
        XCTAssertFalse(AccessibilityZonePolicy.permits(
            frame: CGRect(x: 500, y: 400, width: 120, height: 30),
            in: window
        ))
        XCTAssertFalse(AccessibilityZonePolicy.permits(frame: .zero, in: window))
    }
}
