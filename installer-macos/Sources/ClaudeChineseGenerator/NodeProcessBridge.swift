import Foundation
import Darwin

struct ProcessResult: Equatable, Sendable {
    let exitCode: Int32
    let stdout: String
    let stderr: String
    let logURL: URL
}

enum NodeProcessBridgeError: Error, Equatable, Sendable {
    case nonZeroExit(ProcessResult)
    case launchFailed(String)
}

protocol GeneratorProcessRunning: AnyObject {
    func run(arguments: [String], environment: [String: String], onEvent: @escaping (GeneratorEvent) -> Void) async throws -> ProcessResult
    func cancel()
}

final class NodeProcessBridge: GeneratorProcessRunning, @unchecked Sendable {
    private let executableURL: URL
    private let logDirectory: URL
    private let processLock = NSLock()
    private var runningProcess: Process?

    init(executableURL: URL, logDirectory: URL = NodeProcessBridge.defaultLogDirectory) {
        self.executableURL = executableURL
        self.logDirectory = logDirectory
    }

    static var defaultLogDirectory: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/ClaudeChineseGenerator", isDirectory: true)
    }

    static var bundledNodeURL: URL {
        let architecture = ProcessInfo.processInfo.machineArchitecture
        let runtimeName: String
        switch architecture {
        case "arm64": runtimeName = "node-arm64"
        case "x86_64": runtimeName = "node-x64"
        default: return URL(fileURLWithPath: "/nonexistent/unsupported-node-runtime-\(architecture)")
        }
        return Bundle.main.url(forResource: runtimeName, withExtension: nil, subdirectory: "runtime")
            ?? URL(fileURLWithPath: "/nonexistent/missing-embedded-\(runtimeName)")
    }

    static var bundledCommandPrefix: [String] {
        guard let commandURL = Bundle.main.url(forResource: "claude-desktop-mac-zh-cn", withExtension: "mjs", subdirectory: "runtime/package/bin") else {
            return ["/nonexistent/missing-embedded-cli.mjs"]
        }
        return [commandURL.path]
    }

    func run(arguments: [String], environment: [String: String], onEvent: @escaping (GeneratorEvent) -> Void) async throws -> ProcessResult {
        try Task.checkCancellation()
        guard executableURL.path.contains("unsupported-node-runtime") == false else {
            throw NodeProcessBridgeError.launchFailed("不支持当前 Mac 架构：\(ProcessInfo.processInfo.machineArchitecture)。仅支持 Apple Silicon 和 Intel Mac。")
        }
        guard arguments.first?.contains("missing-embedded-cli") != true else {
            throw NodeProcessBridgeError.launchFailed("未找到内置 CLI：请重新下载 Claude 中文生成器。")
        }
        guard FileManager.default.isExecutableFile(atPath: executableURL.path) else {
            throw NodeProcessBridgeError.launchFailed("未找到内置 Node 运行时：\(executableURL.path)。请重新下载 Claude 中文生成器。")
        }
        let process = Process()
        process.executableURL = executableURL
        process.arguments = arguments.contains("--json-events") ? arguments : arguments + ["--json-events"]
        process.environment = sanitizedEnvironment(environment)

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe
        let exitWaiter = ProcessExitWaiter()
        process.terminationHandler = { _ in exitWaiter.finish() }
        let output = ProcessOutputCollector(onEvent: onEvent)
        stdoutPipe.fileHandleForReading.readabilityHandler = { handle in
            output.appendStdout(handle.availableData)
        }
        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            output.appendStderr(handle.availableData)
        }

        do {
            processLock.withLock { runningProcess = process }
            try process.run()
        } catch {
            clear(process)
            stdoutPipe.fileHandleForReading.readabilityHandler = nil
            stderrPipe.fileHandleForReading.readabilityHandler = nil
            throw NodeProcessBridgeError.launchFailed(error.localizedDescription)
        }

        await withTaskCancellationHandler(operation: {
            await exitWaiter.wait()
        }, onCancel: { [weak self] in
            self?.cancel()
        })
        stdoutPipe.fileHandleForReading.readabilityHandler = nil
        stderrPipe.fileHandleForReading.readabilityHandler = nil
        output.appendRemaining(stdoutPipe.fileHandleForReading.readDataToEndOfFile(), to: .stdout)
        output.appendRemaining(stderrPipe.fileHandleForReading.readDataToEndOfFile(), to: .stderr)
        output.finish()
        clear(process)

        if Task.isCancelled { throw CancellationError() }
        let result = try makeResult(exitCode: process.terminationStatus, output: output)
        if result.exitCode != 0 { throw NodeProcessBridgeError.nonZeroExit(result) }
        return result
    }

    func cancel() {
        processLock.lock()
        let process = runningProcess
        processLock.unlock()
        guard let process, process.isRunning else { return }
        process.terminate()
    }

    private func clear(_ process: Process) {
        processLock.lock()
        if runningProcess === process { runningProcess = nil }
        processLock.unlock()
    }

    private func makeResult(exitCode: Int32, output: ProcessOutputCollector) throws -> ProcessResult {
        let stdout = output.stdout
        let stderr = output.stderr
        let log = LogRedactor.redact("stdout:\n\(stdout)\n\nstderr:\n\(stderr)\n")
        try FileManager.default.createDirectory(at: logDirectory, withIntermediateDirectories: true)
        let logURL = logDirectory.appendingPathComponent("generator-\(ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-"))-\(UUID().uuidString).log")
        try log.write(to: logURL, atomically: true, encoding: .utf8)
        return ProcessResult(exitCode: exitCode, stdout: LogRedactor.redact(stdout), stderr: LogRedactor.redact(stderr), logURL: logURL)
    }

    private func sanitizedEnvironment(_ environment: [String: String]) -> [String: String] {
        var safe = environment.filter { key, _ in
            let name = key.lowercased()
            return !["token", "secret", "password", "credential", "cookie", "apikey", "api_key", "oauth"].contains { name.contains($0) }
        }
        // Keep HOME supplied by the parent process. The only generator-specific
        // variable selects the independent Chinese clone profile.
        safe["CLAUDE_DESKTOP_ZH_CN_USER_DATA_DIR"] = safe["CLAUDE_DESKTOP_ZH_CN_USER_DATA_DIR"]
            ?? FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/Application Support/Claude Desktop zh-CN")
                .path
        return safe
    }
}

