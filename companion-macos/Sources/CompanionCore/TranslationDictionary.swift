import Foundation

public struct TranslationDictionary: Sendable {
    private struct Entry: Codable, Sendable {
        let source: String
        let role: String?
        let parentRole: String?
        let target: String
    }

    private let entries: [Entry]
    private let visibleTextTranslations: [String: String]

    private init(entries: [Entry], visibleTextTranslations: [String: String]) {
        self.entries = entries
        self.visibleTextTranslations = visibleTextTranslations
    }

    public static var empty: TranslationDictionary {
        TranslationDictionary(entries: [], visibleTextTranslations: [:])
    }

    public static func bundled() throws -> TranslationDictionary {
        guard let resourceURL = Bundle.main.url(forResource: "zh-CN", withExtension: "json")
            ?? Bundle.module.url(forResource: "zh-CN", withExtension: "json"),
              let ocrResourceURL = Bundle.main.url(forResource: "ocr-zh-CN", withExtension: "json")
            ?? Bundle.module.url(forResource: "ocr-zh-CN", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try TranslationDictionary(resourceURL: resourceURL, ocrResourceURL: ocrResourceURL)
    }

    public init(resourceURL: URL) throws {
        let data = try Data(contentsOf: resourceURL)
        self.entries = try JSONDecoder().decode([Entry].self, from: data)
        self.visibleTextTranslations = Dictionary(
            uniqueKeysWithValues: entries.map { (Self.normalized($0.source), $0.target) }
        )
    }

    public init(resourceURL: URL, ocrResourceURL: URL) throws {
        let entryData = try Data(contentsOf: resourceURL)
        self.entries = try JSONDecoder().decode([Entry].self, from: entryData)
        let ocrData = try Data(contentsOf: ocrResourceURL)
        let translations = try JSONDecoder().decode([String: String].self, from: ocrData)
        self.visibleTextTranslations = Dictionary(
            uniqueKeysWithValues: translations.map { (Self.normalized($0.key), $0.value) }
        )
    }

    public func translation(for element: AccessibilityElement) -> String? {
        guard InterfaceEligibility.allows(element) else { return nil }
        let candidates = [element.title, element.value].compactMap { $0 }
        guard let entry = entries.first(where: { entry in
            candidates.contains(entry.source) &&
            (entry.role == nil || entry.role == element.role) &&
            (entry.parentRole == nil || entry.parentRole == element.parentRole)
        }) else { return nil }
        return entry.target
    }

    public func translation(forVisibleText text: String) -> String? {
        let direct = Self.normalized(text)
        if let translation = visibleTextTranslations[direct] {
            return translation
        }
        let stripped = direct.trimmingCharacters(in: CharacterSet.letters.inverted)
        guard stripped != direct else { return nil }
        return visibleTextTranslations[stripped]
    }

    private static func normalized(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}
