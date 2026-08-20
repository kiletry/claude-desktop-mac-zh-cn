import AppKit
import Foundation
import SwiftUI

@MainActor
final class GeneratorViewModel: ObservableObject {
    @Published private(set) var state: GeneratorState = .checking

    private let bridge: GeneratorProcessRunning
    private let outputAppURL: URL
    private let cloneDataDirectory: URL
    private let commandPrefix: [String]
    private var latestLogURL: URL?
    private var completionSummary: ResultSummary?
    private var lastTrustedInspection: Inspection?

    init(
        bridge: GeneratorProcessRunning = NodeProcessBridge(executableURL: NodeProcessBridge.bundledNodeURL),
        outputAppURL: URL = URL(fileURLWithPath: "/Applications/Claude 中文.app"),
        cloneDataDirectory: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Claude Desktop zh-CN"),
        commandPrefix: [String] = NodeProcessBridge.bundledCommandPrefix
    ) {
        self.bridge = bridge
        self.outputAppURL = outputAppURL
        self.cloneDataDirectory = cloneDataDirectory
        self.commandPrefix = commandPrefix
    }

    func check() async {
        state = .checking
        var inspection: Inspection?
        do {
            let result = try await bridge.run(
                arguments: commandPrefix + ["status"],
                environment: safeEnvironment,
                onEvent: { event in
                    if event.event == "inspection_succeeded" { inspection = Inspection.from(event: event) }
                }
            )
            latestLogURL = result.logURL
            guard let inspection else {
                state = .failed(GeneratorError(message: "无法读取官方 Claude 检查结果。", details: result.stdout, logURL: result.logURL))
                return
            }
            guard inspection.isTrustedOfficialApp else {
                state = .failed(GeneratorError(message: "官方 Claude 未通过签名或 Gatekeeper 验证。", details: result.stdout, logURL: result.logURL))
                return
            }
            lastTrustedInspection = inspection
            state = .ready(inspection)
        } catch {
            state = failureState(from: error)
        }
    }

    func confirmAndGenerate() async {
        if case .confirmingReplacement = state {
            await generate()
            return
        }
        if FileManager.default.fileExists(atPath: outputAppURL.path) {
            state = .confirmingReplacement
            return
        }
        await generate()
    }

    func cancelGeneration() {
        bridge.cancel()
        state = .failed(GeneratorError(message: "生成已取消。", details: "子进程已终止。", logURL: latestLogURL))
    }

    func dismissReplacementConfirmation() {
        if let lastTrustedInspection {
            state = .ready(lastTrustedInspection)
        } else {
            state = .failed(GeneratorError(message: "请先检查官方 Claude。", details: "尚未获得可信的官方应用检查结果。", logURL: latestLogURL))
        }
    }

    func openClone() {
        NSWorkspace.shared.open(outputAppURL)
    }

    func openDataDirectory() {
        NSWorkspace.shared.open(cloneDataDirectory)
    }

    func revealLog() {
        guard let latestLogURL else { return }
        NSWorkspace.shared.activateFileViewerSelecting([latestLogURL])
    }

    private func generate() async {
        state = .generating(Progress(stage: "generation", message: "正在生成中文副本…"))
        completionSummary = nil
        do {
            let result = try await bridge.run(
                arguments: commandPrefix + ["generate", "--output-dir", outputAppURL.deletingLastPathComponent().path, "--replace"],
                environment: safeEnvironment,
                onEvent: { [weak self] event in
                    Task { @MainActor in
                        self?.handle(event: event)
                    }
                }
            )
            latestLogURL = result.logURL
            await Task.yield()
            guard let completionSummary else {
                state = .failed(GeneratorError(message: "生成器未返回完成摘要。", details: result.stdout, logURL: result.logURL))
                return
            }
            state = .completed(completionSummary)
        } catch is CancellationError {
            state = .failed(GeneratorError(message: "生成已取消。", details: "子进程已终止。", logURL: latestLogURL))
        } catch {
            state = failureState(from: error)
        }
    }

    private func handle(event: GeneratorEvent) {
        switch event.event {
        case "stage_started", "stage_succeeded":
            state = .generating(Progress(stage: event.stage, message: event.message))
        case "completed":
            guard let value = event.value?.objectValue,
                  let appPath = value["appPath"]?.stringValue else { return }
            completionSummary = ResultSummary(
                appPath: appPath,
                translationVersion: value["translationVersion"]?.stringValue,
                sourceCommit: value["sourceCommit"]?.stringValue
            )
        default: break
        }
    }

    private func failureState(from error: Error) -> GeneratorState {
        switch error {
        case let NodeProcessBridgeError.nonZeroExit(result):
            latestLogURL = result.logURL
            return .failed(GeneratorError(
                message: "生成器以退出码 \(result.exitCode) 结束。",
                details: LogRedactor.redact("\(result.stdout)\n\(result.stderr)"),
                logURL: result.logURL
            ))
        case let NodeProcessBridgeError.launchFailed(message):
            return .failed(GeneratorError(message: "无法启动生成器运行时。", details: LogRedactor.redact(message), logURL: latestLogURL))
        default:
            return .failed(GeneratorError(message: "生成器发生未知错误。", details: LogRedactor.redact(error.localizedDescription), logURL: latestLogURL))
        }
    }

    private var safeEnvironment: [String: String] {
        let processEnvironment = ProcessInfo.processInfo.environment
        return ["PATH", "HOME", "LANG", "LC_ALL"].reduce(into: [:]) { result, key in
            if let value = processEnvironment[key] { result[key] = value }
        }
    }
}