private final class ProcessExitWaiter: @unchecked Sendable {
    private let lock = NSLock()
    private var finished = false
    private var continuation: CheckedContinuation<Void, Never>?

    func wait() async {
        await withCheckedContinuation { continuation in
            lock.withLock {
                if finished {
                    continuation.resume()
                } else {
                    self.continuation = continuation
                }
            }
        }
    }

    func finish() {
        lock.withLock {
            finished = true
            continuation?.resume()
            continuation = nil
        }
    }
}

private final class ProcessOutputCollector: @unchecked Sendable {
    enum Stream { case stdout, stderr }

    private let lock = NSLock()
    private let onEvent: (GeneratorEvent) -> Void
    private var stdoutBuffer = Data()
    private var stdoutLineBuffer = Data()
    private var stderrBuffer = Data()

    init(onEvent: @escaping (GeneratorEvent) -> Void) { self.onEvent = onEvent }

    var stdout: String { lock.withLock { String(decoding: stdoutBuffer, as: UTF8.self) } }
    var stderr: String { lock.withLock { String(decoding: stderrBuffer, as: UTF8.self) } }

    func appendStdout(_ data: Data) { append(data, to: .stdout) }
    func appendStderr(_ data: Data) { append(data, to: .stderr) }

    func appendRemaining(_ data: Data, to stream: Stream) {
        guard !data.isEmpty else { return }
        append(data, to: stream)
    }

    func finish() {
        lock.withLock {
            guard !stdoutLineBuffer.isEmpty else { return }
            decodeEvent(stdoutLineBuffer)
            stdoutLineBuffer.removeAll()
        }
    }

    private func append(_ data: Data, to stream: Stream) {
        guard !data.isEmpty else { return }
        lock.withLock {
            switch stream {
            case .stdout:
                stdoutBuffer.append(data)
                stdoutLineBuffer.append(data)
                while let newline = stdoutLineBuffer.firstIndex(of: 10) {
                    let line = stdoutLineBuffer.prefix(upTo: newline)
                    decodeEvent(Data(line))
                    stdoutLineBuffer.removeSubrange(...newline)
                }
            case .stderr: stderrBuffer.append(data)
            }
        }
    }

    private func decodeEvent(_ data: Data) {
        guard !data.isEmpty, let event = try? JSONDecoder().decode(GeneratorEvent.self, from: data) else { return }
        onEvent(event)
    }
}

private extension NSLock {
    func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock(); defer { unlock() }
        return try body()
    }
}

private extension ProcessInfo {
    /// `ProcessInfo` does not expose the machine type on the Command Line Tools
    /// SDK, so retain the intended ProcessInfo call site with a small Darwin
    /// backed compatibility property.
    var machineArchitecture: String {
        var system = utsname()
        uname(&system)
        return withUnsafePointer(to: &system.machine) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: 256) {
                String(cString: $0)
            }
        }
    }
}
