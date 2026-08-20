import Foundation

enum LogRedactor {
    private static let patterns = [
        #"(?i)(?:authorization|token|api[_-]?key|password|secret|cookie|credential|oauth)[=:]\s*[^\s&\",]+"#,
        #"\b(?:gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b"#,
        #"(?i)bearer\s+[A-Za-z0-9._-]+"#,
    ]

    static func redact(_ text: String) -> String {
        patterns.reduce(text) { partialResult, pattern in
            partialResult.replacingOccurrences(of: pattern, with: "[REDACTED]", options: .regularExpression)
        }
    }
}
