import CoreGraphics
import XCTest
@testable import CompanionCore

final class TranslationDictionaryTests: XCTestCase {
    func testUsesContextSpecificTranslationAndLeavesUnknownTextEnglish() throws {
        let fixtureURL = try XCTUnwrap(Bundle.module.url(forResource: "fixture", withExtension: "json"))
        let dictionary = try TranslationDictionary(resourceURL: fixtureURL)
        let settings = AccessibilityElement(role: "AXButton", title: "Settings", value: nil, parentRole: "AXToolbar", frame: .zero)
        XCTAssertEqual(dictionary.translation(for: settings), "设置")
        XCTAssertNil(dictionary.translation(for: .init(role: "AXButton", title: "Unseen control", value: nil, parentRole: "AXToolbar", frame: .zero)))
    }
}
