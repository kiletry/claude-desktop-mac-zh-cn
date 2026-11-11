import Foundation
import SwiftUI

struct PreparedGeneratorUpdate: Sendable {
    let target: URL
    let staged: URL
    let helper: URL
    let receipt: URL
    let previousVersion: String
    let version: String
    var ready: URL { helper.deletingLastPathComponent().appendingPathComponent("ready.txt") }
}

protocol GeneratorUpdateInstalling: Sendable {
    func prepare(release: GeneratorRelease, target: URL) async throws -> PreparedGeneratorUpdate
    func handoff(_ update: PreparedGeneratorUpdate) async throws
    func previousResult() -> String?
}

extension GeneratorUpdateInstalling {
    func previousResult() -> String? { nil }
}

enum GeneratorUpdateState: Equatable {
    case idle, checking, upToDate
    case available(GeneratorRelease)
    case installing
    case restarting
    case failed(String)
}

@MainActor
final class GeneratorUpdateModel: ObservableObject {
    @Published private(set) var state: GeneratorUpdateState = .idle
    @Published private(set) var installationNotice: String?
    let currentVersion: String
    private let checker: any GeneratorUpdateChecking
    private let installer: any GeneratorUpdateInstalling
    private let target: URL
    private var checkedOnLaunch = false
    var isInstalling: Bool { state == .installing || state == .restarting }
    var isChecking: Bool { state == .checking }

    init(checker: any GeneratorUpdateChecking, installer: any GeneratorUpdateInstalling, currentVersion: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0", target: URL = Bundle.main.bundleURL) {
        self.checker = checker
        self.installer = installer
        self.currentVersion = currentVersion
        self.target = target
    }
    func checkOnLaunch() async {
        guard !checkedOnLaunch else { return }
        checkedOnLaunch = true
        installationNotice = installer.previousResult()
        await checkManually()
    }
    func checkManually() async {
        guard !isChecking, !isInstalling else { return }
        state = .checking
        do {
            if let release = try await checker.check(currentVersion: currentVersion) { state = .available(release) }
            else { state = .upToDate }
        } catch {
            state = .failed("暂时无法检查更新：\(error.localizedDescription)")
        }
    }
    func install(acquire: () -> Bool, release unlock: () -> Void, terminate: () -> Void) async {
        guard case let .available(release) = state, acquire() else { return }
        state = .installing
        do {
            let update = try await installer.prepare(release: release, target: target)
            try await installer.handoff(update)
            state = .restarting
            terminate()
            // Keep the operation lock until the process terminates.
        } catch {
            state = .failed("更新未安装：\(error.localizedDescription)")
            unlock()
        }
    }
}
