import Foundation

public struct TranslationDictionary: Sendable {
    private struct Entry: Codable, Sendable {
        let source: String
        let role: String?
        let parentRole: String?
        let target: String
    }

    private let entries: [Entry]

    public init(resourceURL: URL) throws {
        let data = try Data(contentsOf: resourceURL)
        self.entries = try JSONDecoder().decode([Entry].self, from: data)
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
}
