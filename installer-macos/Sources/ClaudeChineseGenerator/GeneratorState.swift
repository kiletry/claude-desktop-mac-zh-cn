import Foundation

enum JSONValue: Codable, Equatable, Sendable {
    case string(String)
    case bool(Bool)
    case number(Double)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else { self = .array(try container.decode([JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var stringValue: String? {
        guard case let .string(value) = self else { return nil }
        return value
    }

    var boolValue: Bool? {
        guard case let .bool(value) = self else { return nil }
        return value
    }

    var objectValue: [String: JSONValue]? {
        guard case let .object(value) = self else { return nil }
        return value
    }
}

struct GeneratorEvent: Codable, Equatable, Sendable {
    let event: String
    let stage: String
    let message: String
    let value: JSONValue?
}

struct Inspection: Equatable, Sendable {
    let appDirectory: String
    let bundleIdentifier: String
    let version: String
    let signingVerified: Bool
    let gatekeeperAccepted: Bool

    var isTrustedOfficialApp: Bool {
        appDirectory == "/Applications/Claude.app"
            && bundleIdentifier == "com.anthropic.claudefordesktop"
            && signingVerified
            && gatekeeperAccepted
    }

    static func from(event: GeneratorEvent) -> Inspection? {
        guard let value = event.value?.objectValue,
              let appDirectory = value["appDir"]?.stringValue,
              let bundleIdentifier = value["bundleId"]?.stringValue,
              let version = value["version"]?.stringValue,
              let signing = value["signing"]?.objectValue?["verified"]?.boolValue,
              let gatekeeper = value["gatekeeper"]?.objectValue?["accepted"]?.boolValue
        else { return nil }
        return Inspection(
            appDirectory: appDirectory,
            bundleIdentifier: bundleIdentifier,
            version: version,
            signingVerified: signing,
            gatekeeperAccepted: gatekeeper
        )
    }
}

struct Progress: Equatable, Sendable {
    let stage: String
    let message: String
}

struct ResultSummary: Equatable, Sendable {
    let appPath: String
    let translationVersion: String?
    let sourceCommit: String?
}

struct GeneratorError: Error, Equatable, Sendable {
    let message: String
    let details: String
    let logURL: URL?
}

enum GeneratorState: Equatable, Sendable {
    case checking
    case ready(Inspection)
    case confirmingReplacement
    case generating(Progress)
    case completed(ResultSummary)
    case failed(GeneratorError)
}
