import Foundation

enum AppMode: String, Codable, CaseIterable, Sendable {
    case clone, official
    var title: String { self == .clone ? "独立中文副本" : "修改官方 Claude" }
}

enum TranslationMode: String, Codable, CaseIterable, Sendable {
    case full, safe
    var title: String { self == .full ? "完整模式" : "安全模式" }
}

enum BackupPolicy: String, Codable, CaseIterable, Sendable {
    case versioned, overwrite
    var title: String { self == .versioned ? "版本号备份" : "覆盖备份" }
}

struct GenerationConfiguration: Equatable, Sendable {
    var appMode: AppMode = .clone
    var translationMode: TranslationMode = .full
    var backupDirectory: String = ""
    var backupPolicy: BackupPolicy = .versioned
    var backupCount: Int = 1

    var backupDirectoryURL: URL {
        if !backupDirectory.isEmpty { return URL(fileURLWithPath: backupDirectory) }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/ClaudeChineseGenerator/Backups")
    }
    var requiresOfficialConfirmation: Bool { appMode == .official }
}

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
    let officialDeveloperId: Bool
    let teamIdentifier: String?
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
              let signingObject = value["signing"]?.objectValue,
              let signing = signingObject["verified"]?.boolValue,
              let gatekeeper = value["gatekeeper"]?.objectValue?["accepted"]?.boolValue
        else { return nil }
        return Inspection(
            appDirectory: appDirectory,
            bundleIdentifier: bundleIdentifier,
            version: version,
            signingVerified: signing,
            officialDeveloperId: signingObject["officialDeveloperId"]?.boolValue ?? false,
            teamIdentifier: signingObject["teamIdentifier"]?.stringValue,
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
    let appMode: AppMode
    let translationMode: TranslationMode
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
