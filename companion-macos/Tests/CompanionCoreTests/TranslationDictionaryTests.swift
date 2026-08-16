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

    func testUsesTheBundledOCRMapForVisibleText() throws {
        let fixtureURL = try XCTUnwrap(Bundle.module.url(forResource: "fixture", withExtension: "json"))
        let ocrFixtureURL = try XCTUnwrap(Bundle.module.url(forResource: "ocr-fixture", withExtension: "json"))
        let dictionary = try TranslationDictionary(resourceURL: fixtureURL, ocrResourceURL: ocrFixtureURL)

        XCTAssertEqual(dictionary.translation(forVisibleText: " New conversation "), "新建对话")
        XCTAssertEqual(dictionary.translation(forVisibleText: "+ New"), "新建")
        XCTAssertNil(dictionary.translation(forVisibleText: "A chat response must remain untranslated"))
    }

    func testFixtureExposesOnlyKnownStaticControlCopyForVisibleTextLookup() throws {
        let fixtureURL = try XCTUnwrap(Bundle.module.url(forResource: "fixture", withExtension: "json"))
        let dictionary = try TranslationDictionary(resourceURL: fixtureURL)

        XCTAssertEqual(dictionary.translation(forVisibleText: "Projects"), "项目")
        XCTAssertEqual(dictionary.translation(forVisibleText: "New"), "新建")
        XCTAssertNil(dictionary.translation(forVisibleText: "My private project"))
    }
}
